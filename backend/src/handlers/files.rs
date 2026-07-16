//! ProjectFile (项目文件) HTTP handlers — upload, download, list, delete.
//!
//! Routes:
//! - `GET    /api/projects/:project_id/files`
//! - `POST   /api/projects/:project_id/files`  (multipart/form-data)
//! - `GET    /api/files/:id/download`
//! - `PUT    /api/files/:id`                    (update description/tags)
//! - `DELETE /api/files/:id`

use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::{header, StatusCode},
    response::IntoResponse,
    routing::{get, post, put},
    Json, Router,
};
use sqlx::PgPool;
use serde::Deserialize;
use uuid::Uuid;

use crate::db::helpers::ensure_project_exists;
use crate::error::{AppError, AppResult};
use crate::models::{CreateLink, FileMeta, FileWithProject, ProjectFile, UpdateFile};
use crate::state::AppState;

pub fn project_files_router() -> Router<AppState> {
    Router::new()
        .route(
            "/projects/{project_id}/files",
            get(list_by_project).post(upload_file),
        )
        .route("/projects/{project_id}/links", post(create_link))
}

pub fn files_router() -> Router<AppState> {
    Router::new()
        .route("/files", get(list_all))
        .route("/files/{id}", get(get_one).put(update).delete(remove))
        .route("/files/{id}/download", get(download_file))
        .route("/files/{id}/preview", get(preview_file))
        .route("/files/{id}/link", put(link_to_communication))
        .route("/files/{id}/link-phase", put(link_to_phase))
}

async fn list_by_project(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
) -> AppResult<Json<Vec<FileMeta>>> {
    ensure_project_exists(&pool, project_id).await?;
    let rows = sqlx::query_as::<_, ProjectFile>(
        "SELECT id, project_id, communication_id, phase_id, source_type, url, original_name, stored_name, \
         mime_type, file_size, description, tags, file_path, created_at \
         FROM project_files WHERE project_id = $1 ORDER BY created_at DESC",
    )
    .bind(project_id)
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows.into_iter().map(FileMeta::from).collect()))
}

async fn upload_file(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
    mut multipart: Multipart,
) -> AppResult<impl IntoResponse> {
    ensure_project_exists(&pool, project_id).await?;

    let mut file_data: Option<Vec<u8>> = None;
    let mut original_name: Option<String> = None;
    let mut mime_type: Option<String> = None;
    let mut description: Option<String> = None;
    let mut tags: Vec<String> = Vec::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("multipart error: {e}")))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "file" => {
                original_name = field.file_name().map(|s| s.to_string());
                mime_type = field.content_type().map(|s| s.to_string());
                file_data = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|e| AppError::BadRequest(format!("read error: {e}")))?
                        .to_vec(),
                );
            }
            "description" => {
                description = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::BadRequest(format!("read error: {e}")))?,
                );
            }
            "tags" => {
                let text = field
                    .text()
                    .await
                    .map_err(|e| AppError::BadRequest(format!("read error: {e}")))?;
                tags = text
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
            }
            _ => {}
        }
    }

    let file_data =
        file_data.ok_or_else(|| AppError::BadRequest("no file in upload".into()))?;
    let original_name = original_name.unwrap_or_else(|| "unnamed".to_string());
    let mime_type = mime_type.unwrap_or_else(|| "application/octet-stream".to_string());
    let file_size = file_data.len() as i64;

    // stored name = uuid + original extension
    let ext = std::path::Path::new(&original_name)
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    let stored_name = format!("{}{ext}", Uuid::new_v4());

    let upload_dir = format!("./uploads/{project_id}");
    tokio::fs::create_dir_all(&upload_dir)
        .await
        .map_err(|e| AppError::BadRequest(format!("create dir error: {e}")))?;

    let file_path = format!("{upload_dir}/{stored_name}");
    tokio::fs::write(&file_path, &file_data)
        .await
        .map_err(|e| AppError::BadRequest(format!("write file error: {e}")))?;

    let row = match sqlx::query_as::<_, ProjectFile>(
        "INSERT INTO project_files \
         (project_id, original_name, stored_name, mime_type, file_size, description, tags, file_path) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) \
         RETURNING id, project_id, communication_id, phase_id, source_type, url, original_name, stored_name, \
         mime_type, file_size, description, tags, file_path, created_at",
    )
    .bind(project_id)
    .bind(&original_name)
    .bind(&stored_name)
    .bind(&mime_type)
    .bind(file_size)
    .bind(&description)
    .bind(&tags)
    .bind(&file_path)
    .fetch_one(&pool)
    .await
    {
        Ok(row) => row,
        Err(error) => {
            if let Err(cleanup_error) = tokio::fs::remove_file(&file_path).await {
                tracing::warn!(
                    path = %file_path,
                    error = %cleanup_error,
                    "failed to remove uploaded file after database insert failed"
                );
            }
            return Err(error.into());
        }
    };

    Ok((StatusCode::CREATED, Json(FileMeta::from(row))))
}

