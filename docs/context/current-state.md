# project-manage — Current State (verified baseline)

> Verified snapshot produced by the 2026-08-30 docs refresh
> (`project-init` re-read). Every row below was produced by actually
> running the command on this machine against this checkout — no
> aspirational claims. Re-verify before relying on anything older than
> this date.

## 1. Git state

| Item | Value (2026-08-30) |
|---|---|
| Branch | `main` (default) |
| Working tree | clean — nothing to commit |
| HEAD | `e131686` `fix(ui): wrap overview columns on narrow windows` |
| Recent feature landings | `d3620ff` auth post-login cache gaps; `6056366` session auth; `cf20d3b` issues & findings; `d7f83ca` 5-tab project detail |

## 2. Verified commands

| Command | Result | Evidence |
|---|---|---|
| `cargo test --manifest-path backend/Cargo.toml` | ✅ **51 passed, 0 failed** (exit 0) | lib unittests (ts-rs export bindings) 37 passed; `tests/smoke.rs` 14 passed; main + doc tests 0 |
| `cargo clippy --manifest-path backend/Cargo.toml --all-targets -- -D warnings` | ✅ clean | "No issues found" |
| `cd frontend && npx tsc --noEmit` | ✅ clean | exit 0 |
| `cd frontend && npm run test` (vitest) | ✅ **20 passed** (1 file) | `classifyApiError` contract suite |
| `cd frontend && npm run build` | ✅ built in 2.7 s | ⚠️ emits the standing warning: JS chunk 1,644.26 kB (> 500 kB limit; gzip 508.02 kB) — see §4 |
| `cargo fmt --manifest-path backend/Cargo.toml --check` | ❌ **FAILS** | formatting drift in 11 files — see §4 |
| `cd frontend && npx prettier --check 'src/**/*.{ts,tsx,css}'` | ✅ all formatted | — |
| `cd backend && cargo audit` (via proxy) | ⚠️ 1 vulnerability + 1 yanked warning | `rsa` 0.9.10 RUSTSEC-2023-0071 (open, no fix); `chacha20` 0.10.1 yanked; 296 deps scanned |
| `cd frontend && npm audit` | ✅ 0 vulnerabilities | — |

Runtime environment during verification: PostgreSQL 16 accepting
connections on `localhost:5432`, database `project_manage` with all 22
migrations applied (14 relations in `public`: 11 business tables +
`users` + `session` + `_sqlx_migrations`). The smoke suite ran against
this live DB.

## 3. Test inventory

| Suite | Count | What it covers |
|---|---|---|
| Backend lib tests | 37 | ts-rs TypeScript export bindings — regenerates `frontend/src/types/generated/` (37 `.ts` files, incl. `Issue`, `Finding`, `UserPublic`, `SetupRequest`) |
| Backend smoke (`tests/smoke.rs`) | 14 | health; clients; projects (incl. CRM fields); communications; tasks; phases (tree); assets; files (link type); **issues**; **findings**; people CRUD + reorder + flip-side; **auth flow** (setup gate → 401 → login → guarded access → logout) |
| Frontend vitest | 20 | `classifyApiError` contract (offline/server/validation/conflict/unknown mapping) |

Not covered by any automated test (known gaps, exercised manually /
via ts-rs bindings only): deliverables CRUD, global search, asset
reorder, task `assignee_id`/`priority` fields.

## 4. Open items & known issues

| # | Item | Severity | Notes |
|---|---|---|---|
| 1 | **`cargo fmt --check` fails** — 11 files have formatting drift: `app.rs`, `db/helpers.rs`, `error.rs`, `handlers/{assets,auth,deliverables,findings,issues,projects}.rs`, `handlers/mod.rs`, `models/mod.rs`, `tests/smoke.rs` | hygiene | Contradicts the "formatter-adopted" convention ([conventions.md](conventions.md) / AGENTS.md). Fix: `just fmt` (one command, mechanical). Found during this refresh; not fixed here (docs-only pass). |
| 2 | **Vite chunk > 500 kB** — single 1.64 MB JS bundle (gzip 508 kB) | perf (low for an internal tool) | Pre-existing. Build succeeds; only a warning. Would need code-splitting / `manualChunks` if it ever matters. |
| 3 | `rsa` 0.9.10 RUSTSEC-2023-0071 (Marvin Attack, medium 5.9) | accepted risk | No fixed release exists; transitive via the TLS stack; backend has no RSA-key crypto surface. Tracked in [security-baseline.md](security-baseline.md). |
| 4 | `chacha20` 0.10.1 yanked (cargo audit warning) | hygiene | First observed 2026-08-30. No advisory attached; transitive. A `cargo update` after dependents re-pin will clear it. |
| 5 | Test gaps listed in §3 | coverage | Deliverables / search / asset reorder / task assignee+priority have no dedicated smoke tests. |
| 6 | Docs drift (fixed 2026-08-30) | resolved | `docs/context/` predated three landed features (auth, issues & findings, 5-tab detail IA) and `domain.md` contradicted `deploy.md` on auth. All nine docs refreshed + this file added + AGENTS.md synced in this pass. |

## 5. Deferred / future work (from plantree, not in flight)

- User-management UI, SSO, multi-tenancy (`users.organization_id`
  placeholder exists; see `docs/plantree/plans/authentication/`).
- No active plans — all three plantree plans (authentication,
  client-issues-tracking, detail-ia) are **Done / archived**.

## 6. How to re-verify

```bash
cargo test --manifest-path backend/Cargo.toml          # 51 passed
cargo clippy --manifest-path backend/Cargo.toml --all-targets -- -D warnings
cd frontend && npx tsc --noEmit && npm run test && npm run build
cargo fmt --manifest-path backend/Cargo.toml --check   # currently red — see §4.1
```
