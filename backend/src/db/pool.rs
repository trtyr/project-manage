//! PostgreSQL connection pool factory.
//!
//! Uses `PgPoolOptions` to set conservative timeouts suitable for a
//! single-user internal tool. Tweak the values if the deployment shape
//! changes (e.g. running behind a load balancer).

use std::time::Duration;

use sqlx::postgres::{PgPool, PgPoolOptions};

/// Build a `PgPool` from the `DATABASE_URL` environment variable.
///
/// Timeouts:
/// - `acquire`: 5s — fast-fail under contention since MVP is single-user.
/// - `idle`:    10min — keep warm connections, trim eventually.
/// - `max_lifetime`: 30min — avoids long-lived connections that might
///   silently die behind a firewall or NAT.
pub async fn build_pool() -> Result<PgPool, sqlx::Error> {
    let database_url = std::env::var("DATABASE_URL")
        .map_err(|e| sqlx::Error::Configuration(format!("DATABASE_URL is not set: {e}").into()))?;

    PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(5))
        .idle_timeout(Some(Duration::from_secs(600)))
        .max_lifetime(Some(Duration::from_secs(1800)))
        .connect(&database_url)
        .await
}
