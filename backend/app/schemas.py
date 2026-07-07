from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models import (
    ApprovalStatus,
    ApprovalType,
    AuditRisk,
    DocumentStatus,
    KnowledgeLevel,
    KnowledgeRole,
    KnowledgeStatus,
    KnowledgeType,
    ModelStatus,
    RiskLevel,
    RoleName,
    SecurityResult,
)


def to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])


class ApiSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)


class ErrorResponse(ApiSchema):
    error: dict[str, Any]


class RoleRead(ApiSchema):
    id: str
    name: RoleName
    description: str


class UserRead(ApiSchema):
    id: str
    name: str
    department: str
    role: RoleName
    ip: str
    is_active: bool


class LoginRequest(ApiSchema):
    username: str = "u-1001"
    password: str = "123456"
    role: RoleName | None = None


class LoginResponse(ApiSchema):
    user: UserRead
    token: str
    expires_at: str


class UserUpdate(ApiSchema):
    role_id: str | None = None
    is_active: bool | None = None


class ModelConfigRead(ApiSchema):
    id: str
    name: str
    type: str
    status: ModelStatus
    is_default: bool
    endpoint: str


class ApiKeyRead(ApiSchema):
    id: str
    name: str
    caller: str
    expiry: str
    limit: str
    status: str
    scopes: str
    created_at: str
    last_used_at: str | None = None
    call_count: int = 0


class ApiKeyCreate(ApiSchema):
    name: str = Field(min_length=1, max_length=120)
    caller: str = Field(min_length=1, max_length=120)
    scopes: str = "chat:invoke,kb:search"
    expiry: str = "长期有效"
    limit: str = "1000/day"


class ApiKeyCreateResponse(ApiKeyRead):
    secret: str


class KnowledgeBaseRead(ApiSchema):
    id: str
    name: str
    department: str
    level: KnowledgeLevel
    file_count: int
    status: KnowledgeStatus
    updated_at: str
    role: KnowledgeRole
    type: KnowledgeType


class KnowledgeBaseCreate(ApiSchema):
    name: str = Field(min_length=1, max_length=100)
    department: str = Field(min_length=1, max_length=100)
    level: KnowledgeLevel = KnowledgeLevel.INTERNAL
    type: KnowledgeType = KnowledgeType.DEPARTMENT


class KnowledgeDocumentRead(ApiSchema):
    id: str
    knowledge_base_id: str
    title: str
    file_name: str
    status: DocumentStatus
    security_result: SecurityResult
    applicant: str
    submitted_at: str
    summary: str
    storage_path: str | None = None
    mime_type: str | None = None
    file_size: int = 0
    content_hash: str | None = None
    index_status: str = "not_indexed"
    chunk_count: int = 0
    indexed_at: str | None = None
    index_error: str | None = None


class KnowledgeDocumentChunkRead(ApiSchema):
    id: str
    document_id: str
    knowledge_base_id: str
    chunk_index: int
    text: str
    page_label: str | None = None
    vector_id: str
    created_at: str


class DocumentCreate(ApiSchema):
    knowledge_base_id: str = "kb-acoustic"
    file_name: str
    applicant: str = "张工"
    blocked: bool = False
    summary: str | None = None


class ApprovalRead(ApiSchema):
    id: str
    type: ApprovalType
    applicant: str
    target: str
    status: ApprovalStatus
    risk: RiskLevel
    created_at: str
    related_document_id: str | None = None


class ApprovalDecision(ApiSchema):
    approved: bool
    operator_id: str = "u-1001"


class KnowledgeBaseAccessRequestCreate(ApiSchema):
    knowledge_base_id: str
    user_id: str = "u-1001"
    reason: str = ""
    expires_at: str | None = None


class KnowledgeBaseAccessGrantRead(ApiSchema):
    id: str
    knowledge_base_id: str
    user_id: str
    approval_id: str | None = None
    status: str
    created_at: str
    expires_at: str | None = None


class AuditLogRead(ApiSchema):
    id: str
    time: str
    user: str
    role: RoleName
    action: str
    resource: str
    ip: str
    risk: AuditRisk
    detail: str


class AuditLogCreate(ApiSchema):
    user: str = "张工"
    role: RoleName = RoleName.RESEARCHER
    action: str
    resource: str
    ip: str = "10.12.8.105"
    risk: AuditRisk = AuditRisk.NORMAL
    detail: str = ""


