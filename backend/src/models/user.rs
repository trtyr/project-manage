//! User (用户) — local-account authentication.
//!
//! Passwords are argon2id PHC strings (salt + params embedded). The row
//! struct intentionally keeps `password_hash` private to the backend:
//! only `UserPublic` crosses the API boundary / gets exported to ts-rs.
//! `organization_id` exists in SQL as a FUTURE tenancy placeholder and is
//! deliberately absent here.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub password_hash: String,
    pub display_name: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Safe projection returned by `/api/auth/me` — no password material.
#[derive(Debug, Clone, Serialize, sqlx::FromRow, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct UserPublic {
    pub id: Uuid,
    pub username: String,
    pub display_name: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct SetupRequest {
    pub username: String,
    pub password: String,
    #[serde(default)]
    #[ts(optional)]
    pub display_name: Option<String>,
}

pub type LoginRequest = SetupRequest;
