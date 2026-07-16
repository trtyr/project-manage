//! Client (客户) — see `docs/plantree/baseline/storage-and-state.md`.
//!
//! A client record carries:
//! - basic info (name, contact person, contact info, notes)
//! - the products they own (Postgres `TEXT[]`)
//! - the security concerns they care about (`TEXT[]`)
//! - free-form background info / links to other records
//!
//! The row struct uses `Vec<String>` directly — sqlx 0.8's
//! `PgHasArrayType` blanket impl on `String` gives us TEXT[] ↔ Vec<String>
//! out of the box without a custom wrapper.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A client row as stored in the `clients` table.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct Client {
    pub id: Uuid,
    pub name: String,
    pub contact_person: Option<String>,
    pub contact_info: Option<String>,
    pub notes: Option<String>,
    pub products: Vec<String>,
    pub security_concerns: Vec<String>,
    pub background_info: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Payload for `POST /api/clients`. The DB fills id/timestamps.
#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct CreateClient {
    pub name: String,
    #[serde(default)]
    #[ts(optional)]
    pub contact_person: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub contact_info: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub notes: Option<String>,
    #[serde(default)]
    pub products: Vec<String>,
    #[serde(default)]
    pub security_concerns: Vec<String>,
    #[serde(default)]
    #[ts(optional)]
    pub background_info: Option<String>,
}

/// Payload for `PUT /api/clients/:id`. Every field is optional so callers
/// can patch just one column. `name = None` means "do not update name";
/// callers who want to clear `name` would have to use a dedicated endpoint
/// (not in MVP scope).
#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct UpdateClient {
    #[serde(default)]
    #[ts(optional)]
    pub name: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub contact_person: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub contact_info: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub notes: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub products: Option<Vec<String>>,
    #[serde(default)]
    #[ts(optional)]
    pub security_concerns: Option<Vec<String>>,
    #[serde(default)]
    #[ts(optional)]
    pub background_info: Option<String>,
}
