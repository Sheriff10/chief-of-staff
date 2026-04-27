import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from db.constants import MAX_CONVERSATION_TITLE_LENGTH, MAX_MESSAGES_PER_CONVERSATION
from schemas.chat import ChatMessage


class ConversationSaveRequest(BaseModel):
    """Create or replace a conversation's transcript for a user."""

    title: str | None = Field(default=None, max_length=MAX_CONVERSATION_TITLE_LENGTH)
    messages: list[ChatMessage] = Field(
        default_factory=list,
        max_length=MAX_MESSAGES_PER_CONVERSATION,
    )


class ConversationResponse(BaseModel):
    """Persisted conversation including message history."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    title: str | None
    messages: list[ChatMessage]
    created_at: datetime
    updated_at: datetime

    @field_validator("messages", mode="before")
    @classmethod
    def coerce_messages(cls, value: object) -> list[ChatMessage]:
        if not isinstance(value, list):
            return []
        if not value:
            return []
        first = value[0]
        if isinstance(first, ChatMessage):
            return list(value)  # type: ignore[list-item]
        if isinstance(first, dict):
            return [ChatMessage.model_validate(m) for m in value]  # type: ignore[arg-type]
        return []
