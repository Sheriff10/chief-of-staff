"""Core memory operations — DB persistence, vector search, and Redis caching.

This module owns the full lifecycle of user memories and bio caching.
External code should call these functions rather than touching the DB or
Redis keys directly.
"""

import json
import logging
import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from config import Settings
from lib.enums import MemoryCategory
from models.user_memory import UserMemory
from models.user_profile import UserProfile
from services.embedding_service import generate_embedding
from services.redis_client import get_redis

logger = logging.getLogger(__name__)

# ── Redis key helpers ─────────────────────────────────────────────────────

BIO_CACHE_TTL_SECONDS = 86_400  # 24 hours
SESSION_IDLE_TIMEOUT_SECONDS = 1_800  # 30 minutes
TOP_MEMORY_CHUNKS = 8
MAX_INJECTED_TOKENS = 600
APPROX_CHARS_PER_TOKEN = 4  # conservative estimate for English text


def _bio_key(user_id: uuid.UUID) -> str:
    return f"memory:user:{user_id}:bio"


def _chunks_key(user_id: uuid.UUID) -> str:
    return f"memory:user:{user_id}:chunks"


def _session_key(user_id: uuid.UUID) -> str:
    return f"memory:user:{user_id}:session_id"


# ── Session management ────────────────────────────────────────────────────


async def check_or_start_session(user_id: uuid.UUID) -> bool:
    """Return True when a *new* session has started (caches should refresh).

    A session expires after SESSION_IDLE_TIMEOUT_SECONDS of inactivity.
    If no Redis is available we always treat the request as a fresh session
    so that data is fetched from Postgres on every first message.
    """
    redis_client = get_redis()
    if redis_client is None:
        return True

    current_session = await redis_client.get(_session_key(user_id))
    if current_session is not None:
        await redis_client.expire(_session_key(user_id), SESSION_IDLE_TIMEOUT_SECONDS)
        await redis_client.expire(_chunks_key(user_id), SESSION_IDLE_TIMEOUT_SECONDS)
        return False

    new_session_id = str(uuid.uuid4())
    await redis_client.set(
        _session_key(user_id), new_session_id, ex=SESSION_IDLE_TIMEOUT_SECONDS,
    )
    await redis_client.delete(_chunks_key(user_id))
    return True


# ── Bio retrieval (cache-first) ──────────────────────────────────────────


async def get_user_bio(
    session: AsyncSession,
    user_id: uuid.UUID,
) -> str | None:
    """Fetch the user's bio, preferring the Redis cache."""
    redis_client = get_redis()
    if redis_client is not None:
        cached = await redis_client.get(_bio_key(user_id))
        if cached is not None:
            return cached

    result = await session.execute(
        select(UserProfile.bio).where(UserProfile.user_id == user_id),
    )
    bio = result.scalar_one_or_none()

    if redis_client is not None and bio:
        await redis_client.set(_bio_key(user_id), bio, ex=BIO_CACHE_TTL_SECONDS)

    return bio


# ── Memory retrieval (cache-first, pgvector fallback) ─────────────────────


async def retrieve_memory(
    session: AsyncSession,
    settings: Settings,
    user_id: uuid.UUID,
    query: str,
) -> list[str]:
    """Return the most relevant memory chunks for *query*.

    Checks Redis first; on cache miss, runs a pgvector cosine-similarity
    search and caches the result with session-scoped TTL.
    """
    redis_client = get_redis()
    if redis_client is not None:
        cached = await redis_client.get(_chunks_key(user_id))
        if cached is not None:
            return json.loads(cached)

    query_embedding = await generate_embedding(query, model=settings.voyageai_model)

    result = await session.execute(
        select(UserMemory.text)
        .where(UserMemory.user_id == user_id, UserMemory.is_active.is_(True))
        .order_by(UserMemory.embedding.cosine_distance(query_embedding))
        .limit(TOP_MEMORY_CHUNKS),
    )
    chunks = [row[0] for row in result.all()]

    if redis_client is not None and chunks:
        await redis_client.set(
            _chunks_key(user_id),
            json.dumps(chunks),
            ex=SESSION_IDLE_TIMEOUT_SECONDS,
        )

    return chunks


