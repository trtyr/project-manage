//! Shared application state injected into every handler via `axum::State`.
//!
//! Currently a thin wrapper around the `PgPool`. Adding fields (e.g. a
//! config struct or metrics handle) is just a matter of adding them
//! here and a matching `FromRef` impl so handlers can pull just the
//! pieces they care about.

use axum::extract::FromRef;
use sqlx::PgPool;

use crate::handlers::auth::LoginThrottle;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    /// Brute-force guard shared by the login/setup handlers. One instance
    /// per process — `build_app` creates it fresh, so each test server
    /// starts with a clean slate.
    pub login_throttle: LoginThrottle,
}

impl FromRef<AppState> for PgPool {
    fn from_ref(state: &AppState) -> PgPool {
        state.pool.clone()
    }
}

impl FromRef<AppState> for LoginThrottle {
    fn from_ref(state: &AppState) -> LoginThrottle {
        state.login_throttle.clone()
    }
}