/// `POST /api/projects/:id/links` — create an online link resource
/// (no file upload, just a URL + metadata).
async fn create_link(
    State(pool): State<PgPool>,
    Path(project_id): Path<Uuid>,
    Json(input): Json<CreateLink>,
) -> AppResult<(StatusCode, Json<FileMeta>)> {
    ensure_project_exists(&pool, project_id).await?;
    let row = sqlx::query_as::<_, ProjectFile>(
        "INSERT INTO project_files \
         (project_id, original_name, source_type, url, description, tags, \
          stored_name, mime_type, file_size, file_path) \
         VALUES ($1, $2, 'link', $3, $4, $5, '', 'text/uri-list', 0, '') \
         RETURNING id, project_id, communication_id, phase_id, source_type, url, \
         original_name, stored_name, mime_type, file_size, description, tags, file_path, created_at",
    )
    .bind(project_id)
    .bind(&input.name)
    .bind(&input.url)
    .bind(&input.description)
    .bind(&input.tags)
    .fetch_one(&pool)
    .await?;
    Ok((StatusCode::CREATED, Json(FileMeta::from(row))))
}

async fn get_one(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<FileMeta>> {
    let row = sqlx::query_as::<_, ProjectFile>(
        "SELECT id, project_id, communication_id, phase_id, source_type, url, original_name, stored_name, \
         mime_type, file_size, description, tags, file_path, created_at \
         FROM project_files WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("file {id} not found")))?;
    Ok(Json(FileMeta::from(row)))
}

async fn download_file(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    let row = sqlx::query_as::<_, ProjectFile>(
        "SELECT id, project_id, communication_id, phase_id, source_type, url, original_name, stored_name, \
         mime_type, file_size, description, tags, file_path, created_at \
         FROM project_files WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("file {id} not found")))?;

    let data = tokio::fs::read(&row.file_path)
        .await
        .map_err(|e| AppError::BadRequest(format!("read file error: {e}")))?;

    Ok((
        [
            (header::CONTENT_TYPE, row.mime_type),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{}\"", row.original_name),
            ),
        ],
        Body::from(data),
    ))
}

async fn update(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(input): Json<UpdateFile>,
) -> AppResult<Json<FileMeta>> {
    let row = sqlx::query_as::<_, ProjectFile>(
        "UPDATE project_files SET description = COALESCE($2, description), \
         tags = COALESCE($3, tags) WHERE id = $1 \
         RETURNING id, project_id, communication_id, phase_id, source_type, url, original_name, stored_name, \
         mime_type, file_size, description, tags, file_path, created_at",
    )
    .bind(id)
    .bind(input.description.as_ref())
    .bind(input.tags.as_ref())
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("file {id} not found")))?;
    Ok(Json(FileMeta::from(row)))
}

