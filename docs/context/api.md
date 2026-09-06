# project-manage — API Reference

Complete HTTP surface mounted under `/api` in `backend/src/app.rs::build_app`
(wired from `main.rs`).
Every endpoint below has been verified against `backend/src/handlers/*.rs`
and the DTOs in `backend/src/models/*.rs`. Response shapes match the
return types of each handler (`T`, `Vec<T>`, `(StatusCode, Json<T>)`,
or `StatusCode`). Defaults come from `backend/src/main.rs` — the
`REQUEST_TIMEOUT_SECS` const (30 s) and the `MAX_BODY_SIZE_MB` env read
(default 100).

---

## 1. Conventions

| Aspect | Rule | Source |
|---|---|---|
| URL prefix | All routes under `/api` | `app.rs::build_app` (22 `.nest("/api", …)` calls) |
| Authentication | Session cookie required everywhere except the public whitelist (health + `/auth/{status,setup,login}`); missing/invalid session → `401 unauthorized` | `require_auth` middleware in `app.rs` / `handlers/auth.rs` |
| List endpoint | `200 OK` + JSON array | every `list*` handler |
| Single read | `200 OK` + JSON object | every `get_one` handler |
| Create | `201 Created` + JSON object | every `create*` handler returns `(StatusCode::CREATED, Json(row))` |
| Update | `200 OK` + JSON object | every `update` handler |
| Delete | `204 No Content` (empty body) | every `remove` handler returns `StatusCode::NO_CONTENT` |
| Error body | `{ "error": "<code>", "message": "<text>" }` | `error.rs:90-94` (`ErrorBody`) |
| 5xx detail | Generic message to client; full error logged via `tracing::error!` | `error.rs:101-103` |
| IDs | `Uuid` v4 (path param `:id` / `:project_id` for nested) | `models/*.rs` |
| Timestamps | RFC 3339 UTC (`"2025-07-14T03:11:09.123456Z"`) | `chrono::{DateTime, Utc}` |
| Request timeout | 30 s server-wide → `408 request_timeout` | `main.rs` (`REQUEST_TIMEOUT_SECS`); enforced via `TimeoutLayer` in `app.rs` |
| Body size cap | `MAX_BODY_SIZE_MB × 1024²` (default 100 MiB) | read in `main.rs`; enforced via `DefaultBodyLimit` in `app.rs` |

---

## 2. Endpoint Catalog

### 2.1 `GET /api/health` (operational, **public**)

| Method | Path | Purpose | Query | Body | Response |
|---|---|---|---|---|---|
| GET | `/api/health` | Liveness probe; returns package version | — | — | `200` + `{ "status": "ok", "version": "<CARGO_PKG_VERSION>" }` |

Implemented in `app.rs` (`health()` + `HealthResponse`).

### 2.2 Auth (`backend/src/handlers/auth.rs`) — first three **public**

| Method | Path | Purpose | Body | Response |
|---|---|---|---|---|
| GET  | `/api/auth/status` | Bootstrap probe: is the users table empty? | — | `200` + `{ "needs_setup": bool }` |
| POST | `/api/auth/setup`  | Create the initial account — **only while users is empty** (else `409 conflict`) | `SetupRequest` (§3.12) | `201` + `UserPublic` |
| POST | `/api/auth/login`  | Verify credentials (argon2id), start a session | `{ username, password }` | `200` + `UserPublic` |
| POST | `/api/auth/logout` | Destroy the server-side session (authenticated) | — | `204` |
| GET  | `/api/auth/me`     | Current user projection (authenticated) | — | `200` + `UserPublic` |
| POST | `/api/auth/password` | Change the caller's password; requires the current one and **revokes every other session of the user** | `{ current_password, new_password }` | `204` |

Behaviour: usernames are normalized (trim + lowercase); passwords must be
≥ 8 chars at setup and on change; login failure is a deliberately generic
`401 unauthorized` ("invalid username or password") — no user
enumeration, and unknown usernames still run one argon2 verification
against a dummy hash so response timing reveals nothing. `UserPublic`
never contains password material. The session
cookie (HttpOnly, SameSite=Lax, 30-day sliding) is issued by setup and
login; the session id is cycled at login/setup and after a password
change (session-fixation defense); see `architecture.md §5.7` for the
guard mechanics.

**Login throttle:** 5 consecutive failed logins (process-global counter —
adequate for a single account) lock logins for 15 minutes; attempts while
locked — including correct credentials — get
`429 rate_limited`. The counter resets on success and clears on restart.
`logout`/`me`/`password` sit on the public auth router but self-guard
(401 without a valid session). Session ownership is indexed in
`user_sessions` (migration 024), written by `require_auth`/`me` on
authenticated use — that index is what makes per-user revocation precise.

### 2.3 Clients (`backend/src/handlers/clients.rs`)

| Method | Path | Purpose | Path params | Body | Response |
|---|---|---|---|---|---|
| GET    | `/api/clients`       | List all clients, newest first           | —       | — | `200` + `Client[]` |
| POST   | `/api/clients`       | Create client                            | —       | `CreateClient` (see §3.1) | `201` + `Client` |
| GET    | `/api/clients/{id}`  | Read one client                          | `id`    | — | `200` + `Client` |
| PUT    | `/api/clients/{id}`  | Partial update (every field optional)   | `id`    | `UpdateClient` | `200` + `Client` |
| DELETE | `/api/clients/{id}`  | Remove client (blocked if projects FK)   | `id`    | — | `204` |

Server-side validation: `name.trim().is_empty()` → `400 bad_request`
("name must not be empty"). `DELETE` on a client with existing projects
triggers FK cascade → `400 invalid_reference`.

### 2.4 Projects (`backend/src/handlers/projects.rs`)

