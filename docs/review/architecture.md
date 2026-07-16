# Architecture Review — sec-tracker

**Scope:** full-stack layout, module boundaries, and structural patterns of the
backend (Rust / Axum / sqlx / PostgreSQL) and the frontend (Vite / React 19 /
Ant Design / React Query).

## Codebase size at review time

| Surface | Lines |
|---|---|
| Backend `src/**` | ~1,800 LoC across 18 files |
| Frontend `src/**` | ~4,200 LoC across 16 files |
| Largest backend file | `handlers/files.rs` — 387 lines |
| Largest frontend file | `pages/ProjectDetail.tsx` — 1,078 lines |
| `migrations/` | 12 SQL files |

No automated tests exist anywhere in the repo (`grep` for `#[test]` /
`#[cfg(test)]` / `*.test.ts*` / `*.spec.ts*` returns no production matches;
only build artifacts in `frontend/dist/`).

---

## 1. Separation of concerns

| Score | Evidence | Recommendation |
|---|---|---|
| **C** | Backend has only three layers: `handlers/`, `models/`, `db/`. Handlers mix three concerns: HTTP routing **and** raw SQL **and** input validation. Example: `handlers/clients.rs:31-50` — `list()` writes its own `SELECT`, parses rows, and returns JSON in the same body. The same pattern repeats in every one of the 9 handler files (`grep` for `sqlx::query_as!` finds 21 inline SQL strings across handlers). There is **no `services/` or `repository/` directory** (`grep` for `service\|Repository\|repository` returns zero hits in `backend/src`). Frontend is structured `pages/`, `components/`, `api/`, `types/`, `utils/` (`frontend/src/...`), but `pages/ProjectDetail.tsx` (1,078 lines) mixes data fetching (lines 108-148), 11 mutations (lines 151-280), form state, modal state, file download logic (lines 282-294), and JSX rendering in a single function. The README at `backend/README.md:7-29` documents an architecture that mentions handlers/models/db but does not call out a service layer. | Backend: extract a `services/` (or `repo/`) layer between `handlers/` and the sqlx queries. Each handler should call e.g. `clients::list(&pool).await` and stay at the HTTP/routing level. Frontend: split `ProjectDetail.tsx` into a shell page (data wiring, query invalidation) and child tab components; the existing `PhasesTab`/`MembersTab` already prove the pattern works (see `components/PhasesTab.tsx:55-100`). The `upload_file` god-handler (`handlers/files.rs:74-170`, 97 lines, CC≈20) deserves the same treatment — split out multipart parsing, filesystem I/O, and DB persistence. |

---

## 2. Dependency direction

| Score | Evidence | Recommendation |
|---|---|---|
| **B** | Backend: `main.rs:6-10` declares modules in one direction (`handlers` → `models`/`state`/`error`; `db` → only `pool`). `grep "use crate::"` shows every handler imports from `crate::error`, `crate::models`, `crate::state` and **nothing in handlers imports another handler**, so there are no cycles. Frontend: `pages/` imports `api/`, `types/`, `utils/`, `components/` (e.g. `pages/ProjectDetail.tsx:41-56`); `components/` imports `api/` + `types/` (`components/PhasesTab.tsx:19-20`); `api/` imports only `axios` and `types/`. No upward leaks detected (`grep` for cross-page imports finds none). **One risk**: the canonical contract is duplicated — `frontend/src/types/index.ts:1` declares `// Type definitions — mirrors backend models (backend/src/models/)` and hand-codes every field (e.g. `Client` at `types/index.ts:10-21`). Any new column requires editing both `backend/src/models/client.rs` and `frontend/src/types/index.ts`; drift is not caught by any tool. | Keep the direction rules — they are correct. To close the drift risk, add a one-line CI check that greps for `serde_json::json!` snapshots against the generated TS types, or move to a schema-first approach (OpenAPI/JSON-Schema → `ts-rs` / `specta`). A pragmatic interim fix: add a comment near each TS interface pointing to its backend counterpart (the file-level comment at line 1 is the only such marker today). |

---

## 3. Coupling

