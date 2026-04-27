"""Email agent tools — thin wrappers around services.gmail_client.

Each standalone ``tool_*`` function accepts an access_token and delegates to the Gmail
client. ``make_email_tools(access_token)`` returns a list of LangChain tools with the token
closed over so it never appears in the LLM's tool schema.
"""

import asyncio
import json
import logging
from typing import Any

from langchain_core.tools import tool

from config import get_settings
from services.gmail_client import (
    GMAIL_API_MAX_RESULTS_PER_REQUEST,
    GmailApiError,
    archive_email as _archive_email,
    create_draft as _create_draft,
    get_attachment as _get_attachment,
    get_email as _get_email,
    get_user_profile as _get_user_profile,
    list_emails as _list_emails,
    list_labels as _list_labels,
    mark_as_read as _mark_as_read,
    mark_as_unread as _mark_as_unread,
    reply_to_email as _reply_to_email,
    send_email as _send_email,
    trash_email as _trash_email,
)

logger = logging.getLogger(__name__)


# ── Standalone tool functions (kept for backward compat) ─────────────────


async def tool_get_email(access_token: str, message_id: str) -> dict[str, Any]:
    """Fetch a full email message by its ID."""
    return await _get_email(access_token, message_id)


async def tool_list_emails(
    access_token: str,
    *,
    query: str = "",
    max_results: int | None = None,
    page_token: str | None = None,
) -> dict[str, Any]:
    """Search / list emails. `query` uses Gmail search syntax (from:, subject:, label:, etc.)."""
    return await _list_emails(
        access_token,
        query=query,
        max_results=max_results,
        page_token=page_token,
    )


async def tool_send_email(
    access_token: str,
    to: str,
    subject: str,
    body: str,
) -> dict[str, Any]:
    """Compose and send an email."""
    return await _send_email(access_token, to, subject, body)


async def tool_reply_to_email(
    access_token: str,
    thread_id: str,
    message_id: str,
    to: str,
    subject: str,
    body: str,
) -> dict[str, Any]:
    """Reply to an existing email thread."""
    return await _reply_to_email(access_token, thread_id, message_id, to, subject, body)


async def tool_create_draft(
    access_token: str,
    to: str,
    subject: str,
    body: str,
) -> dict[str, Any]:
    """Save an email as a draft without sending."""
    return await _create_draft(access_token, to, subject, body)


async def tool_get_attachment(
    access_token: str,
    message_id: str,
    attachment_id: str,
) -> dict[str, Any]:
    """Download an attachment from a message. Returns base64-encoded data."""
    return await _get_attachment(access_token, message_id, attachment_id)


async def tool_mark_as_read(access_token: str, message_id: str) -> dict[str, Any]:
    """Mark an email as read (remove UNREAD label)."""
    return await _mark_as_read(access_token, message_id)


async def tool_mark_as_unread(access_token: str, message_id: str) -> dict[str, Any]:
    """Mark an email as unread (add UNREAD label)."""
    return await _mark_as_unread(access_token, message_id)


async def tool_archive_email(access_token: str, message_id: str) -> dict[str, Any]:
    """Archive an email (remove from INBOX)."""
    return await _archive_email(access_token, message_id)


async def tool_trash_email(access_token: str, message_id: str) -> dict[str, Any]:
    """Move an email to trash."""
    return await _trash_email(access_token, message_id)


async def tool_list_labels(access_token: str) -> dict[str, Any]:
    """List all Gmail labels (folders) for the authenticated user."""
    return await _list_labels(access_token)


async def tool_get_user_profile(access_token: str) -> dict[str, Any]:
    """Get the Gmail profile (email address, total messages, threads count)."""
    return await _get_user_profile(access_token)


# ── Pagination + enrichment helpers ──────────────────────────────────────


async def _paginate_emails(
    access_token: str,
    query: str,
    per_page: int,
    max_total: int,
) -> dict[str, Any]:
    """Fetch all pages of email list results up to max_total."""
    next_token: str | None = None
    all_stubs: list[dict[str, Any]] = []
    last_batch: dict[str, Any] = {}
    result_size_estimate: int | None = None

    while len(all_stubs) < max_total:
        page_size = min(per_page, GMAIL_API_MAX_RESULTS_PER_REQUEST, max_total - len(all_stubs))
        if page_size < 1:
            break
        last_batch = await _list_emails(
            access_token,
            query=query,
            max_results=page_size,
            page_token=next_token,
        )
        if result_size_estimate is None:
            result_size_estimate = last_batch.get("resultSizeEstimate")
        stubs = last_batch.get("messages", [])
        all_stubs.extend(stubs)
        next_token = last_batch.get("nextPageToken")
        if not next_token or not stubs:
            break

    merged: dict[str, Any] = {**last_batch} if last_batch else {}
    merged["messages"] = all_stubs
    merged["fetched_message_count"] = len(all_stubs)
    if result_size_estimate is not None:
        merged["resultSizeEstimate"] = result_size_estimate
    merged["nextPageToken"] = next_token
    if next_token:
        merged["list_truncated_at_message_cap"] = True
    return merged


