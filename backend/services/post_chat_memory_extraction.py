"""Post-response memory extraction — runs after the user receives the assistant reply.

Keeping this off the LangGraph critical path avoids an extra LLM round-trip blocking HTTP.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from agents.tools.memory_tool import add_memory_tool
from config import Settings, chat_llm

logger = logging.getLogger(__name__)

MEMORY_EXTRACTION_SYSTEM_PROMPT = """\
You are a memory extraction agent for a personal assistant called Chief of Staff.
Analyze the conversation and identify any new, stable facts about the user worth
remembering long-term.

For each fact, return a JSON array:
[
    {"text": "<1-2 sentence fact>", "category": "<category>"}
]

Categories:
- identity: name, location, role, personal details
- preference: communication style, format preferences, likes/dislikes
- goal: active goals, ongoing projects, aspirations
- work: job details, team, company, responsibilities
- episodic: notable events, experiences, interactions

Rules:
- Only extract stable, meaningful facts — not one-off questions or greetings.
- Keep each fact to 1-2 sentences maximum.
- If there are no new facts worth remembering, return an empty array: []
- Do NOT extract facts already present in the [USER BIO] or [RELEVANT MEMORY] \
sections of the conversation (those are already saved).
"""


def _extract_json_array(text: str) -> list[dict[str, Any]]:
    """Parse a JSON array from LLM output, tolerating markdown fences."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [line for line in lines if not line.strip().startswith("```")]
        cleaned = "\n".join(lines).strip()
    parsed = json.loads(cleaned)
    if isinstance(parsed, list):
        return parsed
    return []


def _conversation_text_from_payloads(
    message_payloads: list[dict[str, Any]],
    final_answer: str,
) -> str:
    lines: list[str] = []
    for message in message_payloads:
        role = message.get("role", "")
        content = message.get("content", "")
        if isinstance(content, str) and content:
            lines.append(f"{role}: {content}")
    if final_answer.strip():
        lines.append(f"assistant: {final_answer}")
    return "\n".join(lines)


async def run_post_chat_memory_extraction(
    session: AsyncSession,
    settings: Settings,
    user_id: uuid.UUID,
    message_payloads: list[dict[str, Any]],
    final_answer: str,
    *,
    extraction_llm: ChatOpenAI | None = None,
) -> None:
    """LLM scan + persist facts; caller owns transaction (commit/rollback)."""
    if not settings.database_url or not settings.voyageai_api_key:
        return

    conversation_text = _conversation_text_from_payloads(message_payloads, final_answer)
    if not conversation_text.strip():
        return

    llm = extraction_llm or chat_llm(settings)
    extraction_messages = [
        SystemMessage(content=MEMORY_EXTRACTION_SYSTEM_PROMPT),
        HumanMessage(content=conversation_text),
    ]

    try:
        response = await llm.ainvoke(extraction_messages)
        raw = response.content if isinstance(response.content, str) else "[]"
        facts = _extract_json_array(raw)
    except (json.JSONDecodeError, ValueError):
        logger.warning("Memory extraction returned non-JSON; skipping persist")
        return
    except Exception:
        logger.exception("Post-chat memory extraction LLM call failed for user %s", user_id)
        return

    for fact in facts:
        text = fact.get("text", "").strip()
        category = fact.get("category", "").strip()
        if not text or not category:
            continue
        try:
            await add_memory_tool(session, settings, user_id, text, category)
        except Exception:
            logger.warning("Failed to save extracted memory: %s", text, exc_info=True)


async def run_post_chat_memory_extraction_deferred(
    user_id: uuid.UUID,
    message_payloads: list[dict[str, Any]],
    final_answer: str,
) -> None:
    """Open a fresh DB session — for FastAPI BackgroundTasks after the response is sent."""
    from config import get_settings
    from db.session import get_async_session_maker

    settings = get_settings()
    if not settings.database_url or not settings.voyageai_api_key:
        return

    session_maker = get_async_session_maker()
    if session_maker is None:
        logger.warning("Deferred memory extraction skipped: database session factory missing")
        return

    async with session_maker() as session:
        try:
            await run_post_chat_memory_extraction(
                session,
                settings,
                user_id,
                message_payloads,
                final_answer,
            )
            await session.commit()
        except Exception:
            await session.rollback()
            logger.exception("Deferred post-chat memory extraction failed for user %s", user_id)