| Method | Path | Purpose | Path params | Body | Response |
|---|---|---|---|---|---|
| GET    | `/api/projects`      | List all projects, newest first          | —    | — | `200` + `Project[]` |
| POST   | `/api/projects`      | Create project (orphan impossible — `client_id` required) | — | `CreateProject` | `201` + `Project` |
| GET    | `/api/projects/{id}` | Read one project                         | `id` | — | `200` + `Project` |
| PUT    | `/api/projects/{id}` | Partial update                           | `id` | `UpdateProject` | `200` + `Project` |
| DELETE | `/api/projects/{id}` | Remove project + best-effort `./uploads/{id}/` cleanup (cascades to comms/tasks/etc.) | `id` | — | `204` |

Validation: `name` non-empty (else `400`); `status` must be one of
`ProjectStatus::ALL = ["in_progress", "completed", "paused"]` (else
`400 bad_request`). Defaults `status` → `in_progress` on create.

### 2.5 Communications (`backend/src/handlers/communications.rs`)

| Method | Path | Purpose | Path / Query | Body | Response |
|---|---|---|---|---|---|
| GET    | `/api/projects/{project_id}/communications` | List for a project, `ORDER BY occurred_at DESC` | `project_id` | — | `200` + `Communication[]` |
| POST   | `/api/projects/{project_id}/communications` | Create for a project | `project_id` | `CreateCommunication` | `201` + `Communication` |
| GET    | `/api/communications/{id}` | Read one record | `id` | — | `200` + `Communication` |
| PUT    | `/api/communications/{id}` | Partial update | `id` | `UpdateCommunication` | `200` + `Communication` |
| DELETE | `/api/communications/{id}` | Remove | `id` | — | `204` |
| GET    | `/api/communications/recent?limit=N` | Recent N across all projects (joined with `projects.name`) | — / `limit` (clamped 1..=50, default 10) | — | `200` + `CommunicationWithProject[]` |
| GET    | `/api/communications/search?q=…&limit=N` | Case-insensitive ILIKE search on `content`, `conclusion`, `participants` | — / `q` (required), `limit` (clamped 1..=100, default 20) | — | `200` + `CommunicationWithProject[]` |

`POST` validation: `content.trim().is_empty()` → `400 bad_request`. Every
nested write-side handler calls `ensure_project_exists(pool, project_id)`
first (`db/helpers.rs`) — missing project → `404 not_found`.

### 2.6 Tasks (`backend/src/handlers/tasks.rs`)

| Method | Path | Purpose | Path params | Body | Response |
|---|---|---|---|---|---|
| GET    | `/api/projects/{project_id}/tasks` | List tasks ordered by status priority (`current < next < todo`), then `planned_date NULLS LAST`, then `created_at` | `project_id` | — | `200` + `Task[]` |
| POST   | `/api/projects/{project_id}/tasks` | Create task under project (default status `todo`) | `project_id` | `CreateTask` | `201` + `Task` |
| GET    | `/api/tasks/{id}` | Read one task | `id` | — | `200` + `Task` |
| PUT    | `/api/tasks/{id}` | Partial update | `id` | `UpdateTask` | `200` + `Task` |
| DELETE | `/api/tasks/{id}` | Remove | `id` | — | `204` |

Validation: `title` non-empty; `status ∈ TaskStatus::ALL =
["current", "next", "todo"]` (else `400`).

### 2.7 Assets (`backend/src/handlers/assets.rs`)

| Method | Path | Purpose | Path params | Body | Response |
|---|---|---|---|---|---|
| GET    | `/api/projects/{project_id}/assets` | List for a project, `ORDER BY sort_order ASC, created_at ASC` | `project_id` | — | `200` + `Asset[]` |
| POST   | `/api/projects/{project_id}/assets` | Create asset (default `asset_type = "other"`) | `project_id` | `CreateAsset` | `201` + `Asset` |
| PUT    | `/api/projects/{project_id}/assets/reorder` | Rewrite the project's asset `sort_order` to the given order | `project_id` | `{ asset_ids: Uuid[] }` | `204` |
| GET    | `/api/assets/{id}` | Read one asset | `id` | — | `200` + `Asset` |
| PUT    | `/api/assets/{id}` | Partial update | `id` | `UpdateAsset` | `200` + `Asset` |
| DELETE | `/api/assets/{id}` | Remove (cascades to its credentials) | `id` | — | `204` |

`asset_type` is free-form TEXT (no enum). Validation: `name` non-empty.
Every `Asset` row carries a read-only `credential_count` (correlated
subquery at query time — not a physical column; migration 023).

**Asset credentials** (`backend/src/handlers/asset_credentials.rs`) —
one asset holds several credentials (SSH / admin console / API key…),
each its own row. Secrets are stored as plain TEXT; masking is a
frontend display concern only.

| Method | Path | Purpose | Path params | Body | Response |
|---|---|---|---|---|---|
| GET    | `/api/projects/{project_id}/assets/{asset_id}/credentials` | List the asset's credentials, `ORDER BY sort_order ASC, created_at ASC` | `project_id`, `asset_id` | — | `200` + `AssetCredential[]` |
| POST   | `/api/projects/{project_id}/assets/{asset_id}/credentials` | Create a credential (appends `sort_order`) | `project_id`, `asset_id` | `CreateAssetCredential` | `201` + `AssetCredential` |
| PUT    | `/api/asset-credentials/{id}` | Partial update (COALESCE — `None` keeps old value) | `id` | `UpdateAssetCredential` | `200` + `AssetCredential` |
| DELETE | `/api/asset-credentials/{id}` | Remove | `id` | — | `204` |

Validation: `label` non-empty; `cred_type ∈ CredentialType::ALL =
["password", "api_key", "certificate", "token", "other"]` (else `400`).
Guards: `ensure_project_exists`, then `ensure_asset_in_project`
(`404` when the asset is missing or belongs to another project).

### 2.8 Files / Links (`backend/src/handlers/files.rs`)

