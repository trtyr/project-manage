-- 0002 — projects table.
-- Each project belongs to one client (client_id NOT NULL) and tracks
-- status / phase / goals.
--
-- Status is TEXT (validated in the Rust layer) rather than a Postgres
-- ENUM so adding a new status doesn't require a migration. The set of
-- allowed values lives in `models::project::ProjectStatus`.

CREATE TABLE IF NOT EXISTS projects (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id  UUID         NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    name       TEXT         NOT NULL,
    status     TEXT         NOT NULL DEFAULT 'in_progress',
    phase      TEXT,
    goals      TEXT[]       NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects (client_id);

DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
CREATE TRIGGER trg_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
