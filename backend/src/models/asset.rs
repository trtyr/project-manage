//! Asset (资产) — client IT assets and security devices.
//!
//! Flexible: asset_type is free TEXT. The frontend offers common options
//! (server, web_app, domain, ip, firewall, waf, ids, etc.) but users can
//! type anything. No enum constraint — "don't over-categorise".

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Asset {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub asset_type: String,
    pub value: Option<String>,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAsset {
    pub name: String,
    #[serde(default)]
    pub asset_type: Option<String>,
    #[serde(default)]
    pub value: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAsset {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub asset_type: Option<String>,
    #[serde(default)]
    pub value: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
}
