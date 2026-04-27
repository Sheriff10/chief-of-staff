"""Shared LangGraph invocation for chat and voice endpoints."""

import asyncio
import json
import logging
import time
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import BackgroundTasks
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from sqlalchemy.ext.asyncio import AsyncSession

from agents.compiled_graph_cache import get_compiled_agent_graph
from agents.state import AgentState
from config import Settings
from models.background_job import BackgroundJob
from services.calendar_client import get_valid_access_token as get_valid_calendar_token
from services.calendar_integration_service import get_calendar_integration
from services.gmail_client import get_valid_access_token as get_valid_gmail_token
from services.gmail_integration_service import get_gmail_integration
from services.memory_service import (
    build_memory_prompt,
    check_or_start_session,
    get_user_bio,
    retrieve_memory,
)
from services.langsmith_tracing import (
    build_agent_graph_run_config,
    flush_langsmith_after_run,
)
from services.notion_integration_service import get_notion_integration
from services.post_chat_memory_extraction import (
    run_post_chat_memory_extraction,
    run_post_chat_memory_extraction_deferred,
)
from services.redis_client import get_redis

logger = logging.getLogger(__name__)

_MSG_MAP = {"system": SystemMessage, "user": HumanMessage, "assistant": AIMessage}

# Redis TTLs for cached OAuth tokens
_TOKEN_TTL_GOOGLE = 3300   # 55 min — Google tokens expire in 60 min
_TOKEN_TTL_NOTION = 86400  # 24 h  — Notion tokens are long-lived


def has_database(settings: Settings) -> bool:
    return bool(settings.database_url)


def has_google_credentials(settings: Settings) -> bool:
    return bool(settings.google_client_id and settings.google_client_secret)


def has_memory_system(settings: Settings) -> bool:
    return bool(settings.database_url and settings.voyageai_api_key)


async def load_memory_context(
    session: AsyncSession,
    settings: Settings,
    user_id: uuid.UUID,
    latest_user_message: str,
) -> str:
    """Fetch bio + memory chunks and format for system prompt injection."""
    await check_or_start_session(user_id)

    if latest_user_message.strip():
        bio, chunks = await asyncio.gather(
            get_user_bio(session, user_id),
            retrieve_memory(session, settings, user_id, latest_user_message),
        )
    else:
        bio = await get_user_bio(session, user_id)
        chunks = []

    return build_memory_prompt(bio, chunks)


def build_scheduled_job_user_payload(job: BackgroundJob) -> list[dict[str, Any]]:
    """Synthetic chat messages for a scheduler-triggered graph run."""
    actions_text = json.dumps(list(job.actions or []), ensure_ascii=False)
    return [
        {
            "role": "user",
            "content": (
                f"[Scheduled background job: {job.title}]\n\n{job.instruction}\n\n"
                f"Planned actions (chips; context only): {actions_text}"
            ),
        },
    ]


def extract_latest_user_message(payloads: list[dict[str, Any]]) -> str:
    for message in reversed(payloads):
        if message.get("role") == "user":
            content = message.get("content")
            return content if isinstance(content, str) else ""
    return ""


# ── Token helpers with Redis caching ─────────────────────────────────────


async def _get_cached_token(
    cache_key: str,
    ttl: int,
    fetch_fn,
) -> str | None:
    """Return a cached token from Redis, falling back to DB fetch on miss."""
    redis = get_redis()
    if redis:
        try:
            cached = await redis.get(cache_key)
            if cached:
                logger.debug("Token cache hit: %s", cache_key)
                return cached  # decode_responses=True returns str directly
        except Exception as exc:
            logger.warning("Redis token cache read failed (%s): %s", cache_key, exc)

    token = await fetch_fn()

    if token and redis:
        try:
            await redis.setex(cache_key, ttl, token)
            logger.debug("Token cached: %s (TTL %ds)", cache_key, ttl)
        except Exception as exc:
            logger.warning("Redis token cache write failed (%s): %s", cache_key, exc)

    return token


async def _fetch_gmail_access_token(
    session: AsyncSession,
    settings: Settings,
    user_id: uuid.UUID,
) -> str | None:
    if not has_google_credentials(settings):
        return None
    client_id = settings.google_client_id
    client_secret = settings.google_client_secret
    if not client_id or not client_secret:
        return None
    try:
        integration = await get_gmail_integration(session, user_id)
        if integration and integration.is_connected:
            return await get_valid_gmail_token(session, integration, client_id, client_secret)
    except Exception as exc:
        logger.warning("Could not fetch Gmail token for user %s: %s", user_id, exc)
    return None


async def _fetch_calendar_access_token(
    session: AsyncSession,
    settings: Settings,
    user_id: uuid.UUID,
) -> str | None:
    if not has_google_credentials(settings):
        return None
    client_id = settings.google_client_id
    client_secret = settings.google_client_secret
    if not client_id or not client_secret:
        return None
    try:
        integration = await get_calendar_integration(session, user_id)
        if integration and integration.is_connected:
            return await get_valid_calendar_token(session, integration, client_id, client_secret)
    except Exception as exc:
        logger.warning("Could not fetch Calendar token for user %s: %s", user_id, exc)
    return None


