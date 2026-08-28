//! Authentication HTTP handlers + fail-closed route guard.
//!
//! Five endpoints:
//! - `GET  /api/auth/status` — public probe: `{needs_setup}`
//! - `POST /api/auth/setup`  — public, ONLY when the users table is empty
//! - `POST /api/auth/login`  — public, argon2id verify, starts a session
//! - `POST /api/auth/logout` — authenticated, destroys the session
//! - `GET  /api/auth/me`     — authenticated, returns UserPublic
//!
//! The guard `require_auth` is a `middleware::from_fn` mounted in
//! `app::build_app` over everything except the whitelist (health +
//! status + setup + login). Sessions are tower-sessions cookies holding
//! only `user_id` — never password material.

use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::IntoResponse,
    routing::{get, post},
    Json,
};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use tower_sessions::Session;

use crate::error::{AppError, AppResult};
use crate::models::user::{SetupRequest, User, UserPublic};
use crate::state::AppState;

/// Session key holding the authenticated user's id.
const USER_ID_KEY: &str = "user_id";

/// 30-day sliding session (goal contract: long session, logout kills it).
/// Configured once on the session layer in `main`; the constant is kept
/// here as the single source of truth for the policy.
pub const SESSION_TTL_SECS: i64 = 30 * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Public DTOs
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct AuthStatus {
    pub needs_setup: bool,
}

#[derive(Deserialize)]
pub struct LoginBody {
    pub username: String,
    pub password: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Normalize a username: trim + lowercase (stored & compared uniformly).
fn normalize_username(raw: &str) -> String {
    raw.trim().to_lowercase()
}

/// Hash a password with argon2id (default OWASP-grade params). Returns a
/// PHC string embedding salt + params, so future tuning needs no migration.
fn hash_password(password: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|e| AppError::BadRequest(format!("failed to hash password: {e}")))
}

/// Constant-time password verification against a stored PHC string.
fn verify_password(hash: &str, password: &str) -> bool {
    PasswordHash::new(hash)
        .ok()
        .and_then(|parsed| Argon2::default().verify_password(password.as_bytes(), &parsed).ok())
        .is_some()
}

/// Is the users table empty? (bootstrap probe)
async fn users_table_empty(pool: &PgPool) -> AppResult<bool> {
    let count: i64 = match sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await
    {
        Ok(n) => n,
        // Table not migrated yet (fresh DB before first boot) → needs setup.
        Err(sqlx::Error::Database(db)) if db.code().as_deref() == Some("42P01") => 0,
        Err(e) => return Err(e.into()),
    };
    Ok(count == 0)
}

/// Create a session for `user_id`. Called by setup & login. Expiry is set
/// layer-wide in `main` (OnInactivity = 30 days sliding); inserting the
/// user_id is all this needs to do — the layer persists on response.
async fn start_session(session: &Session, user_id: uuid::Uuid) -> AppResult<()> {
    session
        .insert(USER_ID_KEY, user_id)
        .await
        .map_err(|e| AppError::BadRequest(format!("failed to write session: {e}")))?;
    Ok(())
}

