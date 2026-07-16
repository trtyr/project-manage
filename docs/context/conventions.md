# sec-tracker — Conventions

Project-specific deviations and patterns. Generic Rust / React / PostgreSQL
idioms are intentionally omitted — only the rules you have to know to read or
extend this codebase live here.

Conventions are derived from `backend/src/error.rs`, `backend/src/db/helpers.rs`,
the handler/model modules, migrations, `frontend/src/api/index.ts`,
`frontend/src/main.tsx`, and `frontend/src/App.tsx`. If a pattern disagrees with
a more general rule on the wider web, this file wins for sec-tracker.

## 1. Naming

### 1.1 Backend modules — one Rust file per resource

- Handler files live in `backend/src/handlers/<resource>.rs`, one per resource.
  The set is fixed: `clients`, `projects`, `communications`, `tasks`, `assets`,
  `files`, `phases`, `members`, `contacts`. All names are lowercase, singular,
  no underscores.
- Model files live in `backend/src/models/<resource>.rs`, one per resource,
  and each module exposes three re-exports:
  - `Row` — DB-shape struct, `#[derive(sqlx::FromRow)]` with `pub` fields
    including `id` / `created_at` / `updated_at`.
  - `CreateRow` — payload for `POST`; no `id` / `created_at` /
    `updated_at`. URL-derived fields like `project_id` also stay out.
  - `UpdateRow` — payload for `PUT`; every field is `Option<T>` with
    `#[serde(default)]` so partial updates work.
  Wire examples: `Client`, `Project`, `Communication`, `Task`, `Asset`,
  `Member`, `Phase`, `ProjectFile`, `ClientContact`. Singular noun, PascalCase.
- Re-export pattern in `backend/src/models/mod.rs`:
  `pub use <resource>::{Row, CreateRow, UpdateRow};` so handlers import via
  `crate::models::…`. Do not add unlisted extras without updating `mod.rs`.
- Handler modules expose `pub fn <resource>_router() -> Router<AppState>`
  (and `pub fn project_<resource>_router()` for the nested `/projects/:id/...`
  form). `backend/src/handlers/mod.rs` re-exports every router; mounting lives
  in `main.rs` as `.nest("/api", <router>())`.
- File names: lowercase, snake-free for resources (`projects.rs`, not
  `project.rs` … actually `handlers/projects.rs` but `models/project.rs` is
  the existing convention — follow what is already there for that folder
  before adding a new resource).

### 1.2 Status enums — `pub mod` of `&str` constants

Status fields do **not** use a Rust enum. Each lives in its own `pub mod`
(scope names match the PascalCase field type so they read like types):

```rust
// backend/src/models/project.rs
#[allow(non_snake_case)]
pub mod ProjectStatus {
    pub const IN_PROGRESS: &str = "in_progress";
    pub const COMPLETED:   &str = "completed";
    pub const PAUSED:      &str = "paused";
    pub const ALL: &[&str] = &[IN_PROGRESS, COMPLETED, PAUSED];
    pub fn is_valid(input: &str) -> bool {
        matches!(input, IN_PROGRESS | COMPLETED | PAUSED)
    }
}
```

- Currently two: `ProjectStatus` (`in_progress` / `completed` / `paused`)
  and `TaskStatus` (`current` / `next` / `todo`).
- Every status module MUST expose `pub const ALL: &[&str]` and
  `pub fn is_valid(input: &str) -> bool`. Handlers build their own error
  message referencing `ALL`; the type itself stays data-only.
- `#[allow(non_snake_case)]` on the module is required because the inner
  constants use uppercase names.

### 1.3 Frontend mirrors

- `frontend/src/types/index.ts` mirrors backend row / Create / Update shapes
  using `PascalCase` interfaces (`Client`, `CreateClient`, `UpdateClient`).
- Status fields become string unions mirroring `ALL`:
  `export type ProjectStatus = 'in_progress' | 'completed' | 'paused'`.
- Two shared primitives: `UUID = string`, `ISODateTime = string` (and
  `ISODate = string` for `NaiveDate` columns). Do not introduce `Date`
  wrappers.
