-- 0020 — issues table.
-- Per-project customer concerns raised by the client (客户关切).
-- Allowed `status`: 'open' | 'in_progress' | 'resolved'.
-- Validated in the Rust layer via `models::issue::IssueStatus`.
-- `communication_id` optionally links the concern back to the conversation
-- where it was raised; `assignee_id` links the owner (a team person).

CREATE TABLE IF NOT EXISTS issues (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title            TEXT         NOT NULL,
    description      TEXT,
    status           TEXT         NOT NULL DEFAULT 'open',
    communication_id UUID         REFERENCES communications(id) ON DELETE SET NULL,
    assignee_id      UUID         REFERENCES people(id) ON DELETE SET NULL,
    priority         TEXT         NOT NULL DEFAULT 'normal',
    due_date         DATE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issues_project_id ON issues (project_id);
CREATE INDEX IF NOT EXISTS idx_issues_status     ON issues (status);

DROP TRIGGER IF EXISTS trg_issues_updated_at ON issues;
CREATE TRIGGER trg_issues_updated_at
    BEFORE UPDATE ON issues
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
