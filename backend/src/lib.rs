//! project-manage backend library.
//!
//! Exposes every module the binary entrypoint (`src/main.rs`) and the
//! integration tests (`tests/smoke.rs`) need. The binary only owns
//! process-level concerns — env loading, tracing, the DB pool, the
//! migration runner, the listener, and graceful shutdown. Everything
//! else lives behind the library so the smoke tests can exercise it
//! through the public surface (notably `app::build_app`).

pub mod app;
pub mod db;
pub mod error;
pub mod handlers;
pub mod models;
pub mod state;
