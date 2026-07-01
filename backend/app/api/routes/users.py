from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.security import require_roles
from app.api.routes.auth import to_user_read
from app.db.session import get_db
from app.api.utils import write_audit
from app.models import AuditRisk, Role, RoleName, User
from app.schemas import RoleRead, UserRead, UserUpdate

router = APIRouter()


@router.get("", response_model=list[UserRead])
def list_users(current_user: User = Depends(require_roles(RoleName.AUTH_ADMIN)), db: Session = Depends(get_db)) -> list[UserRead]:
    users = db.scalars(select(User).order_by(User.id)).all()
    return [to_user_read(user) for user in users]


@router.get("/roles", response_model=list[RoleRead])
def list_roles(current_user: User = Depends(require_roles(RoleName.AUTH_ADMIN)), db: Session = Depends(get_db)) -> list[RoleRead]:
    merged_roles = [RoleName.RESEARCHER, RoleName.KB_ADMIN, RoleName.AUTH_ADMIN, RoleName.OPS]
    return list(db.scalars(select(Role).where(Role.name.in_(merged_roles)).order_by(Role.id)).all())


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: str,
    payload: UserUpdate,
    current_user: User = Depends(require_roles(RoleName.AUTH_ADMIN)),
    db: Session = Depends(get_db),
) -> UserRead:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.role_id is not None:
        if db.get(Role, payload.role_id) is None:
            raise HTTPException(status_code=404, detail="Role not found")
        user.role_id = payload.role_id
    if payload.is_active is not None:
        user.is_active = payload.is_active
    write_audit(db, current_user, "用户配置变更", user.name, AuditRisk.WARNING, "管理员更新了用户角色或启停状态。")
    db.commit()
    db.refresh(user)
    return to_user_read(user)
