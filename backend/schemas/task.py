import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from db.constants import (
    MAX_TASK_ASSIGNED_AGENT_LENGTH,
    MAX_TASK_DESCRIPTION_LENGTH,
    MAX_TASK_PROJECT_LENGTH,
    MAX_TASK_TITLE_LENGTH,
)
from lib.enums import TaskStatus


class TaskCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=MAX_TASK_TITLE_LENGTH)
    description: str | None = Field(default=None, max_length=MAX_TASK_DESCRIPTION_LENGTH)
    status: TaskStatus = TaskStatus.NOT_STARTED
    project: str | None = Field(default=None, max_length=MAX_TASK_PROJECT_LENGTH)
    assigned_agent: str | None = Field(default=None, max_length=MAX_TASK_ASSIGNED_AGENT_LENGTH)


class TaskUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=MAX_TASK_TITLE_LENGTH)
    description: str | None = Field(default=None, max_length=MAX_TASK_DESCRIPTION_LENGTH)
    status: TaskStatus | None = None
    project: str | None = Field(default=None, max_length=MAX_TASK_PROJECT_LENGTH)
    assigned_agent: str | None = Field(default=None, max_length=MAX_TASK_ASSIGNED_AGENT_LENGTH)


class TaskResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    description: str | None
    status: TaskStatus
    project: str | None
    assigned_agent: str | None
    created_at: datetime
