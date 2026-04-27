"""Persistence for in-app user notifications."""

import uuid
from datetime import timezone
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from db.constants import MAX_NOTIFICATION_TITLE_LENGTH
from lib.enums import BackgroundJobRunOutcome, NotificationCategory
from models.user_notification import UserNotification

NOTIFICATION_JOB_BODY_SNIPPET_CHARS = 900


def user_notification_to_api_dict(row: UserNotification) -> dict[str, Any]:
    """Shape expected by the web app notifications list."""
    cat = row.category.value if hasattr(row.category, "value") else str(row.category)
    created = row.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    iso = created.isoformat().replace("+00:00", "Z")
    return {
        "id": str(row.id),
        "title": row.title,
        "body": row.body,
        "category": cat,
        "is_read": row.is_read,
        "created_at_iso": iso,
    }


class UserNotificationNotFoundError(ValueError):
    """No notification row for this user and id."""


def _truncate_body(text: str) -> str:
    text = text.strip()
    if len(text) <= NOTIFICATION_JOB_BODY_SNIPPET_CHARS:
        return text
    return text[: NOTIFICATION_JOB_BODY_SNIPPET_CHARS - 1].rstrip() + "…"


async def add_background_job_run_notification(
    session: AsyncSession,
    user_id: uuid.UUID,
    job_id: uuid.UUID,
    job_title: str,
    outcome: BackgroundJobRunOutcome,
    detail: str,
) -> UserNotification:
    """Record a schedule run result the user can read in the notifications inbox."""
    safe_title = job_title.strip() or "Scheduled job"
    if outcome == BackgroundJobRunOutcome.SUCCESS:
        title = f"Schedule completed: {safe_title}"
        body = _truncate_body(detail) if detail.strip() else "The run finished successfully."
    else:
        title = f"Schedule run failed: {safe_title}"
        body = _truncate_body(detail) if detail.strip() else "The run failed with no additional detail."

    row = UserNotification(
        user_id=user_id,
        category=NotificationCategory.BACKGROUND_JOB,
        title=title[:MAX_NOTIFICATION_TITLE_LENGTH],
        body=body,
        is_read=False,
        background_job_id=job_id,
    )
    session.add(row)
    await session.flush()
    await session.refresh(row)
    return row


async def list_notifications_for_user(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    limit: int = 100,
) -> list[UserNotification]:
    result = await session.execute(
        select(UserNotification)
        .where(UserNotification.user_id == user_id)
        .order_by(UserNotification.created_at.desc())
        .limit(limit),
    )
    return list(result.scalars().all())


async def mark_notification_read(
    session: AsyncSession,
    user_id: uuid.UUID,
    notification_id: uuid.UUID,
) -> None:
    result = await session.execute(
        select(UserNotification).where(
            UserNotification.id == notification_id,
            UserNotification.user_id == user_id,
        ),
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise UserNotificationNotFoundError("Notification not found.")
    if not row.is_read:
        row.is_read = True


async def mark_all_notifications_read(
    session: AsyncSession,
    user_id: uuid.UUID,
) -> int:
    """Set is_read on all unread rows; returns number of rows matched (best-effort)."""
    result = await session.execute(
        update(UserNotification)
        .where(UserNotification.user_id == user_id, UserNotification.is_read.is_(False))
        .values(is_read=True),
    )
    return int(result.rowcount or 0)


async def count_unread_for_user(session: AsyncSession, user_id: uuid.UUID) -> int:
    result = await session.execute(
        select(func.count())
        .select_from(UserNotification)
        .where(UserNotification.user_id == user_id, UserNotification.is_read.is_(False)),
    )
    return int(result.scalar_one() or 0)
