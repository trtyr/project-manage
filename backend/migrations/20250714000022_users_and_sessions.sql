-- 0022 — users + session tables (authentication).
-- Local-account auth: username/email + argon2id password hash.
-- Sessions are stored by tower-sessions' PostgresStore (MessagePack data).
-- organization_id is a FUTURE multi-tenant placeholder: nullable, no FK,
-- not modeled in Rust — do not query it until tenancy lands (see
-- docs/plantree/plans/authentication/).

CREATE TABLE IF NOT EXISTS users (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    username        TEXT        NOT NULL UNIQUE,   -- stored lowercase
    password_hash   TEXT        NOT NULL,          -- argon2id PHC string
    display_name    TEXT,
    organization_id UUID,                          -- FUTURE tenancy placeholder
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- tower-sessions PostgresStore schema (hand-written so migrations stay
-- unified under ./migrations; verify against the crate docs when bumping
-- tower-sessions-sqlx-store versions).
CREATE TABLE IF NOT EXISTS session (
    id          TEXT        PRIMARY KEY,
    data        BYTEA       NOT NULL,
    expiry_date TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_expiry_date ON session (expiry_date);
