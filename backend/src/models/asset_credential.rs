//! AssetCredential (资产凭据) — one login/key/token row belonging to an asset.
//!
//! An asset (server, web app, firewall…) often has several credentials:
//! SSH accounts, admin consoles, API keys. Each is its own row with a
//! human label, a validated type, and separately copyable username/secret.
//! Replaces the former single free-text `assets.credentials` column.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[allow(non_snake_case)]
pub mod CredentialType {
    pub const PASSWORD: &str = "password";
    pub const API_KEY: &str = "api_key";
    pub const CERTIFICATE: &str = "certificate";
    pub const TOKEN: &str = "token";
    pub const OTHER: &str = "other";

    pub const ALL: &[&str] = &[PASSWORD, API_KEY, CERTIFICATE, TOKEN, OTHER];

    pub fn is_valid(input: &str) -> bool {
        matches!(input, PASSWORD | API_KEY | CERTIFICATE | TOKEN | OTHER)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct AssetCredential {
    pub id: Uuid,
    pub asset_id: Uuid,
    pub label: String,
    #[ts(type = "'password' | 'api_key' | 'certificate' | 'token' | 'other'")]
    pub cred_type: String,
    pub username: Option<String>,
    pub secret: Option<String>,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct CreateAssetCredential {
    pub label: String,
    #[serde(default)]
    #[ts(optional)]
    pub cred_type: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub username: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub secret: Option<String>,
}

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct UpdateAssetCredential {
    #[serde(default)]
    #[ts(optional)]
    pub label: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub cred_type: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub username: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub secret: Option<String>,
}
