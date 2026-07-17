# sec-tracker — Deploy & runtime guide

End-to-end playbook for running sec-tracker on a developer machine or a small
internal host. Generic Rust / React / PostgreSQL knowledge is intentionally
omitted — only the sec-tracker-specific knobs that actually matter at build,
boot, and run time are recorded here.

Evidence sources: `backend/Cargo.toml`, `backend/.cargo/config.toml`,
`backend/src/main.rs`, `backend/src/db/`, `backend/migrations/`,
`frontend/package.json`, `frontend/vite.config.ts`, `progress.md`. If a rule
here disagrees with a more general web tutorial, this file wins for
sec-tracker.

Related docs in this folder: `conventions.md` (code patterns),
`tech-stack.md` (version pin rationale), `modules.md` (file layout).

## 1. Prerequisites

| Requirement | Version | Why |
|---|---|---|
| Rust toolchain | **1.93 or newer** | `backend/Cargo.toml` uses `edition = "2024"`; earlier stable releases reject the edition. |
| Node.js | **20 or newer** | `frontend/package.json` requires Vite 8 (`^8.1.1`), which only runs on Node 20+. |
| PostgreSQL | **16** | Matches the schema features used by the 11 migrations (`gen_random_uuid()` via `pgcrypto`-equivalent, `TEXT[]`, `TIMESTAMPTZ`). |

### 1.1 PostgreSQL role & auth

The migrations and runtime expect a database called `sec_tracker` reachable
at `postgres://localhost:5432/sec_tracker`. The default `DATABASE_URL` baked
into `backend/.cargo/config.toml` points at the default `postgres` peer-auth
role on `localhost:5432`, matching what `brew install postgresql@16`
ship out of the box:

- macOS / Linux default Postgres installs use **peer / trust** auth on
  the Unix socket, so the OS user that runs `cargo run` also owns the
  `sec_tracker` database.
- If you run Postgres under a non-default role, either create the
  database as that role (`createdb sec_tracker`) or set `DATABASE_URL`
  explicitly in `backend/.env` — the runtime URL always wins over the
  build-time default.

The default install flow on macOS / Linux is:

```bash
brew install postgresql@16           # or apt/dnf equivalent
brew services start postgresql@16
createdb sec_tracker                   # as your OS user
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
just smoke               # 仅跑 10 个冒烟测试
just clean               # cargo clean + 删前端构建产物
```

Run `just` with no arguments to see the full recipe list.

### 2.2 Runtime `.env`

A `.env` at the repo root (or `backend/.env`) is loaded by `dotenvy` at
startup. A missing file is tolerated; the binary will still run with
environment variables injected externally (e.g. by an orchestrator).

Minimum required keys:

```dotenv
DATABASE_URL=postgres://localhost:5432/sec_tracker
RUST_LOG=info,sec_tracker_backend=debug,sqlx=warn
```

`PORT`, `MAX_BODY_SIZE_MB`, and `CORS_ALLOWED_ORIGINS` all have safe
development defaults — see §6.

### 2.3 Boot sequence (`backend/src/main.rs`)

Order matters because each step assumes the previous one has succeeded.

1. `dotenvy::dotenv()` — load `.env`; tolerate a missing file (logs at
   `debug`, never errors).
2. `tracing_subscriber::fmt()` init — env filter `RUST_LOG` if set, else
   `info,sec_tracker_backend=debug,sqlx=warn`.
3. `build_pool_with_retry()` — **1 initial attempt + 5 retries**, backoff
   `1s / 2s / 4s / 8s / 16s` (constant `STARTUP_RETRY_DELAYS_SECS`). Panics
   only after all six attempts fail.
4. `run_migrations_with_retry(&pool)` — loads `./migrations/` via
   `sqlx::migrate::Migrator::new` and runs it with the same retry policy.
   `Migrator::run` is idempotent against the `_sqlx_migrations`
   bookkeeping table, so a partial batch can be retried safely.
5. Read runtime env: `PORT` (default `3000`), `MAX_BODY_SIZE_MB`
   (default `100`), `CORS_ALLOWED_ORIGINS` (default `Any`). Misconfigured
   values are logged at `warn` and the default is used.
