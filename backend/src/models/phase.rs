//! Phase (阶段) — project phase planning with nesting.
//!
//! parent_id is a self-reference: null = top-level phase, non-null = sub-phase.
//! The DB enforces cascade delete (removing a parent removes all children).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct Phase {
    pub id: Uuid,
    pub project_id: Uuid,
    pub parent_id: Option<Uuid>,
    pub name: String,
    pub description: Option<String>,
    pub sort_order: i32,
    pub planned_start: Option<DateTime<Utc>>,
    pub planned_end: Option<DateTime<Utc>>,
    pub actual_start: Option<DateTime<Utc>>,
    pub actual_end: Option<DateTime<Utc>>,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct CreatePhase {
    pub name: String,
    #[serde(default)]
    #[ts(optional)]
    pub parent_id: Option<Uuid>,
    #[serde(default)]
    #[ts(optional)]
    pub description: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub sort_order: Option<i32>,
    #[serde(default)]
    #[ts(optional)]
    pub planned_start: Option<DateTime<Utc>>,
    #[serde(default)]
    #[ts(optional)]
    pub planned_end: Option<DateTime<Utc>>,
    #[serde(default)]
    #[ts(optional)]
    pub status: Option<String>,
}

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct UpdatePhase {
    #[serde(default)]
    #[ts(optional)]
    pub name: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub description: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub sort_order: Option<i32>,
    #[serde(default)]
    #[ts(optional)]
    pub planned_start: Option<DateTime<Utc>>,
    #[serde(default)]
    #[ts(optional)]
    pub planned_end: Option<DateTime<Utc>>,
    #[serde(default)]
    #[ts(optional)]
    pub actual_start: Option<DateTime<Utc>>,
    #[serde(default)]
    #[ts(optional)]
    pub actual_end: Option<DateTime<Utc>>,
    #[serde(default)]
    #[ts(optional)]
    pub status: Option<String>,
}
