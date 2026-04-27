import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum as SqlEnum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.base import Base
from db.constants import MAX_NOTIFICATION_BODY_LENGTH, MAX_NOTIFICATION_TITLE_LENGTH
from lib.enums import NotificationCategory

if TYPE_CHECKING:
    from models.user import User


class UserNotification(Base):
    """A single in-app alert for a user (e.g. scheduled job finished or failed)."""

    __tablename__ = "user_notifications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category: Mapped[NotificationCategory] = mapped_column(
        SqlEnum(NotificationCategory, native_enum=False, length=32),
    )
    title: Mapped[str] = mapped_column(String(MAX_NOTIFICATION_TITLE_LENGTH))
    body: Mapped[str] = mapped_column(String(MAX_NOTIFICATION_BODY_LENGTH))
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True,
    )
    background_job_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("background_jobs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    user: Mapped["User"] = relationship("User", back_populates="notifications")
