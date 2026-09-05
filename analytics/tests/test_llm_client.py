"""OllamaClient against an injected httpx.MockTransport.

Nothing here reaches the network: CI never pulls or runs a model (design
delta D11), so every Ollama response in this repo's test suite is a stub.
"""

import json

import httpx
import pytest

from analytics.llm.client import OllamaClient, OllamaError


def tags_response(*names: str) -> httpx.Response:
    return httpx.Response(200, json={"models": [{"name": name} for name in names]})


def stubbed(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler), base_url="http://ollama:11434")


def test_has_model_is_true_when_the_tag_is_present():
    client = OllamaClient(
        "http://ollama:11434",
        "qwen3:4b",
        client=stubbed(lambda request: tags_response("gemma3:4b", "qwen3:4b")),
    )

    assert client.has_model() is True


def test_has_model_treats_an_untagged_name_as_latest():
    client = OllamaClient(
        "http://ollama:11434",
        "qwen3",
        client=stubbed(lambda request: tags_response("qwen3:latest")),
    )

    assert client.has_model() is True


def test_has_model_is_false_while_the_model_is_still_pulling():
    client = OllamaClient(
        "http://ollama:11434",
        "qwen3:4b",
        client=stubbed(lambda request: tags_response("gemma3:4b")),
    )

    assert client.has_model() is False


def test_has_model_is_false_when_ollama_is_not_running():
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("name or service not known", request=request)

    client = OllamaClient("http://ollama:11434", "qwen3:4b", client=stubbed(refuse))

    assert client.has_model() is False


def test_has_model_is_false_on_a_server_error():
    client = OllamaClient(
        "http://ollama:11434",
        "qwen3:4b",
        client=stubbed(lambda request: httpx.Response(500, text="boom")),
    )

    assert client.has_model() is False


def test_generate_posts_a_non_streaming_request_and_returns_the_text():
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"response": '{"version": 1}'})

    client = OllamaClient("http://ollama:11434", "qwen3:4b", client=stubbed(handler))

    assert client.generate("turn this into a plan") == '{"version": 1}'
    assert seen["url"] == "http://ollama:11434/api/generate"
    assert seen["body"] == {
        "model": "qwen3:4b",
        "prompt": "turn this into a plan",
        "stream": False,
        "think": False,
        "options": {"temperature": 0},
    }


def test_generate_forwards_a_json_schema_as_the_format_field():
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"response": "{}"})

    client = OllamaClient("http://ollama:11434", "qwen3:4b", client=stubbed(handler))
    schema = {"type": "object", "required": ["version"]}

    client.generate("prompt", json_schema=schema)

    assert seen["body"]["format"] == schema


def test_generate_raises_when_ollama_is_not_running():
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("name or service not known", request=request)

    client = OllamaClient("http://ollama:11434", "qwen3:4b", client=stubbed(refuse))

    with pytest.raises(OllamaError):
        client.generate("prompt")
