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
| Responsibility | Per-project IT/security inventory (servers, domains, IPs, etc.). |
| Routers exported | `project_assets_router()`, `assets_router()` |
| Project-scoped routes | `GET /projects/{project_id}/assets`, `POST /projects/{project_id}/assets`, `PUT /projects/{project_id}/assets/reorder` (body `{asset_ids: [...]}`, rewrites `sort_order`) |
| Flat-by-id routes | `GET /assets/{id}`, `PUT /assets/{id}`, `DELETE /assets/{id}` |
| Calls `ensure_project_exists` | **Yes** — both nested handlers. |
| Non-trivial behaviour | `asset_type` defaults to `"other"` if omitted. No status enum — `asset_type` is free-form text. `name` non-empty guard on create. `sort_order` (migration 016) supports drag-and-drop reorder via the project-scoped `PUT .../assets/reorder`. |
| Internal deps | `crate::models::{Asset, CreateAsset, UpdateAsset}`. |

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

### A.10 `search` — `backend/src/handlers/search.rs`

| Field | Value |
|---|---|
| Responsibility | Cross-resource keyword search (global, not project-scoped). |
| Router exported | `search_router()` |
| Routes | `GET /search?q=...` |
| Calls `ensure_project_exists` | **No** — reads across the whole DB. |
| Non-trivial behaviour | Runs `ILIKE %q%` against five resources, `LIMIT 10` each: **projects** (`name`/`phase`/`competitors`), **clients** (`name`/`contact_person`), **communications** (`content`/`participants`, returns an 80-char preview), **tasks** (`title`), **people** (`name`/`role`). Returns `SearchHit { resource, id, title, subtitle, project_id }`. Per-resource query failures are swallowed (`.unwrap_or_default()`) so one bad hit doesn't blank the result. |
| Internal deps | `crate::state::AppState`, `sqlx`; serializes `SearchHit` (defined inline). |

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
| `asset.rs` | `Asset` | `CreateAsset` | `UpdateAsset` | — |
| `project_file.rs` | `ProjectFile` | (no file-upload DTO; multipart) | `UpdateFile` | `FileMeta` (Serialize, hides `file_path` + `stored_name`), `FileWithProject` (joined view), `CreateLink` |
| `phase.rs` | `Phase` | `CreatePhase` | `UpdatePhase` | — |
| `person.rs` | `Person` | `CreatePerson` | `UpdatePerson` | **`PersonSide` const-module** (see B.4); `side: String` |
| `deliverable.rs` | `Deliverable` | `CreateDeliverable` | `UpdateDeliverable` | **`DeliverableStatus` const-module** (see B.5); `due_date: Option<NaiveDate>`, `linked_file_id: Option<Uuid>` |

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

---

## C. Backend DB layer (`backend/src/db/`)

### C.1 `db::pool` — `backend/src/db/pool.rs`

| Field | Value |
|---|---|
| Responsibility | Build a `PgPool` from `DATABASE_URL` with conservative timeouts (single-user internal tool). |
| Export | `pub async fn build_pool() -> Result<PgPool, sqlx::Error>` (re-exported as `db::build_pool`) |
| Config | `PgPoolOptions::new().max_connections(10).acquire_timeout(5s).idle_timeout(10min).max_lifetime(30min)` |
| Caller | `main.rs` wraps this in `build_pool_with_retry` (1 + 5 retries, 1/2/4/8/16s backoff). |
| Internal deps | `sqlx::postgres::{PgPool, PgPoolOptions}`, `std::time::Duration`. |

### C.2 `db::helpers` — `backend/src/db/helpers.rs`

