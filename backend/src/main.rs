//! sec-tracker — backend entrypoint.
//!
//! Phase 2 (API layer): all four resource routers are mounted under
//! `/api`. Health check stays at `/api/health` per the Phase 0 contract.
mod db;
mod error;
mod handlers;
mod models;
mod state;

use std::time::Duration;

use axum::{
    error_handling::HandleErrorLayer,
    extract::DefaultBodyLimit,
    http::{HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use serde::Serialize;
use sqlx::{migrate, PgPool};
use tokio::signal;
use tower::{ServiceBuilder, timeout::TimeoutLayer};
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};
use tracing::{info, warn};

use crate::error::AppError;
use crate::handlers::{
    assets_router, clients_router, communications_router, contacts_router, files_router,
    members_router, phases_router, project_assets_router, project_communications_router,
    project_contacts_router, project_files_router, project_members_router,
    project_phases_router, project_tasks_router, projects_router, tasks_router,
};
use crate::state::AppState;

/// Per-attempt backoff (seconds) for the startup DB bootstrap.
/// One initial attempt + these retries means up to 6 attempts total,
/// separated by delays `1, 2, 4, 8, 16` seconds.
const STARTUP_RETRY_DELAYS_SECS: [u64; 5] = [1, 2, 4, 8, 16];

/// Server-wide per-request timeout (seconds).
const REQUEST_TIMEOUT_SECS: u64 = 30;

/// Read `var` as a `usize`; fall back to `default` when unset, empty, or
/// not parseable. Keeps misconfigured environments from panicking on boot.
fn env_usize(var: &str, default: usize) -> usize {
    match std::env::var(var) {
        Ok(value) if !value.trim().is_empty() => value.trim().parse::<usize>().unwrap_or_else(|err| {
            warn!(var, value, error = %err, "invalid value, using default");
            default
        }),
        _ => default,
    }
}

/// Read `var` as a `u16`; fall back to `default` when unset, empty,
/// non-numeric, or out of range.
fn env_u16(var: &str, default: u16) -> u16 {
    match std::env::var(var) {
        Ok(value) if !value.trim().is_empty() => {
            let trimmed = value.trim();
            match trimmed.parse::<u32>() {
                Ok(n) if n <= u16::MAX as u32 => n as u16,
                _ => {
                    warn!(var, value = trimmed, "invalid value, using default");
                    default
                }
            }
        }
        _ => default,
    }
}

/// Build the CORS layer from `CORS_ALLOWED_ORIGINS`.
///
/// Semantics:
/// - unset or empty          → permissive `Any` (matches the development default).
/// - exactly `"*"`           → permissive `Any` (explicit allow-all).
/// - comma-separated list    → allow only those origins. Malformed entries
///   are dropped with a warning instead of failing
///   boot. Use plain origins like
///   `https://app.example.com,https://staging.example.com`.
fn build_cors_layer() -> CorsLayer {
    let raw = std::env::var("CORS_ALLOWED_ORIGINS").unwrap_or_default();

    if raw.trim().is_empty() || raw.trim() == "*" {
        return CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any);
    }

    let origins: Vec<HeaderValue> = raw
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .filter_map(|s| match HeaderValue::from_str(s) {
            Ok(hv) => Some(hv),
            Err(err) => {
                warn!(origin = s, error = %err, "ignoring invalid CORS origin");
                None
            }
        })
        .collect();

    if origins.is_empty() {
        warn!("CORS_ALLOWED_ORIGINS produced no valid entries, falling back to Any");
        return CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any);
    }

    CorsLayer::new()
        .allow_origin(origins)
        .allow_methods(Any)
        .allow_headers(Any)
}

/// Run `op` with bounded retry + exponential backoff.
///
/// The first attempt runs immediately. On failure the loop sleeps
/// `STARTUP_RETRY_DELAYS_SECS[i]` (1, 2, 4, 8, 16 s) and retries up to
/// `STARTUP_RETRY_DELAYS_SECS.len()` more times. If every attempt fails,
/// the last error is returned — the caller is expected to panic, since
/// the process genuinely cannot start.
async fn retry_with_backoff<F, Fut, T, E>(label: &str, mut op: F) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, E>>,
    E: std::fmt::Display,
{
    let mut last_err: Option<E> = match op().await {
        Ok(value) => return Ok(value),
        Err(err) => {
            warn!(operation = label, attempt = 1, error = %err, "operation failed");
            Some(err)
        }
    };

    for (i, &delay_secs) in STARTUP_RETRY_DELAYS_SECS.iter().enumerate() {
        tokio::time::sleep(Duration::from_secs(delay_secs)).await;
        match op().await {
            Ok(value) => return Ok(value),
            Err(err) => {
                warn!(
                    operation = label,
                    retry = i + 1,
                    delay_secs,
                    error = %err,
                    "retry failed"
                );
                last_err = Some(err);
            }
        }
    }

    Err(last_err.expect("at least one attempt is made"))
}

