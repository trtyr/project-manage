-- 0003 — communications table.
-- One row per communication event tied to a project. ON DELETE CASCADE
-- so removing a project also removes its comms log (the task tree
-- treats communications as project-scoped ephemeral data).

CREATE TABLE IF NOT EXISTS communications (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    content       TEXT         NOT NULL,
    occurred_at   TIMESTAMPTZ  NOT NULL,
    participants  TEXT,
    conclusion    TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_communications_project_id
    ON communications (project_id);

CREATE INDEX IF NOT EXISTS idx_communications_occurred_at
    ON communications (occurred_at DESC);
