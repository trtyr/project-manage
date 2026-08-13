//! Asset (资产) — client IT assets and devices.
//!
//! Flexible: asset_type is free TEXT. The frontend offers common options
//! (server, web_app, domain, ip, firewall, waf, ids, etc.) but users can
//! type anything. No enum constraint — "don't over-categorise".

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct Asset {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub asset_type: String,
    pub value: Option<String>,
    pub description: Option<String>,
    pub access_method: Option<String>,
    pub credentials: Option<String>,
    pub vendor: Option<String>,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct CreateAsset {
    pub name: String,
    #[serde(default)]
    #[ts(optional)]
    pub asset_type: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub value: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub description: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub access_method: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub credentials: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub vendor: Option<String>,
}

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct UpdateAsset {
    #[serde(default)]
    #[ts(optional)]
    pub name: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub asset_type: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub value: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub description: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub access_method: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub credentials: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub vendor: Option<String>,
}
