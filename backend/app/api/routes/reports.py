from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.security import require_roles
from app.db.session import get_db
from app.models import Approval, ApprovalStatus, AuditLog, ChatMessage, ChatSession, KnowledgeBase, KnowledgeDocument, RoleName, User
from app.schemas import ReportSummaryRead

router = APIRouter()


@router.get("/summary", response_model=ReportSummaryRead)
def report_summary(
    current_user: User = Depends(require_roles(RoleName.KB_ADMIN, RoleName.OPS)),
    db: Session = Depends(get_db),
) -> ReportSummaryRead:
    model_failures = db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.detail.contains("网关"))) or 0
    return ReportSummaryRead(
        chat_sessions=db.scalar(select(func.count()).select_from(ChatSession)) or 0,
        chat_messages=db.scalar(select(func.count()).select_from(ChatMessage)) or 0,
        input_tokens=db.scalar(select(func.coalesce(func.sum(ChatMessage.input_tokens), 0))) or 0,
        output_tokens=db.scalar(select(func.coalesce(func.sum(ChatMessage.output_tokens), 0))) or 0,
        knowledge_bases=db.scalar(select(func.count()).select_from(KnowledgeBase)) or 0,
        documents=db.scalar(select(func.count()).select_from(KnowledgeDocument)) or 0,
        approvals_pending=db.scalar(select(func.count()).select_from(Approval).where(Approval.status == ApprovalStatus.PENDING)) or 0,
        approvals_approved=db.scalar(select(func.count()).select_from(Approval).where(Approval.status == ApprovalStatus.APPROVED)) or 0,
        approvals_rejected=db.scalar(select(func.count()).select_from(Approval).where(Approval.status == ApprovalStatus.REJECTED)) or 0,
        model_failures=model_failures,
    )
