# project-manage — Domain Invariants & State Surfaces

This file documents the business rules and cross-cutting state surfaces that
are not obvious from file names or migration filenames alone. Each invariant is
cross-referenced to the SQL migration or Rust source that enforces it. Code
excerpts are kept short and verbatim.

---

## 1. Status state machines

Three independent status fields live in the database as plain `TEXT`. Validation
is enforced in Rust, not in Postgres, so adding a new value is a code-only
change (no migration). Four more columns follow the same pattern:
`people.side` (`team`|`client`, `PersonSide`), `deliverables.status`,
`tasks.priority` (`TaskPriority`), and `projects.tech_approval`
(`TechApprovalStatus`)
(`pending`|`delivered`|`accepted`, `DeliverableStatus`).

### 1.1 `projects.status`

Defined in `backend/src/models/project.rs:19-32`:

```rust
pub mod ProjectStatus {
    pub const IN_PROGRESS: &str = "in_progress";
    pub const COMPLETED:   &str = "completed";
    pub const PAUSED:      &str = "paused";
    pub const ALL: &[&str]  = &[IN_PROGRESS, COMPLETED, PAUSED];
    pub fn is_valid(input: &str) -> bool {
        matches!(input, IN_PROGRESS | COMPLETED | PAUSED)
    }
}
```

DB default is `'in_progress'` (`migrations/20250714000002_init_projects.sql:13`).

| Handler                | Op   | Validates                                |
|------------------------|------|------------------------------------------|
| `projects.rs::list`    | GET  | n/a                                      |
| `projects.rs::get_one` | GET  | n/a                                      |
| `projects.rs::create`  | POST | `is_valid` at line 63 (pre-DB)           |
| `projects.rs::update`  | PUT  | `is_valid` at line 131 (pre-DB, partial) |

Invalid input (anything not in `ALL`) returns `AppError::BadRequest` with HTTP
400 and body `{ "error": "bad_request", "message": "invalid status 'foo', must be one of [...]" }` (`backend/src/error.rs:46-47, 64-68`).

### 1.2 `tasks.status`

Defined in `backend/src/models/task.rs:15-28` with the same shape:

```rust
pub mod TaskStatus {
    pub const CURRENT: &str = "current";
    pub const NEXT:    &str = "next";
    pub const TODO:    &str = "todo";
    pub const ALL: &[&str] = &[CURRENT, NEXT, TODO];
    pub fn is_valid(input: &str) -> bool { matches!(input, CURRENT | NEXT | TODO) }
}
```

DB default is `'todo'` (`migrations/20250714000004_init_tasks.sql:9`). The
list-by-project query orders rows by a hard-coded `CASE status WHEN 'current'
THEN 0 WHEN 'next' THEN 1 WHEN 'todo' THEN 2 ELSE 3 END` (`handlers/tasks.rs:55-61`),
so the board view groups tasks in this fixed order even if the column later
drifts away from the validator.

| Handler                     | Operation | Validation site                       |
|-----------------------------|-----------|---------------------------------------|
| `handlers/tasks.rs::create_for_project` | `POST` | `is_valid` at line 82 (pre-DB)        |
| `handlers/tasks.rs::update`             | `PUT`  | `is_valid` at line 138 (pre-DB)       |

List/get/delete do not touch `status`.

### 1.3 `phases.status`

Deliberately **not validated in Rust today**. Defined in `migrations/007_phases.sql:14`:

```sql
status TEXT NOT NULL DEFAULT 'pending',
```

`handlers/phases.rs::create_for_project` defaults to the literal `"pending"`
(line 77) and `update` does no validation (lines 100-134 forward `status`
straight to `COALESCE`). No `PhaseStatus` module exists. This is a free-form
column; treat new values as opt-in until a `PhaseStatus` module is added.

### 1.4 Error path summary

`AppError::parts()` in `backend/src/error.rs:43-87` maps AppError variants
to HTTP codes:

| Variant                  | HTTP | code                |
|--------------------------|------|---------------------|
| `NotFound(msg)`          | 404  | `not_found`         |
| `BadRequest(msg)`        | 400  | `bad_request`       |
| `Timeout(msg)`           | 408  | `request_timeout`   |
| `Database(RowNotFound)`  | 404  | `not_found`         |
| `Database` unique-viol.  | 400  | `conflict`          |
| `Database` FK-violation  | 400  | `invalid_reference` |
| `Database` check-viol.   | 400  | `check_violation`   |
| `Database` (other)       | 500  | `internal_error` (logged only) |

The 5xx branch logs `tracing::error!(error = ?self, ...)` and emits a generic
`"database error"` to the client (`error.rs:101-108`).

---

## 2. Referential invariants

Every foreign key that touches projects is enumerated below with its on-delete
behavior. Cascades and SET NULLs are enforced at the DB layer; the application
treats them as infallible for the cascade path but maps FK violations on insert
to 400 `invalid_reference`.

