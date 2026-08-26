//! Issue (客户关切) HTTP handlers.
//!
//! Two route shapes are exported:
//! 1. **Nested under a project** (preferred for write-side):
//!    - `GET  /api/projects/:project_id/issues`
//!    - `POST /api/projects/:project_id/issues`
//! 2. **Flat by id** (so the UI can patch a single record):
//!    - `GET    /api/issues/:id`
//!    - `PUT    /api/issues/:id`
//!    - `DELETE /api/issues/:id`

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::helpers::{ensure_communication_in_project, ensure_project_exists};
use crate::error::{AppError, AppResult};
use crate::models::{CreateIssue, Issue, IssuePriority, IssueStatus, UpdateIssue};
use crate::state::AppState;

pub fn project_issues_router() -> Router<AppState> {
    Router::new().route(
        "/projects/{project_id}/issues",
        get(list_by_project).post(create_for_project),
    )
}

pub fn issues_router() -> Router<AppState> {
    Router::new().route("/issues/{id}", get(get_one).put(update).delete(remove))
}

async fn list_by_project(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
) -> AppResult<Json<Vec<Issue>>> {
    ensure_project_exists(&pool, project_id).await?;

    let rows = sqlx::query_as!(
        Issue,
        r#"SELECT id, project_id, title, description, status,
                  communication_id, assignee_id, priority, due_date,
                  created_at, updated_at
           FROM issues
           WHERE project_id = $1
           ORDER BY
                CASE status
                    WHEN 'open'        THEN 0
                    WHEN 'in_progress' THEN 1
                    WHEN 'resolved'    THEN 2
                    ELSE 3
                END,
                CASE priority
                    WHEN 'urgent' THEN 0
                    WHEN 'high'   THEN 1
                    WHEN 'normal' THEN 2
                    WHEN 'low'    THEN 3
                    ELSE 4
                END,
                due_date NULLS LAST,
                created_at"#,
        project_id
    )
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows))
}

async fn create_for_project(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
    Json(input): Json<CreateIssue>,
) -> AppResult<impl IntoResponse> {
    if input.title.trim().is_empty() {
        return Err(AppError::BadRequest("title must not be empty".into()));
    }

    let status = input.status.unwrap_or_else(|| IssueStatus::OPEN.to_string());
    if !IssueStatus::is_valid(&status) {
        return Err(AppError::BadRequest(format!(
            "invalid status '{status}', must be one of {:?}",
            IssueStatus::ALL
        )));
    }

    let priority = input
        .priority
        .unwrap_or_else(|| IssuePriority::NORMAL.to_string());
    if !IssuePriority::is_valid(&priority) {
        return Err(AppError::BadRequest(format!(
            "invalid priority '{priority}', must be one of {:?}",
            IssuePriority::ALL
        )));
    }

    ensure_project_exists(&pool, project_id).await?;

    if let Some(communication_id) = input.communication_id {
        ensure_communication_in_project(&pool, project_id, communication_id).await?;
    }

    let row = sqlx::query_as!(
        Issue,
        r#"INSERT INTO issues (project_id, title, description, status,
                              communication_id, assignee_id, priority, due_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, project_id, title, description, status,
                     communication_id, assignee_id, priority, due_date,
                     created_at, updated_at"#,
        project_id,
        input.title,
        input.description,
        status,
        input.communication_id,
        input.assignee_id,
        priority,
        input.due_date,
    )
    .fetch_one(&pool)
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

async fn get_one(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> AppResult<Json<Issue>> {
    let row = sqlx::query_as!(
        Issue,
        r#"SELECT id, project_id, title, description, status,
                  communication_id, assignee_id, priority, due_date,
                  created_at, updated_at
           FROM issues WHERE id = $1"#,
        id
    )
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("issue {id} not found")))?;
    Ok(Json(row))
}

async fn update(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(input): Json<UpdateIssue>,
) -> AppResult<Json<Issue>> {
    if let Some(title) = &input.title
        && title.trim().is_empty()
    {
        return Err(AppError::BadRequest("title must not be empty".into()));
    }
    if let Some(status) = &input.status
        && !IssueStatus::is_valid(status)
    {
        return Err(AppError::BadRequest(format!(
            "invalid status '{status}', must be one of {:?}",
            IssueStatus::ALL
        )));
    }
    if let Some(priority) = &input.priority
        && !IssuePriority::is_valid(priority)
    {
        return Err(AppError::BadRequest(format!(
            "invalid priority '{priority}', must be one of {:?}",
            IssuePriority::ALL
        )));
    }

    if let Some(communication_id) = input.communication_id {
        let project_id: Option<(Uuid,)> =
            sqlx::query_as("SELECT project_id FROM issues WHERE id = $1")
                .bind(id)
                .fetch_optional(&pool)
                .await?;
        if let Some((project_id,)) = project_id {
            ensure_communication_in_project(&pool, project_id, communication_id).await?;
        }
    }

    let row = sqlx::query_as!(
        Issue,
        r#"UPDATE issues
           SET title            = COALESCE($2, title),
               description      = COALESCE($3, description),
               status           = COALESCE($4, status),
               communication_id = COALESCE($5, communication_id),
               assignee_id      = COALESCE($6, assignee_id),
               priority         = COALESCE($7, priority),
               due_date         = COALESCE($8, due_date)
           WHERE id = $1
           RETURNING id, project_id, title, description, status,
                     communication_id, assignee_id, priority, due_date,
                     created_at, updated_at"#,
        id,
        input.title,
        input.description,
        input.status,
        input.communication_id,
        input.assignee_id,
        input.priority,
        input.due_date,
    )
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("issue {id} not found")))?;

    Ok(Json(row))
}

async fn remove(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> AppResult<StatusCode> {
    let res = sqlx::query!("DELETE FROM issues WHERE id = $1", id)
        .execute(&pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("issue {id} not found")));
    }
    Ok(StatusCode::NO_CONTENT)
}
