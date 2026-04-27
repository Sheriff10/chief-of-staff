"""VoyageAI embedding generation — thin wrapper over the voyageai SDK."""

import logging

import voyageai

from config import Settings

logger = logging.getLogger(__name__)

_client: voyageai.AsyncClient | None = None


def init_embedding_client(settings: Settings) -> None:
    """Initialise the async VoyageAI client (call from app lifespan)."""
    global _client  # noqa: PLW0603
    if not settings.voyageai_api_key:
        logger.info("VOYAGEAI_API_KEY not set — embedding service disabled")
        return
    _client = voyageai.AsyncClient(api_key=settings.voyageai_api_key)
    logger.info("VoyageAI embedding client initialised (model=%s)", settings.voyageai_model)


async def generate_embedding(text: str, model: str) -> list[float]:
    """Embed a single text string and return the vector."""
    if _client is None:
        raise RuntimeError("VoyageAI client not initialised; set VOYAGEAI_API_KEY")

    result = await _client.embed([text], model=model)
    return result.embeddings[0]


async def generate_embeddings(texts: list[str], model: str) -> list[list[float]]:
    """Embed a batch of text strings and return their vectors."""
    if _client is None:
        raise RuntimeError("VoyageAI client not initialised; set VOYAGEAI_API_KEY")

    if not texts:
        return []

    result = await _client.embed(texts, model=model)
    return result.embeddings
