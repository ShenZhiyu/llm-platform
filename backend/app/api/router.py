from fastapi import APIRouter

from app.api.routes import api_keys, approvals, audits, auth, chat, documents, health, knowledge_bases, llm_tasks, messages, model_configs, ops, reports, users

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(knowledge_bases.router, prefix="/knowledge-bases", tags=["knowledge-bases"])
api_router.include_router(documents.router, prefix="/documents", tags=["documents"])
api_router.include_router(approvals.router, prefix="/approvals", tags=["approvals"])
api_router.include_router(audits.router, prefix="/audits", tags=["audits"])
api_router.include_router(model_configs.router, prefix="/models", tags=["models"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(api_keys.router, prefix="/api-keys", tags=["api-keys"])
api_router.include_router(messages.router, prefix="/messages", tags=["messages"])
api_router.include_router(ops.router, prefix="/ops", tags=["ops"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(llm_tasks.router, prefix="/llm-tasks", tags=["llm-tasks"])
