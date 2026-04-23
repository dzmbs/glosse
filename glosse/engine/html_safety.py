"""HTML sanitization shared by ingest and API responses."""

from __future__ import annotations

from collections.abc import Iterable
from urllib.parse import urlsplit

from bs4 import BeautifulSoup, Comment

DANGEROUS_TAGS = {
    "script",
    "style",
    "iframe",
    "video",
    "nav",
    "form",
    "button",
    "input",
    "object",
    "embed",
}

URL_ATTRS = {
    "action",
    "formaction",
    "href",
    "poster",
    "src",
    "xlink:href",
}

SAFE_DATA_URI_ATTRS = {"src", "xlink:href"}
DANGEROUS_SCHEMES = {"javascript", "vbscript", "file"}


def sanitize_soup(soup: BeautifulSoup) -> BeautifulSoup:
    """Remove active content from a parsed EPUB HTML document or fragment."""
    for tag in soup(DANGEROUS_TAGS):
        tag.decompose()

    for comment in soup.find_all(string=lambda t: isinstance(t, Comment)):
        comment.extract()

    for tag in soup.find_all(True):
        for attr, value in list(tag.attrs.items()):
            attr_name = attr.lower()
            if attr_name.startswith("on") or attr_name == "srcdoc":
                del tag.attrs[attr]
                continue
            if attr_name in URL_ATTRS and _unsafe_url_attr(attr_name, value):
                del tag.attrs[attr]
                continue
            if attr_name == "style" and _unsafe_inline_style(value):
                del tag.attrs[attr]

    return soup


def sanitize_html_fragment(html: str) -> str:
    """Sanitize a stored chapter HTML fragment before it is sent to the UI."""
    soup = BeautifulSoup(html, "html.parser")
    sanitize_soup(soup)
    return "".join(str(child) for child in soup.contents)


def _attr_to_strings(value: object) -> Iterable[str]:
    if isinstance(value, (list, tuple)):
        return (str(v) for v in value)
    return (str(value),)


def _unsafe_url_attr(attr_name: str, value: object) -> bool:
    for raw in _attr_to_strings(value):
        normalized = raw.strip().replace("\x00", "")
        if not normalized:
            continue
        compact = "".join(ch for ch in normalized if ch not in "\t\r\n\f ")
        scheme = urlsplit(compact).scheme.lower()
        if scheme in DANGEROUS_SCHEMES:
            return True
        if scheme == "data" and attr_name not in SAFE_DATA_URI_ATTRS:
            return True
    return False


def _unsafe_inline_style(value: object) -> bool:
    style = " ".join(_attr_to_strings(value)).lower().replace("\x00", "")
    return "expression(" in style or "javascript:" in style or "vbscript:" in style
