# LLM Platform Backend

FastAPI 后端第一阶段地基，用于承接当前 React/Vite 原型后续从 Mock API 切换到真实 API。

## 本地启动

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

如果 Windows 本机策略拒绝绑定 8000，可换用已验证可用的高位端口：

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 18080
```

默认配置使用 PostgreSQL：

```text
postgresql+psycopg://llm_platform:llm_platform@localhost:5432/llm_platform
```

如需快速本地验证且暂未启动 PostgreSQL，可临时使用 SQLite：

```powershell
$env:DATABASE_URL="sqlite:///./dev.db"
uvicorn app.main:app --reload --port 8000
```

## OpenAPI

- Swagger UI: http://127.0.0.1:8000/docs
- OpenAPI JSON: http://127.0.0.1:8000/openapi.json

若使用 18080 端口，则对应为：

- Swagger UI: http://127.0.0.1:18080/docs
- OpenAPI JSON: http://127.0.0.1:18080/openapi.json

## LLM Gateway

聊天接口会通过 OpenAI-compatible 网关调用局域网模型，默认配置在 `.env.example` 中：

```text
LLM_API_BASE_URL="http://192.168.10.101:8000/v1"
LLM_API_KEY="dummy"
LLM_MODEL_ID="glm-5.1"
LLM_TIMEOUT_SECONDS=60
LLM_USE_MOCK_FALLBACK=true
```

当前仅 `/api/v1/chat/sessions/{session_id}/messages` 使用真实模型；知识库、审批、审计等其他演示页面仍保留 mock 数据。若模型网关不可用且 `LLM_USE_MOCK_FALLBACK=true`，后端会返回兜底回答并写入 warning 审计。

## 验证

```powershell
pytest
```

关键接口示例：

```powershell
curl.exe http://127.0.0.1:8000/api/v1/health
curl.exe http://127.0.0.1:8000/api/v1/knowledge-bases
curl.exe http://127.0.0.1:8000/api/v1/chat/sessions
```

## 当前范围

- 已定义用户、角色、模型、知识库、文档、审批、审计、聊天会话与消息模型。
- 已提供基础 CRUD/动作接口和演示种子数据。
- 暂不替换前端 `src/services/mockApi.ts`，避免破坏 3001 端口演示闭环。
