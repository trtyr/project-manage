//! Project (项目) HTTP handlers.
//!
//! Routes:
//! - `GET    /api/projects`        → list all (optional `?client_id=` filter)
//! - `POST   /api/projects`        → create
//! - `GET    /api/projects/:id`    → read one
//! - `PUT    /api/projects/:id`    → partial update
//! - `DELETE /api/projects/:id`    → remove
//!
//! Nested resources live in `communications.rs` and `tasks.rs` and are
//! wired into the router from `main.rs`.

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

use crate::error::{AppError, AppResult};
use crate::models::{CreateProject, Project, ProjectStatus, TechApprovalStatus, UpdateProject};
use crate::state::AppState;

pub fn projects_router() -> Router<AppState> {
    Router::new()
        .route("/projects", get(list).post(create))
        .route("/projects/{id}", get(get_one).put(update).delete(remove))
}

#[derive(Debug, Deserialize)]
struct ListQuery {
    client_id: Option<Uuid>,
}

/// `GET /api/projects` (optional `?client_id=` filter)
async fn list(
    State(pool): State<PgPool>,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<Vec<Project>>> {
    let rows = match q.client_id {
        Some(client_id) => sqlx::query_as!(
            Project,
            r#"SELECT id,
                      client_id,
                      name,
                      status,
                      phase,
                      goals AS "goals!: Vec<String>",
                      tech_approval,
                      competitors,
                      created_at,
                      updated_at
               FROM projects
               WHERE client_id = $1
               ORDER BY created_at DESC"#,
            client_id
        )
        .fetch_all(&pool)
        .await?,
        None => sqlx::query_as!(
            Project,
            r#"SELECT id,
                      client_id,
                      name,
                      status,
                      phase,
                      goals AS "goals!: Vec<String>",
                      tech_approval,
                      competitors,
                      created_at,
                      updated_at
               FROM projects
               ORDER BY created_at DESC"#
        )
        .fetch_all(&pool)
        .await?,
    };
    Ok(Json(rows))
}

/// `POST /api/projects`
async fn create(
    State(pool): State<PgPool>,
    Json(input): Json<CreateProject>,
) -> AppResult<impl IntoResponse> {
    if input.name.trim().is_empty() {
        return Err(AppError::BadRequest("name must not be empty".into()));
    }

    let status = input
        .status
        .unwrap_or_else(|| ProjectStatus::IN_PROGRESS.to_string());
    if !ProjectStatus::is_valid(&status) {
        return Err(AppError::BadRequest(format!(
            "invalid status '{status}', must be one of {:?}",
            ProjectStatus::ALL
        )));
    }
    if let Some(tech_approval) = &input.tech_approval
        && !TechApprovalStatus::is_valid(tech_approval)
    {
        return Err(AppError::BadRequest(format!(
            "invalid tech_approval '{tech_approval}', must be one of {:?}",
            TechApprovalStatus::ALL
        )));
    }

    let tech_approval = input.tech_approval.unwrap_or_default();
    let competitors = input.competitors.unwrap_or_default();

    let row = sqlx::query_as!(
        Project,
        r#"INSERT INTO projects (
               client_id, name, status, phase, goals, tech_approval, competitors
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id,
                     client_id,
                     name,
                     status,
                     phase,
                     goals AS "goals!: Vec<String>",
                     tech_approval,
                     competitors,
                     created_at,
                     updated_at"#,
        input.client_id,
        input.name,
        status,
        input.phase,
        input.goals.as_slice(),
        tech_approval,
        competitors,
    )
    .fetch_one(&pool)
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

/// `GET /api/projects/:id`
async fn get_one(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> AppResult<Json<Project>> {
    let row = sqlx::query_as!(
        Project,
        r#"SELECT id,
                  client_id,
                  name,
                  status,
                  phase,
                  goals AS "goals!: Vec<String>",
                  tech_approval,
                  competitors,
                  created_at,
                  updated_at
           FROM projects WHERE id = $1"#,
        id
    )
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("project {id} not found")))?;

    Ok(Json(row))
}

/// `PUT /api/projects/:id`
async fn update(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(input): Json<UpdateProject>,
) -> AppResult<Json<Project>> {
    if let Some(name) = &input.name
        && name.trim().is_empty()
    {
        return Err(AppError::BadRequest("name must not be empty".into()));
    }
    if let Some(status) = &input.status
        && !ProjectStatus::is_valid(status)
    {
        return Err(AppError::BadRequest(format!(
            "invalid status '{status}', must be one of {:?}",
            ProjectStatus::ALL
        )));
    }
    if let Some(tech_approval) = &input.tech_approval
        && !TechApprovalStatus::is_valid(tech_approval)
    {
        return Err(AppError::BadRequest(format!(
            "invalid tech_approval '{tech_approval}', must be one of {:?}",
            TechApprovalStatus::ALL
        )));
    }

    let row = sqlx::query_as!(
        Project,
        r#"UPDATE projects
           SET client_id = COALESCE($2, client_id),
               name      = COALESCE($3, name),
               status    = COALESCE($4, status),
               phase     = COALESCE($5, phase),
               goals     = COALESCE($6, goals),
               tech_approval = COALESCE($7, tech_approval),
               competitors   = COALESCE($8, competitors)
           WHERE id = $1
           RETURNING id,
                     client_id,
                     name,
                     status,
                     phase,
                     goals AS "goals!: Vec<String>",
                     tech_approval,
                     competitors,
                     created_at,
                     updated_at"#,
        id,
        input.client_id,
        input.name,
        input.status,
        input.phase,
        input.goals.as_deref(),
        input.tech_approval,
        input.competitors,
    )
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("project {id} not found")))?;

    Ok(Json(row))
}

/// `DELETE /api/projects/:id`
async fn remove(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> AppResult<StatusCode> {
    let file_paths: Vec<(String,)> =
        sqlx::query_as("SELECT file_path FROM project_files WHERE project_id = $1")
            .bind(id)
            .fetch_all(&pool)
            .await?;

    let upload_dir = format!("./uploads/{id}");
    if let Err(error) = tokio::fs::remove_dir_all(&upload_dir).await {
        tracing::warn!(
            project_id = %id,
            path = %upload_dir,
            file_count = file_paths.len(),
            error = %error,
            "failed to remove project upload directory"
        );
    }

    let res = sqlx::query!("DELETE FROM projects WHERE id = $1", id)
        .execute(&pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("project {id} not found")));
    }
    Ok(StatusCode::NO_CONTENT)
}
