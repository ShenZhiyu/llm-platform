from datetime import datetime

from fastapi import APIRouter

from app.core.config import get_settings
from app.schemas import HealthRead

router = APIRouter()


@router.get("/health", response_model=HealthRead)
def health() -> HealthRead:
    return HealthRead(status="ok", app_name=get_settings().app_name, time=datetime.now())
