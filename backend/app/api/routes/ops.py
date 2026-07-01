from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.api.security import require_roles
from app.core.config import get_settings
from app.db.session import get_db
from app.models import Approval, ApprovalStatus, AuditLog, DocumentStatus, KnowledgeDocument, RoleName, User
from app.schemas import OpsStatusRead

router = APIRouter()


@router.get("/status", response_model=OpsStatusRead)
def ops_status(current_user: User = Depends(require_roles(RoleName.OPS)), db: Session = Depends(get_db)) -> OpsStatusRead:
    db.execute(text("SELECT 1"))
    settings = get_settings()
    upload_root = Path(settings.storage_dir)
    failed_documents = db.scalar(select(func.count()).select_from(KnowledgeDocument).where(KnowledgeDocument.index_status == "failed")) or 0
    recent_errors = [
        item.index_error
        for item in db.scalars(
            select(KnowledgeDocument).where(KnowledgeDocument.index_error.is_not(None)).order_by(KnowledgeDocument.submitted_at.desc()).limit(5)
        ).all()
        if item.index_error
    ]
    indexed_documents = db.scalar(select(func.count()).select_from(KnowledgeDocument).where(KnowledgeDocument.status == DocumentStatus.INDEXED)) or 0
    pending_approvals = db.scalar(select(func.count()).select_from(Approval).where(Approval.status == ApprovalStatus.PENDING)) or 0
    audit_count = db.scalar(select(func.count()).select_from(AuditLog)) or 0
    return OpsStatusRead(
        database="ok",
        llm_gateway=settings.llm_api_base_url,
        knowledge_index="ok" if failed_documents == 0 else "warning",
        upload_storage=f"{upload_root} ({'exists' if upload_root.exists() else 'missing'})",
        audit_count=audit_count,
        pending_approvals=pending_approvals,
        indexed_documents=indexed_documents,
        failed_documents=failed_documents,
        recent_errors=recent_errors,
    )
