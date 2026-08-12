-- Phases: project phase planning with nesting (parent_id self-reference).
-- Supports大阶段/小阶段 tree structure. Cascade delete removes children.
CREATE TABLE IF NOT EXISTS phases (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id     UUID REFERENCES phases(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    description   TEXT,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    planned_start TIMESTAMPTZ,
    planned_end   TIMESTAMPTZ,
    actual_start  TIMESTAMPTZ,
    actual_end    TIMESTAMPTZ,
    status        TEXT NOT NULL DEFAULT 'pending',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS phases_project_id_idx ON phases(project_id);
CREATE INDEX IF NOT EXISTS phases_parent_id_idx ON phases(parent_id);
