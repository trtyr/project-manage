//! Application router builder — shared by `main.rs` and integration tests.
//!
//! `build_app` is the single source of truth for the Axum `Router` shape:
//! every `.route()`, `.nest()`, `.layer()`, and `.with_state()` call from
//! the old inline `main` lives here. The binary entrypoint passes its
//! env-derived limits; the smoke tests pass constants. Either way, the
//! resulting `Router<()>` is ready for `axum::serve`.

use std::time::Duration;

use axum::{
    error_handling::HandleErrorLayer,
    extract::DefaultBodyLimit,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use serde::Serialize;
use sqlx::PgPool;
use tower::{ServiceBuilder, timeout::TimeoutLayer};
use tower_http::{
    cors::CorsLayer,
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};

use crate::error::AppError;
use crate::handlers::{
    assets_router, clients_router, communications_router, deliverables_router,
    files_router, people_router, phases_router, project_assets_router,
    project_communications_router, project_deliverables_router, project_files_router,
    project_people_router, project_phases_router, project_tasks_router,
    projects_router, search_router, tasks_router,
};
use crate::state::AppState;

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

/// Keep unmatched `/api` requests on the API's existing empty 404 path
/// instead of letting the frontend SPA fallback serve `index.html`.
async fn api_not_found() -> StatusCode {
    StatusCode::NOT_FOUND
}

/// Translate known middleware errors into the same JSON error shape as
/// handlers. The `request_timeout_secs` argument lets the error message
/// reference the configured deadline without baking the constant into a
/// free function — `build_app` is the single caller and threads the
/// value through.
async fn handle_layer_error(err: axum::BoxError, request_timeout_secs: u64) -> Response {
    if err.is::<tower::timeout::error::Elapsed>() {
        return AppError::Timeout(format!(
            "request exceeded the {request_timeout_secs}s server timeout"
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

/// Build the Axum router for the API. `pool` is consumed — it is wrapped
/// in `AppState` and attached via `.with_state()` so the router is a
/// `Router<()>` and ready to hand to `axum::serve`.
///
/// Layer order (outermost → innermost, written innermost-first in source
/// to match the convention the original `main` established):
/// 1. `cors`             — innermost of the global stack; preflight.
/// 2. `HandleErrorLayer` — catches `tower::timeout::error::Elapsed`.
/// 3. `TimeoutLayer`     — caps each request at `request_timeout_secs`.
/// 4. `TraceLayer`       — structured access log for every request.
/// 5. `DefaultBodyLimit` — enforces `body_limit_bytes` on request bodies.
///
/// Route layout:
/// 1. `/api/health`           — kept at the top for clarity.
/// 2. Flat resources          — clients / projects / communications / ...
/// 3. Nested project-scoped   — `/projects/:project_id/...`.
/// 4. Unmatched `/api` paths  — retain the API's empty 404 response.
/// 5. Unmatched non-API paths — static files with an `index.html` SPA fallback.
pub fn build_app(
    pool: PgPool,
    cors: CorsLayer,
    static_dir: &str,
    request_timeout_secs: u64,
    body_limit_bytes: usize,
) -> Router {
    let static_path = std::path::Path::new(static_dir);
    let serve_dir =
        ServeDir::new(static_path).fallback(ServeFile::new(static_path.join("index.html")));

    // Capture the timeout by move so the closure owns its own copy and
    // tower's blanket `FnMut → Service` impl provides the `Service` that
    // `HandleErrorLayer::new` needs. `u64: Copy` makes the inner uses
    // (`request_timeout_secs` here AND inside `TimeoutLayer::new`) safe.
    let handle_middleware_error = move |err: axum::BoxError| async move {
        handle_layer_error(err, request_timeout_secs).await
    };

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
        .nest("/api", project_people_router())
        .nest("/api", people_router())
        .nest("/api", search_router())
        .nest("/api", project_deliverables_router())
        .nest("/api", deliverables_router())
        .route("/api", axum::routing::any(api_not_found))
        .route("/api/", axum::routing::any(api_not_found))
        .route("/api/{*path}", axum::routing::any(api_not_found))
        .fallback_service(serve_dir)
        .layer(cors)
        .layer(
            ServiceBuilder::new()
                .layer(HandleErrorLayer::new(handle_middleware_error))
                .layer(TimeoutLayer::new(Duration::from_secs(request_timeout_secs))),
        )
        .layer(TraceLayer::new_for_http())
        .layer(DefaultBodyLimit::max(body_limit_bytes));

    let state = AppState { pool };
    app.with_state(state)
}
