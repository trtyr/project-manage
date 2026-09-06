# project-manage — Module Catalog

Every feature module in the codebase: file path, one-sentence responsibility, public API, internal dependencies. Backend first (handlers → models → db), then frontend (pages → components → shared). All descriptions were verified against the actual source.

---

## A. Backend handlers (`backend/src/handlers/`)

Each handler module exports one or more `*_router()` functions that `app::build_app` (in `backend/src/app.rs`) mounts under `/api`. Routes below are relative to `/api`. `ensure_project_exists` is the guard from `db::helpers` called by every project-scoped handler.

### A.1 `clients` — `backend/src/handlers/clients.rs`

| Field | Value |
|---|---|
| Responsibility | Top-level CRUD for the `clients` table (customers whose projects we run). |
| Router exported | `clients_router() -> Router<AppState>` |
| Routes | `GET /clients`, `POST /clients`, `GET /clients/{id}`, `PUT /clients/{id}`, `DELETE /clients/{id}` |
| Calls `ensure_project_exists` | **No** — clients are top-level, not project-scoped. |
| Non-trivial behaviour | `name` validated non-empty on create and update. `UPDATE` uses `COALESCE($n, column)` so `None` = unchanged. `DELETE` returns 404 if `rows_affected == 0`. |
| Internal deps | `crate::error::{AppError, AppResult}`, `crate::models::{Client, CreateClient, UpdateClient}`, `crate::state::AppState`, `sqlx::PgPool`, `uuid::Uuid`. |

### A.2 `projects` — `backend/src/handlers/projects.rs`

| Field | Value |
|---|---|
| Responsibility | Top-level CRUD for the `projects` table; cascades file cleanup on delete. |
| Router exported | `projects_router() -> Router<AppState>` |
| Routes | `GET /projects`, `POST /projects`, `GET /projects/{id}`, `PUT /projects/{id}`, `DELETE /projects/{id}` |
| Calls `ensure_project_exists` | **No** — projects ARE the resource being checked. |
| Non-trivial behaviour | Validates `status` against `ProjectStatus::is_valid` (defaults to `IN_PROGRESS`). `name` non-empty guard. **`remove` (`DELETE`) reads `project_files.file_path` then `tokio::fs::remove_dir_all("./uploads/{id}")` before deleting the DB row; failure to remove the dir is `tracing::warn!` but does NOT fail the request** (best-effort). |
| Internal deps | `crate::models::{CreateProject, Project, ProjectStatus, UpdateProject}`, `tokio::fs`, `tracing`. |

### A.3 `communications` — `backend/src/handlers/communications.rs`

| Field | Value |
|---|---|
| Responsibility | Project-scoped event log (calls, meetings, etc.) with flat-by-id patch routes and global recent/search endpoints. |
| Routers exported | `project_communications_router()`, `communications_router()` |
| Project-scoped (nested) routes | `GET /projects/{project_id}/communications`, `POST /projects/{project_id}/communications` |
| Flat-by-id routes | `GET /communications/{id}`, `PUT /communications/{id}`, `DELETE /communications/{id}` |
| Global routes | `GET /communications/recent?limit=N` (1–50, default 10), `GET /communications/search?q=...&limit=N` (1–100, default 20, ILIKE on content/conclusion/participants) |
| Calls `ensure_project_exists` | **Yes** — both nested handlers (`list_by_project`, `create_for_project`) call it on entry. Flat handlers don't (they work on comm id). |
| Non-trivial behaviour | `create_for_project` validates `content` non-empty. `list_recent` and `search` join `projects` to return `CommunicationWithProject`. Flat endpoints reject unknown ids with 404 (not 500). |
| Internal deps | `crate::db::helpers::ensure_project_exists`, `crate::models::{Communication, CommunicationWithProject, CreateCommunication, UpdateCommunication}`, `serde::Deserialize` for `RecentParams`/`SearchParams`. |

### A.4 `tasks` — `backend/src/handlers/tasks.rs`

| Field | Value |
|---|---|
| Responsibility | Project-scoped task board with status enum (`current`/`next`/`todo`). |
| Routers exported | `project_tasks_router()`, `tasks_router()` |
| Project-scoped routes | `GET /projects/{project_id}/tasks`, `POST /projects/{project_id}/tasks` |
| Flat-by-id routes | `GET /tasks/{id}`, `PUT /tasks/{id}`, `DELETE /tasks/{id}` |
| Calls `ensure_project_exists` | **Yes** — both nested handlers. |
| Non-trivial behaviour | `create`/`update` validate `status` via `TaskStatus::is_valid` (default `TODO`). **`list_by_project` orders rows with a `CASE status WHEN 'current' THEN 0 …` SQL expression so `current` floats to top, then by `planned_date NULLS LAST`, then `created_at`**. `title` non-empty guard. |
| Internal deps | `crate::models::{CreateTask, Task, TaskStatus, UpdateTask}`. |

### A.5 `assets` — `backend/src/handlers/assets.rs`

| Field | Value |
|---|---|
| Responsibility | Per-project IT inventory (servers, domains, IPs, etc.). |
| Routers exported | `project_assets_router()`, `assets_router()` |
| Project-scoped routes | `GET /projects/{project_id}/assets`, `POST /projects/{project_id}/assets`, `PUT /projects/{project_id}/assets/reorder` (body `{asset_ids: [...]}`, rewrites `sort_order`) |
| Flat-by-id routes | `GET /assets/{id}`, `PUT /assets/{id}`, `DELETE /assets/{id}` |
| Calls `ensure_project_exists` | **Yes** — both nested handlers. |
| Non-trivial behaviour | `asset_type` defaults to `"other"` if omitted. No status enum — `asset_type` is free-form text. `name` non-empty guard on create. `sort_order` (migration 016) supports drag-and-drop reorder via the project-scoped `PUT .../assets/reorder`. Every `Asset` row carries a read-only `credential_count` (correlated subquery; migration 023). Deleting an asset cascades to its credentials. |
| Internal deps | `crate::models::{Asset, CreateAsset, UpdateAsset}`. |

**A.5b `asset_credentials` — `backend/src/handlers/asset_credentials.rs`**
(asset child resource; credential rows formerly lived in the dropped
free-text `assets.credentials` column)