### 2.1 Client → project (RESTRICT)

`migrations/20250714000002_init_projects.sql:11`:

```sql
client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
```

`projects.client_id` is `NOT NULL` (`models/project.rs:50`) — an orphaned
project cannot be created by construction. Attempting to delete a client that
still owns projects fails with a Postgres FK violation, which the app surfaces
as 400 `invalid_reference` (`error.rs:65-71`).

### 2.2 Project → child tables (CASCADE)

All seven project-scoped tables cascade on project delete:

| Child table       | FK column    | Migration                          |
|-------------------|--------------|------------------------------------|
| `communications`  | `project_id` | `...0003_init_communications.sql:8`|
| `tasks`           | `project_id` | `...0004_init_tasks.sql:7`         |
| `assets`          | `project_id` | `005_assets.sql:5`                 |
| `project_files`   | `project_id` | `006_project_files.sql:5`          |
| `phases`          | `project_id` | `007_phases.sql:5`                 |
| `people`          | `project_id` | `014_unify_people.sql` (replaces `members`/`client_contacts`) |
| `deliverables`    | `project_id` | `018_deliverables.sql`             |

`phases` also cascades on its own `parent_id` self-reference
(`007_phases.sql:6`), so deleting a parent phase removes its children too.

### 2.3 Project files SET NULL links

Two optional FKs on `project_files` use `ON DELETE SET NULL` so files are
preserved (orphaned but still listed) when their parent disappears:

| FK column          | Target           | Migration                              |
|--------------------|------------------|----------------------------------------|
| `communication_id` | `communications` | `006_project_files.sql:6`              |
| `phase_id`         | `phases`         | `010_project_files_phase_id.sql:1`     |

These are nullable by construction (`project_files.communication_id UUID` with
no `NOT NULL`, same for `phase_id`).

### 2.4 Timestamps

Every mutable table installs a `set_updated_at()` trigger from migration 001
(`migrations/20250714000001_init_clients.sql:23-35`). The trigger runs
`BEFORE UPDATE` and sets `NEW.updated_at = NOW()`; application code never sets
`updated_at` directly. `created_at` is set once by the column's `DEFAULT NOW()`
and is not writable through any handler.

---

## 3. Cross-resource invariants

### 3.1 Project existence gate

Every project-scoped handler invokes `ensure_project_exists(pool, project_id)`
before touching its child tables. Defined in `backend/src/db/helpers.rs:9-22`:

```rust
pub async fn ensure_project_exists(pool: &PgPool, project_id: Uuid) -> AppResult<()> {
    let exists: Option<(Uuid,)> =
        sqlx::query_as("SELECT id FROM projects WHERE id = $1")
            .bind(project_id).fetch_optional(pool).await?;
    if exists.is_none() {
        return Err(AppError::NotFound(format!("project {project_id} not found")));
    }
    Ok(())
}
```

This helper is reused by every project-scoped handler module (the seven
listed below):

| Handler module              | Call sites    |
|-----------------------------|---------------|
| `handlers/assets.rs`        | list, create (+ reorder) |
| `handlers/communications.rs`| list, create             |
| `handlers/deliverables.rs`  | list, create             |
| `handlers/files.rs`         | list, upload, link       |
| `handlers/people.rs`        | list, create, reorder    |
| `handlers/phases.rs`        | list, create             |
| `handlers/tasks.rs`         | list, create             |

Missing project → 404 `not_found` *before* the FK violation would have fired
on insert, so the error code is stable for the UI.

### 3.2 Upload flow

`handlers/files.rs::upload_file` (lines 62-171) performs the disk write
before the DB insert:

1. `ensure_project_exists` (line 67) — 404 early if project is gone.
2. `tokio::fs::create_dir_all("./uploads/{project_id}")` (line 130).
3. `tokio::fs::write(file_path, data)` (line 135).
4. `INSERT INTO project_files ... RETURNING ...` (lines 139-145).
5. On DB `Err`, `tokio::fs::remove_file(file_path)`; cleanup failure is logged
   via `tracing::warn!` (lines 158-167) but never bubbles up.

Per `progress.md` (2026-07-15): "上传数据库写入失败时清理已落盘文件，并记录文件删除失败日志".

### 3.3 Delete project flow

`handlers/projects.rs::remove` (lines 171-200):

```rust
let file_paths: Vec<(String,)> = sqlx::query_as(
    "SELECT file_path FROM project_files WHERE project_id = $1"
).bind(id).fetch_all(&pool).await?;

let upload_dir = format!("./uploads/{id}");
if let Err(error) = tokio::fs::remove_dir_all(&upload_dir).await {
    tracing::warn!(project_id = %id, path = %upload_dir,
                   file_count = file_paths.len(), error = %error,
                   "failed to remove project upload directory");
}

let res = sqlx::query!("DELETE FROM projects WHERE id = $1", id).execute(&pool).await?;
```

