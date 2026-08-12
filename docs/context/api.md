# project-manage — API Reference

Complete HTTP surface mounted under `/api` in `backend/src/main.rs`.
Every endpoint below has been verified against `backend/src/handlers/*.rs`
and the DTOs in `backend/src/models/*.rs`. Response shapes match the
return types of each handler (`T`, `Vec<T>`, `(StatusCode, Json<T>)`,
or `StatusCode`). Defaults come from `backend/src/main.rs:46` (30 s
request timeout) and `backend/src/main.rs:305` (`MAX_BODY_SIZE_MB=100`).

---

## 1. Conventions

| Aspect | Rule | Source |
|---|---|---|
| URL prefix | All routes under `/api` | `main.rs:339-354` (`.nest("/api", …)`) |
| List endpoint | `200 OK` + JSON array | every `list*` handler |
| Single read | `200 OK` + JSON object | every `get_one` handler |
| Create | `201 Created` + JSON object | every `create*` handler returns `(StatusCode::CREATED, Json(row))` |
| Update | `200 OK` + JSON object | every `update` handler |
| Delete | `204 No Content` (empty body) | every `remove` handler returns `StatusCode::NO_CONTENT` |
| Error body | `{ "error": "<code>", "message": "<text>" }` | `error.rs:90-94` (`ErrorBody`) |
| 5xx detail | Generic message to client; full error logged via `tracing::error!` | `error.rs:101-103` |
| IDs | `Uuid` v4 (path param `:id` / `:project_id` for nested) | `models/*.rs` |
| Timestamps | RFC 3339 UTC (`"2025-07-14T03:11:09.123456Z"`) | `chrono::{DateTime, Utc}` |
| Request timeout | 30 s server-wide → `408 request_timeout` | `main.rs:46`, `main.rs:202-208` |
| Body size cap | `MAX_BODY_SIZE_MB × 1024²` (default 100 MiB) | `main.rs:305-306, 362` |

---

## 2. Endpoint Catalog

### 2.1 `GET /api/health` (operational)

| Method | Path | Purpose | Query | Body | Response |
|---|---|---|---|---|---|
| GET | `/api/health` | Liveness probe; returns package version | — | — | `200` + `{ "status": "ok", "version": "<CARGO_PKG_VERSION>" }` |

Implemented at `main.rs:255-268` as `HealthResponse`.

### 2.2 Clients (`backend/src/handlers/clients.rs`)

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

### 2.3 Projects (`backend/src/handlers/projects.rs`)

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

### 2.4 Communications (`backend/src/handlers/communications.rs`)

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

### 2.5 Tasks (`backend/src/handlers/tasks.rs`)

| Method | Path | Purpose | Path params | Body | Response |
|---|---|---|---|---|---|
| GET    | `/api/projects/{project_id}/tasks` | List tasks ordered by status priority (`current < next < todo`), then `planned_date NULLS LAST`, then `created_at` | `project_id` | — | `200` + `Task[]` |
| POST   | `/api/projects/{project_id}/tasks` | Create task under project (default status `todo`) | `project_id` | `CreateTask` | `201` + `Task` |
| GET    | `/api/tasks/{id}` | Read one task | `id` | — | `200` + `Task` |
| PUT    | `/api/tasks/{id}` | Partial update | `id` | `UpdateTask` | `200` + `Task` |
| DELETE | `/api/tasks/{id}` | Remove | `id` | — | `204` |

Validation: `title` non-empty; `status ∈ TaskStatus::ALL =
["current", "next", "todo"]` (else `400`).

### 2.6 Assets (`backend/src/handlers/assets.rs`)

| Method | Path | Purpose | Path params | Body | Response |
|---|---|---|---|---|---|
| GET    | `/api/projects/{project_id}/assets` | List for a project, `ORDER BY created_at DESC` | `project_id` | — | `200` + `Asset[]` |
| POST   | `/api/projects/{project_id}/assets` | Create asset (default `asset_type = "other"`) | `project_id` | `CreateAsset` | `201` + `Asset` |
| GET    | `/api/assets/{id}` | Read one asset | `id` | — | `200` + `Asset` |
| PUT    | `/api/assets/{id}` | Partial update | `id` | `UpdateAsset` | `200` + `Asset` |
| DELETE | `/api/assets/{id}` | Remove | `id` | — | `204` |

