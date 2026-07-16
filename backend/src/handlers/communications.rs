//! Communication (沟通记录) HTTP handlers.
//!
//! Two route shapes are exported:
//! 1. **Nested under a project** (preferred for write-side):
//!    - `GET  /api/projects/:project_id/communications`
//!    - `POST /api/projects/:project_id/communications`
//! 2. **Flat by id** (so the UI can patch a single record without
//!    scrolling the whole project tree):
//!    - `GET    /api/communications/:id`
//!    - `PUT    /api/communications/:id`
//!    - `DELETE /api/communications/:id`
//!
//! The flat endpoint rejects IDs that don't exist with 404, not 500.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::helpers::ensure_project_exists;
use crate::error::{AppError, AppResult};
use crate::models::{
    Communication, CommunicationWithProject, CreateCommunication, UpdateCommunication,
};
use crate::state::AppState;

/// Nested router — mounted under `/api/projects/:project_id`.
pub fn project_communications_router() -> Router<AppState> {
    Router::new().route(
        "/projects/{project_id}/communications",
        get(list_by_project).post(create_for_project),
    )
}

/// Flat router — mounted under `/api/communications`.
pub fn communications_router() -> Router<AppState> {
    Router::new()
        .route("/communications/recent", get(list_recent))
        .route("/communications/search", get(search))
        .route(
            "/communications/{id}",
            get(get_one).put(update).delete(remove),
        )
}

/// `GET /api/projects/:project_id/communications`
async fn list_by_project(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
) -> AppResult<Json<Vec<Communication>>> {
    ensure_project_exists(&pool, project_id).await?;

    let rows = sqlx::query_as!(
        Communication,
        r#"SELECT id,
                  project_id,
                  content,
                  occurred_at,
                  participants,
                  conclusion,
                  created_at
           FROM communications
           WHERE project_id = $1
           ORDER BY occurred_at DESC"#,
        project_id
    )
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows))
}

/// `POST /api/projects/:project_id/communications`
async fn create_for_project(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
    Json(input): Json<CreateCommunication>,
) -> AppResult<impl IntoResponse> {
    if input.content.trim().is_empty() {
        return Err(AppError::BadRequest("content must not be empty".into()));
    }
    ensure_project_exists(&pool, project_id).await?;

    let row = sqlx::query_as!(
        Communication,
        r#"INSERT INTO communications (
               project_id, content, occurred_at, participants, conclusion
           )
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, project_id, content, occurred_at,
                     participants, conclusion, created_at"#,
        project_id,
        input.content,
        input.occurred_at,
        input.participants,
        input.conclusion,
    )
    .fetch_one(&pool)
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

/// `GET /api/communications/:id`
async fn get_one(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Communication>> {
    let row = sqlx::query_as!(
        Communication,
        r#"SELECT id, project_id, content, occurred_at,
                  participants, conclusion, created_at
           FROM communications WHERE id = $1"#,
        id
    )
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("communication {id} not found")))?;
    Ok(Json(row))
}

/// `PUT /api/communications/:id`
async fn update(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(input): Json<UpdateCommunication>,
) -> AppResult<Json<Communication>> {
    if let Some(content) = &input.content
        && content.trim().is_empty()
    {
        return Err(AppError::BadRequest("content must not be empty".into()));
    }

    let row = sqlx::query_as!(
        Communication,
        r#"UPDATE communications
           SET content      = COALESCE($2, content),
               occurred_at  = COALESCE($3, occurred_at),
               participants = COALESCE($4, participants),
               conclusion   = COALESCE($5, conclusion)
           WHERE id = $1
           RETURNING id, project_id, content, occurred_at,
                     participants, conclusion, created_at"#,
        id,
        input.content,
        input.occurred_at,
        input.participants,
        input.conclusion,
    )
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("communication {id} not found")))?;

    Ok(Json(row))
}

/// `DELETE /api/communications/:id`
async fn remove(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let res = sqlx::query!("DELETE FROM communications WHERE id = $1", id)
        .execute(&pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("communication {id} not found")));
    }
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct RecentParams {
    limit: Option<i64>,
}

/// `GET /api/communications/recent?limit=10`
async fn list_recent(
    State(pool): State<PgPool>,
    Query(params): Query<RecentParams>,
) -> AppResult<Json<Vec<CommunicationWithProject>>> {
    let limit = params.limit.unwrap_or(10).clamp(1, 50);
    let rows = sqlx::query_as::<_, CommunicationWithProject>(
        "SELECT c.id, c.project_id, p.name as project_name, c.content, \
                c.occurred_at, c.participants, c.conclusion, c.created_at \
         FROM communications c \
         JOIN projects p ON c.project_id = p.id \
         ORDER BY c.occurred_at DESC \
         LIMIT $1",
    )
    .bind(limit)
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
struct SearchParams {
    q: String,
    limit: Option<i64>,
}

/// `GET /api/communications/search?q=xxx`
async fn search(
    State(pool): State<PgPool>,
    Query(params): Query<SearchParams>,
) -> AppResult<Json<Vec<CommunicationWithProject>>> {
    let pattern = format!("%{}%", params.q);
    let limit = params.limit.unwrap_or(20).clamp(1, 100);
    let rows = sqlx::query_as::<_, CommunicationWithProject>(
        "SELECT c.id, c.project_id, p.name as project_name, c.content, \
                c.occurred_at, c.participants, c.conclusion, c.created_at \
         FROM communications c \
         JOIN projects p ON c.project_id = p.id \
         WHERE c.content ILIKE $1 \
            OR c.conclusion ILIKE $1 \
            OR c.participants ILIKE $1 \
         ORDER BY c.occurred_at DESC \
         LIMIT $2",
    )
    .bind(&pattern)
    .bind(limit)
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows))
}