| Method | Path | Purpose | Path / Query | Body | Response |
|---|---|---|---|---|---|
| GET    | `/api/files`                              | Library view: list every file/link across projects with `project_name` | — | — | `200` + `FileWithProject[]` |
| GET    | `/api/projects/{project_id}/files`        | List files/links for a project (`source_type` ∈ `"file"`, `"link"`) | `project_id` | — | `200` + `FileMeta[]` |
| POST   | `/api/projects/{project_id}/files`        | Multipart upload (see §5)              | `project_id` | `multipart/form-data` | `201` + `FileMeta` |
| POST   | `/api/projects/{project_id}/links`        | Create link-only entry (see §6)        | `project_id` | `CreateLink` | `201` + `FileMeta` |
| GET    | `/api/files/{id}`                         | Read file/link metadata                | `id` | — | `200` + `FileMeta` |
| GET    | `/api/files/{id}/download`                | Stream bytes as `attachment; filename="…"` | `id` | — | `200` + binary, `Content-Disposition: attachment` |
| GET    | `/api/files/{id}/preview`                 | Stream bytes as `inline; filename="…"` (preview pane) | `id` | — | `200` + binary, `Content-Disposition: inline` |
| PUT    | `/api/files/{id}`                         | Update description/tags only           | `id` | `UpdateFile` | `200` + `FileMeta` |
| DELETE | `/api/files/{id}`                         | Delete DB row + best-effort file removal from disk | `id` | — | `204` |
| PUT    | `/api/files/{id}/link`                    | Bind/unbind to a communication (`POST`-style body `{ communication_id: uuid|null }`) | `id` | `{ communication_id: Uuid|null }` | `200` + `FileMeta` |
| PUT    | `/api/files/{id}/link-phase`              | Bind/unbind to a phase (`{ phase_id: uuid|null }`) | `id` | `{ phase_id: Uuid|null }` | `200` + `FileMeta` |

`LinkFile` / `LinkPhase` types are request-only DTOs declared inside
`handlers/files.rs:298-328`. Passing `null` clears the association.

### 2.9 Phases (`backend/src/handlers/phases.rs`)

| Method | Path | Purpose | Path params | Body | Response |
|---|---|---|---|---|---|
| GET    | `/api/projects/{project_id}/phases` | List, `ORDER BY sort_order, created_at`. Supports tree shape via `parent_id` self-reference | `project_id` | — | `200` + `Phase[]` |
| POST   | `/api/projects/{project_id}/phases` | Create phase; `parent_id` makes it a sub-phase; default `sort_order=0`, `status="pending"` | `project_id` | `CreatePhase` | `201` + `Phase` |
| GET    | `/api/phases/{id}` | Read one phase | `id` | — | `200` + `Phase` |
| PUT    | `/api/phases/{id}` | Partial update (incl. `parent_id` re-parenting) | `id` | `UpdatePhase` | `200` + `Phase` |
| DELETE | `/api/phases/{id}` | Remove; DB cascade deletes descendants | `id` | — | `204` |

Nesting: `parent_id NULL` = top-level; `parent_id = <other phase.id>`
= sub-phase. Validated: `name` non-empty. No sort-order collision check
in MVP — `sort_order` is whatever you pass (default `0`).

### 2.10 People (`backend/src/handlers/people.rs`)

Unified roster of everyone associated with a project — both our team and the
client side, distinguished by `side` (`team` | `client`). Replaces the former
`members` + `contacts` resources (migration 014).

| Method | Path | Purpose | Path params | Body | Response |
|---|---|---|---|---|---|
| GET    | `/api/projects/{project_id}/people` | List people for a project, `ORDER BY side, sort_order, created_at` | `project_id` | — | `200` + `Person[]` |
| POST   | `/api/projects/{project_id}/people` | Create person (appends to end of its side) | `project_id` | `CreatePerson` (§3.9) | `201` + `Person` |
| PUT    | `/api/projects/{project_id}/people/reorder` | Rewrite one side's `sort_order` to the given order | `project_id` | `{ side: "team"|"client", ids: Uuid[] }` | `204` |
| GET    | `/api/people/{id}` | Read one | `id` | — | `200` + `Person` |
| PUT    | `/api/people/{id}` | Partial update | `id` | `UpdatePerson` (§3.9) | `200` + `Person` |
| DELETE | `/api/people/{id}` | Remove | `id` | — | `204` |
| POST   | `/api/people/{id}/flip-side` | Move team ↔ client (role unchanged; `sort_order` resets) | `id` | — | `200` + `Person` |

Validation: `name` non-empty; `side` must be one of `PersonSide::ALL =
["team", "client"]` (else `400`). `role`/`notes` are free-form text.

### 2.11 Deliverables (`backend/src/handlers/deliverables.rs`)

Structured交付物 tracking with a status lifecycle and an optional link to a
project file.

| Method | Path | Purpose | Path params | Body | Response |
|---|---|---|---|---|---|
| GET    | `/api/projects/{project_id}/deliverables` | List for a project, `ORDER BY sort_order, created_at` | `project_id` | — | `200` + `Deliverable[]` |
| POST   | `/api/projects/{project_id}/deliverables` | Create deliverable (appends to end) | `project_id` | `CreateDeliverable` (§3.10) | `201` + `Deliverable` |
| GET    | `/api/deliverables/{id}` | Read one | `id` | — | `200` + `Deliverable` |
| PUT    | `/api/deliverables/{id}` | Partial update | `id` | `UpdateDeliverable` (§3.10) | `200` + `Deliverable` |
| DELETE | `/api/deliverables/{id}` | Remove | `id` | — | `204` |

Validation: `name` non-empty; `status` must be one of
`DeliverableStatus::ALL = ["pending", "delivered", "accepted"]` (default
`pending`). `due_date` is `YYYY-MM-DD`; `linked_file_id` optionally ties to a
`project_files` row (SET NULL if that file is deleted).

### 2.12 Issues (`backend/src/handlers/issues.rs`)

客户关切 — concerns the client raised during communication, tracked to
resolution.

