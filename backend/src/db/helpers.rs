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

// ---------------------------------------------------------------------------
// chrono ↔ time conversions for sqlx macro bind parameters.
//
// tower-sessions-sqlx-store force-enables sqlx's `time` feature, so
// temporal *bind parameters* in `query!`/`query_as!` macros infer
// time-crate types while our models use chrono. Output columns are
// handled with `AS "col: chrono::DateTime<chrono::Utc>"` annotations in
// the SQL itself; these helpers cover the bind side.
// ---------------------------------------------------------------------------

/// `chrono::DateTime<Utc>` → `time::OffsetDateTime` (macro bind).
pub fn dt_to_offset(dt: chrono::DateTime<chrono::Utc>) -> time::OffsetDateTime {
    time::OffsetDateTime::from_unix_timestamp_nanos(
        i128::from(dt.timestamp()) * 1_000_000_000 + i128::from(dt.timestamp_subsec_nanos()),
    )
    .expect("timestamp within time crate's supported range")
}

/// `chrono::NaiveDate` → `time::Date` (macro bind).
pub fn date_to_time_date(d: chrono::NaiveDate) -> time::Date {
    use chrono::Datelike;
    let month = match d.month() {
        1 => time::Month::January,
        2 => time::Month::February,
        3 => time::Month::March,
        4 => time::Month::April,
        5 => time::Month::May,
        6 => time::Month::June,
        7 => time::Month::July,
        8 => time::Month::August,
        9 => time::Month::September,
        10 => time::Month::October,
        11 => time::Month::November,
        _ => time::Month::December,
    };
    time::Date::from_calendar_date(d.year(), month, d.day() as u8).expect("valid calendar date")
}

/// Verify that a communication exists and belongs to the given project.
/// Used by issues/findings to guard an optional `communication_id` link.
pub async fn ensure_communication_in_project(
    pool: &PgPool,
    project_id: Uuid,
    communication_id: Uuid,
) -> AppResult<()> {
    let exists: Option<(Uuid,)> =
        sqlx::query_as("SELECT id FROM communications WHERE id = $1 AND project_id = $2")
            .bind(communication_id)
            .bind(project_id)
            .fetch_optional(pool)
            .await?;

    if exists.is_none() {
        return Err(AppError::BadRequest(format!(
            "communication {communication_id} does not belong to project {project_id}"
        )));
    }

    Ok(())
}
