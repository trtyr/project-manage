//! Issue (客户关切) — a concern the client raised during communication.
//!
//! Issues live under a project and track resolution. Status is one of:
//! - `open`        — not yet started
//! - `in_progress` — being worked on
//! - `resolved`    — done
//!
//! Validated in handlers via `IssueStatus::is_valid`.

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[allow(non_snake_case)]
pub mod IssueStatus {
    pub const OPEN: &str = "open";
    pub const IN_PROGRESS: &str = "in_progress";
    pub const RESOLVED: &str = "resolved";

    pub const ALL: &[&str] = &[OPEN, IN_PROGRESS, RESOLVED];

    pub fn is_valid(input: &str) -> bool {
        matches!(input, OPEN | IN_PROGRESS | RESOLVED)
    }
}

#[allow(non_snake_case)]
pub mod IssuePriority {
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
pub struct Issue {
    pub id: Uuid,
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    #[ts(type = "'open' | 'in_progress' | 'resolved'")]
    pub status: String,
    pub communication_id: Option<Uuid>,
    pub assignee_id: Option<Uuid>,
    #[ts(type = "'urgent' | 'high' | 'normal' | 'low'")]
    pub priority: String,
    pub due_date: Option<NaiveDate>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct CreateIssue {
    pub title: String,
    #[serde(default)]
    #[ts(optional)]
    pub description: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub status: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub communication_id: Option<Uuid>,
    #[serde(default)]
    #[ts(optional)]
    pub assignee_id: Option<Uuid>,
    #[serde(default)]
    #[ts(optional)]
    #[ts(type = "'urgent' | 'high' | 'normal' | 'low'")]
    pub priority: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub due_date: Option<NaiveDate>,
}

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct UpdateIssue {
    #[serde(default)]
    #[ts(optional)]
    pub title: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub description: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub status: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub communication_id: Option<Uuid>,
    #[serde(default)]
    #[ts(optional)]
    pub assignee_id: Option<Uuid>,
    #[serde(default)]
    #[ts(optional)]
    #[ts(type = "'urgent' | 'high' | 'normal' | 'low'")]
    pub priority: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub due_date: Option<NaiveDate>,
}