6. Build the router — 14 `.nest("/api", ...)` mounts + 14-call CORS /
   timeout / trace / body-limit middleware stack. The 30-second
   per-request timeout is `TimeoutLayer::new(Duration::from_secs(30))`
   wrapped in `HandleErrorLayer` so an elapsed request becomes a
   `408 request_timeout` rather than a 500.
7. Bind `tokio::net::TcpListener` to `0.0.0.0:{port}` and `axum::serve`
   it with `with_graceful_shutdown`.
8. On **SIGINT** (Ctrl-C) or **SIGTERM** — log `shutdown signal received`,
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
# 10 个模块的全 CRUD 冒烟测试 + CRM 字段验证
just smoke
```

The test suite covers: health check, clients CRUD, projects CRUD (including
`tech_approval` / `competitors` fields), project contacts (including `role_type`),
communications, tasks, phases (tree structure), members, assets, files (link type).
Each test creates and cleans up its own data with `__SMOKE_`-prefixed UUIDs.

`/api/health` always returns `200` if the process is up; it does not
check the database. The DB-bound check is the fact that
`build_pool_with_retry` and `run_migrations_with_retry` completed —
both panic on the process if they fail, so reaching the `info!("🚀
sec-tracker 后端已启动")` log line is the actual readiness signal.

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
| `DATABASE_URL` | `postgres://localhost:5432/sec_tracker` | PostgreSQL connection string. Consumed by sqlx macros (compile) and the pool (runtime). |
| `RUST_LOG` | `info,sec_tracker_backend=debug,sqlx=warn` | `tracing-subscriber` env filter. |
| `PORT` | `3000` | TCP port the Axum server binds. Read with `env_u16`; bad or empty values fall back to the default with a `warn` log line. |
| `MAX_BODY_SIZE_MB` | `100` | Cap for request bodies, expressed in MiB. Wired to `DefaultBodyLimit::max(max_body_size_mb * 1024 * 1024)`, so this is what actually governs multipart uploads. Set higher if you intend to receive files over 100 MB. |
| `CORS_ALLOWED_ORIGINS` | Any (permissive) | Comma-separated list of allowed origins. Semantics: unset or empty → `Any` (development default); exactly `*` → `Any`; otherwise only the listed origins. Malformed entries are dropped with a `warn` rather than blocking boot. |

## 7. Deploy shape

sec-tracker is a **single-user internal-tool MVP**. It is not yet wired
for CI — `.github/workflows/` is absent — so deploys are manual from
the repo root.

### 7.1 Process topology

| Process | Working dir | Binds | Notes |
|---|---|---|---|
| Backend (`just prod` or `cd backend && cargo run --release`) | `backend/` | `0.0.0.0:3000` | Reads `./migrations/` relative to CWD; expects `./uploads/` writable; serves `static/` for production SPA. |
| Frontend dev (`cd frontend && npm run dev`) | `frontend/` | `0.0.0.0:5173` | Proxies `/api` → backend. Not for production. |
| PostgreSQL 16 | host init | `127.0.0.1:5432` (typical) | One database: `sec_tracker`. |

### 7.2 Persistent state on disk

The only on-disk mutable state the server writes outside Postgres is
**uploaded files**, stored under `./uploads/{project_id}/` (created
on first upload for a project). A delete-project flow best-effort
removes the directory; an interrupted mid-upload may leave an orphan
file.

Operational requirements:

- `uploads/` must be **writable** by the user the backend runs as.
- `uploads/` must be **backed up** the same way you back up the
  `sec_tracker` database — the two are coupled (each row in
  `project_files` references a stored file on disk).
- Restoring from backup means restoring the database **and**
  `uploads/` together; restoring only one will produce dangling
  references or orphaned files.

### 7.3 Things deliberately not yet in this doc

Because they are not present in the codebase:

- No Docker / Compose / Podman manifest — bring your own.
- No systemd unit — the boot sequence in §2.3 is the spec.
- No reverse-proxy config (nginx / Caddy) — backend binds directly.
- No CI pipeline — `.github/workflows/` is empty.
- No TLS termination — secure the host boundary instead.

Treat the boot sequence in §2.3 and the env-var table in §6 as the
contract. Anything outside those is up to the deployer.
