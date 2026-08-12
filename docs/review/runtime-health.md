# Runtime Health & Robustness Review — project-manage

> Scope: backend (`backend/src/`, `backend/migrations/`) and frontend (`frontend/src/`).
> Tech stack: Rust (Axum 0.8 + sqlx 0.8 + tokio) + React 19 + React Query 5 + axios.
> Date: 2026-07-14. Reference paths use the project as-of this date.

This review evaluates seven robustness criteria. Each is scored A–F with concrete
file/line evidence and a recommendation. The project is functional MVP-suitable
code but currently lacks several layers of resilience expected from a production-
facing HTTP service.

## Summary table

| # | Criterion | Score | One-line verdict |
|---|---|---|---|
| 1 | Timeout handling | **C** | DB pool timeouts OK; no HTTP/query/filesystem request timeouts; no axios timeout. |
| 2 | Retry logic | **D** | No backend retry at all; frontend retry is `1` blanket, no backoff, no condition. |
| 3 | Logging | **D** | Tracing wired up but only 3 log lines in the whole binary. No HTTP access log. |
| 4 | Concurrency safety | **A** | Stateless async handlers, `Arc<PgPool>`, no shared mutable state. Clean. |
| 5 | Configuration validation | **C** | DB URL fail-fast, handler validation good; hardcoded port/origin/limits; CORS `Any` on prod path. |
| 6 | Resource cleanup | **C** | DB pool & file handles correct; orphaned disk files on project delete; no abort on frontend fetch. |
| 7 | Graceful shutdown | **F** | No SIGTERM/SIGINT handler at all — `axum::serve` runs until hard kill. |

---

## 1. Timeout handling — **C**

| Aspect | Score | Evidence | Recommendation |
|---|---|---|---|
| Database pool | **A** | `backend/src/db/pool.rs:23-29` — `acquire_timeout=5s`, `idle_timeout=10min`, `max_lifetime=30min`, `max_connections=10`. All documented in source comments. | Keep. Consider a `test_before_acquire=true` to fail fast on dead backends. |
| HTTP server (per-request) | **F** | `backend/src/main.rs:94-123` — the router has only `CorsLayer` + `DefaultBodyLimit::max(100 MB)`. No `TimeoutLayer`, no `tower_http::timeout::TimeoutLayer`, no `axum::extract::DefaultBodyLimit` on timeout. `grep -r 'TimeoutLayer\|RequestTimeout'` returns 0. | Add a global request timeout (~30–60 s) via `tower::timeout::TimeoutLayer` or wrap `axum::serve` with `tokio::time::timeout`. Without it, a slow handler can hold a request open indefinitely. |
| SQL query execution | **D** | `handlers/*` and `files.rs:142-167` invoke `tokio::fs::*` and `sqlx::fetch_*` directly. Only the pool's `acquire_timeout` is bounded — the actual query has no wall-clock cap. `grep 'query_timeout\|query,.*timeout'` → 0 hits. | Set `statement_timeout` on the Postgres role, or wrap queries with `tokio::time::timeout`, especially for the unbounded `search` endpoint (`communications.rs:222-243`, `ILIKE` on user input). |
| Multipart upload | **B** | `main.rs:116` — `DefaultBodyLimit::max(100 * 1024 * 1024)` (100 MB) bounds total body. Individual fields are not bounded. No timeout on `next_field()` or `bytes()` (`files.rs:87-103`). | Good bound on size. Add a per-field text limit (e.g., `MAX_DESCRIPTION_LEN`) and a timeout wrapper around the upload loop, since a slow client can keep `next_field().await` pending. |
| Filesystem I/O | **D** | `files.rs:147` — `tokio::fs::write(&file_path, &file_data)`; `files.rs:228, 373` — `tokio::fs::read(&row.file_path)`. No timeout. A stalled disk (NFS hiccup) can park a worker indefinitely. | Wrap `tokio::fs::*` calls in `tokio::time::timeout(secs(15), ...)`. |
| Frontend HTTP (axios) | **D** | `frontend/src/api/index.ts:33-35` — `axios.create({ baseURL: '/api' })` with no `timeout`. | Add `timeout: 30_000` (or per-call overrides for downloads/uploads). |
| Frontend `fetch` | **D** | `frontend/src/components/FilePreview.tsx:76` — `fetch(filesApi.previewUrl(file.id))` with no `AbortController`, no timeout, only unmount triggers abort (and React 19 StrictMode double-invokes effects, so a stale fetch can land on a closed component). | Use `AbortController` + a 30 s `setTimeout`. Abort in the effect cleanup. |

---

## 2. Retry logic — **D**