| Field | Value |
|---|---|
| Responsibility | Shared DB helpers used by every project-scoped handler. |
| Export | `pub async fn ensure_project_exists(pool: &PgPool, project_id: Uuid) -> AppResult<()>` |
| Behaviour | `SELECT id FROM projects WHERE id = $1`; returns `AppError::NotFound("project {id} not found")` if no row. |
| Callers | `handlers::{communications, tasks, assets, files, phases, people, deliverables}::{list_by_project, create_for_project/upload_file/create_link}` — every project-scoped path. |

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
| Responsibility | Heavy tabbed detail page for one project (communications / tasks / assets / files / phases / **people** / **deliverables** / timeline tabs); also handles project-level edit and file upload + link creation. |
| Public API (TS) | `export default function ProjectDetail(): JSX.Element` |
| State | Many: `commForm`, `taskForm`, `assetForm`, `projectForm`, `fileOpen`, `editingAsset`, `selectedFile`, plus modal-open flags. |
| Calls | `projectsApi.get`, `communicationsApi.{listByProject, create}`, `tasksApi.{listByProject, create, update}`, `assetsApi.{listByProject, create, update, delete}`, `filesApi.{upload, createLink, listByProject, download, update, delete}`, `phasesApi.listByProject`, `clientsApi.list`. |
| Internal deps | `FilePreview`, `PhasesTab`, `MembersTab` (the people UI — name kept for history, calls `peopleApi`), `DeliverablesTab`, `TimelineTab`, `CommunicationList`, `ParticipantsInput` from `../components`; `formatSize` from `../utils/format`. |

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

---

## E. Frontend components (`frontend/src/components/`)

### E.1 `PhasesTab` — `frontend/src/components/PhasesTab.tsx`

| Field | Value |
|---|---|
| Responsibility | Phase CRUD inside a project; builds a nested tree from `parent_id` links; surfaces files attached to a phase. |
| Public API (TS) | `export default function PhasesTab({ projectId, files, onFilePreview }: Props): JSX.Element` |
| Calls | `phasesApi.{listByProject, create, update, delete}`, `filesApi.listByProject`. |
| Internal deps | `phasesApi`, `filesApi`; types `Phase`, `ProjectFile`. Local helpers `buildTree`, `formatSize`, `statusConfig` (color-coded `pending`/`in_progress`/`completed`). |

### E.2 `MembersTab` — `frontend/src/components/MembersTab.tsx`

| Field | Value |
|---|---|
| Responsibility | People UI for a project — team + client side-by-side (the component kept its historical `MembersTab` name, but the data model is the unified `people` table). Add / edit / delete people, drag-and-drop reorder within a side, and flip a person team↔client. |
| Public API (TS) | `export default function MembersTab({ projectId }: Props): JSX.Element` |
| Calls | `peopleApi.{listByProject, create, update, delete, reorder, flipSide}`. |
| Internal deps | `peopleApi`; type `Person` (and `CreatePerson`/`UpdatePerson`). |

### E.3 `FilePreview` — `frontend/src/components/FilePreview.tsx`

| Field | Value |
|---|---|
| Responsibility | Modal that previews any file by mime type: text→`<pre>`, image→`<img>`, PDF→`<iframe>`, html→`<iframe srcdoc>`, other→download prompt. |
| Public API (TS) | `export default function FilePreview({ file, open, onClose }: Props): JSX.Element` |
| Behaviour | Fetches `filesApi.previewUrl(file.id)` for text types via `fetch` + `AbortController`. Closes on `Escape`. Local helpers `isTextType`, `isHtmlType`, `isImageType`, `isPdfType`. |
| Internal deps | `filesApi.previewUrl` (returns `/api/files/{id}/preview`). |

### E.4 `FileLibrary` component (note: name collision with `pages/FileLibrary.tsx`)

| Field | Value |
|---|---|
| File | `frontend/src/components/FileLibrary.tsx` (component, distinct from the page in `pages/`) |
| Responsibility | Lower-level file-library component used inside `ProjectDetail` (project-scoped variant). Renders a table of `ProjectFile` with upload + link actions and preview hook. |
| Public API (TS) | `export default function FileLibrary({ projectId, onFilePreview }: Props): JSX.Element` |
| Calls | `filesApi.{listByProject, upload, createLink, update, delete, download}`. |
| Internal deps | `filesApi`; types `ProjectFile`; `formatSize`. |

