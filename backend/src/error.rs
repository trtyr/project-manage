//! Unified API error type.
//!
//! Every handler returns `Result<T, AppError>`. `IntoResponse` for
//! `AppError` produces a deterministic JSON shape so the React client
//! can pattern-match on `error` without needing to inspect status codes.
//!
//! Shape:
//! ```json
//! { "error": "not_found", "message": "client <uuid> not found" }
//! ```

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("{0}")]
    NotFound(String),

    #[error("{0}")]
    BadRequest(String),

    /// Surfacing `sqlx` errors with a structured mapping:
    /// - `RowNotFound` → 404 (used by `query_as!` when no row matches).
    /// - unique-violation / FK-violation → 400 with a friendlier note.
    /// - everything else → 500 (after logging).
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),

    /// Request exceeded the server-side `TimeoutLayer` deadline.
    /// Emitted by the `HandleErrorLayer` when a `tower::timeout::error::Elapsed`
    /// bubbles up the middleware stack. Mapped to HTTP 408 so clients can
    /// distinguish this from a generic 5xx.
    #[error("{0}")]
    Timeout(String),
}

impl AppError {
    fn parts(&self) -> (StatusCode, &'static str, String) {
        match self {
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, "not_found", msg.clone()),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, "bad_request", msg.clone()),
            AppError::Timeout(msg) => (StatusCode::REQUEST_TIMEOUT, "request_timeout", msg.clone()),
            AppError::Database(sqlx::Error::RowNotFound) => (
                StatusCode::NOT_FOUND,
                "not_found",
                "resource not found".to_string(),
            ),
            AppError::Database(err) => {
                // Translate common constraint violations to 400 so the user
                // gets actionable feedback rather than a generic 500.
                if let Some(db_err) = err.as_database_error() {
                    if db_err.is_unique_violation() {
                        return (
                            StatusCode::BAD_REQUEST,
                            "conflict",
                            "记录已存在或关联数据不存在".to_string(),
                        );
                    }
                    if db_err.is_foreign_key_violation() {
                        return (
                            StatusCode::BAD_REQUEST,
                            "invalid_reference",
                            "记录已存在或关联数据不存在".to_string(),
                        );
                    }
                    if db_err.is_check_violation() {
                        return (
                            StatusCode::BAD_REQUEST,
                            "check_violation",
                            format!("check constraint violated: {}", db_err.message()),
                        );
                    }
                }
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_error",
                    "database error".to_string(),
                )
            }
        }
    }
}

#[derive(Serialize)]
struct ErrorBody {
    error: &'static str,
    message: String,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message) = self.parts();
        // 5xx leaks internal details, so we log the full error server-side
        // and emit a generic message to the client.
        if status.is_server_error() {
            tracing::error!(error = ?self, "request failed with 5xx");
        }
        let body = Json(ErrorBody {
            error: code,
            message,
        });
        (status, body).into_response()
    }
}

/// Convenience wrapper for handlers.
pub type AppResult<T> = std::result::Result<T, AppError>;