| Aspect | Score | Evidence | Recommendation |
|---|---|---|---|
| Backend HTTP ↔ DB | **F** | `grep -ri 'retry\|backoff'` against `backend/src/` → **0 matches**. There is no `backoff`, `tokio-retry`, `retry`, or hand-rolled retry around `sqlx` calls or `tokio::fs` calls. Transient failures (e.g., Postgres restart, EOF on socket) are surfaced as 500 immediately. | Wrap pool acquire + each query in a small `async fn with_retry(op, max=3, base=100ms)` that retries on `sqlx::Error::Io`, `PoolTimedOut`, and unique/FK serialization-failure codes. Add a `tokio::time::sleep` with jittered exponential backoff. |
| Backend migrations | **B** | `main.rs:68-73` — `Migrator::new(...).run(&pool)` is called once; the `expect` panics on failure. No retry, but migrations are typically a one-shot, which is acceptable. Tolerable. | Optional: retry migration start 2–3× in case the DB is racing the server. |
| Frontend (React Query) | **D** | `frontend/src/main.tsx:10-18` — `QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } })`. `retry: 1` is applied to every query by default, including 4xx responses (React Query v5 default is to retry on any error unless `retryOnError` is false). No exponential backoff. | Set `retry: (failureCount, error) => shouldRetry(failureCount, error)` and use `retryDelay: attempt => Math.min(1000 * 2 ** attempt, 10_000)`. Skip retry on 4xx (`error.response.status < 500`). |
| Frontend axios | **F** | No `axios-retry`, no interceptor. The lone `http` instance in `api/index.ts:33` has no `interceptors.response.use`. | Add a single response interceptor that retries idempotent verbs (GET/HEAD) on network errors and 5xx with backoff, capped at 2 attempts. |

---

## 3. Logging — **D**

