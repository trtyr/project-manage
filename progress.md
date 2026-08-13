# Progress

A concise changelog of feature waves. Each entry lists what shipped, the
migrations / files it touched, and how it was verified. For migration-level
detail see [docs/context/database.md](docs/context/database.md); for the
running module set see [docs/context/modules.md](docs/context/modules.md).

## 2026-08-13 — Reposition as a generic project-management tool

The project is now a **generic** project tracker, not a security-services
one. All security framing and the security-named field were removed.

- [x] Migration **019** — `ALTER TABLE clients DROP COLUMN security_concerns`
  (backed up the local DB first; `backups/project_manage_predrop_*.sql`).
- [x] Backend: `security_concerns` removed from `models/client.rs` (row +
  Create/Update DTOs) and `handlers/clients.rs` (all SELECT/INSERT/UPDATE).
- [x] Frontend: removed from `types/index.ts` override; ts-rs regenerated
  `types/generated/{Client,CreateClient,UpdateClient}.ts`; `.sqlx` offline
  data regenerated (`cargo sqlx prepare`).
- [x] Tests: `smoke.rs::test_clients_crud` no longer asserts on it.
- [x] Docs: security framing stripped from README / AGENTS / PRODUCT /
  architecture / tech-stack; `security_concerns` references removed from
  api / database / domain / architecture; migration counts bumped 18 → 19.
- [x] Removed `docs/methodology.md` (售前工作方法论) and the unused
  `frontend/src/assets/hero.png`.

Verified: clippy `-D warnings` clean; `cargo test` 40 passed (29 ts-rs + 11
smoke); frontend build OK + 20 vitest passed.

## 2026-08-13 — Decouple CLI into standalone `pm` crate

The CLI used to be a "client mode" of the server binary, which trapped it
inside the Docker image. Split it out so the AI/operator can run it from the
host and reach the server over HTTP.

- [x] New `cli/` crate: binary `pm` (`project-manage-cli`), a thin HTTP client
  (clap + reqwest + serde_json + tokio), no dependency on the backend.
- [x] Backend is now server-only: removed `cli.rs`, `pub mod cli`, `clap`, and
  the `Cli::parse()` dispatch from `main.rs`.
- [x] Updated the `project-manage-cli` skill + README + modules §G + deploy +
  backend/README to reflect the `pm` binary and cargo/docker server startup.

Verified: backend 40 tests green (29 ts-rs + 11 smoke); `pm --api-url
http://localhost:9999 clients list` and `search` work against Docker.

## 2026-07-15 — Backend error-handling hardening

- [x] Extracted `ensure_project_exists` into `backend/src/db/helpers.rs`,
  reused by every project-scoped handler.
- [x] On upload DB-write failure, clean the already-written file and log a
  file-delete failure.
- [x] On project delete, query file paths and best-effort remove
  `./uploads/{project_id}/`; dir-cleanup failure only warns.
- [x] Map unique / FK constraint errors to structure-safe friendly messages.
- [x] Removed remaining `let _ =` silent error handling in the backend.

Verified: `cargo build` / `cargo test` / `cargo clippy -D warnings` all green.

## 2026-08-12 — People unification + assets/files UX + standards

Replaced the split `members` (team) + `client_contacts` (client) tables with a
single **`people`** table keyed by `side` (`team` | `client`). `role` is shared,
so moving a person across sides is a side flip with no field conversion.

- [x] Migrations 012–016: CRM fields (`projects.tech_approval` /
  `competitors`), `sort_order` on members/contacts/assets, the `people`
  table (drops `members` + `client_contacts`), structured asset fields
  (`access_method` / `credentials` / `vendor`), asset drag-and-drop reorder.
- [x] Handlers: `people.rs` (CRUD + `PUT …/people/reorder` +
  `POST /people/{id}/flip-side`), `assets.rs` reorder, CRM fields in
  `projects.rs`.
- [x] Frontend: `MembersTab` rewired to `peopleApi`; asset/file tabs gained
  reorder + inline upload; project form gained CRM fields.
- [x] ts-rs codegen regenerates `Person` / `CreatePerson` / `UpdatePerson`
  (and the `*Status`/`*Side` const-modules) into `frontend/src/types/generated/`.

## 2026-08-12 — Dashboard, global search, timeline, deliverables

- [x] Migrations 017–018: `tasks.assignee_id` (FK → `people`, SET NULL) +
  `tasks.priority` (`TaskPriority`); the `deliverables` table (status
  `pending`/`delivered`/`accepted`, optional `linked_file_id`, own
  `set_updated_at()` trigger).
- [x] `search.rs` — cross-resource `GET /api/search?q=…` (ILIKE across
  projects / clients / communications / tasks / people, LIMIT 10 each).
- [x] Frontend: `ProjectBoard` dashboard + debounced global search,
  `TimelineTab` and `DeliverablesTab` on the project detail page.
- [x] CLI gained `search` and `deliverables` subcommands.

## 2026-08-12 — Dual-mode CLI

`backend/src/cli.rs` turns the single binary into a dual-purpose tool:
`project-manage` (no args / `serve`) starts the server; any subcommand runs
an HTTP **client** over `/api` with `--format json|table`. Covers all 9
resource groups + global search. See [modules.md §G](docs/context/modules.md).

## 2026-08-13 — Containerized deploy + DB backup

- [x] `Dockerfile` (3-stage: node:22 frontend → rust:1.97 backend with
  `SQLX_OFFLINE=true` using checked-in `backend/.sqlx/` → debian:bookworm-slim
  runtime) + `docker-compose.yml` (`postgres:16-alpine` sidecar, `pgdata`
  volume, `./backend/uploads` bind mount, `${APP_PORT:-9999}` → 3000).
- [x] `scripts/db-backup.sh` — `pg_dump` via `docker compose exec db` into
  `backups/project_manage_<ts>.sql`; restore via `docker compose exec -T db
  psql …`.
- [x] CI gate (`.github/workflows/ci.yml`): postgres:16 service → apply
  migrations → clippy `-D warnings` + rustfmt + backend tests + oxlint + tsc +
  vitest + build.

## Verified baseline (2026-08-13)

| Check | Command | Result |
|---|---|---|
| Backend clippy | `cargo clippy --manifest-path backend/Cargo.toml --all-targets -- -D warnings` | 0 issues |
| Backend tests | `cargo test --manifest-path backend/Cargo.toml` | 40 passed (4 suites) |
| Frontend lint | `npx oxlint .` (in `frontend/`) | exit 0 (warnings only) |
| Frontend tests | `cd frontend && npm run test` | 20 passed |
| Frontend build | `cd frontend && npm run build` | built in 3.5s |

Docs refreshed to match: [deploy.md](docs/context/deploy.md) §8 (Docker) + §9
(backup/restore), and every `docs/context/*.md` updated for the people /
deliverables / search unification and the 19-migration schema.