| Method | Path | Purpose | Path params | Body | Response |
|---|---|---|---|---|---|
| GET    | `/api/projects/{project_id}/issues` | List for a project, ordered by status (`open`→`in_progress`→`resolved`), then priority (`urgent`→…→`low`), then `due_date NULLS LAST`, then `created_at` | `project_id` | — | `200` + `Issue[]` |
| POST   | `/api/projects/{project_id}/issues` | Create issue (defaults `status='open'`, `priority='normal'`) | `project_id` | `CreateIssue` (§3.13) | `201` + `Issue` |
| GET    | `/api/issues/{id}` | Read one | `id` | — | `200` + `Issue` |
| PUT    | `/api/issues/{id}` | Partial update | `id` | `UpdateIssue` (§3.13) | `200` + `Issue` |
| DELETE | `/api/issues/{id}` | Remove | `id` | — | `204` |

Validation: `title` non-empty; `status ∈ ["open", "in_progress",
"resolved"]` (`IssueStatus`); `priority ∈ ["urgent", "high", "normal",
"low"]` (`IssuePriority`). If `communication_id` is supplied (create or
update), `ensure_communication_in_project` verifies it belongs to the same
project (else `400 bad_request`). `assignee_id` optionally references
`people` (SET NULL on delete).

### 2.13 Findings (`backend/src/handlers/findings.rs`)

