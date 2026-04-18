# glosse — dev convenience wrapper.
#
# `make dev` runs FastAPI and Next.js together. Stop with Ctrl+C.

.PHONY: dev api web ingest install

install:
	uv sync
	pnpm --prefix frontend install

api:
	uv run uvicorn glosse.server.app:app --port 8123 --reload

web:
	pnpm --prefix frontend dev

dev:
	@echo "Starting FastAPI on :8123 and Next.js on :3000"
	@echo "Press Ctrl+C to stop both."
	@trap 'kill 0' INT TERM; \
	  (uv run uvicorn glosse.server.app:app --port 8123 --reload & \
	   pnpm --prefix frontend dev & \
	   wait)

# Ingest an EPUB. Usage: make ingest EPUB=path/to/book.epub
ingest:
	@test -n "$(EPUB)" || (echo "Usage: make ingest EPUB=path/to/book.epub" && exit 1)
	uv run glosse ingest $(EPUB)
