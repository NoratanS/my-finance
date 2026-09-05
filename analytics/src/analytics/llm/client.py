"""Minimal Ollama HTTP client.

Only the two things the AI layer needs: is the configured model actually
present, and one non-streaming generation. The service keeps working with no
Ollama at all — every failure here degrades to "interpretation unavailable"
(docs/INSIGHTS.md "Capability detection").
"""

from __future__ import annotations

from typing import Annotated, Any

import httpx
from fastapi import Depends

from analytics.config import Settings, get_settings


class OllamaError(Exception):
    """Ollama did not answer: container absent, still starting, or model still pulling."""


def _tagged(model: str) -> str:
    """`qwen3` and `qwen3:latest` are the same model to Ollama; compare canonically."""
    return model if ":" in model else f"{model}:latest"


class OllamaClient:
    def __init__(self, base_url: str, model: str, *, client: httpx.Client | None = None) -> None:
        self.model = model
        # Connect fast, read slow: a missing `ai` profile must not stall the
        # capabilities probe (the backend gives it 10s), while generation on
        # CPU legitimately takes tens of seconds.
        self._client = client or httpx.Client(
            base_url=base_url, timeout=httpx.Timeout(60.0, connect=2.0)
        )

    def has_model(self) -> bool:
        """False for every reason interpretation could be unavailable — never raises.

        Two independent failure classes, handled two different ways. Connection failures and
        a non-2xx status are the only things `httpx.HTTPError` covers, so that's the only
        `except`. Everything after — a non-JSON body, valid JSON of an unexpected shape,
        `models` missing or not a list, an entry that isn't an object, a `name` that isn't a
        string — is walked with `isinstance` guards instead of a broader `except`, so it
        structurally cannot raise. A wider `except Exception` would also hide a real bug in
        this method (e.g. a typo in `.get(...)`) behind the same "model not found" result;
        the guards make every shape assumption explicit instead.
        """
        try:
            response = self._client.get("/api/tags")
            response.raise_for_status()
            body = response.json()
        except (httpx.HTTPError, ValueError):
            return False
        if not isinstance(body, dict):
            return False
        models = body.get("models")
        if not isinstance(models, list):
            return False
        wanted = _tagged(self.model)
        names = (entry.get("name") for entry in models if isinstance(entry, dict))
        return any(isinstance(name, str) and _tagged(name) == wanted for name in names)

    def generate(self, prompt: str, *, json_schema: dict[str, Any] | None = None) -> str:
        """One completion. `json_schema` constrains the emission to that shape."""
        # think/temperature match chat_json: the default qwen3 is a thinking model, and a
        # discarded trace costs CPU seconds on every caption; temperature 0 is what makes a
        # caption reproducible, which the local narration suite in Task 21 depends on.
        body: dict[str, Any] = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "think": False,
            "options": {"temperature": 0},
        }
        if json_schema is not None:
            body["format"] = json_schema
        try:
            response = self._client.post("/api/generate", json=body)
            response.raise_for_status()
            data = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise OllamaError(str(exc)) from exc
        if not isinstance(data, dict) or not isinstance(data.get("response"), str):
            raise OllamaError(f"unexpected response shape from Ollama: {data!r}")
        return data["response"]


def get_ollama_client(
    settings: Annotated[Settings, Depends(get_settings)],
) -> OllamaClient | None:
    """FastAPI dependency. None means OLLAMA_URL is unset — this instance has no AI layer."""
    if not settings.ollama_url:
        return None
    return OllamaClient(settings.ollama_url, settings.ollama_model)
