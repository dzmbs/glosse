"""
Reading progress, one integer per book.

Stored as a JSON file at `data/progress.json`:
    { "<book_id>": <chapter_index>, ... }

This is deliberately dumb — a single-user local app doesn't need a database.
If we grow to multi-user, swap this module for something sqlite-backed.
"""

from __future__ import annotations

import json
import os
from threading import Lock
from typing import Dict

from glosse.engine.storage import DATA_ROOT

PROGRESS_PATH = os.path.join(DATA_ROOT, "progress.json")
_LOCK = Lock()


def _read() -> Dict[str, int]:
    if not os.path.exists(PROGRESS_PATH):
        return {}
    try:
        with open(PROGRESS_PATH, encoding="utf-8") as f:
            raw = json.load(f)
        if not isinstance(raw, dict):
            return {}
        out: Dict[str, int] = {}
        for key, value in raw.items():
            try:
                out[str(key)] = int(value)
            except (TypeError, ValueError):
                continue
        return out
    except (OSError, json.JSONDecodeError):
        return {}


def _write(data: Dict[str, int]) -> None:
    os.makedirs(os.path.dirname(PROGRESS_PATH), exist_ok=True)
    tmp = PROGRESS_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f)
    os.replace(tmp, PROGRESS_PATH)


def get_progress(book_id: str) -> int:
    with _LOCK:
        return int(_read().get(book_id, 0))


def get_all_progress() -> Dict[str, int]:
    with _LOCK:
        return _read()


def set_progress(book_id: str, chapter_index: int) -> None:
    with _LOCK:
        data = _read()
        # Only advance — don't let flipping back through chapters rewind the
        # spoiler boundary. Reading chapter 5 after having read 10 does not
        # un-learn chapter 10.
        current = int(data.get(book_id, 0))
        if chapter_index > current:
            data[book_id] = int(chapter_index)
            _write(data)
