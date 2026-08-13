//! project-manage — backend entrypoint.
//!
//! Phase 2 (API layer): all resource routers are mounted under `/api`
//! inside `app::build_app`. Health check stays at `/api/health` per the
//! Phase 0 contract. This file only owns process-level concerns — env
//! loading, tracing, the DB pool, the migration runner, the listener,
//! and graceful shutdown.

use std::{path::PathBuf, time::Duration};

use axum::http::HeaderValue;
use sqlx::{migrate, PgPool};
use tokio::signal;
use tower_http::cors::{Any, CorsLayer};
use tracing::{error, info, warn};

use project_manage_backend::app::build_app;
use project_manage_backend::db;

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
        Ok(value) if !value.trim().is_empty() => {
            value.trim().parse::<usize>().unwrap_or_else(|err| {
                warn!(var, value, error = %err, "invalid value, using default");
                default
            })
        }
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

#[tokio::main]
async fn main() {
    // The server takes no arguments. If any are passed (e.g. `--help` from
    // the pre-decoupling dual-mode binary), print usage and exit rather than
    // silently trying to bind an occupied port.
    if std::env::args().nth(1).is_some() {
        eprintln!("usage: project-manage-backend  (the server takes no arguments)");
        eprintln!("       manage resources via the standalone `pm` CLI (cli/).");
        std::process::exit(2);
    }

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
                .unwrap_or_else(|_| "info,project_manage_backend=debug,sqlx=warn".into()),
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

    // 4. Runtime configuration from environment — all values have safe
    //    development defaults so `cargo run` keeps working out of the box.
    let port = env_u16("PORT", 3000);
    let max_body_size_mb = env_usize("MAX_BODY_SIZE_MB", 100);
    let body_limit_bytes = max_body_size_mb.saturating_mul(1024 * 1024);
    let static_dir = std::env::var("STATIC_DIR")
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("./static"));

    info!(static_dir = %static_dir.display(), "static file serving enabled");
    if !static_dir.is_dir() {
        warn!(
            static_dir = %static_dir.display(),
            "static directory does not exist or is not a directory; frontend assets will be unavailable"
        );
    }

    let cors = build_cors_layer();

    if std::env::var("CORS_ALLOWED_ORIGINS").is_err() {
        info!("CORS_ALLOWED_ORIGINS not set; allowing Any origin (development default)");
    }

    // 5. Router. The full route layout, layer stack, and state attachment
    //    live in `app::build_app` so integration tests can construct the
    //    same `Router<()>` without going through this `main`.
    let app = build_app(
        pool.clone(),
        cors,
        &static_dir.to_string_lossy(),
        REQUEST_TIMEOUT_SECS,
        body_limit_bytes,
    );

    let bind_addr = format!("0.0.0.0:{port}");
    let listener = match tokio::net::TcpListener::bind(&bind_addr).await {
        Ok(listener) => listener,
        Err(err) => {
            error!("❌ 端口 {port} 已被占用：{err}",);
            eprintln!();
            eprintln!("  💡 解决方法：");
            eprintln!("      just stop          # 停止占用端口的旧进程");
            eprintln!("      PORT=3001 cargo run # 换一个端口启动");
            eprintln!();
            std::process::exit(1);
        }
    };

    info!(
        addr = %bind_addr,
        body_limit_mb = max_body_size_mb,
        request_timeout_secs = REQUEST_TIMEOUT_SECS,
        "🚀 project-manage 后端已启动"
    );

    // 6. Graceful shutdown. `build_app` already consumed its own clone of
    //    the pool; we keep the original here so the shutdown future can
    //    call `close().await` without disturbing the serving path. On
    //    SIGINT or SIGTERM we await in-flight requests, log the event,
    //    then drain the pool cleanly.
    let shutdown_pool = pool;

    // Spawn the server so we can probe the health endpoint before declaring
    // the process "ready". The spawned task owns both the serving loop and
    // the graceful-shutdown future, so its lifetime is the server's lifetime.
    // `.into_future()` converts the `IntoFuture` returned by axum into a
    // concrete `Future` that `tokio::spawn` can drive.
    let server = axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            shutdown_signal().await;
            info!("shutdown signal received");
            shutdown_pool.close().await;
            info!("pool closed");
        })
        .into_future();
    let server_handle = tokio::spawn(server);

    // 7. Startup readiness self-check. Hitting `/api/health` over loopback
    //    confirms the listener is accepting connections and the router is
    //    actually serving — stronger evidence than "we called axum::serve".
    //    Failures are non-fatal: any runtime issue will surface on the next
    //    real request, and the operator still benefits from the warning.
    match reqwest::Client::new()
        .get(format!("http://127.0.0.1:{port}/api/health"))
        .timeout(Duration::from_secs(2))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            info!("✅ 就绪检查通过 — 服务已完全启动，可接受请求");
        }
        Ok(resp) => {
            warn!("⚠️  就绪检查返回 {}", resp.status());
        }
        Err(err) => {
            warn!("⚠️  就绪检查失败: {err}（服务可能仍在启动中）");
        }
    }

    server_handle
        .await
        .expect("server task panicked")
        .expect("服务器在运行期间异常退出");
}
