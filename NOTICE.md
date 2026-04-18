# Notice / Attribution

Glosse builds on top of **reader3** by Andrej Karpathy — a minimal, self-hosted
EPUB reader released under the MIT license.

- Source: <https://github.com/karpathy/reader3>
- Author's framing: "read books together with LLMs" —
  <https://x.com/karpathy/status/1990577951671509438>

The following parts of this codebase are derived from reader3 and carry its MIT
license:

- `glosse/engine/ingest.py` — EPUB parsing, TOC walking, HTML cleaning, image
  extraction. Structurally similar to `reader3.py`, with a few changes so it
  composes with glosse's storage and chunking pipeline.
- `glosse/engine/models.py` — the `ChapterContent`, `TOCEntry`, `BookMetadata`,
  and `Book` dataclasses are lifted from reader3 with minor extensions.
- `web/templates/library.html` and `web/templates/reader.html` — started life
  as reader3's templates and were extended with the Guide panel and progress
  tracking.

Everything else (the chunking / embedding / retrieval engine, Codex agent
orchestration, the mode system, the Guide panel, the spoiler-boundary logic)
is original to glosse.

The author of reader3 has stated he does not intend to maintain it; glosse is
not an official fork and is not endorsed by him.
