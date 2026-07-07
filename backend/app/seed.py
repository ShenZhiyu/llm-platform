"""本地演示数据初始化。

启动应用时调用，确保角色、用户、模型、知识库等基础数据存在。
"""

import hashlib
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import (
    Approval,
    ApprovalStatus,
    ApprovalType,
    ApiKey,
    AuditLog,
    AuditRisk,
    ChatMessage,
    ChatRole,
    ChatSession,
    DocumentStatus,
    KnowledgeBase,
    KnowledgeDocument,
    KnowledgeDocumentChunk,
    LLMTask,
    KnowledgeLevel,
    KnowledgeRole,
    KnowledgeStatus,
    KnowledgeType,
    ModelConfig,
    ModelStatus,
    Notification,
    RiskLevel,
    Role,
    RoleName,
    SecurityResult,
    User,
)


def now_text() -> str:
    """返回数据库中统一使用的时间字符串。"""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:10]}"


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def ensure_default_passwords(db: Session) -> None:
    for user in db.scalars(select(User)).all():
        if not user.password_hash:
            user.password_hash = hash_secret("123456")


def ensure_platform_records(db: Session) -> None:
    if db.get(ApiKey, "key-demo"):
        return
    db.add(
        ApiKey(
            id="key-demo",
            name="内部系统联调密钥",
            caller="科研协同门户",
            key_hash=hash_secret("sk-lp-demo"),
            scopes="chat:invoke,kb:search",
            expiry="长期有效",
            limit="1000/day",
            status="正常",
            created_at=now_text(),
        )
    )


def ensure_merged_default_roles(db: Session) -> None:
    role_by_name = {role.name: role for role in db.scalars(select(Role)).all()}
    researcher = role_by_name.get(RoleName.RESEARCHER)
    kb_admin = role_by_name.get(RoleName.KB_ADMIN)
    if researcher:
        researcher.description = "科研人员（合并普通用户），可使用问答、写作、办公、会议、知识库、上传、代码助手和我的申请"
        for user in db.scalars(select(User).where(User.role_id.in_(["role-normal", "role-researcher"]))).all():
            user.role_id = researcher.id
    if kb_admin:
        kb_admin.description = "知识库管理员（合并安全审计员），可使用知识库管理、入库审核、待审批、审计和报表"
        for user in db.scalars(select(User).where(User.role_id.in_(["role-kb-admin", "role-auditor"]))).all():
            user.role_id = kb_admin.id
    notifications = [
        Notification(id="msg-seed-001", user_id="u-1001", title="知识库索引完成", content="真实种子文档已完成本地索引，可在智能问答中引用。", category="kb", created_at=now_text()),
        Notification(id="msg-seed-002", user_id=None, title="模型网关已配置", content="默认模型端点使用局域网 GLM-5.1。", category="ops", created_at=now_text()),
    ]
    for notification in notifications:
        if db.get(Notification, notification.id) is None:
            db.add(notification)
    if db.get(LLMTask, "task-seed-001") is None:
        db.add(
            LLMTask(
                id="task-seed-001",
                user_id="u-1001",
                task_type="writing",
                title="平台功能说明草稿",
                input_text="说明当前平台能力",
                output_text="平台已接入聊天、知识库、审批、审计和模型网关等核心能力。",
                model=get_settings().llm_model_id,
                status="completed",
                input_tokens=8,
                output_tokens=24,
                created_at=now_text(),
            )
        )


def sync_runtime_model_config(db: Session) -> None:
    settings = get_settings()
    model = db.get(ModelConfig, "m-001")
    if model is None:
        model = ModelConfig(
            id="m-001",
            name=settings.llm_model_id,
            type="通用大语言模型",
            status=ModelStatus.NORMAL,
            is_default=True,
            endpoint=settings.llm_api_base_url,
        )
        db.add(model)
    else:
        model.name = settings.llm_model_id
        model.status = ModelStatus.NORMAL
        model.is_default = True
        model.endpoint = settings.llm_api_base_url
    for other in db.scalars(select(ModelConfig).where(ModelConfig.id != "m-001")):
        other.is_default = False


