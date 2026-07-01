import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from fastapi.testclient import TestClient

from app.api.routes import chat
from app.main import app
from app.services.llm_client import LLMCompletion


class FakeLLMClient:
    def complete(self, messages, model=None, temperature=0.2, top_p=0.9, max_tokens=2048, enable_thinking=True):
        assert messages[-1]["role"] == "user"
        return LLMCompletion(content="REAL_MODEL_REPLY", model="glm-5.1", raw={}, reasoning="FAKE_REASONING")


def auth_headers(client: TestClient, username: str = "u-1001") -> dict[str, str]:
    login = client.post("/api/v1/auth/login", json={"username": username, "password": "123456"})
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['token']}"}


def test_health_and_openapi_available():
    with TestClient(app) as client:
        health = client.get("/api/v1/health")
        assert health.status_code == 200
        assert health.json()["status"] == "ok"

        openapi = client.get("/openapi.json")
        assert openapi.status_code == 200
        assert "paths" in openapi.json()


def test_core_demo_endpoints():
    with TestClient(app) as client:
        login = client.post("/api/v1/auth/login", json={})
        assert login.status_code == 200
        assert login.json()["user"]["id"]
        researcher_headers = auth_headers(client, "u-1001")
        kb_admin_headers = auth_headers(client, "u-1882")
        auth_admin_headers = auth_headers(client, "u-3001")

        users = client.get("/api/v1/users", headers=auth_admin_headers)
        assert users.status_code == 200
        assert len(users.json()) >= 1

        kbs = client.get("/api/v1/knowledge-bases", headers=researcher_headers)
        assert kbs.status_code == 200
        assert any(item["id"] == "kb-acoustic" for item in kbs.json())

        models = client.get("/api/v1/models", headers=researcher_headers)
        assert models.status_code == 200
        assert any(item["name"] == "Qwen3-30B-A3B-w8a8" for item in models.json())

        audits = client.get("/api/v1/audits", headers=kb_admin_headers)
        assert audits.status_code == 200
        assert len(audits.json()) >= 1


def test_create_knowledge_base_and_list_it():
    with TestClient(app) as client:
        headers = auth_headers(client, "u-1882")
        existing = client.get("/api/v1/knowledge-bases", headers=headers)
        assert existing.status_code == 200
        template = existing.json()[0]

        created = client.post(
            "/api/v1/knowledge-bases",
            json={
                "name": "RAG Smoke Knowledge Base",
                "department": "Test Department",
                "level": template["level"],
                "type": template["type"],
            },
            headers=headers,
        )
        assert created.status_code == 201
        data = created.json()
        assert data["name"] == "RAG Smoke Knowledge Base"
        assert data["fileCount"] == 0

        listed = client.get("/api/v1/knowledge-bases", headers=headers)
        assert any(item["id"] == data["id"] for item in listed.json())


def test_document_approval_and_chat_flow(monkeypatch):
    monkeypatch.setattr(chat, "get_llm_client", lambda: FakeLLMClient())

    with TestClient(app) as client:
        headers = auth_headers(client)
        kb_admin_headers = auth_headers(client, "u-1882")
        document = client.post(
            "/api/v1/documents",
            json={"fileName": "test-document.docx", "applicant": "tester", "knowledgeBaseId": "kb-acoustic"},
            headers=headers,
        )
        assert document.status_code == 201
        assert document.json()["id"]

        approvals = client.get("/api/v1/approvals", headers=kb_admin_headers)
        pending = [item for item in approvals.json() if item["target"] == "test-document.docx"]
        assert pending

        decision = client.post(f"/api/v1/approvals/{pending[0]['id']}/decision", json={"approved": True}, headers=kb_admin_headers)
        assert decision.status_code == 200

        session = client.post("/api/v1/chat/sessions", json={"model": "GLM 5.1", "title": "api-test-session"}, headers=headers)
        assert session.status_code == 201
        session_id = session.json()["id"]

        message = client.post(
            f"/api/v1/chat/sessions/{session_id}/messages",
            json={"content": "Explain sound speed profile impact.", "model": "GLM 5.1"},
            headers=headers,
        )
        assert message.status_code == 200
        data = message.json()
        assert len(data["messages"]) == 2
        assert data["messages"][1]["content"] == "REAL_MODEL_REPLY"
        assert data["messages"][1]["model"] == "glm-5.1"
        assert data["messages"][1]["reasoning"] == "FAKE_REASONING"
        assert data["messages"][1]["citations"] == []