`asset_type` is free-form TEXT (no enum). Validation: `name` non-empty.

### 2.7 Files / Links (`backend/src/handlers/files.rs`)

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

### 2.8 Phases (`backend/src/handlers/phases.rs`)

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

### 2.9 Members (`backend/src/handlers/members.rs`)

| Method | Path | Purpose | Path params | Body | Response |
|---|---|---|---|---|---|
| GET    | `/api/projects/{project_id}/members` | List our-side team members | `project_id` | — | `200` + `Member[]` |
| POST   | `/api/projects/{project_id}/members` | Create member | `project_id` | `CreateMember` | `201` + `Member` |
| GET    | `/api/members/{id}` | Read one | `id` | — | `200` + `Member` |
| PUT    | `/api/members/{id}` | Partial update | `id` | `UpdateMember` | `200` + `Member` |
| DELETE | `/api/members/{id}` | Remove | `id` | — | `204` |

Validation: `name` non-empty. `role` and `notes` are free-form text.

### 2.10 Client Contacts (`backend/src/handlers/contacts.rs`)

| Method | Path | Purpose | Path params | Body | Response |
|---|---|---|---|---|---|
| GET    | `/api/projects/{project_id}/contacts` | List client-side contacts | `project_id` | — | `200` + `ClientContact[]` |
| POST   | `/api/projects/{project_id}/contacts` | Create contact            | `project_id` | `CreateClientContact` | `201` + `ClientContact` |
| GET    | `/api/contacts/{id}` | Read one | `id` | — | `200` + `ClientContact` |
| PUT    | `/api/contacts/{id}` | Partial update | `id` | `UpdateClientContact` | `200` + `ClientContact` |
| DELETE | `/api/contacts/{id}` | Remove | `id` | — | `204` |

Validation: `name` non-empty; `notes` optional.

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
| `security_concerns` | `Vec<String>` | optional (default `[]`) | optional (full replace) | |
| `background_info` | `Option<String>` | optional | optional | |

### 3.2 `CreateProject` / `UpdateProject`

| Field | Type | Create | Update | Notes |
|---|---|:---:|:---:|---|
| `client_id` | `Uuid` | ✅ **required** | optional | DB enforces `NOT NULL REFERENCES clients`. Required on create so an orphan project can never exist by construction. |
| `name` | `String` | ✅ required | optional | Non-empty after `trim()` else `400` |
| `status` | `Option<String>` | optional (default `"in_progress"`) | optional | Must be one of `ProjectStatus::ALL = ["in_progress", "completed", "paused"]` |
| `phase` | `Option<String>` | optional | optional | Free-form label (e.g. "软件测试") |
| `goals` | `Vec<String>` | optional (default `[]`) | optional (full replace) | |

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

### 3.5 `CreateAsset` / `UpdateAsset`

| Field | Type | Create | Update | Notes |
|---|---|:---:|:---:|---|
| `name` | `String` | ✅ required | optional | Non-empty else `400` |
| `asset_type` | `Option<String>` | optional (default `"other"`) | optional | Free-form |
| `value` | `Option<String>` | optional | optional | Could be IP, domain, hostname, etc. |
| `description` | `Option<String>` | optional | optional | |

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

### 3.9 `CreateMember` / `UpdateMember`

| Field | Type | Create | Update | Notes |
|---|---|:---:|:---:|---|
| `name` | `String` | ✅ required | optional | Non-empty else `400` |
| `role` | `Option<String>` | optional | optional | e.g. "lead", "engineer" |
| `notes` | `Option<String>` | optional | optional | |

### 3.10 `CreateClientContact` / `UpdateClientContact`

| Field | Type | Create | Update | Notes |
|---|---|:---:|:---:|---|
| `name` | `String` | ✅ required | optional | Non-empty else `400` |
| `notes` | `Option<String>` | optional | optional | |

### 3.11 Link DTOs (request-only, defined in `handlers/files.rs:298-328`)

