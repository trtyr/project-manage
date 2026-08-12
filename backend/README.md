# project-manage — backend

Rust + Axum + sqlx + PostgreSQL. Single user, internal-tool MVP.

## Architecture

```text
src/
├── main.rs           ← entrypoint, router wiring, migration runner, CORS
├── error.rs          ← AppError → unified JSON error response
├── state.rs          ← AppState (PgPool) + FromRef for axum
├── db/
│   ├── mod.rs        ← re-export
│   └── pool.rs       ← build_pool() — DATABASE_URL → PgPool
├── models/           ← plain Rust structs + DTOs, no DB logic
│   ├── mod.rs
│   ├── client.rs
│   ├── project.rs    ← status module: IN_PROGRESS / COMPLETED / PAUSED
│   ├── communication.rs
│   └── task.rs       ← status module: CURRENT / NEXT / TODO
└── handlers/         ← axum handlers, one module per resource
    ├── mod.rs        ← re-export router builders
    ├── clients.rs        GET|POST /clients,    GET|PUT|DELETE /clients/{id}
    ├── projects.rs       GET|POST /projects,   GET|PUT|DELETE /projects/{id}
    ├── communications.rs (nested) /projects/{project_id}/communications
    │                      (flat)   GET|PUT|DELETE /communications/{id}
    └── tasks.rs          (nested) /projects/{project_id}/tasks
                           (flat)   GET|PUT|DELETE /tasks/{id}
```

All resource routes are mounted under `/api` via `Router::nest` in `main.rs`.
The legacy `/api/health` endpoint from Phase 0 is preserved unchanged.

## Build & run

### Prereqs

- Rust 1.93 (matches `edition = "2024"` in `Cargo.toml`).
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

On boot the binary:

1. Loads `.env` via `dotenvy`.
2. Connects to Postgres.
3. Applies any pending migrations from `./migrations/` (sqlx::migrate).
4. Starts listening on `0.0.0.0:3000`.

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
