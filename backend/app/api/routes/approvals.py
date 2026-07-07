"""审批流接口，用于知识库访问、文档入库等人工审核场景。"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.security import get_current_user, user_has_role
from app.api.utils import new_id, now_text, write_audit
from app.db.session import get_db
from app.models import Approval, ApprovalStatus, ApprovalType, AuditRisk, DocumentStatus, KnowledgeBaseAccessGrant, KnowledgeDocument, Notification, RoleName, User
from app.schemas import ApprovalDecision, ApprovalRead
from app.services.rag_service import RAGIndex, RAGServiceError

router = APIRouter()


@router.get("", response_model=list[ApprovalRead])
def list_approvals(
    scope: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Approval]:
    statement = select(Approval)
    if scope == "my":
        statement = statement.where(Approval.applicant.in_([current_user.id, current_user.name]))
    elif user_has_role(current_user, RoleName.KB_ADMIN):
        statement = statement.where(Approval.type == ApprovalType.DOCUMENT_INDEX)
    elif user_has_role(current_user, RoleName.AUTH_ADMIN):
        statement = statement.where(Approval.type.in_([ApprovalType.KB_AUTH, ApprovalType.MODEL_ACCESS, ApprovalType.API_ACCESS]))
    else:
        statement = statement.where(Approval.id == "__none__")
    return list(db.scalars(statement.order_by(Approval.created_at.desc())).all())


@router.post("/{approval_id}/decision", response_model=ApprovalRead)
def decide_approval(
    approval_id: str,
    payload: ApprovalDecision,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Approval:
    approval = db.get(Approval, approval_id)
    if approval is None:
        raise HTTPException(status_code=404, detail="Approval not found")
    if approval.type == ApprovalType.DOCUMENT_INDEX and not user_has_role(current_user, RoleName.KB_ADMIN):
        raise HTTPException(status_code=403, detail="Only knowledge base administrators can review document indexing")
    if approval.type in [ApprovalType.KB_AUTH, ApprovalType.MODEL_ACCESS, ApprovalType.API_ACCESS] and not user_has_role(current_user, RoleName.AUTH_ADMIN):
        raise HTTPException(status_code=403, detail="Only authorization administrators can review access approvals")

    approval.status = ApprovalStatus.APPROVED if payload.approved else ApprovalStatus.REJECTED
    if approval.related_document_id:
        document = db.get(KnowledgeDocument, approval.related_document_id)
        if document:
            document.status = DocumentStatus.INDEXED if payload.approved else DocumentStatus.REJECTED
            if payload.approved and document.storage_path:
                try:
                    RAGIndex().index_document(db, document)
                except RAGServiceError as exc:
                    document.index_status = "failed"
                    document.index_error = str(exc)

    grants = list(db.scalars(select(KnowledgeBaseAccessGrant).where(KnowledgeBaseAccessGrant.approval_id == approval.id)).all())
    for grant in grants:
        grant.status = "active" if payload.approved else "rejected"
        db.add(
            Notification(
                id=new_id("msg"),
                user_id=grant.user_id,
                title="知识库授权审批结果",
                content=f"{approval.target} 已{'通过' if payload.approved else '驳回'}。",
                category="approval",
                created_at=now_text(),
            )
        )

    write_audit(
        db,
        current_user,
        "审批通过" if payload.approved else "审批驳回",
        approval.target,
        AuditRisk.NORMAL if payload.approved else AuditRisk.WARNING,
        f"{current_user.name}处理了{approval.type.value}申请。",
    )
    db.commit()
    db.refresh(approval)
    return approval
