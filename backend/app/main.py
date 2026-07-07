"""FastAPI 应用入口。

负责创建应用实例、注册中间件/路由、统一异常响应，并在启动时初始化数据库和演示数据。
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError

from app.api.router import api_router
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.seed import seed_demo_data


def ensure_runtime_schema() -> None:
    """兼容本地旧 SQLite 数据库，补齐缺失字段。

    正式环境应优先使用 Alembic 迁移；这里主要用于开发环境中已有数据库的平滑升级。
    """
    inspector = inspect(engine)
    if "chat_sessions" not in inspector.get_table_names():
        return
    table_columns = {
        table_name: {column["name"] for column in inspector.get_columns(table_name)}
        for table_name in inspector.get_table_names()
    }
    alter_statements: list[str] = []
    if "archived_at" not in table_columns.get("chat_sessions", set()):
        alter_statements.append("ALTER TABLE chat_sessions ADD COLUMN archived_at VARCHAR(40)")
    chat_session_columns = table_columns.get("chat_sessions", set())
    chat_session_additions = {
        "user_id": "VARCHAR(64) DEFAULT 'u-1001' NOT NULL",
        "temperature": "REAL DEFAULT 0.2",
        "top_p": "REAL DEFAULT 0.9",
        "max_tokens": "INTEGER DEFAULT 2048",
        "recent_message_limit": "INTEGER DEFAULT 8",
        "show_thinking": "BOOLEAN DEFAULT 1",
        "enable_thinking": "BOOLEAN DEFAULT 1",
        "selected_knowledge_base_ids_json": "TEXT DEFAULT '[]'",
        "attached_document_ids_json": "TEXT DEFAULT '[]'",
    }
    for column_name, column_type in chat_session_additions.items():
        if column_name not in chat_session_columns:
            alter_statements.append(f"ALTER TABLE chat_sessions ADD COLUMN {column_name} {column_type}")
    if "reasoning" not in table_columns.get("chat_messages", set()):
        alter_statements.append("ALTER TABLE chat_messages ADD COLUMN reasoning TEXT")
    chat_message_columns = table_columns.get("chat_messages", set())
    chat_metric_additions = {
        "response_time_ms": "INTEGER DEFAULT 0",
        "first_token_latency_ms": "INTEGER DEFAULT 0",
        "input_tokens": "INTEGER DEFAULT 0",
        "output_tokens": "INTEGER DEFAULT 0",
        "tokens_per_second": "REAL DEFAULT 0",
        "images_json": "TEXT DEFAULT '[]'",
        "attachments_json": "TEXT DEFAULT '[]'",
        "feedback": "VARCHAR(20)",
        "feedback_reason": "TEXT",
        "feedback_updated_at": "VARCHAR(40)",
        "edited_at": "VARCHAR(40)",
        "regenerated_at": "VARCHAR(40)",
    }
    for column_name, column_type in chat_metric_additions.items():
        if column_name not in chat_message_columns:
            alter_statements.append(f"ALTER TABLE chat_messages ADD COLUMN {column_name} {column_type}")

    document_columns = table_columns.get("knowledge_documents", set())
    document_additions = {
        "storage_path": "VARCHAR(500)",
        "mime_type": "VARCHAR(120)",
        "file_size": "INTEGER DEFAULT 0",
        "content_hash": "VARCHAR(128)",
        "index_status": "VARCHAR(40) DEFAULT 'not_indexed'",
        "chunk_count": "INTEGER DEFAULT 0",
        "indexed_at": "VARCHAR(40)",
        "index_error": "TEXT",
    }
    for column_name, column_type in document_additions.items():
        if column_name not in document_columns:
            alter_statements.append(f"ALTER TABLE knowledge_documents ADD COLUMN {column_name} {column_type}")

    user_columns = table_columns.get("users", set())
    user_additions = {
        "password_hash": "VARCHAR(128) DEFAULT ''",
        "last_login_at": "VARCHAR(40)",
    }
    for column_name, column_type in user_additions.items():
        if column_name not in user_columns:
            alter_statements.append(f"ALTER TABLE users ADD COLUMN {column_name} {column_type}")

    with engine.begin() as connection:
        for statement in alter_statements:
            connection.execute(text(statement))
        if "users" in table_columns and "roles" in table_columns:
            connection.execute(text("UPDATE users SET role_id = 'role-researcher' WHERE role_id = 'role-normal'"))
            connection.execute(text("UPDATE users SET role_id = 'role-kb-admin' WHERE role_id = 'role-auditor'"))
            connection.execute(
                text(
                    "UPDATE roles SET description = '科研人员（合并普通用户），可使用问答、写作、办公、会议、知识库、上传、代码助手和我的申请' "
                    "WHERE id = 'role-researcher'"
                )
            )
            connection.execute(
                text(
                    "UPDATE roles SET description = '知识库管理员（合并安全审计员），可使用知识库管理、入库审核、待审批、审计和报表' "
                    "WHERE id = 'role-kb-admin'"
                )
            )
    Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用启动生命周期：建表、补字段、写入演示数据。"""
    Base.metadata.create_all(bind=engine)
    ensure_runtime_schema()
    with SessionLocal() as db:
        seed_demo_data(db)
    yield


settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """统一 HTTPException 的错误响应结构。"""
    return JSONResponse(status_code=exc.status_code, content={"error": {"code": exc.status_code, "message": exc.detail}})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """统一请求参数校验错误响应。"""
    return JSONResponse(status_code=422, content={"error": {"code": 422, "message": "Validation error", "details": exc.errors()}})


@app.exception_handler(SQLAlchemyError)
async def database_exception_handler(request: Request, exc: SQLAlchemyError):
    """避免数据库异常细节直接暴露给前端。"""
    return JSONResponse(status_code=500, content={"error": {"code": 500, "message": "Database error"}})


app.include_router(api_router, prefix=settings.api_v1_prefix)
