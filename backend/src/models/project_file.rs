//! ProjectFile (项目文件) — uploaded documents, screenshots, reports.
//!
//! Files are stored on the local filesystem under `./uploads/{project_id}/`.
//! The DB row tracks metadata (original name, mime type, size, tags) so
//! the frontend can list/search without touching the filesystem.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ProjectFile {
    pub id: Uuid,
    pub project_id: Uuid,
    pub communication_id: Option<Uuid>,
    pub phase_id: Option<Uuid>,
    pub source_type: String,
    pub url: Option<String>,
    pub original_name: String,
    pub stored_name: String,
    pub mime_type: String,
    pub file_size: i64,
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub file_path: String,
    pub created_at: DateTime<Utc>,
}

/// Metadata returned to the frontend after upload. Does NOT include
/// file_path (internal storage detail).
#[derive(Debug, Serialize)]
pub struct FileMeta {
    pub id: Uuid,
    pub project_id: Uuid,
    pub communication_id: Option<Uuid>,
    pub phase_id: Option<Uuid>,
    pub source_type: String,
    pub url: Option<String>,
    pub original_name: String,
    pub mime_type: String,
    pub file_size: i64,
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
}

impl From<ProjectFile> for FileMeta {
    fn from(f: ProjectFile) -> Self {
        Self {
            id: f.id,
            project_id: f.project_id,
            communication_id: f.communication_id,
            phase_id: f.phase_id,
            source_type: f.source_type,
            url: f.url,
            original_name: f.original_name,
            mime_type: f.mime_type,
            file_size: f.file_size,
            description: f.description,
            tags: f.tags,
            created_at: f.created_at,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct UpdateFile {
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
}

/// File metadata + project name — used by the global file library view.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct FileWithProject {
    pub id: Uuid,
    pub project_id: Uuid,
    pub communication_id: Option<Uuid>,
    pub phase_id: Option<Uuid>,
    pub source_type: String,
    pub url: Option<String>,
    pub original_name: String,
    pub mime_type: String,
    pub file_size: i64,
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub project_name: String,
}

/// Request body for creating an online link resource.
#[derive(Debug, Deserialize)]
pub struct CreateLink {
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}
