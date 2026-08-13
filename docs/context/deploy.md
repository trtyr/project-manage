# project-manage — Deploy & runtime guide

End-to-end playbook for running project-manage on a developer machine or a small
internal host. Generic Rust / React / PostgreSQL knowledge is intentionally
omitted — only the project-manage-specific knobs that actually matter at build,
boot, and run time are recorded here.

Evidence sources: `backend/Cargo.toml`, `backend/.cargo/config.toml`,
`backend/src/main.rs`, `backend/src/db/`, `backend/migrations/`,
`frontend/package.json`, `frontend/vite.config.ts`, `progress.md`. If a rule
here disagrees with a more general web tutorial, this file wins for
project-manage.

Related docs in this folder: `conventions.md` (code patterns),
`tech-stack.md` (version pin rationale), `modules.md` (file layout).

## 1. Prerequisites

| Requirement | Version | Why |
|---|---|---|
| Rust toolchain | **1.85+ (edition 2024)** | `backend/Cargo.toml` uses `edition = "2024"`, which stabilized in Rust 1.85. There is no `rust-toolchain.toml` floor; CI runs `dtolnay/rust-toolchain@stable` and the Docker image pins `rust:1.97`. |
| Node.js | **20 or newer** | `frontend/package.json` requires Vite 8 (`^8.1.1`), which only runs on Node 20+. |
| PostgreSQL | **16** | Matches the schema features used by the 19 migrations (`gen_random_uuid()` via `pgcrypto`-equivalent, `TEXT[]`, `TIMESTAMPTZ`, self-referential phases). |

### 1.1 PostgreSQL role & auth

The migrations and runtime expect a database called `project_manage` reachable
at `postgres://localhost:5432/project_manage`. The default `DATABASE_URL` baked
into `backend/.cargo/config.toml` points at the default `postgres` peer-auth
role on `localhost:5432`, matching what `brew install postgresql@16`
ship out of the box:

- macOS / Linux default Postgres installs use **peer / trust** auth on
  the Unix socket, so the OS user that runs `cargo run` also owns the
  `project_manage` database.
- If you run Postgres under a non-default role, either create the
  database as that role (`createdb project_manage`) or set `DATABASE_URL`
  explicitly in `backend/.env` — the runtime URL always wins over the
  build-time default.

The default install flow on macOS / Linux is:

```bash
brew install postgresql@16           # or apt/dnf equivalent
brew services start postgresql@16
createdb project_manage                   # as your OS user
```

No TLS is configured in the default URL; the connection is plain TCP to
`localhost`, which is fine for a single-host internal tool.

## 2. Backend + Frontend commands

All commands assume the repo root. The `justfile` at the root provides
one-liners for every common operation.

```bash
# 一键生产部署（构建前端 → 部署 static → 编译并启动后端）
just prod

# 停止 / 重启 / 查看状态
just stop
just restart
just status

# 开发模式提示
just dev
```

### 2.1 Manual equivalents (for CI / scripting)

```bash
just build-backend       # cargo build --release --manifest-path backend/Cargo.toml
just build-frontend      # cd frontend && npm run build
just deploy-static       # 构建前端并拷贝 dist/ 到 backend/static/
just check               # clippy + 后端测试 + 冒烟测试 + 前端 tsc
just smoke               # 仅跑 11 个冒烟测试（全模块 CRUD + CRM 字段 + people 排序/换边）
just clean               # cargo clean + 删前端构建产物
```

Run `just` with no arguments to see the full recipe list.

### 2.2 Runtime `.env`

A `.env` at the repo root (or `backend/.env`) is loaded by `dotenvy` at
startup. A missing file is tolerated; the binary will still run with
environment variables injected externally (e.g. by an orchestrator).

Minimum required keys:

```dotenv
DATABASE_URL=postgres://localhost:5432/project_manage
RUST_LOG=info,project_manage_backend=debug,sqlx=warn
```

`PORT`, `MAX_BODY_SIZE_MB`, and `CORS_ALLOWED_ORIGINS` all have safe
development defaults — see §6.

### 2.3 Boot sequence (`backend/src/main.rs`)

Order matters because each step assumes the previous one has succeeded.

0. **CLI dispatch** (`main.rs`) — `Cli::parse()` runs first. If a
   subcommand other than `serve` is given, the binary runs as an HTTP
   *client* against the API (see `cli.rs` and the CLI section of
   `modules.md`) and exits without starting a server. With no args or
   `serve`, execution falls through to the server boot below.

1. `dotenvy::dotenv()` — load `.env`; tolerate a missing file (logs at
   `debug`, never errors).
2. `tracing_subscriber::fmt()` init — env filter `RUST_LOG` if set, else
   `info,project_manage_backend=debug,sqlx=warn`.
