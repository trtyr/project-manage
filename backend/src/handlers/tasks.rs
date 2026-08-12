//! Task (任务) HTTP handlers.
//!
//! Routes:
//! - `GET    /api/projects/:project_id/tasks`   → list for a project
//! - `POST   /api/projects/:project_id/tasks`   → create for a project
//! - `GET    /api/tasks/:id`                    → read one
//! - `PUT    /api/tasks/:id`                    → partial update
//! - `DELETE /api/tasks/:id`                    → remove
//!
//! The task plan tree calls for `PUT /api/tasks/:id` specifically, hence
//! the flat route even when creation is scoped under a project.

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
use crate::models::{CreateTask, Task, TaskStatus, UpdateTask};
use crate::state::AppState;

/// Nested router — mounted under `/api/projects/:project_id`.
pub fn project_tasks_router() -> Router<AppState> {
    Router::new().route(
        "/projects/{project_id}/tasks",
        get(list_by_project).post(create_for_project),
    )
}

/// Flat router — mounted under `/api/tasks`.
pub fn tasks_router() -> Router<AppState> {
    Router::new().route("/tasks/{id}", get(get_one).put(update).delete(remove))
}

/// `GET /api/projects/:project_id/tasks`
async fn list_by_project(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
) -> AppResult<Json<Vec<Task>>> {
    ensure_project_exists(&pool, project_id).await?;

    let rows = sqlx::query_as!(
        Task,
        r#"SELECT id, project_id, title, status, planned_date,
                  created_at, updated_at
           FROM tasks
           WHERE project_id = $1
           ORDER BY
                CASE status
                    WHEN 'current' THEN 0
                    WHEN 'next'    THEN 1
                    WHEN 'todo'    THEN 2
                    ELSE 3
                END,
                planned_date NULLS LAST,
                created_at"#,
        project_id
    )
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows))
}

/// `POST /api/projects/:project_id/tasks`
async fn create_for_project(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
    Json(input): Json<CreateTask>,
) -> AppResult<impl IntoResponse> {
    if input.title.trim().is_empty() {
        return Err(AppError::BadRequest("title must not be empty".into()));
    }

    let status = input.status.unwrap_or_else(|| TaskStatus::TODO.to_string());
    if !TaskStatus::is_valid(&status) {
        return Err(AppError::BadRequest(format!(
            "invalid status '{status}', must be one of {:?}",
            TaskStatus::ALL
        )));
    }

    ensure_project_exists(&pool, project_id).await?;

    let row = sqlx::query_as!(
        Task,
        r#"INSERT INTO tasks (project_id, title, status, planned_date)
           VALUES ($1, $2, $3, $4)
           RETURNING id, project_id, title, status, planned_date,
                     created_at, updated_at"#,
        project_id,
        input.title,
        status,
        input.planned_date,
    )
    .fetch_one(&pool)
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

/// `GET /api/tasks/:id`
async fn get_one(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> AppResult<Json<Task>> {
    let row = sqlx::query_as!(
        Task,
        r#"SELECT id, project_id, title, status, planned_date,
                  created_at, updated_at
           FROM tasks WHERE id = $1"#,
        id
    )
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("task {id} not found")))?;
    Ok(Json(row))
}

/// `PUT /api/tasks/:id`
async fn update(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(input): Json<UpdateTask>,
) -> AppResult<Json<Task>> {
    if let Some(title) = &input.title
        && title.trim().is_empty()
    {
        return Err(AppError::BadRequest("title must not be empty".into()));
    }
    if let Some(status) = &input.status
        && !TaskStatus::is_valid(status)
    {
        return Err(AppError::BadRequest(format!(
            "invalid status '{status}', must be one of {:?}",
            TaskStatus::ALL
        )));
    }

    let row = sqlx::query_as!(
        Task,
        r#"UPDATE tasks
           SET title        = COALESCE($2, title),
               status       = COALESCE($3, status),
               planned_date = COALESCE($4, planned_date)
           WHERE id = $1
           RETURNING id, project_id, title, status, planned_date,
                     created_at, updated_at"#,
        id,
        input.title,
        input.status,
        input.planned_date,
    )
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("task {id} not found")))?;

    Ok(Json(row))
}

/// `DELETE /api/tasks/:id`
async fn remove(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> AppResult<StatusCode> {
    let res = sqlx::query!("DELETE FROM tasks WHERE id = $1", id)
        .execute(&pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("task {id} not found")));
    }
    Ok(StatusCode::NO_CONTENT)
}