async def _enrich_stubs(access_token: str, result: dict[str, Any]) -> dict[str, Any]:
    """Fetch full message bodies for email stubs in parallel (bounded concurrency)."""
    stubs = result.get("messages", [])
    if not stubs:
        return result

    settings = get_settings()
    cap = min(settings.gmail_list_max_enriched, len(stubs))
    to_enrich = stubs[:cap]
    remainder = stubs[cap:]
    semaphore = asyncio.Semaphore(max(1, settings.gmail_list_enrich_concurrency))

    async def fetch_one(stub: dict[str, Any]) -> dict[str, Any]:
        message_id = stub.get("id")
        if not message_id:
            return {**stub, "error": "Missing message id"}
        async with semaphore:
            try:
                return await _get_email(access_token, message_id)
            except Exception as exc:
                logger.warning("Failed to fetch email %s: %s", message_id, exc)
                return {"id": message_id, "threadId": stub.get("threadId"), "error": str(exc)}

    enriched = await asyncio.gather(*[fetch_one(s) for s in to_enrich if s.get("id")])
    result["messages"] = list(enriched) + remainder
    result["enriched"] = True
    result["enriched_count"] = len(enriched)
    if remainder:
        result["enrichment_omitted_count"] = len(remainder)
    return result


# ── LangChain tool factory ────────────────────────────────────────────────


def make_email_tools(access_token: str) -> list:
    """Return LangChain tools for Gmail with the access token closed over."""
    settings = get_settings()

    @tool
    async def list_emails(query: str = "", max_results: int = 20) -> str:
        """Search and list emails. query uses Gmail search syntax (from:, subject:, is:unread, newer_than:7d, label:, etc.).
        Fetches up to max_results emails with full message bodies. Keep max_results small (10-25)."""
        total_cap = min(max(1, max_results), settings.gmail_list_max_total_messages)
        per_page = min(total_cap, GMAIL_API_MAX_RESULTS_PER_REQUEST)
        result = await _paginate_emails(access_token, query, per_page, total_cap)
        result = await _enrich_stubs(access_token, result)
        return json.dumps(result, default=str)

    @tool
    async def get_email(message_id: str) -> str:
        """Fetch a full email message by its ID."""
        return json.dumps(await _get_email(access_token, message_id), default=str)

    @tool
    async def send_email(to: str, subject: str, body: str) -> str:
        """Send an email to the specified recipient."""
        return json.dumps(await _send_email(access_token, to, subject, body), default=str)

    @tool
    async def reply_to_email(
        thread_id: str,
        message_id: str,
        to: str,
        subject: str,
        body: str,
    ) -> str:
        """Reply to an existing email thread."""
        return json.dumps(
            await _reply_to_email(access_token, thread_id, message_id, to, subject, body),
            default=str,
        )

    @tool
    async def create_draft(to: str, subject: str, body: str) -> str:
        """Save an email as a draft without sending."""
        return json.dumps(await _create_draft(access_token, to, subject, body), default=str)

    @tool
    async def get_attachment(message_id: str, attachment_id: str) -> str:
        """Download an email attachment by message ID and attachment ID. Returns base64-encoded data."""
        return json.dumps(
            await _get_attachment(access_token, message_id, attachment_id), default=str
        )

    @tool
    async def mark_as_read(message_id: str) -> str:
        """Mark an email as read."""
        return json.dumps(await _mark_as_read(access_token, message_id), default=str)

    @tool
    async def mark_as_unread(message_id: str) -> str:
        """Mark an email as unread."""
        return json.dumps(await _mark_as_unread(access_token, message_id), default=str)

    @tool
    async def archive_email(message_id: str) -> str:
        """Archive an email (remove it from the inbox)."""
        return json.dumps(await _archive_email(access_token, message_id), default=str)

    @tool
    async def trash_email(message_id: str) -> str:
        """Move an email to trash."""
        return json.dumps(await _trash_email(access_token, message_id), default=str)

    @tool
    async def list_labels() -> str:
        """List all Gmail labels (folders) for the user."""
        return json.dumps(await _list_labels(access_token), default=str)

    @tool
    async def get_user_profile() -> str:
        """Get the user's Gmail profile: email address, message count, and thread count."""
        return json.dumps(await _get_user_profile(access_token), default=str)

    return [
        list_emails,
        get_email,
        send_email,
        reply_to_email,
        create_draft,
        get_attachment,
        mark_as_read,
        mark_as_unread,
        archive_email,
        trash_email,
        list_labels,
        get_user_profile,
    ]
