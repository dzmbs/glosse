"""
FastAPI app entry point — pure JSON API.

Run with:
    uv run glosse serve
    # or
    uv run uvicorn glosse.server.app:app --port 8123 --reload

Frontend (Next.js) runs on :3000 and proxies /api/* to this service via a
`next.config.ts` rewrite. CORS is permissive in dev so the frontend can
also hit the API directly during tests.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI

load_dotenv()
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402 — must come after load_dotenv()

from glosse.engine.storage import scan_and_ingest_inbox  # noqa: E402
from glosse.server.routes import router  # noqa: E402


@asynccontextmanager
async def _lifespan(app: FastAPI):
    scan_and_ingest_inbox()
    yield


app = FastAPI(title="glosse", version="0.1.0", lifespan=_lifespan)

_default_origins = "http://localhost:3000,http://127.0.0.1:3000"
_allowed_origins = [o.strip() for o in os.getenv("GLOSSE_ALLOWED_ORIGIN", _default_origins).split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
async def root():
    return {
        "name": "glosse",
        "version": "0.1.0",
        "frontend": "http://localhost:3000 (run `pnpm dev` in frontend/)",
        "docs": "/docs",
    }
