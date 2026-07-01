from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.security import create_token, expires_text, get_current_user, hash_secret, verify_secret
from app.api.utils import new_id, now_text, write_audit
from app.db.session import get_db
from app.models import AuditRisk, AuthSession, Role, User
from app.schemas import LoginRequest, LoginResponse, UserRead

router = APIRouter()


def to_user_read(user: User) -> UserRead:
    return UserRead(id=user.id, name=user.name, department=user.department, role=user.role.name, ip=user.ip, is_active=user.is_active)


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)) -> LoginResponse:
    user = db.get(User, payload.username) or db.scalar(select(User).where(User.name == payload.username))
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User disabled")
    if not user.password_hash:
        user.password_hash = hash_secret("123456")
    if not verify_secret(payload.password, user.password_hash):
        write_audit(db, user, "登录失败", "统一身份认证", AuditRisk.WARNING, "密码校验失败。")
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if payload.role is not None:
        role = db.scalar(select(Role).where(Role.name == payload.role))
        if role is None:
            raise HTTPException(status_code=400, detail="Unknown role")
        user.role_id = role.id

    token = create_token()
    expires_at = expires_text()
    user.last_login_at = now_text()
    db.add(
        AuthSession(
            id=new_id("sess"),
            user_id=user.id,
            token_hash=hash_secret(token),
            created_at=now_text(),
            expires_at=expires_at,
            ip=request.client.host if request.client else user.ip,
        )
    )
    write_audit(db, user, "登录系统", "统一身份认证", AuditRisk.NORMAL, "密码认证通过并创建后端会话。")
    db.commit()
    db.refresh(user)
    return LoginResponse(user=to_user_read(user), token=token, expires_at=expires_at)


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)) -> UserRead:
    return to_user_read(user)


@router.post("/logout")
def logout(authorization: str | None = Header(None), db: Session = Depends(get_db)) -> dict[str, bool]:
    if authorization and authorization.lower().startswith("bearer "):
        token_hash = hash_secret(authorization.split(" ", 1)[1].strip())
        session = db.scalar(select(AuthSession).where(AuthSession.token_hash == token_hash))
        if session and session.revoked_at is None:
            session.revoked_at = now_text()
            user = db.get(User, session.user_id)
            write_audit(db, user, "退出系统", "统一身份认证", AuditRisk.NORMAL, "用户主动退出并撤销会话。")
            db.commit()
    return {"ok": True}