class NotificationRead(ApiSchema):
    id: str
    user_id: str | None = None
    title: str
    content: str
    category: str
    read_at: str | None = None
    created_at: str


class LLMTaskCreate(ApiSchema):
    task_type: str = Field(min_length=1, max_length=60)
    title: str = Field(min_length=1, max_length=180)
    input_text: str = ""
    user_id: str = "u-1001"
    model: str = "Qwen3-30B-A3B-w8a8"
    temperature: float = Field(default=0.2, ge=0, le=2)
    top_p: float = Field(default=0.9, ge=0, le=1)
    max_tokens: int = Field(default=2048, ge=1, le=8192)


class LLMTaskRead(ApiSchema):
    id: str
    user_id: str | None = None
    task_type: str
    title: str
    input_text: str
    output_text: str
    reasoning: str | None = None
    model: str
    status: str
    input_tokens: int
    output_tokens: int
    created_at: str


class CodeChange(ApiSchema):
    file_path: str
    operation: str = "replace"
    find: str
    replace: str
    description: str = ""


class CodeEditRequest(ApiSchema):
    instruction: str = Field(min_length=1)
    file_path: str = Field(min_length=1)
    language: str = "plaintext"
    content: str = ""
    selected_text: str = ""
    user_id: str = "u-1001"
    model: str = "Qwen3-30B-A3B-w8a8"
    temperature: float = Field(default=0.1, ge=0, le=2)
    top_p: float = Field(default=0.9, ge=0, le=1)
    max_tokens: int = Field(default=4096, ge=1, le=8192)


class CodeEditResponse(ApiSchema):
    id: str
    answer: str
    reasoning: str | None = None
    changes: list[CodeChange] = []
    raw_output: str
    model: str
    input_tokens: int
    output_tokens: int


class WritingTemplateField(ApiSchema):
    key: str
    label: str
    placeholder: str
    type: str = "field"
    editable: bool = True
    format_editable: bool = False
    default_value: str = ""
    removable: bool = False
    addable: bool = False
    order: int = 0


class WritingFormatConfig(ApiSchema):
    title_font: str = "黑体"
    body_font: str = "仿宋"
    title_font_size: str = "二号"
    body_font_size: str = "小四"
    font_size: str = "小四"
    line_spacing: str = "1.5"
    allow_user_format: bool = False


class WritingTemplateRead(ApiSchema):
    id: str
    name: str
    category: str
    description: str
    status: str
    owner_id: str | None = None
    current_version: int
    original_file_name: str
    file_size: int
    content_hash: str | None = None
    fields: list[WritingTemplateField] = []
    format_config: dict[str, Any] = {}
    preview_text: str = ""
    created_at: str
    updated_at: str


class WritingTemplateUpdate(ApiSchema):
    name: str | None = Field(default=None, max_length=180)
    category: str | None = Field(default=None, max_length=80)
    description: str | None = None
    fields: list[WritingTemplateField] | None = None
    format_config: dict[str, Any] | None = None
    status: str | None = Field(default=None, max_length=40)


class WritingDocumentCreate(ApiSchema):
    template_id: str
    user_id: str = "u-1001"
    title: str = "未命名文档"
    content: dict[str, Any] = {}
    format_config: dict[str, Any] = {}


class WritingDocumentUpdate(ApiSchema):
    title: str | None = Field(default=None, max_length=220)
    content: dict[str, Any] | None = None
    format_config: dict[str, Any] | None = None
    status: str | None = Field(default=None, max_length=40)


class WritingDocumentRead(ApiSchema):
    id: str
    template_id: str
    owner_id: str | None = None
    title: str
    status: str
    content: dict[str, Any] = {}
    format_config: dict[str, Any] = {}
    current_file_path: str | None = None
    current_file_hash: str | None = None
    download_url: str | None = None
    created_at: str
    updated_at: str
    template: WritingTemplateRead | None = None


class WritingGenerateRequest(ApiSchema):
    action: str = "按要求写作"
    instruction: str = ""
    content: dict[str, Any] = {}
    model: str = "Qwen3-30B-A3B-w8a8"
    temperature: float = Field(default=0.2, ge=0, le=2)
    top_p: float = Field(default=0.9, ge=0, le=1)
    max_tokens: int = Field(default=2048, ge=1, le=8192)
    user_id: str = "u-1001"


