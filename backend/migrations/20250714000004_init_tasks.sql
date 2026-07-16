-- 0004 — tasks table.
-- Per-project tasks. Allowed `status` values: 'current' | 'next' | 'todo'.
-- Validated in the Rust layer via `models::task::TaskStatus`.

CREATE TABLE IF NOT EXISTS tasks (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title        TEXT         NOT NULL,
    status       TEXT         NOT NULL DEFAULT 'todo',
    planned_date DATE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status     ON tasks (status);

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
