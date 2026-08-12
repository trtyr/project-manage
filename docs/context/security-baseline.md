# Dependency Security Baseline

> Living record of dependency-audit findings. Re-run the audit commands below
> anytime; this page tracks what was found, what was fixed, and what remains.

- **Captured**: 2026-07-15 · **Last reviewed**: 2026-08-12
- **Audited by**: `cargo audit` (cargo-audit 0.22.2, RustSec advisory-db) + `npm audit`
- **Re-run anytime**:
  - backend: `cd backend && HTTPS_PROXY=http://127.0.0.1:12543 cargo audit`
  - frontend: `cd frontend && npm audit`

## Current status (2026-08-12)

| Surface | Vulnerabilities | Notes |
|---|---|---|
| Frontend | **0** | All 4 fixed via `npm audit fix` (react-router-dom 7.18.1→7.18.2 + transitive). |
| Backend | **1** (`rsa`) + 0 warnings | `event-listener` unsound warning cleared (`cargo update`); `rsa` has no upstream fix. |

## Backend — `cargo audit`

| Crate | Version | ID | Severity | Status |
|---|---|---|---|---|
| `rsa` | 0.9.10 | [RUSTSEC-2023-0071](https://rustsec.org/advisories/RUSTSEC-2023-0071) | medium (5.9) | **Open — no fixed release.** Transitive via `reqwest`/TLS stack. Low exposure: backend has no RSA-key crypto surface and the Marvin Attack needs timing access. Monitor upstream; revisit when a fixed `rsa` lands. |
| `event-listener` | ~~5.4.1~~ → 5.4.2 | [RUSTSEC-2026-0221](https://rustsec.org/advisories/RUSTSEC-2026-0221) | ~~unsound~~ | **Fixed 2026-08-12** via `cargo update -p event-listener` (`!Send` tags via `StackSlot`). |

## Frontend — `npm audit`

| Package | Range | Severity | Status |
|---|---|---|---|
| `react-router` / `react-router-dom` | 7.12.0–7.18.1 | **high** | **Fixed 2026-08-12** — bumped to 7.18.2 (`npm audit fix`). [GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2) RSC-mode CSRF bypass. |
| `nanoid` | < 3.3.17 | **high** | **Fixed 2026-08-12** — transitive, bumped via `npm audit fix`. |
| `postcss` | <= 8.5.22 | moderate | **Fixed 2026-08-12** — transitive (Vite build pipeline), bumped via `npm audit fix`. |

## Remediation log

- 2026-08-12 — frontend: `npm audit fix` cleared all 4 (react-router-dom CSRF + nanoid + postcss). `npm audit` now reports 0.
- 2026-08-12 — backend: `cargo update -p event-listener` (5.4.1→5.4.2) cleared the unsound warning.
- Remaining: `rsa` 0.9.10 (RUSTSEC-2023-0071) — no fix available; monitor.