| Score | Evidence | Recommendation |
|---|---|---|
| **C** | **Backend duplication** — `ensure_project_exists(pool, project_id)` is copy-pasted verbatim into 7 handler files: `handlers/communications.rs:53-64`, `tasks.rs:41-52`, `assets.rs:34-45`, `files.rs:45-56`, `phases.rs:34-45`, `members.rs:28-39`, `contacts.rs:29-40`. Each is ~10 lines of identical SQL. The COALESCE-based partial-update pattern is also duplicated everywhere (`clients.rs:134-168`, `projects.rs:139-167`, `communications.rs:153-174`, `tasks.rs:158-176`, etc.). **Backend naming** — every handler exposes two builders (`<resource>_router` flat + `project_<resource>_router` nested) wired into `main.rs:99-114` with 14 manual `.nest("/api", ...)` calls; the count grew every time a resource was added. **Frontend query-key strings** — bare strings like `'projects'`, `['communications', id]`, `['files', id]`, `['phases', projectId]`, `['files-all']` appear in 6+ files (`ProjectDetail.tsx:155,170,184,200,208,219,230,261,277,850`; `ProjectBoard.tsx:73,90,100,154`; `PhasesTab.tsx:78,94,103,112`; `MembersTab.tsx:50,66,76,86,102,112`; `CommunicationDetail.tsx:61,62,72,85,94`; `FileLibrary.tsx:41`). A rename requires finding every call site by hand. **Tight resource coupling in `ProjectDetail`** — the page touches 8 different api modules (`pages/ProjectDetail.tsx:41-49`: projects, communications, tasks, clients, assets, files, phases) and embeds their mutations inline rather than letting `PhasesTab` / `MembersTab` own them. | Backend: lift `ensure_project_exists` into `db/projects.rs` (or a `db::helpers` module) and have every handler call `db::projects::ensure_exists(&pool, id).await?`. Consider a `db::update_partial!` macro or a `db::patch!` helper that generates the COALESCE `UPDATE` from a struct + `Option<>` fields. Frontend: introduce a `queryKeys` factory (e.g. `queryKeys.projects.list()`, `queryKeys.files.byProject(id)`) and call `useQuery({ queryKey: queryKeys.projects.list() })`. Move resource mutations behind the tab components (`PhasesTab` already does this at lines 74-114) instead of having `ProjectDetail` own `updateTaskMut`, `createAssetMut`, `uploadFileMut`, etc. |

---

## 4. Cohesion

| Score | Evidence | Recommendation |
|---|---|---|
| **C** | **Backend models are highly cohesive.** Each `models/*.rs` keeps the row struct, the Create/Update DTOs, and any helpers together (e.g. `models/project.rs:18-76` owns `ProjectStatus`, `Project`, `CreateProject`, `UpdateProject`; `models/task.rs:14-58` owns `TaskStatus`, `Task`, `CreateTask`, `UpdateTask`). The DTO split is a deliberate choice and is consistent. **Backend handlers are cohesive per-resource** (`grep "use crate::models"` shows each handler pulls only its own resource). **Frontend components are cohesive** — `FilePreview.tsx` (180 lines) does file-type detection + preview; `CommunicationList.tsx` (90 lines) renders a list; both are single-purpose. **The cohesion violation is `pages/ProjectDetail.tsx`**: 1,078 lines that own 6 distinct sub-domains (project meta, communications, tasks, assets, files, phases), each with its own query, 1-3 mutations, modal state, and form state. The component name suggests it owns one thing ("the project detail screen") but in practice it owns every interaction that touches a project. By contrast, `pages/ProjectBoard.tsx` (592 lines) stays in scope (project listing + creation modal) — much closer to good cohesion. | Apply the "feature folder" layout on the frontend: `frontend/src/features/projects/{ProjectDetail,CommunicationsTab,TasksTab,AssetsTab,FilesTab,PhasesTab}/`. The `PhasesTab` and `MembersTab` already exist as `components/` but are called from `ProjectDetail`; lifting them out of the page's logic into features makes their cohesion explicit and lets `ProjectDetail` shrink to ~200 lines of query wiring + composition. Backend is already fine — no action needed there. |

---

## 5. Extensibility

| Score | Evidence | Recommendation |
|---|---|---|
| **B** | Adding a new resource follows a clear, repeatable pattern visible across the 9 existing handlers and their frontend counterparts: `migrations/NNN_*.sql` → `models/<name>.rs` (row + Create + Update) → `handlers/<name>.rs` (5 handler fns + router) → `handlers/mod.rs` re-export → `main.rs` `.nest("/api", …)` (×2 for nested + flat) → `frontend/src/types/index.ts` (3 interfaces) → `frontend/src/api/index.ts` (`<name>Api` object with 5 methods) → `pages/<screen>.tsx` integration. README `backend/README.md:71-82` documents migration ordering. **Friction points**: (a) the COALESCE partial-update SQL must be hand-written twice (once in handler, once in repo) — see the parallel between `handlers/clients.rs:134-168` and the model in `models/client.rs:54-70`. (b) Frontend query-key strings are repeated in 3-6 places per resource, so adding a query means scattering new string keys. (c) `handlers/mod.rs` must be edited to re-export each new router, and `main.rs:99-114` must add a new `.nest` line for each new resource — 2 manual touch points that the compiler cannot verify. (d) No tests means refactoring for extensibility has no safety net. | Introduce a `db_resource!` macro that generates the row-to-DTO boilerplate (Row + Create + Update + COALESCE UPDATE) from a single declarative struct. Replace the 14 `.nest("/api", …)` calls in `main.rs:99-114` with a single iteration over a `const ROUTERS: &[(&str, fn() -> Router<AppState>)]` table that the compiler checks via `inventory` or a `linkme`-style linker section. Keep the resource-folder pattern (currently `grep` shows it is mostly applied) — it is already a strength. |

