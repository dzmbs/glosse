"""
FastAPI app entry point.

Run with:
    uv run glosse serve
    # or
    uv run uvicorn glosse.server.app:app --port 8123 --reload
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from glosse.server.routes import router

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_STATIC_DIR = os.path.join(_REPO_ROOT, "web", "static")

app = FastAPI(title="glosse", version="0.1.0")
app.include_router(router)
app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")
