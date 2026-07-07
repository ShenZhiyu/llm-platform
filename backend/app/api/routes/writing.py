import json
import re
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes.chat import estimate_tokens, fallback_answer
from app.api.utils import new_id, now_text, write_audit
from app.core.config import get_settings
from app.db.session import get_db
from app.models import (
    AuditRisk,
    User,
    WritingAIOperation,
    WritingDocument,
    WritingDocumentVersion,
    WritingTemplate,
    WritingTemplateVersion,
)
from app.schemas import (
    WritingDocumentCreate,
    WritingDocumentRead,
    WritingDocumentUpdate,
    WritingExportRequest,
    WritingGenerateRequest,
    WritingGenerateResponse,
    WritingTemplateRead,
    WritingTemplateUpdate,
)
from app.services.llm_client import LLMClientError, get_llm_client
from app.services.writing_service import (
    WritingServiceError,
    content_from_fields,
    default_format_config,
    extract_template_metadata,
    json_dumps,
    json_loads,
    normalize_content,
    render_blank_document,
    render_document,
    save_template_upload,
)

router = APIRouter()


def clean_writing_output(output: str) -> str:
    """Remove model thinking blocks before saving generated text."""
    return re.sub(r"<think>.*?</think>", "", output or "", flags=re.IGNORECASE | re.DOTALL).strip()


def split_generated_title(output: str, fallback_title: str) -> tuple[str, str]:
    """Allow the model to update title only when first line is `标题：xxx`."""
    text = clean_writing_output(output)
    lines = text.splitlines()
    if lines and re.match(r"^\s*(标题|Title)\s*[:：]", lines[0], flags=re.IGNORECASE):
        title = re.sub(r"^\s*(标题|Title)\s*[:：]\s*", "", lines[0], flags=re.IGNORECASE).strip() or fallback_title
        return title, clean_body_prefix("\n".join(lines[1:]).strip())
    return fallback_title, clean_body_prefix(text)


