//! Communication (沟通记录) — see `docs/plantree/baseline/runtime-flows.md`.
//!
//! Communications are project-scoped event records. The MVP exposes them
//! via `/api/projects/:id/communications` (nested) and we additionally
//! provide `/api/communications/:id` for get/update/delete so the React
//! UI can patch a single record without re-fetching the project list.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Communication {
    pub id: Uuid,
    pub project_id: Uuid,
    pub content: String,
    pub occurred_at: DateTime<Utc>,
    pub participants: Option<String>,
    pub conclusion: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Communication with project name — for global list/search endpoints.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct CommunicationWithProject {
    pub id: Uuid,
    pub project_id: Uuid,
    pub project_name: String,
    pub content: String,
    pub occurred_at: DateTime<Utc>,
    pub participants: Option<String>,
    pub conclusion: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Payload for `POST /api/projects/:id/communications`. `project_id` is
/// taken from the URL — never present in this DTO.
#[derive(Debug, Deserialize)]
pub struct CreateCommunication {
    pub content: String,
    pub occurred_at: DateTime<Utc>,
    #[serde(default)]
    pub participants: Option<String>,
    #[serde(default)]
    pub conclusion: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCommunication {
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub occurred_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub participants: Option<String>,
    #[serde(default)]
    pub conclusion: Option<String>,
}