3. `build_pool_with_retry()` — **1 initial attempt + 5 retries**, backoff
   `1s / 2s / 4s / 8s / 16s` (constant `STARTUP_RETRY_DELAYS_SECS`). Panics
   only after all six attempts fail.
4. `run_migrations_with_retry(&pool)` — loads `./migrations/` via
   `sqlx::migrate::Migrator::new` and runs it with the same retry policy.
   `Migrator::run` is idempotent against the `_sqlx_migrations`
   bookkeeping table, so a partial batch can be retried safely.
5. Read runtime env: `PORT` (default `3000`), `MAX_BODY_SIZE_MB`
   (default `100`), `STATIC_DIR` (default `./static`, served as the SPA
   fallback — the Docker image sets `/app/static`), `CORS_ALLOWED_ORIGINS`
   (default `Any`). Misconfigured values are logged at `warn` and the
   default is used.
6. Build the router (`app::build_app`) — **17** `.nest("/api", ...)`
   mounts (the 9 resource groups clients / projects / communications /
   tasks / phases / people / assets / files / deliverables, most with both
   a project-scoped and a flat router, plus `search`) behind a layer
   stack: CORS → `HandleErrorLayer`+`TimeoutLayer` (30s) → `TraceLayer` →
   `DefaultBodyLimit`. The 30-second per-request timeout is
   `TimeoutLayer::new(Duration::from_secs(30))` wrapped in
   `HandleErrorLayer` so an elapsed request becomes a `408
   request_timeout` rather than a 500. Unmatched `/api/*` returns the API's
   own empty 404; everything else falls through to `ServeDir` with an
   `index.html` SPA fallback (serving the built frontend from `STATIC_DIR`).
7. Bind `tokio::net::TcpListener` to `0.0.0.0:{port}`. A bind failure
   (port already in use) logs a friendly message pointing at `just stop`
   or `PORT=… cargo run` and exits 1 rather than panicking. The listener
   is handed to `axum::serve(...).with_graceful_shutdown(...)`.
8. **Startup readiness self-check** — the server task is spawned, then the
   process issues `GET http://127.0.0.1:{port}/api/health` (2 s timeout).
   A 200 logs the "fully ready" line; any other outcome is a non-fatal
   `warn` (a real failure surfaces on the next request). Reaching this
   check is the actual readiness signal — stronger than "we called
   `axum::serve`".
9. On **SIGINT** (Ctrl-C) or **SIGTERM** — log `shutdown signal received`,
   call `pool.close().await`, log `pool closed`. In-flight requests drain
   via `axum::serve`; the process exits when the listener is gone.

## 3. Frontend commands

```bash
cd frontend
npm install
npm run dev       # vite dev server on :5173, proxies /api → :3000
npm run build     # tsc -b && vite build
npm run lint      # oxlint
npm run preview   # preview the production build
```

`npm run dev` boots Vite on `http://localhost:5173` and forwards every
`/api/*` request to `http://localhost:3000` (`changeOrigin: true`). Start
the backend first so the proxy has somewhere to send requests; the
frontend does not retry the proxy on its own beyond React Query's
default smart-retry policy that skips 4xx responses.

`npm run build` runs TypeScript project-references (`tsc -b`) before
bundling, so a type error fails the build before Vite ever writes
output.

## 4. Smoke tests

```bash
# 11 个冒烟测试（全模块 CRUD + CRM 字段 + people 排序/换边）
just smoke
```

The 11-test suite covers: health check; clients, projects (incl. CRM fields
`tech_approval` / `competitors`), communications, tasks, phases (tree
structure), project assets, project files (link type) CRUD; and **people** CRUD
plus reorder and team↔client `flip-side`. (No dedicated smoke test yet for
deliverables, global search, asset reorder, or task assignee/priority — those
paths are exercised by the ts-rs export bindings + manual use.) Each test
creates and cleans up its own data with `__SMOKE_`-prefixed UUIDs and binds a
random loopback port, so they run in parallel without `#[serial]`.

`/api/health` always returns `200` if the process is up; it does not
check the database. The DB-bound check is the fact that
`build_pool_with_retry` and `run_migrations_with_retry` completed —
both panic on the process if they fail, so reaching the `info!("🚀
project-manage 后端已启动")` log line is the actual readiness signal.

## 5. Adding a migration

SQL files live in `backend/migrations/`. Filenames are matched by SQLx's
Migrator using a timestamp + name pattern:

```text
backend/migrations/YYYYMMDDhhmmss_<name>.sql
```

To stay safe under the retry logic in `run_migrations_with_retry`, the
**first statement** of every migration must be idempotent. The existing
files use the following patterns — copy them rather than inventing new
ones:

