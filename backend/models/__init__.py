"""SQLAlchemy ORM models (PostgreSQL). Import this module so metadata includes all tables."""

from lib.enums import MemoryCategory, TaskStatus
from models.background_job import BackgroundJob
from models.background_job_run import BackgroundJobRun
from models.conversation import Conversation
from models.task import Task
from models.user import User
from models.user_calendar_integration import UserCalendarIntegration
from models.user_gmail_integration import UserGmailIntegration
from models.user_integration import UserIntegration
from models.user_memory import UserMemory
from models.user_notion_integration import UserNotionIntegration
from models.user_notification import UserNotification
from models.user_profile import UserProfile

__all__ = [
    "BackgroundJob",
    "BackgroundJobRun",
    "Conversation",
    "MemoryCategory",
    "Task",
    "TaskStatus",
    "User",
    "UserCalendarIntegration",
    "UserGmailIntegration",
    "UserIntegration",
    "UserMemory",
    "UserNotionIntegration",
    "UserNotification",
    "UserProfile",
]
