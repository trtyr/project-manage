ALTER TABLE project_files ADD COLUMN phase_id UUID REFERENCES phases(id) ON DELETE SET NULL;
CREATE INDEX idx_project_files_phase_id ON project_files(phase_id);