The DB cascade removes all child rows (communications, tasks, assets, files,
phases, people, deliverables). The on-disk `./uploads/{project_id}/` directory
is removed best-effort; failure is logged at WARN level but does not abort
the request. The `file_paths` query is fetched only to populate the WARN
log's `file_count` — the cleanup itself uses `remove_dir_all`, not per-file
removal.

---

## 4. Idempotency

### 4.1 Migrations

`sqlx::migrate::Migrator` tracks applied migrations in a `_sqlx_migrations`
table, so each migration runs at most once per database. Within a migration,
the first statements are idempotent so a partial failure can be retried safely
(`backend/README.md:79-81`):

- `CREATE TABLE IF NOT EXISTS` (every `migrations/*.sql` table DDL).
- `CREATE OR REPLACE FUNCTION set_updated_at()` (migration 001:23).
- `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` (every updated_at installer).

### 4.2 Reads

All `GET` handlers are pure SQL reads against `PgPool`. Safe to retry.

### 4.3 Updates

Update payloads (`UpdateProject`, `UpdateTask`, `UpdatePhase`,
`UpdateCommunication`, `UpdateFile`, `UpdateClient`) are all-`Option` DTOs.
Handlers use `COALESCE($n, column)` so omitted fields leave the column
untouched. Example from `handlers/projects.rs:142-147`:

```sql
UPDATE projects
   SET client_id = COALESCE($2, client_id),
       name      = COALESCE($3, name),
       status    = COALESCE($4, status),
       phase     = COALESCE($5, phase),
       goals     = COALESCE($6, goals)
 WHERE id = $1
```

`created_at` is never listed in any `UPDATE` statement (verified across all
seven update handlers); `set_updated_at()` bumps `updated_at` on every
UPDATE. Caveat: the partial-update pattern cannot *clear* a non-nullable
value to NULL — `null` is indistinguishable from omission in the JSON.
Documented at `models/project.rs:62-64` and `models/client.rs`; a known
limitation.

---

## 5. Validation surface

Two rules are checked in the handler before any DB call:

| Rule                                      | Handlers (excerpt)                                                                                                                                  |
|-------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
| Empty/whitespace `name` (or `title`, `content`) | `projects.rs:58, 125-129`; `tasks.rs:77, 132-136`; `phases.rs:57`; `communications.rs:84, 133-137`; `clients.rs` create/update.                |
| Unknown enum value against a const list | `projects.rs` (status, tech_approval); `tasks.rs` (status, priority); `people.rs` (side); `deliverables.rs` (status). Each returns `AppError::BadRequest` with `"… must be one of […]"`. |

Phase `status` is not validated (see §1.3). Description/tags and other
free-form fields are stored as-is. The empty-string check uses
`.trim().is_empty()`, so `"   "` is also rejected.

---

## 6. Multi-user assumptions (deliberate MVP scope)

The backend is explicitly a **single-user internal tool**. There is no auth
layer. Evidence:

- `backend/README.md:3` — "Rust + Axum + sqlx + PostgreSQL. Single user,
  internal-tool MVP."
- `backend/src/main.rs` middleware stack has no auth layer; only body limit
  → trace → timeout → CORS.
- Pool sized for single user: `max_connections = 10` in
  `backend/src/db/pool.rs:23`, with a comment noting it should be revisited
  if the deployment moves behind a load balancer.

`AppError` classification exists (`backend/src/error.rs`) but no login flow,
session, JWT, or user-scoping column on any table exists or is planned.
Deliberate scope choice, not a missing feature.

Downstream implication: every record is implicitly globally visible. Adding
multi-tenancy later will require a `user_id`/`org_id` column on each table
plus an auth extractor — there is no soft hook today.

---

## 7. Future invariants hinted in code

`migrations/20250714000001_init_clients.sql:3-7` documents the deliberate
deferral of normalization:

```sql
-- `products` is stored as TEXT[] to keep the MVP flat; upgrade to a
-- normalized relation only when filtering/search by that field becomes a
-- real requirement.
```

Three columns are kept as `TEXT[] NOT NULL DEFAULT '{}'` today:

| Column              | Table           | Source                              |
|---------------------|-----------------|-------------------------------------|
| `products`          | `clients`       | `001_init_clients.sql:15`           |
| `goals`             | `projects`      | `...0002_init_projects.sql:15`      |
| `tags`              | `project_files` | `006_project_files.sql:12`          |

No GIN index, no join table, no normalized lookup exists. Migration to a
`product_tags` / `goal_tags` join table is gated on a real filtering/search
requirement surfacing in the UI; until then, the arrays are the source of
truth and models treat them as opaque `Vec<String>` payloads.