| Idempotent form | Used for |
|---|---|
| `CREATE TABLE IF NOT EXISTS <t> (...)` | New tables. |
| `CREATE OR REPLACE FUNCTION <f>(...) ...` | Trigger functions and helpers. Migration 001's `set_updated_at()` is the canonical example. |
| `DROP TRIGGER IF EXISTS <tr> ON <t>;` followed by `CREATE TRIGGER ...` | Re-applying triggers safely. |
| `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` | Additive column changes (used by migrations 010 + 011). |

A migration is applied automatically next time the server boots — no
separate migrate command, no manual step. After you add the file:

```bash
just db-migrate
# look for "✅ database migrations applied" in the log
```

If the boot retries the migration step, SQLx's `_sqlx_migrations`
bookkeeping table prevents the same file from running twice.

## 6. Environment variables

All variables are read from the process environment at startup.
`backend/.cargo/config.toml` sets a default for `DATABASE_URL` only —
the runtime `.env` (or orchestrator env) is authoritative.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://localhost:5432/project_manage` | PostgreSQL connection string. Consumed by sqlx macros (compile) and the pool (runtime). |
| `RUST_LOG` | `info,project_manage_backend=debug,sqlx=warn` | `tracing-subscriber` env filter. |
| `PORT` | `3000` | TCP port the Axum server binds. Read with `env_u16`; bad or empty values fall back to the default with a `warn` log line. |
| `MAX_BODY_SIZE_MB` | `100` | Cap for request bodies, expressed in MiB. Wired to `DefaultBodyLimit::max(max_body_size_mb * 1024 * 1024)`, so this is what actually governs multipart uploads. Set higher if you intend to receive files over 100 MB. |
| `CORS_ALLOWED_ORIGINS` | Any (permissive) | Comma-separated list of allowed origins. Semantics: unset or empty → `Any` (development default); exactly `*` → `Any`; otherwise only the listed origins. Malformed entries are dropped with a `warn` rather than blocking boot. |
| `STATIC_DIR` | `./static` | Directory served as the production SPA (with an `index.html` fallback for client-side routing). The Docker image sets `/app/static`. A missing dir is logged at `warn`; the API still works, only frontend assets are unavailable. |
| `PROJECT_MANAGE_URL` | `http://localhost:{PORT}` | Base URL the **CLI** subcommands talk to (see `cli.rs`). Falls back to `http://localhost:3000`; overridable per-invocation with `--api-url`. Only relevant in CLI-client mode, not when serving. |

## 7. Deploy shape

project-manage is a **single-user internal-tool MVP**. Three deploy paths
are supported; pick one:

- **Containerized (cleanest for a fresh host)** — `docker compose up -d
  --build`. Full topology in §8.
- **Bare metal via `just`** — `just prod` builds the frontend, copies it
  into `backend/static/`, and runs the release binary. Topology in §7.1.
- **Dev** — two terminals: backend `cargo run` + frontend `npm run dev`.

CI is wired (`.github/workflows/ci.yml`) and gates every push/PR with
clippy + rustfmt + backend tests + oxlint + tsc + vitest + build; it does
**not** deploy.

### 7.1 Process topology

| Process | Working dir | Binds | Notes |
|---|---|---|---|
| Backend (`just prod` or `cd backend && cargo run --release`) | `backend/` | `0.0.0.0:3000` | Reads `./migrations/` relative to CWD; expects `./uploads/` writable; serves `static/` for production SPA. |
| Frontend dev (`cd frontend && npm run dev`) | `frontend/` | `0.0.0.0:5173` | Proxies `/api` → backend. Not for production. |
| PostgreSQL 16 | host init | `127.0.0.1:5432` (typical) | One database: `project_manage`. |
| Docker stack (`docker compose up -d --build`) | repo root | host `${APP_PORT:-9999}` → container `3000` | One multi-stage image (frontend build + Rust build + slim runtime) + a `postgres:16-alpine` sidecar. See §8. |

### 7.2 Persistent state on disk

The only on-disk mutable state the server writes outside Postgres is
**uploaded files**, stored under `./uploads/{project_id}/` (created
on first upload for a project). A delete-project flow best-effort
removes the directory; an interrupted mid-upload may leave an orphan
file.

Operational requirements:

- `uploads/` must be **writable** by the user the backend runs as.
- `uploads/` must be **backed up** the same way you back up the
  `project_manage` database — the two are coupled (each row in
  `project_files` references a stored file on disk).
- Restoring from backup means restoring the database **and**
  `uploads/` together; restoring only one will produce dangling
  references or orphaned files.

### 7.3 What is and isn't provided

Provided by the repo:

