import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.conversation import Conversation
from schemas.conversation import ConversationSaveRequest
from services.user_service import get_user_by_id


def _messages_to_jsonable(body: ConversationSaveRequest) -> list[dict[str, str]]:
    return [message.model_dump() for message in body.messages]


async def save_conversation(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID | None,
    body: ConversationSaveRequest,
) -> Conversation | None:
    """Insert a new conversation or update an existing one for this user."""
    owner = await get_user_by_id(session, user_id)
    if owner is None:
        return None

    payload = _messages_to_jsonable(body)
    new_id = conversation_id or uuid.uuid4()

    if conversation_id is not None:
        existing = await get_conversation(session, user_id=user_id, conversation_id=conversation_id)
        if existing is not None:
            existing.messages = payload
            if body.title is not None:
                existing.title = body.title.strip() or None
            await session.flush()
            await session.refresh(existing)
            return existing

        row_with_same_id = await session.get(Conversation, conversation_id)
        if row_with_same_id is not None:
            # ids are global; another user already owns this conversation id
            return None

    title = body.title.strip() if body.title else None
    conversation = Conversation(
        id=new_id,
        user_id=user_id,
        title=title,
        messages=payload,
    )
    session.add(conversation)
    await session.flush()
    await session.refresh(conversation)
    return conversation


async def get_conversation(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID,
) -> Conversation | None:
    """Return a single conversation if it belongs to the user."""
    result = await session.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user_id,
        ),
    )
    return result.scalar_one_or_none()


async def list_conversations_for_user(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
) -> Sequence[Conversation]:
    """List all conversations for a user, most recently updated first."""
    result = await session.execute(
        select(Conversation)
        .where(Conversation.user_id == user_id)
        .order_by(Conversation.updated_at.desc()),
    )
    return result.scalars().all()
