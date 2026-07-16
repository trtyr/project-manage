//! Member (团队成员) — people on our side associated with a project.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct Member {
    pub id: Uuid,
    pub project_id: Uuid,
    pub role: Option<String>,
    pub name: String,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct CreateMember {
    pub name: String,
    #[serde(default)]
    #[ts(optional)]
    pub role: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct UpdateMember {
    #[serde(default)]
    #[ts(optional)]
    pub name: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub role: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub notes: Option<String>,
}
