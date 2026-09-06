-- Asset credentials become first-class rows. The old single free-text
-- `assets.credentials` column could hold only one blob per asset, forcing
-- multiple logins (SSH / admin console / API keys) into one unstructured
-- field. Each credential is now its own row with a label, type, and
-- separately copyable username/secret.
CREATE TABLE IF NOT EXISTS asset_credentials (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id   UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    label      TEXT NOT NULL,
    cred_type  TEXT NOT NULL DEFAULT 'password',
    username   TEXT,
    secret     TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS asset_credentials_asset_id_idx ON asset_credentials(asset_id);

-- Same set_updated_at() trigger the other mutable tables install
-- (created by migration 001), so `updated_at` stays trigger-owned.
CREATE TRIGGER trg_asset_credentials_updated_at
    BEFORE UPDATE ON asset_credentials
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Carry the legacy free-text over as one labeled row per asset so no
-- data is lost. Idempotent: assets that already have rows are skipped.
INSERT INTO asset_credentials (asset_id, label, cred_type, secret, sort_order)
SELECT id, '凭据（迁移）', 'other', credentials, 0
FROM assets
WHERE credentials IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM asset_credentials WHERE asset_id = assets.id);

-- The column's data now lives in asset_credentials; drop the source of
-- truth duplication.
ALTER TABLE assets DROP COLUMN IF EXISTS credentials;
