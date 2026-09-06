# project-manage — Current State (verified baseline)

> Verified snapshot produced by the 2026-09-06 auth-hardening refresh
> (second pass of the day, after the asset-credentials batch).
> Every row below was produced by actually running the command on this
> machine against this checkout — no aspirational claims. Re-verify
> before relying on anything older than this date.

## 1. Git state

| Item | Value (2026-09-06) |
|---|---|
| Branch | `main` (default, tracks `origin/main`) |
| Working tree | asset-credentials + auth-hardening batches committed (17e7ddd, pushed); backup system in the working tree at snapshot time |
| HEAD | ux-functional-audit fix-goal batch + working tree (see `git log`) |
| Recent feature landings | **Asset credentials (2026-09-06)**: `asset_credentials` child table (migration 023) replacing the single free-text `assets.credentials` column; new handler/model + `ensure_asset_in_project` guard; read-only `credential_count` on every `Asset` row; frontend credential drawer; ts-rs + smoke coverage. **Auth hardening (2026-09-06)**: `POST /api/auth/password` (change password, requires current one, revokes the user's other sessions via `user_sessions` — migration 024); login throttle (5 failures → 15-min lockout, `429 rate_limited`); session-id cycling at login/setup/password-change (fixation defense); dummy-hash timing equalizer on unknown usernames; frontend `ChangePasswordModal` + 429-aware login/classifier. **Import/export system (2026-09-06)**: `handlers/backup.rs` — `GET /api/export` (JSON snapshot of all 12 business tables, original IDs), `GET /api/export/archive` (ZIP: manifest + uploads), `POST /api/import` / `POST /api/import/archive` (transactional replace-all restores; auth tables untouched; `confirm_replace_all` guard); frontend `/backup` page with destructive-import confirmation; zip 8.x dependency (deflate-only). |

## 2. Verified commands

| Command | Result | Evidence |
|---|---|---|
| `cargo test --manifest-path backend/Cargo.toml` | ✅ **61 passed, 0 failed** (exit 0) | lib unittests (ts-rs bindings + session-purge test) 42 passed; `tests/smoke.rs` 19 passed against the isolated `project_manage_smoke` DB (backup roundtrips use dedicated `<db>_smoke_backup_{json,archive}` databases) |
| `cargo clippy --manifest-path backend/Cargo.toml --all-targets -- -D warnings` | ✅ clean | "Finished" with no diagnostics |
| `cd frontend && npx tsc --noEmit` | ✅ clean | exit 0 |
| `cd frontend && npm run test` (vitest) | ✅ **21 passed** (1 file) | `classifyApiError` contract suite (incl. the 429 → `rate_limited` pin) |
| `cd frontend && npm run build` | ✅ built in ~13 s | ⚠️ emits the standing warning: JS chunk > 500 kB — see §4 |
| `cargo fmt --manifest-path backend/Cargo.toml --check` | ✅ clean | held after the auth-hardening batch |
| `cd frontend && npm run lint` (oxlint) | ⚠️ 9 pre-existing warnings, 0 errors | `react-hooks/exhaustive-deps` in the tab components — standing pattern, see §4 #6 |
| `cd backend && cargo audit` (via proxy) | ⚠️ 1 vulnerability + 1 yanked warning (unchanged) | `rsa` 0.9.10 RUSTSEC-2023-0071 (open, no fix); `chacha20` 0.10.1 yanked; see [security-baseline.md](security-baseline.md) |

Runtime environment during verification: PostgreSQL 17 (docker container
`engram-demo-pg`, `pgvector/pgvector:pg17`, trust auth) on `localhost:5432`,
database `project_manage`, all **24** migrations applied (the container
crash-recovered mid-session on 2026-09-06 — wait for `pg_isready` before
cargo/`sqlx` runs after a restart; `sqlx::query!` macro compilation needs
the live DB). The smoke suite runs against a
dedicated `<db>_smoke` database (created + migrated per test process, also
24 migrations) — it does not touch the dev DB. `DATABASE_URL` must include
an explicit user (e.g. `postgres://postgres@localhost:5432/project_manage`)
when talking to this container; the default in `.cargo/config.toml` has no
user part and sqlx-cli falls back to a nonexistent `anonymous` role.
`sqlx-cli` was installed (cargo, user-level) during this refresh to apply
migrations by hand.

## 3. Test inventory

| Suite | Count | What it covers |
|---|---|---|
| Backend lib tests | 42 | ts-rs TypeScript export bindings (41 `.ts` files) + `purges_only_expired_sessions` (`#[sqlx::test]`, isolated temp DB) |
| Backend smoke (`tests/smoke.rs`) | 19 | health; clients; projects (incl. CRM fields); communications; tasks; phases (tree); assets; asset credentials (typed CRUD, sort-order append, COALESCE update, empty-label/`cred_type` 400s, foreign-asset 404, cascade on asset delete, `credential_count` tracking); files (link type); issues; findings; people CRUD + reorder + flip-side; auth flow (setup gate → 401 → login → guarded access → logout); **password change** (wrong current → 400, short new → 400, success → 204, other session revoked → 401, current session survives, old password dead); **login rate limit** (5 failures → lockout, correct creds while locked → `429 rate_limited`, business surface unaffected); **backup JSON roundtrip** (export → wipe → import restores identical IDs incl. credentials, tampered/unconfirmed manifests → 400); **backup archive roundtrip** (ZIP with uploads → wipe → import restores rows + file bytes, download byte-identical) |
| Frontend vitest | 21 | `classifyApiError` contract (offline/server/validation/conflict/rate_limited/unknown mapping) |

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
| 7 | Asset credential secrets are plain TEXT at rest | accepted (internal tool) | Masking is frontend-only; no per-row encryption. Documented in [domain.md §2.2b](domain.md) and the AGENTS.md Danger Zone. Revisit only if the threat model changes. |
| 8 | `pm` CLI (`.pi/skills/project-manage/pm`) has no `credentials` resource | tooling gap | The command-line client still exposes the original 9 resources; managing asset credentials goes through the SPA for now. |
| 9 | Login throttle is in-memory (resets on restart) | accepted (single user) | A restart clears the 15-min lockout — fail-open by design; the argon2id password remains the real control. Going DB-backed would survive restarts but adds no practical protection for a single account. |

## 5. Deferred / future work (from plantree)

- User-management UI, SSO, multi-tenancy (`users.organization_id`
  placeholder exists; see `docs/plantree/plans/authentication/`).
- Search enhancements (D9) — revisit when task/issue/finding data grows.
- `pm` CLI: add the `asset-credentials` sub-resource (§4 #8).
- No active plans — plantree plans (authentication,
  client-issues-tracking, detail-ia, ux-functional-audit) are all
  **Done / archived**; the ux-functional-audit fix goal landed
  2026-09-04.

## 6. How to re-verify

```bash
cargo test --manifest-path backend/Cargo.toml          # 59 passed
cargo clippy --manifest-path backend/Cargo.toml --all-targets -- -D warnings
cd frontend && npx tsc --noEmit && npm run test && npm run build
cargo fmt --manifest-path backend/Cargo.toml --check
```
