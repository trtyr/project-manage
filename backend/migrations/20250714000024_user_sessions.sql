-- Session ownership index. tower-sessions owns the `session` table and
-- only writes (id, data, expiry_date), so "revoke all other sessions of
-- user X" needs our own mapping. Rows are written at login/setup, removed
-- on logout, and orphans are swept by the same startup purge that removes
-- expired sessions.
CREATE TABLE IF NOT EXISTS user_sessions (
    session_id TEXT PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
