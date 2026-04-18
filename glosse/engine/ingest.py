"""
EPUB -> Book ingest.

Adapted from reader3 (MIT, Karpathy). Structural changes vs. the original:
- No CLI in this module; the CLI lives in glosse.cli.
- No pickling here; persistence is the job of glosse.engine.storage.
- Output directory layout matches glosse's data/books/<id>/ convention.
- Returns a Book dataclass the caller can hand to storage + chunking.
"""

from __future__ import annotations

import os
import shutil
from datetime import datetime
from typing import List
from urllib.parse import unquote

import ebooklib
from bs4 import BeautifulSoup, Comment
from ebooklib import epub

from glosse.engine.models import (
    Book,
    BookMetadata,
    ChapterContent,
    TOCEntry,
)

# --- HTML cleaning ---------------------------------------------------------


def _clean_html(soup: BeautifulSoup) -> BeautifulSoup:
    for tag in soup(["script", "style", "iframe", "video", "nav", "form", "button"]):
        tag.decompose()
    for comment in soup.find_all(string=lambda t: isinstance(t, Comment)):
        comment.extract()
    for tag in soup.find_all("input"):
        tag.decompose()
    return soup


def _plain_text(soup: BeautifulSoup) -> str:
    """Whitespace-normalised text for chunking and retrieval."""
    return " ".join(soup.get_text(separator=" ").split())


# --- TOC walking -----------------------------------------------------------


def _parse_toc(toc_list, depth: int = 0) -> List[TOCEntry]:
    result: List[TOCEntry] = []
    for item in toc_list:
        if isinstance(item, tuple):
            section, children = item
            result.append(
                TOCEntry(
                    title=section.title,
                    href=section.href,
                    file_href=section.href.split("#")[0],
                    anchor=section.href.split("#")[1] if "#" in section.href else "",
                    children=_parse_toc(children, depth + 1),
                )
            )
        elif isinstance(item, epub.Link):
            result.append(
                TOCEntry(
                    title=item.title,
                    href=item.href,
                    file_href=item.href.split("#")[0],
                    anchor=item.href.split("#")[1] if "#" in item.href else "",
                )
            )
        elif isinstance(item, epub.Section):
            result.append(
                TOCEntry(
                    title=item.title,
                    href=item.href,
                    file_href=item.href.split("#")[0],
                    anchor=item.href.split("#")[1] if "#" in item.href else "",
                )
            )
    return result


def _fallback_toc(book_obj) -> List[TOCEntry]:
    toc: List[TOCEntry] = []
    for item in book_obj.get_items():
        if item.get_type() == ebooklib.ITEM_DOCUMENT:
            name = item.get_name()
            title = name.replace(".html", "").replace(".xhtml", "").replace("_", " ").title()
            toc.append(TOCEntry(title=title, href=name, file_href=name, anchor=""))
    return toc


# --- Metadata --------------------------------------------------------------


def _extract_metadata(book_obj) -> BookMetadata:
    def get_list(key: str) -> List[str]:
        data = book_obj.get_metadata("DC", key)
        return [x[0] for x in data] if data else []

    def get_one(key: str):
        data = book_obj.get_metadata("DC", key)
        return data[0][0] if data else None

    return BookMetadata(
        title=get_one("title") or "Untitled",
        language=get_one("language") or "en",
        authors=get_list("creator"),
        description=get_one("description"),
        publisher=get_one("publisher"),
        date=get_one("date"),
        identifiers=get_list("identifier"),
        subjects=get_list("subject"),
    )


# --- Public API ------------------------------------------------------------


def ingest(epub_path: str, book_dir: str) -> Book:
    """
    Parse an EPUB and return a Book.

    Side effect: extracts images into `<book_dir>/images/`, creating (and
    wiping) that directory. The caller is responsible for persisting the
    Book itself via glosse.engine.storage.
    """
    if not os.path.exists(epub_path):
        raise FileNotFoundError(epub_path)

    print(f"[ingest] loading {epub_path}")
    book_obj = epub.read_epub(epub_path)

    metadata = _extract_metadata(book_obj)

    # Reset image dir
    images_dir = os.path.join(book_dir, "images")
    if os.path.exists(images_dir):
        shutil.rmtree(images_dir)
    os.makedirs(images_dir, exist_ok=True)

    # Extract images and build a rewrite map
    print("[ingest] extracting images")
    image_map: dict = {}
    for item in book_obj.get_items():
        if item.get_type() == ebooklib.ITEM_IMAGE:
            original_fname = os.path.basename(item.get_name())
            safe_fname = "".join(
                c for c in original_fname if c.isalnum() or c in "._-"
            ).strip()
            local_path = os.path.join(images_dir, safe_fname)
            with open(local_path, "wb") as f:
                f.write(item.get_content())
            rel = f"images/{safe_fname}"
            image_map[item.get_name()] = rel
            image_map[original_fname] = rel

    # TOC
    print("[ingest] parsing TOC")
    toc = _parse_toc(book_obj.toc)
    if not toc:
        print("[ingest] empty TOC, falling back to spine")
        toc = _fallback_toc(book_obj)

    # Spine -> cleaned chapters
    print("[ingest] processing chapters")
    spine: List[ChapterContent] = []
    for i, (item_id, _linear) in enumerate(book_obj.spine):
        item = book_obj.get_item_with_id(item_id)
        if not item or item.get_type() != ebooklib.ITEM_DOCUMENT:
            continue

        raw = item.get_content().decode("utf-8", errors="ignore")
        soup = BeautifulSoup(raw, "html.parser")

        # rewrite <img src>
        for img in soup.find_all("img"):
            src = img.get("src", "")
            if not src:
                continue
            src_decoded = unquote(src)
            filename = os.path.basename(src_decoded)
            if src_decoded in image_map:
                img["src"] = image_map[src_decoded]
            elif filename in image_map:
                img["src"] = image_map[filename]

        soup = _clean_html(soup)

        body = soup.find("body")
        final_html = "".join(str(x) for x in body.contents) if body else str(soup)

        spine.append(
            ChapterContent(
                id=item_id,
                href=item.get_name(),
                title=f"Section {i + 1}",
                content=final_html,
                text=_plain_text(soup),
                order=i,
            )
        )

    return Book(
        metadata=metadata,
        spine=spine,
        toc=toc,
        images=image_map,
        source_file=os.path.basename(epub_path),
        processed_at=datetime.now().isoformat(),
    )
