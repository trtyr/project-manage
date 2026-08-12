-- Unify team members + client contacts into a single `people` table keyed by
-- `side` ('team' | 'client'). Moving a person between team and client becomes
-- a side flip with NO field conversion — `role` is one shared field for both.
--
-- NOT safely re-runnable: it drops the source tables. sqlx wraps each
-- migration in its own transaction, so a partial failure rolls the whole
-- migration back and it is retried from scratch on the next run.
CREATE TABLE IF NOT EXISTS people (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    side        TEXT NOT NULL,
    name        TEXT NOT NULL,
    role        TEXT,
    notes       TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS people_project_id_idx ON people(project_id);
CREATE INDEX IF NOT EXISTS people_project_side_idx ON people(project_id, side);

-- Migrate existing team members (role carries verbatim).
INSERT INTO people (project_id, side, name, role, notes, sort_order, created_at)
SELECT project_id, 'team', name, role, notes, sort_order, created_at FROM members;

-- Migrate existing client contacts (role_type → role, verbatim).
INSERT INTO people (project_id, side, name, role, notes, sort_order, created_at)
SELECT project_id, 'client', name, role_type, notes, sort_order, created_at
FROM client_contacts;

DROP TABLE members;
DROP TABLE client_contacts;