def sync_runtime_model_config(db: Session) -> None:
    settings = get_settings()
    runtime_models = [
        ("m-001", settings.llm_model_id, "因果推理模型", settings.llm_api_base_url, True),
        ("m-vl-001", settings.vl_llm_model_id, "视觉语言因果推理模型", settings.vl_llm_api_base_url, False),
    ]
    active_ids = {item[0] for item in runtime_models}
    for model_id, name, model_type, endpoint, is_default in runtime_models:
        model = db.get(ModelConfig, model_id)
        if model is None:
            model = ModelConfig(id=model_id, name=name, type=model_type, status=ModelStatus.NORMAL, is_default=is_default, endpoint=endpoint)
            db.add(model)
        else:
            model.name = name
            model.type = model_type
            model.status = ModelStatus.NORMAL
            model.is_default = is_default
            model.endpoint = endpoint
    for other in db.scalars(select(ModelConfig).where(ModelConfig.id.not_in(active_ids))):
        other.status = ModelStatus.OFFLINE
        other.is_default = False


def sync_real_seed_documents(db: Session) -> None:
    root = Path(__file__).resolve().parents[1]
    seed_documents = [
        {
            "id": "doc-001",
            "knowledge_base_id": "kb-acoustic",
            "title": "NOAA Underwater Sound Propagation Notes",
            "file_name": "noaa_underwater_sound_summary.md",
            "path": root / "storage" / "seed_documents" / "noaa_underwater_sound_summary.md",
            "summary": "Based on public NOAA educational material about underwater sound, sound-speed profiles, ducts, thermoclines, and sonar range variation.",
            "chunk_id": "chunk-seed-acoustic-001",
            "page_label": "NOAA summary",
            "submitted_at": "2026-06-20 09:30",
        },
        {
            "id": "doc-002",
            "knowledge_base_id": "kb-code",
            "title": "Python PEP 8 Operational Summary",
            "file_name": "python_pep8_operational_summary.md",
            "path": root / "storage" / "seed_documents" / "python_pep8_operational_summary.md",
            "summary": "Based on the official Python PEP 8 style guide for code layout, naming, imports, comments, and review consistency.",
            "chunk_id": "chunk-seed-code-001",
            "page_label": "PEP 8 summary",
            "submitted_at": "2026-06-18 15:20",
        },
        {
            "id": "doc-003",
            "knowledge_base_id": "kb-project",
            "title": "NIST AI Risk Management Framework Summary",
            "file_name": "nist_ai_rmf_summary.md",
            "path": root / "storage" / "seed_documents" / "nist_ai_rmf_summary.md",
            "summary": "Based on the public NIST AI RMF 1.0 page, covering govern, map, measure, and manage risk functions.",
            "chunk_id": "chunk-seed-project-001",
            "page_label": "NIST AI RMF summary",
            "submitted_at": "2026-06-19 10:00",
        },
    ]

    for item in seed_documents:
        path = item["path"]
        content = path.read_text(encoding="utf-8")
        content_hash = hashlib.sha256(path.read_bytes()).hexdigest()

        document = db.get(KnowledgeDocument, item["id"])
        if document is None:
            document = KnowledgeDocument(
                id=item["id"],
                knowledge_base_id=item["knowledge_base_id"],
                title=item["title"],
                file_name=item["file_name"],
                status=DocumentStatus.INDEXED,
                security_result=SecurityResult.PASSED,
                applicant="System Seed",
                submitted_at=item["submitted_at"],
                summary=item["summary"],
            )
            db.add(document)

        document.knowledge_base_id = item["knowledge_base_id"]
        document.title = item["title"]
        document.file_name = item["file_name"]
        document.status = DocumentStatus.INDEXED
        document.security_result = SecurityResult.PASSED
        document.applicant = "System Seed"
        document.submitted_at = item["submitted_at"]
        document.summary = item["summary"]
        document.storage_path = str(path)
        document.mime_type = "text/markdown"
        document.file_size = path.stat().st_size
        document.content_hash = content_hash
        document.index_status = "indexed"
        document.chunk_count = 1
        document.indexed_at = item["submitted_at"]
        document.index_error = None

        chunk = db.get(KnowledgeDocumentChunk, item["chunk_id"])
        if chunk is None:
            chunk = KnowledgeDocumentChunk(
                id=item["chunk_id"],
                document_id=item["id"],
                knowledge_base_id=item["knowledge_base_id"],
                chunk_index=0,
                text=content,
                page_label=item["page_label"],
                vector_id=f"{item['id']}:0",
                created_at=item["submitted_at"],
            )
            db.add(chunk)
        else:
            chunk.document_id = item["id"]
            chunk.knowledge_base_id = item["knowledge_base_id"]
            chunk.chunk_index = 0
            chunk.text = content
            chunk.page_label = item["page_label"]
            chunk.vector_id = f"{item['id']}:0"
            chunk.created_at = item["submitted_at"]

    for kb_id in {"kb-acoustic", "kb-code", "kb-project"}:
        kb = db.get(KnowledgeBase, kb_id)
        if kb:
            kb.status = KnowledgeStatus.INDEXED
            kb.updated_at = now_text()
            kb.file_count = len(db.scalars(select(KnowledgeDocument).where(KnowledgeDocument.knowledge_base_id == kb_id)).all())

    demo_message = db.get(ChatMessage, "msg-002")
    if demo_message:
        demo_message.citations_json = (
            '[{"id":"chunk-seed-acoustic-001","documentId":"doc-001","knowledgeBaseId":"kb-acoustic",'
            '"title":"NOAA Underwater Sound Propagation Notes","knowledgeBaseName":"水声基础理论库",'
            '"similarity":95,"excerpt":"Sound-speed profiles, ducts, thermoclines, and shadow zones affect sonar detection range."}]'
        )