/// Build the pool with bounded retry; panic only after every attempt
/// has failed. A transient DB outage at startup therefore no longer kills
/// the process on first contact.
async fn build_pool_with_retry() -> PgPool {
    retry_with_backoff("build_db_pool", db::build_pool)
        .await
        .unwrap_or_else(|err| {
            panic!(
                "failed to build PostgreSQL pool after {} attempts (initial + {} retries): {}",
                STARTUP_RETRY_DELAYS_SECS.len() + 1,
                STARTUP_RETRY_DELAYS_SECS.len(),
                err
            )
        })
}

/// Run migrations with bounded retry; panic only after every attempt
/// has failed. `Migrator::run` is idempotent against the `_sqlx_migrations`
/// bookkeeping table, so retries are safe even after a partially applied batch.
async fn run_migrations_with_retry(pool: &PgPool) {
    let migrator = migrate::Migrator::new(std::path::Path::new("./migrations"))
        .await
        .expect("failed to load migrations");

    retry_with_backoff("run_migrations", || migrator.run(pool))
        .await
        .unwrap_or_else(|err| {
            panic!(
                "failed to run migrations after {} attempts (initial + {} retries): {}",
                STARTUP_RETRY_DELAYS_SECS.len() + 1,
                STARTUP_RETRY_DELAYS_SECS.len(),
                err
            )
        });
}

/// Translate known middleware errors into the same JSON error shape as handlers.
async fn handle_layer_error(err: axum::BoxError) -> Response {
    if err.is::<tower::timeout::error::Elapsed>() {
        return AppError::Timeout(format!(
            "request exceeded the {REQUEST_TIMEOUT_SECS}s server timeout"
        ))
        .into_response();
    }

    tracing::error!(error = %err, "request middleware failed");
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({
            "error": "internal_error",
            "message": "internal server error",
        })),
    )
        .into_response()
}

/// Wait for SIGTERM (orchestrator) or Ctrl-C / SIGINT (operator).
///
/// On Unix both handlers are installed via `tokio::signal::unix::Signal`.
/// On non-Unix targets the SIGTERM arm becomes a pending future and only
/// the Ctrl-C arm remains active — keeps `cargo run` working on dev boxes.
async fn shutdown_signal() {
    let ctrl_c = async {
        if let Err(err) = signal::ctrl_c().await {
            warn!(error = %err, "failed to install Ctrl-C handler");
        }
    };

    #[cfg(unix)]
    let terminate = async {
        match signal::unix::signal(signal::unix::SignalKind::terminate()) {
            Ok(mut sig) => {
                sig.recv().await;
            }
            Err(err) => {
                warn!(error = %err, "failed to install SIGTERM handler");
                std::future::pending::<()>().await;
            }
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {}
        _ = terminate => {}
    }
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    version: &'static str,
}

/// `GET /api/health` — kept stable from Phase 0. Do not change the path
/// or response shape; the frontend Vite proxy may pin to it during boot.
async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    })
}

