-- Client contacts: people on the client side associated with a project.
CREATE TABLE IF NOT EXISTS client_contacts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_contacts_project_id_idx ON client_contacts(project_id);
