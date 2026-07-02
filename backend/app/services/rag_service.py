import hashlib
import mimetypes
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import UploadFile
import httpx
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.api.utils import new_id, now_text
from app.core.config import get_settings
from app.models import KnowledgeBase, KnowledgeDocument, KnowledgeDocumentChunk, KnowledgeStatus
from app.schemas import KnowledgeSearchResult


class RAGServiceError(RuntimeError):
    pass


class OpenAIEmbeddingFunction:
    def __init__(self) -> None:
        settings = get_settings()
        self.base_url = settings.rag_embedding_api_base_url.rstrip("/")
        self.api_key = settings.rag_embedding_api_key
        self.model = settings.rag_embedding_model
        self.timeout = settings.llm_timeout_seconds

    def __call__(self, input: list[str]) -> list[list[float]]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        with httpx.Client(timeout=self.timeout) as client:
            response = client.post(
                f"{self.base_url}/embeddings",
                headers=headers,
                json={"model": self.model, "input": input},
            )
            response.raise_for_status()
        payload = response.json()
        data = payload.get("data")
        if not isinstance(data, list):
            raise RAGServiceError("Embedding service returned an invalid response")
        embeddings = [item.get("embedding") for item in sorted(data, key=lambda item: item.get("index", 0))]
        if not embeddings or not all(isinstance(item, list) for item in embeddings):
            raise RAGServiceError("Embedding service returned no embeddings")
        return embeddings


@dataclass(frozen=True)
class StoredUpload:
    path: str
    file_name: str
    mime_type: str
    file_size: int
    content_hash: str


def storage_root() -> Path:
    root = Path(get_settings().storage_dir)
    root.mkdir(parents=True, exist_ok=True)
    (root / "uploads").mkdir(parents=True, exist_ok=True)
    return root


def save_upload(file: UploadFile, knowledge_base_id: str) -> StoredUpload:
    suffix = Path(file.filename or "upload.txt").suffix.lower()
    safe_name = re.sub(r"[^A-Za-z0-9_.-]+", "_", Path(file.filename or "upload.txt").name)
    target_dir = storage_root() / "uploads" / knowledge_base_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"{new_id('file')}-{safe_name}"

    digest = hashlib.sha256()
    size = 0
    with target_path.open("wb") as output:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            digest.update(chunk)
            output.write(chunk)

    mime_type = file.content_type or mimetypes.guess_type(str(target_path))[0] or "application/octet-stream"
    if suffix not in {".pdf", ".docx", ".txt", ".md"}:
        target_path.unlink(missing_ok=True)
        raise RAGServiceError("Only PDF, DOCX, TXT, and MD files are supported in this version")

    return StoredUpload(str(target_path), file.filename or safe_name, mime_type, size, digest.hexdigest())


def extract_text(path: str) -> str:
    file_path = Path(path)
    suffix = file_path.suffix.lower()
    if suffix in {".txt", ".md"}:
        return file_path.read_text(encoding="utf-8", errors="ignore")
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise RAGServiceError("pypdf is required to parse PDF files") from exc
        reader = PdfReader(str(file_path))
        return "\n\n".join(page.extract_text() or "" for page in reader.pages)
    if suffix == ".docx":
        try:
            from docx import Document
        except ImportError as exc:
            raise RAGServiceError("python-docx is required to parse DOCX files") from exc
        document = Document(str(file_path))
        return "\n".join(paragraph.text for paragraph in document.paragraphs)
    raise RAGServiceError("Unsupported file type")


def chunk_text(text: str) -> list[str]:
    settings = get_settings()
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        raise RAGServiceError("No readable text was extracted from the document")
    chunks: list[str] = []
    start = 0
    step = max(settings.rag_chunk_size - settings.rag_chunk_overlap, 1)
    while start < len(normalized):
        chunk = normalized[start : start + settings.rag_chunk_size].strip()
        if chunk:
            chunks.append(chunk)
        start += step
    return chunks


