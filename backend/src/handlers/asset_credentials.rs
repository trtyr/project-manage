//! Asset credential (资产凭据) HTTP handlers — CRUD under a parent asset.
//!
//! Routes mirror the files/phases pattern: project-scoped list/create
//! (guarded by `ensure_project_exists` + `ensure_asset_in_project`) and
//! flat update/delete by row id.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, put},
    Json, Router,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::helpers::{ensure_asset_in_project, ensure_project_exists};
use crate::error::{AppError, AppResult};
use crate::models::{AssetCredential, CreateAssetCredential, CredentialType, UpdateAssetCredential};
use crate::state::AppState;

const CREDENTIAL_COLUMNS: &str =
    "id, asset_id, label, cred_type, username, secret, sort_order, created_at, updated_at";

pub fn project_asset_credentials_router() -> Router<AppState> {
    Router::new().route(
        "/projects/{project_id}/assets/{asset_id}/credentials",
        get(list_by_asset).post(create_for_asset),
    )
}

pub fn asset_credentials_router() -> Router<AppState> {
    Router::new().route("/asset-credentials/{id}", put(update).delete(remove))
}

async fn list_by_asset(
    State(pool): State<PgPool>,
    Path((project_id, asset_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<Vec<AssetCredential>>> {
    ensure_project_exists(&pool, project_id).await?;
    ensure_asset_in_project(&pool, project_id, asset_id).await?;
    let rows = sqlx::query_as::<_, AssetCredential>(&format!(
        "SELECT {CREDENTIAL_COLUMNS} FROM asset_credentials \
         WHERE asset_id = $1 ORDER BY sort_order ASC, created_at ASC"
    ))
    .bind(asset_id)
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows))
}

async fn create_for_asset(
    State(pool): State<PgPool>,
    Path((project_id, asset_id)): Path<(Uuid, Uuid)>,
    Json(input): Json<CreateAssetCredential>,
) -> AppResult<impl IntoResponse> {
    if input.label.trim().is_empty() {
        return Err(AppError::BadRequest("label must not be empty".into()));
    }
    let cred_type = input
        .cred_type
        .as_deref()
        .unwrap_or(CredentialType::PASSWORD);
    if !CredentialType::is_valid(cred_type) {
        return Err(AppError::BadRequest(format!(
            "invalid cred_type: {cred_type} (expected one of {:?})",
            CredentialType::ALL
        )));
    }
    ensure_project_exists(&pool, project_id).await?;
    ensure_asset_in_project(&pool, project_id, asset_id).await?;

    let row = sqlx::query_as::<_, AssetCredential>(
        "INSERT INTO asset_credentials (asset_id, label, cred_type, username, secret, sort_order) \
         VALUES ($1, $2, $3, $4, $5, \
            (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM asset_credentials WHERE asset_id = $1)) \
         RETURNING id, asset_id, label, cred_type, username, secret, \
                   sort_order, created_at, updated_at",
    )
    .bind(asset_id)
    .bind(&input.label)
    .bind(cred_type)
    .bind(input.username.as_ref())
    .bind(input.secret.as_ref())
    .fetch_one(&pool)
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

async fn update(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(input): Json<UpdateAssetCredential>,
) -> AppResult<Json<AssetCredential>> {
    if let Some(label) = input.label.as_ref()
        && label.trim().is_empty()
    {
        return Err(AppError::BadRequest("label must not be empty".into()));
    }
    if let Some(cred_type) = input.cred_type.as_ref()
        && !CredentialType::is_valid(cred_type)
    {
        return Err(AppError::BadRequest(format!(
            "invalid cred_type: {cred_type} (expected one of {:?})",
            CredentialType::ALL
        )));
    }
    let row = sqlx::query_as::<_, AssetCredential>(
        "UPDATE asset_credentials SET label = COALESCE($2, label), \
         cred_type = COALESCE($3, cred_type), username = COALESCE($4, username), \
         secret = COALESCE($5, secret) \
         WHERE id = $1 \
         RETURNING id, asset_id, label, cred_type, username, secret, \
                   sort_order, created_at, updated_at",
    )
    .bind(id)
    .bind(input.label.as_ref())
    .bind(input.cred_type.as_ref())
    .bind(input.username.as_ref())
    .bind(input.secret.as_ref())
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("asset credential {id} not found")))?;
    Ok(Json(row))
}

async fn remove(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> AppResult<StatusCode> {
    let res = sqlx::query!("DELETE FROM asset_credentials WHERE id = $1", id)
        .execute(&pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!(
            "asset credential {id} not found"
        )));
    }
    Ok(StatusCode::NO_CONTENT)
}
