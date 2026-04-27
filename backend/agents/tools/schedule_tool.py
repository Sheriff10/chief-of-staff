"""Single orchestrator tool: persist a `BackgroundJob` (see services/background_job_service)."""

import json
import logging
import uuid
from typing import Any

from langchain_core.tools import StructuredTool
from sqlalchemy.ext.asyncio import AsyncSession

from schemas.background_jobs import (
    CreateScheduledJobToolArgs,
    DeleteScheduledJobToolArgs,
    StopScheduledJobToolArgs,
)
from services.background_job_service import (
    BackgroundJobInvalidStateError,
    BackgroundJobNotFoundError,
    create_scheduled_job,
    delete_scheduled_job,
    stop_scheduled_job,
)
from services.background_job_serialization import _iso

logger = logging.getLogger(__name__)

CREATE_SCHEDULED_JOB_TOOL_NAME = "create_scheduled_job"

CREATE_SCHEDULED_JOB_TOOL_DESCRIPTION = """\
Create a recurring **background job** the user can view under Background jobs in the app.
Call this when the user wants automation on a schedule (e.g. daily email digest, weekly Notion update).
You must pass a valid 5-field cron expression in the **job's IANA timezone** (minute hour day month weekday),
`schedule_starts_at` and `schedule_ends_at` as ISO-8601 instants in UTC (so the run does not continue without an end;
`schedule_ends_at` is exclusive—no run occurs at or after that instant; confirm dates with the user if unclear),
plus human-readable `schedule_description` and one or more `actions` (UI chips) with action_type: email, calendar, notion, or custom.
Do not call this for one-off requests with no repeat.
"""

STOP_SCHEDULED_JOB_TOOL_NAME = "stop_scheduled_job"

STOP_SCHEDULED_JOB_TOOL_DESCRIPTION = """\
Pause a **scheduled background job** so it will not run again until the user resumes it in the app (if that exists) or re-creates it.
Call when the user wants to turn off, pause, or stop an existing recurring automation. Requires the job's UUID.
Does not apply to one-off chat requests.

Raises an error if the user names a job you cannot look up; ask which schedule they mean and use list context if provided.
"""

DELETE_SCHEDULED_JOB_TOOL_NAME = "delete_scheduled_job"

DELETE_SCHEDULED_JOB_TOOL_DESCRIPTION = """\
Permanently **delete** a scheduled background job and its history.
Call when the user wants to remove, cancel forever, or delete a schedule. Requires the job's UUID. This cannot be undone.
"""


def make_create_scheduled_job_tool(
    session: AsyncSession,
    user_id: uuid.UUID,
) -> StructuredTool:
    """Bound tool — each chat request gets a new instance sharing the current DB session."""

    async def _invoke(**kwargs: Any) -> str:
        try:
            payload = CreateScheduledJobToolArgs(**kwargs)
        except Exception as exc:
            return json.dumps({"status": "error", "message": f"Invalid tool arguments: {exc}"})
        try:
            job = await create_scheduled_job(
                session,
                user_id,
                title=payload.title,
                instruction=payload.instruction,
                schedule_description=payload.schedule_description,
                timezone_name=payload.timezone,
                schedule_starts_at=payload.schedule_starts_at,
                schedule_ends_at=payload.schedule_ends_at,
                cron_expression=payload.cron_expression,
                actions=[dict(x) for x in payload.actions],
            )
        except ValueError as exc:
            logger.info("create_scheduled_job validation failed: %s", exc)
            return json.dumps({"status": "error", "message": str(exc)})

        return json.dumps(
            {
                "status": "created",
                "job_id": str(job.id),
                "title": job.title,
                "next_run_at": _iso(job.next_run_at),
            },
        )

    return StructuredTool.from_function(
        name=CREATE_SCHEDULED_JOB_TOOL_NAME,
        description=CREATE_SCHEDULED_JOB_TOOL_DESCRIPTION,
        coroutine=_invoke,
        args_schema=CreateScheduledJobToolArgs,
        infer_schema=False,
    )


def make_stop_scheduled_job_tool(
    session: AsyncSession,
    user_id: uuid.UUID,
) -> StructuredTool:
    async def _invoke(**kwargs: Any) -> str:
        try:
            payload = StopScheduledJobToolArgs(**kwargs)
        except Exception as exc:
            return json.dumps({"status": "error", "message": f"Invalid tool arguments: {exc}"})
        try:
            job = await stop_scheduled_job(session, user_id, payload.job_id)
        except BackgroundJobNotFoundError as exc:
            return json.dumps({"status": "error", "message": str(exc)})
        except BackgroundJobInvalidStateError as exc:
            return json.dumps({"status": "error", "message": str(exc)})

        return json.dumps(
            {
                "status": "stopped",
                "job_id": str(job.id),
                "title": job.title,
            },
        )

    return StructuredTool.from_function(
        name=STOP_SCHEDULED_JOB_TOOL_NAME,
        description=STOP_SCHEDULED_JOB_TOOL_DESCRIPTION,
        coroutine=_invoke,
        args_schema=StopScheduledJobToolArgs,
        infer_schema=False,
    )


def make_delete_scheduled_job_tool(
    session: AsyncSession,
    user_id: uuid.UUID,
) -> StructuredTool:
    async def _invoke(**kwargs: Any) -> str:
        try:
            payload = DeleteScheduledJobToolArgs(**kwargs)
        except Exception as exc:
            return json.dumps({"status": "error", "message": f"Invalid tool arguments: {exc}"})
        try:
            await delete_scheduled_job(session, user_id, payload.job_id)
        except BackgroundJobNotFoundError as exc:
            return json.dumps({"status": "error", "message": str(exc)})

        return json.dumps(
            {
                "status": "deleted",
                "job_id": str(payload.job_id),
            },
        )

    return StructuredTool.from_function(
        name=DELETE_SCHEDULED_JOB_TOOL_NAME,
        description=DELETE_SCHEDULED_JOB_TOOL_DESCRIPTION,
        coroutine=_invoke,
        args_schema=DeleteScheduledJobToolArgs,
        infer_schema=False,
    )
