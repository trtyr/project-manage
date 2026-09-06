//! Authentication HTTP handlers + fail-closed route guard.
//!
//! Endpoints:
//! - `GET  /api/auth/status`   — public probe: `{needs_setup}`
//! - `POST /api/auth/setup`    — public, ONLY when the users table is empty
//! - `POST /api/auth/login`    — public, argon2id verify, starts a session
//! - `POST /api/auth/logout`   — destroys the session
//! - `GET  /api/auth/me`       — returns UserPublic
//! - `POST /api/auth/password` — change password (requires current one);
//!   revokes every other session of the user
//!
//! `logout`/`me`/`password` are mounted on the public auth router but
//! self-guard: they resolve the session themselves and answer 401 when
//! unauthenticated (same pattern as `me`). Business routes instead rely
//! on the `require_auth` middleware mounted in `app::build_app` over
//! everything except the whitelist (health + status + setup + login).
//!
//! Hardening:
//! - Sessions are tower-sessions cookies holding only `user_id` — never
//!   password material. The session id is cycled on login/setup and after
//!   a password change (session-fixation defense).
//! - `LoginThrottle` locks logins for 15 minutes after 5 consecutive
//!   failures (single-user deployment → the counter is deliberately
//!   global, which also blunts distributed guessing).
//! - Unknown usernames still run one argon2 verification against a dummy
//!   hash, so response timing does not reveal whether the account exists.
//! - `user_sessions` (migration 024) maps session id → user so a password
//!   change can revoke exactly that user's other sessions.

use std::{
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};

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
use crate::models::user::{ChangePasswordRequest, SetupRequest, User, UserPublic};
use crate::state::AppState;

/// Session key holding the authenticated user's id.
const USER_ID_KEY: &str = "user_id";

/// 30-day sliding session (goal contract: long session, logout kills it).
/// Configured once on the session layer in `main`; the constant is kept
/// here as the single source of truth for the policy.
pub const SESSION_TTL_SECS: i64 = 30 * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Login throttle (brute-force guard)
// ---------------------------------------------------------------------------

/// Consecutive failed logins before the lockout kicks in.
pub const LOGIN_MAX_FAILURES: u32 = 5;
/// How long logins stay rejected once the failure budget is spent.
pub const LOGIN_LOCKOUT_SECS: u64 = 15 * 60;

#[derive(Default)]
struct ThrottleState {
    consecutive_failures: u32,
    locked_until: Option<Instant>,
}

/// In-memory, process-global failure counter. Deliberately not per-IP:
/// with a single account every unknown caller is the same adversary, and
/// a global counter also covers distributed attempts. A restart clears
/// the lockout (fail-open) — the password itself stays the real control.
#[derive(Clone, Default)]
pub struct LoginThrottle {
    state: Arc<Mutex<ThrottleState>>,
}

impl LoginThrottle {
    pub fn new() -> Self {
        Self::default()
    }

    /// Is a login attempt allowed right now?
    pub fn check(&self) -> bool {
        let mut st = self.state.lock().expect("login throttle mutex poisoned");
        if let Some(until) = st.locked_until {
            if Instant::now() < until {
                return false;
            }
            // Lockout elapsed — reset the window.
            st.locked_until = None;
            st.consecutive_failures = 0;
        }
        true
    }

    pub fn record_failure(&self) {
        let mut st = self.state.lock().expect("login throttle mutex poisoned");
        st.consecutive_failures = st.consecutive_failures.saturating_add(1);
        if st.consecutive_failures >= LOGIN_MAX_FAILURES {
            st.locked_until = Some(Instant::now() + Duration::from_secs(LOGIN_LOCKOUT_SECS));
            tracing::warn!(
                failures = st.consecutive_failures,
                lockout_secs = LOGIN_LOCKOUT_SECS,
                "login attempts locked after repeated failures"
            );
        }
    }

    pub fn record_success(&self) {
        let mut st = self.state.lock().expect("login throttle mutex poisoned");
        st.consecutive_failures = 0;
        st.locked_until = None;
    }
}

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
        .and_then(|parsed| {
            Argon2::default()
                .verify_password(password.as_bytes(), &parsed)
                .ok()
        })
        .is_some()
}