/// Resolve the current session's user (if any) to a public projection.
async fn current_user(pool: &PgPool, session: &Session) -> AppResult<Option<UserPublic>> {
    let user_id: Option<uuid::Uuid> = session
        .get(USER_ID_KEY)
        .await
        .map_err(|e| AppError::BadRequest(format!("failed to read session: {e}")))?;
    let Some(user_id) = user_id else {
        return Ok(None);
    };
    let user = sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, display_name, created_at, updated_at \
         FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    Ok(user.map(|u| UserPublic {
        id: u.id,
        username: u.username,
        display_name: u.display_name,
        created_at: u.created_at,
    }))
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// `GET /api/auth/status` — public. Frontend bootstraps off this: an empty
/// users table routes the SPA to `/setup`, otherwise to `/login`.
async fn status(State(pool): State<PgPool>) -> AppResult<Json<AuthStatus>> {
    let needs_setup = users_table_empty(&pool).await?;
    Ok(Json(AuthStatus { needs_setup }))
}

/// `POST /api/auth/setup` — public, but only while the users table is empty.
async fn setup(
    State(pool): State<PgPool>,
    session: Session,
    Json(input): Json<SetupRequest>,
) -> AppResult<impl IntoResponse> {
    if !users_table_empty(&pool).await? {
        return Err(AppError::Conflict(
            "setup already completed — an account exists".into(),
        ));
    }
    if input.password.len() < 8 {
        return Err(AppError::BadRequest("password must be at least 8 characters".into()));
    }
    let username = normalize_username(&input.username);
    if username.is_empty() {
        return Err(AppError::BadRequest("username must not be empty".into()));
    }
    let hash = hash_password(&input.password)?;
    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (username, password_hash, display_name) \
         VALUES ($1, $2, $3) \
         RETURNING id, username, password_hash, display_name, created_at, updated_at",
    )
    .bind(&username)
    .bind(&hash)
    .bind(&input.display_name)
    .fetch_one(&pool)
    .await
    // unique violation on username → 409-flavoured 400 via AppError mapping
    .map_err(AppError::from)?;

    start_session(&session, user.id).await?;
    Ok((StatusCode::CREATED, Json(UserPublic {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        created_at: user.created_at,
    })))
}

/// `POST /api/auth/login` — public. Generic 401 (no user enumeration).
async fn login(
    State(pool): State<PgPool>,
    session: Session,
    Json(input): Json<LoginBody>,
) -> AppResult<Json<UserPublic>> {
    let username = normalize_username(&input.username);
    let user: Option<User> = sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, display_name, created_at, updated_at \
         FROM users WHERE username = $1",
    )
    .bind(&username)
    .fetch_optional(&pool)
    .await?;

    let Some(user) = user.filter(|u| verify_password(&u.password_hash, &input.password)) else {
        return Err(AppError::Unauthorized("invalid username or password".into()));
    };

    start_session(&session, user.id).await?;
    Ok(Json(UserPublic {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        created_at: user.created_at,
    }))
}

/// `POST /api/auth/logout` — destroys the server-side session; the layer
/// persists the deletion (and clears the cookie) on the way out.
async fn logout(session: Session) -> AppResult<StatusCode> {
    session
        .delete()
        .await
        .map_err(|e| AppError::BadRequest(format!("failed to delete session: {e}")))?;
    Ok(StatusCode::NO_CONTENT)
}

/// `GET /api/auth/me` — authenticated (guarded upstream by require_auth).
async fn me(State(pool): State<PgPool>, session: Session) -> AppResult<Json<UserPublic>> {
    current_user(&pool, &session)
        .await?
        .map(Json)
        .ok_or_else(|| AppError::Unauthorized("not authenticated".into()))
}

// ---------------------------------------------------------------------------
// Middleware — fail-closed guard
// ---------------------------------------------------------------------------

/// Route guard: resolve the session to a user_id, or reject with 401.
/// Mounted over all `/api/*` except the whitelist in `app::build_app`.
pub async fn require_auth(
    State(pool): State<PgPool>,
    session: Session,
    request: Request,
    next: Next,
) -> AppResult<axum::response::Response> {
    let user_id: Option<uuid::Uuid> = session
        .get(USER_ID_KEY)
        .await
        .map_err(|e| AppError::Unauthorized(format!("failed to read session: {e}")))?;
    let is_valid = match user_id {
        Some(id) => {
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users WHERE id = $1")
                .bind(id)
                .fetch_one(&pool)
                .await
                .unwrap_or(0)
                > 0
        }
        None => false,
    };
    if !is_valid {
        return Err(AppError::Unauthorized("authentication required".into()));
    }
    Ok(next.run(request).await)
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn auth_router() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/auth/status", get(status))
        .route("/auth/setup", post(setup))
        .route("/auth/login", post(login))
        .route("/auth/logout", post(logout))
        .route("/auth/me", get(me))
}
