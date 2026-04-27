"""One-shot PostgreSQL schema fixes for `tasks` (create_all does not alter existing tables)."""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

# ── Add columns that may be missing ──────────────────────────────────────────

_ADD_USER_ID = text(
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "
    "user_id UUID REFERENCES users(id) ON DELETE CASCADE"
)
_ADD_TITLE = text(
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS title VARCHAR(500)"
)
_ADD_DESCRIPTION = text(
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT"
)
_ADD_STATUS = text(
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'not_started'"
)
_ADD_PROJECT = text(
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project VARCHAR(200)"
)
_ADD_ASSIGNED_AGENT = text(
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_agent VARCHAR(100)"
)
_ADD_CREATED_AT = text(
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "
    "created_at TIMESTAMP WITH TIME ZONE DEFAULT now()"
)

# ── Enforce NOT NULL after backfill ──────────────────────────────────────────

_DELETE_ORPHANS = text("DELETE FROM tasks WHERE user_id IS NULL")
_SET_USER_ID_NOT_NULL = text("ALTER TABLE tasks ALTER COLUMN user_id SET NOT NULL")
_SET_TITLE_NOT_NULL = text("ALTER TABLE tasks ALTER COLUMN title SET NOT NULL")
_ADD_USER_ID_INDEX = text(
    "CREATE INDEX IF NOT EXISTS ix_tasks_user_id ON tasks (user_id)"
)

# ── Drop NOT NULL on legacy columns not used by the current ORM ──────────────
# The pre-existing table may have business_id or updated_at as NOT NULL.
_NULLIFY_LEGACY_NOTNULL = text(
    """
    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'tasks' AND column_name = 'business_id'
              AND is_nullable = 'NO'
        ) THEN
            ALTER TABLE tasks ALTER COLUMN business_id DROP NOT NULL;
        END IF;

        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'tasks' AND column_name = 'updated_at'
              AND is_nullable = 'NO'
        ) THEN
            ALTER TABLE tasks ALTER COLUMN updated_at SET DEFAULT now();
            UPDATE tasks SET updated_at = now() WHERE updated_at IS NULL;
        END IF;
    END$$;
    """
)

# ── Normalise status column ───────────────────────────────────────────────────
# If the pre-existing table stored status as a native PostgreSQL ENUM with
# uppercase values (NOT_STARTED, IN_PROGRESS, DONE), cast it to plain VARCHAR
# and lower-case the values so they match the Python enum's .value strings.
_NORMALISE_STATUS = text(
    """
    DO $$
    DECLARE
        col_type TEXT;
    BEGIN
        SELECT data_type INTO col_type
        FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'status';

        IF col_type IS NOT NULL AND col_type NOT IN ('character varying', 'text') THEN
            -- Cast native ENUM to VARCHAR
            ALTER TABLE tasks ALTER COLUMN status TYPE VARCHAR(32) USING status::text;
        END IF;

        -- Lower-case any uppercase legacy values
        UPDATE tasks
        SET status = lower(status)
        WHERE status ~ '^[A-Z_]+$';
    END$$;
    """
)


async def ensure_tasks_columns(connection: AsyncConnection) -> None:
    await connection.execute(_ADD_USER_ID)
    await connection.execute(_ADD_TITLE)
    await connection.execute(_ADD_DESCRIPTION)
    await connection.execute(_ADD_STATUS)
    await connection.execute(_ADD_PROJECT)
    await connection.execute(_ADD_ASSIGNED_AGENT)
    await connection.execute(_ADD_CREATED_AT)
    await connection.execute(_DELETE_ORPHANS)
    await connection.execute(_SET_USER_ID_NOT_NULL)
    await connection.execute(_SET_TITLE_NOT_NULL)
    await connection.execute(_ADD_USER_ID_INDEX)
    await connection.execute(_NULLIFY_LEGACY_NOTNULL)
    await connection.execute(_NORMALISE_STATUS)