| Aspect | Score | Evidence | Recommendation |
|---|---|---|---|
| Tracing init | **B** | `main.rs:52-57` — `tracing_subscriber::fmt().with_env_filter(...).init()`. Default filter `info,project_manage_backend=debug,sqlx=warn` is sensible. | Good. Add structured (JSON) output optionally via `tracing-subscriber` `fmt::layer().json()` when `LOG_FORMAT=json`. |
| Informational logs | **D** | Only **two** `info!` calls exist in the entire backend: `main.rs:74` (migrations applied) and `main.rs:122` (server started). | Add logs at: pool construction (size/timeouts/driver), bind addr & PID, every handler entry for non-GET, every file upload/download with `id` + size + `project_id`. |
| Error logs | **C** | `error.rs:93-95` — `tracing::error!(error = ?self, "request failed with 5xx")` — good: server-side full error, generic message to client. | Keep. Surface DB constraint violation messages via `tracing::warn!` for 4xx (currently they're not logged at all). |
| HTTP access log | **F** | No `tower_http::trace::TraceLayer`, no custom middleware. There is **zero** per-request log anywhere in the codebase. `grep 'TraceLayer\|trace::' backend/src/` → 0. | Add `TraceLayer::new_for_http().make_span_with(DefaultMakeSpan::new().level(Level::INFO).include_headers(false)).on_request(...).on_response(...).on_failure(...)`. |
| File-upload audit | **F** | `files.rs:74-170` — `upload_file` does not log actor, IP, filename, or size. `remove` (`files.rs:264-287`) silently best-efforts `tokio::fs::remove_file`, swallowing the result into `let _`. | Log `upload_file` at `info!` with `project_id`, `original_name`, `size`, `mime_type`. Log failed `remove_file` at `warn!`. |
| Sensitive data in logs | **B** | `error.rs:54, 61, 67` include `db_err.message()` in the client response for unique/FK/check violations — leaks DB schema/constraint names. Server-side `tracing::error!(error = ?self, ...)` dumps the full error, including any SQL bind values — generally OK for an internal tool but worth reviewing if PII appears. | Map DB constraint names to friendly text (e.g., `conflict: client name already exists` instead of leaking `clients_name_key`). Redact bind values from the tracing span. |
| Frontend logging | **D** | `frontend/src/main.tsx` has no logger setup; only user-facing `message.error(...)` (`ProjectBoard.tsx:79, 94, 103`, `CommunicationDetail.tsx:88, 97`, `ProjectDetail.tsx:271`). No error boundary (`App.tsx`), no Sentry-equivalent. | Add an error boundary in `App.tsx` and a single `logError()` that pipes to a console group + (optional) remote sink. |

---

## 4. Concurrency safety — **A**

| Aspect | Score | Evidence | Recommendation |
|---|---|---|---|
| Shared state | **A** | `backend/src/state.rs:11-20` — `AppState { pool: PgPool }`, fields cloned on extraction. `PgPool` is internally `Arc`-shared. No `Mutex`, `RwLock`, `OnceLock`, or atomics in app code. | Keep. Stateless handlers are the right shape for this workload. |
| Handler safety | **A** | Every handler takes `State(pool): State<PgPool>` (e.g., `handlers/clients.rs:31`, `handlers/files.rs:58`). The pool reference is per-request; connections are returned to the pool on drop. `FromRef` impl (`state.rs:16-19`) is the only conversion needed. | Keep. |
| Migration + pool init | **A** | `main.rs:64-73` — pool built, then migrations run on the same pool. No race: `tokio::main` is single-threaded startup. | Keep. |
| Frontend concurrency | **A** | `frontend/src/main.tsx` — single `QueryClient`; `useEffect` debounce correctly cleans up (`ProjectBoard.tsx:39-42` — `clearTimeout` in the cleanup fn). React Query handles refetch coalescing. No custom shared mutable state besides Zustand (not used in reviewed paths). | Keep. |
| Race / TOCTOU risks | **B** | `handlers/files.rs:264-287` — `remove` does SELECT-then-DELETE. If two requests race, the second DELETE affects 0 rows and returns 404, but `tokio::fs::remove_file` runs anyway — could remove a file that was re-uploaded under the same `stored_name` (UUID v4 makes this nearly impossible, but not impossible). | Move `remove_file` inside the transaction or use a row-level lock (`SELECT ... FOR UPDATE`). Low priority given UUID-based stored names. |

---

## 5. Configuration validation — **C**

| Aspect | Score | Evidence | Recommendation |
|---|---|---|---|
| Required env vars | **A** | `db/pool.rs:18-22` — `DATABASE_URL` is required (`std::env::var` returns Err → mapped to `sqlx::Error::Configuration("DATABASE_URL is not set: ...")`). The `.expect` at `main.rs:65` then fails fast. | Good — clear error message, fails before serving traffic. |
| Optional `.env` | **A** | `main.rs:49` — `let _ = dotenvy::dotenv()` tolerates absent file. | Good. |
| Listen port | **D** | `main.rs:119` — hardcoded `"0.0.0.0:3000"`. No `std::env::var("BIND_ADDR")` or config file. | Make `BIND_ADDR` and `PORT` overridable via env (e.g., `0.0.0.0:${PORT:3000}`). |
| CORS | **D** | `main.rs:80-83` — `CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any)`. Source comment acknowledges the risk ("production should narrow this") but the code never does. | Read `CORS_ALLOWED_ORIGINS` from env (comma-separated). Default to `Any` only when `APP_ENV=development`. |
| Body size limit | **C** | `main.rs:116` — hardcoded `100 * 1024 * 1024`. Comment says "for file uploads" but applies to all routes (e.g., `POST /api/projects`). | Make it env-driven and per-route: tight default (~1 MB) at the global level, `RequestBodyLimit::max(100MB)` only on the file-upload route. |
| Handler input validation | **A** | Whitespace-only checks (`handlers/clients.rs:57`, `communications.rs:98`, `tasks.rs:89`, `phases.rs:69`, `members.rs:61`, `assets.rs:67`, `contacts.rs:62`). Enum validation (`projects.rs:63-67`, `tasks.rs:94-98`). Limit clamping (`communications.rs:200, 227`). | Excellent. |

---

## 6. Resource cleanup — **C**

| Aspect | Score | Evidence | Recommendation |
|---|---|---|---|
| DB connections | **A** | `PgPool` is `Arc`-shared, returned on drop. `max_lifetime` bounds zombie connections. | Keep. |
| Tokio file handles | **A** | `tokio::fs::read`/`write` (`files.rs:147, 228, 373, 284`) — handles released on drop. | Keep. |
| Axum body streams | **A** | `Body::from(data)` is fully buffered in memory (`files.rs:228-242, 373-386`); no streaming back-pressure issues. | Consider streaming for large downloads, but acceptable at MVP scale. |
| Orphaned files on project delete | **D** | `projects.rs:172-182` — `DELETE FROM projects WHERE id = $1`. `migrations/006_project_files.sql:5` cascades row deletion, but **no handler cleans up `./uploads/{project_id}/`**. Directory + files stay on disk forever. The disk path is hardcoded relative (`files.rs:141`). | Add a `cleanup_project_files(project_id)` helper called from `remove` in `projects.rs`. Or move uploads to a key-value/S3 store and treat disk as ephemeral. |
| Orphaned files on upload failure | **D** | `files.rs:147-167` — `tokio::fs::write(&file_path, &file_data)` then `INSERT`. If the INSERT fails (e.g., FK violation, DB down), the file remains on disk and `stored_name` is lost. No compensating delete. | Wrap the two steps in a single function with a tokio "best-effort cleanup" path: if `fetch_one(...).await` is `Err`, attempt `tokio::fs::remove_file(&file_path)` and propagate the original error. |
| Orphaned files on update failure | **B** | `files.rs:244-262` — `update` only touches DB columns. No file replacement → no orphan risk. | Keep. |
| Silent delete-file failure | **D** | `files.rs:284` — `let _ = tokio::fs::remove_file(&row.file_path).await;` swallows the error. | At minimum `tracing::warn!(path, error = %e, "failed to remove uploaded file")`. |
| Frontend axios lifecycle | **A** | Single `axios.create` instance (`api/index.ts:33`), reused for the page lifetime. | Keep. |
| Frontend raw `fetch` | **C** | `FilePreview.tsx:71-87` — no `AbortController`. If the component closes during a slow text fetch, the response state setter fires after unmount → React warning. React 19 silently no-ops but is still wasted bandwidth. | Add an `AbortController` and `signal` to `fetch`; abort in the effect cleanup. |

---

## 7. Graceful shutdown — **F**

| Aspect | Score | Evidence | Recommendation |
|---|---|---|---|
| Signal handling | **F** | `grep -ri 'tokio::signal\|SignalKind\|with_graceful_shutdown\|ctrl_c'` against `backend/src/` → **0 matches**. `main.rs:43, 123` runs `#[tokio::main] async fn main() { ...; axum::serve(listener, app).await.expect("...") }`. SIGTERM kills the process mid-flight. | Add before `axum::serve`: `let shutdown = async { let _ = tokio::signal::ctrl_c().await; tracing::info!("shutdown signal received"); };` then use `axum::serve(listener, app).with_graceful_shutdown(shutdown).await?;` |
| DB connection drain | **F** | `pool.close()` is never called. On SIGTERM, in-flight queries are cancelled by Postgres' `tcp_keepalives_idle`; pool connections are torn down without `DISCARD ALL`. | After `with_graceful_shutdown(...)` returns, call `pool.close().await` (sqlx ≥ 0.7 method) and `tracing::info!("pool closed")`. |
| In-flight request timeout | **F** | No grace period cap. A request that hangs forever (no per-request timeout, see §1) will keep the server alive past the shutdown signal until the OS finally reaps it. | Add a hard timer: `tokio::select! { _ = serve => {}, _ = sleep(secs(30)) => tracing::warn!("shutdown grace expired") }` to force-exit if a request is still active. |
| Log on shutdown | **F** | None. | Log when the signal arrives, when the listener closes, and when the pool drains (3 lines). |
| Frontend | **N/A** | Vite dev server / static build has its own signal handling; not in scope. | — |

---

## Cross-cutting recommendations (priority order)

1. **P0 — Add graceful shutdown.** This is a one-screen change with `with_graceful_shutdown` and `pool.close().await`. Highest ROI because every deployment will exercise it.
2. **P0 — Add `tower_http::trace::TraceLayer`.** 4 lines, gives every request a structured log line.
3. **P1 — Add per-request timeout (`TimeoutLayer` ~30 s) and per-query `statement_timeout` on the Postgres role.** Stops resource leaks at the source.
4. **P1 — Frontend axios: `timeout: 30_000` + response interceptor retry-with-backoff on idempotent verbs.** Hardens every request.
5. **P1 — Wrap the file upload in a compensation helper** that removes the temp file on INSERT failure.
6. **P2 — Make `BIND_ADDR`, `PORT`, `CORS_ALLOWED_ORIGINS`, `MAX_BODY_SIZE` env-configurable.** Spec these once and they rarely change.
7. **P2 — Frontend `React Query`: replace `retry: 1` with a predicate + exponential `retryDelay`** and skip retry on 4xx.
8. **P3 — Project-delete file cleanup.** Off the hot path; resolve on the next iteration when the upload subsystem is refactored anyway.

---

## Files reviewed

- `backend/src/main.rs`
- `backend/src/state.rs`
- `backend/src/error.rs`
- `backend/src/db/{mod.rs, pool.rs}`
- `backend/src/handlers/{mod.rs, clients.rs, projects.rs, communications.rs, tasks.rs, assets.rs, files.rs, phases.rs, members.rs, contacts.rs}`
- `backend/src/models/project_file.rs`
- `backend/migrations/006_project_files.sql`, `007_phases.sql`, `20250714000004_init_tasks.sql`
- `backend/Cargo.toml`, `backend/.env`, `backend/.gitignore`, `backend/.cargo/config.toml`
- `frontend/src/main.tsx`, `frontend/src/api/index.ts`, `frontend/src/components/FilePreview.tsx`, `frontend/src/pages/ProjectBoard.tsx`