async def _fetch_notion_access_token(
    session: AsyncSession,
    user_id: uuid.UUID,
) -> str | None:
    try:
        integration = await get_notion_integration(session, user_id)
        if integration and integration.is_connected:
            return integration.access_token
    except Exception as exc:
        logger.warning("Could not fetch Notion token for user %s: %s", user_id, exc)
    return None


async def get_all_tokens(
    session: AsyncSession,
    settings: Settings,
    user_id: uuid.UUID,
) -> tuple[str | None, str | None, str | None]:
    """Fetch gmail, calendar, and notion tokens in parallel with Redis caching."""
    uid = str(user_id)
    gmail_key = f"cos:token:gmail:{uid}"
    calendar_key = f"cos:token:calendar:{uid}"
    notion_key = f"cos:token:notion:{uid}"

    gmail_token, calendar_token, notion_token = await asyncio.gather(
        _get_cached_token(
            gmail_key,
            _TOKEN_TTL_GOOGLE,
            lambda: _fetch_gmail_access_token(session, settings, user_id),
        ),
        _get_cached_token(
            calendar_key,
            _TOKEN_TTL_GOOGLE,
            lambda: _fetch_calendar_access_token(session, settings, user_id),
        ),
        _get_cached_token(
            notion_key,
            _TOKEN_TTL_NOTION,
            lambda: _fetch_notion_access_token(session, user_id),
        ),
    )
    return gmail_token, calendar_token, notion_token


async def invalidate_token_cache(user_id: uuid.UUID, provider: str) -> None:
    """Delete a cached token when an integration is disconnected."""
    redis = get_redis()
    if not redis:
        return
    key = f"cos:token:{provider}:{user_id}"
    try:
        await redis.delete(key)
        logger.info("Invalidated token cache: %s", key)
    except Exception as exc:
        logger.warning("Could not invalidate token cache %s: %s", key, exc)


# ── Graph invocation ──────────────────────────────────────────────────────


async def invoke_chat_agent_state(
    *,
    settings: Settings,
    session: AsyncSession,
    user_id: uuid.UUID,
    message_payloads: list[dict[str, Any]],
    model: str | None = None,
    is_voice_request: bool = False,
    inline_memory_extraction: bool = False,
    trace_tags: list[str] | None = None,
    trace_metadata: dict[str, Any] | None = None,
) -> AgentState:
    """Build initial state, run the compiled graph, return terminal state."""
    resolved_model = model or settings.openrouter_default_model

    messages = [_MSG_MAP[m["role"]](content=m["content"]) for m in message_payloads]

    memory_context = ""
    if has_memory_system(settings):
        try:
            latest_user_text = extract_latest_user_message(message_payloads)
            memory_context = await load_memory_context(session, settings, user_id, latest_user_text)
            if memory_context:
                messages.insert(0, SystemMessage(content=memory_context))
        except Exception as exc:
            logger.warning("Memory injection failed for user %s: %s", user_id, exc)

    gmail_access_token: str | None = None
    calendar_access_token: str | None = None
    notion_access_token: str | None = None

    if has_database(settings):
        gmail_access_token, calendar_access_token, notion_access_token = await get_all_tokens(
            session, settings, user_id
        )

    db_for_state = session if has_database(settings) else None
    settings_for_state = settings if has_database(settings) else None

    initial_state: AgentState = {
        "user_id": user_id,
        "db_session": db_for_state,
        "settings": settings_for_state,
        "messages": messages,
        "is_voice_request": is_voice_request,
        "memory_context": memory_context,
        "gmail_access_token": gmail_access_token,
        "calendar_access_token": calendar_access_token,
        "notion_access_token": notion_access_token,
    }

    graph = get_compiled_agent_graph(resolved_model)
    run_config = build_agent_graph_run_config(
        settings,
        user_id=user_id,
        trace_tags=trace_tags,
        trace_metadata=trace_metadata,
    )
    try:
        result_state = await graph.ainvoke(initial_state, run_config)
    finally:
        flush_langsmith_after_run(run_config)

    if inline_memory_extraction and has_memory_system(settings) and has_database(settings):
        final_text = result_state.get("final_answer", "")
        if final_text.strip():
            await run_post_chat_memory_extraction(
                session,
                settings,
                user_id,
                message_payloads,
                final_text,
            )

    return result_state


