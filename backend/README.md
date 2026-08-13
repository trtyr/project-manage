# project-manage — backend

Rust + Axum + sqlx + PostgreSQL. Single user, internal-tool MVP.

## Architecture

```text
src/
├── main.rs           ← entrypoint: dotenvy → tracing → pool+retry
│                       → migrate+retry → env → build_app → serve → readiness check
├── app.rs            ← build_app(): single source of truth for the Router —
│                       17 `.nest("/api", …)` mounts + CORS/timeout/trace/body-limit
├── error.rs          ← AppError (4 variants) → unified JSON { error, message }
├── state.rs          ← AppState { pool } + FromRef for axum
├── db/
│   ├── mod.rs        ← re-export
│   ├── pool.rs       ← build_pool() — DATABASE_URL → PgPool
│   └── helpers.rs    ← ensure_project_exists() guard
├── models/           ← row structs + Create/Update DTOs + *Status/*Side const-modules
│   ├── mod.rs
│   ├── client.rs · project.rs (+TechApprovalStatus) · communication.rs
│   ├── task.rs (+TaskPriority) · asset.rs · project_file.rs · phase.rs
│   └── person.rs (+PersonSide) · deliverable.rs (+DeliverableStatus)
└── handlers/         ← axum handlers, one module per resource
    ├── mod.rs        ← re-export router builders
    ├── clients.rs · projects.rs        top-level CRUD
    ├── communications.rs · tasks.rs    project-scoped + flat
    ├── assets.rs · files.rs            (+ multipart upload / links)
    ├── phases.rs · people.rs           (+ reorder / flip-side)
    ├── deliverables.rs                 project-scoped + flat
    └── search.rs                       flat-only global cross-resource search
```

All resource routes are mounted under `/api` via `Router::nest` in
`app.rs::build_app` (called from `main.rs`). The legacy `/api/health` endpoint
is preserved unchanged.

## Build & run

### Prereqs

- Rust 1.85+ (`edition = "2024"` in `Cargo.toml`; the Docker image pins `rust:1.97`).
- PostgreSQL 16 reachable at `postgres://localhost:5432/project_manage`.
  The credentials use the OS user via peer/trust auth (matches local brew install).
- A `.env` file at the repo root with `DATABASE_URL=...` (defaults already provided).
  `.cargo/config.toml` keeps a working default when `.env` is absent so
  `cargo build` works out of the box without `export`/`direnv`.

### Build

```text
cargo build
```

### Run

```text
cargo run
```

On boot the binary (`main.rs`):

1. Loads `.env` via `dotenvy` (missing file tolerated).
2. Builds the Postgres pool (1 + 5 retries, 1/2/4/8/16 s backoff).
3. Applies any pending migrations from `./migrations/` (sqlx::Migrator, retried).
4. Reads env (`PORT`, `MAX_BODY_SIZE_MB`, `STATIC_DIR`, `CORS_ALLOWED_ORIGINS`).
5. Builds the router (`app::build_app`) and binds `0.0.0.0:{PORT}`.
6. Runs a startup readiness self-check (`GET /api/health`), then serves with
   graceful shutdown on SIGINT/SIGTERM.

### Smoke test

```text
curl http://localhost:3000/api/health
curl http://localhost:3000/api/clients
```

## Adding a migration

Create a new file with the next ordinal name:

```text
migrations/20250714000005_*.sql
```

The very first statement should be idempotent (`CREATE TABLE IF NOT EXISTS`,
`CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS`) so re-runs are safe.
Restart the server to apply.

## API conventions

- All routes under `/api`.
- Successful collection reads return `200` + JSON array.
- Successful single reads return `200` + JSON object.
- Creates return `201 Created` + the new row.
- Deletes return `204 No Content`.
- Errors return `4xx`/`5xx` + `{ "error": "<code>", "message": "<text>" }`.
- Validation errors caught early (empty `name`, unknown `status`) return 400.
- FK violations (orphan parent, used parent) return 400 `invalid_reference`.
- Missing rows return 404 `not_found`.
