//! Backup (备份) — full-data export/import for the whole workspace.
//!
//! Four endpoints, all authenticated (mounted on `guarded_api`):
//! - `GET  /api/export`         — JSON snapshot of every business table
//! - `GET  /api/export/archive` — ZIP: `manifest.json` + all uploaded files
//! - `POST /api/import`         — replace-all restore from a JSON snapshot
//! - `POST /api/import/archive` — replace-all restore from a ZIP (multipart)
//!
//! Semantics:
//! - Exports preserve original UUIDs, so a restore re-attaches every
//!   relation (FKs, sort orders, credential ownership) exactly as it was.
//! - Import is deliberately **replace-all**: business tables are wiped in
//!   FK-safe order and re-inserted inside ONE transaction — any failure
//!   rolls the whole restore back. `users`/`session`/`user_sessions`
//!   (the auth domain) are never touched.
//! - The manifest carries `confirm_replace_all: true`, written by the
//!   exporter; the importer rejects manifests without it, so random JSON
//!   cannot trigger a wipe. The SPA additionally asks for confirmation.
//! - JSON import leaves the `./uploads` directory untouched (ids are
//!   preserved, so existing files stay matched). The archive variant is
//!   the full-fidelity path: it restores uploaded file contents too and
//!   resets `./uploads` to exactly the archive's contents.
//! - Manifests contain asset-credential secrets in plain text — treat
//!   exported files as sensitive.

use std::io::{Read as _, Write as _};

