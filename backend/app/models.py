from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class RoleName(StrEnum):
    NORMAL_USER = "普通用户"
    RESEARCHER = "科研人员"
    KB_ADMIN = "知识库管理员"
    AUTH_ADMIN = "授权管理员"
    AUDITOR = "安全审计员"
    OPS = "运维账号"


class ChatRole(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"


class KnowledgeLevel(StrEnum):
    PUBLIC = "公开级"
    INTERNAL = "内部级"
    PRIVATE = "私有"


class KnowledgeStatus(StrEnum):
    INDEXED = "已索引"
    INDEXING = "索引中"
    PENDING_REVIEW = "待审核"
    NOT_INDEXED = "未索引"


class KnowledgeRole(StrEnum):
    OWNER = "所有者"
    ADMIN = "管理员"
    VIEWER = "查看者"


class KnowledgeType(StrEnum):
    PERSONAL = "个人库"
    DEPARTMENT = "部门库"
    AUTHORIZED = "授权库"


class DocumentStatus(StrEnum):
    PENDING_REVIEW = "待审核"
    INDEXED = "已入库"
    REJECTED = "已驳回"
    BLOCKED = "已拦截"


class SecurityResult(StrEnum):
    PASSED = "通过"
    SUSPICIOUS = "疑似涉密"
    PENDING = "待检测"


class ApprovalType(StrEnum):
    DOCUMENT_INDEX = "文件入库"
    KB_AUTH = "知识库授权"
    MODEL_ACCESS = "模型权限"
    API_ACCESS = "API 权限"


class ApprovalStatus(StrEnum):
    PENDING = "待审批"
    APPROVED = "已通过"
    REJECTED = "已驳回"


class RiskLevel(StrEnum):
    NONE = "无风险"
    MEDIUM = "中风险"
    HIGH = "高风险"


class AuditRisk(StrEnum):
    NORMAL = "normal"
    WARNING = "warning"
    DANGER = "danger"


class ModelStatus(StrEnum):
    NORMAL = "正常"
    OFFLINE = "已下线"


def enum_column(enum_type: type[StrEnum], default: StrEnum | None = None) -> Mapped[StrEnum]:
    return mapped_column(Enum(enum_type, native_enum=False), default=default)


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[RoleName] = mapped_column(Enum(RoleName, native_enum=False), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    users: Mapped[list["User"]] = relationship(back_populates="role")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    department: Mapped[str] = mapped_column(String(100), nullable=False)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id"), nullable=False)
    ip: Mapped[str] = mapped_column(String(64), default="10.12.8.105")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    password_hash: Mapped[str] = mapped_column(String(128), default="")
    last_login_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    role: Mapped[Role] = relationship(back_populates="users")


class ModelConfig(Base):
    __tablename__ = "model_configs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[ModelStatus] = mapped_column(Enum(ModelStatus, native_enum=False), default=ModelStatus.NORMAL)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    endpoint: Mapped[str] = mapped_column(String(255), default="-")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class KnowledgeBase(Base):
    __tablename__ = "knowledge_bases"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    department: Mapped[str] = mapped_column(String(100), nullable=False)
    level: Mapped[KnowledgeLevel] = mapped_column(Enum(KnowledgeLevel, native_enum=False), nullable=False)
    file_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[KnowledgeStatus] = mapped_column(Enum(KnowledgeStatus, native_enum=False), default=KnowledgeStatus.NOT_INDEXED)
    updated_at: Mapped[str] = mapped_column(String(40), default="")
    role: Mapped[KnowledgeRole] = mapped_column(Enum(KnowledgeRole, native_enum=False), default=KnowledgeRole.VIEWER)
    type: Mapped[KnowledgeType] = mapped_column(Enum(KnowledgeType, native_enum=False), default=KnowledgeType.DEPARTMENT)

    documents: Mapped[list["KnowledgeDocument"]] = relationship(back_populates="knowledge_base")


class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    knowledge_base_id: Mapped[str] = mapped_column(ForeignKey("knowledge_bases.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[DocumentStatus] = mapped_column(Enum(DocumentStatus, native_enum=False), default=DocumentStatus.PENDING_REVIEW)
    security_result: Mapped[SecurityResult] = mapped_column(Enum(SecurityResult, native_enum=False), default=SecurityResult.PENDING)
    applicant: Mapped[str] = mapped_column(String(100), nullable=False)
    submitted_at: Mapped[str] = mapped_column(String(40), nullable=False)
    summary: Mapped[str] = mapped_column(Text, default="")
    storage_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    content_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    index_status: Mapped[str] = mapped_column(String(40), default="not_indexed")
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    indexed_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    index_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    knowledge_base: Mapped[KnowledgeBase] = relationship(back_populates="documents")
    approvals: Mapped[list["Approval"]] = relationship(back_populates="related_document")
    chunks: Mapped[list["KnowledgeDocumentChunk"]] = relationship(back_populates="document", cascade="all, delete-orphan")


class KnowledgeDocumentChunk(Base):
    __tablename__ = "knowledge_document_chunks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("knowledge_documents.id"), nullable=False)
    knowledge_base_id: Mapped[str] = mapped_column(ForeignKey("knowledge_bases.id"), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    page_label: Mapped[str | None] = mapped_column(String(40), nullable=True)
    vector_id: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)

    document: Mapped[KnowledgeDocument] = relationship(back_populates="chunks")


class Approval(Base):
    __tablename__ = "approvals"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    type: Mapped[ApprovalType] = mapped_column(Enum(ApprovalType, native_enum=False), nullable=False)
    applicant: Mapped[str] = mapped_column(String(100), nullable=False)
    target: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[ApprovalStatus] = mapped_column(Enum(ApprovalStatus, native_enum=False), default=ApprovalStatus.PENDING)
    risk: Mapped[RiskLevel] = mapped_column(Enum(RiskLevel, native_enum=False), default=RiskLevel.NONE)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    related_document_id: Mapped[str | None] = mapped_column(ForeignKey("knowledge_documents.id"), nullable=True)

    related_document: Mapped[KnowledgeDocument | None] = relationship(back_populates="approvals")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    time: Mapped[str] = mapped_column(String(40), nullable=False)
    user: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[RoleName] = mapped_column(Enum(RoleName, native_enum=False), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource: Mapped[str] = mapped_column(String(255), nullable=False)
    ip: Mapped[str] = mapped_column(String(64), nullable=False)
    risk: Mapped[AuditRisk] = mapped_column(Enum(AuditRisk, native_enum=False), default=AuditRisk.NORMAL)
    detail: Mapped[str] = mapped_column(Text, default="")


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    expires_at: Mapped[str] = mapped_column(String(40), nullable=False)
    revoked_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    ip: Mapped[str] = mapped_column(String(64), default="127.0.0.1")


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    caller: Mapped[str] = mapped_column(String(120), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    scopes: Mapped[str] = mapped_column(String(255), default="chat:invoke,kb:search")
    expiry: Mapped[str] = mapped_column(String(40), default="")
    limit: Mapped[str] = mapped_column(String(80), default="1000/day")
    status: Mapped[str] = mapped_column(String(40), default="正常")
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    last_used_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    call_count: Mapped[int] = mapped_column(Integer, default=0)


class KnowledgeBaseAccessGrant(Base):
    __tablename__ = "knowledge_base_access_grants"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    knowledge_base_id: Mapped[str] = mapped_column(ForeignKey("knowledge_bases.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    approval_id: Mapped[str | None] = mapped_column(ForeignKey("approvals.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="pending")
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    expires_at: Mapped[str | None] = mapped_column(String(40), nullable=True)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    content: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(60), default="system")
    read_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)


class LLMTask(Base):
    __tablename__ = "llm_tasks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=True)
    task_type: Mapped[str] = mapped_column(String(60), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    input_text: Mapped[str] = mapped_column(Text, default="")
    output_text: Mapped[str] = mapped_column(Text, default="")
    model: Mapped[str] = mapped_column(String(100), default="")
    status: Mapped[str] = mapped_column(String(40), default="completed")
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), default="u-1001", nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)
    archived_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    temperature: Mapped[float] = mapped_column(Float, default=0.2)
    top_p: Mapped[float] = mapped_column(Float, default=0.9)
    max_tokens: Mapped[int] = mapped_column(Integer, default=2048)
    recent_message_limit: Mapped[int] = mapped_column(Integer, default=8)
    show_thinking: Mapped[bool] = mapped_column(Boolean, default=True)
    enable_thinking: Mapped[bool] = mapped_column(Boolean, default=True)
    selected_knowledge_base_ids_json: Mapped[str] = mapped_column(Text, default="[]")
    attached_document_ids_json: Mapped[str] = mapped_column(Text, default="[]")

    messages: Mapped[list["ChatMessage"]] = relationship(back_populates="session", cascade="all, delete-orphan", order_by="ChatMessage.created_at")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("chat_sessions.id"), nullable=False)
    role: Mapped[ChatRole] = mapped_column(Enum(ChatRole, native_enum=False), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    response_time_ms: Mapped[int] = mapped_column(Integer, default=0)
    first_token_latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    tokens_per_second: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    citations_json: Mapped[str] = mapped_column(Text, default="[]")
    images_json: Mapped[str] = mapped_column(Text, default="[]")
    attachments_json: Mapped[str] = mapped_column(Text, default="[]")
    feedback: Mapped[str | None] = mapped_column(String(20), nullable=True)
    feedback_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    feedback_updated_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    edited_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    regenerated_at: Mapped[str | None] = mapped_column(String(40), nullable=True)

    session: Mapped[ChatSession] = relationship(back_populates="messages")