def clean_body_prefix(text: str) -> str:
    cleaned = text or ""
    cleaned = re.sub(r"^\s*<body\b[^>]*>\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*</body>\s*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"</?body\b[^>]*>", "", cleaned, flags=re.IGNORECASE)
    return re.sub(r"^\s*(正文|Body|内容)\s*[:：]\s*", "", cleaned, count=1, flags=re.IGNORECASE).strip()


def parse_proofread_results(output: str) -> list[dict]:
    text = clean_writing_output(output)
    match = re.search(r"\[[\s\S]*\]", text)
    if match:
        text = match.group(0)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    results = []
    for index, item in enumerate(parsed):
        if not isinstance(item, dict):
            continue
        issue_type = str(item.get("type") or item.get("category") or "表达问题").strip()
        original = str(item.get("original") or item.get("quote") or "").strip()
        suggestion = str(item.get("suggestion") or item.get("replacement") or item.get("advice") or "").strip()
        reason = str(item.get("reason") or item.get("description") or "").strip()
        if not original and not suggestion and not reason:
            continue
        results.append(
            {
                "id": str(item.get("id") or f"proof-{index + 1}"),
                "type": issue_type,
                "original": original,
                "suggestion": suggestion,
                "reason": reason,
            }
        )
    return results


def is_placeholder_body(value: str) -> bool:
    text = (value or "").strip()
    if not text:
        return False
    compact = re.sub(r"\s+", "", text)
    placeholder_chars = sum(compact.count(char) for char in ("×", "X", "x", "_", "＿", "…", "□", "■"))
    placeholder_ratio = placeholder_chars / max(len(compact), 1)
    placeholder_lines = [
        line
        for line in text.splitlines()
        if re.search(r"[×Xx_＿□■]{4,}|……|…．|\.{3,}", line)
    ]
    has_demo_date = bool(re.search(r"20(1[0-9]|2[0-5])年\d{1,2}月\d{1,2}日", text))
    return placeholder_ratio >= 0.25 or len(placeholder_lines) >= 3 or (has_demo_date and placeholder_ratio >= 0.1)


def merge_with_existing_body_if_needed(existing_body: str, generated_body: str, action: str) -> str:
    existing = (existing_body or "").strip()
    generated = (generated_body or "").strip()
    if not existing or not generated:
        return generated
    if is_placeholder_body(existing):
        return generated
    if action in {"摘要提炼"}:
        return generated
    existing_anchor = existing[: min(120, len(existing))]
    if existing_anchor and existing_anchor in generated:
        return generated
    if len(generated) < len(existing) * 0.8:
        return f"{existing}\n\n{generated}"
    return generated


def template_to_read(template: WritingTemplate) -> WritingTemplateRead:
    return WritingTemplateRead(
        id=template.id,
        name=template.name,
        category=template.category,
        description=template.description,
        status=template.status,
        owner_id=template.owner_id,
        current_version=template.current_version,
        original_file_name=template.original_file_name,
        file_size=template.file_size,
        content_hash=template.content_hash,
        fields=json_loads(template.fields_json, []),
        format_config=json_loads(template.format_config_json, {}),
        preview_text=template.preview_text,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


def document_to_read(document: WritingDocument, include_template: bool = True) -> WritingDocumentRead:
    return WritingDocumentRead(
        id=document.id,
        template_id=document.template_id,
        owner_id=document.owner_id,
        title=document.title,
        status=document.status,
        content=normalize_content(json_loads(document.content_json, {})),
        format_config=json_loads(document.format_config_json, {}),
        current_file_path=document.current_file_path,
        current_file_hash=document.current_file_hash,
        download_url=f"/api/v1/writing/documents/{document.id}/download" if document.current_file_path else None,
        created_at=document.created_at,
        updated_at=document.updated_at,
        template=template_to_read(document.template) if include_template and document.template else None,
    )


@router.get("/templates", response_model=list[WritingTemplateRead])
def list_templates(db: Session = Depends(get_db)) -> list[WritingTemplateRead]:
    templates = db.scalars(select(WritingTemplate).where(WritingTemplate.status != "deleted").order_by(WritingTemplate.updated_at.desc())).all()
    return [template_to_read(template) for template in templates]


@router.post("/templates/upload", response_model=WritingTemplateRead, status_code=status.HTTP_201_CREATED)
def upload_template(
    file: UploadFile = File(...),
    name: str = Form(""),
    category: str = Form("通用模板"),
    description: str = Form(""),
    user_id: str = Form("u-1001", alias="userId"),
    db: Session = Depends(get_db),
) -> WritingTemplateRead:
    try:
        stored = save_template_upload(file)
        fields, preview_text = extract_template_metadata(stored.file_path)
    except WritingServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    now = now_text()
    template = WritingTemplate(
        id=new_id("wtpl"),
        name=name.strip() or Path(stored.file_name).stem,
        category=category.strip() or "通用模板",
        description=description,
        owner_id=user_id,
        current_version=1,
        original_file_name=stored.file_name,
        original_file_path=stored.file_path,
        file_size=stored.file_size,
        content_hash=stored.content_hash,
        fields_json=json_dumps(fields),
        format_config_json=json_dumps(default_format_config()),
        preview_text=preview_text,
        created_at=now,
        updated_at=now,
    )
    db.add(template)
    db.add(
        WritingTemplateVersion(
            id=new_id("wtplv"),
            template_id=template.id,
            version=1,
            file_path=stored.file_path,
            file_hash=stored.content_hash,
            fields_json=template.fields_json,
            format_config_json=template.format_config_json,
            created_by=user_id,
            created_at=now,
        )
    )
    write_audit(db, db.get(User, user_id), "智能写作模板上传", template.name, AuditRisk.NORMAL, "Word 模板已保存并解析标题/正文标签。")
    db.commit()
    db.refresh(template)
    return template_to_read(template)


@router.patch("/templates/{template_id}", response_model=WritingTemplateRead)
def update_template(template_id: str, payload: WritingTemplateUpdate, db: Session = Depends(get_db)) -> WritingTemplateRead:
    template = db.get(WritingTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")
    if payload.name is not None:
        template.name = payload.name
    if payload.category is not None:
        template.category = payload.category
    if payload.description is not None:
        template.description = payload.description
    if payload.fields is not None:
        allowed_fields = [field for field in payload.fields if field.key in {"title", "body"}]
        template.fields_json = json_dumps([field.model_dump(by_alias=True) for field in allowed_fields])
    if payload.format_config is not None:
        template.format_config_json = json_dumps(payload.format_config)
    if payload.status is not None:
        template.status = payload.status
    template.updated_at = now_text()
    db.commit()
    db.refresh(template)
    return template_to_read(template)


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(template_id: str, db: Session = Depends(get_db)) -> None:
    template = db.get(WritingTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")
    template.status = "deleted"
    template.updated_at = now_text()
    write_audit(db, db.get(User, template.owner_id) if template.owner_id else None, "智能写作模板删除", template.name, AuditRisk.NORMAL, "模板已从列表中移除，历史草稿仍保留引用。")
    db.commit()


@router.get("/documents", response_model=list[WritingDocumentRead])
def list_documents(user_id: str | None = None, db: Session = Depends(get_db)) -> list[WritingDocumentRead]:
    statement = select(WritingDocument).order_by(WritingDocument.updated_at.desc())
    if user_id:
        statement = statement.where(WritingDocument.owner_id == user_id)
    documents = db.scalars(statement).all()
    return [document_to_read(document, include_template=True) for document in documents]


@router.post("/documents", response_model=WritingDocumentRead, status_code=status.HTTP_201_CREATED)
def create_document(payload: WritingDocumentCreate, db: Session = Depends(get_db)) -> WritingDocumentRead:
    template = db.get(WritingTemplate, payload.template_id) if payload.template_id else None
    if payload.template_id and template is None:
        raise HTTPException(status_code=404, detail="Template not found")
    fields = json_loads(template.fields_json, []) if template else []
    content = normalize_content(payload.content or content_from_fields(fields, payload.title), fields)
    if not content.get("title"):
        content["title"] = payload.title
    now = now_text()
    document = WritingDocument(
        id=new_id("wdoc"),
        template_id=template.id if template else None,
        owner_id=payload.user_id,
        title=payload.title or content.get("title") or "未命名文档",
        status="draft",
        content_json=json_dumps(content),
        format_config_json=json_dumps(payload.format_config or (json_loads(template.format_config_json, default_format_config()) if template else default_format_config())),
        created_at=now,
        updated_at=now,
    )
    db.add(document)
    detail = f"基于模板 {template.name} 创建草稿。" if template else "创建空白草稿。"
    write_audit(db, db.get(User, payload.user_id), "智能写作文档创建", document.title, AuditRisk.NORMAL, detail)
    db.commit()
    db.refresh(document)
    return document_to_read(document)


@router.patch("/documents/{document_id}", response_model=WritingDocumentRead)
def update_document(document_id: str, payload: WritingDocumentUpdate, db: Session = Depends(get_db)) -> WritingDocumentRead:
    document = db.get(WritingDocument, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if payload.title is not None:
        document.title = payload.title
    if payload.content is not None:
        fields = json_loads(document.template.fields_json, []) if document.template else []
        document.content_json = json_dumps(normalize_content(payload.content, fields))
    if payload.format_config is not None:
        document.format_config_json = json_dumps(payload.format_config)
    if payload.status is not None:
        document.status = payload.status
    document.updated_at = now_text()
    db.commit()
    db.refresh(document)
    return document_to_read(document)


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: str, db: Session = Depends(get_db)) -> None:
    document = db.get(WritingDocument, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    title = document.title
    owner_id = document.owner_id
    db.delete(document)
    write_audit(db, db.get(User, owner_id) if owner_id else None, "智能写作草稿删除", title, AuditRisk.NORMAL, "草稿及其生成版本/AI操作记录已删除。")
    db.commit()


@router.post("/documents/{document_id}/generate", response_model=WritingGenerateResponse)
def generate_document_content(document_id: str, payload: WritingGenerateRequest, db: Session = Depends(get_db)) -> WritingGenerateResponse:
    document = db.get(WritingDocument, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    template = document.template
    fields = json_loads(template.fields_json, []) if template else []
    raw_content = payload.content or json_loads(document.content_json, {})
    current_content = normalize_content(raw_content, fields)
    non_editable_template_text = str(raw_content.get("_nonEditableTemplateText") or "").strip() if isinstance(raw_content, dict) else ""
    body_is_placeholder = is_placeholder_body(current_content.get("body", ""))
    settings = get_settings()
    if payload.action == "校对检查":
        proofread_prompt = (
            f"当前日期：{now_text().split(' ')[0]}\n"
            "你是企业文档校对助手。请只检查正文问题，不要改写全文。\n"
            "文档中只有 <title> 和 <body> 标签内的内容允许修改；标签外内容是模板固定内容，严禁作为校对对象，严禁建议修改。\n"
            "请识别错别字、病句、口语化表达、不规范公文表述、术语不一致、格式或编号问题。\n"
            "必须只输出 JSON 数组，不要输出 Markdown，不要输出解释。数组元素格式：\n"
            "[{\"type\":\"错别字/口语化/不规范/术语不一致/格式问题\",\"original\":\"原文片段\",\"suggestion\":\"建议修改为\",\"reason\":\"原因\"}]\n"
            "如果没有问题，输出 []。\n"
            f"标签外不可修改模板内容，仅供理解文档上下文，不要检查或输出：\n{non_editable_template_text}\n"
            f"用户额外要求：{payload.instruction}\n"
            f"当前标题：{current_content.get('title', '')}\n"
            f"<body> 内可校对正文：\n{current_content.get('body', '')}\n"
        )
        risk = AuditRisk.NORMAL
        try:
            completion = get_llm_client().complete(
                [{"role": "system", "content": "你是严谨的中文公文和企业文档校对助手，只返回可解析 JSON。"}, {"role": "user", "content": proofread_prompt}],
                model=payload.model,
                temperature=0.1,
                top_p=payload.top_p,
                max_tokens=payload.max_tokens,
                enable_thinking=False,
            )
            output = clean_writing_output(completion.content or completion.reasoning)
            model_id = completion.model
            input_tokens = completion.input_tokens or estimate_tokens(proofread_prompt)
            output_tokens = completion.output_tokens or estimate_tokens(output)
        except LLMClientError as exc:
            if not settings.llm_use_mock_fallback:
                raise HTTPException(status_code=502, detail=f"LLM gateway unavailable: {exc}") from exc
            output = "[]"
            model_id = settings.llm_model_id
            input_tokens = estimate_tokens(proofread_prompt)
            output_tokens = estimate_tokens(output)
            risk = AuditRisk.WARNING

        proofread_results = parse_proofread_results(output)
        db.add(
            WritingAIOperation(
                id=new_id("wai"),
                document_id=document.id,
                operation_type=payload.action,
                instruction=payload.instruction,
                input_text=proofread_prompt,
                output_text=output,
                model=model_id,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                created_by=payload.user_id,
                created_at=now_text(),
            )
        )
        write_audit(db, db.get(User, payload.user_id), "智能写作:校对检查", document.title, risk, f"AI 返回 {len(proofread_results)} 条校对结果。")
        db.commit()
        db.refresh(document)
        return WritingGenerateResponse(document=document_to_read(document), output_text=output, proofread_results=proofread_results)

    body_policy_instruction = (
        "当前 <body> 内已有正文是完整正文的一部分。除非用户明确要求重写全文、替换全文或生成摘要，否则必须保留已有正文中未被要求修改的内容。\n"
        "如果用户要求根据已有章节补充/生成其他章节，必须返回“原有章节 + 新增章节”的完整 <body>，不能只返回新增章节。\n"
        if not body_is_placeholder
        else
        "当前 <body> 内已有内容主要是 ×××、……、示例日期等格式占位符，不是真实正文。请按该格式示例生成真实正文，并替换这些占位符，不要保留占位符。\n"
        "如果用户要求写通知、公文或章节内容，请直接生成完整真实正文；“××××××：”通常表示主送对象/称呼占位，应根据用户要求、通知主题和语境自行判断并替换成合适对象，不要机械套用固定称呼。\n"
    )
    prompt = (
        f"当前日期：{now_text().split(' ')[0]}\n"
        "你是企业智能写作助手。请根据用户要求生成或修改 Word 文档内容。\n"
        "模板只包含标题<title>和正文<body>两个可编辑区域，不再单独维护章节字段。\n"
        "文档中只有 <title> 和 <body> 标签内的内容允许修改。标签外内容是模板固定内容，只能作为上下文理解，严禁复制、改写、补写或输出到正文中。\n"
        "你的输出会被系统写回 <body> 标签内，因此输出内容必须只包含 <body> 内应该出现的正文，不得包含封面、项目名称、项目编号、日期、修改记录、页眉页脚、落款等标签外固定内容。\n"
        f"{body_policy_instruction}"
        "如果用户要求划分章节，请直接在正文中按照用户给出的章节名称、编号和顺序组织内容。\n"
        "必须直接输出修改后的完整正文内容，不要输出 <body> 或 </body> 标签，不要只输出新增片段，不要只说明修改建议。\n"
        "不要输出思考过程，不要输出解释，不要输出 Markdown 代码块，不要添加“正文：”前缀，不要添加任何 XML/HTML 标签。\n"
        "如果需要修改标题，第一行使用“标题：xxx”，随后输出正文；否则只输出正文。\n"
        f"模板名称：{template.name if template else '空白文稿'}\n"
        f"标签外不可修改模板内容，仅供上下文，不得输出：\n{non_editable_template_text}\n"
        f"操作：{payload.action}\n"
        f"用户写作要求：{payload.instruction}\n"
        f"<title> 内当前标题：{current_content.get('title', '')}\n"
        f"<body> 内当前正文：\n{current_content.get('body', '')}\n"
    )
    risk = AuditRisk.NORMAL
    try:
        completion = get_llm_client().complete(
            [{"role": "system", "content": "你是严谨的中文公文和企业文档写作助手。"}, {"role": "user", "content": prompt}],
            model=payload.model,
            temperature=payload.temperature,
            top_p=payload.top_p,
            max_tokens=payload.max_tokens,
            enable_thinking=False,
        )
        output = clean_writing_output(completion.content or completion.reasoning)
        model_id = completion.model
        input_tokens = completion.input_tokens or estimate_tokens(prompt)
        output_tokens = completion.output_tokens or estimate_tokens(output)
    except LLMClientError as exc:
        if not settings.llm_use_mock_fallback:
            raise HTTPException(status_code=502, detail=f"LLM gateway unavailable: {exc}") from exc
        output = clean_writing_output(fallback_answer())
        model_id = settings.llm_model_id
        input_tokens = estimate_tokens(prompt)
        output_tokens = estimate_tokens(output)
        risk = AuditRisk.WARNING

    title, body = split_generated_title(output, current_content.get("title") or document.title)
    body = merge_with_existing_body_if_needed(current_content.get("body", ""), body, payload.action)
    next_content = {"title": title, "body": body}
    document.title = title
    document.content_json = json_dumps(next_content)
    document.updated_at = now_text()
    db.add(
        WritingAIOperation(
            id=new_id("wai"),
            document_id=document.id,
            operation_type=payload.action,
            instruction=payload.instruction,
            input_text=prompt,
            output_text=output,
            model=model_id,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            created_by=payload.user_id,
            created_at=now_text(),
        )
    )
    write_audit(db, db.get(User, payload.user_id), f"智能写作:{payload.action}", document.title, risk, "AI 已生成并更新文档正文。")
    db.commit()
    db.refresh(document)
    return WritingGenerateResponse(document=document_to_read(document), output_text=output)


@router.post("/documents/{document_id}/export", response_model=WritingDocumentRead)
def export_document(document_id: str, payload: WritingExportRequest, db: Session = Depends(get_db)) -> WritingDocumentRead:
    document = db.get(WritingDocument, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    template = document.template
    if template:
        path, digest = render_document(
            template.original_file_path,
            json_loads(document.content_json, {}),
            document.title,
            json_loads(document.format_config_json, {}),
        )
    else:
        path, digest = render_blank_document(
            json_loads(document.content_json, {}),
            document.title,
            json_loads(document.format_config_json, {}),
        )
    version = len(document.versions) + 1
    document.current_file_path = path
    document.current_file_hash = digest
    document.status = "generated"
    document.updated_at = now_text()
    db.add(
        WritingDocumentVersion(
            id=new_id("wdocv"),
            document_id=document.id,
            version=version,
            title=document.title,
            content_json=document.content_json,
            format_config_json=document.format_config_json,
            docx_path=path,
            file_hash=digest,
            created_by=payload.user_id,
            created_at=now_text(),
        )
    )
    write_audit(db, db.get(User, payload.user_id), "智能写作导出 Word", document.title, AuditRisk.NORMAL, "已按模板生成 Word 文档。")
    db.commit()
    db.refresh(document)
    return document_to_read(document)


@router.get("/documents/{document_id}/download")
def download_document(document_id: str, db: Session = Depends(get_db)) -> FileResponse:
    document = db.get(WritingDocument, document_id)
    if document is None or not document.current_file_path:
        raise HTTPException(status_code=404, detail="Generated document not found")
    path = Path(document.current_file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Generated file missing")
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"{document.title}.docx",
    )
