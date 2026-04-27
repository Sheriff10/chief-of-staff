"""Email agent node — agentic tool-calling loop over Gmail tools."""

import asyncio
import logging
from datetime import datetime

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI

from agents.state import AgentState
from agents.tools.email_agent_tools import make_email_tools

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 8
_MAX_TOOL_OUTPUT_CHARS = 30_000

EMAIL_SYSTEM_PROMPT = """\
You are an email assistant with full access to the user's Gmail account.
Use the available tools to fulfill the user's request completely.
- For listing emails: use list_emails with Gmail search syntax (from:, subject:, is:unread, newer_than:7d, etc.)
- For sending or replying: compose thoughtfully and confirm after sending
- Always present results in a clear, friendly, human-readable way
- For lists, show sender, subject, and a brief snippet for each email
- Do not make up information — only report what the tools return
{format_instruction}
Today: {today}
"""

MARKDOWN_INSTRUCTION = "Format your response in clean markdown."
PLAIN_TEXT_INSTRUCTION = (
    "The user is listening via text-to-speech. Use plain text only — "
    "no markdown, no bullet asterisks, no headers. Short natural sentences."
)


async def email_agent_node(state: AgentState, llm: ChatOpenAI) -> dict:
    """Run an agentic tool-calling loop to fulfill the email task."""
    task = state.get("current_task") or {}
    intent = task.get("intent", "")
    access_token = state.get("gmail_access_token")

    if not access_token:
        return {
            "agent_results": [{
                "route": "email",
                "intent": intent,
                "result": "Gmail is not connected. Please connect your Gmail account in Settings first.",
            }]
        }

    is_voice = state.get("is_voice_request", False)
    today = datetime.now().strftime("%A, %B %d, %Y %I:%M %p")
    fmt = PLAIN_TEXT_INSTRUCTION if is_voice else MARKDOWN_INSTRUCTION

    system = SystemMessage(content=EMAIL_SYSTEM_PROMPT.format(format_instruction=fmt, today=today))

    tools = make_email_tools(access_token)
    agent = llm.bind_tools(tools)
    tools_by_name = {t.name: t for t in tools}

    conversation = list(state.get("messages", []))
    work_messages = [system, *conversation, HumanMessage(content=intent)]

    for round_num in range(MAX_TOOL_ROUNDS):
        response = await agent.ainvoke(work_messages)
        work_messages.append(response)

        if not response.tool_calls:
            result = response.content if isinstance(response.content, str) else ""
            logger.info("Email agent completed in %d round(s)", round_num + 1)
            return {"agent_results": [{"route": "email", "intent": intent, "result": result}]}

        tool_results = await asyncio.gather(*[
            _invoke_tool(tools_by_name, call) for call in response.tool_calls
        ])
        work_messages.extend(tool_results)

    last = work_messages[-1]
    result = last.content if isinstance(last.content, str) else "Email request completed."
    logger.warning("Email agent hit max tool rounds (%d)", MAX_TOOL_ROUNDS)
    return {"agent_results": [{"route": "email", "intent": intent, "result": result}]}


async def _invoke_tool(tools_by_name: dict, call: dict) -> ToolMessage:
    name = call.get("name", "")
    call_id = call.get("id", "")
    args = call.get("args") or {}
    target = tools_by_name.get(name)
    try:
        output = await target.ainvoke(args) if target else f"Unknown tool: {name}"
    except Exception as exc:
        logger.error("Email tool %s failed: %s", name, exc)
        output = f"Tool error: {exc}"
    content = output if isinstance(output, str) else str(output)
    if len(content) > _MAX_TOOL_OUTPUT_CHARS:
        logger.warning("Email tool %s output truncated: %d → %d chars", name, len(content), _MAX_TOOL_OUTPUT_CHARS)
        content = content[:_MAX_TOOL_OUTPUT_CHARS] + "\n...[output truncated to fit context window]"
    return ToolMessage(content=content, tool_call_id=call_id)
