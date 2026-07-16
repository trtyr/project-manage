# Database — sec-tracker

PostgreSQL 16 with sqlx 0.8 as the access layer. This document covers the
engine, migration inventory, schema conventions, domain ER, query patterns,
and operational notes.

## 1. Engine and access layer

- **Engine:** PostgreSQL 16. Connection string default
  `postgres://localhost:5432/sec_tracker`, sourced from `DATABASE_URL` at
  runtime (via `dotenvy`) and from `backend/.cargo/config.toml` at build
  time so `sqlx::query!` macros resolve without manual export.
- **Driver crate:**
  `sqlx = { version = "0.8", features = ["runtime-tokio", "tls-rustls",
  "postgres", "chrono", "uuid", "macros", "migrate"] }`
  (`backend/Cargo.toml`). The `macros` feature enables compile-time-checked
  `sqlx::query_as!`; `migrate` enables `Migrator::new` /
  `migrate::Migrator::run`. `tls-rustls` speaks TLS without OpenSSL.
- **Pool factory:** `backend/src/db/pool.rs` → `build_pool()`. Conservative
  timeouts for an internal single-user tool:

  | Option | Value | Why |
  |--------|-------|-----|
  | `max_connections` | `10` | headroom for single-user MVP |
  | `acquire_timeout` | `5s` | fast-fail under contention |
  | `idle_timeout` | `10min` (`600s`) | keep connections warm |
  | `max_lifetime` | `30min` (`1800s`) | drop long-lived connections |

- **Migrations:** applied **at boot, at runtime**, not compile-time. In
  `backend/src/main.rs::run_migrations_with_retry`:

  ```rust
  let migrator = migrate::Migrator::new(std::path::Path::new("./migrations"))
      .await
      .expect("failed to load migrations");
  retry_with_backoff("run_migrations", || migrator.run(pool)).await
  ```

  The runtime form is preferred over `sqlx::migrate!()` so the SQL files
  stay readable and diffable in `git` (see `main.rs:288-294`).
- **Startup resilience:** `retry_with_backoff` wraps both pool construction
  and migrations with exponential backoff `[1, 2, 4, 8, 16]` seconds —
  six attempts total per step — so a transient Postgres outage at startup
  does not kill the process.

## 2. Migration inventory

Eleven SQL files in `backend/migrations/`, applied in lexicographic order.
Each row below lists the table created (or altered), key columns, foreign
keys, ON DELETE behavior, and indexes.