class WritingGenerateResponse(ApiSchema):
    document: WritingDocumentRead
    output_text: str
    proofread_results: list[dict[str, Any]] = []


class WritingExportRequest(ApiSchema):
    user_id: str = "u-1001"


class OpsStatusRead(ApiSchema):
    database: str
    llm_gateway: str
    knowledge_index: str
    upload_storage: str
    audit_count: int
    pending_approvals: int
    indexed_documents: int
    failed_documents: int
    recent_errors: list[str]


class ReportSummaryRead(ApiSchema):
    chat_sessions: int
    chat_messages: int
    input_tokens: int
    output_tokens: int
    knowledge_bases: int
    documents: int
    approvals_pending: int
    approvals_approved: int
    approvals_rejected: int
    model_failures: int


class Citation(ApiSchema):
    id: str
    document_id: str
    knowledge_base_id: str
    title: str
    knowledge_base_name: str
    similarity: int = Field(ge=0, le=100)
    excerpt: str


class ChatAttachmentRead(ApiSchema):
    id: str
    title: str
    file_name: str
    index_status: str = "not_indexed"


class ChatMessageRead(ApiSchema):
    id: str
    role: str
    content: str
    reasoning: str | None = None
    model: str | None = None
    response_time_ms: int = 0
    first_token_latency_ms: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    tokens_per_second: float = 0
    created_at: str
    citations: list[Citation] = []
    image_data_urls: list[str] = []
    attachments: list[ChatAttachmentRead] = []
    feedback: str | None = None
    feedback_reason: str | None = None
    feedback_updated_at: str | None = None
    edited_at: str | None = None
    regenerated_at: str | None = None


class ChatSessionRead(ApiSchema):
    id: str
    user_id: str
    title: str
    model: str
    updated_at: str
    archived_at: str | None = None
    temperature: float = 0.2
    top_p: float = 0.9
    max_tokens: int = 2048
    recent_message_limit: int = 8
    show_thinking: bool = True
    enable_thinking: bool = True
    selected_knowledge_base_ids: list[str] = []
    attached_document_ids: list[str] = []
    attached_documents: list[ChatAttachmentRead] = []
    messages: list[ChatMessageRead] = []


class ChatSessionCreate(ApiSchema):
    model: str = "Qwen3-30B-A3B-w8a8"
    title: str = "新的对话"


class ChatMessageCreate(ApiSchema):
    content: str
    model: str = "Qwen3-30B-A3B-w8a8"
    temperature: float = Field(default=0.2, ge=0, le=2)
    top_p: float = Field(default=0.9, ge=0, le=1)
    max_tokens: int = Field(default=2048, ge=1, le=8192)
    recent_message_limit: int = Field(default=8, ge=0, le=50)
    show_thinking: bool = True
    enable_thinking: bool = True
    knowledge_base_ids: list[str] = []
    attached_document_ids: list[str] = []
    image_data_urls: list[str] = []


class ChatSessionSettingsUpdate(ApiSchema):
    model: str | None = None
    temperature: float | None = Field(default=None, ge=0, le=2)
    top_p: float | None = Field(default=None, ge=0, le=1)
    max_tokens: int | None = Field(default=None, ge=1, le=8192)
    recent_message_limit: int | None = Field(default=None, ge=0, le=50)
    show_thinking: bool | None = None
    enable_thinking: bool | None = None
    selected_knowledge_base_ids: list[str] | None = None
    attached_document_ids: list[str] | None = None


class ChatMessageEdit(ApiSchema):
    content: str
    image_data_urls: list[str] = []


class ChatMessageFeedback(ApiSchema):
    feedback: str = Field(pattern="^(like|dislike|clear)$")
    reason: str | None = None


class KnowledgeSearchRequest(ApiSchema):
    query: str
    top_k: int = Field(default=4, ge=1, le=20)
    document_ids: list[str] = []


class KnowledgeSearchResult(ApiSchema):
    chunk_id: str
    document_id: str
    knowledge_base_id: str
    title: str
    knowledge_base_name: str
    similarity: int
    excerpt: str
    page_label: str | None = None


class HealthRead(ApiSchema):
    status: str
    app_name: str
    time: datetime
