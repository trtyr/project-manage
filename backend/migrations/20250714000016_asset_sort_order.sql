-- sort_order enables drag-and-drop reordering of project assets.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