/// Lazily-built PHC hash of a throwaway string. When the username is
/// unknown, login still runs one argon2 verification against this so the
/// response time matches the known-user path (no username-existence
/// oracle via timing).
static DUMMY_HASH: OnceLock<String> = OnceLock::new();
fn dummy_hash() -> &'static str {
    DUMMY_HASH.get_or_init(|| {
        Argon2::default()
            .hash_password(
                b"timing-equalizer-not-a-password",
                &SaltString::generate(&mut OsRng),
            )
            .map(|h| h.to_string())
            .unwrap_or_default()
    })
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
///
/// The session id is cycled so a pre-login anonymous cookie (possibly a
/// fixation attempt) never survives authentication. tower-sessions only
/// materialises the new id when the layer saves the response, so the
/// `user_sessions` ownership row is written later — by `require_auth` and
/// `me` on the session's first authenticated use.
async fn start_session(session: &Session, user_id: uuid::Uuid) -> AppResult<()> {
    session
        .insert(USER_ID_KEY, user_id)
        .await
        .map_err(|e| AppError::BadRequest(format!("failed to write session: {e}")))?;
    session
        .cycle_id()
        .await
        .map_err(|e| AppError::BadRequest(format!("failed to cycle session id: {e}")))?;
    Ok(())
}

/// Record the session → user ownership row backing "revoke all other
/// sessions" on password change. tower-sessions' `session` table carries
/// no user column, and the post-login session id is unknowable inside the
/// login handler, so ownership is written on authenticated use instead.
/// Best-effort: a failed upsert logs and continues — it must never break
/// an authorised request.
async fn record_session_owner(pool: &PgPool, session: &Session, user_id: uuid::Uuid) {
    if let Some(id) = session.id() {
        let res = sqlx::query(
            "INSERT INTO user_sessions (session_id, user_id) VALUES ($1, $2) \
             ON CONFLICT (session_id) DO UPDATE SET user_id = EXCLUDED.user_id",
        )
        .bind(id.to_string())
        .bind(user_id)
        .execute(pool)
        .await;
        if let Err(err) = res {
            tracing::warn!(error = %err, "user_sessions upsert failed (non-fatal)");
        }
    }
}

/// Resolve the current session's user id (if any).
async fn session_user_id(session: &Session) -> AppResult<Option<uuid::Uuid>> {
    session
        .get(USER_ID_KEY)
        .await
        .map_err(|e| AppError::BadRequest(format!("failed to read session: {e}")))
}

