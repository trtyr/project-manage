//! Person HTTP handlers — CRUD + side-scoped reorder + flip-side.

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
use crate::models::{CreatePerson, Person, PersonSide, UpdatePerson};
use crate::state::AppState;

/// Column list shared by every `people` SELECT / RETURNING.
const PERSON_COLUMNS: &str = "id, project_id, side, name, role, notes, sort_order, created_at";

pub fn project_people_router() -> Router<AppState> {
    Router::new()
        .route(
            "/projects/{project_id}/people",
            get(list_by_project).post(create_for_project),
        )
        // Drag-and-drop reorder, scoped to one side (team or client).
        .route("/projects/{project_id}/people/reorder", put(reorder))
}

pub fn people_router() -> Router<AppState> {
    Router::new()
        .route("/people/{id}", get(get_one).put(update).delete(remove))
        // Move a person across to the other side (team ↔ client). No field
        // conversion — `role` is shared, so only `side` + `sort_order` change.
        .route("/people/{id}/flip-side", axum::routing::post(flip_side))
}

async fn list_by_project(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
) -> AppResult<Json<Vec<Person>>> {
    ensure_project_exists(&pool, project_id).await?;
    let rows = sqlx::query_as::<_, Person>(&format!(
        "SELECT {PERSON_COLUMNS} FROM people \
         WHERE project_id = $1 ORDER BY side, sort_order, created_at"
    ))
    .bind(project_id)
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows))
}

async fn create_for_project(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
    Json(input): Json<CreatePerson>,
) -> AppResult<impl IntoResponse> {
    if input.name.trim().is_empty() {
        return Err(AppError::BadRequest("name must not be empty".into()));
    }
    if !PersonSide::is_valid(&input.side) {
        return Err(AppError::BadRequest(format!(
            "side must be one of {:?}",
            PersonSide::ALL
        )));
    }
    ensure_project_exists(&pool, project_id).await?;

    // Append at the end of this side's list (per-project, per-side sort_order).
    let row = sqlx::query_as::<_, Person>(
        "INSERT INTO people (project_id, side, name, role, notes, sort_order) \
         VALUES ($1, $2, $3, $4, $5, \
            (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM people \
             WHERE project_id = $1 AND side = $2)) \
         RETURNING id, project_id, side, name, role, notes, sort_order, created_at",
    )
    .bind(project_id)
    .bind(&input.side)
    .bind(&input.name)
    .bind(input.role.as_ref())
    .bind(input.notes.as_ref())
    .fetch_one(&pool)
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

async fn get_one(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> AppResult<Json<Person>> {
    let row = sqlx::query_as::<_, Person>(&format!(
        "SELECT {PERSON_COLUMNS} FROM people WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("person {id} not found")))?;
    Ok(Json(row))
}

async fn update(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(input): Json<UpdatePerson>,
) -> AppResult<Json<Person>> {
    let row = sqlx::query_as::<_, Person>(
        "UPDATE people SET name = COALESCE($2, name), \
         role = COALESCE($3, role), notes = COALESCE($4, notes) \
         WHERE id = $1 \
         RETURNING id, project_id, side, name, role, notes, sort_order, created_at",
    )
    .bind(id)
    .bind(input.name.as_ref())
    .bind(input.role.as_ref())
    .bind(input.notes.as_ref())
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("person {id} not found")))?;
    Ok(Json(row))
}

async fn remove(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> AppResult<StatusCode> {
    let res = sqlx::query!("DELETE FROM people WHERE id = $1", id)
        .execute(&pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("person {id} not found")));
    }
    Ok(StatusCode::NO_CONTENT)
}

/// `PUT /api/projects/:project_id/people/reorder`
///
/// Body: `{ "side": "team" | "client", "ids": [<uuid>, ...] }` — the full
/// desired order of that side's people. Each matching row's `sort_order` is
/// rewritten to its index. The `WHERE project_id = $3 AND side = $4` guard
/// means an id from the wrong side / project is silently skipped.
#[derive(Deserialize)]
struct ReorderRequest {
    side: String,
    ids: Vec<Uuid>,
}

async fn reorder(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
    Json(input): Json<ReorderRequest>,
) -> AppResult<StatusCode> {
    ensure_project_exists(&pool, project_id).await?;
    if !PersonSide::is_valid(&input.side) {
        return Err(AppError::BadRequest(format!(
            "side must be one of {:?}",
            PersonSide::ALL
        )));
    }
    let mut tx = pool.begin().await?;
    for (idx, id) in input.ids.iter().enumerate() {
        sqlx::query!(
            "UPDATE people SET sort_order = $2 WHERE id = $1 AND project_id = $3 AND side = $4",
            id,
            idx as i32,
            project_id,
            input.side
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `POST /api/people/:id/flip-side`
///
/// Moves a person to the other side (team ↔ client) within the same project.
/// `role` is unchanged (it is shared across sides); `side` flips and
/// `sort_order` is reset to append at the end of the destination side.
async fn flip_side(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> AppResult<Json<Person>> {
    let mut tx = pool.begin().await?;

    let person = sqlx::query_as::<_, Person>(&format!(
        "SELECT {PERSON_COLUMNS} FROM people WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("person {id} not found")))?;

    let new_side = if person.side == PersonSide::TEAM {
        PersonSide::CLIENT
    } else {
        PersonSide::TEAM
    };

    let row = sqlx::query_as::<_, Person>(
        "UPDATE people SET side = $2, sort_order = \
            (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM people \
             WHERE project_id = $3 AND side = $2) \
         WHERE id = $1 \
         RETURNING id, project_id, side, name, role, notes, sort_order, created_at",
    )
    .bind(id)
    .bind(new_side)
    .bind(person.project_id)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(Json(row))
}
