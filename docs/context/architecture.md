# project-manage — Architecture

End-to-end view of the fullstack system: what it is, how the pieces fit, and why
the seams look the way they do. Every claim below was verified by reading the
actual source — not inferred from filenames. Source files of record are listed
in each section.

---

## 1. System overview

**project-manage** is an internal project tracking system for service
delivery teams. Project managers and team members use it in an office
setting (mixed light, multiple tools open) to centralise work that previously
lived in Excel / WeChat / email: client accounts, project status,
communication logs, task tracking, file and link library, phased milestones,
team + client people (unified), and deliverables (`PRODUCT.md`).

Core workflow — captured in PRODUCT.md and enforced by the URL shape:

```text
客户 ──► 项目 ──► 沟通 ──► 任务
 │       │       │       │
 │       │ status:        │ content +        │ status:
 │       │ in_progress /  │ occurred_at +    │ current /
 │       │ completed /    │ participants +   │ next /
 │       │ paused         │ conclusion       │ todo
 │       │
 │       ├─ phase tree (nested, self-referencing parent_id)
 │       ├─ assets (IT / security devices)
 │       ├─ files + links (linkable to comm and phase)
 │       ├─ people (team + client, unified)
 │       └─ deliverables (交付物 lifecycle)
 │
 └─ products[], background_info
```

`clients (1) ──< (N) projects (1) ──< (N) {communications, tasks, assets,`
`project_files, phases, people, deliverables}`
(`backend/migrations/001`–`018`; `people` unifies the former `members` +
`client_contacts` tables — migration 014).

---

## 2. Layering model