产品发现 — problems we observed in the product the client uses (ours or a
third-party vendor's). Light tracking: only whether we've fed it back.

| Method | Path | Purpose | Path params | Body | Response |
|---|---|---|---|---|---|
| GET    | `/api/projects/{project_id}/findings` | List for a project, ordered by `feedback_status` (`unreported`→`reported`), then `observed_at DESC` | `project_id` | — | `200` + `Finding[]` |
| POST   | `/api/projects/{project_id}/findings` | Create finding (defaults `feedback_status='unreported'`, `observed_at=now`) | `project_id` | `CreateFinding` (§3.14) | `201` + `Finding` |
| GET    | `/api/findings/{id}` | Read one | `id` | — | `200` + `Finding` |
| PUT    | `/api/findings/{id}` | Partial update | `id` | `UpdateFinding` (§3.14) | `200` + `Finding` |
| DELETE | `/api/findings/{id}` | Remove | `id` | — | `204` |

Validation: `title` non-empty; `product_source ∈ ["ours", "third_party"]`
(`ProductSource`, **required**, no DB default); `feedback_status ∈
["unreported", "reported"]` (`FeedbackStatus`). Same
`ensure_communication_in_project` guard on `communication_id`.

### 2.14 Search (`backend/src/handlers/search.rs`)

| Method | Path | Purpose | Query | Body | Response |
|---|---|---|---|---|---|
| GET | `/api/search?q=…` | Cross-resource keyword search (`ILIKE %q%`, `LIMIT 10` per resource) | `q` (required) | — | `200` + `SearchHit[]` |

Searches **projects** (`name`/`phase`/`competitors`), **clients**
(`name`/`contact_person`), **communications** (`content`/`participants`, 80-char
preview), **tasks** (`title`), **issues** (`title`/`description`),
**findings** (`title`/`description`/`product`/`vendor`), **people**
(`name`/`role`), **assets** (`name`/`value`/`description`/`asset_type` —
credential secrets are deliberately NOT searchable), **deliverables**
(`name`), and **files/links** (`original_name`/`description`). Each hit is
`{ resource, id, title, subtitle?, project_id? }`. Not project-scoped — no
`ensure_project_exists`; per-resource query failures are swallowed so one bad
hit doesn't blank the result.

### 2.15 Backup / import-export (`backend/src/handlers/backup.rs`)

All four endpoints are authenticated (mounted on `guarded_api`).

| Method | Path | Purpose | Body | Response |
|---|---|---|---|---|
| GET  | `/api/export` | JSON snapshot of every business table (12 resources, original IDs preserved), `Content-Disposition: attachment` | — | `200` + `application/json` download |
| GET  | `/api/export/archive` | ZIP backup: `manifest.json` + every uploaded file under `uploads/{project_id}/{stored_name}` | — | `200` + `application/zip` download |
| POST | `/api/import` | **Replace-all** restore from a JSON snapshot — transactional (wipe in FK-safe order, re-insert; any failure rolls back) | `BackupManifest` | `200` + `ImportReport` (per-table row counts) |
| POST | `/api/import/archive` | Replace-all restore from a ZIP archive (multipart field `file`); after the DB commit, `./uploads` is reset to exactly the archive's contents | `multipart/form-data` | `200` + `ImportReport` (adds `files_written`, `files_missing[]`) |

Manifest schema: `{ format: "project-manage-backup", version: 1,
confirm_replace_all: true, exported_at, app_version, data: { clients,
projects, phases, people, communications, tasks, issues, findings, assets,
asset_credentials, project_files, deliverables } }`. The importer rejects
wrong `format` / `version` / missing `confirm_replace_all` with `400`
(bodies that cannot deserialize at all get axum's `422`). The auth domain
(`users`/`session`/`user_sessions`) is never exported or wiped. Manifests
contain asset-credential secrets in plain text — treat backup files as
sensitive. JSON restore preserves IDs, so existing `./uploads` files stay
matched; full fidelity (file bytes) requires the archive pair. Archive
restores that reference a file missing from the ZIP still succeed, with
the row listed in `files_missing`.

---

## 3. Request Body Schemas (DTOs)

All `Create*` DTOs live in `backend/src/models/<resource>.rs` next to
their row structs. All `Update*` DTOs make every field `Option<T>` with
`#[serde(default)]` so partial updates work without an explicit `null`.

### 3.1 `CreateClient` / `UpdateClient`

| Field | Type | Create | Update | Notes |
|---|---|:---:|:---:|---|
| `name` | `String` | ✅ required | optional | Must be non-empty after `trim()` else `400` |
| `contact_person` | `Option<String>` | optional | optional | |
| `contact_info` | `Option<String>` | optional | optional | |
| `notes` | `Option<String>` | optional | optional | |
| `products` | `Vec<String>` | optional (default `[]`) | optional (full replace) | Postgres `TEXT[]` |
| `background_info` | `Option<String>` | optional | optional | |

### 3.2 `CreateProject` / `UpdateProject`

| Field | Type | Create | Update | Notes |
|---|---|:---:|:---:|---|
| `client_id` | `Uuid` | ✅ **required** | optional | DB enforces `NOT NULL REFERENCES clients`. Required on create so an orphan project can never exist by construction. |
| `name` | `String` | ✅ required | optional | Non-empty after `trim()` else `400` |
| `status` | `Option<String>` | optional (default `"in_progress"`) | optional | Must be one of `ProjectStatus::ALL = ["in_progress", "completed", "paused"]` |
| `phase` | `Option<String>` | optional | optional | Free-form label (e.g. "需求分析") |
| `goals` | `Vec<String>` | optional (default `[]`) | optional (full replace) | |
| `tech_approval` | `Option<String>` | optional (default `""` empty) | optional | `TechApprovalStatus::ALL = ["未接触", "POC中", "已认可", "技术否决"]` (migration 012). `"未接触"` is a valid value, not the default |
| `competitors` | `Option<String>` | optional (default `""`) | optional | Competitor context, free TEXT (migration 012) |

### 3.3 `CreateCommunication` / `UpdateCommunication`

| Field | Type | Create | Update | Notes |
|---|---|:---:|:---:|---|
| `content` | `String` | ✅ required | optional | Non-empty after `trim()` else `400` |
| `occurred_at` | `DateTime<Utc>` | ✅ required | optional | RFC 3339 UTC |
| `participants` | `Option<String>` | optional | optional | |
| `conclusion` | `Option<String>` | optional | optional | Search target via `/communications/search` |

### 3.4 `CreateTask` / `UpdateTask`

| Field | Type | Create | Update | Notes |
|---|---|:---:|:---:|---|
| `title` | `String` | ✅ required | optional | Non-empty else `400` |
| `status` | `Option<String>` | optional (default `"todo"`) | optional | Must be one of `TaskStatus::ALL = ["current", "next", "todo"]` |
| `planned_date` | `Option<NaiveDate>` | optional | optional | `YYYY-MM-DD` |
| `assignee_id` | `Option<Uuid>` | optional | optional | FK → `people.id` (`SET NULL`); migration 017 |
| `priority` | `Option<String>` | optional (default `"normal"`) | optional | `TaskPriority::ALL = ["urgent", "high", "normal", "low"]`; migration 017 |

### 3.5 `CreateAsset` / `UpdateAsset`

| Field | Type | Create | Update | Notes |
|---|---|:---:|:---:|---|
| `name` | `String` | ✅ required | optional | Non-empty else `400` |
| `asset_type` | `Option<String>` | optional (default `"other"`) | optional | Free-form |
| `value` | `Option<String>` | optional | optional | Could be IP, domain, hostname, etc. |
| `description` | `Option<String>` | optional | optional | |
| `access_method` | `Option<String>` | optional | optional | How the asset is reached (migration 015) |
| `vendor` | `Option<String>` | optional | optional | Vendor/manufacturer (migration 015) |

### 3.5b `CreateAssetCredential` / `UpdateAssetCredential`

| Field | Type | Create | Update | Notes |
|---|---|:---:|:---:|---|
| `label` | `String` | ✅ required | optional | Non-empty else `400`; e.g. `SSH root`, `后台管理员` |
| `cred_type` | `Option<String>` | optional (default `"password"`) | optional | `CredentialType::ALL`; validated in Rust |
| `username` | `Option<String>` | optional | optional | Absent for key-only credentials |
| `secret` | `Option<String>` | optional | optional | Password / key body / token, stored as plain TEXT |

### 3.6 `CreateLink` (no `UpdateLink` — use `PUT /files/{id}`)

| Field | Type | Required | Notes |
|---|---|:---:|---|
| `name` | `String` | ✅ | Display name |
| `url` | `String` | ✅ | The external URL (no scheme validation) |
| `description` | `Option<String>` | optional | |
| `tags` | `Vec<String>` | optional | `TEXT[]` |

### 3.7 `UpdateFile`

| Field | Type | Notes |
|---|---|---|
| `description` | `Option<String>` | COALESCE pattern: `None` leaves existing value unchanged |
| `tags` | `Option<Vec<String>>` | COALESCE pattern: full replace if `Some` |

### 3.8 `CreatePhase` / `UpdatePhase`

| Field | Type | Create | Update | Notes |
|---|---|:---:|:---:|---|
| `name` | `String` | ✅ required | optional | Non-empty else `400` |
| `parent_id` | `Option<Uuid>` | optional | — | Self-reference; `null` = top-level phase, `Some(uuid)` = sub-phase |
| `description` | `Option<String>` | optional | optional | |
| `sort_order` | `Option<i32>` | optional (default `0`) | optional | Used only by `ORDER BY sort_order, created_at` |
| `planned_start` | `Option<DateTime<Utc>>` | optional | optional | |
| `planned_end` | `Option<DateTime<Utc>>` | optional | optional | |
| `actual_start` | — | — | optional | Update-only |
| `actual_end` | — | — | optional | Update-only |
| `status` | `Option<String>` | optional (default `"pending"`) | optional | |

### 3.9 `CreatePerson` / `UpdatePerson`

| Field | Type | Create | Update | Notes |
|---|---|:---:|:---:|---|
| `side` | `String` | ✅ required | — | `PersonSide::ALL = ["team", "client"]` (validated, else `400`). Create-only — switch sides via `POST /people/{id}/flip-side`. |
| `name` | `String` | ✅ required | optional | Non-empty else `400` |
| `role` | `Option<String>` | optional | optional | Shared across both sides |
| `notes` | `Option<String>` | optional | optional | |

### 3.10 `CreateDeliverable` / `UpdateDeliverable`

| Field | Type | Create | Update | Notes |
|---|---|:---:|:---:|---|
| `name` | `String` | ✅ required | optional | Non-empty else `400` |
| `status` | `Option<String>` | optional (default `"pending"`) | optional | `DeliverableStatus::ALL = ["pending", "delivered", "accepted"]` |
| `due_date` | `Option<NaiveDate>` | optional | optional | `YYYY-MM-DD` |
| `linked_file_id` | `Option<Uuid>` | optional | optional | Ties to `project_files.id` (`SET NULL` if that file is deleted) |

### 3.11 Link DTOs (request-only, defined in `handlers/files.rs`)

| DTO | Field | Purpose |
|---|---|---|
| `LinkFile`  | `communication_id: Option<Uuid>` | Body of `PUT /files/{id}/link`; `null` clears |
| `LinkPhase` | `phase_id: Option<Uuid>`           | Body of `PUT /files/{id}/link-phase`; `null` clears |

### 3.12 `SetupRequest` / `UserPublic` (auth, `models/user.rs`)

| Field | Type | Notes |
|---|---|---|
| `username` | `String` | Required; normalized (trim + lowercase) before storing/comparing |
| `password` | `String` | Required; ≥ 8 chars at setup; stored as argon2id PHC string (never returned) |
| `display_name` | `Option<String>` | Optional |

`UserPublic = { id, username, display_name?, created_at }` — the only
user shape that crosses the API boundary. The row struct `User` (with
`password_hash`) stays private to the backend; it has no `ts-rs` export.
`organization_id` exists in SQL as a future tenancy placeholder and is
deliberately absent from the Rust model.

### 3.13 `CreateIssue` / `UpdateIssue` (`models/issue.rs`)

| Field | Type | Create | Update | Notes |
|---|---|:---:|:---:|---|
| `title` | `String` | ✅ required | optional | Non-empty else `400` |
| `description` | `Option<String>` | optional | optional | |
| `status` | `Option<String>` | optional (default `"open"`) | optional | `IssueStatus::ALL = ["open", "in_progress", "resolved"]` |
| `communication_id` | `Option<Uuid>` | optional | optional | Must belong to the same project (guarded) |
| `assignee_id` | `Option<Uuid>` | optional | optional | FK → `people.id` (`SET NULL`) |
| `priority` | `Option<String>` | optional (default `"normal"`) | optional | `IssuePriority::ALL = ["urgent", "high", "normal", "low"]` |
| `due_date` | `Option<NaiveDate>` | optional | optional | `YYYY-MM-DD` |

### 3.14 `CreateFinding` / `UpdateFinding` (`models/finding.rs`)

| Field | Type | Create | Update | Notes |
|---|---|:---:|:---:|---|
| `title` | `String` | ✅ required | optional | Non-empty else `400` |
| `description` | `Option<String>` | optional | optional | |
| `product` | `Option<String>` | optional | optional | Product name |
| `product_source` | `String` | ✅ **required** | optional | `ProductSource::ALL = ["ours", "third_party"]`; no DB default |
| `vendor` | `Option<String>` | optional | optional | Vendor when third-party |
| `observed_at` | `Option<DateTime<Utc>>` | optional (default `now`) | optional | |
| `communication_id` | `Option<Uuid>` | optional | optional | Must belong to the same project (guarded) |
| `feedback_status` | `Option<String>` | optional (default `"unreported"`) | optional | `FeedbackStatus::ALL = ["unreported", "reported"]` |

---

## 4. Error Code Mapping

`AppError` lives in `backend/src/error.rs`. Every variant flows through
`AppError::parts()` (`error.rs:43-87`) which returns
`(StatusCode, &'static str code, String message)`. The `IntoResponse`
impl (`error.rs:96-110`) builds the JSON envelope and logs 5xx
internally before sending a generic message to the client.

| `AppError` variant | SQLx / trigger | HTTP status | `error` code | `message` shape | Notes |
|---|---|---|---|---|---|
| `AppError::NotFound(msg)` | n/a | `404 NOT_FOUND` | `not_found` | the supplied `msg` (e.g. `"client <uuid> not found"`) | Raised by every handler's `fetch_optional(...).ok_or_else(NotFound)` / `rows_affected() == 0` check |
| `AppError::BadRequest(msg)` | n/a | `400 BAD_REQUEST` | `bad_request` | the supplied `msg` | Validation failures (empty name/title/content, bad status, invalid multipart, post-write file I/O) |
| `AppError::Unauthorized(msg)` | n/a | `401 UNAUTHORIZED` | `unauthorized` | the supplied `msg` (deliberately generic on login) | Emitted by the `require_auth` guard (missing/dead session) and by login with bad creds |
| `AppError::Conflict(msg)` | n/a | `409 CONFLICT` | `conflict` | the supplied `msg` | State conflicts — e.g. re-running `/auth/setup` after an account exists |
| `AppError::Timeout(msg)` | n/a | `408 REQUEST_TIMEOUT` | `request_timeout` | the supplied `msg` (e.g. `"request exceeded the 30s server timeout"`) | Raised by `HandleErrorLayer` in `app.rs`; 30 s `REQUEST_TIMEOUT_SECS` |
| `Database(sqlx::Error::RowNotFound)` | `RowNotFound` | `404 NOT_FOUND` | `not_found` | `"resource not found"` | Used by `query_as!`; rarely surfaces since handlers fetch optional explicitly |
| `Database(_) is_unique_violation()` | `23505 unique_violation` | `400 BAD_REQUEST` | `conflict` | `"记录已存在或关联数据不存在"` | Triggered e.g. by `tags` array uniqueness or duplicate business keys |
| `Database(_) is_foreign_key_violation()` | `23503 fk_violation` | `400 BAD_REQUEST` | `invalid_reference` | `"记录已存在或关联数据不存在"` | Triggered by e.g. `DELETE /clients/:id` when projects still reference it |
| `Database(_) is_check_violation()` | `23514 check_violation` | `400 BAD_REQUEST` | `check_violation` | `"check constraint violated: <DB message>"` | Triggered by e.g. an enum or nullability check |
| `Database(_)` (other) | any other sqlx error | `500 INTERNAL_SERVER_ERROR` | `internal_error` | `"database error"` | Full error logged via `tracing::error!(error = ?self, "request failed with 5xx")` |
| `tower::timeout::error::Elapsed` bubbling up | n/a | `408 REQUEST_TIMEOUT` | `request_timeout` | the formatted timeout message | Caught by `handle_layer_error` (`main.rs:202-208`) and turned into `AppError::Timeout` |
| Unknown middleware failure (catch-all) | n/a | `500 INTERNAL_SERVER_ERROR` | `internal_error` | `"internal server error"` | `tracing::error!` first, then generic message |

---

## 5. File Upload Contract

`POST /api/projects/{project_id}/files` consumes
`multipart/form-data` with the following fields (`handlers/files.rs:62-171`):

| Field | Required | Content type | Notes |
|---|---|---|---|
| `file` | ✅ | `application/octet-stream` (or detected from `Content-Type`) | Bytes; `.bytes()` reads the whole field. Falls back to `original_name="unnamed"`, `mime_type="application/octet-stream"` if the client doesn't send them. |
| `description` | optional | `text/plain` | Plain string |
| `tags` | optional | `text/plain` | Comma-separated; split on `,`, trimmed, empty tokens dropped. Stored as Postgres `TEXT[]`. |

Server behavior:

| Step | Behavior |
|---|---|
| 1 | `ensure_project_exists(pool, project_id)` — missing project → `404 not_found` |
| 2 | Parse multipart fields in order; missing `file` → `400 bad_request ("no file in upload")` |
| 3 | Build `stored_name = "<uuid v4><original extension>"`; no extension → no suffix |
| 4 | `tokio::fs::create_dir_all("./uploads/{project_id}")` (failure → `400`) |
| 5 | `tokio::fs::write("./uploads/{project_id}/{stored_name}", bytes)` (failure → `400`) |
| 6 | Insert `project_files` row with `source_type='file'`, `mime_type`, `file_size`, `description`, `tags` |
| 7 | If DB insert fails after disk write succeeds → `tokio::fs::remove_file(...)` best-effort cleanup (failure → warn-log only) |
| 8 | `201 Created` + `FileMeta` (omits `stored_name` and `file_path`) |

Body size cap: `DefaultBodyLimit::max(MAX_BODY_SIZE_MB × 1024²)` from
`main.rs:362`. Default cap = **100 MiB**. Exceeding it returns
`413 Payload Too Large` from axum's body-limit extractor (not a
custom error code).

---

## 6. Link Entries

`POST /api/projects/{project_id}/links` (`handlers/files.rs:175-197`)
creates a `project_files` row with `source_type='link'`:

| Column | Value inserted |
|---|---|
| `project_id` | from URL |
| `original_name` | from `input.name` |
| `source_type` | `'link'` (literal) |
| `url` | from `input.url` |
| `description` | from `input.description` (optional) |
| `tags` | from `input.tags` (optional) |
| `stored_name` | `''` (empty) |
| `mime_type` | `'text/uri-list'` (literal) |
| `file_size` | `0` (literal) |
| `file_path` | `''` (empty) |

No file is written to disk. Both `tags` and `description` flow through
the same `TEXT[]` / nullable handling as file uploads. Response shape
is identical to uploads: `201 + FileMeta`.

---

## 7. Frontend Client Mapping

Frontend API objects live in `frontend/src/api/index.ts` (one axios
instance per resource, all sharing `baseURL: '/api'`, `timeout: 30000`).

React Query keys are first-seen in `useQuery({ queryKey })` and then
invalidated on mutations. They appear in `App.tsx`,
`pages/{ProjectBoard,ProjectDetail,FileLibrary,CommunicationDetail,LoginPage,SetupPage}.tsx`
and the tab `components/` (`OverviewTab`, `GroupedTab`, `PhasesTab`,
`TasksTab`, `DeliverablesTab`, `CommunicationsTab`, `IssuesTab`,
`FindingsTab`, `FilesTab`, `AssetsTab`, `MembersTab`, `TimelineTab`).

| Backend resource group | HTTP prefix (mounted at `/api`) | Frontend `*Api` object | React Query keys |
|---|---|---|---|
| Health        | `/health`                                     | `healthApi`            | none in hooks (probe only) |
| Auth          | `/auth/*` (status/setup/login/logout/me/password) | `authApi`              | `['auth-status']`, `['auth-me']` (`App.tsx` bootstrap gate) |
| Backup        | `/export`, `/export/archive`, `/import`, `/import/archive` | `backupApi` | no react-query hooks (plain links + one-shot POSTs from `BackupPage`) |
| Clients       | `/clients`                                    | `clientsApi`           | `['clients']` (`ProjectBoard.tsx`, `ProjectDetail.tsx`), `['client', client_id]` (`ProjectDetail.tsx`) |
| Projects      | `/projects`                                   | `projectsApi`          | `['projects']` (`App.tsx` sidebar, `ProjectBoard.tsx`), `['project', id]` (`ProjectDetail.tsx`) |
| Communications (nested) | `/projects/{project_id}/communications` | `communicationsApi.listByProject` / `.create` | `['communications', id]` (`ProjectDetail.tsx`, `FilesTab`, `IssuesTab`, `FindingsTab`), `['communications-recent']` (`ProjectBoard.tsx`), `['communications-search', debouncedSearch]` (`ProjectBoard.tsx`) |
| Communications (flat) | `/communications/{id}` (incl. `/recent`, `/search`) | `communicationsApi.get/update/delete/listRecent/search` | `['communication', commId]` (`CommunicationDetail.tsx`) |
| Tasks         | `/projects/{id}/tasks`, `/tasks/{id}`         | `tasksApi`             | `['tasks', id]` (`ProjectDetail.tsx`, `TasksTab`) |
| Issues        | `/projects/{id}/issues`, `/issues/{id}`       | `issuesApi`            | `['issues', id]` (`ProjectDetail.tsx`, `IssuesTab`) |
| Findings      | `/projects/{id}/findings`, `/findings/{id}`   | `findingsApi`          | `['findings', id]` (`ProjectDetail.tsx`, `FindingsTab`) |
| Assets        | `/projects/{id}/assets`, `/assets/{id}`       | `assetsApi`            | `['assets', id]` (`ProjectDetail.tsx`, `AssetsTab`) |
| Asset credentials (nested) | `/projects/{id}/assets/{asset_id}/credentials`, `/asset-credentials/{id}` | `assetCredentialsApi` | `['asset-credentials', assetId]` (`AssetsTab` credential drawer); invalidates `['assets', id]` to refresh `credential_count` |
| Files / Links | `/projects/{id}/files`, `/projects/{id}/links`, `/files`, `/files/{id}`, `/files/{id}/{download,preview,link,link-phase}` | `filesApi` | `['files', id]` (`ProjectDetail.tsx`, `FilesTab`), `['files-all']` (`FileLibrary.tsx`) |
| Phases        | `/projects/{id}/phases`, `/phases/{id}`       | `phasesApi`            | `['phases', projectId]` (`PhasesTab`, `FilesTab`) |
| People        | `/projects/{id}/people`, `/people/{id}`, `/projects/{id}/people/reorder`, `/people/{id}/flip-side` | `peopleApi`            | `['people', projectId]` (`MembersTab`, `IssuesTab`) |
| Deliverables  | `/projects/{id}/deliverables`, `/deliverables/{id}` | `deliverablesApi` | `['deliverables', projectId]` (`ProjectDetail.tsx`, `DeliverablesTab`) |
| Search        | `/search`                                     | `searchApi`            | sidebar global search (`App.tsx`, debounced 300 ms) |

Two error helpers are also exported from the same file and used
across pages:

- `ApiErrorKind = 'offline' | 'server' | 'validation' | 'conflict' | 'unknown'`
- `classifyApiError(err) → ApiErrorInfo`
  - `!response` → `'offline'` (no answer from server, or timeout)
  - 5xx → `'server'`
  - 400 / 422 → `'validation'`
  - 409 → `'conflict'`
  - else → `'unknown'`

Note: the backend emits `409` only via `AppError::Conflict` (state
conflicts, e.g. re-running setup); constraint violations are `400` with
codes `conflict`, `invalid_reference`, or `check_violation`. The
frontend's classifier maps by status number only — it does **not** parse
the JSON `error` field — so both DB-level 400s and true 409s are
distinguished in the UI (`'validation'` vs `'conflict'`).

---

## 8. Examples

### 8.1 Health probe + listing clients

```bash
curl http://localhost:3000/api/health
# → 200
# {"status":"ok","version":"0.1.0"}

curl http://localhost:3000/api/clients
# → 200
# [{ "id": "...", "name": "ACME", "products": ["web"], ... }]
```

```ts
// frontend/src/api/index.ts (abridged)
const http = axios.create({ baseURL: '/api', timeout: 30000 })

const health = await healthApi.check()
// → { status: 'ok', version: '0.1.0' }

const clients = await clientsApi.list()
// → Client[]
```

### 8.2 Create a project (orphan impossible)

```bash
curl -X POST http://localhost:3000/api/projects \
  -H 'Content-Type: application/json' \
  -d '{
        "client_id": "11111111-1111-1111-1111-111111111111",
        "name": "ACME pen-test 2025H2",
        "status": "in_progress",
        "goals": ["完成需求分析", "交付里程碑"]
      }'
# → 201
# { "id": "...", "client_id": "...", "name": "...", "status": "in_progress",
#   "phase": null, "goals": [...], "created_at": "...", "updated_at": "..." }
```

```ts
await projectsApi.create({
  client_id: '11111111-1111-1111-1111-111111111111',
  name: 'ACME pen-test 2025H2',
  status: 'in_progress',
  goals: ['完成需求分析', '交付里程碑'],
})
```

### 8.3 Upload a file (multipart)

```bash
curl -X POST \
  http://localhost:3000/api/projects/33333333-3333-3333-3333-333333333333/files \
  -F 'file=@./report.pdf' \
  -F 'description=Q2 review report' \
  -F 'tags=report,q2,review'
# → 201
# { "id": "...", "project_id": "...", "source_type": "file",
#   "original_name": "report.pdf", "mime_type": "application/pdf",
#   "file_size": 184321, "tags": ["report","q2","review"], ... }
```

```ts
await filesApi.upload(
  '33333333-3333-3333-3333-333333333333',
  new File([blob], 'report.pdf', { type: 'application/pdf' }),
  'Q2 review report',
  ['report', 'q2', 'review'],
)
```

### 8.4 Add a link entry

```bash
curl -X POST \
  http://localhost:3000/api/projects/33333333-3333-3333-3333-333333333333/links \
  -H 'Content-Type: application/json' \
  -d '{ "name": "CVE-2025-1234",
        "url": "https://nvd.nist.gov/vuln/detail/CVE-2025-1234" }'
# → 201
# { "id": "...", "source_type": "link", "url": "https://...", ... }
```

### 8.5 Error envelope (validation)

```bash
curl -X POST http://localhost:3000/api/projects \
  -H 'Content-Type: application/json' \
  -d '{ "client_id": "11111111-1111-1111-1111-111111111111", "name": "   " }'
# → 400
# { "error": "bad_request", "message": "name must not be empty" }
```

```bash
curl http://localhost:3000/api/projects/00000000-0000-0000-0000-000000000000
# → 404
# { "error": "not_found", "message": "project 00000000-... not found" }
```
