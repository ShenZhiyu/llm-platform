# LLM Platform

面向企业/科研场景的大模型应用平台原型，包含 React 前端和 FastAPI 后端。当前项目已从 AI Studio 原型扩展为可本地运行的前后端系统，支持真实登录、智能问答、局域网大模型调用、知识库上传检索、审批、审计、运维和管理类页面。

## 功能概览

- 登录认证：基于后端数据库用户与 token 的登录接口。
- 智能问答：支持会话列表、流式输出、多模型选择、图片/附件上传、重新生成、编辑、复制、导出、反馈、归档会话。
- 模型网关：对接 OpenAI-compatible `/v1/chat/completions` 接口，默认配置 Qwen 文本模型和 Qwen-VL 多模态模型。
- 知识库 RAG：支持文件上传、文本解析、切片、Chroma 向量库、Embedding 服务、Reranker 服务和真实引用结果。
- 工作台：展示最近会话、知识库、通知和审批相关入口。
- 审批与治理：包含我的申请、待审批、知识库审核、知识库授权等页面和后端接口。
- 管理与运维：包含用户/角色、模型配置、OpenAPI Key、审计日志、运维状态、报表等模块。
- 智能写作：包含写作模板入口和模板编辑工作区。

## 技术栈

前端：

- React 19
- TypeScript
- Vite
- React Router
- Tailwind CSS
- lucide-react

后端：

- FastAPI
- SQLAlchemy
- Alembic
- Pydantic Settings
- SQLite/PostgreSQL
- httpx
- pytest

RAG/文档处理：

- ChromaDB
- LlamaIndex
- sentence-transformers
- pypdf
- python-docx
- OpenAI-compatible Embedding API
- OpenAI-compatible Reranker API

## 目录结构

```text
llm-platform/
|-- README.md
|-- package.json
|-- vite.config.ts
|-- .env.example
|-- src/
|   |-- App.tsx
|   |-- AppContext.tsx
|   |-- components/
|   |-- pages/
|   |-- services/
|   |-- types/
|   |-- mocks/
|   `-- stores/
|-- backend/
|   |-- requirements.txt
|   |-- pyproject.toml
|   |-- alembic.ini
|   |-- app/
|   |   |-- main.py
|   |   |-- models.py
|   |   |-- schemas.py
|   |   |-- seed.py
|   |   |-- api/
|   |   |-- core/
|   |   |-- db/
|   |   `-- services/
|   |       |-- llm_client.py
|   |       `-- rag_service.py
|   |-- alembic/
|   |-- scripts/
|   |-- tests/
|   `-- storage/
`-- storage/
```

## 本地启动

### 1. 启动后端

```powershell
cd C:\Users\zazn\Downloads\llm-platform\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 18080
```

后端访问地址：

- API 健康检查：`http://127.0.0.1:18080/api/v1/health`
- Swagger UI：`http://127.0.0.1:18080/docs`
- OpenAPI JSON：`http://127.0.0.1:18080/openapi.json`

### 2. 启动前端

```powershell
cd C:\Users\zazn\Downloads\llm-platform
npm install
copy .env.example .env.local
npm run dev
```

前端访问地址：

```text
http://127.0.0.1:3001
```

`package.json` 中已经固定 Vite 使用 `3001` 端口。

## 环境变量

前端主要配置：

```text
VITE_API_BASE_URL=http://127.0.0.1:18080/api/v1
```

后端主要配置：

```text
DATABASE_URL=sqlite:///./storage/llm_platform.db

LLM_API_BASE_URL=http://192.168.10.101:8000/v1
LLM_API_KEY=dummy
LLM_MODEL_ID=Qwen3-30B-A3B-w8a8

VL_LLM_API_BASE_URL=http://192.168.10.101:8003/v1
VL_LLM_API_KEY=dummy
VL_LLM_MODEL_ID=Qwen3-VL-8B-Instruct

RAG_EMBEDDING_API_BASE_URL=http://192.168.10.101:8001/v1
RAG_EMBEDDING_API_KEY=dummy
RAG_EMBEDDING_MODEL=Qwen3-Embedding-8B

RAG_RERANKER_API_BASE_URL=http://192.168.10.101:8002/v1
RAG_RERANKER_API_KEY=dummy
RAG_RERANKER_MODEL=Qwen3-Reranker-8B
```

模型接口按 OpenAI-compatible v1 协议调用，鉴权方式为：

```text
Authorization: Bearer <API_KEY>
```

## 默认账号

本地种子数据会创建以下开发账号，默认密码均为：

```text
123456
```

| 账号 | 身份 | 说明 |
| --- | --- | --- |
| `u-1001` | 科研人员 | 使用智能问答、写作、办公、知识库和我的申请 |
| `u-1002` | 普通/科研用户 | 使用基础 AI 应用和知识库能力 |
| `u-1882` | 知识库/审计管理员 | 处理知识库审核、审计和知识库治理 |
| `u-3001` | 授权管理员 | 处理用户、资源和知识库授权 |
| `u-9001` | 运维账号 | 管理模型、OpenAPI Key 和运维状态 |

## RAG 说明

当前 `backend/requirements.txt` 已启用重型 RAG 依赖：

```text
llama-index
llama-index-vector-stores-chroma
llama-index-embeddings-huggingface
chromadb
sentence-transformers
```

知识库索引流程：

```text
上传文档 -> 提取文本 -> 切片 -> 调用 Embedding API -> 写入 Chroma -> 检索 -> 可选 Reranker 重排 -> 返回引用片段
```

如果 Chroma 初始化失败，后端的 `rag_service.py` 仍保留数据库文本检索兜底逻辑；但完整向量检索需要安装并正常加载 Chroma 相关依赖。

## 常用命令

前端：

```powershell
npm run dev
npm run lint
npm run build
```

后端：

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m pytest -o cache_dir=$env:TEMP\pytest-llm-platform
python scripts\verify_api.py
```

查看 Git 提交：

```powershell
git log --oneline --decorate --graph --all
```

## 当前注意事项

- 本项目是开发环境可运行版本，默认数据库可使用 SQLite。
- 局域网模型、Embedding 和 Reranker 服务需要先由外部服务启动。
- 重型 RAG 依赖可能拉取较大的 `torch`/模型相关依赖，首次安装耗时较长。
- 若切换数据库或模型端点，请同步修改 `.env.local` 和 `backend/.env`。