#[tokio::main]
async fn main() {
    // 1. Load .env first so DATABASE_URL is visible to both the macros
    //    (during the build that produced this binary) and the runtime pool.
    //    We tolerate a missing .env so the binary still runs from a
    //    production environment where env vars are injected externally.
    if let Err(error) = dotenvy::dotenv() {
        tracing::debug!(error = %error, "optional .env file was not loaded");
    }

    // 2. Tracing — `RUST_LOG` honoured if set; otherwise a sensible default.
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,sec_tracker_backend=debug,sqlx=warn".into()),
        )
        .init();

    // 3. Build the DB pool, then apply any pending migrations from the
    //    `migrations/` directory. `Migrator::new("./migrations")` loads
    //    them at runtime; `sqlx::migrate!()` is an alternative that
    //    embeds them at compile time. We use the runtime version here
    //    so the SQL files stay readable / diffable in `git`.
    //    Both steps run with bounded retry so a transient DB outage at
    //    startup doesn't immediately kill the process.
    let pool = build_pool_with_retry().await;

    run_migrations_with_retry(&pool).await;
    info!("✅ database migrations applied");

    let state = AppState { pool };

    // 4. Runtime configuration from environment — all values have safe
    //    development defaults so `cargo run` keeps working out of the box.
    let port = env_u16("PORT", 3000);
    let max_body_size_mb = env_usize("MAX_BODY_SIZE_MB", 100);
    let body_limit_bytes = max_body_size_mb.saturating_mul(1024 * 1024);

    let cors = build_cors_layer();

    if std::env::var("CORS_ALLOWED_ORIGINS").is_err() {
        info!("CORS_ALLOWED_ORIGINS not set; allowing Any origin (development default)");
    }

    // 5. Router. Layer order (outermost → innermost, written innermost-first
    //    in source to preserve the convention used in earlier phases):
    //    a. `cors`                       — innermost of the global stack;
    //                                       handles preflight responses.
    //    b. `HandleErrorLayer`           — catches `tower::timeout::error::Elapsed`
    //                                       from the TimeoutLayer below it.
    //    c. `TimeoutLayer`               — caps each request at
    //                                       `REQUEST_TIMEOUT_SECS` (30 s).
    //    d. `TraceLayer::new_for_http()` — structured access log for every
    //                                       request, including timed-out ones.
    //    e. `DefaultBodyLimit::max`      — enforces `MAX_BODY_SIZE_MB`
    //                                       on request bodies (uploads).
    //
    //    Route layout (unchanged from Phase 2):
    //    1. `/api/health`           — kept at the top for clarity.
    //    2. Flat resources          — clients/projects/communications/...
    //    3. Nested project-scoped   — `/projects/:project_id/...`.
    //
    //    Nested routes use `/projects/:project_id/...` paths that don't
    //    collide with `/projects/:id`, so axum dispatches them independently.
    let app = Router::new()
        .route("/api/health", get(health))
        // All resource routers expose paths like `/clients`, `/projects/{id}`,
        // etc. — they get the `/api` prefix via `nest` so the React client
        // reaches them at the agreed `/api/...` endpoints.
        .nest("/api", clients_router())
        .nest("/api", projects_router())
        .nest("/api", communications_router())
        .nest("/api", tasks_router())
        .nest("/api", project_communications_router())
        .nest("/api", project_tasks_router())
        .nest("/api", project_assets_router())
        .nest("/api", assets_router())
        .nest("/api", project_files_router())
        .nest("/api", files_router())
        .nest("/api", project_phases_router())
        .nest("/api", phases_router())
        .nest("/api", project_members_router())
        .nest("/api", members_router())
        .nest("/api", project_contacts_router())
        .nest("/api", contacts_router())
        .layer(cors)
        .layer(
            ServiceBuilder::new()
                .layer(HandleErrorLayer::new(handle_layer_error))
                .layer(TimeoutLayer::new(Duration::from_secs(REQUEST_TIMEOUT_SECS))),
        )
        .layer(TraceLayer::new_for_http())
        .layer(DefaultBodyLimit::max(body_limit_bytes))
        .with_state(state.clone());

    let bind_addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&bind_addr)
        .await
        .unwrap_or_else(|err| panic!("无法绑定端口 {bind_addr}: {err}"));

    info!(
        addr = %bind_addr,
        body_limit_mb = max_body_size_mb,
        request_timeout_secs = REQUEST_TIMEOUT_SECS,
        "🚀 sec-tracker 后端已启动"
    );

    // 6. Graceful shutdown. The original pool is moved into `AppState` and
    //    `axum::serve` keeps using it for live requests; we clone it here so
    //    the shutdown future can call `close().await` without disturbing the
    //    serving path. On SIGINT or SIGTERM we await in-flight requests,
    //    log the event, then drain the pool cleanly.
    let shutdown_pool = state.pool.clone();

    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            shutdown_signal().await;
            info!("shutdown signal received");
            shutdown_pool.close().await;
            info!("pool closed");
        })
        .await
        .expect("服务器在运行期间异常退出");
}
