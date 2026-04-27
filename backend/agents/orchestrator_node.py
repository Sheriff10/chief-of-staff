"""Orchestrator node — classify intents, route agents, merge results.

Three nodes:
  orchestrate_node   — classifies ALL intents from the user message → tasks list
  direct_reply_node  — general chat + background job scheduling (tool-calling loop)
  merge_results_node — combines parallel agent results into one final answer
"""

import json
import logging
import uuid
from datetime import datetime
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from agents.state import AgentState
from agents.tools.schedule_tool import (
    make_create_scheduled_job_tool,
    make_delete_scheduled_job_tool,
    make_stop_scheduled_job_tool,
)

logger = logging.getLogger(__name__)

ROUTE_DIRECT = "direct"
ROUTE_EMAIL = "email"
ROUTE_CALENDAR = "calendar"
ROUTE_NOTION = "notion"
VALID_ROUTES = {ROUTE_DIRECT, ROUTE_EMAIL, ROUTE_CALENDAR, ROUTE_NOTION}

MAX_TASKS_PER_MESSAGE = 5
MAX_DIRECT_TOOL_ROUNDS = 4

MARKDOWN_INSTRUCTION = "Format your entire response in clean markdown."
PLAIN_TEXT_VOICE_INSTRUCTION = (
    "The user is listening via text-to-speech. Respond in plain text only: "
    "no markdown (no **bold**, #-headings, `code`, bullet asterisks, tables, or link markup). "
    "Use short, natural sentences suitable for speech."
)

CLASSIFY_SYSTEM_PROMPT = """\
You are a routing classifier for a personal assistant.
Given the conversation, identify ALL distinct intents in the user's latest message.

A single message may contain multiple intents (e.g. "check my emails and what's on my calendar today").

Reply with ONLY a JSON object (no markdown, no extra text):
{{
  "tasks": [
    {{
      "intent": "<short description of what the user wants>",
      "route": "direct" | "email" | "calendar" | "notion"
    }}
  ]
}}

Rules:
- "direct"   → general chat, greetings, questions answerable without tools, and creating/managing recurring background automations (time-based digests, daily reminders, scheduled reports).
- "email"    → reading, sending, searching, drafting, replying to, archiving, or managing emails.
- "calendar" → viewing, creating, updating, deleting calendar events, checking meeting agendas.
- "notion"   → anything involving Notion pages, databases, notes, tasks, blocks, comments, or searching the Notion workspace.

If the message has multiple intents, return multiple objects in the "tasks" array.
If there is only one intent, return a single-element array.
Always return at least one task.

Today's date and time: {today}
"""

_MERGE_SYSTEM_PROMPT_TMPL = """\
You are a friendly personal assistant called Chief of Staff.
The user's request required multiple lookups that ran in parallel. Below are the results.
Combine them into a single, coherent, well-organized response. Present information naturally — do not say "here are the results from the lookups".
{fmt}
"""


def _get_today_string() -> str:
    return datetime.now().strftime("%A, %B %d, %Y %I:%M %p")


def _response_format_instruction(is_voice: bool) -> str:
    return PLAIN_TEXT_VOICE_INSTRUCTION if is_voice else MARKDOWN_INSTRUCTION


