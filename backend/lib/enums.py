from enum import Enum


class TaskStatus(str, Enum):
    """Lifecycle state for a task."""

    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    DONE = "done"


class IntegrationProvider(str, Enum):
    """Third-party account the user may connect for Gmail, Calendar, or Notion."""

    GMAIL = "gmail"
    GOOGLE_CALENDAR = "google_calendar"
    NOTION = "notion"


class MemoryCategory(str, Enum):
    """Classification for stored user memory facts."""

    IDENTITY = "identity"
    PREFERENCE = "preference"
    GOAL = "goal"
    WORK = "work"
    EPISODIC = "episodic"


class BackgroundJobStatus(str, Enum):
    """User-visible lifecycle for a scheduled background job (matches UI copy)."""

    ACTIVE = "active"
    PAUSED = "paused"
    ENDED = "ended"


class BackgroundJobRunOutcome(str, Enum):
    """Result of a single scheduled execution."""

    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"


class NotificationCategory(str, Enum):
    """In-app notification bucket (mirrors the web app `NotificationCategory`)."""

    EMAIL = "email"
    CALENDAR = "calendar"
    AGENT = "agent"
    SYSTEM = "system"
    BACKGROUND_JOB = "background_job"
