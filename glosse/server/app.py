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

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from glosse.engine.storage import scan_and_ingest_inbox
from glosse.server.routes import router


@asynccontextmanager
async def _lifespan(app: FastAPI):
    scan_and_ingest_inbox()
    yield


app = FastAPI(title="glosse", version="0.1.0", lifespan=_lifespan)

# Dev CORS. Tighten this when we ship.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
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
