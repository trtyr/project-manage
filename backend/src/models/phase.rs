//! Phase (阶段) — project phase planning with nesting.
//!
//! parent_id is a self-reference: null = top-level phase, non-null = sub-phase.
//! The DB enforces cascade delete (removing a parent removes all children).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
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

#[derive(Debug, Deserialize)]
pub struct CreatePhase {
    pub name: String,
    #[serde(default)]
    pub parent_id: Option<Uuid>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub sort_order: Option<i32>,
    #[serde(default)]
    pub planned_start: Option<DateTime<Utc>>,
    #[serde(default)]
    pub planned_end: Option<DateTime<Utc>>,
    #[serde(default)]
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePhase {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub sort_order: Option<i32>,
    #[serde(default)]
    pub planned_start: Option<DateTime<Utc>>,
    #[serde(default)]
    pub planned_end: Option<DateTime<Utc>>,
    #[serde(default)]
    pub actual_start: Option<DateTime<Utc>>,
    #[serde(default)]
    pub actual_end: Option<DateTime<Utc>>,
    #[serde(default)]
    pub status: Option<String>,
}
