//! Phase (阶段) HTTP handlers — CRUD with nesting support.
//!
//! Routes:
//! - `GET    /api/projects/:project_id/phases`
//! - `POST   /api/projects/:project_id/phases`
//! - `PUT    /api/phases/:id`
//! - `DELETE /api/phases/:id`

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::helpers::ensure_project_exists;
use crate::error::{AppError, AppResult};
use crate::models::{CreatePhase, Phase, UpdatePhase};
use crate::state::AppState;

pub fn project_phases_router() -> Router<AppState> {
    Router::new().route(
        "/projects/{project_id}/phases",
        get(list_by_project).post(create_for_project),
    )
}

pub fn phases_router() -> Router<AppState> {
    Router::new().route("/phases/{id}", get(get_one).put(update).delete(remove))
}

async fn list_by_project(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
) -> AppResult<Json<Vec<Phase>>> {
    ensure_project_exists(&pool, project_id).await?;
    let rows = sqlx::query_as::<_, Phase>(
        "SELECT id, project_id, parent_id, name, description, sort_order, \
         planned_start, planned_end, actual_start, actual_end, status, \
         created_at, updated_at \
         FROM phases WHERE project_id = $1 ORDER BY sort_order, created_at",
    )
    .bind(project_id)
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows))
}

async fn create_for_project(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
    Json(input): Json<CreatePhase>,
) -> AppResult<impl IntoResponse> {
    if input.name.trim().is_empty() {
        return Err(AppError::BadRequest("name must not be empty".into()));
    }
    ensure_project_exists(&pool, project_id).await?;

    let row = sqlx::query_as::<_, Phase>(
        "INSERT INTO phases (project_id, parent_id, name, description, sort_order, \
         planned_start, planned_end, status) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) \
         RETURNING id, project_id, parent_id, name, description, sort_order, \
         planned_start, planned_end, actual_start, actual_end, status, \
         created_at, updated_at",
    )
    .bind(project_id)
    .bind(input.parent_id)
    .bind(&input.name)
    .bind(input.description.as_ref())
    .bind(input.sort_order.unwrap_or(0))
    .bind(input.planned_start)
    .bind(input.planned_end)
    .bind(input.status.as_deref().unwrap_or("pending"))
    .fetch_one(&pool)
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

async fn get_one(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Phase>> {
    let row = sqlx::query_as::<_, Phase>(
        "SELECT id, project_id, parent_id, name, description, sort_order, \
         planned_start, planned_end, actual_start, actual_end, status, \
         created_at, updated_at FROM phases WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("phase {id} not found")))?;
    Ok(Json(row))
}

async fn update(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(input): Json<UpdatePhase>,
) -> AppResult<Json<Phase>> {
    let row = sqlx::query_as::<_, Phase>(
        "UPDATE phases SET \
         name = COALESCE($2, name), \
         description = COALESCE($3, description), \
         sort_order = COALESCE($4, sort_order), \
         planned_start = COALESCE($5, planned_start), \
         planned_end = COALESCE($6, planned_end), \
         actual_start = COALESCE($7, actual_start), \
         actual_end = COALESCE($8, actual_end), \
         status = COALESCE($9, status), \
         updated_at = NOW() \
         WHERE id = $1 \
         RETURNING id, project_id, parent_id, name, description, sort_order, \
         planned_start, planned_end, actual_start, actual_end, status, \
         created_at, updated_at",
    )
    .bind(id)
    .bind(input.name.as_ref())
    .bind(input.description.as_ref())
    .bind(input.sort_order)
    .bind(input.planned_start)
    .bind(input.planned_end)
    .bind(input.actual_start)
    .bind(input.actual_end)
    .bind(input.status.as_ref())
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("phase {id} not found")))?;
    Ok(Json(row))
}

async fn remove(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    // DB cascade deletes child phases automatically (parent_id ON DELETE CASCADE)
    let res = sqlx::query!("DELETE FROM phases WHERE id = $1", id)
        .execute(&pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("phase {id} not found")));
    }
    Ok(StatusCode::NO_CONTENT)
}