| # | File | Table (ALTER) | Key columns | FKs (ON DELETE) | Indexes / triggers |
|---|------|---------------|-------------|-----------------|--------------------|
| 001 | `…00001_init_clients.sql` | `clients` | `name`, `contact_person`, `contact_info`, `notes`, `products TEXT[]`, `security_concerns TEXT[]`, `background_info`, `created_at`, `updated_at` | — | `trg_clients_updated_at` |
| 002 | `…00002_init_projects.sql` | `projects` | `client_id`, `name`, `status TEXT DEFAULT 'in_progress'`, `phase`, `goals TEXT[]` | `client_id REFERENCES clients(id) ON DELETE RESTRICT` | `idx_projects_client_id`; `trg_projects_updated_at` |
| 003 | `…00003_init_communications.sql` | `communications` | `project_id`, `content`, `occurred_at TIMESTAMPTZ`, `participants`, `conclusion`, `created_at` | `project_id REFERENCES projects(id) ON DELETE CASCADE` | `idx_communications_project_id`; `idx_communications_occurred_at (DESC)` |
| 004 | `…00004_init_tasks.sql` | `tasks` | `project_id`, `title`, `status TEXT DEFAULT 'todo'`, `planned_date DATE`, `created_at`, `updated_at` | `project_id REFERENCES projects(id) ON DELETE CASCADE` | `idx_tasks_project_id`, `idx_tasks_status`; `trg_tasks_updated_at` |
| 005 | `005_assets.sql` | `assets` | `project_id`, `name`, `asset_type TEXT DEFAULT 'other'`, `value`, `description`, `created_at`, `updated_at` | `project_id REFERENCES projects(id) ON DELETE CASCADE` | `assets_project_id_idx` |
| 006 | `006_project_files.sql` | `project_files` | `project_id`, `communication_id` (nullable), `original_name`, `stored_name`, `mime_type`, `file_size BIGINT`, `description`, `tags TEXT[]`, `file_path`, `created_at` | `project_id ... CASCADE`; `communication_id ... SET NULL` | `project_files_project_id_idx`, `project_files_communication_id_idx` |
| 007 | `007_phases.sql` | `phases` | `project_id`, `parent_id` (self-ref, nullable), `name`, `description`, `sort_order INTEGER DEFAULT 0`, `planned_start/end`, `actual_start/end`, `status TEXT DEFAULT 'pending'`, `created_at`, `updated_at` | `project_id ... CASCADE`; `parent_id REFERENCES phases(id) ON DELETE CASCADE` | `phases_project_id_idx`, `phases_parent_id_idx` |
| 008 | `008_members.sql` | `members` | `project_id`, `role`, `name`, `notes`, `created_at` | `project_id ... CASCADE` | `members_project_id_idx` |
| 009 | `009_client_contacts.sql` | `client_contacts` | `project_id`, `name`, `notes`, `created_at` | `project_id ... CASCADE` | `client_contacts_project_id_idx` |
| 010 | `010_project_files_phase_id.sql` | alter `project_files` | adds `phase_id UUID` | `phase_id REFERENCES phases(id) ON DELETE SET NULL` | `idx_project_files_phase_id` |
| 011 | `011_project_files_source_type.sql` | alter `project_files` | adds `source_type TEXT DEFAULT 'file'`, `url TEXT` | — | — |

### Highlights

- **001 — `clients` and the shared trigger.** Migration 001 creates
  `clients` and installs the `set_updated_at()` PL/pgSQL function that every
  subsequent table with an `updated_at` column can reuse. `clients` is the
  only table with `products`, `security_concerns`, `background_info`.
- **002 — `projects`** is the only FK relationship that does NOT cascade.
  `client_id ... ON DELETE RESTRICT` blocks accidental orphaning: a client
  cannot be removed while projects point at it.
- **003 — `communications`** is CASCADE on project delete (comms are
  project-scoped ephemeral logs) and gets a second index on
  `(occurred_at DESC)` for time-ordered listings.
- **004 — `tasks`** gets a small extra index on `status` for filtering the
  kanban-style columns `current | next | todo`.
- **005–009** are uniformly `project_id ... ON DELETE CASCADE`: deleting a
  project removes its tasks, assets, files, phases, members, and contacts
  in one stroke.
- **006 — `project_files`** is the first table with an *optional* FK:
  `communication_id ... ON DELETE SET NULL` lets files survive the comm
  they were attached to.
- **007 — `phases`** carries the only self-referencing FK in the schema:
  `parent_id REFERENCES phases(id) ON DELETE CASCADE` builds the
  大阶段 / 小阶段 tree, dropping children with their parent.
- **010 — extend `project_files`.** Adds the optional `phase_id` with the
  same `SET NULL` semantics used for `communication_id` so files can be
  linked to a phase without becoming owned by it.
- **011 — link-only entries.** Adds `source_type TEXT DEFAULT 'file'` and
  `url TEXT`. `POST /api/projects/:id/links` inserts rows with
  `source_type='link'`, empty `stored_name`, `mime_type='text/uri-list'`,
  `file_size=0`, `file_path=''`, and the URL stored in `url`. File rows
  and link rows are unified through one `project_files` table.

## 3. Schema conventions

- **Primary key:** every table uses
  `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`. No SERIAL/IDENTITY
  anywhere — IDs stay portable and client-generable.
