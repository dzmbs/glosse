# Glosse

> *gloss* (n.): a marginal note written alongside a text — a reader's
> commentary, not a rewrite.

**Glosse is a spoiler-aware AI reading companion for EPUBs.** It is an
opinionated alternative to "chat with your book" tools. Where those products
optimise for speed-to-answer, Glosse optimises for *depth of understanding*.

## The problem

Reading with an LLM today forces two bad tradeoffs:

1. **UX tradeoff** — you copy-paste between a reader tab and a chat tab,
   losing flow and context.
2. **Learning tradeoff** — the LLM does the cognitive work. You feel
   productive but build weaker mental models. This is sometimes called
   *cognitive debt*.

Existing tools (NotebookLM, Kindle "Ask this Book", generic PDF chat) treat a
book as a flat bag of chunks. Glosse treats it as a **temporal learning
path**: the reader has a position, and the assistant must respect it.

## The idea

Glosse has two engines:

- **Book intelligence engine** (`glosse/engine/`) — parses the EPUB into a
  chapter-indexed, chunked, embedded structure with a spoiler boundary. The
  rule is simple: if you are at chapter 8, retrieval can use chapters 1–8 and
  must not leak from 9+.
- **Agent orchestration engine** (`glosse/codex/`) — a Codex-powered agent
  that lives inside the reader. It gets the current chapter and selection,
  routes to the right *mode* (learning / discussion / technical / story /
  fast help), and picks a pedagogical action: explain, quiz, check, challenge.

Together they produce an assistant that is grounded in the current book,
aware of reading position, spoiler-safe by default, and learning-oriented
rather than output-oriented.

## Product line

> **Glosse helps you think, not think for you.**

## Architecture at a glance

```
glosse/
├── glosse/
│   ├── engine/     # EPUB → chunks → embeddings → spoiler-aware retrieval
│   ├── codex/      # Agent, tools, mode-specific system prompts
│   ├── server/     # FastAPI app: library, reader, /api/guide endpoint
│   └── cli.py      # `glosse ingest book.epub`
├── web/
│   ├── templates/  # library.html, reader.html (with Guide panel)
│   └── static/     # CSS, guide.js
└── data/books/     # ingested books (gitignored)
```

## Built on

- **reader3** by Andrej Karpathy — provides the EPUB parsing foundation. See
  `NOTICE.md` for full attribution.
- **Codex** / OpenAI Agents SDK — the agent runtime for the Guide panel.
- **FastAPI + Jinja2** — server-rendered reader with an interactive side
  panel.

## Status

Hackathon scaffold. The EPUB ingest and reader UI work end-to-end. The
chunking, embeddings, retrieval, and Codex agent modules are stubs with clear
contracts for the engine dev to fill in.
