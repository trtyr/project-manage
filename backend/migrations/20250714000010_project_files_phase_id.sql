ALTER TABLE project_files ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES phases(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_project_files_phase_id ON project_files(phase_id);
