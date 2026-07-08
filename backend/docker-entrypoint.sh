#!/bin/sh
set -e

mkdir -p /app/storage/seed_documents
cp -r /app/seed_documents/. /app/storage/seed_documents/

python - <<'PY'
import socket
import time
from urllib.parse import urlparse

from app.core.config import get_settings

url = get_settings().database_url
parsed = urlparse(url)
host = parsed.hostname
port = parsed.port or 5432

if host:
    deadline = time.time() + 60
    while True:
        try:
            with socket.create_connection((host, port), timeout=2):
                break
        except OSError:
            if time.time() > deadline:
                raise
            print(f"Waiting for database {host}:{port}...")
            time.sleep(2)
PY

alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
