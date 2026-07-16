-- 0001 — clients table.
-- Holds customer (客户) records for the security tracker.
-- `products`, `security_concerns` are stored as TEXT[] to keep the MVP
-- flat; upgrade to a normalized relation only when filtering/search by
-- those fields becomes a real requirement.
-- `background_info` keeps free-form notes / linked records the user wants
-- to attach to the client (per the plan tree baseline/storage-and-state.md).

CREATE TABLE IF NOT EXISTS clients (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT         NOT NULL,
    contact_person   TEXT,
    contact_info     TEXT,
    notes            TEXT,
    products         TEXT[]       NOT NULL DEFAULT '{}',
    security_concerns TEXT[]      NOT NULL DEFAULT '{}',
    background_info  TEXT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- updated_at trigger keeps the column honest on every UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clients_updated_at ON clients;
CREATE TRIGGER trg_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
