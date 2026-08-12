//! Deliverable (交付物) — structured project deliverable tracking.

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[allow(non_snake_case)]
pub mod DeliverableStatus {
    pub const PENDING: &str = "pending";
    pub const DELIVERED: &str = "delivered";
    pub const ACCEPTED: &str = "accepted";

    pub const ALL: &[&str] = &[PENDING, DELIVERED, ACCEPTED];

    pub fn is_valid(input: &str) -> bool {
        matches!(input, PENDING | DELIVERED | ACCEPTED)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct Deliverable {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    #[ts(type = "'pending' | 'delivered' | 'accepted'")]
    pub status: String,
    pub due_date: Option<NaiveDate>,
    pub linked_file_id: Option<Uuid>,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct CreateDeliverable {
    pub name: String,
    #[serde(default)]
    #[ts(optional)]
    #[ts(type = "'pending' | 'delivered' | 'accepted'")]
    pub status: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub due_date: Option<NaiveDate>,
    #[serde(default)]
    #[ts(optional)]
    pub linked_file_id: Option<Uuid>,
}

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct UpdateDeliverable {
    #[serde(default)]
    #[ts(optional)]
    pub name: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    #[ts(type = "'pending' | 'delivered' | 'accepted'")]
    pub status: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub due_date: Option<NaiveDate>,
    #[serde(default)]
    #[ts(optional)]
    pub linked_file_id: Option<Uuid>,
}
