"""
Chat-client factory.

Returns an (OpenAI client, model_id) pair. Tries OpenAI first; falls back to
OpenRouter on missing or invalid key. Both use the OpenAI SDK — OpenRouter
exposes an OpenAI-compatible endpoint.
"""

from __future__ import annotations

import os

from openai import OpenAI

OPENAI_MODEL = "gpt-4o-mini"
OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def get_chat_client() -> tuple[OpenAI, str]:
    """Return (client, model_id). Prefer OpenAI; fall back to OpenRouter."""
    if os.getenv("OPENAI_API_KEY"):
        return OpenAI(), OPENAI_MODEL
    if os.getenv("OPENROUTER_API_KEY"):
        return _openrouter_client(), OPENROUTER_MODEL
    raise RuntimeError(
        "No LLM key configured. Export OPENAI_API_KEY or OPENROUTER_API_KEY."
    )


def get_openrouter_client() -> tuple[OpenAI, str]:
    """Return an OpenRouter client unconditionally (used in fallback path)."""
    key = os.getenv("OPENROUTER_API_KEY")
    if not key:
        raise RuntimeError(
            "OpenAI request failed and OPENROUTER_API_KEY is not set — cannot fall back."
        )
    return _openrouter_client(), OPENROUTER_MODEL


def _openrouter_client() -> OpenAI:
    return OpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=os.environ["OPENROUTER_API_KEY"],
        default_headers={
            "HTTP-Referer": "http://localhost:8123",
            "X-Title": "Glosse",
        },
    )
