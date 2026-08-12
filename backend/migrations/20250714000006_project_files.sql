-- Project files: uploaded documents, screenshots, reports, etc.
-- communication_id is optional — files can be standalone or attached to a communication.
CREATE TABLE IF NOT EXISTS project_files (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    communication_id UUID REFERENCES communications(id) ON DELETE SET NULL,
    original_name    TEXT NOT NULL,
    stored_name      TEXT NOT NULL,
    mime_type        TEXT NOT NULL,
    file_size        BIGINT NOT NULL,
    description      TEXT,
    tags             TEXT[] NOT NULL DEFAULT '{}',
    file_path        TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_files_project_id_idx ON project_files(project_id);
CREATE INDEX IF NOT EXISTS project_files_communication_id_idx ON project_files(communication_id);