async def run_chat_agent(
    *,
    settings: Settings,
    session: AsyncSession,
    user_id: uuid.UUID,
    message_payloads: list[dict[str, Any]],
    model: str | None = None,
    is_voice_request: bool = False,
    client_conversation_id: str | None = None,
    background_tasks: BackgroundTasks | None = None,
) -> str:
    """Run the Chief of Staff graph and return the assistant reply text."""
    if client_conversation_id:
        logger.info(
            "Starting chat agent run user=%s client_conversation_id=%s voice=%s",
            user_id,
            client_conversation_id,
            is_voice_request,
        )
    trace_tags = ["voice"] if is_voice_request else ["chat"]
    trace_metadata: dict[str, Any] | None = None
    if client_conversation_id:
        trace_metadata = {"client_conversation_id": client_conversation_id}

    result_state = await invoke_chat_agent_state(
        settings=settings,
        session=session,
        user_id=user_id,
        message_payloads=message_payloads,
        model=model,
        is_voice_request=is_voice_request,
        inline_memory_extraction=False,
        trace_tags=trace_tags,
        trace_metadata=trace_metadata,
    )

    final_answer = result_state.get("final_answer", "")
    if not final_answer:
        final_answer = result_state.get("error", "Sorry, something went wrong.")

    if (
        background_tasks is not None
        and has_memory_system(settings)
        and has_database(settings)
        and final_answer.strip()
    ):
        background_tasks.add_task(
            run_post_chat_memory_extraction_deferred,
            user_id,
            message_payloads,
            final_answer,
        )

    return final_answer


# ── SSE streaming ─────────────────────────────────────────────────────────

_NODE_STATUS_MESSAGES: dict[str, str] = {
    "orchestrate": "Figuring out what you need...",
    "email_agent": "Fetching your emails...",
    "calendar_agent": "Checking your calendar...",
    "notion_agent": "Searching Notion...",
    "direct_reply": "Composing a reply...",
    "merge_results": "Putting it all together...",
}


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


async def stream_chat_agent(
    *,
    settings: Settings,
    session: AsyncSession,
    user_id: uuid.UUID,
    message_payloads: list[dict[str, Any]],
    model: str | None = None,
    client_conversation_id: str | None = None,
    background_tasks: BackgroundTasks | None = None,
) -> AsyncGenerator[str, None]:
    """Yield SSE events while running the chat agent.

    Event shapes:
      {"type": "status",  "message": "..."}
      {"type": "done",    "content": "...", "elapsed": <seconds>}
      {"type": "error",   "message": "..."}
    """
    start_time = time.monotonic()

    if client_conversation_id:
        logger.info(
            "Starting streaming chat run user=%s conversation=%s",
            user_id,
            client_conversation_id,
        )

    yield _sse({"type": "status", "message": "Thinking..."})

    trace_tags = ["chat"]
    trace_metadata: dict[str, Any] | None = (
        {"client_conversation_id": client_conversation_id} if client_conversation_id else None
    )

    resolved_model = model or settings.openrouter_default_model
    messages = [_MSG_MAP[m["role"]](content=m["content"]) for m in message_payloads]

    memory_context = ""
    if has_memory_system(settings):
        try:
            latest_user_text = extract_latest_user_message(message_payloads)
            memory_context = await load_memory_context(session, settings, user_id, latest_user_text)
            if memory_context:
                messages.insert(0, SystemMessage(content=memory_context))
        except Exception as exc:
            logger.warning("Memory injection failed for user %s: %s", user_id, exc)

    gmail_access_token = calendar_access_token = notion_access_token = None
    if has_database(settings):
        gmail_access_token, calendar_access_token, notion_access_token = await get_all_tokens(
            session, settings, user_id
        )

    db_for_state = session if has_database(settings) else None
    settings_for_state = settings if has_database(settings) else None

    initial_state: AgentState = {
        "user_id": user_id,
        "db_session": db_for_state,
        "settings": settings_for_state,
        "messages": messages,
        "is_voice_request": False,
        "memory_context": memory_context,
        "gmail_access_token": gmail_access_token,
        "calendar_access_token": calendar_access_token,
        "notion_access_token": notion_access_token,
    }

    graph = get_compiled_agent_graph(resolved_model)
    run_config = build_agent_graph_run_config(
        settings,
        user_id=user_id,
        trace_tags=trace_tags,
        trace_metadata=trace_metadata,
    )

    final_answer = ""
    seen_nodes: set[str] = set()

    try:
        async for event in graph.astream_events(initial_state, run_config, version="v2"):
            ev_type = event.get("event", "")
            node = event.get("metadata", {}).get("langgraph_node", "")

            if (
                ev_type == "on_chain_start"
                and node in _NODE_STATUS_MESSAGES
                and node not in seen_nodes
            ):
                seen_nodes.add(node)
                yield _sse({"type": "status", "message": _NODE_STATUS_MESSAGES[node]})

            if ev_type == "on_chain_end":
                output = event.get("data", {}).get("output", {})
                if isinstance(output, dict):
                    answer = output.get("final_answer")
                    if answer:
                        final_answer = answer

    except Exception as exc:
        logger.error("Streaming agent error for user %s: %s", user_id, exc)
        yield _sse({"type": "error", "message": "Something went wrong. Please try again."})
        return
    finally:
        flush_langsmith_after_run(run_config)

    if not final_answer:
        final_answer = "Sorry, something went wrong."

    elapsed = round(time.monotonic() - start_time)
    yield _sse({"type": "done", "content": final_answer, "elapsed": elapsed})

    if (
        background_tasks is not None
        and has_memory_system(settings)
        and has_database(settings)
        and final_answer.strip()
    ):
        background_tasks.add_task(
            run_post_chat_memory_extraction_deferred,
            user_id,
            message_payloads,
            final_answer,
        )