- **Timestamps:** `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` on every
  table. `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` is present on
  `clients`, `projects`, `tasks`, `assets`, `phases`. The
  `set_updated_at()` trigger created in migration 001 is explicitly
  attached in 001, 002, and 004 (the other tables with `updated_at`
  historically had it maintained by the application layer — keep this in
  mind if you add a BEFORE-UPDATE trigger later).
- **Tables without `updated_at`:** `communications`, `project_files`,
  `members`, `client_contacts`. Each is append-mostly or log-shaped, so
  the trigger would be redundant. `communications` omits `updated_at` by
  design — its temporal key is `occurred_at`, not `updated_at`.
- **Status columns are `TEXT`, not `ENUM`.** `projects.status`,
  `tasks.status`, `phases.status`, `assets.asset_type`,
  `project_files.source_type` are all `TEXT`. Adding a new value does not
  require a migration — the Postgres ENUM upgrade dance is avoided.
- **Validation lives in the Rust layer.** Allowed sets are constants and
  an `is_valid` predicate per resource:
  - `ProjectStatus::ALL = ["in_progress", "completed", "paused"]`
    (`models/project.rs`).
  - `TaskStatus::ALL = ["current", "next", "todo"]` (`models/task.rs`).
  - Handlers reject unrecognised statuses with `AppError::BadRequest`.
- **Arrays:** `TEXT[]` is used for `clients.products`,
  `clients.security_concerns`, `projects.goals`, `project_files.tags`.
  Migration 001 fixes the upgrade path inline:

  > "`products`, `security_concerns` are stored as TEXT[] to keep the MVP
  > flat; upgrade to a normalized relation only when filtering/search
  > by those fields becomes a real requirement."

  Treat this as a deliberate, ongoing trade-off — do not normalise
  pre-emptively.
- **CASCADE vs RESTRICT split:** only `clients → projects` is RESTRICT;
  everything off `projects` is CASCADE;
  `project_files.{communication_id, phase_id}` are SET NULL because
  files should outlive their optional attachments.

## 4. Domain ER diagram

```text
                         clients
                            │ 1
              ┌─────────────┴─────────────┐
              │                           │
          RESTRICT                     products TEXT[]
              │ N                       security_concerns TEXT[]
              ▼                           background_info
          projects
              │ 1
   ┌──────────┼──────────┬──────────┬──────────┬──────────┬──────────┐
   │ N        │ N        │ N        │ N        │ N        │ N        │ N
   ▼          ▼          ▼          ▼          ▼          ▼          ▼
 communi-    tasks      assets   project_    phases    members   client_
 cations                                       (self)               contacts
  CASCADE    CASCADE    CASCADE   CASCADE     CASCADE   CASCADE   CASCADE
              ▲                       ▲    ▲
              │                       │    │
              │ SET NULL              │    │ SET NULL
              │   comm_id ────────────┘    │
              └──────────────── phase_id ──┘
                                         (self: parent_id CASCADE)
```

ASCII summary lines:

```text
clients  ──<  projects   (ON DELETE RESTRICT)
projects ──<  communications                (ON DELETE CASCADE)
projects ──<  tasks                         (ON DELETE CASCADE)
projects ──<  assets                        (ON DELETE CASCADE)
projects ──<  project_files                 (ON DELETE CASCADE)
projects ──<  phases                        (ON DELETE CASCADE)
projects ──<  members                       (ON DELETE CASCADE)
projects ──<  client_contacts               (ON DELETE CASCADE)
phases    ──<  phases  (parent_id, ON DELETE CASCADE)
communications >── project_files.communication_id (nullable, SET NULL)
phases          >── project_files.phase_id         (nullable, SET NULL)
```

Every project-scoped resource is `N:1` under `projects`. Only `phases` is
recursive (self-FK on `parent_id`). Only `project_files` has secondary
optional FKs to `communications` and `phases`.

## 5. Query patterns

Two flavours of query coexist in `backend/src/handlers/*`:

