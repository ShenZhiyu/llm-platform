# Docker Linux Test Deployment

This guide deploys the platform as three services on one Linux test server:

- `frontend`: Nginx serving the React build and proxying `/api` to the backend.
- `backend`: FastAPI + Alembic migrations.
- `db`: PostgreSQL with a persistent Docker volume.

The browser should open only the frontend URL, for example `http://192.168.10.50:3001`.

## 1. Install Docker

Ubuntu example:

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Optional, allow the current user to run Docker without `sudo`:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

## 2. Prepare Project

Copy or pull the project on the Linux server:

```bash
cd /opt
git clone <your-repo-url> llm-platform
cd /opt/llm-platform
```

Create the Docker environment file:

```bash
cp .env.docker.example .env
```

Edit `.env`:

```bash
vim .env
```

Recommended minimum changes:

```env
WEB_PORT=3001
POSTGRES_PASSWORD=use-a-real-password
BACKEND_CORS_ORIGINS=http://192.168.10.50:3001,http://localhost:3001
```

Replace `192.168.10.50` with the Linux server IP that users will open in the browser.

If the model gateway addresses are different in the Linux test network, update:

```env
LLM_API_BASE_URL=http://192.168.10.101:8000/v1
VL_LLM_API_BASE_URL=http://192.168.10.101:8003/v1
RAG_EMBEDDING_API_BASE_URL=http://192.168.10.101:8001/v1
RAG_RERANKER_API_BASE_URL=http://192.168.10.101:8002/v1
```

## 3. Start Services

Build and start all services:

```bash
docker compose up -d --build
```

Check status:

```bash
docker compose ps
```

Follow logs:

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f db
```

The backend entrypoint waits for PostgreSQL, runs:

```bash
alembic upgrade head
```

Then starts:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## 4. Verify

Open in a browser:

```text
http://192.168.10.50:3001
```

API health check through Nginx:

```bash
curl http://192.168.10.50:3001/api/v1/health
```

OpenAPI docs:

```text
http://192.168.10.50:3001/docs
```

Default demo login:

```text
account: u-1001
password: 123456
```

## 5. Update Deployment

After pulling new code:

```bash
git pull
docker compose up -d --build
```

View logs if startup fails:

```bash
docker compose logs --tail=200 backend
```

## 6. Data and Reset

Persistent data is stored in named Docker volumes:

- `llm-platform_postgres_data`
- `llm-platform_backend_storage`

Stop services without deleting data:

```bash
docker compose down
```

Reset the test environment and delete database/files:

```bash
docker compose down -v
docker compose up -d --build
```

## 7. Firewall

Only the web port needs to be reachable by other users:

```bash
sudo ufw allow 3001/tcp
```

PostgreSQL and the backend are internal Docker services and do not need public ports.

