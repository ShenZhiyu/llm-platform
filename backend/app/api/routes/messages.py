from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.utils import now_text
from app.db.session import get_db
from app.models import Notification
from app.schemas import NotificationRead

router = APIRouter()


@router.get("", response_model=list[NotificationRead])
def list_messages(user_id: str | None = None, db: Session = Depends(get_db)) -> list[Notification]:
    statement = select(Notification).order_by(Notification.created_at.desc())
    if user_id:
        statement = statement.where((Notification.user_id == user_id) | (Notification.user_id.is_(None)))
    return list(db.scalars(statement).all())


@router.post("/{message_id}/read", response_model=NotificationRead)
def mark_message_read(message_id: str, db: Session = Depends(get_db)) -> Notification:
    message = db.get(Notification, message_id)
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found")
    message.read_at = message.read_at or now_text()
    db.commit()
    db.refresh(message)
    return message