async fn remove(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    // Fetch file_path before deleting so we can remove the file from disk
    let row = sqlx::query_as::<_, ProjectFile>(
        "SELECT id, project_id, communication_id, phase_id, source_type, url, original_name, stored_name, \
         mime_type, file_size, description, tags, file_path, created_at \
         FROM project_files WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("file {id} not found")))?;

    sqlx::query!("DELETE FROM project_files WHERE id = $1", id)
        .execute(&pool)
        .await?;

    // Best-effort file removal — don't fail if the file is already gone
    if let Err(error) = tokio::fs::remove_file(&row.file_path).await {
        tracing::warn!(
            path = %row.file_path,
            error = %error,
            "failed to remove uploaded file"
        );
    }

    Ok(StatusCode::NO_CONTENT)
}

// ----------------------------------------------------------------------------
/// Request body for linking a file to a communication record.
#[derive(Debug, Deserialize)]
pub struct LinkFile {
    pub communication_id: Option<Uuid>,
}

/// `PUT /api/files/:id/link` — associate (or dissociate) a file with a
/// communication record. Pass `communication_id: null` to unlink.
async fn link_to_communication(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(input): Json<LinkFile>,
) -> AppResult<Json<FileMeta>> {
    let row = sqlx::query_as::<_, ProjectFile>(
        "UPDATE project_files SET communication_id = $2 WHERE id = $1 \
         RETURNING id, project_id, communication_id, phase_id, source_type, url, original_name, stored_name, \
         mime_type, file_size, description, tags, file_path, created_at",
    )
    .bind(id)
    .bind(input.communication_id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("file {id} not found")))?;
    Ok(Json(FileMeta::from(row)))
}

// ----------------------------------------------------------------------------
/// Request body for linking a file to a phase.
#[derive(Debug, Deserialize)]
pub struct LinkPhase {
    pub phase_id: Option<Uuid>,
}

/// `PUT /api/files/:id/link-phase` — associate (or dissociate) a file with a
/// project phase. Pass `phase_id: null` to unlink.
async fn link_to_phase(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(input): Json<LinkPhase>,
) -> AppResult<Json<FileMeta>> {
    let row = sqlx::query_as::<_, ProjectFile>(
        "UPDATE project_files SET phase_id = $2 WHERE id = $1 \
         RETURNING id, project_id, communication_id, phase_id, source_type, url, original_name, stored_name, \
         mime_type, file_size, description, tags, file_path, created_at",
    )
    .bind(id)
    .bind(input.phase_id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("file {id} not found")))?;
    Ok(Json(FileMeta::from(row)))
}

/// `GET /api/files` — list ALL files across projects, with project name.
async fn list_all(State(pool): State<PgPool>) -> AppResult<Json<Vec<FileWithProject>>> {
    let rows = sqlx::query_as::<_, FileWithProject>(
        "SELECT pf.id, pf.project_id, pf.communication_id, pf.phase_id, pf.source_type, pf.url, pf.original_name, \
         pf.mime_type, pf.file_size, pf.description, pf.tags, pf.created_at, \
         p.name as project_name \
         FROM project_files pf \
         JOIN projects p ON pf.project_id = p.id \
         ORDER BY pf.created_at DESC",
    )
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows))
}

/// `GET /api/files/:id/preview` — return file content inline (not attachment).
async fn preview_file(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    let row = sqlx::query_as::<_, ProjectFile>(
        "SELECT id, project_id, communication_id, phase_id, source_type, url, original_name, stored_name, \
         mime_type, file_size, description, tags, file_path, created_at \
         FROM project_files WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("file {id} not found")))?;

    let data = tokio::fs::read(&row.file_path)
        .await
        .map_err(|e| AppError::BadRequest(format!("read file error: {e}")))?;

    Ok((
        [
            (header::CONTENT_TYPE, row.mime_type),
            (
                header::CONTENT_DISPOSITION,
                format!("inline; filename=\"{}\"", row.original_name),
            ),
        ],
        Body::from(data),
    ))
}
