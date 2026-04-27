import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from config import get_settings
from db.base import Base
from db.background_job_schema_migration import ensure_background_job_schedule_window_columns
from db.task_schema_migration import ensure_tasks_columns
from db.session import close_database_engine, get_engine, init_database_engine
from routers.auth import auth_router
from routers.background_jobs import background_jobs_router
from routers.tasks import tasks_router
from routers.calendar import calendar_router
from routers.chat import chat_router
from routers.voice import voice_router
from routers.create_entities import create_entities_router
from routers.gmail import gmail_router
from routers.health import health_router
from routers.notion import notion_router
from routers.notifications import notifications_router
from services.embedding_service import init_embedding_client
from services.redis_client import close_redis, init_redis

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


async def _run_background_jobs_tick() -> None:
    """Poll for due scheduled jobs and execute them (writes `BackgroundJobRun` rows)."""
    from db.session import _holder as db_holder

    if db_holder.session_factory is None:
        logger.warning("Background job tick skipped — database not available")
        return

    from config import get_settings as _get_settings
    from jobs.background_job_tick import run_due_background_jobs

    settings = _get_settings()
    async with db_holder.session_factory() as session:
        try:
            n = await run_due_background_jobs(session, settings)
            await session.commit()
            if n:
                logger.info("Background job tick — processed %d schedule(s)", n)
        except Exception:
            await session.rollback()
            logger.exception("Background job tick failed")


async def _run_daily_bio_job() -> None:
    """Wrapper executed by APScheduler — creates its own DB session."""
    from db.session import _holder as db_holder

    if db_holder.session_factory is None:
        logger.warning("Bio job skipped — database not available")
        return

    from config import get_settings as _get_settings
    from jobs.bio_summarization import run_bio_summarization

    settings = _get_settings()
    async with db_holder.session_factory() as session:
        try:
            await run_bio_summarization(session, settings)
            await session.commit()
        except Exception:
            await session.rollback()
            logger.exception("Daily bio summarization job failed")


@asynccontextmanager
async def lifespan(application: FastAPI):
    global _scheduler  # noqa: PLW0603
    settings = get_settings()

    groq_key = settings.groq_api_key
    logger.info(
        "Groq STT: %s",
        f"API key loaded ({len(groq_key)} chars)" if groq_key else "GROQ_API_KEY missing — check backend/.env",
    )

    # ── Database ──────────────────────────────────────────────────────────
    init_database_engine(settings)
    if settings.database_url and settings.init_db_schema_on_startup:
        import models  # noqa: F401  # Load ORM classes so Base.metadata includes all tables.

        engine = get_engine()
        if engine is not None:
            async with engine.begin() as conn:
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                await conn.run_sync(Base.metadata.create_all)
                await ensure_background_job_schedule_window_columns(conn)
                await ensure_tasks_columns(conn)

    # ── Redis ─────────────────────────────────────────────────────────────
    await init_redis(settings)

    # ── VoyageAI embeddings ───────────────────────────────────────────────
    init_embedding_client(settings)

    # ── Background scheduler ──────────────────────────────────────────────
    if settings.database_url:
        _scheduler = AsyncIOScheduler()
        _scheduler.add_job(
            _run_daily_bio_job,
            trigger=CronTrigger(hour=3, minute=0),
            id="daily_bio_summarization",
            replace_existing=True,
        )
        _scheduler.add_job(
            _run_background_jobs_tick,
            trigger=IntervalTrigger(minutes=1),
            id="background_jobs_tick",
            replace_existing=True,
        )
        _scheduler.start()
        logger.info("APScheduler started — daily bio at 03:00; background job poll every 1 min")

    yield

    # ── Shutdown ──────────────────────────────────────────────────────────
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
    await close_redis()
    await close_database_engine()


def create_app() -> FastAPI:
    application = FastAPI(title="Chief of Staff API", version="0.1.0", lifespan=lifespan)

    settings = get_settings()
    cors_origins = [origin.strip() for origin in settings.cors_allowed_origins.split(",") if origin.strip()]
    application.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(health_router)
    application.include_router(auth_router)
    application.include_router(chat_router)
    application.include_router(voice_router)
    application.include_router(create_entities_router)
    application.include_router(gmail_router)
    application.include_router(calendar_router)
    application.include_router(notion_router)
    application.include_router(notifications_router)
    application.include_router(background_jobs_router)
    application.include_router(tasks_router)
    return application


app = create_app()
