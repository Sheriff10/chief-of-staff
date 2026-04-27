"""In-app notifications for the authenticated user."""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import get_current_user_id
from db.dependencies import verify_database_ready
from db.session import get_session
from services.notification_service import (
    UserNotificationNotFoundError,
    count_unread_for_user,
    list_notifications_for_user,
    mark_all_notifications_read,
    mark_notification_read,
    user_notification_to_api_dict,
)

notifications_router = APIRouter(prefix="/notifications", tags=["notifications"])


@notifications_router.get("", dependencies=[Depends(verify_database_ready)])
async def get_notifications(
    user_id: uuid.UUID = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    rows = await list_notifications_for_user(session, user_id, limit=200)
    return [user_notification_to_api_dict(r) for r in rows]


@notifications_router.get("/unread-count", dependencies=[Depends(verify_database_ready)])
async def get_unread_notification_count(
    user_id: uuid.UUID = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> dict[str, int]:
    n = await count_unread_for_user(session, user_id)
    return {"count": n}


@notifications_router.post(
    "/{notification_id}/read",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(verify_database_ready)],
)
async def post_mark_notification_read(
    notification_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> None:
    try:
        await mark_notification_read(session, user_id, notification_id)
    except UserNotificationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@notifications_router.post(
    "/read-all",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(verify_database_ready)],
)
async def post_mark_all_notifications_read(
    user_id: uuid.UUID = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> None:
    await mark_all_notifications_read(session, user_id)
