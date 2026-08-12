//! Task (任务) HTTP handlers.

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
use crate::models::{CreateTask, Task, TaskPriority, TaskStatus, UpdateTask};
use crate::state::AppState;

pub fn project_tasks_router() -> Router<AppState> {
    Router::new().route(
        "/projects/{project_id}/tasks",
        get(list_by_project).post(create_for_project),
    )
}

pub fn tasks_router() -> Router<AppState> {
    Router::new().route("/tasks/{id}", get(get_one).put(update).delete(remove))
}

async fn list_by_project(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
) -> AppResult<Json<Vec<Task>>> {
    ensure_project_exists(&pool, project_id).await?;

    let rows = sqlx::query_as!(
        Task,
        r#"SELECT id, project_id, title, status, planned_date,
                  assignee_id, priority, created_at, updated_at
           FROM tasks
           WHERE project_id = $1
           ORDER BY
                CASE status
                    WHEN 'current' THEN 0
                    WHEN 'next'    THEN 1
                    WHEN 'todo'    THEN 2
                    ELSE 3
                END,
                CASE priority
                    WHEN 'urgent' THEN 0
                    WHEN 'high'   THEN 1
                    WHEN 'normal' THEN 2
                    WHEN 'low'    THEN 3
                    ELSE 4
                END,
                planned_date NULLS LAST,
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

    let priority = input
        .priority
        .unwrap_or_else(|| TaskPriority::NORMAL.to_string());
    if !TaskPriority::is_valid(&priority) {
        return Err(AppError::BadRequest(format!(
            "invalid priority '{priority}', must be one of {:?}",
            TaskPriority::ALL
        )));
    }

    ensure_project_exists(&pool, project_id).await?;

    let row = sqlx::query_as!(
        Task,
        r#"INSERT INTO tasks (project_id, title, status, planned_date, assignee_id, priority)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, project_id, title, status, planned_date,
                     assignee_id, priority, created_at, updated_at"#,
        project_id,
        input.title,
        status,
        input.planned_date,
        input.assignee_id,
        priority,
    )
    .fetch_one(&pool)
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

async fn get_one(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> AppResult<Json<Task>> {
    let row = sqlx::query_as!(
        Task,
        r#"SELECT id, project_id, title, status, planned_date,
                  assignee_id, priority, created_at, updated_at
           FROM tasks WHERE id = $1"#,
        id
    )
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("task {id} not found")))?;
    Ok(Json(row))
}

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
    if let Some(priority) = &input.priority
        && !TaskPriority::is_valid(priority)
    {
        return Err(AppError::BadRequest(format!(
            "invalid priority '{priority}', must be one of {:?}",
            TaskPriority::ALL
        )));
    }

    let row = sqlx::query_as!(
        Task,
        r#"UPDATE tasks
           SET title        = COALESCE($2, title),
               status       = COALESCE($3, status),
               planned_date = COALESCE($4, planned_date),
               assignee_id  = COALESCE($5, assignee_id),
               priority     = COALESCE($6, priority)
           WHERE id = $1
           RETURNING id, project_id, title, status, planned_date,
                     assignee_id, priority, created_at, updated_at"#,
        id,
        input.title,
        input.status,
        input.planned_date,
        input.assignee_id,
        input.priority,
    )
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("task {id} not found")))?;

    Ok(Json(row))
}

async fn remove(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> AppResult<StatusCode> {
    let res = sqlx::query!("DELETE FROM tasks WHERE id = $1", id)
        .execute(&pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("task {id} not found")));
    }
    Ok(StatusCode::NO_CONTENT)
}
