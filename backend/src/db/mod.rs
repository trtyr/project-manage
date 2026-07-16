//! Database access layer.
//!
//! `pool` owns the connection lifecycle. Handlers acquire connections
//! per-request from the `Arc<PgPool>` wrapped by `AppState`.

pub mod helpers;
pub mod pool;

pub use pool::build_pool;
