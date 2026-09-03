# project-manage — Current State (verified baseline)

> Verified snapshot produced by the 2026-09-04 post-fix-goal refresh.
> Every row below was produced by actually running the command on this
> machine against this checkout — no aspirational claims. Re-verify
> before relying on anything older than this date.

## 1. Git state

| Item | Value (2026-09-04) |
|---|---|
| Branch | `main` (default, tracks `origin/main`) |
| Working tree | clean — nothing to commit |
| HEAD | ux-functional-audit fix-goal batch (see `git log`) |
| Recent feature landings | 8 commits from the ux-functional-audit fix goal: responsive layout (L1-L3), correctness bugs (B2-B14), edit/delete capabilities (B7-B9), systemic fixes (B1/B10/B15-D1), layout polish (L4-L16), data-driven improvements (D2-D8), board global search (L13), audit plantree archive |

## 2. Verified commands

| Command | Result | Evidence |
|---|---|---|
| `cargo test --manifest-path backend/Cargo.toml` | ✅ **52 passed, 0 failed** (exit 0) | lib unittests (ts-rs bindings + session-purge test) 38 passed; `tests/smoke.rs` 14 passed against the isolated `project_manage_smoke` DB |
| `cargo clippy --manifest-path backend/Cargo.toml --all-targets -- -D warnings` | ✅ clean | "No issues found" |
| `cd frontend && npx tsc --noEmit` | ✅ clean | exit 0 |
| `cd frontend && npm run test` (vitest) | ✅ **20 passed** (1 file) | `classifyApiError` contract suite |
| `cd frontend && npm run build` | ✅ built in 2.5 s | ⚠️ emits the standing warning: JS chunk > 500 kB — see §4 |
| `cargo fmt --manifest-path backend/Cargo.toml --check` | ✅ clean | drift cleared 2026-09-03 (`style:` commit) and held since |
| `cd frontend && npx prettier --check 'src/**/*.{ts,tsx,css}'` | ✅ all formatted | — |
| `cd backend && cargo audit` (via proxy) | ⚠️ 1 vulnerability + 1 yanked warning | `rsa` 0.9.10 RUSTSEC-2023-0071 (open, no fix); `chacha20` 0.10.1 yanked; see [security-baseline.md](security-baseline.md) |
| `cd frontend && npm audit` | ✅ 0 vulnerabilities | — |

Runtime environment during verification: PostgreSQL 16 on `localhost:5432`,
database `project_manage`, all 22 migrations applied. The smoke suite runs
against a dedicated `<db>_smoke` database (created + migrated per test
process) — it no longer touches the dev DB or its `users` table (B1 fix).
The dev `users` table is empty: open the app to run `/setup` and create the
real account.

## 3. Test inventory

| Suite | Count | What it covers |
|---|---|---|
| Backend lib tests | 38 | ts-rs TypeScript export bindings (37 `.ts` files) + `purges_only_expired_sessions` (`#[sqlx::test]`, isolated temp DB) |
| Backend smoke (`tests/smoke.rs`) | 14 | health; clients; projects (incl. CRM fields); communications; tasks; phases (tree); assets; files (link type); issues; findings; people CRUD + reorder + flip-side; auth flow (setup gate → 401 → login → guarded access → logout; first-setup race tolerated) |
| Frontend vitest | 20 | `classifyApiError` contract (offline/server/validation/conflict/unknown mapping) |

Not covered by any automated test (known gaps, exercised manually /
via ts-rs bindings only): deliverables CRUD, global search, asset
reorder, task `assignee_id`/`priority` fields.

## 4. Open items & known issues

| # | Item | Severity | Notes |
|---|---|---|---|
| 1 | **Vite chunk > 500 kB** — single 1.64 MB JS bundle (gzip ~508 kB) | perf (low for an internal tool) | Pre-existing. Build succeeds; only a warning. Would need code-splitting / `manualChunks` if it ever matters. |
| 2 | `rsa` 0.9.10 RUSTSEC-2023-0071 (Marvin Attack, medium 5.9) | accepted risk | No fixed release exists; transitive via the TLS stack; backend has no RSA-key crypto surface. Tracked in [security-baseline.md](security-baseline.md). |
| 3 | `chacha20` 0.10.1 yanked (cargo audit warning) | hygiene | No advisory attached; transitive. A `cargo update` after dependents re-pin will clear it. |
| 4 | Test gaps listed in §3 | coverage | Deliverables / search / asset reorder / task assignee+priority have no dedicated smoke tests. |
| 5 | Inline-style migration (L8) is incremental by convention | hygiene | ~180 inline `style={{}}` blocks remain; new code must use `--space-N` / status tokens ([conventions.md §6.2a](conventions.md)); touched files migrate what they touch. |
| 6 | oxlint `react-hooks/exhaustive-deps` warnings in tab components | hygiene | Pre-existing pattern (`useMemo` columns with mutation deps); warnings only, no errors. |

## 5. Deferred / future work (from plantree)

- User-management UI, SSO, multi-tenancy (`users.organization_id`
  placeholder exists; see `docs/plantree/plans/authentication/`).
- Search enhancements (D9) — revisit when task/issue/finding data grows.
- No active plans — plantree plans (authentication,
  client-issues-tracking, detail-ia, ux-functional-audit) are all
  **Done / archived**; the ux-functional-audit fix goal landed
  2026-09-04.

## 6. How to re-verify

```bash
cargo test --manifest-path backend/Cargo.toml          # 52 passed
cargo clippy --manifest-path backend/Cargo.toml --all-targets -- -D warnings
cd frontend && npx tsc --noEmit && npm run test && npm run build
cargo fmt --manifest-path backend/Cargo.toml --check
```
