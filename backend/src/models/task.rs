//! Task (任务) — see `docs/plantree/baseline/storage-and-state.md`.
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

    /// `true` if `input` is one of the allowed task status values.
    // `PartialEq` for `str` is not yet stable in const fn, so this is
    // a regular `fn` — still cheap to inline at the call site.
    pub fn is_valid(input: &str) -> bool {
        matches!(input, CURRENT | NEXT | TODO)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct Task {
    pub id: Uuid,
    pub project_id: Uuid,
    pub title: String,
    // Override the `String` mapping to the narrow frontend union. The DB
    // keeps `status` as free-form text so adding a value doesn't need a
    // migration; the TS narrowing happens entirely at the type layer.
    #[ts(type = "'current' | 'next' | 'todo'")]
    pub status: String,
    pub planned_date: Option<NaiveDate>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct CreateTask {
    pub title: String,
    /// Defaults to `TaskStatus::TODO`.
    #[serde(default)]
    #[ts(optional)]
    pub status: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub planned_date: Option<NaiveDate>,
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
}
