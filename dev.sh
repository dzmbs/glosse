#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

API_PID=""
WEB_PID=""

cleanup() {
  if [[ -n "${API_PID}" ]] && kill -0 "${API_PID}" 2>/dev/null; then
    kill "${API_PID}" 2>/dev/null || true
  fi

  if [[ -n "${WEB_PID}" ]] && kill -0 "${WEB_PID}" 2>/dev/null; then
    kill "${WEB_PID}" 2>/dev/null || true
  fi
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command uv
require_command npm

trap cleanup EXIT INT TERM

cd "${ROOT_DIR}"

echo "Starting FastAPI on http://localhost:8123"
uv run uvicorn glosse.server.app:app --port 8123 --reload &
API_PID=$!

echo "Starting Next.js on http://localhost:3000"
(cd frontend && npm run dev) &
WEB_PID=$!

echo
echo "Open http://localhost:3000"
echo "Press Ctrl+C to stop both services."

wait -n "${API_PID}" "${WEB_PID}"
