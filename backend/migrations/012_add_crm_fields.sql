-- Add lightweight CRM tracking fields
-- client_contacts.role_type: decision chain role (free-form, suggested values in frontend)
-- projects.tech_approval: tech approval status (constrained values)
-- projects.competitors: competitor info (free-form)

ALTER TABLE client_contacts ADD COLUMN IF NOT EXISTS role_type TEXT NOT NULL DEFAULT '';

ALTER TABLE projects ADD COLUMN IF NOT EXISTS tech_approval TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS competitors TEXT NOT NULL DEFAULT '';
