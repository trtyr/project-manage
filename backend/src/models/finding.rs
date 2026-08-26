//! Finding (产品发现) — a problem we observed in the product the client is
//! currently using (ours or a third-party vendor's).
//!
//! Findings live under a project. Unlike issues (which track resolution of
//! client concerns), findings only track whether we've fed the problem back
//! to the client. `feedback_status` ∈ 'unreported' | 'reported'.
//! `product_source` ∈ 'ours' | 'third_party'.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[allow(non_snake_case)]
pub mod ProductSource {
    pub const OURS: &str = "ours";
    pub const THIRD_PARTY: &str = "third_party";

    pub const ALL: &[&str] = &[OURS, THIRD_PARTY];

    pub fn is_valid(input: &str) -> bool {
        matches!(input, OURS | THIRD_PARTY)
    }
}

#[allow(non_snake_case)]
pub mod FeedbackStatus {
    pub const UNREPORTED: &str = "unreported";
    pub const REPORTED: &str = "reported";

    pub const ALL: &[&str] = &[UNREPORTED, REPORTED];

    pub fn is_valid(input: &str) -> bool {
        matches!(input, UNREPORTED | REPORTED)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct Finding {
    pub id: Uuid,
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub product: Option<String>,
    #[ts(type = "'ours' | 'third_party'")]
    pub product_source: String,
    pub vendor: Option<String>,
    pub observed_at: DateTime<Utc>,
    pub communication_id: Option<Uuid>,
    #[ts(type = "'unreported' | 'reported'")]
    pub feedback_status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct CreateFinding {
    pub title: String,
    #[serde(default)]
    #[ts(optional)]
    pub description: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub product: Option<String>,
    #[ts(type = "'ours' | 'third_party'")]
    pub product_source: String,
    #[serde(default)]
    #[ts(optional)]
    pub vendor: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub observed_at: Option<DateTime<Utc>>,
    #[serde(default)]
    #[ts(optional)]
    pub communication_id: Option<Uuid>,
    #[serde(default)]
    #[ts(optional)]
    #[ts(type = "'unreported' | 'reported'")]
    pub feedback_status: Option<String>,
}

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../frontend/src/types/generated/")]
pub struct UpdateFinding {
    #[serde(default)]
    #[ts(optional)]
    pub title: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub description: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub product: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    #[ts(type = "'ours' | 'third_party'")]
    pub product_source: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub vendor: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub observed_at: Option<DateTime<Utc>>,
    #[serde(default)]
    #[ts(optional)]
    pub communication_id: Option<Uuid>,
    #[serde(default)]
    #[ts(optional)]
    #[ts(type = "'unreported' | 'reported'")]
    pub feedback_status: Option<String>,
}