| DTO | Field | Purpose |
|---|---|---|
| `LinkFile`  | `communication_id: Option<Uuid>` | Body of `PUT /files/{id}/link`; `null` clears |
| `LinkPhase` | `phase_id: Option<Uuid>`           | Body of `PUT /files/{id}/link-phase`; `null` clears |

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
| `AppError::Timeout(msg)` | n/a | `408 REQUEST_TIMEOUT` | `request_timeout` | the supplied `msg` (e.g. `"request exceeded the 30s server timeout"`) | Raised by `HandleErrorLayer` in `main.rs:202-208`; 30 s `REQUEST_TIMEOUT_SECS` |
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
`pages/{ProjectBoard,ProjectDetail,FileLibrary,CommunicationDetail}.tsx`
and `components/{PhasesTab,MembersTab}.tsx`.

| Backend resource group | HTTP prefix (mounted at `/api`) | Frontend `*Api` object | React Query keys |
|---|---|---|---|
| Health        | `/health`                                     | `healthApi`            | none in hooks (called once in `App.tsx` project-count footer) |
| Clients       | `/clients`                                    | `clientsApi`           | `['clients']` (`ProjectBoard.tsx:53`), `['client', project.client_id]` (`ProjectDetail.tsx:115`) |
| Projects      | `/projects`                                   | `projectsApi`          | `['projects']` (`App.tsx:128`, `ProjectBoard.tsx:48`), `['project', id]` (`ProjectDetail.tsx:109`) |
| Communications (nested) | `/projects/{project_id}/communications` | `communicationsApi.listByProject` / `.create` | `['communications', id]` (`ProjectDetail.tsx:121`), `['communications-recent']` (`ProjectBoard.tsx:58`), `['communications-search', debouncedSearch]` (`ProjectBoard.tsx:64`) |
| Communications (flat) | `/communications/{id}` (incl. `/recent`, `/search`) | `communicationsApi.get/update/delete/listRecent/search` | `['communication', commId]` (`CommunicationDetail.tsx:46`) |
| Tasks         | `/projects/{id}/tasks`, `/tasks/{id}`         | `tasksApi`             | `['tasks', id]` (`ProjectDetail.tsx:127`) |
| Assets        | `/projects/{id}/assets`, `/assets/{id}`       | `assetsApi`            | `['assets', id]` (`ProjectDetail.tsx:133`) |
| Files / Links | `/projects/{id}/files`, `/projects/{id}/links`, `/files`, `/files/{id}`, `/files/{id}/{download,preview,link,link-phase}` | `filesApi` | `['files', id]` (project detail + phases tab + comm detail), `['files-all']` (`FileLibrary.tsx:34`) |
| Phases        | `/projects/{id}/phases`, `/phases/{id}`       | `phasesApi`            | `['phases', projectId]` (`PhasesTab.tsx:70`), `['phases', id]` (`ProjectDetail.tsx:145`) |
| Members       | `/projects/{id}/members`, `/members/{id}`     | `membersApi`           | `['members', projectId]` (`MembersTab.tsx:36`) |
| Contacts      | `/projects/{id}/contacts`, `/contacts/{id}`   | `contactsApi`          | `['contacts', projectId]` (`MembersTab.tsx:41`) |

Two error helpers are also exported from the same file and used
across pages:

- `ApiErrorKind = 'offline' | 'server' | 'validation' | 'conflict' | 'unknown'`
- `classifyApiError(err) → ApiErrorInfo`
  - `!response` → `'offline'` (no answer from server, or timeout)
  - 5xx → `'server'`
  - 400 / 422 → `'validation'`
  - 409 → `'conflict'`
  - else → `'unknown'`

Note: the backend never returns `409` or `422`; constraint errors are
`400` with codes `conflict`, `bad_request`, `invalid_reference`, or
`check_violation`. The frontend's classifier thus only maps the
status number — it does **not** parse the JSON `error` field — so
constraint violations surface as `'validation'` in the UI.

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
        "goals": ["发现Web漏洞", "完成等保测评"]
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
  goals: ['发现Web漏洞', '完成等保测评'],
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
