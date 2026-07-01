from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.security import get_current_user, require_roles
from app.api.utils import new_id, now_text
from app.db.session import get_db
from app.models import Approval, ApprovalStatus, ApprovalType, KnowledgeBase, KnowledgeBaseAccessGrant, KnowledgeDocument, KnowledgeRole, KnowledgeStatus, RiskLevel, RoleName, User
from app.schemas import KnowledgeBaseAccessGrantRead, KnowledgeBaseAccessRequestCreate, KnowledgeBaseCreate, KnowledgeBaseRead, KnowledgeSearchRequest, KnowledgeSearchResult
from app.services.rag_service import RAGIndex, RAGServiceError

router = APIRouter()


@router.get("", response_model=list[KnowledgeBaseRead])
def list_knowledge_bases(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[KnowledgeBase]:
    return list(db.scalars(select(KnowledgeBase).order_by(KnowledgeBase.id)).all())


@router.post("", response_model=KnowledgeBaseRead, status_code=201)
def create_knowledge_base(
    payload: KnowledgeBaseCreate,
    current_user: User = Depends(require_roles(RoleName.KB_ADMIN)),
    db: Session = Depends(get_db),
) -> KnowledgeBase:
    knowledge_base = KnowledgeBase(
        id=new_id("kb"),
        name=payload.name,
        department=payload.department,
        level=payload.level,
        file_count=0,
        status=KnowledgeStatus.NOT_INDEXED,
        updated_at=now_text(),
        role=KnowledgeRole.ADMIN,
        type=payload.type,
    )
    db.add(knowledge_base)
    db.commit()
    db.refresh(knowledge_base)
    return knowledge_base


@router.get("/{knowledge_base_id}", response_model=KnowledgeBaseRead)
def get_knowledge_base(knowledge_base_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> KnowledgeBase:
    knowledge_base = db.get(KnowledgeBase, knowledge_base_id)
    if knowledge_base is None:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return knowledge_base


@router.post("/{knowledge_base_id}/search", response_model=list[KnowledgeSearchResult])
def search_knowledge_base(
    knowledge_base_id: str,
    payload: KnowledgeSearchRequest,
    current_user: User = Depends(require_roles(RoleName.RESEARCHER, RoleName.KB_ADMIN, RoleName.AUTH_ADMIN)),
    db: Session = Depends(get_db),
) -> list[KnowledgeSearchResult]:
    if db.get(KnowledgeBase, knowledge_base_id) is None:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    if payload.document_ids:
        documents = list(db.scalars(select(KnowledgeDocument).where(KnowledgeDocument.id.in_(payload.document_ids))).all())
        document_by_id = {document.id: document for document in documents}
        missing_document_ids = [document_id for document_id in payload.document_ids if document_id not in document_by_id]
        if missing_document_ids:
            raise HTTPException(status_code=404, detail=f"Document not found: {', '.join(missing_document_ids)}")
        outside_kb_document_ids = [document.id for document in documents if document.knowledge_base_id != knowledge_base_id]
        if outside_kb_document_ids:
            raise HTTPException(status_code=400, detail=f"Document is outside selected knowledge base: {', '.join(outside_kb_document_ids)}")
    try:
        return RAGIndex().search(
            db,
            payload.query,
            knowledge_base_ids=[knowledge_base_id],
            document_ids=payload.document_ids,
            top_k=payload.top_k,
        )
    except RAGServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/{knowledge_base_id}/access-grants", response_model=list[KnowledgeBaseAccessGrantRead])
def list_access_grants(
    knowledge_base_id: str,
    current_user: User = Depends(require_roles(RoleName.AUTH_ADMIN)),
    db: Session = Depends(get_db),
) -> list[KnowledgeBaseAccessGrant]:
    if db.get(KnowledgeBase, knowledge_base_id) is None:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return list(db.scalars(select(KnowledgeBaseAccessGrant).where(KnowledgeBaseAccessGrant.knowledge_base_id == knowledge_base_id).order_by(KnowledgeBaseAccessGrant.created_at.desc())).all())


@router.post("/{knowledge_base_id}/access-requests", response_model=KnowledgeBaseAccessGrantRead, status_code=201)
def create_access_request(
    knowledge_base_id: str,
    payload: KnowledgeBaseAccessRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> KnowledgeBaseAccessGrant:
    knowledge_base = db.get(KnowledgeBase, knowledge_base_id)
    if knowledge_base is None:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    approval = Approval(
        id=new_id("ap"),
        type=ApprovalType.KB_AUTH,
        applicant=payload.user_id,
        target=f"{knowledge_base.name}: {payload.reason or '申请访问知识库'}",
        status=ApprovalStatus.PENDING,
        risk=RiskLevel.NONE,
        created_at=now_text(),
    )
    grant = KnowledgeBaseAccessGrant(
        id=new_id("grant"),
        knowledge_base_id=knowledge_base_id,
        user_id=payload.user_id,
        approval_id=approval.id,
        status="pending",
        created_at=now_text(),
        expires_at=payload.expires_at,
    )
    db.add(approval)
    db.add(grant)
    db.commit()
    db.refresh(grant)
    return grant