- **Containerized deploy** — `Dockerfile` (3-stage) + `docker-compose.yml`.
  Full instructions in §8.
- **CI** — `.github/workflows/ci.yml` (quality gate, not a deployer).
- **DB backup** — `scripts/db-backup.sh` (§9).

Deliberately **not** provided (bring your own):

- No systemd unit — the boot sequence in §2.3 is the spec for bare metal.
- No reverse-proxy config (nginx / Caddy) — the backend (or the Docker
  `app` service) binds directly. Put a reverse proxy in front if you need
  TLS or a hostname.
- No TLS termination — secure the host boundary instead.

Treat the boot sequence in §2.3 and the env-var table in §6 as the
contract. Anything outside those is up to the deployer.

## 8. Docker / Compose deployment

`Dockerfile` is a 3-stage build; `docker-compose.yml` wires it to a
Postgres sidecar. This is the recommended path for a clean host — no local
Rust/Node toolchain needed.

```bash
docker compose up -d --build      # build images + start db + app
docker compose logs -f app        # tail app logs (look for “✅ 就绪检查通过”)
docker compose ps                 # status
docker compose down               # stop (keeps the pgdata volume)
docker compose down -v            # stop + wipe the database volume
```

### 8.1 Image stages

| Stage | Base | Produces |
|---|---|---|
| `frontend-builder` | `node:22-alpine` | `npm ci` → `npm run build` → `/app/frontend/dist` |
| `backend-builder` | `rust:1.97-slim` | `cargo build --release` with `SQLX_OFFLINE=true` (uses checked-in `backend/.sqlx/` query metadata — **no database needed during build**) |
| `runtime` | `debian:bookworm-slim` | copies the binary + `migrations/` + built `static/`; `ca-certificates` for rustls |

The backend normally verifies `sqlx::query!` macros against a live DB at
compile time. `cargo sqlx prepare` generated `backend/.sqlx/`, so the
image builds offline (`SQLX_OFFLINE=true`); regenerate that directory with
`cargo sqlx prepare --manifest-path backend/Cargo.toml` if you change a
query, then commit the updated `.sqlx/`.

### 8.2 Compose topology

- **`db`** — `postgres:16-alpine`, data in the `pgdata` named volume,
  healthchecked via `pg_isready`. Env: `POSTGRES_DB` / `POSTGRES_USER` /
  `POSTGRES_PASSWORD` (all default to `project_manage`). No host port is
  published — only the `app` container reaches it.
- **`app`** — built from `Dockerfile`, `depends_on` the healthy `db`,
  connects at `DATABASE_URL=postgres://…@db:5432/…`. The app waits/retries
  (§2.3 boot), applies migrations, then serves API + SPA. Host port
  `${APP_PORT:-9999}` → container `3000`. `./backend/uploads` is
  bind-mounted to `/app/uploads` so uploaded files survive container
  rebuilds.

### 8.3 Env knobs

```dotenv
POSTGRES_DB=project_manage
POSTGRES_USER=project_manage
POSTGRES_PASSWORD=project_manage   # change for anything beyond local
APP_PORT=9999                       # host port mapped to container 3000
```

Set them in a `.env` next to `docker-compose.yml` or inline
(`APP_PORT=8080 docker compose up -d`).

## 9. Backup & restore

The two pieces of mutable state are the **database** and **uploaded
files** (`backend/uploads/{project_id}/`). They are coupled — every
`project_files` row references a file on disk — so back up and restore
them **together**.

### 9.1 Database

`scripts/db-backup.sh` exports the Compose database to a timestamped SQL
file under `backups/`:

```bash
./scripts/db-backup.sh
# → backups/project_manage_20260813_135149.sql
```

It runs `pg_dump --clean --if-exists --no-owner` inside the `db` container,
so the dump is portable across roles/hosts. Restore into the same (or a
fresh) Compose stack:

```bash
docker compose exec -T db psql -U project_manage -d project_manage \
  < backups/project_manage_<timestamp>.sql
```

For the **bare-metal** database (local `postgresql@16`), use the host
tooling directly:

```bash
pg_dump --clean --if-exists --no-owner project_manage > backups/project_manage_$(date +%Y%m%d).sql
psql project_manage < backups/project_manage_<timestamp>.sql
```

### 9.2 Uploaded files

`backend/uploads/` is plain files — back it up with your normal file
backup (`rsync`, `tar`, snapshot). In Compose it is a bind mount
(`./backend/uploads`), so it already lives on the host; back up that path.

### 9.3 Restore order

1. Restore the database (§9.1).
2. Restore `uploads/` (§9.2) to the same relative path.
3. Start the app — migrations are idempotent, so boot reconciles drift.

Restoring only one half produces dangling references (rows without files,
or orphaned files without rows).
