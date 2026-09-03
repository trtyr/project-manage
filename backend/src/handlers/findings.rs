//! Finding (产品发现) HTTP handlers.
//!
//! Two route shapes are exported:
//! 1. **Nested under a project** (preferred for write-side):
//!    - `GET  /api/projects/:project_id/findings`
//!    - `POST /api/projects/:project_id/findings`
//! 2. **Flat by id** (so the UI can patch a single record):
//!    - `GET    /api/findings/:id`
//!    - `PUT    /api/findings/:id`
//!    - `DELETE /api/findings/:id`

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::helpers::{dt_to_offset, ensure_communication_in_project, ensure_project_exists};
use crate::error::{AppError, AppResult};
use crate::models::{CreateFinding, FeedbackStatus, Finding, ProductSource, UpdateFinding};
use crate::state::AppState;

pub fn project_findings_router() -> Router<AppState> {
    Router::new().route(
        "/projects/{project_id}/findings",
        get(list_by_project).post(create_for_project),
    )
}

pub fn findings_router() -> Router<AppState> {
    Router::new().route("/findings/{id}", get(get_one).put(update).delete(remove))
}

async fn list_by_project(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
) -> AppResult<Json<Vec<Finding>>> {
    ensure_project_exists(&pool, project_id).await?;

    let rows = sqlx::query_as!(
        Finding,
        r#"SELECT id, project_id, title, description, product,
                  product_source, vendor, observed_at AS "observed_at: chrono::DateTime<chrono::Utc>", communication_id,
                  feedback_status, created_at AS "created_at: chrono::DateTime<chrono::Utc>", updated_at AS "updated_at: chrono::DateTime<chrono::Utc>"
           FROM findings
           WHERE project_id = $1
           ORDER BY
                CASE feedback_status
                    WHEN 'unreported' THEN 0
                    WHEN 'reported'    THEN 1
                    ELSE 2
                END,
                observed_at DESC"#,
        project_id
    )
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows))
}

async fn create_for_project(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
    Json(input): Json<CreateFinding>,
) -> AppResult<impl IntoResponse> {
    if input.title.trim().is_empty() {
        return Err(AppError::BadRequest("title must not be empty".into()));
    }

    if !ProductSource::is_valid(&input.product_source) {
        return Err(AppError::BadRequest(format!(
            "invalid product_source '{}', must be one of {:?}",
            input.product_source,
            ProductSource::ALL
        )));
    }

    let feedback_status = input
        .feedback_status
        .unwrap_or_else(|| FeedbackStatus::UNREPORTED.to_string());
    if !FeedbackStatus::is_valid(&feedback_status) {
        return Err(AppError::BadRequest(format!(
            "invalid feedback_status '{feedback_status}', must be one of {:?}",
            FeedbackStatus::ALL
        )));
    }

    ensure_project_exists(&pool, project_id).await?;

    if let Some(communication_id) = input.communication_id {
        ensure_communication_in_project(&pool, project_id, communication_id).await?;
    }

    let observed_at = input.observed_at.unwrap_or_else(Utc::now);

    let row = sqlx::query_as!(
        Finding,
        r#"INSERT INTO findings (project_id, title, description, product,
                                product_source, vendor, observed_at,
                                communication_id, feedback_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id, project_id, title, description, product,
                     product_source, vendor, observed_at AS "observed_at: chrono::DateTime<chrono::Utc>", communication_id,
                     feedback_status, created_at AS "created_at: chrono::DateTime<chrono::Utc>", updated_at AS "updated_at: chrono::DateTime<chrono::Utc>""#,
        project_id,
        input.title,
        input.description,
        input.product,
        input.product_source,
        input.vendor,
        dt_to_offset(observed_at),
        input.communication_id,
        feedback_status,
    )
    .fetch_one(&pool)
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

async fn get_one(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> AppResult<Json<Finding>> {
    let row = sqlx::query_as!(
        Finding,
        r#"SELECT id, project_id, title, description, product,
                  product_source, vendor, observed_at AS "observed_at: chrono::DateTime<chrono::Utc>", communication_id,
                  feedback_status, created_at AS "created_at: chrono::DateTime<chrono::Utc>", updated_at AS "updated_at: chrono::DateTime<chrono::Utc>"
           FROM findings WHERE id = $1"#,
        id
    )
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("finding {id} not found")))?;
    Ok(Json(row))
}

async fn update(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(input): Json<UpdateFinding>,
) -> AppResult<Json<Finding>> {
    if let Some(title) = &input.title
        && title.trim().is_empty()
    {
        return Err(AppError::BadRequest("title must not be empty".into()));
    }
    if let Some(product_source) = &input.product_source
        && !ProductSource::is_valid(product_source)
    {
        return Err(AppError::BadRequest(format!(
            "invalid product_source '{product_source}', must be one of {:?}",
            ProductSource::ALL
        )));
    }
    if let Some(feedback_status) = &input.feedback_status
        && !FeedbackStatus::is_valid(feedback_status)
    {
        return Err(AppError::BadRequest(format!(
            "invalid feedback_status '{feedback_status}', must be one of {:?}",
            FeedbackStatus::ALL
        )));
    }

    if let Some(communication_id) = input.communication_id {
        let project_id: Option<(Uuid,)> =
            sqlx::query_as("SELECT project_id FROM findings WHERE id = $1")
                .bind(id)
                .fetch_optional(&pool)
                .await?;
        if let Some((project_id,)) = project_id {
            ensure_communication_in_project(&pool, project_id, communication_id).await?;
        }
    }

    let row = sqlx::query_as!(
        Finding,
        r#"UPDATE findings
           SET title            = COALESCE($2, title),
               description      = COALESCE($3, description),
               product          = COALESCE($4, product),
               product_source   = COALESCE($5, product_source),
               vendor           = COALESCE($6, vendor),
               observed_at      = COALESCE($7, observed_at),
               communication_id = COALESCE($8, communication_id),
               feedback_status  = COALESCE($9, feedback_status)
           WHERE id = $1
           RETURNING id, project_id, title, description, product,
                     product_source, vendor, observed_at AS "observed_at: chrono::DateTime<chrono::Utc>", communication_id,
                     feedback_status, created_at AS "created_at: chrono::DateTime<chrono::Utc>", updated_at AS "updated_at: chrono::DateTime<chrono::Utc>""#,
        id,
        input.title,
        input.description,
        input.product,
        input.product_source,
        input.vendor,
        input.observed_at.map(dt_to_offset),
        input.communication_id,
        input.feedback_status,
    )
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("finding {id} not found")))?;

    Ok(Json(row))
}

async fn remove(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> AppResult<StatusCode> {
    let res = sqlx::query!("DELETE FROM findings WHERE id = $1", id)
        .execute(&pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("finding {id} not found")));
    }
    Ok(StatusCode::NO_CONTENT)
}
