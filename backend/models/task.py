import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum as SqlEnum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.base import Base
from db.constants import MAX_TASK_ASSIGNED_AGENT_LENGTH, MAX_TASK_PROJECT_LENGTH, MAX_TASK_TITLE_LENGTH
from lib.enums import TaskStatus

if TYPE_CHECKING:
    from models.user import User


class Task(Base):
    """Task owned by a single user."""

    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(MAX_TASK_TITLE_LENGTH))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[TaskStatus] = mapped_column(
        SqlEnum(TaskStatus, native_enum=False, length=32),
        default=TaskStatus.NOT_STARTED,
    )
    project: Mapped[str | None] = mapped_column(String(MAX_TASK_PROJECT_LENGTH), nullable=True)
    assigned_agent: Mapped[str | None] = mapped_column(String(MAX_TASK_ASSIGNED_AGENT_LENGTH), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    user: Mapped["User"] = relationship("User", back_populates="tasks")
