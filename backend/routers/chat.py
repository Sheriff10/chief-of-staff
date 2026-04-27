import uuid
from collections.abc import AsyncGenerator

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import get_current_user_id
from config import Settings, get_settings
from db.session import get_session
from schemas.chat import ChatCompletionRequest
from services.agent_runner import stream_chat_agent

chat_router = APIRouter(tags=["chat"])


@chat_router.post("/chat")
async def post_chat_completion(
    body: ChatCompletionRequest,
    background_tasks: BackgroundTasks,
    settings: Settings = Depends(get_settings),
    user_id: uuid.UUID = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    if not settings.openrouter_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OPENROUTER_API_KEY is not configured",
        )

    payloads = [m.model_dump() for m in body.messages]

    async def event_stream() -> AsyncGenerator[str, None]:
        async for chunk in stream_chat_agent(
            settings=settings,
            session=session,
            user_id=user_id,
            message_payloads=payloads,
            model=body.model,
            client_conversation_id=body.client_conversation_id,
            background_tasks=background_tasks,
        ):
            yield chunk

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
