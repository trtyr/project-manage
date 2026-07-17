//! Project (项目) — see `docs/plantree/baseline/storage-and-state.md`.
//!
//! A project always belongs to a single client (`client_id`, NOT NULL).
//! On the wire we accept and emit `Project`, but for nested contexts
//! (e.g. inside a client's representation if we ever build one) we may
//! add a `ProjectSummary` later. Not in MVP.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Allowed values for `project.status`.
///
/// String constants live side-by-side with a `is_valid` predicate. We
/// keep the validation as a pure boolean and let handlers build their
/// own error message referencing `ALL` — that way the type stays simple
/// and the data list only appears in error strings.
#[allow(non_snake_case)]
pub mod ProjectStatus {
    pub const IN_PROGRESS: &str = "in_progress";
    pub const COMPLETED: &str = "completed";
    pub const PAUSED: &str = "paused";

    pub const ALL: &[&str] = &[IN_PROGRESS, COMPLETED, PAUSED];

    /// `true` if `input` is one of the allowed status values.
    // `PartialEq` for `str` is not yet stable in const fn, so this is
    // a regular `fn` — still cheap to inline at the call site.
    pub fn is_valid(input: &str) -> bool {
        matches!(input, IN_PROGRESS | COMPLETED | PAUSED)
    }
}

/// Allowed values for `project.tech_approval`.
#[allow(non_snake_case)]
pub mod TechApprovalStatus {
    pub const NOT_CONTACTED: &str = "未接触";
    pub const POC_IN_PROGRESS: &str = "POC中";
    pub const APPROVED: &str = "已认可";
    pub const REJECTED: &str = "技术否决";

    pub const ALL: &[&str] = &[NOT_CONTACTED, POC_IN_PROGRESS, APPROVED, REJECTED];

    pub fn is_valid(input: &str) -> bool {
        matches!(input, NOT_CONTACTED | POC_IN_PROGRESS | APPROVED | REJECTED)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct Project {
    pub id: Uuid,
    pub client_id: Uuid,
    pub name: String,
    // Rust keeps `status` as a free-form `String` so the DB stays free of
    // a CHECK constraint, but the frontend expects the narrow union. We
    // override the generated TS type so the wire values stay restricted.
    #[ts(type = "'in_progress' | 'completed' | 'paused'")]
    pub status: String,
    pub phase: Option<String>,
    pub goals: Vec<String>,
    #[ts(type = "'未接触' | 'POC中' | '已认可' | '技术否决'")]
    pub tech_approval: String,
    pub competitors: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Payload for `POST /api/projects`. `client_id` is required so an
/// orphaned project can never exist by construction.
#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct CreateProject {
    pub client_id: Uuid,
    pub name: String,
    /// Defaults to `ProjectStatus::IN_PROGRESS` when omitted.
    #[serde(default)]
    #[ts(optional)]
    pub status: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub phase: Option<String>,
    #[serde(default)]
    pub goals: Vec<String>,
    #[serde(default)]
    #[ts(optional)]
    pub tech_approval: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub competitors: Option<String>,
}

/// Payload for `PUT /api/projects/:id`. All fields optional to allow
/// partial updates. Refer to `client::UpdateClient` for the same
/// limitation re: clearing a non-nullable value.
#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct UpdateProject {
    #[serde(default)]
    #[ts(optional)]
    pub client_id: Option<Uuid>,
    #[serde(default)]
    #[ts(optional)]
    pub name: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub status: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub phase: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub goals: Option<Vec<String>>,
    #[serde(default)]
    #[ts(optional)]
    pub tech_approval: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub competitors: Option<String>,
}
