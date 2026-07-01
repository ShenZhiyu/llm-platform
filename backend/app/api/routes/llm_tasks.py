from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes.chat import estimate_tokens, fallback_answer
from app.api.utils import new_id, now_text, write_audit
from app.core.config import get_settings
from app.db.session import get_db
from app.models import AuditRisk, LLMTask, User
from app.schemas import LLMTaskCreate, LLMTaskRead
from app.services.llm_client import LLMClientError, get_llm_client

router = APIRouter()

TASK_PROMPTS = {
    "writing": "你是企业知识工作写作助手。请输出结构清晰、可直接编辑的中文文稿。",
    "code": "你是资深软件工程助手。请输出可执行思路、关键代码和注意事项。",
    "office": "你是办公自动化助手。请整理任务、步骤、表格或邮件草稿。",
    "meeting": "你是会议纪要助手。请提炼议题、结论、待办和责任人。",
    "report": "你是运营报表分析助手。请基于输入生成摘要、指标解读和风险提示。",
}


@router.get("", response_model=list[LLMTaskRead])
def list_llm_tasks(task_type: str | None = None, db: Session = Depends(get_db)) -> list[LLMTask]:
    statement = select(LLMTask).order_by(LLMTask.created_at.desc())
    if task_type:
        statement = statement.where(LLMTask.task_type == task_type)
    return list(db.scalars(statement).all())


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
        model_id = completion.model
        input_tokens = completion.input_tokens or estimate_tokens(payload.input_text)
        output_tokens = completion.output_tokens or estimate_tokens(output)
    except LLMClientError as exc:
        if not settings.llm_use_mock_fallback:
            raise HTTPException(status_code=502, detail=f"LLM gateway unavailable: {exc}") from exc
        output = fallback_answer()
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
    write_audit(db, db.get(User, payload.user_id), f"AI 任务:{payload.task_type}", payload.title, risk, "通用 AI 任务已调用模型并保存结果。")
    db.commit()
    db.refresh(task)
    return task