- `frontend/src/api/index.ts` exposes one axios-based object per resource,
  named exactly `<resource>Api` (camelCase, no separator): `clientsApi`,
  `projectsApi`, `communicationsApi`, `tasksApi`, `assetsApi`, `filesApi`,
  `phasesApi`, `membersApi`, `contactsApi`, `healthApi`.
- API methods return the unwrapped body: `http.get<X>(...).then(r => r.data)`.
  Every method takes an explicit `string` id where applicable; no opaque
  type wrappers.

## 2. Error handling

### 2.1 The single error type

Every handler returns `AppResult<T>` (alias for `std::result::Result<T, AppError>`)
from `backend/src/error.rs`. There are exactly four variants:

| Variant                | Caused by                              |
|------------------------|----------------------------------------|
| `NotFound(String)`     | Hand-rolled 404, e.g. project guard    |
| `BadRequest(String)`   | Hand-rolled 400, e.g. empty content    |
| `Database(sqlx::Error)`| From `?` on any sqlx call              |
| `Timeout(String)`      | `tower::timeout` middleware rejection  |

`sqlx::Error::RowNotFound` is intercepted in `AppError::parts()` and remapped
to `404 not_found`, so handlers do not need to catch it themselves.

### 2.2 Response shape

`AppError` implements `IntoResponse` and always emits:

```json
{ "error": "<machine_code>", "message": "<human_text>" }
```

with these mappings:

| Internal cause                       | Status | `error` code        | `message`                              |
|--------------------------------------|-------:|---------------------|----------------------------------------|
| `NotFound`                           |    404 | `not_found`         | original message                       |
| `BadRequest`                         |    400 | `bad_request`       | original message                       |
| `Database(RowNotFound)`              |    404 | `not_found`         | `"resource not found"`                 |
| `Database(unique violation)`         |    400 | `conflict`          | `"记录已存在或关联数据不存在"`         |
| `Database(foreign key violation)`    |    400 | `invalid_reference` | `"记录已存在或关联数据不存在"`         |
| `Database(check violation)`          |    400 | `check_violation`   | `format!("check constraint violated: {}", db_err.message())` |
| `Database(other)`                    |    500 | `internal_error`    | `"database error"`                     |
| `Timeout`                            |    408 | `request_timeout`   | original message                       |

### 2.3 5xx rules

- For any `status.is_server_error()` response, `IntoResponse` logs the
  **full** error via `tracing::error!(error = ?self, "request failed with 5xx")`
  and emits the generic client message only — no internal detail leaks.
- Conflict / FK / check codes get the friendly Chinese message above so the
  Ant Design UI can render it without translation.

## 3. Validation pattern

### 3.1 Project-scoped handlers MUST guard first

Any handler routed under `/api/projects/:project_id/...` calls
`crate::db::helpers::ensure_project_exists(&pool, project_id).await?` as its
**first** await. The helper returns `AppError::NotFound("project <uuid> not found")`
if the project is missing, so the cascade is `404 → 400 → ...` instead of
`500 → 400 → ...` on FK violations.

The 7 handlers that share this guard today:
`communications`, `tasks`, `assets`, `files`, `phases`, `members`, `contacts`.

If you add a new project-scoped resource, add the call here too — do not
rely on the FK to do it.

### 3.2 Status fields validated before write

Project and task status fields are validated before INSERT/UPDATE using
`ProjectStatus::is_valid` / `TaskStatus::is_valid`. Handlers construct the
error message using `ProjectStatus::ALL` / `TaskStatus::ALL` so the message
stays in sync with the module. A status from `CreateRow` / `UpdateRow` that
fails validation returns `AppError::BadRequest(...)`; do not let invalid
strings reach the DB.

## 4. Response status codes

| Action                | Status | Body                              |
|-----------------------|-------:|-----------------------------------|
| `GET` collection      |    200 | `Json(Vec<Row>)`                  |
| `GET` single row      |    200 | `Json(Row)`                       |
| `POST` create         |    201 | `(StatusCode::CREATED, Json(row))`|
| `PUT` update          |    200 | `Json(Row)` of the updated row    |
| `DELETE`              |    204 | `StatusCode::NO_CONTENT`          |

A handler that mutates plus returns the row therefore uses
`Ok((StatusCode::CREATED, Json(row)))`. A pure delete uses
`Ok(StatusCode::NO_CONTENT)`. Do not return bodies on 204.

