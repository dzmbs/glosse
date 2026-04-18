"""
Codex agent entry point.

This module is intentionally thin. The engine dev will replace the body of
`run_guide` with a real agent loop — OpenAI Agents SDK, Codex CLI bridge,
or direct function-calling against the Chat Completions API.

Contract:

Input (`GuideRequest`):
    book_id        str
    chapter_index  int        -- the user's current chapter = progress
    mode           Mode
    action         str        -- "explain" | "quiz" | "check" | "ask"
    selection      str | None -- highlighted text, if any
    user_message   str | None -- free-form question (if action == "ask")

Output (`GuideResponse`):
    text           str        -- what to render in the Guide panel
    citations      list[dict] -- chunks the agent grounded the answer in
    suggested      list[str]  -- follow-up buttons to render

The server's /api/guide route calls `run_guide` and streams or returns the
result to the Guide panel.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

from glosse.codex.modes import MODES, Mode


# --- IO types -------------------------------------------------------------


@dataclass
class GuideRequest:
    book_id: str
    chapter_index: int
    mode: Mode = Mode.LEARNING
    action: str = "ask"
    selection: Optional[str] = None
    user_message: Optional[str] = None


@dataclass
class GuideResponse:
    text: str
    citations: List[dict] = field(default_factory=list)
    suggested: List[str] = field(default_factory=list)


# --- Entry point ----------------------------------------------------------


def run_guide(req: GuideRequest) -> GuideResponse:  # pragma: no cover
    """
    Run the Codex agent for one turn.

    TODO(engine): implement. A minimum viable version:

    1. Build the system prompt from MODES[req.mode].system_prompt.
    2. Build the user message from req.selection + req.user_message + action.
    3. Register the tools from glosse.codex.tools.TOOL_SCHEMAS, wiring each
       to the matching function (note `retrieve_safe_chunks` needs
       `book_id=req.book_id, progress=req.chapter_index` closed over).
    4. Run the model-tools loop until the model emits a final message.
    5. Wrap the final text and any chunks the agent pulled into
       GuideResponse.

    Until this is wired up, the scaffold returns a visible placeholder so
    the Guide panel has something to render during frontend work.
    """
    mode_spec = MODES[req.mode]
    preview = (req.user_message or req.selection or "").strip()
    preview = (preview[:200] + "…") if len(preview) > 200 else preview

    return GuideResponse(
        text=(
            f"[glosse scaffold, {mode_spec.label} mode]\n"
            f"Action: {req.action}. "
            f"Progress: chapter {req.chapter_index}.\n"
            f"Input: {preview or '(none)'}\n\n"
            f"The Codex agent is not wired up yet — see "
            f"glosse/codex/agent.py `run_guide`."
        ),
        citations=[],
        suggested=mode_spec.default_actions,
    )