def test_chat_session_archive_restore_and_hard_delete(monkeypatch):
    monkeypatch.setattr(chat, "get_llm_client", lambda: FakeLLMClient())

    with TestClient(app) as client:
        headers = auth_headers(client)
        session = client.post("/api/v1/chat/sessions", json={"model": "GLM 5.1", "title": "archive-test-session"}, headers=headers)
        assert session.status_code == 201
        session_id = session.json()["id"]

        message = client.post(
            f"/api/v1/chat/sessions/{session_id}/messages",
            json={"content": "Archive this session later.", "model": "GLM 5.1"},
            headers=headers,
        )
        assert message.status_code == 200

        archived = client.delete(f"/api/v1/chat/sessions/{session_id}", headers=headers)
        assert archived.status_code == 200
        assert archived.json()["archivedAt"]

        active_sessions = client.get("/api/v1/chat/sessions", headers=headers)
        assert active_sessions.status_code == 200
        assert all(item["id"] != session_id for item in active_sessions.json())

        archived_sessions = client.get("/api/v1/chat/sessions/archived", headers=headers)
        assert archived_sessions.status_code == 200
        assert any(item["id"] == session_id and len(item["messages"]) == 2 for item in archived_sessions.json())

        restored = client.post(f"/api/v1/chat/sessions/{session_id}/restore", headers=headers)
        assert restored.status_code == 200
        assert restored.json()["archivedAt"] is None

        client.delete(f"/api/v1/chat/sessions/{session_id}", headers=headers)
        deleted = client.delete(f"/api/v1/chat/sessions/{session_id}/hard-delete", headers=headers)
        assert deleted.status_code == 204

        archived_sessions = client.get("/api/v1/chat/sessions/archived", headers=headers)
        assert all(item["id"] != session_id for item in archived_sessions.json())


def test_role_permissions_are_enforced():
    with TestClient(app) as client:
        researcher = auth_headers(client, "u-1001")
        kb_admin = auth_headers(client, "u-1882")
        auth_admin = auth_headers(client, "u-3001")
        ops = auth_headers(client, "u-9001")

        assert client.get("/api/v1/users", headers=researcher).status_code == 403
        assert client.get("/api/v1/users", headers=kb_admin).status_code == 403
        assert client.get("/api/v1/users", headers=auth_admin).status_code == 200

        assert client.get("/api/v1/api-keys", headers=researcher).status_code == 403
        assert client.get("/api/v1/api-keys", headers=ops).status_code == 200
        assert client.get("/api/v1/ops/status", headers=ops).status_code == 200
        assert client.get("/api/v1/ops/status", headers=auth_admin).status_code == 403

        kb_approvals = client.get("/api/v1/approvals", headers=kb_admin).json()
        auth_approvals = client.get("/api/v1/approvals", headers=auth_admin).json()
        assert all(item["type"] == "文件入库" for item in kb_approvals)
        assert all(item["type"] != "文件入库" for item in auth_approvals)

        document_approval = next(item for item in kb_approvals if item["type"] == "文件入库")
        assert client.post(f"/api/v1/approvals/{document_approval['id']}/decision", json={"approved": True}, headers=researcher).status_code == 403
        assert client.post(f"/api/v1/approvals/{document_approval['id']}/decision", json={"approved": True}, headers=auth_admin).status_code == 403


def test_real_txt_upload_indexes_and_searches_chunks():
    with TestClient(app) as client:
        headers = auth_headers(client, "u-1882")
        upload = client.post(
            "/api/v1/documents/upload",
            files={
                "file": (
                    "rag-smoke.txt",
                    "声速剖面会影响声呐传播距离。表面声道可能增强近海面传播，跃层可能形成声影区。",
                    "text/plain",
                )
            },
            data={"knowledgeBaseId": "kb-code", "applicant": "张工", "indexNow": "true"},
            headers=headers,
        )
        assert upload.status_code == 201
        document = upload.json()
        assert document["knowledgeBaseId"] == "kb-code"
        assert document["indexStatus"] == "indexed"
        assert document["chunkCount"] >= 1

        search = client.post(
            "/api/v1/knowledge-bases/kb-code/search",
            json={"query": "声影区", "documentIds": [document["id"]]},
            headers=headers,
        )
        assert search.status_code == 200
        hits = search.json()
        assert hits
        assert hits[0]["documentId"] == document["id"]
        assert hits[0]["knowledgeBaseId"] == "kb-code"
        assert "声影区" in hits[0]["excerpt"]


def test_missing_knowledge_references_are_rejected():
    with TestClient(app) as client:
        headers = auth_headers(client)
        missing_kb = client.post(
            "/api/v1/chat/sessions/chat-001/messages",
            json={"content": "test", "model": "glm-5.1", "knowledgeBaseIds": ["kb-not-exists"]},
            headers=headers,
        )
        assert missing_kb.status_code == 404

        missing_document = client.post(
            "/api/v1/knowledge-bases/kb-acoustic/search",
            json={"query": "声速", "documentIds": ["doc-not-exists"]},
            headers=headers,
        )
        assert missing_document.status_code == 404