use axum::{
    extract::{Multipart, State},
    http::header,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::error::{AppError, AppResult};
use crate::models::{
    Asset, AssetCredential, Client, Communication, Deliverable, Finding, Issue, Person, Phase,
    Project, ProjectFile, Task,
};
use crate::state::AppState;

/// Identifies the file layout; the importer rejects anything else.
pub const BACKUP_FORMAT: &str = "project-manage-backup";
/// Current manifest schema. Bump on any breaking field change.
pub const BACKUP_VERSION: i32 = 1;

// ---------------------------------------------------------------------------
// Manifest schema
// ---------------------------------------------------------------------------

/// One row per business table, all 12 resources in dependency-safe groups.
/// Field order here is also the delete/insert order used by the importer.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct BackupData {
    #[serde(default)]
    pub clients: Vec<Client>,
    #[serde(default)]
    pub projects: Vec<Project>,
    #[serde(default)]
    pub phases: Vec<Phase>,
    #[serde(default)]
    pub people: Vec<Person>,
    #[serde(default)]
    pub communications: Vec<Communication>,
    #[serde(default)]
    pub tasks: Vec<Task>,
    #[serde(default)]
    pub issues: Vec<Issue>,
    #[serde(default)]
    pub findings: Vec<Finding>,
    #[serde(default)]
    pub assets: Vec<Asset>,
    #[serde(default)]
    pub asset_credentials: Vec<AssetCredential>,
    #[serde(default)]
    pub project_files: Vec<ProjectFile>,
    #[serde(default)]
    pub deliverables: Vec<Deliverable>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupManifest {
    pub format: String,
    pub version: i32,
    /// Written `true` by the exporter; required by the importer so a
    /// random JSON POST can never wipe the workspace.
    pub confirm_replace_all: bool,
    pub exported_at: DateTime<Utc>,
    pub app_version: String,
    pub data: BackupData,
}

/// What the importer did — surfaced in the SPA after a restore.
#[derive(Debug, Serialize)]
pub struct ImportReport {
    pub clients: usize,
    pub projects: usize,
    pub phases: usize,
    pub people: usize,
    pub communications: usize,
    pub tasks: usize,
    pub issues: usize,
    pub findings: usize,
    pub assets: usize,
    pub asset_credentials: usize,
    pub project_files: usize,
    pub deliverables: usize,
    /// Archive import only: uploaded files restored to `./uploads`.
    pub files_written: usize,
    /// Archive import only: rows whose bytes were missing from the archive.
    pub files_missing: Vec<String>,
}

pub fn backup_router() -> Router<AppState> {
    Router::new()
        .route("/export", get(export_json))
        .route("/export/archive", get(export_archive))
        .route("/import", post(import_json))
        .route("/import/archive", post(import_archive))
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

async fn collect_data(pool: &PgPool) -> AppResult<BackupData> {
    // Independently ordered (created_at, id) so exports are stable.
    let clients = sqlx::query_as::<_, Client>(
        "SELECT id, name, contact_person, contact_info, notes, products, \
         background_info, created_at, updated_at FROM clients \
         ORDER BY created_at ASC, id ASC",
    )
    .fetch_all(pool)
    .await?;
    let projects = sqlx::query_as::<_, Project>(
        "SELECT id, client_id, name, status, phase, goals, tech_approval, \
         competitors, created_at, updated_at FROM projects \
         ORDER BY created_at ASC, id ASC",
    )
    .fetch_all(pool)
    .await?;
    let phases = sqlx::query_as::<_, Phase>(
        "SELECT id, project_id, parent_id, name, description, sort_order, \
         planned_start, planned_end, actual_start, actual_end, status, \
         created_at, updated_at FROM phases ORDER BY created_at ASC, id ASC",
    )
    .fetch_all(pool)
    .await?;
    let people = sqlx::query_as::<_, Person>(
        "SELECT id, project_id, side, name, role, notes, sort_order, created_at \
         FROM people ORDER BY created_at ASC, id ASC",
    )
    .fetch_all(pool)
    .await?;
    let communications = sqlx::query_as::<_, Communication>(
        "SELECT id, project_id, content, occurred_at, participants, conclusion, \
         created_at FROM communications ORDER BY created_at ASC, id ASC",
    )
    .fetch_all(pool)
    .await?;
    let tasks = sqlx::query_as::<_, Task>(
        "SELECT id, project_id, title, status, planned_date, assignee_id, \
         priority, created_at, updated_at FROM tasks \
         ORDER BY created_at ASC, id ASC",
    )
    .fetch_all(pool)
    .await?;
    let issues = sqlx::query_as::<_, Issue>(
        "SELECT id, project_id, title, description, status, communication_id, \
         assignee_id, priority, due_date, created_at, updated_at FROM issues \
         ORDER BY created_at ASC, id ASC",
    )
    .fetch_all(pool)
    .await?;
    let findings = sqlx::query_as::<_, Finding>(
        "SELECT id, project_id, title, description, product, product_source, \
         vendor, observed_at, communication_id, feedback_status, created_at, \
         updated_at FROM findings ORDER BY created_at ASC, id ASC",
    )
    .fetch_all(pool)
    .await?;
    let assets = sqlx::query_as::<_, Asset>(
        "SELECT id, project_id, name, asset_type, value, description, \
         access_method, vendor, sort_order, created_at, updated_at, \
         (SELECT COUNT(*) FROM asset_credentials ac WHERE ac.asset_id = assets.id) \
         AS credential_count FROM assets ORDER BY created_at ASC, id ASC",
    )
    .fetch_all(pool)
    .await?;
    let asset_credentials = sqlx::query_as::<_, AssetCredential>(
        "SELECT id, asset_id, label, cred_type, username, secret, sort_order, \
         created_at, updated_at FROM asset_credentials \
         ORDER BY created_at ASC, id ASC",
    )
    .fetch_all(pool)
    .await?;
    let project_files = sqlx::query_as::<_, ProjectFile>(
        "SELECT id, project_id, communication_id, phase_id, source_type, url, \
         original_name, stored_name, mime_type, file_size, description, tags, \
         file_path, created_at FROM project_files ORDER BY created_at ASC, id ASC",
    )
    .fetch_all(pool)
    .await?;
    let deliverables = sqlx::query_as::<_, Deliverable>(
        "SELECT id, project_id, name, status, due_date, linked_file_id, \
         sort_order, created_at, updated_at FROM deliverables \
         ORDER BY created_at ASC, id ASC",
    )
    .fetch_all(pool)
    .await?;

    Ok(BackupData {
        clients,
        projects,
        phases,
        people,
        communications,
        tasks,
        issues,
        findings,
        assets,
        asset_credentials,
        project_files,
        deliverables,
    })
}

fn build_manifest(data: BackupData) -> BackupManifest {
    BackupManifest {
        format: BACKUP_FORMAT.to_string(),
        version: BACKUP_VERSION,
        confirm_replace_all: true,
        exported_at: Utc::now(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        data,
    }
}

/// `GET /api/export` — JSON snapshot (metadata only; uploaded file
/// contents need the archive variant).
async fn export_json(State(pool): State<PgPool>) -> AppResult<impl IntoResponse> {
    let manifest = build_manifest(collect_data(&pool).await?);
    let body = serde_json::to_vec_pretty(&manifest)
        .map_err(|e| AppError::BadRequest(format!("serialize backup: {e}")))?;
    let filename = format!(
        "project-manage-export-{}.json",
        Utc::now().format("%Y%m%d-%H%M%S")
    );
    Ok((
        [
            (header::CONTENT_TYPE, "application/json".to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\""),
            ),
        ],
        body,
    ))
}

/// `GET /api/export/archive` — ZIP with `manifest.json` plus every
/// uploaded file that still exists on disk (missing files are skipped
/// with a warning, not a failure).
async fn export_archive(State(pool): State<PgPool>) -> AppResult<impl IntoResponse> {
    let data = collect_data(&pool).await?;
    // Pull out the disk-backed file list before `data` moves into the
    // manifest: (zip entry name, on-disk path).
    let file_entries: Vec<(String, String)> = data
        .project_files
        .iter()
        .filter(|f| f.source_type == "file")
        .map(|f| {
            (
                format!("uploads/{}/{}", f.project_id, f.stored_name),
                f.file_path.clone(),
            )
        })
        .collect();
    let manifest = build_manifest(data);
    let json_bytes = serde_json::to_vec_pretty(&manifest)
        .map_err(|e| AppError::BadRequest(format!("serialize backup: {e}")))?;

    let mut buf = std::io::Cursor::new(Vec::new());
    {
        let mut writer = zip::ZipWriter::new(&mut buf);
        let options: zip::write::SimpleFileOptions = Default::default();
        writer
            .start_file("manifest.json", options)
            .map_err(zip_err)?;
        writer
            .write_all(&json_bytes)
            .map_err(|e| AppError::BadRequest(format!("zip write error: {e}")))?;

        for (entry_name, disk_path) in &file_entries {
            let bytes = match tokio::fs::read(disk_path).await {
                Ok(bytes) => bytes,
                Err(err) => {
                    tracing::warn!(
                        path = %disk_path,
                        error = %err,
                        "archive export skipped a missing upload"
                    );
                    continue;
                }
            };
            writer
                .start_file(entry_name.as_str(), options)
                .map_err(zip_err)?;
            writer
                .write_all(&bytes)
                .map_err(|e| AppError::BadRequest(format!("zip write error: {e}")))?;
        }
        writer.finish().map_err(zip_err)?;
    }

    let filename = format!(
        "project-manage-backup-{}.zip",
        Utc::now().format("%Y%m%d-%H%M%S")
    );
    Ok((
        [
            (header::CONTENT_TYPE, "application/zip".to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\""),
            ),
        ],
        buf.into_inner(),
    ))
}

fn zip_err(e: zip::result::ZipError) -> AppError {
    AppError::BadRequest(format!("zip error: {e}"))
}

// ---------------------------------------------------------------------------
// Import (replace-all, transactional)
// ---------------------------------------------------------------------------

fn validate_manifest(manifest: &BackupManifest) -> AppResult<()> {
    if manifest.format != BACKUP_FORMAT {
        return Err(AppError::BadRequest(format!(
            "not a {BACKUP_FORMAT} file (format: {:?})",
            manifest.format
        )));
    }
    if manifest.version != BACKUP_VERSION {
        return Err(AppError::BadRequest(format!(
            "unsupported backup version {} (this server understands {BACKUP_VERSION})",
            manifest.version
        )));
    }
    if !manifest.confirm_replace_all {
        return Err(AppError::BadRequest(
            "manifest lacks confirm_replace_all — import would wipe current data".into(),
        ));
    }
    Ok(())
}

async fn wipe_business_tables(tx: &mut sqlx::PgConnection) -> AppResult<()> {
    // Children first so FKs stay satisfied throughout.
    for table in [
        "asset_credentials",
        "deliverables",
        "project_files",
        "issues",
        "findings",
        "tasks",
        "communications",
        "people",
        "phases",
        "assets",
        "projects",
        "clients",
    ] {
        sqlx::query(&format!("DELETE FROM {table}"))
            .execute(&mut *tx)
            .await?;
    }
    Ok(())
}

async fn restore_data(tx: &mut sqlx::PgConnection, data: &BackupData) -> AppResult<()> {
    for c in &data.clients {
        sqlx::query(
            "INSERT INTO clients (id, name, contact_person, contact_info, notes, \
             products, background_info, created_at, updated_at) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        )
        .bind(c.id)
        .bind(&c.name)
        .bind(&c.contact_person)
        .bind(&c.contact_info)
        .bind(&c.notes)
        .bind(&c.products)
        .bind(&c.background_info)
        .bind(c.created_at)
        .bind(c.updated_at)
        .execute(&mut *tx)
        .await?;
    }
    for p in &data.projects {
        sqlx::query(
            "INSERT INTO projects (id, client_id, name, status, phase, goals, \
             tech_approval, competitors, created_at, updated_at) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        )
        .bind(p.id)
        .bind(p.client_id)
        .bind(&p.name)
        .bind(&p.status)
        .bind(&p.phase)
        .bind(&p.goals)
        .bind(&p.tech_approval)
        .bind(&p.competitors)
        .bind(p.created_at)
        .bind(p.updated_at)
        .execute(&mut *tx)
        .await?;
    }
    for ph in &data.phases {
        sqlx::query(
            "INSERT INTO phases (id, project_id, parent_id, name, description, \
             sort_order, planned_start, planned_end, actual_start, actual_end, \
             status, created_at, updated_at) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
        )
        .bind(ph.id)
        .bind(ph.project_id)
        .bind(ph.parent_id)
        .bind(&ph.name)
        .bind(&ph.description)
        .bind(ph.sort_order)
        .bind(ph.planned_start)
        .bind(ph.planned_end)
        .bind(ph.actual_start)
        .bind(ph.actual_end)
        .bind(&ph.status)
        .bind(ph.created_at)
        .bind(ph.updated_at)
        .execute(&mut *tx)
        .await?;
    }
    for pe in &data.people {
        sqlx::query(
            "INSERT INTO people (id, project_id, side, name, role, notes, \
             sort_order, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        )
        .bind(pe.id)
        .bind(pe.project_id)
        .bind(&pe.side)
        .bind(&pe.name)
        .bind(&pe.role)
        .bind(&pe.notes)
        .bind(pe.sort_order)
        .bind(pe.created_at)
        .execute(&mut *tx)
        .await?;
    }
    for com in &data.communications {
        sqlx::query(
            "INSERT INTO communications (id, project_id, content, occurred_at, \
             participants, conclusion, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        )
        .bind(com.id)
        .bind(com.project_id)
        .bind(&com.content)
        .bind(com.occurred_at)
        .bind(&com.participants)
        .bind(&com.conclusion)
        .bind(com.created_at)
        .execute(&mut *tx)
        .await?;
    }
    for t in &data.tasks {
        sqlx::query(
            "INSERT INTO tasks (id, project_id, title, status, planned_date, \
             assignee_id, priority, created_at, updated_at) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        )
        .bind(t.id)
        .bind(t.project_id)
        .bind(&t.title)
        .bind(&t.status)
        .bind(t.planned_date)
        .bind(t.assignee_id)
        .bind(&t.priority)
        .bind(t.created_at)
        .bind(t.updated_at)
        .execute(&mut *tx)
        .await?;
    }
    for i in &data.issues {
        sqlx::query(
            "INSERT INTO issues (id, project_id, title, description, status, \
             communication_id, assignee_id, priority, due_date, created_at, \
             updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        )
        .bind(i.id)
        .bind(i.project_id)
        .bind(&i.title)
        .bind(&i.description)
        .bind(&i.status)
        .bind(i.communication_id)
        .bind(i.assignee_id)
        .bind(&i.priority)
        .bind(i.due_date)
        .bind(i.created_at)
        .bind(i.updated_at)
        .execute(&mut *tx)
        .await?;
    }
    for f in &data.findings {
        sqlx::query(
            "INSERT INTO findings (id, project_id, title, description, product, \
             product_source, vendor, observed_at, communication_id, \
             feedback_status, created_at, updated_at) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        )
        .bind(f.id)
        .bind(f.project_id)
        .bind(&f.title)
        .bind(&f.description)
        .bind(&f.product)
        .bind(&f.product_source)
        .bind(&f.vendor)
        .bind(f.observed_at)
        .bind(f.communication_id)
        .bind(&f.feedback_status)
        .bind(f.created_at)
        .bind(f.updated_at)
        .execute(&mut *tx)
        .await?;
    }
    for a in &data.assets {
        sqlx::query(
            "INSERT INTO assets (id, project_id, name, asset_type, value, \
             description, access_method, vendor, sort_order, created_at, \
             updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        )
        .bind(a.id)
        .bind(a.project_id)
        .bind(&a.name)
        .bind(&a.asset_type)
        .bind(&a.value)
        .bind(&a.description)
        .bind(&a.access_method)
        .bind(&a.vendor)
        .bind(a.sort_order)
        .bind(a.created_at)
        .bind(a.updated_at)
        .execute(&mut *tx)
        .await?;
    }
    for ac in &data.asset_credentials {
        sqlx::query(
            "INSERT INTO asset_credentials (id, asset_id, label, cred_type, \
             username, secret, sort_order, created_at, updated_at) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        )
        .bind(ac.id)
        .bind(ac.asset_id)
        .bind(&ac.label)
        .bind(&ac.cred_type)
        .bind(&ac.username)
        .bind(&ac.secret)
        .bind(ac.sort_order)
        .bind(ac.created_at)
        .bind(ac.updated_at)
        .execute(&mut *tx)
        .await?;
    }
    for pf in &data.project_files {
        sqlx::query(
            "INSERT INTO project_files (id, project_id, communication_id, \
             phase_id, source_type, url, original_name, stored_name, mime_type, \
             file_size, description, tags, file_path, created_at) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
        )
        .bind(pf.id)
        .bind(pf.project_id)
        .bind(pf.communication_id)
        .bind(pf.phase_id)
        .bind(&pf.source_type)
        .bind(&pf.url)
        .bind(&pf.original_name)
        .bind(&pf.stored_name)
        .bind(&pf.mime_type)
        .bind(pf.file_size)
        .bind(&pf.description)
        .bind(&pf.tags)
        .bind(&pf.file_path)
        .bind(pf.created_at)
        .execute(&mut *tx)
        .await?;
    }
    for d in &data.deliverables {
        sqlx::query(
            "INSERT INTO deliverables (id, project_id, name, status, due_date, \
             linked_file_id, sort_order, created_at, updated_at) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        )
        .bind(d.id)
        .bind(d.project_id)
        .bind(&d.name)
        .bind(&d.status)
        .bind(d.due_date)
        .bind(d.linked_file_id)
        .bind(d.sort_order)
        .bind(d.created_at)
        .bind(d.updated_at)
        .execute(&mut *tx)
        .await?;
    }
    Ok(())
}

fn report_for(data: &BackupData) -> ImportReport {
    ImportReport {
        clients: data.clients.len(),
        projects: data.projects.len(),
        phases: data.phases.len(),
        people: data.people.len(),
        communications: data.communications.len(),
        tasks: data.tasks.len(),
        issues: data.issues.len(),
        findings: data.findings.len(),
        assets: data.assets.len(),
        asset_credentials: data.asset_credentials.len(),
        project_files: data.project_files.len(),
        deliverables: data.deliverables.len(),
        files_written: 0,
        files_missing: Vec::new(),
    }
}

/// `POST /api/import` — replace-all restore from a JSON snapshot.
/// Transactional: any failure rolls everything back.
async fn import_json(
    State(pool): State<PgPool>,
    Json(manifest): Json<BackupManifest>,
) -> AppResult<Json<ImportReport>> {
    validate_manifest(&manifest)?;

    let mut tx = pool.begin().await?;
    wipe_business_tables(&mut tx).await?;
    restore_data(&mut tx, &manifest.data).await?;
    tx.commit().await?;

    tracing::info!("workspace restored from JSON backup");
    Ok(Json(report_for(&manifest.data)))
}

/// `POST /api/import/archive` — replace-all restore from a ZIP archive
/// (multipart field `file`). Restores the database transactionally, then
/// resets `./uploads` to exactly the archive's file contents. Per-file
/// write failures are reported, not fatal.
async fn import_archive(
    State(pool): State<PgPool>,
    mut multipart: Multipart,
) -> AppResult<Json<ImportReport>> {
    let mut archive_bytes: Option<Vec<u8>> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("multipart error: {e}")))?
    {
        if field.name() == Some("file") {
            archive_bytes = Some(
                field
                    .bytes()
                    .await
                    .map_err(|e| AppError::BadRequest(format!("read error: {e}")))?
                    .to_vec(),
            );
        }
    }
    let bytes = archive_bytes
        .ok_or_else(|| AppError::BadRequest("multipart field \"file\" is required".into()))?;

    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(zip_err)?;
    let json_bytes = {
        let mut entry = archive
            .by_name("manifest.json")
            .map_err(|_| AppError::BadRequest("archive has no manifest.json".into()))?;
        let mut buf = Vec::new();
        entry
            .read_to_end(&mut buf)
            .map_err(|e| AppError::BadRequest(format!("zip read error: {e}")))?;
        buf
    };
    let manifest: BackupManifest = serde_json::from_slice(&json_bytes)
        .map_err(|e| AppError::BadRequest(format!("bad manifest: {e}")))?;
    validate_manifest(&manifest)?;

    // 1. Database restore (transactional).
    let mut tx = pool.begin().await?;
    wipe_business_tables(&mut tx).await?;
    restore_data(&mut tx, &manifest.data).await?;
    tx.commit().await?;

    // 2. Uploads: reset the directory to exactly the archive's contents.
    let mut report = report_for(&manifest.data);
    let _ = tokio::fs::remove_dir_all("./uploads").await;
    tokio::fs::create_dir_all("./uploads")
        .await
        .map_err(|e| AppError::BadRequest(format!("cannot reset ./uploads: {e}")))?;

    for f in &manifest.data.project_files {
        if f.source_type != "file" {
            continue;
        }
        let entry_name = format!("uploads/{}/{}", f.project_id, f.stored_name);
        let contents = match archive.by_name(&entry_name) {
            Ok(mut entry) => {
                let mut buf = Vec::new();
                match entry.read_to_end(&mut buf) {
                    Ok(_) => buf,
                    Err(err) => {
                        report.files_missing.push(entry_name.clone());
                        tracing::warn!(entry = %entry_name, error = %err, "unreadable archive entry");
                        continue;
                    }
                }
            }
            Err(_) => {
                report.files_missing.push(entry_name.clone());
                continue;
            }
        };
        let disk_path = format!("./uploads/{}/{}", f.project_id, f.stored_name);
        if let Some(parent) = std::path::Path::new(&disk_path).parent()
            && let Err(err) = tokio::fs::create_dir_all(parent).await
        {
            tracing::warn!(path = %disk_path, error = %err, "mkdir failed");
            report.files_missing.push(entry_name);
            continue;
        }
        match tokio::fs::write(&disk_path, &contents).await {
            Ok(_) => report.files_written += 1,
            Err(err) => {
                tracing::warn!(path = %disk_path, error = %err, "upload restore failed");
                report.files_missing.push(entry_name);
            }
        }
    }

    tracing::info!(
        files_written = report.files_written,
        files_missing = report.files_missing.len(),
        "workspace restored from backup archive"
    );
    Ok(Json(report))
}