A linear, boring stack — intentionally so. The only non-obvious edge is the
Vite dev proxy in the middle.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Browser SPA: React 19 + Ant Design 5 (zh_CN) + react-query 5 + axios   │
│ state: QueryClient (staleTime 30s, smart retry, no refetch-on-focus)   │
│ source: frontend/src/main.tsx:10-24                                     │
├─────────────────────────────────────────────────────────────────────────┤
│ Dev proxy (dev only): Vite :5173  ── /api/* ──► Axum :3000              │
├─────────────────────────────────────────────────────────────────────────┤
│ Wire contract: HTTP/JSON over /api/*                                    │
│ 200 array | 200 obj | 201 created | 204 delete                          │
│ Errors: { "error": "<code>", "message": "<text>" }                     │
├─────────────────────────────────────────────────────────────────────────┤
│ Axum backend (Rust, edition 2024)                                       │
│   Router::new().nest("/api", …)  ─► handler fn ─► sqlx::query           │
│   middleware stack (app.rs (build_app)):                                   │
│     .layer(cors) → HandleErrorLayer→TimeoutLayer → TraceLayer          │
│     → DefaultBodyLimit → with_state(AppState { pool })                  │
├─────────────────────────────────────────────────────────────────────────┤
│ PostgreSQL 16  (sqlx 0.8, runtime-tokio, tls-rustls, macros)            │
│ 19 SQL migrations → _sqlx_migrations bookkeeping table                  │
│ set_updated_at() trigger installed in migration 001, reused by all       │
└─────────────────────────────────────────────────────────────────────────┘
```

| Layer       | Files of record                              | Key deps                                   |
|-------------|----------------------------------------------|--------------------------------------------|
| UI          | `frontend/src/App.tsx`, `pages/`, `components/` | `react@19`, `antd@^5.29`, `react-query@^5` |
| API client  | `frontend/src/api/index.ts`                  | `axios@^1.18`, 30 s timeout, baseURL `/api`|
| HTTP        | `backend/src/main.rs:271-393`                | `axum@0.8.9`, `tower@0.5`, `tower-http@0.7`|
| Handlers    | `backend/src/handlers/*.rs`                  | one module per resource                   |
| Models      | `backend/src/models/*.rs`                    | `sqlx::FromRow` row + Create/Update DTOs  |
| DB pool     | `backend/src/db/pool.rs`, `helpers.rs`       | `sqlx::PgPoolOptions`                      |
| Schema      | `backend/migrations/*.sql`                   | 18 files, all `TIMESTAMPTZ` + UUID PK      |

---

## 3. Module dependency graph

### 3.1 Backend — 17 routers wired into `/api`

Verified by counting `.nest("/api", …)` calls in
`backend/src/app.rs::build_app` (17 hits). The breakdown: **10 flat** resource
routers (clients, projects, communications, tasks, assets, files, phases,
people, deliverables, search) + **7 project-scoped** routers
(communications, tasks, assets, files, phases, people, deliverables).

| # | Router (`*_router()`)        | Source                              | Mounted path prefix                                       |
|---|------------------------------|-------------------------------------|-----------------------------------------------------------|
| 1 | `clients_router`             | `handlers/clients.rs:24`            | `/clients`, `/clients/{id}`                               |
| 2 | `projects_router`            | `handlers/projects.rs:27`           | `/projects`, `/projects/{id}`                             |
| 3 | `communications_router`      | `handlers/communications.rs:42`     | `/communications/{id}` + `/recent`, `/search`             |
| 4 | `tasks_router`               | `handlers/tasks.rs:37`              | `/tasks/{id}`                                             |
| 5 | `project_communications_router` | `communications.rs` (nested form) | `/projects/{id}/communications`                           |
| 6 | `project_tasks_router`       |                                     | `/projects/{id}/tasks`                                    |
| 7 | `project_assets_router`      | `handlers/assets.rs`                | `/projects/{id}/assets`                                   |
| 8 | `assets_router`              |                                     | `/assets/{id}`                                            |
| 9 | `project_files_router`       | `handlers/files.rs:27`              | `/projects/{id}/files` (multipart), `/projects/{id}/links`|
| 10| `files_router`               | `handlers/files.rs:36`              | `/files`, `/files/{id}`, `/download`, `/preview`, `/link`, `/link-phase` |
| 11| `project_phases_router`      | `handlers/phases.rs`                | `/projects/{id}/phases`                                   |
| 12| `phases_router`              |                                     | `/phases/{id}`                                            |
| 13| `project_people_router`      | `handlers/people.rs`                | `/projects/{id}/people`, `/projects/{id}/people/reorder`  |
| 14| `people_router`              |                                     | `/people/{id}`, `/people/{id}/flip-side`                  |
| 15| `project_deliverables_router`| `handlers/deliverables.rs`          | `/projects/{id}/deliverables`                             |
| 16| `deliverables_router`        |                                     | `/deliverables/{id}`                                      |
| 17| `search_router`              | `handlers/search.rs`                | `/search?q=…`                                             |

Plus `GET /api/health` mounted as a route (not a nest) at `main.rs:335`.
See §5.5 for why flat + scoped are split into two routers per resource.

### 3.2 Frontend — 4 React Routes

`frontend/src/App.tsx:197-205`:

| Path                                         | Component             | Notes                              |
|----------------------------------------------|-----------------------|------------------------------------|
| `/`                                          | `ProjectBoard`        | Index of all projects              |
| `/files`                                     | `FileLibrary`         | Cross-project file/link library    |
| `/projects/:id`                              | `ProjectDetail`       | Heavy tabbed detail (see §4)       |
| `/projects/:id/communications/:commId`       | `CommunicationDetail` | Markdown-rendered comm record      |

Wrapped in `ErrorBoundary` (`App.tsx:50-110`); failure renders a `刷新`
button that calls `window.location.reload()`.

### 3.3 Backend crate shape

```text
main.rs ── mod db, mod error, mod handlers, mod models, mod state
   │
   ├── handlers/{clients,projects,communications,tasks,assets,files,
   │             phases,people,deliverables,search}.rs   (one *_router() each,
   │                                                       except search = flat only)
   ├── models/   {client,project,communication,task,asset,project_file,
   │              phase,person,deliverable}.rs
   ├── db/       pool.rs (PgPoolOptions) + helpers.rs (ensure_project_exists)
   ├── error.rs  AppError + IntoResponse  ──► { error, message } envelope
   └── state.rs  AppState { pool }   (cloneable, cheap to share)
```

No cross-handler imports — handlers only talk to `db`, `error`, `models`,
`state`. The single shared helper is `ensure_project_exists`, called at the
top of every project-scoped handler.

---

## 4. Two representative data flows

### 4.1 Opening `/projects/:id` (read-heavy)

URL → `/projects/:id` → React Router matches `App.tsx:200` →
`ProjectDetail` mounts (`pages/ProjectDetail.tsx:80`). On mount it fires
**7 parallel react-query queries** (staleTime 30 s, no refetch-on-focus):

| queryKey                  | queryFn                                | HTTP                                              |
|---------------------------|----------------------------------------|---------------------------------------------------|
| `['project', id]`         | `projectsApi.get(id)`                  | `GET /api/projects/{id}`                          |
| `['client', client_id]`   | `clientsApi.get(client_id)` *          | `GET /api/clients/{client_id}`                    |
| `['communications', id]`  | `communicationsApi.listByProject(id)`  | `GET /api/projects/{id}/communications`           |
| `['tasks', id]`           | `tasksApi.listByProject(id)`           | `GET /api/projects/{id}/tasks`                    |
| `['assets', id]`          | `assetsApi.listByProject(id)`          | `GET /api/projects/{id}/assets`                   |
| `['files', id]`           | `filesApi.listByProject(id)`           | `GET /api/projects/{id}/files`                    |
| `['phases', id]`          | `phasesApi.listByProject(id)`          | `GET /api/projects/{id}/phases`                   |

`*` Enabled only after `project.client_id` resolves — a `react-query`
chained query.

When the user opens the People tab (`components/MembersTab.tsx` — filename
kept for history), it fetches one more: `GET /api/projects/{id}/people`
(the unified team + client roster). Deliverables and Timeline have their own
tabs (`DeliverablesTab.tsx`, `TimelineTab.tsx`).

Wire path per call: axios (`/api`, 30 s timeout, `api/index.ts:33-36`) → Vite
dev proxy (`/api/*` → `:3000`) → Axum handler →
`ensure_project_exists(...).await?` → `sqlx::query_as!(…)` → `Json(row)` →
react-query caches by key → component re-renders.

Note: ProjectDetail itself owns those queries plus project + client.
People, deliverables, and timeline are owned by their own tab components,
fired only when the user opens each tab.

### 4.2 Uploading a file via the Files tab

```text
ProjectDetail.tsx:258  (Upload onChange)
  │ filesApi.upload(id, file, description?, tags?)           api/index.ts:123-135
  │    FormData: append file (req), description (opt), tags (opt CSV)
  ▼ axios.post('/projects/{projectId}/files', formData)      baseURL /api, 30s
  ▼ POST /api/projects/{projectId}/files   (multipart/form-data)
  ▼ handlers/files.rs:62  upload_file(State(pool), Path(project_id), Multipart)
  │ ensure_project_exists(&pool, project_id).await?         ◄── 404 if gone
  │                                                          (db/helpers.rs:9-22)
  │ loop multipart.next_field():  file → bytes, description → opt, tags → CSV
  │ stored_name = uuid_v4() + ext(original_name)
  │ upload_dir  = "./uploads/{project_id}"; create_dir_all   ◄── 400 on fail
  │ tokio::fs::write(&file_path, &file_data).await           ◄── 400 on fail
  │ INSERT INTO project_files (...) VALUES ($1..$8) RETURNING …
  │ match fetch_one(&pool).await {
  │     Ok(row) => row,
  │     Err(_)   => { remove_file + return Err(...); }      ◄── cleanup, JSON env
  │ }
  ▼ 201 Created + Json(FileMeta::from(row))
  ▼ react-query onSuccess → invalidateQueries(['files', id]) → list refetches
```

Failure modes (`handlers/files.rs:159-167`, `progress.md` 2026-07-15):
DB-insert failure **after** a successful disk write triggers a best-effort
file delete and is logged at warn. Disk failure **before** the DB write
returns 400 without leaving a DB row. Project-delete also cleans up
`./uploads/{project_id}/` on disk, best-effort and warn-only.

---

## 5. Key design decisions

### 5.1 Status as `TEXT`, validated in Rust

Migration 002 stores `projects.status TEXT NOT NULL DEFAULT 'in_progress'`
(`migrations/20250714000002_init_projects.sql:13`); validation in
`models/project.rs:19-32`:

```rust
pub mod ProjectStatus {
    pub const IN_PROGRESS: &str = "in_progress";
    pub const COMPLETED:   &str = "completed";
    pub const PAUSED:      &str = "paused";
    pub const ALL: &[&str] = &[IN_PROGRESS, COMPLETED, PAUSED];
    pub fn is_valid(s: &str)->bool{matches!(s,IN_PROGRESS|COMPLETED|PAUSED)}
}
```

Handlers call `ProjectStatus::is_valid` before write, returning 400 with
`ALL` interpolated (`handlers/projects.rs:65,134`). Same pattern for
`TaskStatus` (`current`/`next`/`todo`). Adding a value is a Rust-only change,
no migration — exactly the point.

### 5.2 Runtime `sqlx::Migrator`, not `sqlx::migrate!`

`main.rs:185`: `migrate::Migrator::new("./migrations")` loads SQL at runtime
(the `sqlx::migrate!()` macro would embed it at compile time). Inline
comment at `main.rs:290-292`: *"the SQL files stay readable / diffable in
git"*. Run via `run_migrations_with_retry`, idempotent against
`_sqlx_migrations`.

### 5.3 Bounded retry with exponential backoff at boot

`main.rs:43`: `const STARTUP_RETRY_DELAYS_SECS: [u64; 5] = [1, 2, 4, 8, 16];`,
applied to both `build_pool_with_retry` and `run_migrations_with_retry`. One
initial + 5 retries = up to 6 attempts at 1/2/4/8/16 s. After all fail the
process panics — survives transient DB outages at startup.

### 5.4 Per-request 30 s timeout → 408, and the JSON error envelope

`main.rs:46`: `const REQUEST_TIMEOUT_SECS: u64 = 30;`. The middleware stack
(`app.rs::build_app`) wraps `TimeoutLayer(30s)` in `HandleErrorLayer` so
`tower::timeout::error::Elapsed` is translated into the same error shape as
handler errors. `handle_layer_error` matches `Elapsed` →
`AppError::Timeout(…)` → `error.rs:48` maps to 408 `request_timeout`.
Anything else from middleware becomes a logged 500.

`AppError::IntoResponse` (`error.rs:90-110`) always emits
`{ "error": <code>, "message": <text> }`:

| HTTP | code               | when                                  |
|------|--------------------|---------------------------------------|
| 400  | `bad_request`      | explicit `AppError::BadRequest`       |
| 400  | `conflict`         | Postgres unique violation             |
| 400  | `invalid_reference`| Postgres FK violation                 |
| 400  | `check_violation`  | Postgres CHECK violation              |
| 404  | `not_found`        | `AppError::NotFound` or `RowNotFound` |
| 408  | `request_timeout`  | tower `Elapsed` → `AppError::Timeout` |
| 500  | `internal_error`   | everything else; full error logged    |

5xx detail is **never** leaked — `into_response` swaps in a generic message
and emits the real one through `tracing::error!`. Frontend currently
classifies by status range in `classifyApiError` (`api/index.ts:212-234`);
the `error` code in the envelope allows future code-based routing without
backend changes.

### 5.5 Flat + project-scoped routers, two per resource

The 9 resources are mounted **twice**: a flat `*_router()` and a
project-scoped `project_*_router()`. `handlers/files.rs:27-44`:

```rust
pub fn project_files_router() -> Router<AppState> {
    Router::new()
        .route("/projects/{project_id}/files", get(list_by_project).post(upload_file))
        .route("/projects/{project_id}/links",  post(create_link))
}

pub fn files_router() -> Router<AppState> {
    Router::new()
        .route("/files",                get(list_all))
        .route("/files/{id}",           get(get_one).put(update).delete(remove))
        .route("/files/{id}/download",  get(download_file))
        .route("/files/{id}/preview",   get(preview_file))
        .route("/files/{id}/link",      put(link_to_communication))
        .route("/files/{id}/link-phase", put(link_to_phase))
}
```

Axum dispatches `/projects/{id}` (project detail) and
`/projects/{project_id}/files` independently — path segments don't collide,
so two routers beat one router with internal prefix matching, and each
handler keeps a clean extractor signature (`Path<Uuid>` for `id` vs
`project_id`).

### 5.6 Cross-cutting invariants

- **`ensure_project_exists`** (`db/helpers.rs:9-22`) is the first line of
  every project-scoped handler. Returns `AppError::NotFound` → 404
  `not_found` — keeps FK-violation 400s reserved for genuine constraint
  failures, not confused wrong-UUID cases.
- **Frontend retry** (`main.tsx:14-22`): max 3 attempts, exponential
  backoff capped at 10 s, **skips 4xx**, `staleTime 30s`,
  `refetchOnWindowFocus: false`. Mirrors the backend's "4xx is the client's
  fault" stance.
- **Error classification** in `classifyApiError` (`api/index.ts:212-234`)
  maps surviving failures to `ApiErrorKind = 'offline' | 'server' |
  'validation' | 'conflict' | 'unknown'` for UI toast/banner selection
  without parsing the JSON `error` field.

---

## 6. Quick reference

| Concern             | File(s) of record                                                  |
|---------------------|--------------------------------------------------------------------|
| Backend entrypoint  | `backend/src/main.rs:271-393`                                      |
| AppError envelope   | `backend/src/error.rs:90-110`                                      |
| Pool + helpers      | `backend/src/db/pool.rs`, `backend/src/db/helpers.rs`              |
| Resource handlers   | `backend/src/handlers/{clients,projects,communications,tasks,assets,files,phases,people,deliverables,search}.rs` |
| Migrations          | `backend/migrations/20250714000001_*.sql` … `…00018_*.sql` (18 files) |
| Frontend entrypoint | `frontend/src/main.tsx`, `frontend/src/App.tsx`                    |
| Routing             | `frontend/src/App.tsx:197-205`                                     |
| API client          | `frontend/src/api/index.ts`                                        |
| Error classifier    | `frontend/src/api/index.ts:212-234`                                |
| Product brief       | `PRODUCT.md`, `DESIGN.md`                                          |
