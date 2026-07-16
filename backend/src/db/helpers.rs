//! Shared database helpers used by multiple handlers.

use sqlx::PgPool;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

/// Verify that a project exists before handling a project-scoped request.
pub async fn ensure_project_exists(pool: &PgPool, project_id: Uuid) -> AppResult<()> {
    let exists: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM projects WHERE id = $1")
        .bind(project_id)
        .fetch_optional(pool)
        .await?;

    if exists.is_none() {
        return Err(AppError::NotFound(format!(
            "project {project_id} not found"
        )));
    }

    Ok(())
}
