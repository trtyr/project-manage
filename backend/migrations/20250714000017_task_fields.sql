-- Task enhancement: assignee link + priority for project management.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';
