"""认证与权限辅助函数。

负责 token 生成/校验、当前用户解析以及角色权限依赖。
"""

import hashlib
import secrets
from datetime import datetime, timedelta

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.utils import now_text
from app.db.session import get_db
from app.models import AuthSession, RoleName, User


def hash_secret(value: str) -> str:
    """对 token/密码等敏感字符串做 SHA-256 哈希。"""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def verify_secret(value: str, hashed: str) -> bool:
    """使用常量时间比较校验明文和哈希。"""
    return bool(hashed) and secrets.compare_digest(hash_secret(value), hashed)


def create_token() -> str:
    return f"lp_{secrets.token_urlsafe(32)}"


def expires_text(days: int = 7) -> str:
    return (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")


def get_current_user(
    request: Request,
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
) -> User:
    """从 Bearer Token 解析当前用户，供需要登录的接口依赖注入。"""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    token_hash = hash_secret(token)
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == token_hash))
    if session is None or session.revoked_at is not None:
        raise HTTPException(status_code=401, detail="Invalid session")
    if session.expires_at < now_text():
        raise HTTPException(status_code=401, detail="Session expired")
    user = db.get(User, session.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=403, detail="User disabled")
    request.state.current_user = user
    return user


def user_has_role(user: User, *roles: RoleName) -> bool:
    raw_role = user.role.name
    role_tokens = {str(raw_role)}
    if isinstance(raw_role, RoleName):
        role_tokens.update({raw_role.name, raw_role.value})
    allowed_tokens = {token for role in roles for token in (str(role), role.name, role.value)}
    return bool(role_tokens & allowed_tokens)


def require_roles(*roles: RoleName):
    """生成角色权限依赖，用于限制特定接口访问。"""
    def dependency(user: User = Depends(get_current_user)) -> User:
        if not user_has_role(user, *roles):
            raise HTTPException(status_code=403, detail="Insufficient role permissions")
        return user

    return dependency
