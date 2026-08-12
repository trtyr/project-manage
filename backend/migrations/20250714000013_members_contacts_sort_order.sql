-- sort_order enables drag-and-drop reordering of project members and client
-- contacts. Existing rows default to 0; the list query ties on created_at until
-- the first manual reorder, so current ordering is preserved.
ALTER TABLE members ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE client_contacts ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
