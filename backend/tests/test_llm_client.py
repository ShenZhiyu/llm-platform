import httpx
import pytest

from app.services.llm_client import LLMClient, LLMClientError


def make_client(handler):
    transport = httpx.MockTransport(handler)
    http_client = httpx.Client(transport=transport)
    return LLMClient(base_url="http://llm.local/v1", api_key="dummy", model_id="glm-5.1", timeout_seconds=1, client=http_client)


def test_llm_client_reads_message_content():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer dummy"
        return httpx.Response(200, json={"choices": [{"message": {"content": "model answer"}}]})

    completion = make_client(handler).complete([{"role": "user", "content": "hello"}])

    assert completion.content == "model answer"
    assert completion.model == "glm-5.1"


def test_llm_client_uses_reasoning_when_content_is_null():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": [{"message": {"content": None, "reasoning": "reasoning answer"}}]})

    completion = make_client(handler).complete([{"role": "user", "content": "hello"}])

    assert completion.content == "reasoning answer"
    assert completion.reasoning == "reasoning answer"


def test_llm_client_raises_on_gateway_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": "unavailable"})

    with pytest.raises(LLMClientError):
        make_client(handler).complete([{"role": "user", "content": "hello"}])
