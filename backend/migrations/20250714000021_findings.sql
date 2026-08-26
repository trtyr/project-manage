-- 0021 — findings table.
-- Per-project product findings observed by us (产品发现): problems in the
-- product the client is currently using (ours or a third-party vendor's).
-- Light tracking only: `feedback_status` ∈ 'unreported' | 'reported'.
-- `product_source` ∈ 'ours' | 'third_party' (required, no DB default);
-- `vendor` records the vendor when the product is third-party.

CREATE TABLE IF NOT EXISTS findings (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title            TEXT         NOT NULL,
    description      TEXT,
    product          TEXT,
    product_source   TEXT         NOT NULL,
    vendor           TEXT,
    observed_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    communication_id UUID         REFERENCES communications(id) ON DELETE SET NULL,
    feedback_status  TEXT         NOT NULL DEFAULT 'unreported',
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_findings_project_id     ON findings (project_id);
CREATE INDEX IF NOT EXISTS idx_findings_feedback_status ON findings (feedback_status);

DROP TRIGGER IF EXISTS trg_findings_updated_at ON findings;
CREATE TRIGGER trg_findings_updated_at
    BEFORE UPDATE ON findings
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
