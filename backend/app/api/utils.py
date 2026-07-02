import json
from datetime import datetime
from uuid import uuid4

from sqlalchemy.orm import Session

from app.models import AuditLog, AuditRisk, RoleName, User
from app.schemas import ChatAttachmentRead, ChatMessageRead, Citation


def now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:10]}"


def write_audit(db: Session, user: User | None, action: str, resource: str, risk: AuditRisk, detail: str) -> AuditLog:
    log = AuditLog(
        id=new_id("aud"),
        time=now_text(),
        user=user.name if user else "系统",
        role=user.role.name if user else RoleName.OPS,
        action=action,
        resource=resource,
        ip=user.ip if user else "127.0.0.1",
        risk=risk,
        detail=detail,
    )
    db.add(log)
    return log


def parse_message(message) -> ChatMessageRead:
    raw = json.loads(message.citations_json or "[]")
    image_raw = json.loads(getattr(message, "images_json", "[]") or "[]")
    attachment_raw = json.loads(getattr(message, "attachments_json", "[]") or "[]")
    if not isinstance(image_raw, list):
        image_raw = []
    if not isinstance(attachment_raw, list):
        attachment_raw = []
    citations = [
        Citation(
            id=item.get("id", ""),
            document_id=item.get("documentId") or item.get("document_id", ""),
            knowledge_base_id=item.get("knowledgeBaseId") or item.get("knowledge_base_id", ""),
            title=item.get("title", ""),
            knowledge_base_name=item.get("knowledgeBaseName") or item.get("knowledge_base_name", ""),
            similarity=item.get("similarity", 0),
            excerpt=item.get("excerpt", ""),
        )
        for item in raw
    ]
    return ChatMessageRead(
        id=message.id,
        role=message.role.value,
        content=message.content,
        reasoning=message.reasoning,
        model=message.model,
        response_time_ms=message.response_time_ms or 0,
        first_token_latency_ms=message.first_token_latency_ms or 0,
        input_tokens=message.input_tokens or 0,
        output_tokens=message.output_tokens or 0,
        tokens_per_second=message.tokens_per_second or 0,
        created_at=message.created_at,
        citations=citations,
        image_data_urls=[item for item in image_raw if isinstance(item, str)],
        attachments=[
            ChatAttachmentRead(
                id=item.get("id", ""),
                title=item.get("title", ""),
                file_name=item.get("fileName") or item.get("file_name", ""),
                index_status=item.get("indexStatus") or item.get("index_status", "not_indexed"),
            )
            for item in attachment_raw
            if isinstance(item, dict)
        ],
        feedback=getattr(message, "feedback", None),
        feedback_reason=getattr(message, "feedback_reason", None),
        feedback_updated_at=getattr(message, "feedback_updated_at", None),
        edited_at=getattr(message, "edited_at", None),
        regenerated_at=getattr(message, "regenerated_at", None),
    )
