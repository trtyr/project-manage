# sec-tracker

> Fullstack tracker for security-services clients, projects, and delivery work.

## Project Type

Fullstack internal tool: a Rust/Axum API, React/TypeScript SPA, and
PostgreSQL database. See the [technology stack](docs/context/tech-stack.md)
for verified versions and development topology.

## Quick Reference

| Item | Value |
|---|---|
| Language | Rust 2024 (backend) and TypeScript (frontend); see the [technology stack](docs/context/tech-stack.md) |
| Framework | Axum 0.8.9; React 19 + Vite 8 |
| Entry Point | `backend/src/main.rs`; frontend root `frontend/src/main.tsx` |
| Test Command | `cargo test --manifest-path backend/Cargo.toml` |
| Database | PostgreSQL 16 via SQLx 0.8; see the [database guide](docs/context/database.md) |

## Overview

sec-tracker centralizes security-services client and project work that would
otherwise be spread across spreadsheets, chat, and email. The React SPA
communicates with the Axum backend over `/api`, while SQLx manages a
PostgreSQL-backed project domain. See the [architecture overview](docs/context/architecture.md)
and [API reference](docs/context/api.md) for deeper system and endpoint details.

## Architecture Overview

The system is a layered fullstack application: the Vite-served React SPA uses
React Query and Axios, proxies `/api` requests to Axum during development, and
the backend persists resource data through SQLx to PostgreSQL. Axum mounts flat
and project-scoped routers for clients, projects, communications, tasks, assets,
files, phases, members, and contacts. Runtime migrations, bounded startup
retries, request timeouts, tracing, CORS, and upload body limits are wired in
`backend/src/main.rs`. Read the full [architecture document](docs/context/architecture.md)
before changing cross-layer flows; consult the [database document](docs/context/database.md)
for schema and migration behavior.

## Commands

The backend expects PostgreSQL at `postgres://localhost:5432/sec_tracker`; the
frontend dev server runs on `:5173` and proxies API calls to the backend on
`:3000`. See the [technology stack](docs/context/tech-stack.md) for tooling
details.

```bash
# Install
(cd frontend && npm install)

# Dev (run the backend and frontend in separate terminals)
cargo run --manifest-path backend/Cargo.toml
(cd frontend && npm run dev)

# Test
cargo test --manifest-path backend/Cargo.toml

# Build
cargo build --manifest-path backend/Cargo.toml
(cd frontend && npm run build)
```

## Danger Zone

- Projects require an existing client; deleting a client with projects is
  restricted, while project-owned rows cascade on project deletion.
- Every project-scoped handler must call `ensure_project_exists` before accessing
  child resources.
- Project and task status values are validated in Rust; phase status remains
  free-form text.
- File uploads and project deletion have separate best-effort disk cleanup paths
  in `./uploads/{project_id}/`; database cascades do not remove files from disk.
- Preserve the deliberate PostgreSQL `TEXT`/`TEXT[]` trade-offs and error-envelope
  behavior unless the domain model changes intentionally. See the [domain
  invariants](docs/context/domain.md) and [database guide](docs/context/database.md).
