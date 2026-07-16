//! Asset (资产) HTTP handlers.
//!
//! Routes:
//! - `GET    /api/projects/:project_id/assets`
//! - `POST   /api/projects/:project_id/assets`
//! - `PUT    /api/assets/:id`
//! - `DELETE /api/assets/:id`

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
use crate::models::{Asset, CreateAsset, UpdateAsset};
use crate::state::AppState;

pub fn project_assets_router() -> Router<AppState> {
    Router::new().route(
        "/projects/{project_id}/assets",
        get(list_by_project).post(create_for_project),
    )
}

pub fn assets_router() -> Router<AppState> {
    Router::new().route("/assets/{id}", get(get_one).put(update).delete(remove))
}

async fn list_by_project(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
) -> AppResult<Json<Vec<Asset>>> {
    ensure_project_exists(&pool, project_id).await?;
    let rows = sqlx::query_as::<_, Asset>(
        "SELECT id, project_id, name, asset_type, value, description, created_at, updated_at \
         FROM assets WHERE project_id = $1 ORDER BY created_at DESC",
    )
    .bind(project_id)
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows))
}

async fn create_for_project(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
    Json(input): Json<CreateAsset>,
) -> AppResult<impl IntoResponse> {
    if input.name.trim().is_empty() {
        return Err(AppError::BadRequest("name must not be empty".into()));
    }
    ensure_project_exists(&pool, project_id).await?;

    let row = sqlx::query_as::<_, Asset>(
        "INSERT INTO assets (project_id, name, asset_type, value, description) \
         VALUES ($1, $2, $3, $4, $5) \
         RETURNING id, project_id, name, asset_type, value, description, created_at, updated_at",
    )
    .bind(project_id)
    .bind(&input.name)
    .bind(input.asset_type.as_deref().unwrap_or("other"))
    .bind(input.value.as_ref())
    .bind(input.description.as_ref())
    .fetch_one(&pool)
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

async fn get_one(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Asset>> {
    let row = sqlx::query_as::<_, Asset>(
        "SELECT id, project_id, name, asset_type, value, description, created_at, updated_at \
         FROM assets WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("asset {id} not found")))?;
    Ok(Json(row))
}

async fn update(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(input): Json<UpdateAsset>,
) -> AppResult<Json<Asset>> {
    let row = sqlx::query_as::<_, Asset>(
        "UPDATE assets SET name = COALESCE($2, name), \
         asset_type = COALESCE($3, asset_type), value = COALESCE($4, value), \
         description = COALESCE($5, description), updated_at = NOW() \
         WHERE id = $1 \
         RETURNING id, project_id, name, asset_type, value, description, created_at, updated_at",
    )
    .bind(id)
    .bind(input.name.as_ref())
    .bind(input.asset_type.as_ref())
    .bind(input.value.as_ref())
    .bind(input.description.as_ref())
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("asset {id} not found")))?;
    Ok(Json(row))
}

async fn remove(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let res = sqlx::query!("DELETE FROM assets WHERE id = $1", id)
        .execute(&pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("asset {id} not found")));
    }
    Ok(StatusCode::NO_CONTENT)
}
