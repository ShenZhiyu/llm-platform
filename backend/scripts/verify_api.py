import os
import sys
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app.main import app


def login_headers(client: TestClient, username: str) -> dict[str, str]:
    login = client.post("/api/v1/auth/login", json={"username": username, "password": "123456"})
    if login.status_code >= 400:
        print(f"FAIL login {username}: {login.status_code} {login.text[:200]}")
        raise SystemExit(1)
    return {"Authorization": f"Bearer {login.json()['token']}"}


def main() -> None:
    with TestClient(app) as client:
        researcher_headers = login_headers(client, "u-1001")
        kb_admin_headers = login_headers(client, "u-1882")
        auth_admin_headers = login_headers(client, "u-3001")
        ops_headers = login_headers(client, "u-9001")
        checks = [
            ("health", client.get("/api/v1/health")),
            ("openapi", client.get("/openapi.json")),
            ("knowledge_bases", client.get("/api/v1/knowledge-bases", headers=researcher_headers)),
            ("documents", client.get("/api/v1/documents", headers=researcher_headers)),
            ("approvals", client.get("/api/v1/approvals", headers=kb_admin_headers)),
            ("audits", client.get("/api/v1/audits", headers=kb_admin_headers)),
            ("models", client.get("/api/v1/models", headers=researcher_headers)),
            ("users", client.get("/api/v1/users", headers=auth_admin_headers)),
            ("ops", client.get("/api/v1/ops/status", headers=ops_headers)),
            ("chat_sessions", client.get("/api/v1/chat/sessions", headers=researcher_headers)),
        ]
        failed = [(name, response.status_code, response.text[:200]) for name, response in checks if response.status_code >= 400]
        if failed:
            for name, status, body in failed:
                print(f"FAIL {name}: {status} {body}")
            raise SystemExit(1)

        print("Backend API verification passed")
        print("OpenAPI title:", client.get("/openapi.json").json()["info"]["title"])


if __name__ == "__main__":
    main()
