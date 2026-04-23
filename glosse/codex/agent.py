"""
Codex agent entry point.

Runs one turn of the guide loop using the OpenAI Chat Completions API with
function-calling. Falls back to OpenRouter on auth/connection failures.

The tool loop:
  1. Build system prompt from the active mode.
  2. Register retrieve_safe_chunks and get_current_passage, both closed over
     (book_id, current chapter, trusted progress) so the spoiler boundary
     travels with every call.
  3. Run the model; dispatch tool calls; feed results back.
  4. After the final assistant message, check that at least one retrieval tool
     was called when the user asked a book-content question. If not, append a
     safe refusal rather than returning an answer derived from parametric memory.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, List, Optional

from glosse.codex.modes import MODES, Mode
from glosse.codex.tools import (
    TOOL_SCHEMAS,
    get_current_passage,
    retrieve_chapter_scoped_chunks,
)

logger = logging.getLogger(__name__)

# Heuristic keywords that flag a question as book-content-specific.
_CONTENT_SIGNALS = (
    "who", "what", "when", "where", "why", "how", "does", "did", "is", "are",
    "was", "were", "explain", "describe", "tell me", "summarize", "character",
    "chapter", "plot", "happen", "mean", "passage", "author", "argue",
)


# --- IO types -------------------------------------------------------------


@dataclass
class GuideRequest:
    book_id: str
    chapter_index: int
    progress: Optional[int] = None
    mode: Mode = Mode.LEARNING
    action: str = "ask"
    selection: Optional[str] = None
    user_message: Optional[str] = None


@dataclass
class GuideResponse:
    text: str
    citations: List[dict] = field(default_factory=list)
    suggested: List[str] = field(default_factory=list)
    debug: dict = field(default_factory=dict)


# --- Tool dispatch --------------------------------------------------------


def _build_tools_for_openai() -> List[dict]:
    """Convert TOOL_SCHEMAS into the OpenAI function-calling format."""
    return [
        {
            "type": "function",
            "function": {
                "name": s["name"],
                "description": s["description"],
                "parameters": s["parameters"],
            },
        }
        for s in TOOL_SCHEMAS
    ]


def _dispatch_tool(
    name: str,
    args: dict,
    book_id: str,
    current_chapter_index: int,
    progress: int,
) -> Any:
    if name == "retrieve_safe_chunks":
        return retrieve_chapter_scoped_chunks(
            book_id=book_id,
            progress=progress,
            current_chapter_index=current_chapter_index,
            query=str(args.get("query", "")),
            k=args.get("k", 6),
        )
    if name == "get_current_passage":
        if current_chapter_index > progress:
            return {"error": "current chapter is outside the trusted progress boundary"}
        return get_current_passage(book_id=book_id, chapter_index=current_chapter_index)
    if name == "detect_spoiler_risk":
        from glosse.codex.tools import detect_spoiler_risk
        return detect_spoiler_risk(book_id=book_id, progress=progress, question=args.get("question", ""))
    return {"error": f"unknown tool: {name}"}


def _looks_like_content_question(text: str) -> bool:
    lower = text.lower()
    return any(sig in lower for sig in _CONTENT_SIGNALS)


# --- Agent loop -----------------------------------------------------------


def _run_loop(
    client,
    model: str,
    messages: list,
    tools: list,
    book_id: str,
    current_chapter_index: int,
    progress: int,
):
    """Run the tool loop until the model emits a final answer. Returns (final_text, used_tools, citations)."""
    used_tool_names: List[str] = []
    citations: List[dict] = []

    for _ in range(8):  # hard cap on turns
        resp = client.chat.completions.create(
            model=model,
            messages=messages,
            tools=tools,
            tool_choice="auto",
        )
        msg = resp.choices[0].message

        if msg.tool_calls:
            messages.append(msg)
            for tc in msg.tool_calls:
                name = tc.function.name
                try:
                    args = json.loads(tc.function.arguments or "{}")
                    if not isinstance(args, dict):
                        raise ValueError("tool arguments must be a JSON object")
                except (json.JSONDecodeError, ValueError) as exc:
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps({"error": f"invalid tool arguments: {exc}"}),
                    })
                    continue
                logger.info("tool call: %s(%s)", name, args)
                used_tool_names.append(name)

                result = _dispatch_tool(name, args, book_id, current_chapter_index, progress)

                # Collect retrieval results as citations.
                if name == "retrieve_safe_chunks" and isinstance(result, list):
                    citations.extend(result)

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result),
                })
        else:
            # Final text turn.
            return msg.content or "", used_tool_names, citations

    return "I was unable to produce an answer within the allowed steps.", used_tool_names, citations


# --- Entry point ----------------------------------------------------------


def run_guide(req: GuideRequest) -> GuideResponse:
    from glosse.codex.llm import get_chat_client, get_openrouter_client

    mode_spec = MODES[req.mode]
    progress = req.progress if req.progress is not None else req.chapter_index
    parts = []
    if req.action and req.action != "ask":
        parts.append(f"[{req.action.upper()}]")
    if req.selection:
        parts.append(f"Selected text: \"{req.selection}\"")
    if req.user_message:
        parts.append(req.user_message)
    
    no_user_input = not req.selection and not req.user_message
    if no_user_input and req.action == "explain":
        parts.append("Please retrieve the current passage and summarize or explain it.")
    elif no_user_input and req.action == "quiz":
        parts.append("Please retrieve the current passage and quiz me on what I've read so far.")
    elif no_user_input and req.action == "ask":
        parts.append("Please retrieve the current passage and answer who's who so far.")
    
    user_text = "\n".join(parts).strip()
    if not user_text:
        user_text = req.action

    system_prompt = mode_spec.system_prompt
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_text},
    ]
    tools = _build_tools_for_openai()

    provider = "openai"
    try:
        client, model = get_chat_client()
    except RuntimeError as e:
        return GuideResponse(
            text=f"Guide unavailable: {e}",
            suggested=mode_spec.default_actions,
        )

    try:
        text, used_tools, citations = _run_loop(
            client, model, messages, tools, req.book_id, req.chapter_index, progress
        )
    except Exception as exc:
        from openai import APIConnectionError, AuthenticationError

        status = getattr(exc, "status_code", None)
        is_fallback = (
            isinstance(exc, (AuthenticationError, APIConnectionError))
            or status in (401, 500, 502, 503, 504)
        )
        if not is_fallback:
            raise

        logger.warning("OpenAI failed (%s) — falling back to OpenRouter", exc)
        provider = "openrouter"
        try:
            client, model = get_openrouter_client()
        except RuntimeError as e:
            return GuideResponse(
                text=f"The guide is temporarily unavailable: {e}",
                suggested=mode_spec.default_actions,
            )

        # In the fallback path, inline top-k retrieved chunks into the system
        # prompt so the model doesn't need tool-calling to respect the spoiler
        # boundary (free Llama supports tool-calling, but this is belt+braces).
        citations = []
        try:
            safe_chunks = retrieve_chapter_scoped_chunks(
                book_id=req.book_id,
                progress=progress,
                current_chapter_index=req.chapter_index,
                query=user_text,
                k=6,
            )
            if safe_chunks:
                context_block = "\n\n".join(
                    f"[{c['section_path']}] {c['text']}" for c in safe_chunks
                )
                messages[0]["content"] += (
                    "\n\nRelevant passages from the book (use these; do not reference anything beyond them):\n\n"
                    + context_block
                )
                citations = safe_chunks
        except Exception as exc:
            logger.warning(
                "Failed to prefetch safe chunks for OpenRouter fallback; continuing without inlined context: %s",
                exc,
            )

        text, used_tools, extra_citations = _run_loop(
            client, model, messages, tools, req.book_id, req.chapter_index, progress
        )
        citations = citations or extra_citations

    # Enforcement check: book-content question with no retrieval tool called.
    retrieval_tools = {"retrieve_safe_chunks", "get_current_passage"}
    if (
        not req.selection
        and _looks_like_content_question(user_text)
        and not retrieval_tools.intersection(used_tools)
    ):
        logger.warning(
            "No retrieval tool called for content question — replacing answer with safe refusal"
        )
        text = (
            "I need to check the text before answering that. "
            "Could you rephrase your question so I know exactly what to look up?"
        )
        citations = []

    return GuideResponse(
        text=text,
        citations=citations,
        suggested=mode_spec.default_actions,
        debug={"provider": provider, "model": model, "tools_called": used_tools},
    )
