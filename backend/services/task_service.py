import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.task import Task
from schemas.task import TaskCreateRequest, TaskUpdateRequest
from services.user_service import get_user_by_id


async def create_task_for_user(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    body: TaskCreateRequest,
) -> Task | None:
    owner = await get_user_by_id(session, user_id)
    if owner is None:
        return None

    task = Task(
        user_id=user_id,
        title=body.title.strip(),
        description=body.description,
        status=body.status,
        project=body.project.strip() if body.project else None,
        assigned_agent=body.assigned_agent,
    )
    session.add(task)
    await session.flush()
    await session.refresh(task)
    return task


async def list_tasks_for_user(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    project: str | None = None,
) -> list[Task]:
    stmt = select(Task).where(Task.user_id == user_id).order_by(Task.created_at.desc())
    if project is not None:
        stmt = stmt.where(Task.project == project)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_task_for_user(
    session: AsyncSession,
    *,
    task_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Task | None:
    result = await session.execute(
        select(Task).where(Task.id == task_id, Task.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def update_task(
    session: AsyncSession,
    *,
    task_id: uuid.UUID,
    user_id: uuid.UUID,
    body: TaskUpdateRequest,
) -> Task | None:
    task = await get_task_for_user(session, task_id=task_id, user_id=user_id)
    if task is None:
        return None

    if body.title is not None:
        task.title = body.title.strip()
    if body.description is not None:
        task.description = body.description
    if body.status is not None:
        task.status = body.status
    if body.project is not None:
        task.project = body.project.strip() or None
    if body.assigned_agent is not None:
        task.assigned_agent = body.assigned_agent or None

    await session.flush()
    await session.refresh(task)
    return task


async def delete_task(
    session: AsyncSession,
    *,
    task_id: uuid.UUID,
    user_id: uuid.UUID,
) -> bool:
    task = await get_task_for_user(session, task_id=task_id, user_id=user_id)
    if task is None:
        return False
    await session.delete(task)
    await session.flush()
    return True