| Field | Value |
|---|---|
| Responsibility | Multi-entry credentials per asset (SSH / admin console / API key…), each with a label, a validated `cred_type`, and separately copyable `username` / `secret`. |
| Routers exported | `project_asset_credentials_router()`, `asset_credentials_router()` |
| Project-scoped routes | `GET /projects/{project_id}/assets/{asset_id}/credentials`, `POST …/credentials` |
| Flat-by-id routes | `PUT /asset-credentials/{id}`, `DELETE /asset-credentials/{id}` |
| Calls `ensure_project_exists` | **Yes** — plus `ensure_asset_in_project` (new shared guard in `db/helpers.rs`) on both nested handlers; `404` when the asset is missing or foreign. |
| Non-trivial behaviour | `label` non-empty; `cred_type` validated via `CredentialType::is_valid` (default `"password"`), one of `["password", "api_key", "certificate", "token", "other"]`. Create appends `sort_order`; update is COALESCE-based. Secrets are plain TEXT — masking is frontend-only. |
| Internal deps | `crate::models::{AssetCredential, CreateAssetCredential, CredentialType, UpdateAssetCredential}`. |

### A.6 `files` — `backend/src/handlers/files.rs`

| Field | Value |
|---|---|
| Responsibility | Project file library: multipart upload, preview, download, link-to-comm/phase, and URL-only link entries. |
| Routers exported | `project_files_router()`, `files_router()` |
| Project-scoped routes | `GET /projects/{project_id}/files`, `POST /projects/{project_id}/files` (multipart), `POST /projects/{project_id}/links` (URL link entry) |
| Flat-by-id routes | `GET /files`, `GET /files/{id}`, `PUT /files/{id}`, `DELETE /files/{id}`, `GET /files/{id}/download`, `GET /files/{id}/preview`, `PUT /files/{id}/link` (comm), `PUT /files/{id}/link-phase` |
| Calls `ensure_project_exists` | **Yes** — `list_by_project`, `upload_file`, `create_link`. |
| Non-trivial behaviour | **`upload_file` writes the body to disk `./uploads/{project_id}/{uuid}{ext}` BEFORE the DB INSERT** (`stored_name` is computed, the dir is `create_dir_all`'d, the file is written, then the row is inserted); if the INSERT fails the on-disk file is removed and a `tracing::warn!` is logged. `delete` fetches `file_path` first, deletes the DB row, then `tokio::fs::remove_file` (best-effort, warns on failure). `download_file` returns `attachment; filename=...` headers; `preview_file` returns `inline; filename=...`. `tags` come in as a comma-separated multipart field. |
| Internal deps | `crate::models::{CreateLink, FileMeta, FileWithProject, ProjectFile, UpdateFile}`, `axum::body::Body`, `axum::extract::Multipart`, `tokio::fs`. |

### A.7 `phases` — `backend/src/handlers/phases.rs`

| Field | Value |
|---|---|
| Responsibility | Project phase planning with self-referencing nesting (大阶段 / 小阶段). |
| Routers exported | `project_phases_router()`, `phases_router()` |
| Project-scoped routes | `GET /projects/{project_id}/phases`, `POST /projects/{project_id}/phases` |
| Flat-by-id routes | `GET /phases/{id}`, `PUT /phases/{id}`, `DELETE /phases/{id}` |
| Calls `ensure_project_exists` | **Yes** — both nested handlers. |
| Non-trivial behaviour | `parent_id` makes phases a tree; DB cascade-delete handles child cleanup. `create` defaults `status` to `"pending"`, `sort_order` to `0`. `update` is the only handler that also updates `actual_start`/`actual_end`. `list_by_project` orders by `sort_order, created_at`. |
| Internal deps | `crate::models::{CreatePhase, Phase, UpdatePhase}`. |

### A.8 `people` — `backend/src/handlers/people.rs`

| Field | Value |
|---|---|
| Responsibility | Unified roster of everyone associated with a project — **both** our team and the client side — in one table. Replaces the former split `members` (team) + `client_contacts` (client); the `side` column distinguishes them, and `role` is shared so moving a person across sides needs no field conversion (migration `014_unify_people`). |
| Routers exported | `project_people_router()`, `people_router()` |
| Project-scoped routes | `GET /projects/{project_id}/people`, `POST /projects/{project_id}/people`, `PUT /projects/{project_id}/people/reorder` |
| Flat-by-id routes | `GET /people/{id}`, `PUT /people/{id}`, `DELETE /people/{id}`, `POST /people/{id}/flip-side` |
| Calls `ensure_project_exists` | **Yes** — `list_by_project`, `create_for_project`, `reorder`. |
| Non-trivial behaviour | `create` validates `name` non-empty **and** `side` via `PersonSide::is_valid` (`team` / `client`), then appends at the end of that side's `sort_order` (`MAX+1`). `list_by_project` orders by `side, sort_order, created_at`. **`reorder`** takes `{side, ids: [...]}` (full desired order of one side) and rewrites `sort_order` to index in a transaction; ids from the wrong side/project are silently skipped. **`flip-side`** moves a person team↔client within the same project — `role` is unchanged, `side` flips and `sort_order` resets to the end of the destination side. `Person` has no `updated_at`. |
| Internal deps | `crate::db::helpers::ensure_project_exists`, `crate::models::{CreatePerson, Person, PersonSide, UpdatePerson}`. |

### A.9 `deliverables` — `backend/src/handlers/deliverables.rs`

| Field | Value |
|---|---|
| Responsibility | Structured project deliverable (交付物) tracking — name, status, due date, optional link to a project file. |
| Routers exported | `project_deliverables_router()`, `deliverables_router()` |
| Project-scoped routes | `GET /projects/{project_id}/deliverables`, `POST /projects/{project_id}/deliverables` |
| Flat-by-id routes | `GET /deliverables/{id}`, `PUT /deliverables/{id}`, `DELETE /deliverables/{id}` |
| Calls `ensure_project_exists` | **Yes** — `list_by_project`, `create_for_project`. |
| Non-trivial behaviour | `create` validates `name` non-empty and `status` via `DeliverableStatus::is_valid` (defaults to `pending`); appends at end of `sort_order`. `linked_file_id` optionally ties a deliverable to a row in `project_files`. `list_by_project` orders by `sort_order, created_at`. `update` sets `updated_at = NOW()`. |
| Internal deps | `crate::db::helpers::ensure_project_exists`, `crate::models::{CreateDeliverable, Deliverable, DeliverableStatus, UpdateDeliverable}`. |

### A.10 `issues` — `backend/src/handlers/issues.rs`

| Field | Value |
|---|---|
| Responsibility | Per-project 客户关切 (client concerns) raised during communication, tracked to resolution. |
| Routers exported | `project_issues_router()`, `issues_router()` |
| Project-scoped routes | `GET /projects/{project_id}/issues`, `POST /projects/{project_id}/issues` |
| Flat-by-id routes | `GET /issues/{id}`, `PUT /issues/{id}`, `DELETE /issues/{id}` |
| Calls `ensure_project_exists` | **Yes** — both nested handlers. |
| Non-trivial behaviour | `create`/`update` validate `status` via `IssueStatus::is_valid` (default `open`) and `priority` via `IssuePriority::is_valid` (default `normal`); `title` non-empty guard. **`list_by_project` orders by `CASE status` (open→in_progress→resolved), then `CASE priority` (urgent→low), then `due_date NULLS LAST`, then `created_at`.** An optional `communication_id` is guarded by `ensure_communication_in_project` (same-project check, else 400). |
| Internal deps | `crate::db::helpers::{date_to_time_date, ensure_communication_in_project, ensure_project_exists}`, `crate::models::{CreateIssue, Issue, IssuePriority, IssueStatus, UpdateIssue}`. |

### A.11 `findings` — `backend/src/handlers/findings.rs`

| Field | Value |
|---|---|
| Responsibility | Per-project 产品发现 (product findings): problems observed in the product the client uses (ours or a third-party vendor's). Tracks only whether we've fed the problem back. |
| Routers exported | `project_findings_router()`, `findings_router()` |
| Project-scoped routes | `GET /projects/{project_id}/findings`, `POST /projects/{project_id}/findings` |
| Flat-by-id routes | `GET /findings/{id}`, `PUT /findings/{id}`, `DELETE /findings/{id}` |
| Calls `ensure_project_exists` | **Yes** — both nested handlers. |
| Non-trivial behaviour | `product_source` is **required** (`ours`/`third_party`, no default); `feedback_status` defaults `unreported`. `observed_at` defaults to `now()` when omitted. `list_by_project` orders by `CASE feedback_status` (unreported→reported), then `observed_at DESC`. Same `ensure_communication_in_project` guard on the optional `communication_id`. |
| Internal deps | `crate::db::helpers::{dt_to_offset, ensure_communication_in_project, ensure_project_exists}`, `crate::models::{CreateFinding, FeedbackStatus, Finding, ProductSource, UpdateFinding}`. |

### A.12 `search` — `backend/src/handlers/search.rs`

| Field | Value |
|---|---|
| Responsibility | Cross-resource keyword search (global, not project-scoped). |
| Router exported | `search_router()` |
| Routes | `GET /search?q=...` |
| Calls `ensure_project_exists` | **No** — reads across the whole DB. |
| Non-trivial behaviour | Runs `ILIKE %q%` against seven resources, `LIMIT 10` each: **projects** (`name`/`phase`/`competitors`), **clients** (`name`/`contact_person`), **communications** (`content`/`participants`, returns an 80-char preview), **tasks** (`title`), **issues** (`title`/`description`), **findings** (`title`/`description`/`product`/`vendor`), **people** (`name`/`role`). Returns `SearchHit { resource, id, title, subtitle, project_id }`. Per-resource query failures are swallowed (`.unwrap_or_default()`) so one bad hit doesn't blank the result. |
| Internal deps | `crate::state::AppState`, `sqlx`; serializes `SearchHit` (defined inline). |

### A.13 `auth` — `backend/src/handlers/auth.rs`

| Field | Value |
|---|---|
| Responsibility | Local-account authentication (setup/login/logout/me/password change) + the fail-closed `require_auth` route guard mounted over every business router + the `LoginThrottle` brute-force guard. |
| Router exported | `auth_router()` — **mounted on the unguarded `public_api`**, unlike every other handler module |
| Routes | `GET /auth/status`, `POST /auth/setup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/password` |
| Calls `ensure_project_exists` | **No** — not a project resource. |
| Non-trivial behaviour | `status` probes `users` empty → `{needs_setup}` (a not-yet-migrated table counts as empty). `setup` only works while users is empty (else `AppError::Conflict` → 409); password ≥ 8 chars; username normalized (trim + lowercase). `login` verifies argon2id and returns a deliberately generic 401 on bad creds (no user enumeration — unknown usernames still burn one argon2 verification against a dummy hash). **`LoginThrottle`**: 5 consecutive failures lock logins for 15 min → `429 rate_limited` (process-global, in `AppState`). Session ids are cycled at login/setup (`cycle_id()` — session-fixation defense) and after a password change. `POST /auth/password` requires the current password, then revokes every OTHER session of the user via the `user_sessions` index (migration 024; written by `require_auth`/`me` because tower-sessions hides the post-cycle id from handlers). Sessions are tower-sessions cookies holding only `user_id`; `SESSION_TTL_SECS = 30 days` sliding. `require_auth` resolves the session to a user_id, re-checks the user exists, and 401s otherwise — fail-closed. |
| Internal deps | `argon2` (hash/verify), `tower_sessions::Session`, `crate::models::user::{ChangePasswordRequest, SetupRequest, User, UserPublic}`, `crate::state::AppState`. |

### A.14 `backup` — `backend/src/handlers/backup.rs`
(import/export; flat-only, no row model of its own — manifest DTOs live here)

| Field | Value |
|---|---|
| Responsibility | Whole-workspace export/import: JSON data snapshot (`GET /api/export`), full ZIP backup incl. uploaded files (`GET /api/export/archive`), and their replace-all restores (`POST /api/import`, `POST /api/import/archive`). |
| Router exported | `backup_router()` — flat-only, mounted on `guarded_api` (authenticated). |
| Routes | `GET /export`, `GET /export/archive`, `POST /import`, `POST /import/archive` |
| Calls `ensure_project_exists` | **No** — not a project resource; operates on the whole workspace. |
| Non-trivial behaviour | Manifest = `{format: "project-manage-backup", version: 1, confirm_replace_all, exported_at, app_version, data{12 tables}}`; `validate_manifest` rejects wrong format/version/missing confirm with 400 (undecodable JSON gets axum's 422). Import is transactional replace-all: business tables wiped in FK-safe order then re-inserted with original IDs — auth tables (`users`/`session`/`user_sessions`) are never touched. Archive export adds one ZIP entry per `source_type = "file"` row that still exists on disk; archive import resets `./uploads` to exactly the archive contents and reports `files_written` / `files_missing[]` (entries are looked up by reconstructed name — no zip-slip path handling). |
| Internal deps | `zip` (8.x, deflate-only features), `serde_json`, all 12 row models (Serialize+Deserialize), `crate::state::AppState`. |

---

## B. Backend models (`backend/src/models/`)

One module per row struct + `Create`/`Update` DTO pair. All row structs derive `sqlx::FromRow`, `Serialize`, `Deserialize`. All DTOs are `Deserialize`-only.

### B.1 Row + DTO matrix

| Module (file) | Row struct | Create DTO | Update DTO | Extra types |
|---|---|---|---|---|
| `client.rs` | `Client` | `CreateClient` | `UpdateClient` | — |
| `project.rs` | `Project` | `CreateProject` | `UpdateProject` | **`ProjectStatus` const-module** (see B.2) |
| `communication.rs` | `Communication` | `CreateCommunication` | `UpdateCommunication` | `CommunicationWithProject` (joined view, `Serialize`-only) |
| `task.rs` | `Task` | `CreateTask` | `UpdateTask` | **`TaskStatus` const-module** (see B.3) |
| `issue.rs` | `Issue` | `CreateIssue` | `UpdateIssue` | **`IssueStatus` + `IssuePriority` const-modules** (see B.6) |
| `finding.rs` | `Finding` | `CreateFinding` | `UpdateFinding` | **`ProductSource` + `FeedbackStatus` const-modules** (see B.7) |
| `asset.rs` | `Asset` | `CreateAsset` | `UpdateAsset` | — |
| `project_file.rs` | `ProjectFile` | (no file-upload DTO; multipart) | `UpdateFile` | `FileMeta` (Serialize, hides `file_path` + `stored_name`), `FileWithProject` (joined view), `CreateLink` |
| `phase.rs` | `Phase` | `CreatePhase` | `UpdatePhase` | — |
| `person.rs` | `Person` | `CreatePerson` | `UpdatePerson` | **`PersonSide` const-module** (see B.4); `side: String` |
| `deliverable.rs` | `Deliverable` | `CreateDeliverable` | `UpdateDeliverable` | **`DeliverableStatus` const-module** (see B.5); `due_date: Option<NaiveDate>`, `linked_file_id: Option<Uuid>` |
| `user.rs` | `User` (**not serialized**, keeps `password_hash` private) | `SetupRequest` (also aliased `LoginRequest`), `ChangePasswordRequest` | — | `UserPublic` (safe projection, ts-rs exported) |

Common column pattern: `id: Uuid`, `created_at: DateTime<Utc>`, optional `updated_at: DateTime<Utc>` (maintained by DB trigger `set_updated_at()` from migration 001). `Create` DTOs omit id/timestamps; `Update` DTOs mark every field `Option` + `#[serde(default)]` for partial updates.

### B.2 `models::project::ProjectStatus` — enum-style status

| Field | Value |
|---|---|
| File | `backend/src/models/project.rs` (lines 19–32) |
| Purpose | Allowed values for `projects.status` (string constants + `is_valid`). |
| Constants | `IN_PROGRESS = "in_progress"`, `COMPLETED = "completed"`, `PAUSED = "paused"` |
| Aggregate | `pub const ALL: &[&str] = &[IN_PROGRESS, COMPLETED, PAUSED]` |
| Validator | `pub fn is_valid(input: &str) -> bool` via `matches!` |
| Used by | `handlers::projects::{create, update}` return `AppError::BadRequest` listing `ProjectStatus::ALL` on invalid input. |

### B.3 `models::task::TaskStatus` — enum-style status

| Field | Value |
|---|---|
| File | `backend/src/models/task.rs` (lines 15–28) |
| Purpose | Allowed values for `tasks.status` (string constants + `is_valid`). |
| Constants | `CURRENT = "current"`, `NEXT = "next"`, `TODO = "todo"` |
| Aggregate | `pub const ALL: &[&str] = &[CURRENT, NEXT, TODO]` |
| Validator | `pub fn is_valid(input: &str) -> bool` via `matches!` |
| Used by | `handlers::tasks::{create_for_project, update}` validate and default to `TODO`. `list_by_project` SQL uses the literal string in its `CASE` ordering expression. |

> **Note:** the literal `TaskStatus::TODO` constant is the status value `"todo"`, not a tech-debt marker.

### B.4 `models::person::PersonSide` — enum-style side

| Field | Value |
|---|---|
| File | `backend/src/models/person.rs` |
| Purpose | Allowed values for `people.side` — distinguishes our team from the client side in the unified people table. |
| Constants | `TEAM = "team"`, `CLIENT = "client"` |
| Aggregate | `pub const ALL: &[&str] = &[TEAM, CLIENT]` |
| Validator | `pub fn is_valid(input: &str) -> bool` via `matches!` |
| Used by | `handlers::people::{create_for_project, reorder}` validate `side`; `flip_side` flips between the two. |

### B.5 `models::deliverable::DeliverableStatus` — enum-style status

| Field | Value |
|---|---|
| File | `backend/src/models/deliverable.rs` |
| Purpose | Allowed values for `deliverables.status`. |
| Constants | `PENDING = "pending"`, `DELIVERED = "delivered"`, `ACCEPTED = "accepted"` |
| Aggregate | `pub const ALL: &[&str] = &[PENDING, DELIVERED, ACCEPTED]` |
| Validator | `pub fn is_valid(input: &str) -> bool` via `matches!` |
| Used by | `handlers::deliverables::{create_for_project, update}` validate and default to `PENDING`. |

### B.6 `models::issue::{IssueStatus, IssuePriority}` — enum-style status + priority

| Field | `IssueStatus` | `IssuePriority` |
|---|---|---|
| File | `backend/src/models/issue.rs` | same |
| Purpose | Allowed values for `issues.status`. | Allowed values for `issues.priority`. |
| Constants | `OPEN`, `IN_PROGRESS = "in_progress"`, `RESOLVED = "resolved"` | `URGENT`, `HIGH`, `NORMAL`, `LOW` |
| Aggregate | `["open", "in_progress", "resolved"]` | `["urgent", "high", "normal", "low"]` |
| Used by | `handlers::issues::{create_for_project, update}` validate + default `OPEN`; `list_by_project` `CASE` ordering uses the literals. | same handlers validate + default `NORMAL`; second `CASE` ordering key. |

### B.7 `models::finding::{ProductSource, FeedbackStatus}` — enum-style classifiers

| Field | `ProductSource` | `FeedbackStatus` |
|---|---|---|
| File | `backend/src/models/finding.rs` | same |
| Purpose | Where the observed product comes from. | Whether we've fed the problem back. |
| Constants | `OURS = "ours"`, `THIRD_PARTY = "third_party"` | `UNREPORTED = "unreported"`, `REPORTED = "reported"` |
| Used by | `handlers::findings` — **required on create** (no default, no DB default) | same handlers validate + default `UNREPORTED`; `CASE` ordering key in list. |

---

## C. Backend DB layer (`backend/src/db/`)

### C.1 `db::pool` — `backend/src/db/pool.rs`

| Field | Value |
|---|---|
| Responsibility | Build a `PgPool` from `DATABASE_URL` with conservative timeouts (internal tool; revisit behind a load balancer). |
| Export | `pub async fn build_pool() -> Result<PgPool, sqlx::Error>` (re-exported as `db::build_pool`) |
| Config | `PgPoolOptions::new().max_connections(10).acquire_timeout(5s).idle_timeout(10min).max_lifetime(30min)` |
| Caller | `main.rs` wraps this in `build_pool_with_retry` (1 + 5 retries, 1/2/4/8/16s backoff). |
| Internal deps | `sqlx::postgres::{PgPool, PgPoolOptions}`, `std::time::Duration`. |

### C.2 `db::helpers` — `backend/src/db/helpers.rs`

| Field | Value |
|---|---|
| Responsibility | Shared DB helpers + chrono↔time bind conversions. |
| Exports | `pub async fn ensure_project_exists(pool, project_id) -> AppResult<()>`; `pub async fn ensure_communication_in_project(pool, project_id, communication_id) -> AppResult<()>`; `pub fn dt_to_offset(chrono DateTime<Utc>) -> time::OffsetDateTime`; `pub fn date_to_time_date(chrono NaiveDate) -> time::Date` |
| Behaviour | `ensure_project_exists`: `SELECT id FROM projects WHERE id = $1` → 404 if no row. `ensure_communication_in_project`: the communication must exist AND belong to the project → 400 otherwise; used by issues/findings to guard the optional `communication_id` link. The two conversion fns exist because `tower-sessions-sqlx-store` force-enables sqlx's `time` feature, flipping macro *bind* inference while models stay chrono (output columns are handled by `AS "col: chrono::…"` annotations in the SQL). |
| Callers | `handlers::{communications, tasks, issues, findings, assets, files, phases, people, deliverables}` — every project-scoped path; the communication guard is called by `handlers::{issues, findings}`. |

---

## D. Frontend pages (`frontend/src/pages/`)

Each page is a `default export` React component, rendered by `App.tsx` `<Routes>`. All pages use `@tanstack/react-query` for data and Ant Design (`antd`) for UI; pages that need routing use `useNavigate` / `useParams` from `react-router-dom`.

### D.1 `ProjectBoard` — `frontend/src/pages/ProjectBoard.tsx`

| Field | Value |
|---|---|
| Route | `/` |
| Responsibility | Landing page: project list with create/edit/delete + debounced search; "进行中 N 个项目" footer stats feed `App.tsx` sidebar. |
| Public API (TS) | `export default function ProjectBoard(): JSX.Element` |
| State | `clientMode: 'existing' | 'new'` toggle on the create modal; `searchText` + `debouncedSearch` (300 ms). |
| Calls | `clientsApi.list`, `projectsApi.{list, create, update, delete}`, `communicationsApi.listRecent` (for global search hits). |
| Internal deps | `clientsApi`, `projectsApi`, `communicationsApi` from `../api`; types `Project`, `ProjectStatus`, `CommunicationWithProject` from `../types`; `dayjs`. |

### D.2 `ProjectDetail` — `frontend/src/pages/ProjectDetail.tsx`

| Field | Value |
|---|---|
| Route | `/projects/:id` |
| Responsibility | Heavy tabbed detail page for one project. Since the 2026-08-28 detail-IA rework the tab bar is **5 aggregated tabs**: 概览 (`OverviewTab`), 推进 (`GroupedTab` wrapping 阶段 `PhasesTab` / 任务 `TasksTab` / 交付物 `DeliverablesTab`), 客户 (`GroupedTab` wrapping 沟通记录 `CommunicationsTab` / 客户关切 `IssuesTab` / 产品发现 `FindingsTab`), 资料 (`GroupedTab` wrapping 文件 `FilesTab` / 资产 `AssetsTab`), 成员 (`MembersTab`). Also owns project-level edit and create/edit modals. |
| Public API (TS) | `export default function ProjectDetail(): JSX.Element` |
| State | Project edit form, modal-open flags, tab-label counts (components own their own data; React Query dedupes by key). |
| Calls | Owns 9 mount-time queries (`project`, `client` chained, `communications`, `tasks`, `assets`, `files`, `issues`, `findings`, `deliverables`) + `clientsApi.list` for the edit modal; mutations through the same `*Api` objects. |
| Internal deps | `OverviewTab`, `GroupedTab`, `PhasesTab`, `TasksTab`, `DeliverablesTab`, `CommunicationsTab`, `IssuesTab`, `FindingsTab`, `FilesTab`, `AssetsTab`, `MembersTab` from `../components`. |

### D.3 `FileLibrary` — `frontend/src/pages/FileLibrary.tsx`

| Field | Value |
|---|---|
| Route | `/files` |
| Responsibility | Global cross-project file browser + preview + download + delete. |
| Public API (TS) | `export default function FileLibrary(): JSX.Element` |
| State | `search` text; `previewFile: FileWithProject \| null`. |
| Calls | `filesApi.listAll`, `filesApi.download`, `filesApi.delete`. |
| Internal deps | `FilePreview` from `../components`; `formatSize` from `../utils/format`. |

### D.4 `CommunicationDetail` — `frontend/src/pages/CommunicationDetail.tsx`

| Field | Value |
|---|---|
| Route | `/projects/:id/communications/:commId` |
| Responsibility | Single-communication page: edit content/participants/conclusion, attach/link files, render content as markdown. |
| Public API (TS) | `export default function CommunicationDetail(): JSX.Element` |
| State | `editOpen`, `editForm`, `previewFile`. |
| Calls | `communicationsApi.{get, update}`, `filesApi.listByProject`, plus upload/link helpers. |
| Internal deps | `Markdown`, `ParticipantsInput`, `FilePreview` from `../components`; `formatSize` from `../utils/format`. |

### D.5 `LoginPage` — `frontend/src/pages/LoginPage.tsx`

| Field | Value |
|---|---|
| Route | `/login` (rendered standalone, no app shell) |
| Responsibility | Username + password form → `authApi.login`. On success it **seeds the `['auth-me']` query cache** with the login response (nobody refetches it on SPA navigation), shows 登录成功, and navigates to `/`. 401 → "用户名或密码错误" toast; `429 rate_limited` → "尝试次数过多，登录已被临时锁定" toast. |
| Internal deps | `authApi`; antd form components. |

### D.6 `SetupPage` — `frontend/src/pages/SetupPage.tsx`

| Field | Value |
|---|---|
| Route | `/setup` (rendered standalone, no app shell) |
| Responsibility | First-run bootstrap: create the initial account via `authApi.setup` (username / password ≥ 8 chars / display name). Only reachable in practice while the users table is empty — `App.tsx`'s bootstrap effect routes here when `authStatus.needs_setup`. |
| Internal deps | `authApi`; antd form components. |

---

## E. Frontend components (`frontend/src/components/`)

The detail-IA rework (2026-08-28) reorganized this folder around one
component per project-detail sub-tab plus two layout primitives. The
former `components/FileLibrary.tsx` and `components/CommunicationDetail.tsx`
were **removed** (their jobs moved into `FilesTab` / `CommunicationsTab`).

### E.1 `GroupedTab` — the aggregation primitive

| Field | Value |
|---|---|
| Responsibility | Renders a lightweight antd `Segmented` switcher over 2-4 sibling modules (e.g. 阶段 \| 任务 \| 交付物) inside one outer tab — deliberately avoids a second level of Tabs. The whole "推进 / 客户 / 资料" grouping of ProjectDetail is built on it. Optional per-item count renders as `label (n)`. |
| Public API (TS) | `export default function GroupedTab({ items }: { items: GroupedTabItem[] })` where `GroupedTabItem = { key, label, count?, content }` |
| Internal deps | antd `Segmented` only — purely presentational, no data fetching. |

### E.2 `OverviewTab` — 概览

| Field | Value |
|---|---|
| Responsibility | Project summary: status, client info, CRM fields, key metrics; embeds `TimelineTab` as the project timeline section. |
| Public API (TS) | `export default function OverviewTab({ projectId, project, client }: Props)` |
| Internal deps | `TimelineTab`; project/client data comes in via props (owned by `ProjectDetail`). |

### E.3 `PhasesTab` — 阶段

| Field | Value |
|---|---|
| Responsibility | Phase CRUD inside a project; builds a nested tree from `parent_id` links; surfaces files attached to a phase. |
| Public API (TS) | `export default function PhasesTab({ projectId, files, onFilePreview }: Props)` |
| Calls | `phasesApi.{listByProject, create, update, delete}`; files arrive via props. |
| Internal deps | `phasesApi`; types `Phase`, `ProjectFile`; local `buildTree`, `statusConfig` helpers. |

### E.4 `TasksTab` — 任务

| Field | Value |
|---|---|
| Responsibility | Task board (current / next / todo columns) with create / edit / delete / status change. |
| Public API (TS) | `export default function TasksTab({ projectId }: Props)` |
| Calls | `tasksApi.*`; owns its `['tasks', projectId]` query. |

### E.5 `DeliverablesTab` — 交付物

| Field | Value |
|---|---|
| Responsibility | Deliverable list with status lifecycle (`pending`/`delivered`/`accepted`), due dates, and optional file link. |
| Public API (TS) | `export default function DeliverablesTab({ projectId }: Props)` |
| Calls | `deliverablesApi.*`; owns its `['deliverables', projectId]` query. |

### E.6 `CommunicationsTab` — 沟通记录

| Field | Value |
|---|---|
| Responsibility | Project communication log; create form + clickable list rendered through `CommunicationList`; navigates to `CommunicationDetail`. |
| Public API (TS) | internal to ProjectDetail's 客户 group |
| Calls | `communicationsApi.{listByProject, create}` (data actually owned by ProjectDetail's query; React Query dedupes by key). |
| Internal deps | `CommunicationList`. |

### E.7 `IssuesTab` — 客户关切

| Field | Value |
|---|---|
| Responsibility | Issue CRUD (open / in_progress / resolved × urgent…low priority, due date, optional assignee + originating communication link). |
| Public API (TS) | `export default function IssuesTab({ projectId }: Props)` |
| Calls | `issuesApi.*`; also queries `['people', projectId]` (assignee select) and `['communications', projectId]` (link target select). |

### E.8 `FindingsTab` — 产品发现

| Field | Value |
|---|---|
| Responsibility | Finding CRUD (ours / third_party source, feedback_status unreported / reported, observed date, optional communication link). |
| Public API (TS) | `export default function FindingsTab({ projectId }: Props)` |
| Calls | `findingsApi.*`; also queries `['communications', projectId]` (link target select). |

### E.9 `FilesTab` — 文件

| Field | Value |
|---|---|
| Responsibility | Project file library: upload (multipart), link creation, description/tags edit, download, delete, comm/phase link, preview hook. Replaces the removed `components/FileLibrary.tsx`. |
| Public API (TS) | `export default function FilesTab({ projectId, onFilePreview }: Props)` |
| Calls | `filesApi.{listByProject, upload, createLink, update, delete, download}`; also queries `['communications', projectId]` and `['phases', projectId]` for link targets. |
| Internal deps | `FileIcon`, `FilePreview` (via callback), `formatSize`. |

### E.10 `AssetsTab` — 资产

| Field | Value |
|---|---|
| Responsibility | IT asset inventory CRUD with drag-and-drop reorder (`@dnd-kit`), type/value/vendor fields, keyword + type filters (drag-reorder disabled while filtering), plus per-asset credential management: the 凭据 column shows a read-only count and opens a `CredentialDrawer` (in-file component) that lists the asset's credentials — typed tags, per-field username/secret copy, eye-toggle reveal — with add/edit/delete via a nested form modal and a 拆分 assist that parses migrated multi-account blobs (blank-line chunks; 账号/密码 line recognition) into separate credential rows. Asset type suggestions cover the security-hardware domain (EDR/DLP/SOC/零信任/堡垒机/WAF/蜜罐/SIEM…); `asset_type` itself stays free TEXT. |
| Public API (TS) | `export default function AssetsTab({ projectId }: Props)` |
| Calls | `assetsApi.*` including `reorder`; `assetCredentialsApi.{listByAsset, create, update, delete}` (query key `['asset-credentials', assetId]`; mutations also invalidate `['assets', projectId]` to refresh `credential_count`). |

### E.11 `MembersTab` — 成员

| Field | Value |
|---|---|
| Responsibility | People UI for a project — team + client side-by-side (component kept its historical `MembersTab` name; the data model is the unified `people` table). Add / edit / delete people, drag-and-drop reorder within a side, flip a person team↔client. |
| Public API (TS) | `export default function MembersTab({ projectId }: Props)` |
| Calls | `peopleApi.{listByProject, create, update, delete, reorder, flipSide}`. |

### E.12 `TimelineTab` — 时间线

| Field | Value |
|---|---|
| Responsibility | Chronological project timeline (phases + communications merged view); embedded inside `OverviewTab` since the detail-IA rework. |
| Public API (TS) | `export default function TimelineTab({ projectId }: Props)` |
| Calls | `phasesApi.listByProject`, `communicationsApi.listByProject`. |

### E.13 `CommunicationList`

| Field | Value |
|---|---|
| Responsibility | Vertical clickable list of communications; each row shows date, participants (parsed), excerpt, attached-file count; click navigates to `CommunicationDetail`. |
| Public API (TS) | `export default function CommunicationList({ communications, projectId, files }: Props)` |
| Internal deps | `dayjs`; types `Communication`, `ProjectFile`. Local `parseParticipants` (handles `,` `，` `、` `;` `；`). |

### E.14 `FilePreview`

| Field | Value |
|---|---|
| Responsibility | Modal that previews any file by mime type: text→`<pre>` (with line numbers), markdown→rendered via `Markdown`, image→`<img>`, PDF→`<iframe>`, html→`<iframe srcdoc>`, xlsx/xls→per-sheet HTML tables (SheetJS `xlsx@0.20.3` from the official CDN build), docx→HTML (mammoth browser build), other→download prompt. |
| Public API (TS) | `export default function FilePreview({ file, open, onClose }: Props)` |
| Behaviour | Fetches `filesApi.previewUrl(file.id)` for text types via `fetch` + `AbortController`. Closes on `Escape`. Local helpers `isTextType`, `isHtmlType`, `isImageType`, `isPdfType`. |

### E.15 `FileIcon`

| Field | Value |
|---|---|
| Responsibility | Mime-type-aware file icon (used by `FilesTab` and the `FileLibrary` page). |
| Public API (TS) | `export default function FileIcon({ … }: Props)` |

### E.16 `Markdown`

| Field | Value |
|---|---|
| Responsibility | Thin wrapper around `react-markdown` + `remark-gfm` for GitHub-flavoured markdown rendering inside a `.md-render` container. Fenced ` ```mermaid ` blocks render as diagrams via the lazy-loaded `Mermaid` component (mermaid v11, strict security level, theme follows the app's light/dark mode; parse failures show the source with an error notice instead of a broken graph). |
| Public API (TS) | `export default function Markdown({ children }: Props)` |
| Internal deps | `react-markdown`, `remark-gfm`, `Mermaid` (lazy `import('mermaid')` — kept out of the main bundle). |

### E.16b `Mermaid`

| Field | Value |
|---|---|
| Responsibility | Renders a Mermaid diagram definition to SVG on demand. |
| Public API (TS) | `export default function Mermaid({ chart }: Props)` |
| Internal deps | `mermaid` v11 loaded via dynamic `import()` on first use (split chunk, not in the main bundle); render id is sanitized from `useId` + random suffix so the same chart can appear multiple times. |

### E.17 `ParticipantsInput`

| Field | Value |
|---|---|
| Responsibility | Tag-style AntD `Select` that accepts free-text names and joins them into a delimited string for `Communication.participants`. |
| Public API (TS) | `export default function ParticipantsInput({ value, onChange, placeholder }: Props)` |
| Behaviour | Splits on `,` `，` `、` `;` `；`. `Select` `open={false}` (acts like a token input, not a dropdown). |

### E.18 `ChangePasswordModal`

| Field | Value |
|---|---|
| Responsibility | 修改密码 modal (opened from the sidebar footer key icon): requires current password, new ≥ 8 chars + confirm-field match, calls `authApi.changePassword` (`POST /api/auth/password`). Success toast notes that other devices are logged out (server revokes the user's other sessions). Backend 400 messages (wrong current password / too short) surface directly. |
| Public API (TS) | `export default function ChangePasswordModal({ open, onClose }: Props)` |
| Internal deps | `authApi`; antd `Modal`/`Form`. |

### E.19 `BackupPage` — 备份与恢复

| Field | Value |
|---|---|
| Responsibility | Export/import console at `/backup` (third sidebar item). Export card: plain links to `/api/export` (JSON snapshot) and `/api/export/archive` (full ZIP) — session-cookie downloads. Import card: `Upload.Dragger` accepting `.json`/`.zip`; `customRequest` intercepts the file and opens a destructive-action `modal.confirm` (替换全部数据) before calling `backupApi.importJson` / `importArchive`; shows the returned `ImportReport` (per-table counts + files restored/missing). Notes that manifests contain credential secrets in plain text. |
| Public API (TS) | `export default function BackupPage()` |
| Internal deps | `backupApi`; antd `Upload`/`Card`/`modal.confirm`. |

---

## F. Frontend shared (`frontend/src/`)

### F.1 `api/index.ts`

| Field | Value |
|---|---|
| Responsibility | Single axios instance (`baseURL: '/api'`, `timeout: 30000`) + one API object per resource + error classifier + 401 interceptor. |
| Exports (16 API objects + helpers) | `clientsApi`, `projectsApi`, `communicationsApi`, `tasksApi`, `issuesApi`, `findingsApi`, `assetsApi` (incl. `reorder`), `assetCredentialsApi`, `filesApi`, `phasesApi`, `peopleApi` (incl. `reorder` + `flipSide`), `deliverablesApi`, `backupApi` (export URLs + `importJson`/`importArchive`), `searchApi`, `healthApi`, `authApi` (status/setup/login/logout/me/changePassword) |
| Extra exports | `ApiErrorKind` type (`'offline' \| 'server' \| 'validation' \| 'conflict' \| 'unknown'`), `ApiErrorInfo` interface, `classifyApiError(err: unknown): ApiErrorInfo`, `AuthStatus` + `SearchHit` interfaces |
| Behaviour | `classifyApiError`: no `response` → `offline`; 5xx → `server`; 400/422 → `validation`; 409 → `conflict`; else `unknown`. **401 interceptor**: any non-`/auth/*` 401 redirects `window.location.href = '/login'` (guarded against self-reload loops — only navigates when actually elsewhere). |
| Internal deps | `axios`; every `*Api` consumes a typed interface from `../types` (row types hand-written in `types/index.ts`, DTOs codegen'd by ts-rs into `types/generated/`). |

### F.2 `types/index.ts`

| Field | Value |
|---|---|
| Responsibility | TS mirrors of backend row structs + Create/Update DTOs; aliases `UUID`, `ISODateTime`, `ISODate`. |
| Public API (TS) | Interfaces: `Client`, `Project`, `ProjectStatus`, `Communication`, `CommunicationWithProject`, `Task`, `TaskStatus`, `Issue` (+ `IssueStatus` / `IssuePriority` unions), `Finding` (+ `ProductSource` / `FeedbackStatus` unions), `Asset`, `AssetCredential` (+ `CredentialType` union), `ProjectFile`, `FileWithProject`, `Phase`, `Person` (+ `PersonSide`), `Deliverable` (+ `DeliverableStatus`), `UserPublic` + matching `Create*`/`Update*` interfaces + `SearchHit` + `ApiError`. (Backend DTOs are codegen'd into `types/generated/` by ts-rs at test time — 40 files, incl. `Issue`, `Finding`, `UserPublic`, `SetupRequest`, `AssetCredential`.) |
| Notable | `ProjectStatus = 'in_progress' \| 'completed' \| 'paused'` (TS union mirrors `ProjectStatus` const-module on backend). `TaskStatus = 'current' \| 'next' \| 'todo'`. `ProjectFile.source_type: 'file' \| 'link'`. |
| Internal deps | None. |

### F.3 `theme.ts`

| Field | Value |
|---|---|
| Responsibility | Ant Design `ThemeConfig` tokens for light + dark mode. |
| Public API (TS) | `export const lightTheme: ThemeConfig`, `export const darkTheme: ThemeConfig` |
| Tokens | Shared brand color `#148374` (light) / `#2db89e` (dark); `borderRadius: 8`; `fontFamily: 'Inter', system-ui, …`; per-component overrides for `Layout`, `Menu`, `Button`, `Card`, `Table`, `Tag`, `Input`, `Select`, `Modal`, `Tabs`. |
| Internal deps | `antd` `theme` algorithm + `ThemeConfig` type. |

### F.4 `utils/format.ts`

| Field | Value |
|---|---|
| Responsibility | Tiny formatting helper(s) shared across pages. |
| Public API (TS) | `export function formatSize(bytes: number): string` — produces `B` / `KB` / `MB`. |
| Internal deps | None. |

### F.5 `App.tsx`

| Field | Value |
|---|---|
| Responsibility | Top-level shell: auth bootstrap gate (`auth-status` → `/setup`, `/me` 401 → `/login`, spinner until resolved) + persistent sidebar (logo + global search + nav + project-count footer + logout + theme toggle) + `<Routes>` wrapped in `ErrorBoundary`. |
| Public API (TS) | `export default function App(): JSX.Element` (plus internal `SidebarItem` and `ErrorBoundary` classes — not exported) |
| State | `isDark` (localStorage-persisted, falls back to `prefers-color-scheme`); sidebar global search (debounced 300 ms via `searchApi`); `useQuery(['projects'], projectsApi.list)` for footer stats — **enabled only after login** (`!!me`) so the sidebar never fires a 401 on `/login`/`/setup`. |
| Routes | `/` → `ProjectBoard`; `/files` → `FileLibrary`; `/projects/:id` → `ProjectDetail`; `/projects/:id/communications/:commId` → `CommunicationDetail`; `/login` → `LoginPage`; `/setup` → `SetupPage` (last two render standalone, no app shell). |
| ErrorBoundary | Class component; on failure shows a "页面出错了" + reload button; logs to `console.error`. |
| Internal deps | `lightTheme`, `darkTheme` from `./theme`; `projectsApi` from `./api`; pages from `./pages/*`. |

### F.6 `main.tsx`

| Field | Value |
|---|---|
| Responsibility | Root render: wires `StrictMode` → `AntApp` → `QueryClientProvider` → `BrowserRouter` → `App`. |
| Public API (TS) | Side-effect-only entry; no exports. |
| QueryClient config | `retry: (count, error) => false if count≥3 or status 4xx`; `retryDelay: min(1000·2^n, 10000)`; `refetchOnWindowFocus: false`; `staleTime: 30_000`. |
| Internal deps | `react-dom/client`, `antd` `App`, `@tanstack/react-query`, `react-router-dom`, `dayjs/locale/zh-cn`, `./index.css`, `./App.tsx`. |

---

## Cross-reference: who calls what

| Backend handler | Models used | Calls `ensure_project_exists` | Side effects outside DB |
|---|---|---|---|
| clients | Client, CreateClient, UpdateClient | no | — |
| projects | Project, CreateProject, UpdateProject, ProjectStatus | no | `tokio::fs::remove_dir_all("./uploads/{id}")` on delete |
| communications | Communication, CommunicationWithProject, Create*U, Update*U | **yes** (nested) | — |
| tasks | Task, CreateTask, UpdateTask, TaskStatus | **yes** (nested) | — |
| issues | Issue, CreateIssue, UpdateIssue, IssueStatus, IssuePriority | **yes** (nested; + `ensure_communication_in_project`) | — |
| findings | Finding, CreateFinding, UpdateFinding, ProductSource, FeedbackStatus | **yes** (nested; + `ensure_communication_in_project`) | — |
| assets | Asset, CreateAsset, UpdateAsset | **yes** (nested) | read-only `credential_count` subquery on every row |
| asset_credentials | AssetCredential, CreateAssetCredential, UpdateAssetCredential, CredentialType | **yes** (nested under asset; + `ensure_asset_in_project`) | cascade-deleted with the parent asset |
| files | ProjectFile, FileMeta, FileWithProject, CreateLink, UpdateFile | **yes** (nested) | **writes to `./uploads/{project_id}/{uuid}{ext}` on upload; removes file on delete; removes dir on parent project delete (via projects::remove)** |
| phases | Phase, CreatePhase, UpdatePhase | **yes** (nested) | — |
| people | Person, CreatePerson, UpdatePerson, PersonSide | **yes** (nested) | — |
| deliverables | Deliverable, CreateDeliverable, UpdateDeliverable, DeliverableStatus | **yes** (nested) | — |
| search | (none — inline `SearchHit`) | no | — |
| auth | User, UserPublic, SetupRequest | no | argon2id hash/verify; tower-sessions writes |
| backup | (none — manifest structs `BackupManifest`/`BackupData`/`ImportReport` stay in the handler module) | no | zip 8.x archive write/read; transactional replace-all import |