def seed_demo_data(db: Session) -> None:
    """幂等写入演示数据；已存在的数据不会重复创建。"""
    settings = get_settings()
    if db.scalar(select(Role).limit(1)):
        ensure_merged_default_roles(db)
        sync_runtime_model_config(db)
        sync_real_seed_documents(db)
        ensure_default_passwords(db)
        ensure_platform_records(db)
        db.commit()
        return

    roles = [
        Role(id="role-normal", name=RoleName.NORMAL_USER, description="普通办公与问答用户"),
        Role(id="role-researcher", name=RoleName.RESEARCHER, description="科研人员，可使用问答、知识库和代码助手"),
        Role(id="role-kb-admin", name=RoleName.KB_ADMIN, description="知识库管理员，可审核入库文件"),
        Role(id="role-auth-admin", name=RoleName.AUTH_ADMIN, description="授权管理员，可审批资源访问"),
        Role(id="role-auditor", name=RoleName.AUDITOR, description="安全审计员，可查看审计日志"),
        Role(id="role-ops", name=RoleName.OPS, description="运维账号，可查看模型和运行状态"),
    ]
    db.add_all(roles)
    db.flush()

    role_by_name = {role.name: role for role in roles}
    db.add_all(
        [
            User(id="u-1001", name="张工", department="水声技术部", role_id=role_by_name[RoleName.RESEARCHER].id, ip="10.12.8.105"),
            User(id="u-1002", name="李研究员", department="声呐系统部", role_id=role_by_name[RoleName.NORMAL_USER].id, ip="10.12.8.106"),
            User(id="u-1882", name="赵审计员", department="安全合规部", role_id=role_by_name[RoleName.AUDITOR].id, ip="10.12.8.101"),
            User(id="u-3001", name="授权管理员", department="数据资源管理部", role_id=role_by_name[RoleName.AUTH_ADMIN].id, ip="10.12.8.120"),
            User(id="u-9001", name="运维账号", department="信息中心", role_id=role_by_name[RoleName.OPS].id, ip="10.12.8.200"),
        ]
    )
    db.flush()
    ensure_merged_default_roles(db)

    db.add_all(
        [
            ModelConfig(id="m-001", name=settings.llm_model_id, type="通用大语言模型", status=ModelStatus.NORMAL, is_default=True, endpoint=settings.llm_api_base_url),
            ModelConfig(id="m-002", name="Qwen 3.5", type="通用大语言模型", status=ModelStatus.NORMAL, is_default=False, endpoint="10.12.1.201:8080/v1"),
            ModelConfig(id="m-003", name="DeepSeek V4", type="深度推理模型", status=ModelStatus.NORMAL, is_default=False, endpoint="10.12.2.100:8000/v1"),
            ModelConfig(id="m-004", name="DeepSeek R1", type="备用推理模型", status=ModelStatus.OFFLINE, is_default=False, endpoint="-"),
        ]
    )

    db.add_all(
        [
            KnowledgeBase(id="kb-acoustic", name="水声基础理论库", department="水声技术部", level=KnowledgeLevel.PUBLIC, file_count=0, status=KnowledgeStatus.INDEXED, updated_at=now_text(), role=KnowledgeRole.ADMIN, type=KnowledgeType.DEPARTMENT),
            KnowledgeBase(id="kb-project", name="项目与治理资料库", department="项目管理办公室", level=KnowledgeLevel.INTERNAL, file_count=0, status=KnowledgeStatus.INDEXED, updated_at=now_text(), role=KnowledgeRole.VIEWER, type=KnowledgeType.AUTHORIZED),
            KnowledgeBase(id="kb-code", name="软件代码规范库", department="软件研发部", level=KnowledgeLevel.PUBLIC, file_count=0, status=KnowledgeStatus.INDEXED, updated_at=now_text(), role=KnowledgeRole.VIEWER, type=KnowledgeType.DEPARTMENT),
            KnowledgeBase(id="kb-personal", name="个人文档速查", department="个人", level=KnowledgeLevel.PRIVATE, file_count=0, status=KnowledgeStatus.NOT_INDEXED, updated_at=now_text(), role=KnowledgeRole.OWNER, type=KnowledgeType.PERSONAL),
        ]
    )

    sync_real_seed_documents(db)

    db.add_all(
        [
            Approval(id="ap-001", type=ApprovalType.DOCUMENT_INDEX, applicant="张工", target="待入库研究笔记.md", status=ApprovalStatus.PENDING, risk=RiskLevel.MEDIUM, created_at=now_text()),
            Approval(id="ap-002", type=ApprovalType.KB_AUTH, applicant="李研究员", target="申请访问：项目与治理资料库", status=ApprovalStatus.PENDING, risk=RiskLevel.NONE, created_at=now_text()),
        ]
    )

    db.add_all(
        [
            AuditLog(id="aud-001", time=now_text(), user="张工", role=RoleName.RESEARCHER, action="智能问答", resource="水声基础理论库", ip="10.12.8.105", risk=AuditRisk.NORMAL, detail="基于真实 Markdown 种子文档生成回答并引用知识库依据。"),
            AuditLog(id="aud-002", time=now_text(), user="系统", role=RoleName.OPS, action="知识库初始化", resource="真实种子文档", ip="127.0.0.1", risk=AuditRisk.NORMAL, detail="已同步 NOAA、Python PEP 8、NIST AI RMF 三份真实来源摘要文档。"),
        ]
    )

    session = ChatSession(id="chat-001", title="声速剖面对探测距离的影响", model=settings.llm_model_id, updated_at=now_text())
    db.add(session)
    db.add_all(
        [
            ChatMessage(id="msg-001", session_id=session.id, role=ChatRole.USER, content="请基于水声知识库说明声速剖面对声呐探测距离的影响。", created_at=now_text()),
            ChatMessage(
                id="msg-002",
                session_id=session.id,
                role=ChatRole.ASSISTANT,
                model=settings.llm_model_id,
                content="声速剖面会改变声线传播路径。温度、盐度和压力共同影响海水声速；表面声道、深海声道和热跃层都可能改变声能分布，从而影响声呐探测距离和盲区。",
                created_at=now_text(),
                citations_json='[{"id":"chunk-seed-acoustic-001","documentId":"doc-001","knowledgeBaseId":"kb-acoustic","title":"NOAA Underwater Sound Propagation Notes","knowledgeBaseName":"水声基础理论库","similarity":95,"excerpt":"Sound-speed profiles, ducts, thermoclines, and shadow zones affect sonar detection range."}]',
            ),
        ]
    )

    ensure_default_passwords(db)
    ensure_platform_records(db)
    db.commit()