# ── Memory insertion ──────────────────────────────────────────────────────


async def add_memory(
    session: AsyncSession,
    settings: Settings,
    user_id: uuid.UUID,
    text: str,
    category: MemoryCategory,
) -> UserMemory:
    """Embed *text* via VoyageAI, persist to Postgres, and append to Redis cache."""
    embedding = await generate_embedding(text, model=settings.voyageai_model)

    memory = UserMemory(
        user_id=user_id,
        text=text,
        embedding=embedding,
        category=category.value,
        is_active=True,
    )
    session.add(memory)
    await session.flush()
    await session.refresh(memory)

    redis_client = get_redis()
    if redis_client is not None:
        cached_raw = await redis_client.get(_chunks_key(user_id))
        if cached_raw is not None:
            existing: list[str] = json.loads(cached_raw)
            existing.append(text)
            ttl = await redis_client.ttl(_chunks_key(user_id))
            if ttl > 0:
                await redis_client.set(
                    _chunks_key(user_id), json.dumps(existing), ex=ttl,
                )

    logger.info("Saved memory %s for user %s [%s]", memory.id, user_id, category.value)
    return memory


# ── Memory deduplication ──────────────────────────────────────────────────

DEDUP_SIMILARITY_THRESHOLD = 0.92


async def deduplicate_memories(
    session: AsyncSession,
    user_id: uuid.UUID,
) -> int:
    """Soft-delete semantically duplicate memories for *user_id*.

    Keeps the most recent (first encountered when sorted desc by created_at)
    and deactivates older near-duplicates above the cosine threshold.
    Returns the count of deactivated rows.
    """
    result = await session.execute(
        select(UserMemory)
        .where(UserMemory.user_id == user_id, UserMemory.is_active.is_(True))
        .order_by(UserMemory.created_at.desc()),
    )
    memories = result.scalars().all()
    if len(memories) < 2:
        return 0

    ids_to_deactivate: set[uuid.UUID] = set()
    kept: list[UserMemory] = []

    for memory in memories:
        if memory.id in ids_to_deactivate:
            continue
        is_duplicate = False
        for representative in kept:
            similarity = _cosine_similarity(
                list(memory.embedding), list(representative.embedding),
            )
            if similarity > DEDUP_SIMILARITY_THRESHOLD:
                ids_to_deactivate.add(memory.id)
                is_duplicate = True
                break
        if not is_duplicate:
            kept.append(memory)

    if ids_to_deactivate:
        await session.execute(
            update(UserMemory)
            .where(UserMemory.id.in_(ids_to_deactivate))
            .values(is_active=False),
        )
        logger.info(
            "Deactivated %d duplicate memories for user %s",
            len(ids_to_deactivate), user_id,
        )

    return len(ids_to_deactivate)


# ── Cache invalidation ────────────────────────────────────────────────────


async def invalidate_bio_cache(user_id: uuid.UUID) -> None:
    redis_client = get_redis()
    if redis_client is not None:
        await redis_client.delete(_bio_key(user_id))


async def invalidate_chunks_cache(user_id: uuid.UUID) -> None:
    redis_client = get_redis()
    if redis_client is not None:
        await redis_client.delete(_chunks_key(user_id))


# ── System prompt builder ─────────────────────────────────────────────────


def build_memory_prompt(bio: str | None, chunks: list[str]) -> str:
    """Format bio + memory chunks for injection into the system prompt.

    Respects MAX_INJECTED_TOKENS budget (~600 tokens).
    """
    max_chars = MAX_INJECTED_TOKENS * APPROX_CHARS_PER_TOKEN
    parts: list[str] = []
    used = 0

    if bio:
        bio_section = f"[USER BIO]\n{bio}"
        used += len(bio_section)
        parts.append(bio_section)

    if chunks:
        parts.append("[RELEVANT MEMORY]")
        used += len("[RELEVANT MEMORY]") + 1
        for chunk in chunks:
            candidate = f"- {chunk}"
            if used + len(candidate) > max_chars:
                break
            parts.append(candidate)
            used += len(candidate) + 1

    return "\n".join(parts)


# ── Internal helpers ──────────────────────────────────────────────────────


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)
