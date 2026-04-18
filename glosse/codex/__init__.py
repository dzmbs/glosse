"""
Codex agent orchestration.

Not a chat wrapper. The Codex agent has tools: it can retrieve spoiler-safe
chunks from the book, inspect the current selection and chapter, and pick a
pedagogical action (explain / quiz / check / challenge) based on the mode
the reader is in.

Modules:
- modes.py    -- the mode enum + system prompts (implemented)
- tools.py    -- tool functions the agent calls into (stubs)
- agent.py    -- the entry point invoked by the /api/guide route (stub)
"""

from glosse.codex.modes import Mode, MODES

__all__ = ["Mode", "MODES"]