class RAGIndex:
    def __init__(self) -> None:
        self.settings = get_settings()

    def _collection(self) -> Any | None:
        try:
            import chromadb
        except ImportError as exc:
            return None

        Path(self.settings.rag_vector_store_dir).mkdir(parents=True, exist_ok=True)
        client = chromadb.PersistentClient(path=self.settings.rag_vector_store_dir)
        try:
            collection_name = "knowledge_chunks_" + re.sub(r"[^a-zA-Z0-9_]+", "_", self.settings.rag_embedding_model).lower()
            return client.get_or_create_collection(collection_name[:63], embedding_function=OpenAIEmbeddingFunction())
        except Exception:
            return None

    def index_document(self, db: Session, document: KnowledgeDocument) -> KnowledgeDocument:
        if not document.storage_path:
            raise RAGServiceError("Document has no uploaded file")
        document.index_status = "indexing"
        document.index_error = None
        db.flush()

        text = extract_text(document.storage_path)
        chunks = chunk_text(text)
        collection = self._collection()

        db.execute(delete(KnowledgeDocumentChunk).where(KnowledgeDocumentChunk.document_id == document.id))
        ids: list[str] = []
        documents: list[str] = []
        metadatas: list[dict[str, str | int]] = []
        created_at = now_text()

        for index, chunk in enumerate(chunks):
            chunk_id = new_id("chunk")
            vector_id = f"{document.id}:{index}"
            db.add(
                KnowledgeDocumentChunk(
                    id=chunk_id,
                    document_id=document.id,
                    knowledge_base_id=document.knowledge_base_id,
                    chunk_index=index,
                    text=chunk,
                    page_label=None,
                    vector_id=vector_id,
                    created_at=created_at,
                )
            )
            ids.append(vector_id)
            documents.append(chunk)
            metadatas.append(
                {
                    "chunk_id": chunk_id,
                    "document_id": document.id,
                    "knowledge_base_id": document.knowledge_base_id,
                    "title": document.title,
                }
            )

        if collection is not None:
            try:
                collection.delete(where={"document_id": document.id})
            except Exception:
                pass
            collection.add(ids=ids, documents=documents, metadatas=metadatas)

        document.index_status = "indexed"
        document.chunk_count = len(chunks)
        document.indexed_at = now_text()
        document.index_error = None
        kb = db.get(KnowledgeBase, document.knowledge_base_id)
        if kb:
            kb.file_count = db.scalar(select(func.count()).select_from(KnowledgeDocument).where(KnowledgeDocument.knowledge_base_id == kb.id)) or kb.file_count
            kb.status = KnowledgeStatus.INDEXED
            kb.updated_at = document.indexed_at
        db.flush()
        return document

    def search(
        self,
        db: Session,
        query: str,
        knowledge_base_ids: list[str] | None = None,
        document_ids: list[str] | None = None,
        top_k: int | None = None,
    ) -> list[KnowledgeSearchResult]:
        if knowledge_base_ids and document_ids:
            kb_results = self.search(db, query, knowledge_base_ids=knowledge_base_ids, top_k=top_k)
            document_results = self.search(db, query, document_ids=document_ids, top_k=top_k)
            merged: dict[str, KnowledgeSearchResult] = {}
            for result in [*kb_results, *document_results]:
                merged[result.chunk_id] = result
            return self._rerank_results(query, list(merged.values()))[: top_k or self.settings.rag_top_k]

        collection = self._collection()
        if collection is None:
            return self._search_db_chunks(db, query, knowledge_base_ids, document_ids, top_k)

        where: dict[str, object] | None = None
        filters: list[dict[str, object]] = []
        if knowledge_base_ids:
            filters.append({"knowledge_base_id": {"$in": knowledge_base_ids}})
        if document_ids:
            filters.append({"document_id": {"$in": document_ids}})
        if len(filters) == 1:
            where = filters[0]
        elif filters:
            where = {"$and": filters}

        try:
            result = collection.query(query_texts=[query], n_results=top_k or self.settings.rag_top_k, where=where)
        except Exception as exc:
            return self._search_db_chunks(db, query, knowledge_base_ids, document_ids, top_k)

        ids = result.get("ids", [[]])[0]
        distances = result.get("distances", [[]])[0] if result.get("distances") else [0] * len(ids)

        output: list[KnowledgeSearchResult] = []
        for vector_id, distance in zip(ids, distances):
            chunk = db.scalar(select(KnowledgeDocumentChunk).where(KnowledgeDocumentChunk.vector_id == vector_id))
            if not chunk:
                continue
            document = db.get(KnowledgeDocument, chunk.document_id)
            kb = db.get(KnowledgeBase, chunk.knowledge_base_id)
            knowledge_base_name = kb.name if kb else "会话临时附件"
            similarity = max(0, min(100, int((1 - float(distance)) * 100))) if distance is not None else 0
            output.append(
                KnowledgeSearchResult(
                    chunk_id=chunk.id,
                    document_id=chunk.document_id,
                    knowledge_base_id=chunk.knowledge_base_id,
                    title=document.title if document else chunk.document_id,
                    knowledge_base_name=knowledge_base_name,
                    similarity=similarity,
                    excerpt=chunk.text[:500],
                    page_label=chunk.page_label,
                )
            )
        if not output:
            return self._search_db_chunks(db, query, knowledge_base_ids, document_ids, top_k)
        return self._rerank_results(query, output)

    def _search_db_chunks(
        self,
        db: Session,
        query: str,
        knowledge_base_ids: list[str] | None = None,
        document_ids: list[str] | None = None,
        top_k: int | None = None,
    ) -> list[KnowledgeSearchResult]:
        statement = select(KnowledgeDocumentChunk)
        if knowledge_base_ids:
            statement = statement.where(KnowledgeDocumentChunk.knowledge_base_id.in_(knowledge_base_ids))
        if document_ids:
            statement = statement.where(KnowledgeDocumentChunk.document_id.in_(document_ids))

        scored: list[tuple[int, KnowledgeDocumentChunk]] = []
        query_tokens = self._tokens(query)
        for chunk in db.scalars(statement).all():
            score = self._lexical_score(query, query_tokens, chunk.text)
            if score > 0:
                scored.append((score, chunk))

        scored.sort(key=lambda item: item[0], reverse=True)
        output: list[KnowledgeSearchResult] = []
        for score, chunk in scored[: top_k or self.settings.rag_top_k]:
            document = db.get(KnowledgeDocument, chunk.document_id)
            kb = db.get(KnowledgeBase, chunk.knowledge_base_id)
            if document is None or document.index_status != "indexed":
                continue
            output.append(
                KnowledgeSearchResult(
                    chunk_id=chunk.id,
                    document_id=chunk.document_id,
                    knowledge_base_id=chunk.knowledge_base_id,
                    title=document.title,
                    knowledge_base_name=kb.name if kb else "会话临时附件",
                    similarity=score,
                    excerpt=chunk.text[:500],
                    page_label=chunk.page_label,
                )
            )
        return self._rerank_results(query, output)

    def _rerank_results(self, query: str, results: list[KnowledgeSearchResult]) -> list[KnowledgeSearchResult]:
        if len(results) <= 1:
            return results
        headers = {"Content-Type": "application/json"}
        if self.settings.rag_reranker_api_key:
            headers["Authorization"] = f"Bearer {self.settings.rag_reranker_api_key}"
        documents = [result.excerpt for result in results]
        payload = {"model": self.settings.rag_reranker_model, "query": query, "documents": documents}
        base_url = self.settings.rag_reranker_api_base_url.rstrip("/")
        try:
            with httpx.Client(timeout=self.settings.llm_timeout_seconds) as client:
                response = client.post(f"{base_url}/rerank", headers=headers, json=payload)
                if response.status_code == 404:
                    response = client.post(f"{base_url}/ranking", headers=headers, json=payload)
                response.raise_for_status()
            data = response.json()
            raw_results = data.get("results") or data.get("data") or []
            scored: list[tuple[float, KnowledgeSearchResult]] = []
            for item in raw_results:
                if not isinstance(item, dict):
                    continue
                index = item.get("index")
                score = item.get("relevance_score", item.get("score", item.get("similarity")))
                if isinstance(index, int) and 0 <= index < len(results) and isinstance(score, int | float):
                    result = results[index].model_copy(update={"similarity": max(0, min(100, int(float(score) * 100 if float(score) <= 1 else float(score))))})
                    scored.append((float(score), result))
            if scored:
                scored.sort(key=lambda item: item[0], reverse=True)
                return [item[1] for item in scored]
        except Exception:
            return results
        return results

    def _tokens(self, text: str) -> set[str]:
        lowered = text.lower()
        words = set(re.findall(r"[a-z0-9_]+", lowered))
        cjk_chars = set(re.findall(r"[\u4e00-\u9fff]", lowered))
        return words | cjk_chars

    def _lexical_score(self, query: str, query_tokens: set[str], text: str) -> int:
        if not query_tokens:
            return 0
        text_lower = text.lower()
        text_tokens = self._tokens(text_lower)
        overlap = len(query_tokens & text_tokens)
        if overlap == 0 and query.lower() not in text_lower:
            return 0
        score = int((overlap / max(len(query_tokens), 1)) * 90)
        if query.lower() in text_lower:
            score = max(score, 95)
        return max(1, min(100, score))


def copy_upload_to_document(upload: StoredUpload, document: KnowledgeDocument) -> None:
    document.storage_path = upload.path
    document.mime_type = upload.mime_type
    document.file_size = upload.file_size
    document.content_hash = upload.content_hash


def duplicate_file_for_attachment(source_path: str, knowledge_base_id: str) -> str:
    source = Path(source_path)
    target_dir = storage_root() / "uploads" / knowledge_base_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{new_id('attach')}-{source.name}"
    shutil.copyfile(source, target)
    return str(target)