- **`sqlx::query_as!(Row, "...", binds...)`** — compile-time-checked.
  Used when the SQL is a literal string with no concatenation. Backed by
  `sqlx-cli`'s offline mode / `.cargo/config.toml`'s `DATABASE_URL`.
  Examples: `clients::list`, `projects::{list,get,create,update}`,
  `communications::{list,get,create,update}`,
  `tasks::{list,get,create,update}`. Add a column to the SQL and forget
  to update the `Row` struct — the macro names the missing field.
- **`sqlx::query_as::<_, Row>("...", binds...)`** — runtime-only. Used
  when the SQL spans multiple string fragments (`\`-joined) and
  `query_as!` would complain, or when the row struct references types
  the macro cannot resolve. Examples: `files.rs` (most queries,
  including the dynamic UPDATE that uses `COALESCE` for `description` and
  `tags`), `assets.rs`, `contacts.rs`, `members.rs`, `phases.rs`, and
  the `CommunicationWithProject` joins in `communications.rs`.

The non-`!` form is also used for `db/helpers.rs::ensure_project_exists`,
which runs a single-column `SELECT id FROM projects WHERE id = $1`.
Treating that as runtime-only avoids adding `.sql` data the offline
cache has to track.

**Rule of thumb:** prefer `query_as!` for stable, top-level resource
handlers; fall back to `query_as::<_, _>` whenever the SQL spans
multiple lines or references row structs that mix nullable/synthetic
columns (e.g. `join ... p.name AS project_name` in `files::list_all`).

### Per-resource flavour map

| Handler module | Default flavour | Notes |
|----------------|-----------------|-------|
| `clients.rs` | `query_as!` | all four endpoints |
| `projects.rs` | `query_as!` | all four; reads `goals AS "goals!: Vec<String>"` to assert the array type at compile time |
| `communications.rs` | `query_as!` for project-scoped CRUD; `query_as::<_, CommunicationWithProject>` for `list_all` and similar joins | projection differs from the row type |
| `tasks.rs` | `query_as!` | all four endpoints |
| `assets.rs` | `query_as::<_, Asset>` | multi-line `\`-joined SQL |
| `contacts.rs` | `query_as::<_, ClientContact>` | same shape |
| `members.rs` | `query_as::<_, Member>` | same shape |
| `phases.rs` | `query_as::<_, Phase>` | same shape, including self-FK parent reads |
| `files.rs` | `query_as::<_, ProjectFile>` / `query_as::<_, FileWithProject>` | almost every query is multi-line; the `UPDATE` with `COALESCE` cannot be a macro literal |

## 6. Migration bootstrap and idempotency

- The migrator is loaded once at boot from `./migrations`, then
  `migrator.run(pool)` is called. sqlx maintains a `_sqlx_migrations`
  bookkeeping table recording which filenames + checksums have already
  been applied.
- **Idempotency is mandatory.** Because `Migrator::run` is idempotent
  against `_sqlx_migrations`, retries against a partial batch are safe.
  `run_migrations_with_retry` will not re-apply migrations it has
  already committed, and a crash mid-batch resumes from the last
  successful row. This is what lets `retry_with_backoff` retry the whole
  `migrator.run` on a transient connection drop.
- Triggers and trigger-supporting functions use `DROP TRIGGER IF EXISTS`
  combined with `CREATE OR REPLACE FUNCTION` (migrations 001, 002, 004)
  so re-running a stale migration against a partially rebuilt database
  does not blow up. Subsequent migrations should follow the same
  pattern when they introduce re-creatable objects (functions, types,
  triggers).
- New migrations follow `NNN_short_name.sql` (existing scheme:
  `005_…`, `006_…`, … `011_…`) and are discovered by lexicographic order
  at boot.

### Authoring checklist for a new migration

1. Pick a number one higher than the current max (`012_…`) and a
   snake_case filename that matches the table or alter.
2. Use `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` for
   new objects so re-running on a stale DB is harmless.
3. If you create or replace a trigger, follow the
   `DROP TRIGGER IF EXISTS trg_<table>_updated_at ON <table>; CREATE
   TRIGGER … EXECUTE FUNCTION set_updated_at();` shape from migrations
   001 / 002 / 004.
4. Wrap new FKs with the correct `ON DELETE` semantics: RESTRICT only at
   the `clients → projects` boundary, CASCADE for everything hanging off
   `projects`, SET NULL for the optional `communication_id` /
   `phase_id` attachments on `project_files`.
5. Do not introduce Postgres ENUMs. Use `TEXT` for any status/type field
   and validate in the Rust layer (`*Status::is_valid`).
6. Do not normalise a `TEXT[]` column pre-emptively — wait for a real
   filter/search requirement (see migration 001's inline comment).
7. Verify by running `cargo run` against a fresh
   `postgres://localhost:5432/sec_tracker` and confirm
   `_sqlx_migrations` records the new filename and checksum.

## 7. Operational notes

- **`set_updated_at()` is the single source of trigger logic.** Defined
  once in migration 001, reused by the triggers in 001, 002, 004 via
  `EXECUTE FUNCTION set_updated_at()`. The body from migration 001:

  ```sql
  CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER AS $$
  BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
  ```

  If you add an `updated_at` column to a table that does not yet have
  the trigger attached (e.g. `assets`, `phases` historically had
  `updated_at` maintained by the application layer), follow the same
  `DROP TRIGGER IF EXISTS trg_<table>_updated_at ON <table>; CREATE
  TRIGGER trg_<table>_updated_at BEFORE UPDATE ON <table> FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();` pattern.
- **`TEXT[]` is a deliberate trade-off.** `clients.products`,
  `clients.security_concerns`, `projects.goals`, `project_files.tags`
  are stored as `TEXT[] NOT NULL DEFAULT '{}'`. Migration 001's comment
  locks the upgrade path: **normalise into a join table only when
  filtering or search across those fields becomes a real requirement.**
  If you find yourself reaching for `ANY()` / `@>` operators in WHERE
  clauses, that is the signal to normalise, not before.
- **`project_files` is two resources in one.** It stores both uploaded
  blobs (`source_type='file'`) and external links (`source_type='link'`,
  `url` populated, `file_size=0`, `mime_type='text/uri-list'`,
  `file_path=''`). The link branch (`POST /api/projects/:id/links`)
  inserts a row directly with `source_type='link'` so listing code reads
  one table. Listing queries must read all of `source_type`, `url`,
  `stored_name`, `file_path`, `mime_type`, `file_size` together — the
  `FileMeta` DTO flattens the difference for the frontend.
- **`assets.asset_type` is free TEXT** by design
  ("flexible by design — asset_type is free TEXT so users can invent
  categories"). Do not add a CHECK constraint expecting the Rust layer
  to validate it.
- **CASCADE cleanup does not touch disk.** Deleting a project cascades
  through every `project_id`-FK'd row in the database, but on-disk files
  under `./uploads/{project_id}/` are cleaned up separately by the
  project-delete handler (best-effort, logs and continues on failure —
  see `progress.md` 2026-07-15 entry).
- **`ensure_project_exists(pool, project_id)`** in `db/helpers.rs` is
  called at the top of every project-scoped handler (communications,
  tasks, assets, files, phases, members, contacts). It runs a
  one-column `SELECT id FROM projects WHERE id = $1` so 404s are
  returned before any child query runs.
- **Pool sizing** (`max_connections=10`) plus `acquire_timeout=5s` is
  sized for a single-user internal tool. The crate-level doc-comment in
  `pool.rs` calls out that these values should be revisited if the
  deployment moves behind a load balancer.
- **Failure surfacing.** `AppError::Database(sqlx::Error::RowNotFound)`
  → 404 `not_found`; FK violations → 400 `invalid_reference`; unique
  violations → 400 `conflict`; check violations → 400
  `check_violation`. 5xx details are server-side only via
  `tracing::error!`. See `error.rs` and the API conventions in the
  recon profile.
- **`_sqlx_migrations` is reserved.** Do not reference this table in
  application code; it is the bookkeeping store the `migrate` runtime
  uses to track applied files.
