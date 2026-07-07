"""模型配置查询与维护接口。"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.security import get_current_user
from app.db.session import get_db
from app.models import ModelConfig, User
from app.schemas import ModelConfigRead

router = APIRouter()


@router.get("", response_model=list[ModelConfigRead])
def list_models(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[ModelConfig]:
    return list(db.scalars(select(ModelConfig).order_by(ModelConfig.id)).all())
