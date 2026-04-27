from functools import lru_cache
from pathlib import Path

from langchain_openai import ChatOpenAI
from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve so GROQ_* and other keys load even when uvicorn is started from the repo root
_BACKEND_DIR = Path(__file__).resolve().parent
_DOTENV_PATH = _BACKEND_DIR / ".env"

OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_DEFAULT_MODEL = "anthropic/claude-sonnet-4.6"
CHAT_LLM_TIMEOUT_SECONDS = 120
CHAT_LLM_MAX_RETRIES = 1
VOYAGEAI_DEFAULT_MODEL = "voyage-3"

GROQ_DEFAULT_BASE_URL = "https://api.groq.com/openai/v1"
GROQ_DEFAULT_WHISPER_MODEL = "whisper-large-v3-turbo"

EDGE_TTS_DEFAULT_VOICE = "en-US-JennyNeural"

LANGSMITH_DEFAULT_PROJECT_NAME = "chief-of-staff"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_DOTENV_PATH),
        # Strip BOM from editors that save UTF-8 with BOM (breaks first variable name otherwise).
        env_file_encoding="utf-8-sig",
        # Shell vars override .env; empty exports like `export GROQ_API_KEY=` must not shadow the file.
        env_ignore_empty=True,
        extra="ignore",
    )

    @field_validator("groq_api_key", mode="before")
    @classmethod
    def normalize_groq_api_key(cls, value: object) -> object:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        stripped = value.strip().strip("\ufeff")
        if len(stripped) >= 2 and (
            (stripped[0] == '"' and stripped[-1] == '"')
            or (stripped[0] == "'" and stripped[-1] == "'")
        ):
            stripped = stripped[1:-1].strip()
        return stripped if stripped else None

    api_host: str = "0.0.0.0"
    api_port: int = 8000

    openrouter_api_key: str | None = None
    openrouter_base_url: str = OPENROUTER_DEFAULT_BASE_URL
    openrouter_default_model: str = OPENROUTER_DEFAULT_MODEL

    cors_allowed_origins: str = (
        "http://localhost:3000,http://localhost:3001,"
        "http://127.0.0.1:3000,http://127.0.0.1:3001,"
        "http://[::1]:3000,http://[::1]:3001"
    )

    database_url: str | None = None
    database_echo_sql: bool = False
    # Use Supabase Transaction pooler (port 6543) for concurrent async workloads.
    # Session pooler (port 5432) only supports 1 connection; Transaction pooler handles many.
    database_pool_size: int = 5
    database_max_overflow: int = 5
    database_pool_recycle_seconds: int = 3600
    init_db_schema_on_startup: bool = False

    jwt_secret: str | None = None

    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = "http://localhost:8000/gmail/callback"
    google_calendar_redirect_uri: str = "http://localhost:8000/calendar/callback"

    notion_client_id: str | None = None
    notion_client_secret: str | None = None
    notion_redirect_uri: str = "http://localhost:8000/notion/callback"

    frontend_url: str = "http://localhost:3000"

    redis_url: str | None = None

    voyageai_api_key: str | None = None
    voyageai_model: str = VOYAGEAI_DEFAULT_MODEL

    groq_api_key: str | None = None
    groq_base_url: str = GROQ_DEFAULT_BASE_URL
    groq_whisper_model: str = GROQ_DEFAULT_WHISPER_MODEL

    edge_tts_voice: str = EDGE_TTS_DEFAULT_VOICE

    # Gmail list/search — kept small to avoid blowing the LLM context window.
    # Raise via env vars only if you know your emails are short and you need more breadth.
    gmail_list_max_results: int = 20
    gmail_list_max_total_messages: int = 50
    gmail_list_max_enriched: int = 10
    gmail_list_enrich_concurrency: int = 5

    # LangSmith — traces graph + nested LLM/tool runs when enabled and API key is set.
    langsmith_tracing_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices(
            "LANGSMITH_TRACING_V2",
            "LANGCHAIN_TRACING_V2",
            "LANGSMITH_TRACING",
        ),
    )
    langsmith_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("LANGSMITH_API_KEY", "LANGCHAIN_API_KEY"),
    )
    langsmith_project: str | None = Field(
        default=None,
        validation_alias=AliasChoices("LANGSMITH_PROJECT", "LANGCHAIN_PROJECT"),
    )
    langsmith_api_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "LANGSMITH_ENDPOINT",
            "LANGCHAIN_ENDPOINT",
        ),
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


def chat_llm(settings: Settings, *, model: str | None = None) -> ChatOpenAI:
    return ChatOpenAI(
        model=model or settings.openrouter_default_model,
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_base_url,
        timeout=CHAT_LLM_TIMEOUT_SECONDS,
        max_retries=CHAT_LLM_MAX_RETRIES,
    )
