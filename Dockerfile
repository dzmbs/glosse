FROM python:3.12-slim

RUN pip install uv

WORKDIR /app

COPY pyproject.toml .
COPY README.md .
COPY glosse/ glosse/
COPY data/ data/
COPY start.py start.py

RUN uv pip install --system .

EXPOSE 8123

CMD ["python", "start.py"]