## 5. DB conventions

### 5.1 Table shape

Every application table follows the same skeleton:

```sql
id          UUID         PRIMARY KEY DEFAULT gen_random_uuid()
created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
```

`updated_at` is maintained by the shared `set_updated_at()` trigger installed
in migration `20250714000001_init_clients.sql`. Subsequent tables declare
`EXECUTE FUNCTION set_updated_at()` in their `CREATE TABLE`; do not write
application-side timestamps.

### 5.2 Migration conventions

- Naming: `<timestamp>_<name>.sql` for the first batch (UTC seconds,
  e.g. `20250714000001_init_clients.sql` → `20250714000004_init_tasks.sql`).
  After migration 004 the project switched to a shorter ordinal scheme
  (`005_assets.sql`, `006_project_files.sql`, …). Follow whichever pattern
  is already used in chronological order; do not renumber old files.
- Idempotency is mandatory: every migration must be safely re-runnable.
  - Tables: `CREATE TABLE IF NOT EXISTS …`.
  - Functions / triggers: `CREATE OR REPLACE FUNCTION …` /
    `DROP TRIGGER IF EXISTS …` + `CREATE TRIGGER …`.
  - Column additions: `ALTER TABLE … ADD COLUMN IF NOT EXISTS …`.
- Migrations are applied at runtime via `sqlx::migrate!()` against
  `./migrations` (relative to `backend/`). Do not require operators to run
  SQL by hand.

## 6. Frontend conventions

### 6.1 Error classification

Components must never parse HTTP status codes directly. They use
`classifyApiError(err): ApiErrorInfo` from `frontend/src/api/index.ts`,
which returns `{ kind, message, status? }` with
`kind ∈ 'offline' | 'server' | 'validation' | 'conflict' | 'unknown'`:

- `!err.response` → `'offline'` (network / DNS / CORS / timeout).
- `status` in `[500, 600)` → `'server'`.
- `status === 400` or `status === 422` → `'validation'`.
- `status === 409` → `'conflict'` (kept for future use; today's backend
  emits `400 conflict` for unique violations, so classify treats 409
  as a distinct conflict rather than validation).
- otherwise → `'unknown'`.

### 6.2 React Query configuration

Defined once in `frontend/src/main.tsx` on the singleton `QueryClient`:

- `retry`: skip when `error.response.status` is in `[400, 500)`; cap at
  3 retries.
- `retryDelay`: `Math.min(1000 * 2 ** attempt, 10000)` — exponential,
  capped at 10 s.
- `staleTime`: `30_000` ms (30 s).
- `refetchOnWindowFocus`: `false`.

Page / tab components obtain data via `useQuery({ queryKey, queryFn })`
where `queryFn` is an `<resource>Api` method. Do not introduce a parallel
data-fetching mechanism.

### 6.3 ErrorBoundary

A class-component `ErrorBoundary` is mounted at the App root in
`frontend/src/App.tsx`, wrapping `<Routes>`. On error it logs via
`console.error` and renders a reload button — it never embeds the raw
error text. Keep the boundary there; do not add per-page boundaries that
also log to the console (duplicate noise).

### 6.4 Theme persistence

Light / dark toggle state is stored under `localStorage` key `'theme'`
(values `'light'` / `'dark'`). `App.tsx` reads on mount with a fallback
to `matchMedia('(prefers-color-scheme: dark)')`. Do not store the toggle
state anywhere else (cookies, in-memory only, etc.).

## 7. Logging

- `tracing::warn!` is the level for **recoverable** issues:
  missing/invalid env vars, invalid CORS origin entries, retry-exhausted
  pool / migration attempts, on-disk file cleanup failures after a
  successful DB write, bad uploads where the DB row was created first
  (see upload flow cleanup — see `progress.md` 2026-07-15).
- `tracing::error!` is reserved for **5xx responses** (emitted once per
  error from `AppError::IntoResponse`) and unavoidable cleanup failures
  during upload failure handling. It is not used for routine validation
  errors — those are 4xx and the client handles them.
- The default filter at startup is
  `info,sec_tracker_backend=debug,sqlx=warn` (configurable via `RUST_LOG`).
