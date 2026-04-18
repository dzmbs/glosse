FROM python:3.12-slim

RUN pip install uv

WORKDIR /app

COPY pyproject.toml .
COPY glosse/ glosse/
COPY data/ data/

RUN uv pip install --system .

EXPOSE 8123

CMD uvicorn glosse.server.app:app --host 0.0.0.0 --port ${PORT:-8123}