### E.5 `CommunicationList` — `frontend/src/components/CommunicationList.tsx`

| Field | Value |
|---|---|
| Responsibility | Vertical clickable list of communications; each row shows date, participants (parsed), excerpt, attached-file count; click navigates to `CommunicationDetail`. |
| Public API (TS) | `export default function CommunicationList({ communications, projectId, files }: Props): JSX.Element` |
| Internal deps | `dayjs`; types `Communication`, `ProjectFile`. Local `parseParticipants` (handles `,` `，` `、` `;` `；`). |

### E.6 `CommunicationDetail` component (note: name collision with `pages/CommunicationDetail.tsx`)

| Field | Value |
|---|---|
| File | `frontend/src/components/CommunicationDetail.tsx` |
| Responsibility | Form-level detail editor used inside `ProjectDetail` for an inline comm view (the page in `pages/` is the full route; this component embeds the same fields as a sub-view). |
| Public API (TS) | `export default function CommunicationDetail({ comm, projectId, onUpdated, onDeleted }: Props): JSX.Element` |
| Calls | `communicationsApi.{update, delete}`, `filesApi.listByProject`, `filesApi.link`. |
| Internal deps | `communicationsApi`, `filesApi`; types `Communication`, `UpdateCommunication`, `ProjectFile`. |

### E.7 `Markdown` — `frontend/src/components/Markdown.tsx`

| Field | Value |
|---|---|
| Responsibility | Thin wrapper around `react-markdown` + `remark-gfm` for GitHub-flavoured markdown rendering inside a `.md-render` container. |
| Public API (TS) | `export default function Markdown({ children }: Props): JSX.Element` |
| Internal deps | `react-markdown`, `remark-gfm`. |

### E.8 `ParticipantsInput` — `frontend/src/components/ParticipantsInput.tsx`

| Field | Value |
|---|---|
| Responsibility | Tag-style AntD `Select` that accepts free-text names and joins them into a delimited string for `Communication.participants`. |
| Public API (TS) | `export default function ParticipantsInput({ value, onChange, placeholder }: Props): JSX.Element` |
| Behaviour | Splits on `,` `，` `、` `;` `；`. `Select` `open={false}` (acts like a token input, not a dropdown). Local `parseParticipants`. |
| Internal deps | `antd` `Select`. |

---

## F. Frontend shared (`frontend/src/`)

### F.1 `api/index.ts`

| Field | Value |
|---|---|
| Responsibility | Single axios instance (`baseURL: '/api'`, `timeout: 30000`) + one API object per resource + error classifier. |
| Exports (11 API objects + helpers) | `clientsApi`, `projectsApi`, `communicationsApi`, `tasksApi`, `assetsApi` (incl. `reorder`), `filesApi`, `phasesApi`, `peopleApi` (incl. `reorder` + `flipSide`), `deliverablesApi`, `searchApi`, `healthApi` |
| Extra exports | `ApiErrorKind` type (`'offline' \| 'server' \| 'validation' \| 'conflict' \| 'unknown'`), `ApiErrorInfo` interface, `classifyApiError(err: unknown): ApiErrorInfo` |
| Behaviour | `classifyApiError`: no `response` → `offline`; 5xx → `server`; 400/422 → `validation`; 409 → `conflict`; else `unknown`. |
| Internal deps | `axios`; every `*Api` consumes a typed interface from `../types`. |

### F.2 `types/index.ts`

