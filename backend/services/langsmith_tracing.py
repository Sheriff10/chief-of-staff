"""Build LangGraph run configs that send traces to LangSmith when settings allow."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from langchain_core.runnables import RunnableConfig
from langchain_core.tracers.langchain import LangChainTracer
from langsmith import Client

from config import LANGSMITH_DEFAULT_PROJECT_NAME, Settings

logger = logging.getLogger(__name__)


def is_langsmith_tracing_active(settings: Settings) -> bool:
    return bool(settings.langsmith_tracing_enabled and settings.langsmith_api_key)


def build_agent_graph_run_config(
    settings: Settings,
    *,
    user_id: uuid.UUID,
    trace_tags: list[str] | None = None,
    trace_metadata: dict[str, Any] | None = None,
) -> RunnableConfig | None:
    """Return a RunnableConfig with a LangChainTracer, or None when tracing is off."""
    if not is_langsmith_tracing_active(settings):
        return None

    api_key = settings.langsmith_api_key
    if api_key is None:
        return None

    project_name = settings.langsmith_project or LANGSMITH_DEFAULT_PROJECT_NAME
    client_kwargs: dict[str, Any] = {"api_key": api_key}
    if settings.langsmith_api_url:
        client_kwargs["api_url"] = settings.langsmith_api_url

    client = Client(**client_kwargs)

    metadata: dict[str, Any] = {"user_id": str(user_id)}
    if trace_metadata:
        metadata.update(trace_metadata)
    metadata_str = {k: str(v) for k, v in metadata.items()}

    tags = list(trace_tags) if trace_tags else []

    tracer = LangChainTracer(
        client=client,
        project_name=project_name,
        tags=tags,
        metadata=metadata_str,
    )

    run_config: RunnableConfig = {
        "callbacks": [tracer],
        "metadata": metadata_str,
        "tags": tags,
    }
    logger.debug("LangSmith tracing enabled for user_id=%s project=%s", user_id, project_name)
    return run_config


def flush_langsmith_after_run(run_config: RunnableConfig | None) -> None:
    """Flush the per-run LangSmith client so traces are not dropped on short-lived workers."""
    if run_config is None:
        return
    callbacks = run_config.get("callbacks")
    if not callbacks:
        return
    for handler in callbacks:
        if isinstance(handler, LangChainTracer) and handler.client is not None:
            handler.client.flush()
            return
