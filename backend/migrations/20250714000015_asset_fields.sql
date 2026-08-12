-- Structured access / credential / vendor fields so the overloaded
-- `description` can return to pure notes. All nullable — existing rows
-- keep their data untouched; new entries get the dedicated fields.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS access_method TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS credentials TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS vendor TEXT;