| Field | Value |
|---|---|
| Responsibility | TS mirrors of every backend row struct + Create/Update DTO; aliases `UUID`, `ISODateTime`, `ISODate`. |
| Public API (TS) | Interfaces: `Client`, `Project`, `ProjectStatus`, `Communication`, `CommunicationWithProject`, `Task`, `TaskStatus`, `Asset`, `ProjectFile`, `FileWithProject`, `Phase`, `Person` (+ `PersonSide`), `Deliverable` (+ `DeliverableStatus`) + matching `Create*`/`Update*` interfaces + `SearchHit` + `ApiError`. (Backend DTOs are codegen'd into `types/generated/` by ts-rs at test time.) |
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
| Responsibility | Top-level shell: persistent sidebar (logo + nav + project-count footer + theme toggle) + `<Routes>` wrapped in `ErrorBoundary`. |
| Public API (TS) | `export default function App(): JSX.Element` (plus internal `SidebarItem` and `ErrorBoundary` classes — not exported) |
| State | `isDark` (localStorage-persisted, falls back to `prefers-color-scheme`); `useQuery(['projects'], projectsApi.list)` for footer stats. |
| Routes | `/` → `ProjectBoard`; `/files` → `FileLibrary`; `/projects/:id` → `ProjectDetail`; `/projects/:id/communications/:commId` → `CommunicationDetail`. |
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

## G. CLI client (`cli/src/main.rs`)

`pm` is a **standalone** CLI binary in the `cli/` crate, decoupled from the
server. It does not ship in the Docker image — it runs wherever the AI or
operator is (host, CI, another machine) and reaches the server over HTTP via
`--api-url` / `$PROJECT_MANAGE_URL`.

| Field | Value |
|---|---|
| Entry | `#[tokio::main] async fn main()` — parses `Cli`, then dispatches to the per-resource handler. |
| Top-level flags | `--api-url <url>` (default `http://localhost:{PORT}`, else `:3000`; or `$PROJECT_MANAGE_URL`), `--format json\|table` (json is default and AI-friendly; table is a minimal human renderer). |
| Resource subcommands | `clients`, `projects`, `phases`, `tasks`, `people`, `assets`, `files`, `communications`, `deliverables` — each with `list` / `get` / `create --data '<json>'` / `update --data '<json>'` / `delete` (files lack `create`/`update`; people add `flip <id>`). |
| Other subcommands | `search <query>` (global cross-resource search). |
| HTTP details | One `reqwest::Client` with a 30 s timeout. Writes are `POST`/`PUT`/`DELETE` over JSON; a non-2xx status becomes `Err(<status>)` and the process exits 1. |
| Output | JSON bodies are pretty-printed; arrays in `table` mode render a header + aligned columns (cell cap 40 chars). |
| Internal deps | `clap` (derive), `reqwest`, `serde_json`, `tokio`. Its own `cli/` crate — no dependency on the backend. Talks to the server purely over `/api` — no direct DB access. |

Example:

```bash
pm projects list --client-id <uuid>
pm --api-url http://localhost:9999 people flip <id>
pm --format table search "演练"
```

---

## Cross-reference: who calls what

| Backend handler | Models used | Calls `ensure_project_exists` | Side effects outside DB |
|---|---|---|---|
| clients | Client, CreateClient, UpdateClient | no | — |
| projects | Project, CreateProject, UpdateProject, ProjectStatus | no | `tokio::fs::remove_dir_all("./uploads/{id}")` on delete |
| communications | Communication, CommunicationWithProject, Create*U, Update*U | **yes** (nested) | — |
| tasks | Task, CreateTask, UpdateTask, TaskStatus | **yes** (nested) | — |
| assets | Asset, CreateAsset, UpdateAsset | **yes** (nested) | — |
| files | ProjectFile, FileMeta, FileWithProject, CreateLink, UpdateFile | **yes** (nested) | **writes to `./uploads/{project_id}/{uuid}{ext}` on upload; removes file on delete; removes dir on parent project delete (via projects::remove)** |
| phases | Phase, CreatePhase, UpdatePhase | **yes** (nested) | — |
| people | Person, CreatePerson, UpdatePerson, PersonSide | **yes** (nested) | — |
| deliverables | Deliverable, CreateDeliverable, UpdateDeliverable, DeliverableStatus | **yes** (nested) | — |
| search | (none — inline `SearchHit`) | no | — |
