from dataclasses import dataclass
import json
from typing import Any, Iterator

import httpx

from app.core.config import get_settings


class LLMClientError(RuntimeError):
    pass


@dataclass(frozen=True)
class LLMCompletion:
    content: str
    model: str
    raw: dict[str, Any]
    reasoning: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass(frozen=True)
class LLMStreamChunk:
    content: str = ""
    reasoning: str = ""
    model: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass(frozen=True)
class LLMTokenCount:
    count: int
    max_model_len: int
    model: str


class LLMClient:
    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        model_id: str | None = None,
        timeout_seconds: float | None = None,
        client: httpx.Client | None = None,
    ) -> None:
        settings = get_settings()
        self.base_url = (base_url or settings.llm_api_base_url).rstrip("/")
        self.api_key = api_key if api_key is not None else settings.llm_api_key
        self.model_id = model_id or settings.llm_model_id
        self.timeout_seconds = timeout_seconds if timeout_seconds is not None else settings.llm_timeout_seconds
        self.client = client or httpx.Client(timeout=self.timeout_seconds)

    def complete(
        self,
        messages: list[dict[str, Any]],
        model: str | None = None,
        temperature: float = 0.2,
        top_p: float = 0.9,
        max_tokens: int = 2048,
        enable_thinking: bool = True,
    ) -> LLMCompletion:
        model_id, base_url, api_key = self._resolve_target(model)
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        payload: dict[str, Any] = {
            "model": model_id,
            "messages": messages,
            "temperature": temperature,
            "top_p": top_p,
            "max_tokens": max_tokens,
        }
        if model_id != get_settings().vl_llm_model_id:
            payload["chat_template_kwargs"] = {"enable_thinking": enable_thinking}

        try:
            response = self.client.post(
                f"{base_url}/chat/completions",
                headers=headers,
                json=payload,
                timeout=self.timeout_seconds,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise LLMClientError(f"LLM gateway request failed: {exc}") from exc

        payload = response.json()
        try:
            message = payload["choices"][0]["message"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMClientError("LLM gateway returned an invalid response shape") from exc

        reasoning = message.get("reasoning")
        content = message.get("content") or reasoning
        if not isinstance(content, str) or not content.strip():
            raise LLMClientError("LLM gateway returned an empty response")

        usage = payload.get("usage") if isinstance(payload, dict) else {}
        return LLMCompletion(
            content=content.strip(),
            model=str(payload.get("model") or model_id) if isinstance(payload, dict) else model_id,
            raw=payload,
            reasoning=reasoning if isinstance(reasoning, str) else None,
            input_tokens=int(usage.get("prompt_tokens") or 0) if isinstance(usage, dict) else 0,
            output_tokens=int(usage.get("completion_tokens") or 0) if isinstance(usage, dict) else 0,
        )

    def stream_complete(
        self,
        messages: list[dict[str, Any]],
        model: str | None = None,
        temperature: float = 0.2,
        top_p: float = 0.9,
        max_tokens: int = 2048,
        enable_thinking: bool = True,
    ) -> Iterator[LLMStreamChunk]:
        model_id, base_url, api_key = self._resolve_target(model)
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        payload: dict[str, Any] = {
            "model": model_id,
            "messages": messages,
            "temperature": temperature,
            "top_p": top_p,
            "max_tokens": max_tokens,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if model_id != get_settings().vl_llm_model_id:
            payload["chat_template_kwargs"] = {"enable_thinking": enable_thinking}

        try:
            with self.client.stream(
                "POST",
                f"{base_url}/chat/completions",
                headers=headers,
                json=payload,
                timeout=self.timeout_seconds,
            ) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if not line:
                        continue
                    if line.startswith("data:"):
                        line = line.removeprefix("data:").strip()
                    if line == "[DONE]":
                        break
                    try:
                        payload = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    usage = payload.get("usage") if isinstance(payload, dict) else {}
                    choice = (payload.get("choices") or [{}])[0] if isinstance(payload, dict) else {}
                    delta = choice.get("delta") or choice.get("message") or {}
                    content = delta.get("content") or ""
                    reasoning = delta.get("reasoning") or delta.get("reasoning_content") or ""
                    yield LLMStreamChunk(
                        content=content if isinstance(content, str) else "",
                        reasoning=reasoning if isinstance(reasoning, str) else "",
                        model=str(payload.get("model") or model_id) if isinstance(payload, dict) else model_id,
                        input_tokens=int(usage.get("prompt_tokens") or 0) if isinstance(usage, dict) else 0,
                        output_tokens=int(usage.get("completion_tokens") or 0) if isinstance(usage, dict) else 0,
                    )
        except httpx.HTTPError as exc:
            raise LLMClientError(f"LLM gateway streaming request failed: {exc}") from exc

    def tokenize(self, messages: list[dict[str, Any]], model: str | None = None) -> LLMTokenCount:
        model_id, base_url, api_key = self._resolve_target(model)
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        try:
            response = self.client.post(
                f"{base_url.removesuffix('/v1')}/tokenize",
                headers=headers,
                json={"model": model_id, "messages": messages},
                timeout=self.timeout_seconds,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise LLMClientError(f"LLM tokenize request failed: {exc}") from exc

        payload = response.json()
        try:
            return LLMTokenCount(count=int(payload["count"]), max_model_len=int(payload["max_model_len"]), model=model_id)
        except (KeyError, TypeError, ValueError) as exc:
            raise LLMClientError("LLM tokenize returned an invalid response shape") from exc

    def _resolve_model(self, model: str | None) -> str:
        return self._resolve_target(model)[0]

    def _resolve_target(self, model: str | None) -> tuple[str, str, str]:
        settings = get_settings()
        if model == settings.vl_llm_model_id:
            return settings.vl_llm_model_id, settings.vl_llm_api_base_url.rstrip("/"), settings.vl_llm_api_key
        if model in {None, "", "GLM 5.1", "glm-5.1", settings.llm_model_id}:
            return self.model_id, self.base_url, self.api_key
        return self.model_id, self.base_url, self.api_key


def get_llm_client() -> LLMClient:
    return LLMClient()
