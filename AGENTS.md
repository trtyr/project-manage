# project-manage

> Fullstack tracker for clients, projects, and delivery work.

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

project-manage centralizes client and project work that would
otherwise be spread across spreadsheets, chat, and email. The React SPA
communicates with the Axum backend over `/api`, while SQLx manages a
PostgreSQL-backed project domain. See the [architecture overview](docs/context/architecture.md)
and [API reference](docs/context/api.md) for deeper system and endpoint details.

## Architecture Overview

The system is a layered fullstack application: the Vite-served React SPA uses
React Query and Axios, proxies `/api` requests to Axum during development, and
the backend persists resource data through SQLx to PostgreSQL. Axum mounts flat
and project-scoped routers for clients, projects, communications, tasks, assets,
files, phases, people, deliverables, and search. Runtime migrations, bounded startup
retries, request timeouts, tracing, CORS, and upload body limits are wired in
`backend/src/main.rs`. Read the full [architecture document](docs/context/architecture.md)
before changing cross-layer flows; consult the [database document](docs/context/database.md)
for schema and migration behavior.

## Commands

The backend expects PostgreSQL at `postgres://localhost:5432/project_manage`; the
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

## Standing Standards

Initialized 2026-07-15. Full detail lives in [conventions.md](docs/context/conventions.md);
this section is the operating-contract summary an agent must hold the bar to.

### Architecture

- **Module map**: one Rust file per resource across `backend/src/handlers/<r>.rs` +
  `backend/src/models/<r>.rs` (fixed set: clients, projects, communications, tasks,
  assets, files, phases, people, deliverables; plus a flat-only `search` handler with
  no row model). Frontend mirrors it: `frontend/src/api/index.ts`
  (one `<r>Api` each) + `frontend/src/types/` (hand-written + ts-rs `generated/`).
- **Dependency direction**: handlers → models → db (no cross-resource handler imports);
  frontend pages/components → api → types. Deep modules — do not widen a file into a grab-bag.
- **Seams**: `AppError` (single error type at the handler boundary), `ensure_project_exists`
  guard (first await of every project-scoped handler), ts-rs codegen (backend DTOs →
  `frontend/src/types/generated/` at test time). See [architecture](docs/context/architecture.md)
  and [module map](docs/context/modules.md).

### Error handling

- Single typed `AppError` (4 variants: `NotFound`, `BadRequest`, `Database`, `Timeout`) →
  `IntoResponse` emits `{ "error": <stable_code>, "message": <text> }`. 5xx is logged once
  at the boundary (`tracing::error!`) with a generic client message — no internal detail
  leaks. Conflict / FK / check violations map to 400. Frontend classifies via
  `classifyApiError` (offline / server / validation / conflict / unknown), never by raw
  status. Full table in [conventions.md §2](docs/context/conventions.md) and
  [error.rs](backend/src/error.rs).

### Tests

- **Backend**: `cargo test --manifest-path backend/Cargo.toml` — 40 tests total:
  ts-rs TypeScript export bindings (regenerate `frontend/src/types/generated/`)
  + an 11-case CRUD smoke suite (clients, projects incl. CRM fields,
  communications, tasks, phases, assets, files, people incl. reorder/
  flip-side) against a live migrated DB. No dedicated smoke test yet for
  deliverables, global search, asset reorder, or task assignee/priority.
- **Frontend**: `cd frontend && npm run test` — vitest (node env); the `classifyApiError`
  contract suite pins [conventions.md §6.1](docs/context/conventions.md).
- **CI gate**: [.github/workflows/ci.yml](.github/workflows/ci.yml) runs clippy
  `-D warnings` + backend tests + oxlint + tsc + vitest + build on every push/PR.
- New behavior ships with a test that verifies it — not a vacuous one.

### Format & security

- **Lint**: backend `cargo clippy -D warnings` (via `just check`); frontend `oxlint`.
- **Format**: [backend/rustfmt.toml](backend/rustfmt.toml) +
  [frontend/.prettierrc.json](frontend/.prettierrc.json); code is formatter-adopted and CI
  runs `cargo fmt --check` + `prettier --check` on every push/PR. `just fmt` reformats.
- **Audit**: [docs/context/security-baseline.md](docs/context/security-baseline.md) — frontend
  0 vulnerabilities (react-router CSRF + transitive fixed); backend 1 (`rsa`, no upstream fix).

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

## Open Items

- **`rsa` dependency (unfixable)**: [RUSTSEC-2023-0071](https://rustsec.org/advisories/RUSTSEC-2023-0071)
  (Marvin Attack, medium) has no fixed release. Transitive via the TLS stack; backend has no
  RSA-key crypto surface so exposure is low. Monitor upstream; revisit when a fixed `rsa` lands.
  See [security-baseline.md](docs/context/security-baseline.md).
