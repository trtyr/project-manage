//! Person — anyone associated with a project, on our team or the client side.
//!
//! Replaces the old split `members` (team) + `client_contacts` (client) tables.
//! `side` distinguishes the two; `role` is one shared field so moving a person
//! across sides needs no field conversion.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct Person {
    pub id: Uuid,
    pub project_id: Uuid,
    pub side: String,
    pub name: String,
    pub role: Option<String>,
    pub notes: Option<String>,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct CreatePerson {
    pub side: String,
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
pub struct UpdatePerson {
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

/// `side` is a free-form `TEXT` column restricted by the API to two values,
/// matching the `ProjectStatus` / `TaskStatus` pattern (data-only, validated
/// in handlers).
#[allow(non_snake_case)]
pub mod PersonSide {
    pub const TEAM: &str = "team";
    pub const CLIENT: &str = "client";
    pub const ALL: &[&str] = &[TEAM, CLIENT];
    pub fn is_valid(input: &str) -> bool {
        matches!(input, TEAM | CLIENT)
    }
}
