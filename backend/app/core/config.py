from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "LLM Platform API"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "sqlite:///./backend/storage/llm_platform.db"
    backend_cors_origins: str = Field(default="http://127.0.0.1:3001,http://localhost:3001")
    llm_api_base_url: str = "http://192.168.10.101:8000/v1"
    llm_api_key: str = "dummy"
    llm_model_id: str = "Qwen3-30B-A3B-w8a8"
    vl_llm_api_base_url: str = "http://192.168.10.101:8003/v1"
    vl_llm_api_key: str = "dummy"
    vl_llm_model_id: str = "Qwen3-VL-8B-Instruct"
    llm_timeout_seconds: float = 60.0
    llm_use_mock_fallback: bool = False
    storage_dir: str = "storage"
    rag_vector_store_dir: str = "storage/chroma"
    rag_embedding_api_base_url: str = "http://192.168.10.101:8001/v1"
    rag_embedding_api_key: str = "dummy"
    rag_embedding_model: str = "Qwen3-Embedding-8B"
    rag_reranker_api_base_url: str = "http://192.168.10.101:8002/v1"
    rag_reranker_api_key: str = "dummy"
    rag_reranker_model: str = "Qwen3-Reranker-8B"
    rag_chunk_size: int = 800
    rag_chunk_overlap: int = 120
    rag_top_k: int = 4

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
