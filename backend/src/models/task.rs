//! Task (任务).
//!
//! Tasks live under a project. Status is one of:
//! - `current` — actively being worked on
//! - `next`    — queued up to take over from current
//! - `todo`    — backlog item
//!
//! Validated in handlers via `TaskStatus::is_valid`.

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[allow(non_snake_case)]
pub mod TaskStatus {
    pub const CURRENT: &str = "current";
    pub const NEXT: &str = "next";
    pub const TODO: &str = "todo";

    pub const ALL: &[&str] = &[CURRENT, NEXT, TODO];

    pub fn is_valid(input: &str) -> bool {
        matches!(input, CURRENT | NEXT | TODO)
    }
}

#[allow(non_snake_case)]
pub mod TaskPriority {
    pub const URGENT: &str = "urgent";
    pub const HIGH: &str = "high";
    pub const NORMAL: &str = "normal";
    pub const LOW: &str = "low";

    pub const ALL: &[&str] = &[URGENT, HIGH, NORMAL, LOW];

    pub fn is_valid(input: &str) -> bool {
        matches!(input, URGENT | HIGH | NORMAL | LOW)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct Task {
    pub id: Uuid,
    pub project_id: Uuid,
    pub title: String,
    #[ts(type = "'current' | 'next' | 'todo'")]
    pub status: String,
    pub planned_date: Option<NaiveDate>,
    pub assignee_id: Option<Uuid>,
    #[ts(type = "'urgent' | 'high' | 'normal' | 'low'")]
    pub priority: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct CreateTask {
    pub title: String,
    #[serde(default)]
    #[ts(optional)]
    pub status: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub planned_date: Option<NaiveDate>,
    #[serde(default)]
    #[ts(optional)]
    pub assignee_id: Option<Uuid>,
    #[serde(default)]
    #[ts(optional)]
    #[ts(type = "'urgent' | 'high' | 'normal' | 'low'")]
    pub priority: Option<String>,
}

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct UpdateTask {
    #[serde(default)]
    #[ts(optional)]
    pub title: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub status: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub planned_date: Option<NaiveDate>,
    #[serde(default)]
    #[ts(optional)]
    pub assignee_id: Option<Uuid>,
    #[serde(default)]
    #[ts(optional)]
    #[ts(type = "'urgent' | 'high' | 'normal' | 'low'")]
    pub priority: Option<String>,
}
