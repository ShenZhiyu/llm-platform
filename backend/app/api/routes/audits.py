"""审计日志查询接口。"""

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.security import require_roles
from app.api.utils import new_id, now_text
from app.db.session import get_db
from app.models import AuditLog, RoleName, User
from app.schemas import AuditLogCreate, AuditLogRead

router = APIRouter()


@router.get("", response_model=list[AuditLogRead])
def list_audits(current_user: User = Depends(require_roles(RoleName.KB_ADMIN)), db: Session = Depends(get_db)) -> list[AuditLog]:
    return list(db.scalars(select(AuditLog).order_by(AuditLog.time.desc())).all())


@router.post("", response_model=AuditLogRead, status_code=status.HTTP_201_CREATED)
def create_audit(
    payload: AuditLogCreate,
    current_user: User = Depends(require_roles(RoleName.KB_ADMIN, RoleName.OPS)),
    db: Session = Depends(get_db),
) -> AuditLog:
    log = AuditLog(
        id=new_id("aud"),
        time=now_text(),
        user=payload.user,
        role=payload.role,
        action=payload.action,
        resource=payload.resource,
        ip=payload.ip,
        risk=payload.risk,
        detail=payload.detail,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log
