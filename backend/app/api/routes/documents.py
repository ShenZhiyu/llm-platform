"""知识库文档上传、入库审核和检索状态接口。"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.security import require_roles, user_has_role
from app.api.utils import new_id, now_text, write_audit
from app.db.session import get_db
from app.models import (
    Approval,
    ApprovalStatus,
    ApprovalType,
    AuditRisk,
    DocumentStatus,
    KnowledgeBase,
    KnowledgeDocument,
    KnowledgeDocumentChunk,
    RiskLevel,
    SecurityResult,
    RoleName,
    User,
)
from app.schemas import DocumentCreate, KnowledgeDocumentChunkRead, KnowledgeDocumentRead
from app.services.rag_service import RAGIndex, RAGServiceError, copy_upload_to_document, save_upload

router = APIRouter()


@router.get("", response_model=list[KnowledgeDocumentRead])
def list_documents(
    current_user: User = Depends(require_roles(RoleName.RESEARCHER, RoleName.KB_ADMIN, RoleName.AUTH_ADMIN)),
    db: Session = Depends(get_db),
) -> list[KnowledgeDocument]:
    return list(
        db.scalars(
            select(KnowledgeDocument)
            .where(KnowledgeDocument.knowledge_base_id != "__session_attachment__")
            .order_by(KnowledgeDocument.submitted_at.desc())
        ).all()
    )


@router.post("", response_model=KnowledgeDocumentRead, status_code=status.HTTP_201_CREATED)
def create_document(
    payload: DocumentCreate,
    current_user: User = Depends(require_roles(RoleName.RESEARCHER, RoleName.KB_ADMIN)),
    db: Session = Depends(get_db),
) -> KnowledgeDocument:
    kb = db.get(KnowledgeBase, payload.knowledge_base_id)
    if kb is None:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    user = db.scalar(select(User).where(User.name == payload.applicant)) or db.get(User, "u-1001")
    document = KnowledgeDocument(
        id=new_id("doc"),
        knowledge_base_id=payload.knowledge_base_id,
        title=payload.file_name.rsplit(".", 1)[0],
        file_name=payload.file_name,
        status=DocumentStatus.BLOCKED if payload.blocked else DocumentStatus.PENDING_REVIEW,
        security_result=SecurityResult.SUSPICIOUS if payload.blocked else SecurityResult.PASSED,
        applicant=payload.applicant,
        submitted_at=now_text(),
        summary=payload.summary or ("命中疑似涉密内容，上传已阻断。" if payload.blocked else "文档已通过基础安全检测，等待知识库管理员复核。"),
    )
    db.add(document)

    if not payload.blocked:
        db.add(
            Approval(
                id=new_id("ap"),
                type=ApprovalType.DOCUMENT_INDEX,
                applicant=payload.applicant,
                target=payload.file_name,
                status=ApprovalStatus.PENDING,
                risk=RiskLevel.MEDIUM,
                created_at=now_text(),
                related_document_id=document.id,
            )
        )

    write_audit(
        db,
        user,
        "安全拦截" if payload.blocked else "文件上传",
        payload.file_name,
        AuditRisk.DANGER if payload.blocked else AuditRisk.WARNING,
        "检测到疑似涉密内容，上传已阻断。" if payload.blocked else "文件通过初筛，已进入入库审批。",
    )
    db.commit()
    db.refresh(document)
    return document


@router.post("/upload", response_model=KnowledgeDocumentRead, status_code=status.HTTP_201_CREATED)
def upload_document(
    file: UploadFile = File(...),
    knowledge_base_id: str = Form("kb-acoustic", alias="knowledgeBaseId"),
    applicant: str = Form("张工"),
    index_now: bool = Form(False, alias="indexNow"),
    current_user: User = Depends(require_roles(RoleName.RESEARCHER, RoleName.KB_ADMIN)),
    db: Session = Depends(get_db),
) -> KnowledgeDocument:
    if index_now and not user_has_role(current_user, RoleName.KB_ADMIN):
        raise HTTPException(status_code=403, detail="Only knowledge base administrators can index documents immediately")
    kb = db.get(KnowledgeBase, knowledge_base_id)
    if kb is None:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    try:
        upload = save_upload(file, knowledge_base_id)
    except RAGServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    user = db.scalar(select(User).where(User.name == applicant)) or db.get(User, "u-1001")
    document = KnowledgeDocument(
        id=new_id("doc"),
        knowledge_base_id=knowledge_base_id,
        title=upload.file_name.rsplit(".", 1)[0],
        file_name=upload.file_name,
        status=DocumentStatus.INDEXED if index_now else DocumentStatus.PENDING_REVIEW,
        security_result=SecurityResult.PASSED,
        applicant=applicant,
        submitted_at=now_text(),
        summary="真实文件已上传，等待索引。" if not index_now else "真实文件已上传并进入索引流程。",
        index_status="not_indexed",
    )
    copy_upload_to_document(upload, document)
    db.add(document)

    if not index_now:
        db.add(
            Approval(
                id=new_id("ap"),
                type=ApprovalType.DOCUMENT_INDEX,
                applicant=applicant,
                target=upload.file_name,
                status=ApprovalStatus.PENDING,
                risk=RiskLevel.MEDIUM,
                created_at=now_text(),
                related_document_id=document.id,
            )
        )

    write_audit(db, user, "真实文件上传", upload.file_name, AuditRisk.WARNING, "文件已保存到本地存储，等待索引或审批。")
    db.flush()

    if index_now:
        try:
            RAGIndex().index_document(db, document)
        except RAGServiceError as exc:
            document.index_status = "failed"
            document.index_error = str(exc)
            write_audit(db, user, "知识库索引失败", upload.file_name, AuditRisk.WARNING, str(exc))

    db.commit()
    db.refresh(document)
    return document


@router.post("/{document_id}/index", response_model=KnowledgeDocumentRead)
def index_document(
    document_id: str,
    current_user: User = Depends(require_roles(RoleName.KB_ADMIN)),
    db: Session = Depends(get_db),
) -> KnowledgeDocument:
    document = db.get(KnowledgeDocument, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    try:
        RAGIndex().index_document(db, document)
        document.status = DocumentStatus.INDEXED
    except RAGServiceError as exc:
        document.index_status = "failed"
        document.index_error = str(exc)
        db.commit()
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    db.commit()
    db.refresh(document)
    return document


@router.get("/{document_id}/chunks", response_model=list[KnowledgeDocumentChunkRead])
def list_document_chunks(
    document_id: str,
    current_user: User = Depends(require_roles(RoleName.RESEARCHER, RoleName.KB_ADMIN, RoleName.AUTH_ADMIN)),
    db: Session = Depends(get_db),
) -> list:
    document = db.get(KnowledgeDocument, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return list(db.scalars(select(KnowledgeDocumentChunk).where(KnowledgeDocumentChunk.document_id == document_id).order_by(KnowledgeDocumentChunk.chunk_index)).all())
