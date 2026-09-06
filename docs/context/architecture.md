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
 │       ├─ assets (IT devices)
 │       │   └─ asset_credentials (multi-entry logins/keys per asset)
 │       ├─ files + links (linkable to comm and phase)
 │       ├─ people (team + client, unified)
 │       ├─ deliverables (交付物 lifecycle)
 │       ├─ issues (客户关切 — client-raised concerns)
 │       └─ findings (产品发现 — product problems we observed)
 │
 └─ products[], background_info

users (local account, argon2id) ──► session (tower-sessions, Postgres)
```

`clients (1) ──< (N) projects (1) ──< (N) {communications, tasks, assets,`
`project_files, phases, people, deliverables, issues, findings}`
(`backend/migrations/001`–`024`; `people` unifies the former `members` +
`client_contacts` tables — migration 014; `issues`/`findings` landed in
020/021, `users`+`session` in 022, `asset_credentials` — nested under
each asset — in 023, `user_sessions` ownership index in 024). All `/api/*` business routes sit behind
the fail-closed session guard (`require_auth`) — only `/api/health` and
`/api/auth/*` are public.

---

## 2. Layering model

A linear, boring stack — intentionally so. The only non-obvious edge is the
Vite dev proxy in the middle.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Browser SPA: React 19 + Ant Design 5 (zh_CN) + react-query 5 + axios   │
│ state: QueryClient (staleTime 30s, smart retry, no refetch-on-focus)   │
│ auth gate in App.tsx (status → /setup | me 401 → /login)               │
│ source: frontend/src/main.tsx:10-24                                     │
├─────────────────────────────────────────────────────────────────────────┤
│ Dev proxy (dev only): Vite :5173  ── /api/* ──► Axum :3000              │
├─────────────────────────────────────────────────────────────────────────┤
│ Wire contract: HTTP/JSON over /api/*, session cookie (HttpOnly, Lax)   │
│ 200 array | 200 obj | 201 created | 204 delete                          │
│ Errors: { "error": "<code>", "message": "<text>" }                     │
├─────────────────────────────────────────────────────────────────────────┤
│ Axum backend (Rust, edition 2024)                                       │
│   public_api (health + /auth/*) ── unguarded                            │
│   guarded_api (business routers) ── require_auth (fail-closed 401)      │
│   middleware stack (app.rs build_app):                                   │
│     .layer(cors) → HandleErrorLayer→TimeoutLayer → TraceLayer          │
│     → DefaultBodyLimit → SessionManagerLayer → with_state(AppState)    │
├─────────────────────────────────────────────────────────────────────────┤
│ PostgreSQL 16  (sqlx 0.8, runtime-tokio, tls-rustls, macros)            │
│ 24 SQL migrations → _sqlx_migrations bookkeeping table                  │
│ set_updated_at() trigger installed in migration 001, reused by all       │
└─────────────────────────────────────────────────────────────────────────┘
```

| Layer       | Files of record                              | Key deps                                   |
|-------------|----------------------------------------------|--------------------------------------------|
| UI          | `frontend/src/App.tsx`, `pages/`, `components/` | `react@19`, `antd@^5.29`, `react-query@^5` |
| API client  | `frontend/src/api/index.ts`                  | `axios@^1.18`, 30 s timeout, baseURL `/api`, 401 interceptor |
| HTTP        | `backend/src/main.rs`, `app.rs`              | `axum@0.8.9`, `tower@0.5`, `tower-http@0.7`, `tower-sessions@0.14` |
| Handlers    | `backend/src/handlers/*.rs`                  | one module per resource                   |
| Models      | `backend/src/models/*.rs`                    | `sqlx::FromRow` row + Create/Update DTOs  |
| DB pool     | `backend/src/db/pool.rs`, `helpers.rs`       | `sqlx::PgPoolOptions`                      |
| Schema      | `backend/migrations/*.sql`                   | 22 files, all `TIMESTAMPTZ` + UUID PK      |

---

## 3. Module dependency graph

### 3.1 Backend — 24 routers wired into `/api`

Verified by counting `.nest("/api", …)` calls in
`backend/src/app.rs::build_app` (24 hits; `GET /api/health` is a plain
route). The breakdown: **13 flat** resource routers (clients, projects,
communications, tasks, issues, findings, assets, asset-credentials, files,
phases, people,
deliverables, search) + **10 project-scoped** routers (communications,
tasks, issues, findings, assets, asset-credentials, files, phases, people,
deliverables) +
**1 public `auth_router`** (status/setup/login/logout/me/password). The split is
not just naming: `public_api` (health + auth) is unguarded, while every
router in the table below sits behind `require_auth` (fail-closed session
guard, §5.7). `logout`/`me`/`password` self-guard inside their handlers
(401 without a valid session).

| # | Router (`*_router()`)        | Source                              | Mounted path prefix                                       |
|---|------------------------------|-------------------------------------|-----------------------------------------------------------|
| 1 | `auth_router`                | `handlers/auth.rs:269`              | `/auth/status`, `/auth/setup`, `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/password` — **public** (logout/me/password self-guard) |
| 2 | `clients_router`             | `handlers/clients.rs`               | `/clients`, `/clients/{id}`                               |
| 3 | `projects_router`            | `handlers/projects.rs`              | `/projects`, `/projects/{id}`                             |
| 4 | `communications_router`      | `handlers/communications.rs`        | `/communications/{id}` + `/recent`, `/search`             |
| 5 | `tasks_router`               | `handlers/tasks.rs`                 | `/tasks/{id}`                                             |
| 6 | `issues_router`              | `handlers/issues.rs`                | `/issues/{id}`                                            |
| 7 | `findings_router`            | `handlers/findings.rs`              | `/findings/{id}`                                          |
| 8 | `project_communications_router` | `communications.rs` (nested form) | `/projects/{id}/communications`                           |
| 9 | `project_tasks_router`       |                                     | `/projects/{id}/tasks`                                    |
| 10| `project_issues_router`      | `handlers/issues.rs`                | `/projects/{id}/issues`                                   |
| 11| `project_findings_router`    | `handlers/findings.rs`              | `/projects/{id}/findings`                                 |
| 12| `project_assets_router`      | `handlers/assets.rs`                | `/projects/{id}/assets`                                   |
| 13| `assets_router`              |                                     | `/assets/{id}`                                            |
| 14| `project_asset_credentials_router` | `handlers/asset_credentials.rs` | `/projects/{id}/assets/{asset_id}/credentials`           |
| 15| `asset_credentials_router`   |                                     | `/asset-credentials/{id}`                                 |
| 16| `project_files_router`       | `handlers/files.rs`                 | `/projects/{id}/files` (multipart), `/projects/{id}/links`|
| 17| `files_router`               | `handlers/files.rs`                 | `/files`, `/files/{id}`, `/download`, `/preview`, `/link`, `/link-phase` |
| 18| `project_phases_router`      | `handlers/phases.rs`                | `/projects/{id}/phases`                                   |
| 19| `phases_router`              |                                     | `/phases/{id}`                                            |
| 20| `project_people_router`      | `handlers/people.rs`                | `/projects/{id}/people`, `/projects/{id}/people/reorder`  |
| 21| `people_router`              |                                     | `/people/{id}`, `/people/{id}/flip-side`                  |
| 22| `project_deliverables_router`| `handlers/deliverables.rs`          | `/projects/{id}/deliverables`                             |
| 23| `deliverables_router`        |                                     | `/deliverables/{id}`                                      |
| 24| `search_router`              | `handlers/search.rs`                | `/search?q=…`                                             |

Plus `GET /api/health` mounted as a route (not a nest) inside `public_api`
(`app.rs::health`). Unmatched `/api/*` requests stay on the API's empty
404 path (`api_not_found`) instead of falling through to the SPA.
See §5.5 for why flat + scoped are split into two routers per resource.

### 3.2 Frontend — 6 React Routes

`frontend/src/App.tsx:386-396`:

| Path                                         | Component             | Notes                              |
|----------------------------------------------|-----------------------|------------------------------------|
| `/`                                          | `ProjectBoard`        | Index of all projects              |
| `/files`                                     | `FileLibrary`         | Cross-project file/link library    |
| `/projects/:id`                              | `ProjectDetail`       | Heavy tabbed detail (see §4)       |
| `/projects/:id/communications/:commId`       | `CommunicationDetail` | Markdown-rendered comm record      |
| `/login`                                     | `LoginPage`           | Standalone (no app shell)          |
| `/setup`                                     | `SetupPage`           | First-run account bootstrap        |

`/login` and `/setup` render standalone (no sidebar); the auth bootstrap
effect (status → `/setup`, `/me` 401 → `/login`) and the axios 401
interceptor handle redirects between them and the app. Until the auth
gate resolves, `App` renders a bare spinner instead of the app shell.
Business routes are wrapped in `ErrorBoundary` (`App.tsx:53-116`);
failure renders a `刷新` button that calls `window.location.reload()`.

### 3.3 Backend crate shape

```text
main.rs ── mod db, mod error, mod handlers, mod models, mod state
   │        app.rs (build_app — router shape shared with tests)
   │
   ├── handlers/{clients,projects,communications,tasks,issues,findings,
   │             assets,asset_credentials,files,phases,people,deliverables,
   │             search,auth}.rs
   │             (one *_router() each, except search = flat only,
   │              auth = public + require_auth middleware)
   ├── models/   {client,project,communication,task,issue,finding,asset,
   │              asset_credential,project_file,phase,person,deliverable,
   │              user}.rs
   ├── db/       pool.rs (PgPoolOptions) + helpers.rs (ensure_project_exists,
   │              ensure_asset_in_project, ensure_communication_in_project,
   │              chrono↔time bind helpers)
   ├── error.rs  AppError + IntoResponse  ──► { error, message } envelope
   └── state.rs  AppState { pool }   (cloneable, cheap to share)
```

No cross-handler imports — handlers only talk to `db`, `error`, `models`,
`state`. The shared helpers are `ensure_project_exists` (first await of
every project-scoped handler), `ensure_asset_in_project` (guards the
asset-credential parent asset), and `ensure_communication_in_project`
(guards the optional `communication_id` link on issues/findings).

---

## 4. Two representative data flows

### 4.1 Opening `/projects/:id` (read-heavy)

URL → `/projects/:id` → React Router matches `App.tsx:389` →
`ProjectDetail` mounts (`pages/ProjectDetail.tsx`). On mount it fires
**9 parallel react-query queries** (staleTime 30 s, no refetch-on-focus):

| queryKey                  | queryFn                                | HTTP                                              |
|---------------------------|----------------------------------------|---------------------------------------------------|
| `['project', id]`         | `projectsApi.get(id)`                  | `GET /api/projects/{id}`                          |
| `['client', client_id]`   | `clientsApi.get(client_id)` *          | `GET /api/clients/{client_id}`                    |
| `['communications', id]`  | `communicationsApi.listByProject(id)`  | `GET /api/projects/{id}/communications`           |
| `['tasks', id]`           | `tasksApi.listByProject(id)`           | `GET /api/projects/{id}/tasks`                    |
| `['assets', id]`          | `assetsApi.listByProject(id)`          | `GET /api/projects/{id}/assets`                   |
| `['files', id]`           | `filesApi.listByProject(id)`           | `GET /api/projects/{id}/files`                    |
| `['issues', id]`          | `issuesApi.listByProject(id)`          | `GET /api/projects/{id}/issues`                   |
| `['findings', id]`        | `findingsApi.listByProject(id)`        | `GET /api/projects/{id}/findings`                 |
| `['deliverables', id]`    | `deliverablesApi.listByProject(id)`   | `GET /api/projects/{id}/deliverables`             |

`*` Enabled only after `project.client_id` resolves — a `react-query`
chained query.

The tab bar groups these into **5 aggregated tabs** (2026-08-28 detail-IA
rework): 概览 (`OverviewTab`), 推进 (`GroupedTab`: 阶段 `PhasesTab` /
任务 `TasksTab` / 交付物 `DeliverablesTab`), 客户 (`GroupedTab`: 沟通
`CommunicationsTab` / 客户关切 `IssuesTab` / 产品发现 `FindingsTab`),
资料 (`GroupedTab`: 文件 `FilesTab` / 资产 `AssetsTab`), 成员
(`MembersTab` — filename kept for history). `PhasesTab` owns its own
`['phases', projectId]` query.

Wire path per call: axios (`/api`, 30 s timeout, `api/index.ts:36-39`) → Vite
dev proxy (`/api/*` → `:3000`) → Axum handler →
`ensure_project_exists(...).await?` → `sqlx::query_as!(…)` → `Json(row)` →
react-query caches by key → component re-renders. Every request carries
the session cookie; a lost session triggers the 401 interceptor →
`/login` full-page redirect.

### 4.2 Uploading a file via the Files tab

```text
components/FilesTab.tsx  (Upload onChange — the files tab of ProjectDetail's 资料 group)
  │ filesApi.upload(id, file, description?, tags?)           api/index.ts:155-168
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
| 401  | `unauthorized`     | missing/invalid session (fail-closed guard) or bad login creds |
| 404  | `not_found`        | `AppError::NotFound` or `RowNotFound` |
| 408  | `request_timeout`  | tower `Elapsed` → `AppError::Timeout` |
| 409  | `conflict`         | `AppError::Conflict` (e.g. setup after an account exists) |
| 429  | `rate_limited`     | login throttle: 5 consecutive failures → 15-min lockout |
| 500  | `internal_error`   | everything else; full error logged    |

5xx detail is **never** leaked — `into_response` swaps in a generic message
and emits the real one through `tracing::error!`. Frontend currently
classifies by status range in `classifyApiError` (`api/index.ts:321-344`);
the `error` code in the envelope allows future code-based routing without
backend changes.

### 5.5 Flat + project-scoped routers, two per resource

The 10 dual-mount resources are: communications, tasks, issues, findings,
assets, asset-credentials, files, phases, people, deliverables
(`clients`/`projects` are
top-level only, `search` is flat only, `auth` is public only).
`handlers/files.rs`:

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

- **`ensure_project_exists`** (`db/helpers.rs`) is the first line of
  every project-scoped handler. Returns `AppError::NotFound` → 404
  `not_found` — keeps FK-violation 400s reserved for genuine constraint
  failures, not confused wrong-UUID cases.
- **`ensure_communication_in_project`** (`db/helpers.rs`) guards the
  optional `communication_id` link on issues and findings — the referenced
  communication must exist AND belong to the same project (else 400).
- **Frontend retry** (`main.tsx`): max 3 attempts, exponential
  backoff capped at 10 s, **skips 4xx**, `staleTime 30s`,
  `refetchOnWindowFocus: false`. Mirrors the backend's "4xx is the client's
  fault" stance.
- **Error classification** in `classifyApiError` (`api/index.ts:321-344`)
  maps surviving failures to `ApiErrorKind = 'offline' | 'server' |
  'validation' | 'conflict' | 'unknown'` for UI toast/banner selection
  without parsing the JSON `error` field.

### 5.7 Session auth — fail-closed guard (2026-08-27)

Single local account (username + argon2id password hash in `users`,
migration 022). `app.rs` splits the API surface:

- **`public_api`** — `/api/health`, `/api/auth/status`, `/api/auth/setup`,
  `/api/auth/login`. Nothing else. `setup` works **only while the users
  table is empty** (afterwards 409) — first-run bootstrap.
- **`guarded_api`** — every business router, wrapped in
  `middleware::from_fn_with_state(pool, require_auth)`. The guard resolves
  the session cookie to a `user_id`, re-checks the user still exists in
  `users`, and rejects with 401 otherwise. Fail-closed by construction:
  adding a new `.nest()` to `guarded_api` inherits the guard; a new public
  endpoint must be added to `public_api` explicitly.

Sessions are tower-sessions cookies (HttpOnly, SameSite=Lax, 30-day
sliding expiry) backed by the `session` table in the same Postgres
(`tower-sessions-sqlx-store`, schema `public` via migration 022 — the
store's own `migrate()` is deliberately not used). The cookie is
intentionally **unsigned** (user-approved 2026-08-27): it carries only a
random session id, all state lives server-side, so forgery is a no-op and
sessions survive restarts. There is no `SESSION_SECRET`.

Hardening layered on top (2026-09-06):

- **Login throttle** — `LoginThrottle` in `handlers/auth.rs` (process
  global, held in `AppState`): 5 consecutive failures lock logins for 15
  minutes → `429 rate_limited`; success resets, restart clears. Global on
  purpose: with one account every unknown caller is the same adversary.
- **Session-id rotation** — login/setup call `session.cycle_id()` so a
  pre-login anonymous cookie never survives authentication (session
  fixation); `POST /api/auth/password` cycles again after a change.
- **Password change + revocation** — `POST /api/auth/password` requires
  the current password and revokes every OTHER session of the user via
  the `user_sessions` ownership index (migration 024), which
  `require_auth`/`me` keep refreshed on authenticated use (tower-sessions
  hides the post-cycle id from handlers, so ownership is written on use).
- **No username oracle** — login against an unknown username still runs
  one argon2 verification against a dummy hash, keeping the timing of the
  generic 401 uniform.

Frontend side: `App.tsx` runs an auth-ready gate (`auth/status` → route to
`/setup` if needed; `/auth/me` 401 while not on an auth page → `/login`),
and the axios response interceptor bounces any non-`/auth/*` 401 to
`/login` (guarded against self-reload loops).

**chrono ↔ time bind workaround.** `tower-sessions-sqlx-store` force-enables
sqlx's `time` feature, flipping temporal *bind* inference in `query!`
macros to `time`-crate types while models stay chrono. Output columns are
annotated in SQL (`AS "col: chrono::DateTime<chrono::Utc>"`); bind
parameters go through `db::helpers::{dt_to_offset, date_to_time_date}`
(user-approved 2026-08-27).

---

## 6. Quick reference

| Concern             | File(s) of record                                                  |
|---------------------|--------------------------------------------------------------------|
| Backend entrypoint  | `backend/src/main.rs`, `backend/src/app.rs`                        |
| AppError envelope   | `backend/src/error.rs`                                             |
| Pool + helpers      | `backend/src/db/pool.rs`, `backend/src/db/helpers.rs`              |
| Auth (guard + session) | `backend/src/handlers/auth.rs`, `main.rs` (session layer)       |
| Resource handlers   | `backend/src/handlers/{clients,projects,communications,tasks,issues,findings,assets,asset_credentials,files,phases,people,deliverables,search}.rs` |
| Migrations          | `backend/migrations/20250714000001_*.sql` … `…00024_*.sql` (24 files) |
| Frontend entrypoint | `frontend/src/main.tsx`, `frontend/src/App.tsx`                    |
| Routing             | `frontend/src/App.tsx:386-396`                                     |
| API client          | `frontend/src/api/index.ts`                                        |
| Error classifier    | `frontend/src/api/index.ts:321-344`                                |
| Product brief       | `PRODUCT.md`, `DESIGN.md`                                          |