def _extract_json(text: str) -> dict[str, Any]:
    """Parse JSON from LLM output, stripping markdown fences if present."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = [l for l in cleaned.split("\n") if not l.strip().startswith("```")]
        cleaned = "\n".join(lines).strip()
    return json.loads(cleaned)


# ── Node functions ───────────────────────────────────────────────────────


async def orchestrate_node(state: AgentState, llm: ChatOpenAI) -> dict:
    """Classify all intents and produce the tasks list for fan-out."""
    messages: list[BaseMessage] = state.get("messages", [])
    today = _get_today_string()

    classification_messages = [
        SystemMessage(content=CLASSIFY_SYSTEM_PROMPT.format(today=today)),
        *messages,
    ]

    response = await llm.ainvoke(classification_messages)
    raw = response.content if isinstance(response.content, str) else ""
    logger.info("Intent classification raw: %s", raw)

    try:
        parsed = _extract_json(raw)
    except (json.JSONDecodeError, ValueError):
        logger.warning("Failed to parse classification, falling back to direct: %s", raw)
        parsed = {"tasks": [{"intent": "general chat", "route": ROUTE_DIRECT}]}

    raw_tasks = parsed.get("tasks") or [{"intent": "general chat", "route": ROUTE_DIRECT}]
    validated: list[dict[str, Any]] = []
    for task in raw_tasks[:MAX_TASKS_PER_MESSAGE]:
        route = task.get("route", ROUTE_DIRECT)
        if route not in VALID_ROUTES:
            route = ROUTE_DIRECT
        validated.append({"intent": task.get("intent", "general"), "route": route})

    if not validated:
        validated = [{"intent": "general chat", "route": ROUTE_DIRECT}]

    logger.info("Classified %d task(s): %s", len(validated), validated)
    return {"tasks": validated}


async def direct_reply_node(state: AgentState, llm: ChatOpenAI) -> dict:
    """Answer from conversation; use scheduling tools if the user wants a background automation."""
    task = state.get("current_task") or {}
    intent = task.get("intent", "")
    messages: list[BaseMessage] = list(state.get("messages", []))
    is_voice = state.get("is_voice_request", False)
    today = _get_today_string()
    fmt = _response_format_instruction(is_voice)

    system_text = (
        "You are a friendly, concise personal assistant called Chief of Staff. "
        "Answer based on the conversation. Be helpful and brief. "
        "You have the ability to remember information the user shares with you "
        "(name, preferences, goals) — it is saved automatically. "
        "When the user wants a recurring or time-based background task (daily digests, weekly rollups, scheduled reports), "
        "use the `create_scheduled_job` tool with a clear title, full instruction, IANA timezone, "
        "`schedule_starts_at` and `schedule_ends_at` (ISO-8601 UTC; never omit an end), "
        "5-field cron expression, and at least one `actions` entry. "
        "To pause a schedule use `stop_scheduled_job`; to remove it use `delete_scheduled_job`. "
        f"{fmt}\n"
        f"Today: {today}"
    )
    system = SystemMessage(content=system_text)

    db_session_raw = state.get("db_session")
    db_session = db_session_raw if isinstance(db_session_raw, AsyncSession) else None
    user_id = state.get("user_id")

    work_messages: list[BaseMessage] = [system, *messages]
    if intent:
        work_messages.append(HumanMessage(content=intent))

    if db_session is None or user_id is None or not isinstance(user_id, uuid.UUID):
        response = await llm.ainvoke(work_messages)
        text = response.content if isinstance(response.content, str) else ""
        return {"agent_results": [{"route": "direct", "intent": intent, "result": text}]}

    schedule_tools = [
        make_create_scheduled_job_tool(db_session, user_id),
        make_stop_scheduled_job_tool(db_session, user_id),
        make_delete_scheduled_job_tool(db_session, user_id),
    ]
    tools_by_name = {t.name: t for t in schedule_tools}
    llm_with_tools = llm.bind_tools(schedule_tools)

    for _ in range(MAX_DIRECT_TOOL_ROUNDS):
        response = await llm_with_tools.ainvoke(work_messages)
        if not isinstance(response, AIMessage) or not response.tool_calls:
            text = response.content if isinstance(response.content, str) else ""
            return {"agent_results": [{"route": "direct", "intent": intent, "result": text}]}

        work_messages.append(response)
        for call in response.tool_calls:
            tool_name = call.get("name", "")
            call_id = call.get("id", "")
            args = call.get("args") or {}
            target = tools_by_name.get(tool_name)
            output = await target.ainvoke(args) if target else f"Unknown tool: {tool_name}"
            work_messages.append(
                ToolMessage(
                    content=output if isinstance(output, str) else str(output),
                    tool_call_id=call_id,
                )
            )

    fallback = await llm.ainvoke([system, *messages])
    text = fallback.content if isinstance(fallback.content, str) else "I could not complete the request."
    return {"agent_results": [{"route": "direct", "intent": intent, "result": text}]}


async def merge_results_node(state: AgentState, llm: ChatOpenAI) -> dict:
    """Combine all parallel agent results into a single final answer."""
    results: list[dict] = state.get("agent_results") or []
    is_voice = state.get("is_voice_request", False)

    if not results:
        return {"final_answer": "I'm sorry, I couldn't process your request."}

    if len(results) == 1:
        return {"final_answer": results[0].get("result", "No result.")}

    parts = [
        f"--- Result {i} ({r.get('intent', 'unknown')}) ---\n{r.get('result', '')}"
        for i, r in enumerate(results, 1)
    ]
    combined = "\n\n".join(parts)
    fmt = _response_format_instruction(is_voice)

    messages: list[BaseMessage] = [
        SystemMessage(content=_MERGE_SYSTEM_PROMPT_TMPL.format(fmt=fmt)),
        *list(state.get("messages", [])),
        HumanMessage(content=f"Results to combine:\n\n{combined}"),
    ]

    response = await llm.ainvoke(messages)
    text = response.content if isinstance(response.content, str) else ""
    return {"final_answer": text}
