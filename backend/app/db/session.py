"""数据库连接和 Session 依赖。

FastAPI 路由通过 get_db 获取短生命周期 Session，请求结束后自动关闭。
"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings


def _engine_kwargs(database_url: str) -> dict:
    """根据数据库类型补充 SQLAlchemy engine 参数。"""
    if database_url.startswith("sqlite"):
        kwargs: dict = {"connect_args": {"check_same_thread": False}}
        if database_url == "sqlite:///:memory:":
            kwargs["poolclass"] = StaticPool
        return kwargs
    return {"pool_pre_ping": True}


settings = get_settings()
engine = create_engine(settings.database_url, **_engine_kwargs(settings.database_url))
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    """FastAPI 依赖：为每个请求提供一个数据库 Session。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
