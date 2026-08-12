//! Deliverable (交付物) HTTP handlers — CRUD.

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
use crate::models::{
    CreateDeliverable, Deliverable, DeliverableStatus, UpdateDeliverable,
};
use crate::state::AppState;

const COLS: &str = "id, project_id, name, status, due_date, linked_file_id, sort_order, created_at, updated_at";

pub fn project_deliverables_router() -> Router<AppState> {
    Router::new().route(
        "/projects/{project_id}/deliverables",
        get(list_by_project).post(create_for_project),
    )
}

pub fn deliverables_router() -> Router<AppState> {
    Router::new()
        .route("/deliverables/{id}", get(get_one).put(update).delete(remove))
}

async fn list_by_project(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
) -> AppResult<Json<Vec<Deliverable>>> {
    ensure_project_exists(&pool, project_id).await?;
    let rows = sqlx::query_as::<_, Deliverable>(&format!(
        "SELECT {COLS} FROM deliverables WHERE project_id = $1 ORDER BY sort_order, created_at"
    ))
    .bind(project_id)
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows))
}

async fn create_for_project(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
    Json(input): Json<CreateDeliverable>,
) -> AppResult<impl IntoResponse> {
    if input.name.trim().is_empty() {
        return Err(AppError::BadRequest("name must not be empty".into()));
    }
    let status = input
        .status
        .unwrap_or_else(|| DeliverableStatus::PENDING.to_string());
    if !DeliverableStatus::is_valid(&status) {
        return Err(AppError::BadRequest(format!(
            "invalid status, must be one of {:?}",
            DeliverableStatus::ALL
        )));
    }
    ensure_project_exists(&pool, project_id).await?;

    let row = sqlx::query_as::<_, Deliverable>(
        "INSERT INTO deliverables (project_id, name, status, due_date, linked_file_id, sort_order) \
         VALUES ($1, $2, $3, $4, $5, \
            (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM deliverables WHERE project_id = $1)) \
         RETURNING id, project_id, name, status, due_date, linked_file_id, sort_order, created_at, updated_at",
    )
    .bind(project_id)
    .bind(&input.name)
    .bind(&status)
    .bind(input.due_date)
    .bind(input.linked_file_id)
    .fetch_one(&pool)
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

async fn get_one(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> AppResult<Json<Deliverable>> {
    let row = sqlx::query_as::<_, Deliverable>(&format!(
        "SELECT {COLS} FROM deliverables WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("deliverable {id} not found")))?;
    Ok(Json(row))
}

async fn update(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(input): Json<UpdateDeliverable>,
) -> AppResult<Json<Deliverable>> {
    if let Some(status) = &input.status
        && !DeliverableStatus::is_valid(status)
    {
        return Err(AppError::BadRequest(format!(
            "invalid status, must be one of {:?}",
            DeliverableStatus::ALL
        )));
    }

    let row = sqlx::query_as::<_, Deliverable>(
        "UPDATE deliverables SET name = COALESCE($2, name), \
         status = COALESCE($3, status), due_date = COALESCE($4, due_date), \
         linked_file_id = COALESCE($5, linked_file_id), updated_at = NOW() \
         WHERE id = $1 \
         RETURNING id, project_id, name, status, due_date, linked_file_id, sort_order, created_at, updated_at",
    )
    .bind(id)
    .bind(input.name.as_ref())
    .bind(input.status.as_ref())
    .bind(input.due_date)
    .bind(input.linked_file_id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("deliverable {id} not found")))?;
    Ok(Json(row))
}

async fn remove(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> AppResult<StatusCode> {
    let res = sqlx::query!("DELETE FROM deliverables WHERE id = $1", id)
        .execute(&pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("deliverable {id} not found")));
    }
    Ok(StatusCode::NO_CONTENT)
}
