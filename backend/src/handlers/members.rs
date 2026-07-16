//! Member (团队成员) HTTP handlers — CRUD.

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
use crate::models::{CreateMember, Member, UpdateMember};
use crate::state::AppState;

pub fn project_members_router() -> Router<AppState> {
    Router::new().route(
        "/projects/{project_id}/members",
        get(list_by_project).post(create_for_project),
    )
}

pub fn members_router() -> Router<AppState> {
    Router::new().route("/members/{id}", get(get_one).put(update).delete(remove))
}

async fn list_by_project(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
) -> AppResult<Json<Vec<Member>>> {
    ensure_project_exists(&pool, project_id).await?;
    let rows = sqlx::query_as::<_, Member>(
        "SELECT id, project_id, role, name, notes, created_at \
         FROM members WHERE project_id = $1 ORDER BY created_at",
    )
    .bind(project_id)
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows))
}

async fn create_for_project(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
    Json(input): Json<CreateMember>,
) -> AppResult<impl IntoResponse> {
    if input.name.trim().is_empty() {
        return Err(AppError::BadRequest("name must not be empty".into()));
    }
    ensure_project_exists(&pool, project_id).await?;

    let row = sqlx::query_as::<_, Member>(
        "INSERT INTO members (project_id, role, name, notes) \
         VALUES ($1, $2, $3, $4) \
         RETURNING id, project_id, role, name, notes, created_at",
    )
    .bind(project_id)
    .bind(input.role.as_ref())
    .bind(&input.name)
    .bind(input.notes.as_ref())
    .fetch_one(&pool)
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

async fn get_one(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Member>> {
    let row = sqlx::query_as::<_, Member>(
        "SELECT id, project_id, role, name, notes, created_at FROM members WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("member {id} not found")))?;
    Ok(Json(row))
}

async fn update(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(input): Json<UpdateMember>,
) -> AppResult<Json<Member>> {
    let row = sqlx::query_as::<_, Member>(
        "UPDATE members SET name = COALESCE($2, name), \
         role = COALESCE($3, role), notes = COALESCE($4, notes) \
         WHERE id = $1 \
         RETURNING id, project_id, role, name, notes, created_at",
    )
    .bind(id)
    .bind(input.name.as_ref())
    .bind(input.role.as_ref())
    .bind(input.notes.as_ref())
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("member {id} not found")))?;
    Ok(Json(row))
}

async fn remove(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let res = sqlx::query!("DELETE FROM members WHERE id = $1", id)
        .execute(&pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("member {id} not found")));
    }
    Ok(StatusCode::NO_CONTENT)
}
