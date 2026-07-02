import json
from time import perf_counter
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.security import get_current_user
from app.api.utils import new_id, now_text, parse_message, write_audit
from app.core.config import get_settings
from app.db.session import get_db
from app.models import AuditRisk, ChatMessage, ChatRole, ChatSession, DocumentStatus, KnowledgeBase, KnowledgeDocument, SecurityResult, User
from app.schemas import ChatMessageCreate, ChatMessageEdit, ChatMessageFeedback, ChatSessionCreate, ChatSessionRead, ChatSessionSettingsUpdate, KnowledgeSearchResult
from app.services.llm_client import LLMClientError, get_llm_client
from app.services.rag_service import RAGIndex, RAGServiceError, copy_upload_to_document, save_upload

router = APIRouter()


def sse_event(payload: dict[str, object]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def json_list(value: str | None) -> list[str]:
    try:
        parsed = json.loads(value or "[]")
    except json.JSONDecodeError:
        return []
    return [item for item in parsed if isinstance(item, str)] if isinstance(parsed, list) else []


def set_json_list(session: ChatSession, field_name: str, values: list[str]) -> None:
    unique_values = list(dict.fromkeys(values))
    setattr(session, field_name, json.dumps(unique_values, ensure_ascii=False))


def to_session_read(session: ChatSession) -> ChatSessionRead:
    return ChatSessionRead(
        id=session.id,
        user_id=session.user_id,
        title=session.title,
        model=session.model,
        updated_at=session.updated_at,
        archived_at=session.archived_at,
        temperature=session.temperature,
        top_p=session.top_p,
        max_tokens=session.max_tokens,
        recent_message_limit=session.recent_message_limit,
        show_thinking=session.show_thinking,
        enable_thinking=session.enable_thinking,
        selected_knowledge_base_ids=json_list(session.selected_knowledge_base_ids_json),
        attached_document_ids=json_list(session.attached_document_ids_json),
        messages=[parse_message(message) for message in session.messages],
    )


def fallback_answer() -> str:
    return "模型网关暂时不可用，已返回兜底回答。当前不会伪造知识库引用；请稍后重试或检查模型服务。"


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def split_thinking_tags(content: str, reasoning: str | None = None, keep_reasoning: bool = True) -> tuple[str, str | None]:
    start_tag = "<think>"
    end_tag = "</think>"
    lower_content = content.lower()
    start_index = lower_content.find(start_tag)
    if start_index < 0:
        return content, reasoning if keep_reasoning else None

    body_start = start_index + len(start_tag)
    end_index = lower_content.find(end_tag, body_start)
    if end_index < 0:
        thinking_part = content[body_start:]
        answer_part = content[:start_index]
    else:
        thinking_part = content[body_start:end_index]
        answer_part = content[:start_index] + content[end_index + len(end_tag):]

    if not keep_reasoning:
        return answer_part.strip(), None
    thinking_parts = [part.strip() for part in [reasoning, thinking_part] if part and part.strip()]
    return answer_part.strip(), "\n\n".join(thinking_parts) or None


def to_citation_dicts(results: list[KnowledgeSearchResult]) -> list[dict[str, object]]:
    return [
        {
            "id": result.chunk_id,
            "documentId": result.document_id,
            "knowledgeBaseId": result.knowledge_base_id,
            "title": result.title,
            "knowledgeBaseName": result.knowledge_base_name,
            "similarity": result.similarity,
            "excerpt": result.excerpt,
        }
        for result in results
    ]


def context_from_results(results: list[KnowledgeSearchResult]) -> str:
    return "\n\n".join(
        f"[{index}] {result.title} / {result.knowledge_base_name} / 相似度 {result.similarity}%\n{result.excerpt}"
        for index, result in enumerate(results, start=1)
    )


def build_user_content(user_content: str, image_data_urls: list[str]) -> str | list[dict[str, Any]]:
    if not image_data_urls:
        return user_content
    content: list[dict[str, Any]] = [{"type": "text", "text": user_content or "请分析图片。"}]
    content.extend({"type": "image_url", "image_url": {"url": image_data_url}} for image_data_url in image_data_urls)
    return content


def message_content_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(str(item.get("text") or ""))
            elif isinstance(item, dict) and item.get("type") == "image_url":
                parts.append("[image]")
        return "\n".join(parts)
    return str(content)


def build_llm_messages(
    session: ChatSession,
    user_content: str,
    context: str,
    enable_thinking: bool,
    recent_message_limit: int = 8,
    image_data_urls: list[str] | None = None,
    before_message_id: str | None = None,
) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    if recent_message_limit > 0:
        history = list(session.messages)
        if before_message_id:
            cutoff = next((index for index, message in enumerate(history) if message.id == before_message_id), len(history))
            history = history[:cutoff]
        for message in history[-recent_message_limit:]:
            if message.content:
                messages.append({"role": message.role.value, "content": message.content})
    if context.strip():
        messages.append({"role": "user", "content": f"知识库上下文：\n{context.strip()}"})
    if user_content.strip() or image_data_urls:
        messages.append({"role": "user", "content": build_user_content(user_content, image_data_urls or [])})
    return messages


def validate_knowledge_context(db: Session, payload: ChatMessageCreate) -> None:
    settings = get_settings()
    if payload.image_data_urls:
        if payload.model != settings.vl_llm_model_id:
            raise HTTPException(status_code=400, detail="Image input requires the vision-language model")
        if len(payload.image_data_urls) > 4:
            raise HTTPException(status_code=400, detail="At most 4 images are supported per message")
        invalid_images = [url for url in payload.image_data_urls if not url.startswith(("data:image/png;base64,", "data:image/jpeg;base64,", "data:image/jpg;base64,", "data:image/webp;base64,"))]
        if invalid_images:
            raise HTTPException(status_code=400, detail="Only PNG, JPG, JPEG, and WEBP data URLs are supported")

    if payload.knowledge_base_ids:
        existing_kb_ids = set(db.scalars(select(KnowledgeBase.id).where(KnowledgeBase.id.in_(payload.knowledge_base_ids))).all())
        missing_kb_ids = [kb_id for kb_id in payload.knowledge_base_ids if kb_id not in existing_kb_ids]
        if missing_kb_ids:
            raise HTTPException(status_code=404, detail=f"Knowledge base not found: {', '.join(missing_kb_ids)}")

    if payload.attached_document_ids:
        documents = list(db.scalars(select(KnowledgeDocument).where(KnowledgeDocument.id.in_(payload.attached_document_ids))).all())
        document_by_id = {document.id: document for document in documents}
        missing_document_ids = [document_id for document_id in payload.attached_document_ids if document_id not in document_by_id]
        if missing_document_ids:
            raise HTTPException(status_code=404, detail=f"Attached document not found: {', '.join(missing_document_ids)}")

        invalid_document_ids = [
            document.id
            for document in documents
            if document.status != DocumentStatus.INDEXED or document.index_status != "indexed" or document.chunk_count <= 0
        ]
        if invalid_document_ids:
            raise HTTPException(status_code=400, detail=f"Attached document is not indexed: {', '.join(invalid_document_ids)}")

        if payload.knowledge_base_ids:
            mismatched_document_ids = [
                document.id for document in documents if document.knowledge_base_id not in set(payload.knowledge_base_ids)
            ]
            if mismatched_document_ids:
                raise HTTPException(status_code=400, detail=f"Attached document is outside selected knowledge bases: {', '.join(mismatched_document_ids)}")


def validate_knowledge_lists(db: Session, knowledge_base_ids: list[str], document_ids: list[str]) -> None:
    payload = ChatMessageCreate(content="", knowledge_base_ids=knowledge_base_ids, attached_document_ids=document_ids)
    validate_knowledge_context(db, payload)


def apply_payload_to_session(session: ChatSession, payload: ChatMessageCreate, db: Session) -> None:
    session.model = payload.model or session.model
    session.temperature = payload.temperature
    session.top_p = payload.top_p
    session.max_tokens = payload.max_tokens
    session.recent_message_limit = payload.recent_message_limit
    session.show_thinking = payload.show_thinking
    session.enable_thinking = payload.enable_thinking
    set_json_list(session, "selected_knowledge_base_ids_json", payload.knowledge_base_ids)
    set_json_list(session, "attached_document_ids_json", payload.attached_document_ids)
    validate_knowledge_lists(db, payload.knowledge_base_ids, payload.attached_document_ids)


def session_knowledge_base_ids(session: ChatSession) -> list[str]:
    return json_list(session.selected_knowledge_base_ids_json)


def session_attached_document_ids(session: ChatSession) -> list[str]:
    return json_list(session.attached_document_ids_json)


def run_llm_for_message(
    db: Session,
    session: ChatSession,
    user_message: ChatMessage,
    before_message_id: str | None = None,
) -> tuple[str, str | None, str, int, int, int, int, float, list[dict[str, object]], str]:
    settings = get_settings()
    knowledge_base_ids = session_knowledge_base_ids(session)
    attached_document_ids = session_attached_document_ids(session)
    rag_results: list[KnowledgeSearchResult] = []
    if knowledge_base_ids or attached_document_ids:
        rag_results = RAGIndex().search(
            db,
            user_message.content,
            knowledge_base_ids=knowledge_base_ids or None,
            document_ids=attached_document_ids or None,
            top_k=settings.rag_top_k,
        )
    citations = to_citation_dicts(rag_results)
    context = context_from_results(rag_results)
    started_at = perf_counter()
    llm_messages = build_llm_messages(
        session,
        user_message.content,
        context,
        session.enable_thinking,
        session.recent_message_limit,
        json_list(user_message.images_json),
        before_message_id=before_message_id,
    )
    completion = get_llm_client().complete(
        llm_messages,
        model=session.model,
        temperature=session.temperature,
        top_p=session.top_p,
        max_tokens=session.max_tokens,
        enable_thinking=session.enable_thinking,
    )
    elapsed_ms = int((perf_counter() - started_at) * 1000)
    answer = completion.content
    reasoning = completion.reasoning
    answer, reasoning = split_thinking_tags(answer, reasoning, keep_reasoning=True)
    tokens_per_second = round(completion.output_tokens / (elapsed_ms / 1000), 2) if elapsed_ms > 0 and completion.output_tokens > 0 else 0
    return (
        answer,
        reasoning,
        completion.model,
        elapsed_ms,
        elapsed_ms,
        completion.input_tokens,
        completion.output_tokens,
        tokens_per_second,
        citations,
        f"真实检索命中 {len(citations)} 条知识库依据。",
    )


def apply_assistant_result(
    assistant_message: ChatMessage,
    result: tuple[str, str | None, str, int, int, int, int, float, list[dict[str, object]], str],
) -> str:
    answer, reasoning, model_id, elapsed_ms, first_token_latency_ms, input_tokens, output_tokens, tokens_per_second, citations, audit_detail = result
    assistant_message.model = model_id
    assistant_message.content = answer
    assistant_message.reasoning = reasoning
    assistant_message.response_time_ms = elapsed_ms
    assistant_message.first_token_latency_ms = first_token_latency_ms
    assistant_message.input_tokens = input_tokens
    assistant_message.output_tokens = output_tokens
    assistant_message.tokens_per_second = tokens_per_second
    assistant_message.citations_json = json.dumps(citations, ensure_ascii=False)
    return audit_detail


@router.get("/sessions", response_model=list[ChatSessionRead])
def list_sessions(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[ChatSessionRead]:
    sessions = db.scalars(
        select(ChatSession)
        .options(selectinload(ChatSession.messages))
        .where(ChatSession.user_id == current_user.id)
        .where(ChatSession.archived_at.is_(None))
        .order_by(ChatSession.updated_at.desc())
    ).all()
    return [to_session_read(session) for session in sessions]


@router.get("/sessions/archived", response_model=list[ChatSessionRead])
def list_archived_sessions(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[ChatSessionRead]:
    sessions = db.scalars(
        select(ChatSession)
        .options(selectinload(ChatSession.messages))
        .where(ChatSession.user_id == current_user.id)
        .where(ChatSession.archived_at.is_not(None))
        .order_by(ChatSession.archived_at.desc())
    ).all()
    return [to_session_read(session) for session in sessions]


@router.delete("/sessions/archived", status_code=status.HTTP_204_NO_CONTENT)
def hard_delete_all_archived_sessions(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    sessions = db.scalars(select(ChatSession).where(ChatSession.user_id == current_user.id).where(ChatSession.archived_at.is_not(None))).all()
    count = len(sessions)
    for session in sessions:
        db.delete(session)
    user = current_user
    write_audit(db, user, "归档会话批量硬删除", "归档会话", AuditRisk.DANGER, f"永久删除 {count} 个归档会话。")
    db.commit()


@router.post("/sessions", response_model=ChatSessionRead, status_code=status.HTTP_201_CREATED)
def create_session(payload: ChatSessionCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> ChatSessionRead:
    settings = get_settings()
    session_model = payload.model or settings.llm_model_id
    session = ChatSession(id=new_id("chat"), user_id=current_user.id, title=payload.title, model=session_model, updated_at=now_text())
    db.add(session)
    db.commit()
    db.refresh(session)
    return to_session_read(session)


@router.patch("/sessions/{session_id}/settings", response_model=ChatSessionRead)
def update_session_settings(
    session_id: str,
    payload: ChatSessionSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChatSessionRead:
    session = db.scalar(select(ChatSession).options(selectinload(ChatSession.messages)).where(ChatSession.id == session_id).where(ChatSession.user_id == current_user.id))
    if session is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    if payload.model is not None:
        session.model = payload.model
    if payload.temperature is not None:
        session.temperature = payload.temperature
    if payload.top_p is not None:
        session.top_p = payload.top_p
    if payload.max_tokens is not None:
        session.max_tokens = payload.max_tokens
    if payload.recent_message_limit is not None:
        session.recent_message_limit = payload.recent_message_limit
    if payload.show_thinking is not None:
        session.show_thinking = payload.show_thinking
    if payload.enable_thinking is not None:
        session.enable_thinking = payload.enable_thinking
    if payload.selected_knowledge_base_ids is not None:
        validate_knowledge_lists(db, payload.selected_knowledge_base_ids, session_attached_document_ids(session))
        set_json_list(session, "selected_knowledge_base_ids_json", payload.selected_knowledge_base_ids)
    if payload.attached_document_ids is not None:
        validate_knowledge_lists(db, session_knowledge_base_ids(session), payload.attached_document_ids)
        set_json_list(session, "attached_document_ids_json", payload.attached_document_ids)
    session.updated_at = now_text()
    write_audit(db, current_user, "更新会话设置", session.title, AuditRisk.NORMAL, "会话模型参数、知识库或附件关联已更新。")
    db.commit()
    db.refresh(session)
    return to_session_read(session)


@router.delete("/sessions/{session_id}/attachments/{document_id}", response_model=ChatSessionRead)
def remove_session_attachment(
    session_id: str,
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChatSessionRead:
    session = db.scalar(select(ChatSession).options(selectinload(ChatSession.messages)).where(ChatSession.id == session_id).where(ChatSession.user_id == current_user.id))
    if session is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    attachment_ids = [item for item in session_attached_document_ids(session) if item != document_id]
    set_json_list(session, "attached_document_ids_json", attachment_ids)
    session.updated_at = now_text()
    write_audit(db, current_user, "移除会话附件关联", document_id, AuditRisk.NORMAL, "仅移除当前会话关联，不删除原始文档。")
    db.commit()
    db.refresh(session)
    return to_session_read(session)


@router.post("/sessions/{session_id}/attachments")
def upload_session_attachment(
    session_id: str,
    file: UploadFile = File(...),
    knowledge_base_id: str = Form(..., alias="knowledgeBaseId"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.scalar(select(ChatSession).where(ChatSession.id == session_id).where(ChatSession.user_id == current_user.id))
    if session is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    if db.get(KnowledgeBase, knowledge_base_id) is None:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    try:
        upload = save_upload(file, knowledge_base_id)
    except RAGServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    user = current_user
    document = KnowledgeDocument(
        id=new_id("doc"),
        knowledge_base_id=knowledge_base_id,
        title=upload.file_name.rsplit(".", 1)[0],
        file_name=upload.file_name,
        status=DocumentStatus.INDEXED,
        security_result=SecurityResult.PASSED,
        applicant=user.name if user else "会话用户",
        submitted_at=now_text(),
        summary=f"会话 {session.title} 上传的临时参考文档。",
        index_status="not_indexed",
    )
    copy_upload_to_document(upload, document)
    db.add(document)
    db.flush()
    try:
        RAGIndex().index_document(db, document)
    except RAGServiceError as exc:
        document.index_status = "failed"
        document.index_error = str(exc)
        db.commit()
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    attachment_ids = session_attached_document_ids(session)
    if document.id not in attachment_ids:
        attachment_ids.append(document.id)
        set_json_list(session, "attached_document_ids_json", attachment_ids)
    write_audit(db, user, "会话附件上传", upload.file_name, AuditRisk.NORMAL, "附件已解析并加入真实检索索引。")
    db.commit()
    return {"documentId": document.id, "title": document.title, "indexStatus": document.index_status}


@router.delete("/sessions/{session_id}", response_model=ChatSessionRead)
def archive_session(session_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> ChatSessionRead:
    session = db.scalar(select(ChatSession).options(selectinload(ChatSession.messages)).where(ChatSession.id == session_id).where(ChatSession.user_id == current_user.id))
    if session is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    if session.archived_at is None:
        session.archived_at = now_text()
        session.updated_at = session.archived_at
    user = current_user
    write_audit(db, user, "会话归档", session.title, AuditRisk.WARNING, "智能问答会话已移入归档。")
    db.commit()
    db.refresh(session)
    return to_session_read(session)


@router.post("/sessions/{session_id}/restore", response_model=ChatSessionRead)
def restore_session(session_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> ChatSessionRead:
    session = db.scalar(select(ChatSession).options(selectinload(ChatSession.messages)).where(ChatSession.id == session_id).where(ChatSession.user_id == current_user.id))
    if session is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    session.archived_at = None
    session.updated_at = now_text()
    user = current_user
    write_audit(db, user, "会话恢复", session.title, AuditRisk.NORMAL, "智能问答会话已从归档恢复。")
    db.commit()
    db.refresh(session)
    return to_session_read(session)


@router.delete("/sessions/{session_id}/hard-delete", status_code=status.HTTP_204_NO_CONTENT)
def hard_delete_session(session_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    session = db.scalar(select(ChatSession).where(ChatSession.id == session_id).where(ChatSession.user_id == current_user.id))
    if session is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    if session.archived_at is None:
        raise HTTPException(status_code=400, detail="Only archived sessions can be hard deleted")
    title = session.title
    db.delete(session)
    user = current_user
    write_audit(db, user, "会话硬删除", title, AuditRisk.DANGER, "归档会话及其消息已被永久删除。")
    db.commit()


@router.post("/sessions/{session_id}/messages", response_model=ChatSessionRead)
def send_message(session_id: str, payload: ChatMessageCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> ChatSessionRead:
    settings = get_settings()
    session = db.scalar(select(ChatSession).options(selectinload(ChatSession.messages)).where(ChatSession.id == session_id).where(ChatSession.user_id == current_user.id))
    if session is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    if session.archived_at is not None:
        raise HTTPException(status_code=400, detail="Archived chat session cannot receive new messages")
    validate_knowledge_context(db, payload)
    apply_payload_to_session(session, payload, db)

    user_message = ChatMessage(
        id=new_id("msg"),
        session_id=session.id,
        role=ChatRole.USER,
        content=payload.content,
        input_tokens=estimate_tokens(payload.content),
        created_at=now_text(),
        images_json=json.dumps(payload.image_data_urls, ensure_ascii=False),
    )
    try:
        result = run_llm_for_message(db, session, user_message)
    except (LLMClientError, RAGServiceError) as exc:
        write_audit(db, current_user, "智能问答失败", f"会话 {session.title}", AuditRisk.WARNING, str(exc))
        db.commit()
        raise HTTPException(status_code=502, detail={"message": "LLM or RAG service unavailable", "reason": str(exc)}) from exc

    assistant_message = ChatMessage(
        id=new_id("msg"),
        session_id=session.id,
        role=ChatRole.ASSISTANT,
        model=session.model,
        content="",
        created_at=now_text(),
    )
    audit_detail = apply_assistant_result(assistant_message, result)
    session.updated_at = now_text()
    session.messages.append(user_message)
    if len(session.messages) == 1:
        session.title = payload.content[:24] or "新的对话"
    session.messages.append(assistant_message)
    write_audit(db, current_user, "智能问答", f"会话 {session.title}", AuditRisk.NORMAL, audit_detail)
    db.commit()
    db.expire_all()
    refreshed = db.scalar(select(ChatSession).options(selectinload(ChatSession.messages)).where(ChatSession.id == session.id).where(ChatSession.user_id == current_user.id))
    if refreshed is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return to_session_read(refreshed)

    rag_results: list[KnowledgeSearchResult] = []
    rag_error: str | None = None
    if payload.knowledge_base_ids or payload.attached_document_ids:
        try:
            rag_results = RAGIndex().search(
                db,
                payload.content,
                knowledge_base_ids=payload.knowledge_base_ids or None,
                document_ids=payload.attached_document_ids or None,
                top_k=settings.rag_top_k,
            )
        except RAGServiceError as exc:
            rag_error = str(exc)

    citations = to_citation_dicts(rag_results)
    context = context_from_results(rag_results)
    audit_detail = f"使用 {settings.llm_model_id} 生成回答，真实检索命中 {len(citations)} 条知识库依据。"
    if not payload.knowledge_base_ids and not payload.attached_document_ids:
        audit_detail += " 本轮未引用知识库。"
    if rag_error:
        audit_detail += f" 检索不可用：{rag_error}"

    user_message = ChatMessage(
        id=new_id("msg"),
        session_id=session.id,
        role=ChatRole.USER,
        content=payload.content,
        input_tokens=estimate_tokens(payload.content),
        created_at=now_text(),
        images_json=json.dumps(payload.image_data_urls, ensure_ascii=False),
    )
    started_at = perf_counter()
    try:
        llm_messages = build_llm_messages(session, payload.content, context, payload.enable_thinking, payload.recent_message_limit, payload.image_data_urls)
        completion = get_llm_client().complete(
            llm_messages,
            model=payload.model,
            temperature=payload.temperature,
            top_p=payload.top_p,
            max_tokens=payload.max_tokens,
        )
        elapsed_ms = int((perf_counter() - started_at) * 1000)
        answer = completion.content
        model_id = completion.model
        reasoning = completion.reasoning
        answer, reasoning = split_thinking_tags(answer, reasoning, keep_reasoning=True)
        input_tokens = completion.input_tokens
        output_tokens = completion.output_tokens
        risk = AuditRisk.NORMAL
    except LLMClientError as exc:
        elapsed_ms = int((perf_counter() - started_at) * 1000)
        if not settings.llm_use_mock_fallback:
            raise HTTPException(status_code=502, detail={"message": "LLM gateway unavailable", "reason": str(exc)}) from exc
        answer = fallback_answer()
        model_id = payload.model or settings.llm_model_id
        reasoning = None
        input_tokens = 0
        output_tokens = 0
        risk = AuditRisk.WARNING
        audit_detail = f"模型网关调用失败，已启用回答兜底且不伪造引用。原因：{exc}"

    assistant_message = ChatMessage(
        id=new_id("msg"),
        session_id=session.id,
        role=ChatRole.ASSISTANT,
        model=model_id,
        content=answer,
        reasoning=reasoning,
        response_time_ms=elapsed_ms,
        first_token_latency_ms=elapsed_ms,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        tokens_per_second=round(output_tokens / (elapsed_ms / 1000), 2) if elapsed_ms > 0 and output_tokens > 0 else 0,
        created_at=now_text(),
        citations_json=json.dumps(citations, ensure_ascii=False),
    )
    session.model = model_id
    session.updated_at = now_text()
    session.messages.append(user_message)
    if len(session.messages) == 1:
        session.title = payload.content[:24]
    session.messages.append(assistant_message)

    user = db.get(User, payload.user_id)
    write_audit(db, user, "智能问答", f"会话 {session.title}", risk, audit_detail)
    db.commit()
    db.expire_all()

    refreshed = db.scalar(select(ChatSession).options(selectinload(ChatSession.messages)).where(ChatSession.id == session.id))
    if refreshed is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return to_session_read(refreshed)


def get_owned_message(db: Session, message_id: str, current_user: User) -> tuple[ChatSession, ChatMessage]:
    message = db.get(ChatMessage, message_id)
    if message is None:
        raise HTTPException(status_code=404, detail="Chat message not found")
    session = db.scalar(select(ChatSession).options(selectinload(ChatSession.messages)).where(ChatSession.id == message.session_id).where(ChatSession.user_id == current_user.id))
    if session is None:
        raise HTTPException(status_code=404, detail="Chat message not found")
    owned_message = next((item for item in session.messages if item.id == message_id), None)
    if owned_message is None:
        raise HTTPException(status_code=404, detail="Chat message not found")
    return session, owned_message


def next_assistant_message(session: ChatSession, user_message: ChatMessage) -> ChatMessage | None:
    messages = list(session.messages)
    try:
        start_index = next(index for index, message in enumerate(messages) if message.id == user_message.id)
    except StopIteration:
        return None
    for message in messages[start_index + 1:]:
        if message.role == ChatRole.ASSISTANT:
            return message
        if message.role == ChatRole.USER:
            return None
    return None


@router.post("/messages/{assistant_message_id}/regenerate", response_model=ChatSessionRead)
def regenerate_message(assistant_message_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> ChatSessionRead:
    session, assistant_message = get_owned_message(db, assistant_message_id, current_user)
    if assistant_message.role != ChatRole.ASSISTANT:
        raise HTTPException(status_code=400, detail="Only assistant messages can be regenerated")
    messages = list(session.messages)
    assistant_index = next(index for index, message in enumerate(messages) if message.id == assistant_message.id)
    user_message = next((message for message in reversed(messages[:assistant_index]) if message.role == ChatRole.USER), None)
    if user_message is None:
        raise HTTPException(status_code=400, detail="No preceding user message found")
    try:
        audit_detail = apply_assistant_result(assistant_message, run_llm_for_message(db, session, user_message, before_message_id=user_message.id))
    except (LLMClientError, RAGServiceError) as exc:
        write_audit(db, current_user, "重新生成回答失败", session.title, AuditRisk.WARNING, str(exc))
        db.commit()
        raise HTTPException(status_code=502, detail={"message": "LLM or RAG service unavailable", "reason": str(exc)}) from exc
    assistant_message.regenerated_at = now_text()
    session.updated_at = now_text()
    write_audit(db, current_user, "重新生成回答", session.title, AuditRisk.NORMAL, audit_detail)
    db.commit()
    db.refresh(session)
    return to_session_read(session)


@router.post("/messages/{assistant_message_id}/regenerate/stream")
def stream_regenerate_message(assistant_message_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> StreamingResponse:
    def generate():
        settings = get_settings()
        try:
            session, assistant_message = get_owned_message(db, assistant_message_id, current_user)
        except HTTPException as exc:
            yield sse_event({"type": "error", "message": str(exc.detail)})
            return
        if assistant_message.role != ChatRole.ASSISTANT:
            yield sse_event({"type": "error", "message": "Only assistant messages can be regenerated"})
            return
        messages = list(session.messages)
        assistant_index = next(index for index, message in enumerate(messages) if message.id == assistant_message.id)
        user_message = next((message for message in reversed(messages[:assistant_index]) if message.role == ChatRole.USER), None)
        if user_message is None:
            yield sse_event({"type": "error", "message": "No preceding user message found"})
            return

        rag_results: list[KnowledgeSearchResult] = []
        rag_error: str | None = None
        knowledge_base_ids = session_knowledge_base_ids(session)
        attached_document_ids = session_attached_document_ids(session)
        if knowledge_base_ids or attached_document_ids:
            try:
                rag_results = RAGIndex().search(
                    db,
                    user_message.content,
                    knowledge_base_ids=knowledge_base_ids or None,
                    document_ids=attached_document_ids or None,
                    top_k=settings.rag_top_k,
                )
            except RAGServiceError as exc:
                rag_error = str(exc)

        citations = to_citation_dicts(rag_results)
        context = context_from_results(rag_results)
        audit_detail = f"流式重新生成回答，真实检索命中 {len(citations)} 条知识库依据。"
        if not knowledge_base_ids and not attached_document_ids:
            audit_detail += " 本轮未引用知识库。"
        if rag_error:
            audit_detail += f" 检索不可用：{rag_error}"

        yield sse_event({"type": "start", "assistantMessage": parse_message(assistant_message).model_dump(by_alias=True)})

        started_at = perf_counter()
        first_token_latency_ms = 0
        answer_parts: list[str] = []
        reasoning_parts: list[str] = []
        input_tokens = 0
        output_tokens = 0
        model_id = session.model
        try:
            llm_messages = build_llm_messages(session, user_message.content, context, session.enable_thinking, session.recent_message_limit, json_list(user_message.images_json))
            for chunk in get_llm_client().stream_complete(
                llm_messages,
                model=session.model,
                temperature=session.temperature,
                top_p=session.top_p,
                max_tokens=session.max_tokens,
                enable_thinking=session.enable_thinking,
            ):
                if chunk.model:
                    model_id = chunk.model
                if chunk.input_tokens:
                    input_tokens = chunk.input_tokens
                if chunk.output_tokens:
                    output_tokens = chunk.output_tokens
                if chunk.content:
                    if first_token_latency_ms == 0:
                        first_token_latency_ms = int((perf_counter() - started_at) * 1000)
                    answer_parts.append(chunk.content)
                    yield sse_event({"type": "content", "messageId": assistant_message.id, "delta": chunk.content})
                if chunk.reasoning:
                    reasoning_parts.append(chunk.reasoning)
                    if session.show_thinking:
                        yield sse_event({"type": "reasoning", "messageId": assistant_message.id, "delta": chunk.reasoning})
        except LLMClientError as exc:
            write_audit(db, current_user, "重新生成回答失败", session.title, AuditRisk.WARNING, str(exc))
            db.commit()
            yield sse_event({"type": "error", "message": "LLM gateway unavailable", "reason": str(exc)})
            return

        elapsed_ms = int((perf_counter() - started_at) * 1000)
        answer = "".join(answer_parts).strip()
        reasoning = "".join(reasoning_parts).strip()
        answer, parsed_reasoning = split_thinking_tags(answer, reasoning or None, keep_reasoning=True)
        reasoning = parsed_reasoning or ""
        if not answer and reasoning:
            answer = "已生成思考过程，请展开查看。"
        if not answer:
            yield sse_event({"type": "error", "message": "LLM gateway returned an empty response"})
            return

        assistant_message.model = model_id
        assistant_message.content = answer
        assistant_message.reasoning = reasoning or None
        assistant_message.response_time_ms = elapsed_ms
        assistant_message.first_token_latency_ms = first_token_latency_ms or elapsed_ms
        assistant_message.input_tokens = input_tokens
        assistant_message.output_tokens = output_tokens
        assistant_message.tokens_per_second = round(output_tokens / (elapsed_ms / 1000), 2) if elapsed_ms > 0 and output_tokens > 0 else 0
        assistant_message.citations_json = json.dumps(citations, ensure_ascii=False)
        assistant_message.regenerated_at = now_text()
        session.model = model_id
        session.updated_at = now_text()
        write_audit(db, current_user, "重新生成回答", session.title, AuditRisk.NORMAL, audit_detail)
        db.commit()
        db.expire_all()

        refreshed = db.scalar(select(ChatSession).options(selectinload(ChatSession.messages)).where(ChatSession.id == session.id).where(ChatSession.user_id == current_user.id))
        if refreshed is None:
            yield sse_event({"type": "error", "message": "Chat session not found"})
            return
        yield sse_event({"type": "done", "session": to_session_read(refreshed).model_dump(by_alias=True)})

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.patch("/messages/{user_message_id}", response_model=ChatSessionRead)
def edit_user_message(
    user_message_id: str,
    payload: ChatMessageEdit,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChatSessionRead:
    session, user_message = get_owned_message(db, user_message_id, current_user)
    if user_message.role != ChatRole.USER:
        raise HTTPException(status_code=400, detail="Only user messages can be edited")
    user_message.content = payload.content
    user_message.images_json = json.dumps(payload.image_data_urls, ensure_ascii=False)
    user_message.edited_at = now_text()
    assistant_message = next_assistant_message(session, user_message)
    audit_detail = "用户消息已更新。"
    if assistant_message is not None:
        try:
            audit_detail = apply_assistant_result(assistant_message, run_llm_for_message(db, session, user_message, before_message_id=user_message.id))
            assistant_message.regenerated_at = now_text()
        except (LLMClientError, RAGServiceError) as exc:
            write_audit(db, current_user, "编辑消息重算失败", session.title, AuditRisk.WARNING, str(exc))
            db.commit()
            raise HTTPException(status_code=502, detail={"message": "LLM or RAG service unavailable", "reason": str(exc)}) from exc
    session.updated_at = now_text()
    write_audit(db, current_user, "编辑用户消息", session.title, AuditRisk.NORMAL, audit_detail)
    db.commit()
    db.refresh(session)
    return to_session_read(session)


@router.post("/messages/{user_message_id}/edit/stream")
def stream_edit_user_message(
    user_message_id: str,
    payload: ChatMessageEdit,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    def generate():
        settings = get_settings()
        try:
            session, user_message = get_owned_message(db, user_message_id, current_user)
        except HTTPException as exc:
            yield sse_event({"type": "error", "message": str(exc.detail)})
            return
        if user_message.role != ChatRole.USER:
            yield sse_event({"type": "error", "message": "Only user messages can be edited"})
            return

        user_message.content = payload.content
        user_message.images_json = json.dumps(payload.image_data_urls, ensure_ascii=False)
        user_message.edited_at = now_text()
        assistant_message = next_assistant_message(session, user_message)
        if assistant_message is None:
            session.updated_at = now_text()
            write_audit(db, current_user, "编辑用户消息", session.title, AuditRisk.NORMAL, "用户消息已更新，未找到需要重算的回答。")
            db.commit()
            db.refresh(session)
            yield sse_event({"type": "done", "session": to_session_read(session).model_dump(by_alias=True)})
            return

        rag_results: list[KnowledgeSearchResult] = []
        rag_error: str | None = None
        knowledge_base_ids = session_knowledge_base_ids(session)
        attached_document_ids = session_attached_document_ids(session)
        if knowledge_base_ids or attached_document_ids:
            try:
                rag_results = RAGIndex().search(
                    db,
                    user_message.content,
                    knowledge_base_ids=knowledge_base_ids or None,
                    document_ids=attached_document_ids or None,
                    top_k=settings.rag_top_k,
                )
            except RAGServiceError as exc:
                rag_error = str(exc)

        citations = to_citation_dicts(rag_results)
        context = context_from_results(rag_results)
        audit_detail = f"编辑用户消息后流式重算回答，真实检索命中 {len(citations)} 条知识库依据。"
        if not knowledge_base_ids and not attached_document_ids:
            audit_detail += " 本轮未引用知识库。"
        if rag_error:
            audit_detail += f" 检索不可用：{rag_error}"

        yield sse_event(
            {
                "type": "start",
                "userMessage": parse_message(user_message).model_dump(by_alias=True),
                "assistantMessage": parse_message(assistant_message).model_dump(by_alias=True),
            }
        )

        started_at = perf_counter()
        first_token_latency_ms = 0
        answer_parts: list[str] = []
        reasoning_parts: list[str] = []
        input_tokens = 0
        output_tokens = 0
        model_id = session.model
        try:
            llm_messages = build_llm_messages(session, user_message.content, context, session.enable_thinking, session.recent_message_limit, json_list(user_message.images_json))
            for chunk in get_llm_client().stream_complete(
                llm_messages,
                model=session.model,
                temperature=session.temperature,
                top_p=session.top_p,
                max_tokens=session.max_tokens,
                enable_thinking=session.enable_thinking,
            ):
                if chunk.model:
                    model_id = chunk.model
                if chunk.input_tokens:
                    input_tokens = chunk.input_tokens
                if chunk.output_tokens:
                    output_tokens = chunk.output_tokens
                if chunk.content:
                    if first_token_latency_ms == 0:
                        first_token_latency_ms = int((perf_counter() - started_at) * 1000)
                    answer_parts.append(chunk.content)
                    yield sse_event({"type": "content", "messageId": assistant_message.id, "delta": chunk.content})
                if chunk.reasoning:
                    reasoning_parts.append(chunk.reasoning)
                    if session.show_thinking:
                        yield sse_event({"type": "reasoning", "messageId": assistant_message.id, "delta": chunk.reasoning})
        except LLMClientError as exc:
            write_audit(db, current_user, "编辑消息重算失败", session.title, AuditRisk.WARNING, str(exc))
            db.commit()
            yield sse_event({"type": "error", "message": "LLM gateway unavailable", "reason": str(exc)})
            return

        elapsed_ms = int((perf_counter() - started_at) * 1000)
        answer = "".join(answer_parts).strip()
        reasoning = "".join(reasoning_parts).strip()
        answer, parsed_reasoning = split_thinking_tags(answer, reasoning or None, keep_reasoning=True)
        reasoning = parsed_reasoning or ""
        if not answer and reasoning:
            answer = "已生成思考过程，请展开查看。"
        if not answer:
            yield sse_event({"type": "error", "message": "LLM gateway returned an empty response"})
            return

        assistant_message.model = model_id
        assistant_message.content = answer
        assistant_message.reasoning = reasoning or None
        assistant_message.response_time_ms = elapsed_ms
        assistant_message.first_token_latency_ms = first_token_latency_ms or elapsed_ms
        assistant_message.input_tokens = input_tokens
        assistant_message.output_tokens = output_tokens
        assistant_message.tokens_per_second = round(output_tokens / (elapsed_ms / 1000), 2) if elapsed_ms > 0 and output_tokens > 0 else 0
        assistant_message.citations_json = json.dumps(citations, ensure_ascii=False)
        assistant_message.regenerated_at = now_text()
        session.model = model_id
        session.updated_at = now_text()
        write_audit(db, current_user, "编辑用户消息", session.title, AuditRisk.NORMAL, audit_detail)
        db.commit()
        db.expire_all()

        refreshed = db.scalar(select(ChatSession).options(selectinload(ChatSession.messages)).where(ChatSession.id == session.id).where(ChatSession.user_id == current_user.id))
        if refreshed is None:
            yield sse_event({"type": "error", "message": "Chat session not found"})
            return
        yield sse_event({"type": "done", "session": to_session_read(refreshed).model_dump(by_alias=True)})

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/messages/{assistant_message_id}/feedback", response_model=ChatSessionRead)
def feedback_message(
    assistant_message_id: str,
    payload: ChatMessageFeedback,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChatSessionRead:
    session, assistant_message = get_owned_message(db, assistant_message_id, current_user)
    if assistant_message.role != ChatRole.ASSISTANT:
        raise HTTPException(status_code=400, detail="Only assistant messages can receive feedback")
    assistant_message.feedback = None if payload.feedback == "clear" else payload.feedback
    assistant_message.feedback_reason = payload.reason
    assistant_message.feedback_updated_at = now_text()
    write_audit(db, current_user, "回答反馈", session.title, AuditRisk.NORMAL, payload.feedback)
    db.commit()
    db.refresh(session)
    return to_session_read(session)


@router.post("/sessions/{session_id}/context-usage")
def context_usage(session_id: str, payload: ChatMessageCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, object]:
    settings = get_settings()
    session = db.scalar(select(ChatSession).options(selectinload(ChatSession.messages)).where(ChatSession.id == session_id).where(ChatSession.user_id == current_user.id))
    if session is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    validate_knowledge_context(db, payload)

    rag_results: list[KnowledgeSearchResult] = []
    if payload.content.strip() and (payload.knowledge_base_ids or payload.attached_document_ids):
        rag_results = RAGIndex().search(
            db,
            payload.content,
            knowledge_base_ids=payload.knowledge_base_ids or None,
            document_ids=payload.attached_document_ids or None,
            top_k=settings.rag_top_k,
        )
    context = context_from_results(rag_results)
    messages = build_llm_messages(session, payload.content, context, payload.enable_thinking, payload.recent_message_limit, payload.image_data_urls)
    try:
        token_count = get_llm_client().tokenize(messages, model=payload.model)
    except LLMClientError as exc:
        raise HTTPException(status_code=502, detail={"message": "LLM tokenize unavailable", "reason": str(exc)}) from exc
    percent = round((token_count.count / token_count.max_model_len) * 100, 2) if token_count.max_model_len > 0 else 0
    return {
        "usedTokens": token_count.count,
        "maxTokens": token_count.max_model_len,
        "percent": percent,
        "model": token_count.model,
        "messageCount": len(messages),
        "source": "llm_tokenize_api",
    }


@router.post("/sessions/{session_id}/messages/stream")
def stream_message(session_id: str, payload: ChatMessageCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> StreamingResponse:
    def generate():
        settings = get_settings()
        session = db.scalar(select(ChatSession).options(selectinload(ChatSession.messages)).where(ChatSession.id == session_id).where(ChatSession.user_id == current_user.id))
        if session is None:
            yield sse_event({"type": "error", "message": "Chat session not found"})
            return
        if session.archived_at is not None:
            yield sse_event({"type": "error", "message": "Archived chat session cannot receive new messages"})
            return
        try:
            validate_knowledge_context(db, payload)
            apply_payload_to_session(session, payload, db)
        except HTTPException as exc:
            yield sse_event({"type": "error", "message": str(exc.detail)})
            return

        rag_results: list[KnowledgeSearchResult] = []
        rag_error: str | None = None
        knowledge_base_ids = session_knowledge_base_ids(session)
        attached_document_ids = session_attached_document_ids(session)
        if knowledge_base_ids or attached_document_ids:
            try:
                rag_results = RAGIndex().search(
                    db,
                    payload.content,
                    knowledge_base_ids=knowledge_base_ids or None,
                    document_ids=attached_document_ids or None,
                    top_k=settings.rag_top_k,
                )
            except RAGServiceError as exc:
                rag_error = str(exc)

        citations = to_citation_dicts(rag_results)
        context = context_from_results(rag_results)
        audit_detail = f"使用 {settings.llm_model_id} 流式生成回答，真实检索命中 {len(citations)} 条知识库依据。"
        if not knowledge_base_ids and not attached_document_ids:
            audit_detail += " 本轮未引用知识库。"
        if rag_error:
            audit_detail += f" 检索不可用：{rag_error}"

        user_message = ChatMessage(
            id=new_id("msg"),
            session_id=session.id,
            role=ChatRole.USER,
            content=payload.content,
            input_tokens=estimate_tokens(payload.content),
            created_at=now_text(),
            images_json=json.dumps(payload.image_data_urls, ensure_ascii=False),
        )
        assistant_message = ChatMessage(
            id=new_id("msg"),
            session_id=session.id,
            role=ChatRole.ASSISTANT,
            model=session.model,
            content="",
            reasoning=None,
            created_at=now_text(),
            citations_json=json.dumps(citations, ensure_ascii=False),
        )
        yield sse_event(
            {
                "type": "start",
                "userMessage": parse_message(user_message).model_dump(by_alias=True),
                "assistantMessage": parse_message(assistant_message).model_dump(by_alias=True),
            }
        )

        started_at = perf_counter()
        first_token_latency_ms = 0
        answer_parts: list[str] = []
        reasoning_parts: list[str] = []
        input_tokens = 0
        output_tokens = 0
        model_id = session.model
        risk = AuditRisk.NORMAL
        try:
            llm_messages = build_llm_messages(session, payload.content, context, session.enable_thinking, session.recent_message_limit, payload.image_data_urls)
            for chunk in get_llm_client().stream_complete(
                llm_messages,
                model=session.model,
                temperature=session.temperature,
                top_p=session.top_p,
                max_tokens=session.max_tokens,
                enable_thinking=session.enable_thinking,
            ):
                if chunk.model:
                    model_id = chunk.model
                if chunk.input_tokens:
                    input_tokens = chunk.input_tokens
                if chunk.output_tokens:
                    output_tokens = chunk.output_tokens
                if chunk.content:
                    if first_token_latency_ms == 0:
                        first_token_latency_ms = int((perf_counter() - started_at) * 1000)
                    answer_parts.append(chunk.content)
                    yield sse_event({"type": "content", "messageId": assistant_message.id, "delta": chunk.content})
                if chunk.reasoning:
                    reasoning_parts.append(chunk.reasoning)
                    if session.show_thinking:
                        yield sse_event({"type": "reasoning", "messageId": assistant_message.id, "delta": chunk.reasoning})
        except LLMClientError as exc:
            write_audit(db, current_user, "智能问答失败", f"会话 {session.title}", AuditRisk.WARNING, str(exc))
            db.commit()
            yield sse_event({"type": "error", "message": "LLM gateway unavailable", "reason": str(exc)})
            return
            if not settings.llm_use_mock_fallback:
                yield sse_event({"type": "error", "message": "LLM gateway unavailable", "reason": str(exc)})
                return
            risk = AuditRisk.WARNING
            fallback = fallback_answer()
            answer_parts = [fallback]
            reasoning_parts = []
            input_tokens = 0
            output_tokens = 0
            audit_detail = f"模型网关流式调用失败，已启用回答兜底且不伪造引用。原因：{exc}"
            yield sse_event({"type": "content", "messageId": assistant_message.id, "delta": fallback})

        elapsed_ms = int((perf_counter() - started_at) * 1000)
        answer = "".join(answer_parts).strip()
        reasoning = "".join(reasoning_parts).strip()
        answer, parsed_reasoning = split_thinking_tags(answer, reasoning or None, keep_reasoning=True)
        reasoning = parsed_reasoning or ""
        if not answer and reasoning:
            answer = "已生成思考过程，请展开查看。"
        if not answer:
            yield sse_event({"type": "error", "message": "LLM gateway returned an empty response"})
            return

        assistant_message.model = model_id
        assistant_message.content = answer
        assistant_message.reasoning = reasoning or None
        assistant_message.response_time_ms = elapsed_ms
        assistant_message.first_token_latency_ms = first_token_latency_ms or elapsed_ms
        assistant_message.input_tokens = input_tokens
        assistant_message.output_tokens = output_tokens
        assistant_message.tokens_per_second = round(output_tokens / (elapsed_ms / 1000), 2) if elapsed_ms > 0 and output_tokens > 0 else 0
        session.model = model_id
        session.updated_at = now_text()
        session.messages.append(user_message)
        if len(session.messages) == 1:
            session.title = payload.content[:24]
        session.messages.append(assistant_message)

        user = current_user
        write_audit(db, user, "智能问答", f"会话 {session.title}", risk, audit_detail)
        db.commit()
        db.expire_all()

        refreshed = db.scalar(select(ChatSession).options(selectinload(ChatSession.messages)).where(ChatSession.id == session.id))
        if refreshed is None:
            yield sse_event({"type": "error", "message": "Chat session not found"})
            return
        yield sse_event({"type": "done", "session": to_session_read(refreshed).model_dump(by_alias=True)})

    return StreamingResponse(generate(), media_type="text/event-stream")