/// Resolve the current session's user (if any) to a public projection.
async fn current_user(pool: &PgPool, session: &Session) -> AppResult<Option<UserPublic>> {
    let Some(user_id) = session_user_id(session).await? else {
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
        return Err(AppError::BadRequest(
            "password must be at least 8 characters".into(),
        ));
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
    Ok((
        StatusCode::CREATED,
        Json(UserPublic {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            created_at: user.created_at,
        }),
    ))
}

/// `POST /api/auth/login` — public. Generic 401 (no user enumeration).
/// Locked out after `LOGIN_MAX_FAILURES` consecutive failures; unknown
/// usernames still burn one argon2 verification (no timing oracle).
async fn login(
    State(pool): State<PgPool>,
    State(throttle): State<LoginThrottle>,
    session: Session,
    Json(input): Json<LoginBody>,
) -> AppResult<Json<UserPublic>> {
    if !throttle.check() {
        return Err(AppError::RateLimited(format!(
            "too many failed login attempts — try again in {LOGIN_LOCKOUT_SECS} seconds"
        )));
    }

    let username = normalize_username(&input.username);
    let user: Option<User> = sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, display_name, created_at, updated_at \
         FROM users WHERE username = $1",
    )
    .bind(&username)
    .fetch_optional(&pool)
    .await?;

    // Always run exactly one argon2 verification, even when the user is
    // unknown — otherwise the fast 401 reveals valid usernames.
    let verify_target = user
        .as_ref()
        .map(|u| u.password_hash.clone())
        .unwrap_or_else(|| dummy_hash().to_string());
    let password_ok = verify_password(&verify_target, &input.password);

    let Some(user) = user.filter(|_| password_ok) else {
        throttle.record_failure();
        return Err(AppError::Unauthorized(
            "invalid username or password".into(),
        ));
    };
    throttle.record_success();

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
async fn logout(State(pool): State<PgPool>, session: Session) -> AppResult<StatusCode> {
    if let Some(id) = session.id() {
        // Best-effort mapping cleanup; the startup purge sweeps orphans.
        sqlx::query("DELETE FROM user_sessions WHERE session_id = $1")
            .bind(id.to_string())
            .execute(&pool)
            .await?;
    }
    session
        .delete()
        .await
        .map_err(|e| AppError::BadRequest(format!("failed to delete session: {e}")))?;
    Ok(StatusCode::NO_CONTENT)
}

/// `GET /api/auth/me` — authenticated (self-guarded on the public router).
/// Also (re)anchors the session's ownership row — the SPA calls this right
/// after login, which is how a freshly-cycled session id gets mapped.
async fn me(State(pool): State<PgPool>, session: Session) -> AppResult<Json<UserPublic>> {
    let user = current_user(&pool, &session)
        .await?
        .ok_or_else(|| AppError::Unauthorized("not authenticated".into()))?;
    record_session_owner(&pool, &session, user.id).await;
    Ok(Json(user))
}

/// `POST /api/auth/password` — change the caller's password. Self-guarded
/// (the auth router sits on `public_api`), requires the current password,
/// and revokes every OTHER session of the user — a stolen session cookie
/// cannot survive a credential change. `updated_at` is left to the
/// trigger installed by migration 022.
async fn change_password(
    State(pool): State<PgPool>,
    session: Session,
    Json(input): Json<ChangePasswordRequest>,
) -> AppResult<StatusCode> {
    let Some(user_id) = session_user_id(&session).await? else {
        return Err(AppError::Unauthorized("authentication required".into()));
    };
    let user = sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, display_name, created_at, updated_at \
         FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::Unauthorized("authentication required".into()))?;

    if !verify_password(&user.password_hash, &input.current_password) {
        return Err(AppError::BadRequest("current password is incorrect".into()));
    }
    if input.new_password.len() < 8 {
        return Err(AppError::BadRequest(
            "password must be at least 8 characters".into(),
        ));
    }

    let hash = hash_password(&input.new_password)?;
    sqlx::query("UPDATE users SET password_hash = $2 WHERE id = $1")
        .bind(user_id)
        .bind(&hash)
        .execute(&pool)
        .await?;

    // Revoke this user's other sessions. Single-user today, but the
    // user_sessions mapping keeps the delete precisely scoped either way.
    if let Some(current_id) = session.id() {
        let current_id = current_id.to_string();
        sqlx::query("DELETE FROM session WHERE id IN \
                     (SELECT session_id FROM user_sessions WHERE user_id = $1 AND session_id <> $2)")
            .bind(user_id)
            .bind(&current_id)
            .execute(&pool)
            .await?;
        sqlx::query("DELETE FROM user_sessions WHERE user_id = $1 AND session_id <> $2")
            .bind(user_id)
            .bind(&current_id)
            .execute(&pool)
            .await?;
        tracing::info!(user_id = %user_id, "password changed — other sessions revoked");
    }

    // Rotate the surviving session's id as post-change hygiene.
    session
        .cycle_id()
        .await
        .map_err(|e| AppError::BadRequest(format!("failed to cycle session id: {e}")))?;

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Middleware — fail-closed guard
// ---------------------------------------------------------------------------

/// Delete expired rows from the `session` table plus any `user_sessions`
/// mappings whose session row is already gone (B15/D1: tower-sessions
/// never purges on its own — every login inserts a row and the table grew
/// unboundedly, 241 rows at audit time). Called once at startup after
/// migrations; failures are non-fatal (warn + continue). Returns the
/// number of expired session rows removed.
pub async fn purge_expired_sessions(pool: &PgPool) -> Result<u64, sqlx::Error> {
    let res = sqlx::query("DELETE FROM session WHERE expiry_date < now()")
        .execute(pool)
        .await?;
    sqlx::query(
        "DELETE FROM user_sessions us \
         WHERE NOT EXISTS (SELECT 1 FROM session s WHERE s.id = us.session_id)",
    )
    .execute(pool)
    .await?;
    Ok(res.rows_affected())
}

/// Route guard: resolve the session to a user_id, or reject with 401.
/// Mounted over all `/api/*` except the whitelist in `app::build_app`.
/// A valid session also refreshes its `user_sessions` ownership row so
/// password-change revocation stays complete.
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
    record_session_owner(&pool, &session, user_id.expect("validated above")).await;
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
        .route("/auth/password", post(change_password))
}

#[cfg(test)]
mod purge_tests {
    use super::purge_expired_sessions;

    /// B15/D1: only expired session rows are removed; fresh ones survive.
    /// `#[sqlx::test]` provisions an isolated temp database with all
    /// migrations applied, so this touches no real data.
    #[sqlx::test]
    async fn purges_only_expired_sessions(pool: sqlx::PgPool) {
        sqlx::query(
            "INSERT INTO session (id, data, expiry_date) VALUES \
             ('expired', '\\x00'::bytea, now() - interval '1 hour'), \
             ('fresh',   '\\x00'::bytea, now() + interval '1 hour')",
        )
        .execute(&pool)
        .await
        .expect("seed session rows");

        let removed = purge_expired_sessions(&pool)
            .await
            .expect("purge should succeed");
        assert_eq!(removed, 1, "exactly the expired row is removed");

        let remaining: String = sqlx::query_scalar("SELECT id FROM session")
            .fetch_one(&pool)
            .await
            .expect("one row remains");
        assert_eq!(remaining, "fresh", "the fresh session survives");
    }
}
