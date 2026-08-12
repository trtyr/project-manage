-- Deliverables: structured tracking of project deliverables (what's been
-- delivered vs pending vs accepted). Optional link to a project_file.
CREATE TABLE IF NOT EXISTS deliverables (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    due_date        DATE,
    linked_file_id  UUID REFERENCES project_files(id) ON DELETE SET NULL,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deliverables_project_id_idx ON deliverables(project_id);

DROP TRIGGER IF EXISTS trg_deliverables_updated_at ON deliverables;
CREATE TRIGGER trg_deliverables_updated_at
    BEFORE UPDATE ON deliverables
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
