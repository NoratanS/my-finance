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
        """False for every reason interpretation could be unavailable — never raises."""
        try:
            response = self._client.get("/api/tags")
            response.raise_for_status()
        except httpx.HTTPError:
            return False
        wanted = _tagged(self.model)
        return any(
            _tagged(entry.get("name", "")) == wanted for entry in response.json().get("models", [])
        )

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
        except httpx.HTTPError as exc:
            raise OllamaError(str(exc)) from exc
        return response.json()["response"]


def get_ollama_client(
    settings: Annotated[Settings, Depends(get_settings)],
) -> OllamaClient | None:
    """FastAPI dependency. None means OLLAMA_URL is unset — this instance has no AI layer."""
    if not settings.ollama_url:
        return None
    return OllamaClient(settings.ollama_url, settings.ollama_model)
