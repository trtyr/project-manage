-- Drop the client `security_concerns` column.
--
-- The project is positioned as a generic project-management tool, not a
-- security-services-specific one, so the security-concerns field is removed
-- entirely (model, handler, frontend, tests). The column was created in
-- migration 001; this migration drops it. Idempotent via IF EXISTS.
ALTER TABLE clients DROP COLUMN IF EXISTS security_concerns;
