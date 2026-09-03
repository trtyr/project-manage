# Re-verification evidence (fix goal mtln31gn-b55dpv, AFTER state)

> Ran 2026-09-04 00:49 against commit `b639b96` (HEAD of the fix goal,
> served via `cd backend && PORT=3001 STATIC_DIR=../frontend/dist cargo run`).

## What's here

| File | Content |
|---|---|
| `reverify.js` | The self-contained playwright probe (geometry + a11y + B2 + B4/L9) |
| `run-output.txt` | Raw console output of the recorded run |
| `reverify-results.json` | Machine-readable results of the recorded run |

**Note on `../geometry.json` / `../report.json`:** those are the audit's
**BEFORE** snapshots (narrow `offscreen-clickable = 6` per page,
`unnamedIconButtons ≥ 26`) — kept as the historical baseline this
directory should be compared against.

## Recorded results (AFTER)

| Check | Result |
|---|---|
| narrow(390px) offscreen-clickable — board / files / detail | **0 / 0 / 0** (was 6 per page) |
| desktop(1440px) unnamed icon-only buttons — all 7 states | **2-3 per page, all antd internals** (input clear icon ×2, tabs overflow `ant-tabs-nav-more`; /files adds the page's own `Input.Search` suffix button) — **first-party icon buttons = 0** (was 26-45). The sidebar logout button initially slipped through as the mystery `ant-btn-text` residual — it now carries `aria-label="登出（…）"` (goal-audit round 4) |
| desktop tiny targets (<24px height) — board / files / detail | **first-party = 0**; the remainder are antd internals: `ant-input-clear-icon` (12px, hidden until input has text), `ant-switch` (22px — antd's default size after the L6 small→default fix; 🌙/☀️ emoji give it a visible label) |
| B2 comm-modal default time | first open `01:16:00`, second open `01:16:03` → **refreshed=true** |
| B4 phase tags (light) | 进行中 `rgba(20,131,116,.1)` + teal tint; 已完成 green 12% tint — all `transparent=false` |
| L9 tokens (light) | `#2d8659 / #d48042 / #ff4d4f / #722ed1 / accent #d48042` (literal) |
| B4/L9 (dark, real `localStorage.theme=dark` toggle) | tags render `rgb(45,184,158)` family; tokens `#5bbf8a / #e0a560 / #ff7875 / #9254de / #e0a560` |
| B10 mutation-error boundary | see `b10-offline-probe.md` — 3 auditor-flagged sites each surface exactly one classified toast under total network failure |

## How to reproduce

```bash
# 1. server (any free port)
cd backend && PORT=3001 STATIC_DIR=../frontend/dist cargo run

# 2. account (users table is empty after B1 cleanup — create a throwaway)
curl -s -X POST http://localhost:3001/api/auth/setup \
  -H 'Content-Type: application/json' \
  -d '{"username":"probe@verify.local","password":"verify-pass-123"}'

# 3. probe (playwright 1.62 + chromium; resolve from any node_modules that has it)
NODE_PATH=/path/to/node_modules node reverify.js \
  http://localhost:3001 probe@verify.local verify-pass-123 \
  <project-uuid>

# 4. cleanup the throwaway account
psql ... "DELETE FROM session; DELETE FROM users WHERE username='probe@verify.local'"
```

The probe is scrollable-ancestor-aware (elements inside a horizontal
scroll container are reachable by swipe and not counted), matching the
audit probe's semantics.
