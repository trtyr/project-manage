//! Shared application state injected into every handler via `axum::State`.
//!
//! Currently a thin wrapper around the `PgPool`. Adding fields (e.g. a
//! config struct or metrics handle) is just a matter of adding them
//! here and a matching `FromRef` impl so handlers can pull just the
//! pieces they care about.

use axum::extract::FromRef;
use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
}

impl FromRef<AppState> for PgPool {
    fn from_ref(state: &AppState) -> PgPool {
        state.pool.clone()
    }
}
