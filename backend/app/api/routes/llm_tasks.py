"""通用大模型任务接口，用于写作等非聊天类异步/同步任务记录。"""

import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes.chat import estimate_tokens, fallback_answer
from app.api.utils import new_id, now_text, write_audit
from app.core.config import get_settings
from app.db.session import get_db
from app.models import AuditRisk, LLMTask, User
from app.schemas import CodeChange, CodeEditRequest, CodeEditResponse, LLMTaskCreate, LLMTaskRead
from app.services.llm_client import LLMClientError, get_llm_client

router = APIRouter()

TASK_PROMPTS = {
    "writing": "你是企业知识工作写作助手。请输出结构清晰、可直接编辑的中文文稿。",
    "code": "你是资深软件工程助手。请输出可执行思路、关键代码和注意事项。",
    "office": "你是办公自动化助手。请整理任务、步骤、表格或邮件草稿。",
    "meeting": "你是会议纪要助手。请提炼议题、结论、待办和责任人。",
    "report": "你是运营报表分析助手。请基于输入生成摘要、指标解读和风险提示。",
}


CODE_EDIT_SYSTEM_PROMPT = """You are a code editing engine.
Return JSON only. Do not wrap the JSON in markdown.
The JSON shape must be:
{
  "answer": "short human-readable summary",
  "changes": [
    {
      "filePath": "path/to/file",
      "operation": "replace | insert_after | insert_before",
      "find": "exact anchor text copied from the original file",
      "replace": "replacement or inserted text",
      "description": "short change description"
    }
  ]
}
Rules:
- Only emit valid JSON.
- Allowed operations: "replace", "insert_after", "insert_before".
- Each find value must be an exact, unique substring from the provided file content.
- Prefer small precise replacements over returning the whole file.
- For adding a new function/method, prefer "insert_after" with find set to a stable nearby complete block or class header.
- For insert_after/insert_before, replace must contain only the new inserted text, including any needed leading or trailing newlines.
- If no code change is needed, return {"answer":"...","changes":[]}.
"""


def extract_json_object(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            return json.loads(cleaned[start : end + 1])
        raise


def parse_code_changes(raw_output: str, fallback_file_path: str) -> tuple[str, list[CodeChange]]:
    try:
        payload = extract_json_object(raw_output)
    except (json.JSONDecodeError, TypeError, ValueError):
        return raw_output.strip(), []

    answer = payload.get("answer")
    if not isinstance(answer, str):
        answer = "已生成代码变更。"
    changes: list[CodeChange] = []
    raw_changes = payload.get("changes")
    if isinstance(raw_changes, list):
        for item in raw_changes:
            if not isinstance(item, dict):
                continue
            find = item.get("find")
            replace = item.get("replace")
            if not isinstance(find, str) or not isinstance(replace, str) or not find:
                continue
            changes.append(
                CodeChange(
                    file_path=str(item.get("filePath") or item.get("file_path") or fallback_file_path),
                    operation=str(item.get("operation") or "replace"),
                    find=find,
                    replace=replace,
                    description=str(item.get("description") or ""),
                )
            )
    return answer, changes


@router.get("", response_model=list[LLMTaskRead])
def list_llm_tasks(task_type: str | None = None, db: Session = Depends(get_db)) -> list[LLMTask]:
    statement = select(LLMTask).order_by(LLMTask.created_at.desc())
    if task_type:
        statement = statement.where(LLMTask.task_type == task_type)
    return list(db.scalars(statement).all())


@router.post("/code-edit", response_model=CodeEditResponse, status_code=status.HTTP_201_CREATED)
def create_code_edit(payload: CodeEditRequest, db: Session = Depends(get_db)) -> CodeEditResponse:
    settings = get_settings()
    user_content = "\n".join(
        [
            f"Instruction: {payload.instruction}",
            f"File path: {payload.file_path}",
            f"Language: {payload.language}",
            "",
            "Selected text:",
            payload.selected_text or "(none)",
            "",
            "Full file content:",
            "```" + payload.language,
            payload.content,
            "```",
        ]
    )
    messages = [
        {"role": "system", "content": CODE_EDIT_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]
    risk = AuditRisk.NORMAL
    try:
        completion = get_llm_client().complete(
            messages,
            model=payload.model,
            temperature=payload.temperature,
            top_p=payload.top_p,
            max_tokens=payload.max_tokens,
        )
        raw_output = completion.content or completion.reasoning
        reasoning = completion.reasoning
        model_id = completion.model
        input_tokens = completion.input_tokens or estimate_tokens(user_content)
        output_tokens = completion.output_tokens or estimate_tokens(raw_output)
    except LLMClientError as exc:
        if not settings.llm_use_mock_fallback:
            raise HTTPException(status_code=502, detail=f"LLM gateway unavailable: {exc}") from exc
        raw_output = fallback_answer()
        reasoning = None
        model_id = settings.llm_model_id
        input_tokens = estimate_tokens(user_content)
        output_tokens = estimate_tokens(raw_output)
        risk = AuditRisk.WARNING

    answer, changes = parse_code_changes(raw_output, payload.file_path)
    task = LLMTask(
        id=new_id("task"),
        user_id=payload.user_id,
        task_type="code_edit",
        title=f"代码编辑: {payload.file_path}",
        input_text=user_content,
        output_text=raw_output,
        model=model_id,
        status="completed",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        created_at=now_text(),
    )
    db.add(task)
    task.reasoning = reasoning
    write_audit(db, db.get(User, payload.user_id), "AI 任务:code_edit", payload.file_path, risk, "代码编辑任务已调用模型并保存结果。")
    db.commit()
    db.refresh(task)
    return CodeEditResponse(
        id=task.id,
        answer=answer,
        reasoning=reasoning,
        changes=changes,
        raw_output=raw_output,
        model=model_id,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )


@router.post("", response_model=LLMTaskRead, status_code=status.HTTP_201_CREATED)
def create_llm_task(payload: LLMTaskCreate, db: Session = Depends(get_db)) -> LLMTask:
    settings = get_settings()
    prompt = TASK_PROMPTS.get(payload.task_type, "你是企业大模型平台助手。请根据用户输入完成任务。")
    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": payload.input_text},
    ]
    risk = AuditRisk.NORMAL
    try:
        completion = get_llm_client().complete(
            messages,
            model=payload.model,
            temperature=payload.temperature,
            top_p=payload.top_p,
            max_tokens=payload.max_tokens,
        )
        output = completion.content or completion.reasoning
        reasoning = completion.reasoning
        model_id = completion.model
        input_tokens = completion.input_tokens or estimate_tokens(payload.input_text)
        output_tokens = completion.output_tokens or estimate_tokens(output)
    except LLMClientError as exc:
        if not settings.llm_use_mock_fallback:
            raise HTTPException(status_code=502, detail=f"LLM gateway unavailable: {exc}") from exc
        output = fallback_answer()
        reasoning = None
        model_id = settings.llm_model_id
        input_tokens = estimate_tokens(payload.input_text)
        output_tokens = estimate_tokens(output)
        risk = AuditRisk.WARNING

    task = LLMTask(
        id=new_id("task"),
        user_id=payload.user_id,
        task_type=payload.task_type,
        title=payload.title,
        input_text=payload.input_text,
        output_text=output,
        model=model_id,
        status="completed",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        created_at=now_text(),
    )
    db.add(task)
    task.reasoning = reasoning
    write_audit(db, db.get(User, payload.user_id), f"AI 任务:{payload.task_type}", payload.title, risk, "通用 AI 任务已调用模型并保存结果。")
    db.commit()
    db.refresh(task)
    return task
