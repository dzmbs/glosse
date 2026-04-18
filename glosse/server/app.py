"""
FastAPI app entry point.

Run with:
    uv run glosse serve
    # or
    uv run uvicorn glosse.server.app:app --port 8123 --reload
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from glosse.engine.storage import scan_and_ingest_inbox
from glosse.server.routes import router

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_STATIC_DIR = os.path.join(_REPO_ROOT, "web", "static")


@asynccontextmanager
async def _lifespan(app: FastAPI):
    scan_and_ingest_inbox()
    yield


app = FastAPI(title="glosse", version="0.1.0", lifespan=_lifespan)
app.include_router(router)
app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")
