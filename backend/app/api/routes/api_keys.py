import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.security import hash_secret, require_roles
from app.api.utils import new_id, now_text, write_audit
from app.db.session import get_db
from app.models import ApiKey, AuditRisk, RoleName, User
from app.schemas import ApiKeyCreate, ApiKeyCreateResponse, ApiKeyRead

router = APIRouter()


@router.get("", response_model=list[ApiKeyRead])
def list_api_keys(current_user: User = Depends(require_roles(RoleName.OPS)), db: Session = Depends(get_db)) -> list[ApiKey]:
    return list(db.scalars(select(ApiKey).order_by(ApiKey.created_at.desc())).all())


@router.post("", response_model=ApiKeyCreateResponse, status_code=status.HTTP_201_CREATED)
def create_api_key(
    payload: ApiKeyCreate,
    current_user: User = Depends(require_roles(RoleName.OPS)),
    db: Session = Depends(get_db),
) -> ApiKeyCreateResponse:
    secret = f"sk-lp-{secrets.token_urlsafe(24)}"
    api_key = ApiKey(
        id=new_id("key"),
        name=payload.name,
        caller=payload.caller,
        key_hash=hash_secret(secret),
        scopes=payload.scopes,
        expiry=payload.expiry,
        limit=payload.limit,
        status="正常",
        created_at=now_text(),
    )
    db.add(api_key)
    write_audit(db, current_user, "创建 API Key", payload.name, AuditRisk.WARNING, "开放平台密钥已创建，明文只返回一次。")
    db.commit()
    db.refresh(api_key)
    return ApiKeyCreateResponse.model_validate(api_key).model_copy(update={"secret": secret})


@router.post("/{api_key_id}/revoke", response_model=ApiKeyRead)
def revoke_api_key(
    api_key_id: str,
    current_user: User = Depends(require_roles(RoleName.OPS)),
    db: Session = Depends(get_db),
) -> ApiKey:
    api_key = db.get(ApiKey, api_key_id)
    if api_key is None:
        raise HTTPException(status_code=404, detail="API key not found")
    api_key.status = "已停用"
    write_audit(db, current_user, "停用 API Key", api_key.name, AuditRisk.WARNING, "开放平台密钥已停用。")
    db.commit()
    db.refresh(api_key)
    return api_key
