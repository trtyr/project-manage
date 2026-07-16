ALTER TABLE project_files ADD COLUMN source_type TEXT NOT NULL DEFAULT 'file';
ALTER TABLE project_files ADD COLUMN url TEXT;