---

## 6. Design patterns

| Score | Evidence | Recommendation |
|---|---|---|
| **B** | **Applied well:** (a) **DTO / Command separation** — every `models/<name>.rs` keeps the row struct decoupled from the input DTOs, so `id`/`created_at` cannot be smuggled in via JSON (e.g. `models/client.rs:18-70` defines `Client`, `CreateClient`, `UpdateClient`; the row struct is the only one that derives both `Serialize` and `sqlx::FromRow`). (b) **Unified error type** — `error.rs:21-105` defines a single `AppError` with `IntoResponse` and deterministic JSON shape `{error, message}`; sqlx constraint violations are mapped to 400 vs 404 vs 500 explicitly (`error.rs:36-80`). (c) **DI via axum `FromRef`** — `state.rs:11-20` keeps `AppState { pool }` and adds fields by adding a `FromRef` impl, exactly as the module docstring claims. (d) **Repository-style imports per resource** — `handlers/mod.rs:16-24` re-exports each resource's router builders, keeping `main.rs` wiring small. **Not applied (probably correct for MVP):** no event bus, no DI container, no plugin system, no CQRS, no saga pattern — appropriate for a single-user internal tool. **One inconsistency:** `frontend/package.json:22` declares `zustand: ^5.0.14` as a runtime dependency, but `grep` for `import.*zustand\|from 'zustand'` across `frontend/src` returns **zero matches**. The dependency is dead weight (~3 KB gzipped, but more importantly it advertises a pattern the codebase does not use). The decision record `docs/plantree/plans/sec-tracker/decisions/001-initial-tech-stack.md:59-63` records "D9: front-end state uses React Query + Zustand" — implementation never followed the decision. **One over-eager pattern:** `default_treatments` for the `Vec<String>` array columns (`products`, `security_concerns`, `goals`, `tags`) means the Rust row struct speaks directly to a Postgres `TEXT[]` via sqlx 0.8's blanket impl (`models/client.rs:9-11`). Convenient, but it hides array semantics — e.g. no support for "add one tag" or "remove one concern" without a full replace. | Remove `zustand` from `frontend/package.json:22` (or implement at least one shared UI store to honor the decision record). Keep the DTO/error/`FromRef` patterns — they are the strongest part of the backend. For array columns, decide explicitly: either keep `TEXT[]` and add per-resource helpers (`add_tag`, `remove_tag`) on the model, or normalize into junction tables when filtering/search-by-tag becomes a real requirement (the migration comment at `migrations/20250714000001_init_clients.sql:3-5` already flags this as a deferred decision). |

---

## Summary

| # | Criterion | Score |
|---|---|---|
| 1 | Separation of concerns | C |
| 2 | Dependency direction | B |
| 3 | Coupling | C |
| 4 | Cohesion | C |
| 5 | Extensibility | B |
| 6 | Design patterns | B |

## Headline finding

The codebase is **structurally honest but operationally repetitive**. The
dependency graph is acyclic and the type/DTO/error/`FromRef` choices are the
right ones for a single-user MVP. The pain is concentrated in three places:

1. **No service layer on the backend** — handlers own SQL, validation, and
   routing all at once, with 7× copy-pasted `ensure_project_exists` and 14
   manual `.nest` calls in `main.rs`.
2. **A god-page on the frontend** — `pages/ProjectDetail.tsx` (1,078 lines)
   orchestrates 6 resources with 11 mutations and 6 queries inline; the
   feature-folder pattern is implicit but not enforced.
3. **String-based query keys scattered across 6 files** — rename one key,
   grep is your only safety net.

Fixing #1 (lift a `db::helpers` module + `db::patch!` helper, table-driven
router mounting) and #2 (split `ProjectDetail` into feature tabs following
the existing `PhasesTab` / `MembersTab` template) would lift Cohesion and
Coupling from C to B without changing any public API. Removing the unused
`zustand` dependency and adopting a `queryKeys` factory closes the remaining
loose ends.
