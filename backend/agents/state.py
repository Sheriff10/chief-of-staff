"""Shared state that flows through every node in the agent graph."""

import operator
import uuid
from typing import Annotated, Any

from langchain_core.messages import BaseMessage
from typing_extensions import TypedDict


class AgentState(TypedDict, total=False):
    """All nodes read from and write to this single dict."""

    # ── Session ───────────────────────────────────────────────────────────
    user_id: uuid.UUID
    db_session: Any
    settings: Any
    messages: list[BaseMessage]
    is_voice_request: bool
    memory_context: str

    # ── Pre-fetched OAuth tokens (Redis-cached before graph runs) ─────────
    gmail_access_token: str | None
    calendar_access_token: str | None
    notion_access_token: str | None

    # ── Orchestration ─────────────────────────────────────────────────────
    tasks: list[dict]   # [{intent: str, route: str}]
    current_task: dict  # per-Send sub-state, set by fan-out

    # ── Parallel agent results — operator.add merges from concurrent agents
    agent_results: Annotated[list[dict], operator.add]

    # ── Final output ──────────────────────────────────────────────────────
    final_answer: str
    error: str | None
