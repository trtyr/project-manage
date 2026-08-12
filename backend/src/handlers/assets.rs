//! Asset (资产) HTTP handlers — CRUD + drag-and-drop reorder.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, put},
    Json, Router,
};
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::helpers::ensure_project_exists;
use crate::error::{AppError, AppResult};
use crate::models::{Asset, CreateAsset, UpdateAsset};
use crate::state::AppState;

const ASSET_COLUMNS: &str = "id, project_id, name, asset_type, value, description, \
     access_method, credentials, vendor, sort_order, created_at, updated_at";

pub fn project_assets_router() -> Router<AppState> {
    Router::new()
        .route(
            "/projects/{project_id}/assets",
            get(list_by_project).post(create_for_project),
        )
        .route("/projects/{project_id}/assets/reorder", put(reorder))
}

pub fn assets_router() -> Router<AppState> {
    Router::new().route("/assets/{id}", get(get_one).put(update).delete(remove))
}

async fn list_by_project(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
) -> AppResult<Json<Vec<Asset>>> {
    ensure_project_exists(&pool, project_id).await?;
    let rows = sqlx::query_as::<_, Asset>(&format!(
        "SELECT {ASSET_COLUMNS} FROM assets \
         WHERE project_id = $1 ORDER BY sort_order ASC, created_at ASC"
    ))
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
        "INSERT INTO assets (project_id, name, asset_type, value, description, \
         access_method, credentials, vendor, sort_order) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, \
            (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM assets WHERE project_id = $1)) \
         RETURNING id, project_id, name, asset_type, value, description, \
                   access_method, credentials, vendor, sort_order, created_at, updated_at",
    )
    .bind(project_id)
    .bind(&input.name)
    .bind(input.asset_type.as_deref().unwrap_or("other"))
    .bind(input.value.as_ref())
    .bind(input.description.as_ref())
    .bind(input.access_method.as_ref())
    .bind(input.credentials.as_ref())
    .bind(input.vendor.as_ref())
    .fetch_one(&pool)
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

async fn get_one(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> AppResult<Json<Asset>> {
    let row = sqlx::query_as::<_, Asset>(&format!(
        "SELECT {ASSET_COLUMNS} FROM assets WHERE id = $1"
    ))
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
         description = COALESCE($5, description), \
         access_method = COALESCE($6, access_method), \
         credentials = COALESCE($7, credentials), \
         vendor = COALESCE($8, vendor), updated_at = NOW() \
         WHERE id = $1 \
         RETURNING id, project_id, name, asset_type, value, description, \
                   access_method, credentials, vendor, sort_order, created_at, updated_at",
    )
    .bind(id)
    .bind(input.name.as_ref())
    .bind(input.asset_type.as_ref())
    .bind(input.value.as_ref())
    .bind(input.description.as_ref())
    .bind(input.access_method.as_ref())
    .bind(input.credentials.as_ref())
    .bind(input.vendor.as_ref())
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("asset {id} not found")))?;
    Ok(Json(row))
}

async fn remove(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> AppResult<StatusCode> {
    let res = sqlx::query!("DELETE FROM assets WHERE id = $1", id)
        .execute(&pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("asset {id} not found")));
    }
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct ReorderRequest {
    asset_ids: Vec<Uuid>,
}

async fn reorder(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
    Json(input): Json<ReorderRequest>,
) -> AppResult<StatusCode> {
    ensure_project_exists(&pool, project_id).await?;
    let mut tx = pool.begin().await?;
    for (idx, id) in input.asset_ids.iter().enumerate() {
        sqlx::query!(
            "UPDATE assets SET sort_order = $2 WHERE id = $1 AND project_id = $3",
            id,
            idx as i32,
            project_id
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
