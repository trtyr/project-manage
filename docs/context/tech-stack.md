# project-manage technology stack

## Purpose and verification scope

This document records the technology choices used by **project-manage**, an
internal project-tracking system for service delivery teams. It is organized
by purpose so runtime, build, database, and design decisions can be located
without reading the whole repository.

| Evidence source | What it verifies |
|---|---|
| `backend/Cargo.toml` | Rust edition and backend crate versions/features |
| `backend/.cargo/config.toml`; `backend/README.md` | Dev URL and PostgreSQL 16 prerequisite |
| `frontend/package.json` | Frontend runtime, UI, data, and build-tool ranges |
| `frontend/vite.config.ts` | Development port and `/api` proxy topology |
| `frontend/tsconfig.json` | TypeScript project references |
| `frontend/.oxlintrc.json` | Oxlint plugins and enforced rules |
| `DESIGN.md` | Geist design contract: palette, typography, layout, components |
| `frontend/src/theme.ts` | Ant Design light/dark theme implementation |

Package version strings below quote the repository manifests. PostgreSQL 16 is
the runtime prerequisite recorded in `backend/README.md`. Leading `^` or `~`
range operators remain intact so the declarations are exact.

## Stack at a glance

| Purpose | Technology | Baseline |
|---|---|---|
| API server | Rust 2024 + Axum | Axum `0.8.9` |
| Async execution | Tokio | `1.52.3`, `full` |
| Persistence | SQLx + PostgreSQL | SQLx `0.8`; PostgreSQL `16` |
| Browser application | React + TypeScript | React `19.2.7`; TypeScript `6.0.2` |
| SPA delivery | Vite | `8.1.1` |
| Component system | Ant Design | `5.29.3` |
| Server state | TanStack React Query | `5.101.2` |
| Linting | Oxlint | `1.71.0` |
| Visual language | Geist (Vercel) tokens | Neutral grayscale + blue `#0070f3`; Geist Sans/Mono |

## 1. Languages and source formats

| Language or format | Exact repository declaration | Role |
|---|---|---|
| Rust | `edition = "2024"` in `backend/Cargo.toml` | Backend HTTP service, handlers, models, errors, and database access |
| TypeScript | `"typescript": "~6.0.2"` in `frontend/package.json` | Frontend application, API client, types, and Vite config |
| SQL | SQLx feature `"postgres"`; `*.sql` migrations | PostgreSQL-dialect schema and data operations |
| CSS | Custom properties specified by `DESIGN.md` (Geist system) | Palette, semantic states, typography, and layout styling |

The TypeScript project-reference coordinator at `frontend/tsconfig.json` has
no compiler-version field of its own. It delegates to the two exact project
references below:

| Reference | Exact `frontend/tsconfig.json` string | Purpose |
|---|---|---|
| Application | `"path": "./tsconfig.app.json"` | Browser application compilation |
| Node/Vite | `"path": "./tsconfig.node.json"` | Vite configuration compilation |

## 2. Backend stack

`backend/Cargo.toml` is the source of truth for the Rust crate versions and
feature flags. The crate package itself is `project-manage-backend` at `0.1.0`.

### HTTP and asynchronous runtime

| Component | Exact manifest declaration | Purpose |
|---|---|---|
| Axum | `axum = { version = "0.8.9", features = ["multipart"] }` | HTTP routing, extractors, JSON responses, and multipart uploads |
| Tokio | `tokio = { version = "1.52.3", features = ["full"] }` | Async executor, timers, TCP, signals, and shutdown |
| Tower | `tower = { version = "0.5", features = ["timeout"] }` | Request timeout middleware |
| Tower HTTP | `tower-http = { version = "0.7.0", features = ["cors", "fs", "trace"] }` | CORS, filesystem support, and HTTP tracing |

### Persistence, serialization, and common types

| Component | Exact manifest version/features | Purpose |
|---|---|---|
| SQLx | `version = "0.8"` | PostgreSQL pool and typed database integration |
| SQLx runtime | `"runtime-tokio"`, `"tls-rustls"` | Tokio runtime and Rustls TLS integration |
| SQLx database | `"postgres"`, `"chrono"`, `"uuid"` | PostgreSQL plus date/time and UUID mappings |
| SQLx tooling | `"macros"`, `"migrate"` | Query macros and migration API support |
| Serde | `serde = { version = "1.0.228", features = ["derive"] }` | Derive-based request/response serialization |
| Serde JSON | `serde_json = "1.0.150"` | JSON encoding and decoding |
| Chrono | `chrono = { version = "0.4.45", features = ["serde"] }` | Date/time values, including `DateTime<Utc>` |
| UUID | `uuid = { version = "1.23.5", features = ["v4", "serde"] }` | UUID v4 identifiers and serialization |

### Middleware, errors, configuration, and observability

| Component | Exact manifest version/features | Purpose |
|---|---|---|
| Tracing | `tracing = "0.1.44"` | Structured application and request logging |
| Tracing subscriber | `tracing-subscriber = { version = "0.3.23", features = ["env-filter"] }` | Log initialization and `RUST_LOG` filtering |
| Thiserror | `thiserror = "2.0"` | Derive support for the unified application error type |
| Dotenvy | `dotenvy = "0.15"` | Load `.env` values at process startup |
| Argon2 | `argon2 = "0.5.3"` | Password hashing (argon2id, OWASP-grade default params) |
| Tower Sessions | `tower-sessions = "0.14"` | Cookie-backed session middleware |
| Tower Sessions SQLx store | `tower-sessions-sqlx-store = { version = "0.15", features = ["postgres"] }` | Postgres-backed session store (`public.session` table) |
| Time | `time = "0.3"` | chrono↔time bind conversions for `query!` macros (sqlx `time` feature is force-enabled by the session store) |
| Reqwest | `reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "json"] }` | Startup readiness self-check (`GET /api/health` on loopback); dev-dependency adds `cookies` for smoke-test session round-trips |

The server composes Axum with Tower and Tower HTTP layers. The resulting
stack includes session management (public/guarded split with a fail-closed
auth middleware), CORS handling, a 30-second request timeout, a body limit for
uploads, static SPA serving, and structured HTTP traces. The
`tower-sessions 0.14 / core 0.14 / sqlx-store 0.15` pairing was verified
2026-08-27 (first store release using core 0.14).

## 3. Frontend stack

`frontend/package.json` is private and uses ES modules. The dependency strings
below are quoted exactly, including their semver range operators.

### UI runtime, routing, and data

| Component | Exact `package.json` string | Purpose |
|---|---|---|
| React | `"react": "^19.2.7"` | Component runtime |
| React DOM | `"react-dom": "^19.2.7"` | Browser renderer |
| React Router | `"react-router-dom": "^7.18.1"` | SPA routes and navigation |
| React Query | `"@tanstack/react-query": "^5.101.2"` | Server-state cache, fetching, and invalidation |
| Axios | `"axios": "^1.18.1"` | `/api` HTTP client |

### Components, icons, and content

| Component | Exact `package.json` string | Purpose |
|---|---|---|
| Ant Design | `"antd": "^5.29.3"` | Component library and theme token consumer |
| Ant Design icons | `"@ant-design/icons": "^5.6.1"` | UI icons |
| React Markdown | `"react-markdown": "^10.1.0"` | Markdown rendering in communication details |
| Remark GFM | `"remark-gfm": "^4.0.1"` | GitHub-flavored Markdown support |
| dnd-kit (devDep) | `"@dnd-kit/core": "^6.3.1"`, `"@dnd-kit/sortable": "^10.0.0"`, `"@dnd-kit/utilities": "^2.2.2"` | Drag-and-drop reorder in `AssetsTab` / `MembersTab` |

Ant Design is configured with the `zh_CN` locale in `App.tsx`. Markdown
components pass `remarkGfm` through `remarkPlugins` to `ReactMarkdown`.

## 4. Build tooling and local development

| Tool | Exact manifest declaration | Purpose |
|---|---|---|
| Vite | `"vite": "^8.1.1"` | Development server and production bundler |
| React Vite plugin | `"@vitejs/plugin-react": "^6.0.3"` | React transform and HMR integration |
| TypeScript | `"typescript": "~6.0.2"` | Type checking and the `tsc -b` build step |
| Oxlint | `"oxlint": "^1.71.0"` | Frontend linting |
| Vitest | `"vitest": "^4.1.10"` | Frontend unit tests (`npm run test`) |
| Prettier | `"prettier": "^3.9.6"` | Frontend formatting (`format` / `format:check`) |
| Node types | `"@types/node": "^24.13.2"` | Node/Vite configuration types |
| React types | `"@types/react": "^19.2.17"` | React TypeScript declarations |
| React DOM types | `"@types/react-dom": "^19.2.3"` | React DOM TypeScript declarations |

The package scripts are also build-tooling contracts:

| Script | Exact `package.json` value | Behavior |
|---|---|---|
| `dev` | `"dev": "vite"` | Starts the Vite development server |
| `build` | `"build": "tsc -b && vite build"` | Type-checks project references, then bundles |
| `lint` | `"lint": "oxlint"` | Runs Oxlint |
| `test` | `"test": "vitest run"` | Runs the vitest suite (node env; `classifyApiError` contract tests) |
| `test:watch` | `"test:watch": "vitest"` | Vitest in watch mode |
| `format` | `"format": "prettier --write 'src/**/*.{ts,tsx,css}'"` | Formats frontend sources |
| `format:check` | `"format:check": "prettier --check 'src/**/*.{ts,tsx,css}'"` | Verifies formatting |
| `preview` | `"preview": "vite preview"` | Serves the production build locally |

### Vite development topology

`frontend/vite.config.ts` sets the following exact values:

| Setting | Exact source value | Result |
|---|---|---|
| Port | `port: 5173` | Browser development server at `:5173` |
| Proxy route | `'/api'` | Forwards backend API requests |
| Proxy target | `target: 'http://localhost:3000'` | Backend development server at `:3000` |
| Proxy behavior | `changeOrigin: true` | Rewrites the request origin for the proxy |

### Oxlint configuration

`frontend/.oxlintrc.json` enables these exact plugins:

`"plugins": ["react", "typescript", "oxc"]`

| Rule | Exact configuration | Severity/behavior |
|---|---|---|
| `react/rules-of-hooks` | `"react/rules-of-hooks": "error"` | Hooks rule violations fail lint |
| `react/only-export-components` | `"react/only-export-components": ["warn", { "allowConstantExport": true }]` | Warns on non-component exports while allowing constants |

## 5. Database and migration strategy

| Concern | Technology or exact evidence | Project decision |
|---|---|---|
| Database server | PostgreSQL `16` | Primary relational database and SQL dialect |
| Client layer | SQLx `0.8` with `"postgres"` | Async PostgreSQL pool and query execution |
| TLS/runtime | `"runtime-tokio"`, `"tls-rustls"` | Tokio execution with Rustls support |
| Schema format | 22 first-party `*.sql` migrations | Readable, diffable PostgreSQL schema history |
| Build-time URL | `DATABASE_URL = { value = "postgres://localhost:5432/project_manage", force = false }` | Cargo development default; an explicit shell value wins |

Migrations use **sqlx-migrate at runtime, not compile-time macros**. The
backend loads `./migrations` with `migrate::Migrator::new(...)` and applies
pending files with `migrator.run(pool)`. This keeps migration SQL visible and
editable in the repository instead of embedding it with `sqlx::migrate!()`.

The distinction is specifically about migration packaging. The manifest does
enable the exact SQLx feature `"macros"`, and selected handlers use
`sqlx::query!` for CRUD statements; the migration runner itself remains the
runtime `Migrator` path described above.

## 6. Design tokens and visual system

### Geist (Vercel) design system in `frontend/src/index.css`

The visual language (re-designed 2026-09-07) is the Geist system: a
pure-neutral grayscale, one blue accent, 1px hairline borders instead of
shadows, and Geist Sans/Mono typography (mono for dates, sizes, identifiers).
Dark mode is a first-class peer of light mode — tokens swap on `html.dark`,
and an inline `index.html` script applies the persisted theme pre-paint.

| CSS token | Light | Dark | Intended use |
|---|---|---|---|
| `--bg` | `#ffffff` | `#000000` | Page background |
| `--bg-subtle` | `#fafafa` | `#0a0a0a` | Sidebar rail, hover fills, card headers |
| `--surface-raised` | `#ffffff` | `#161616` | Dropdowns, popovers, modals, toasts |
| `--hairline` | `#eaeaea` | `#262626` | Dividers and card borders |
| `--hairline-strong` | `#c9c9c9` | `#3d3d3d` | Control borders on hover |
| `--ink` / `--ink-2` / `--ink-3` | `#171717` / `#666` / `#888` | `#ededed` / `#a1a1a1` / `#6e6e6e` | Text scale |
| `--blue` | `#0070f3` | `#3291ff` | Single accent: primary buttons, links, focus rings |
| `--green` / `--amber` / `--red` / `--purple` / `--teal` | `#0e9f6e` / `#f5a623` / `#ee0000` / `#7928ca` / `#0d9488` | `#29d398` / `#f5a623` / `#ff5f56` / `#9e7aff` / `#50e3c2` | Status dots & pills (`ui/Pill` tones) |

Radii: 6px controls, 8px cards/modals. Controls are 32px (`controlHeightSM`
26). Shadows are reserved for floating layers only (`--shadow-md`,
`--shadow-lg`). Tooltips and toasts are always inverted (dark chip in light
mode and vice versa). Typography: **Geist Sans** 400/500/600 + **Geist Mono**
400/500 via `@fontsource`, with the system CJK stack as fallback.

### Ant Design implementation in `frontend/src/theme.ts`

The React theme maps the same language onto AntD tokens:

| Design role | Exact theme token | Value |
|---|---|---|
| Accent | `colorPrimary` | `'#0070f3'` (light) / `'#3291ff'` (dark) |
| Fonts | `fontFamily` / `codeFontFamily` | `FONT_SANS` / `FONT_MONO` (exported) |
| Radii | `borderRadius` / `borderRadiusLG` | `6` / `8` |
| Light algorithm | `lightTheme.algorithm` | `antdTheme.defaultAlgorithm` |
| Dark algorithm | `darkTheme.algorithm` | `antdTheme.darkAlgorithm` |

Both modes customize tables, menus, buttons, segmented controls, tabs and
tags through component tokens. `App.tsx` selects `lightTheme` or `darkTheme`
through `ConfigProvider`, and supplies the `zh_CN` locale.

## 7. First-party source inventory

The repository's approximate first-party source count is **124 files**
(counted 2026-08-30 with `fd`):

| Bucket | Count | Scope |
|---|---:|---|
| Rust (server) | 35 `.rs` | `backend/src/**/*.rs` |
| SQL | 22 `.sql` | `backend/migrations/` |
| TypeScript | 42 `.ts` | `frontend/src/**/*.ts` (incl. ts-rs `generated/`) |
| TSX | 25 `.tsx` | `frontend/src/**/*.tsx` |
| **Total** | **124** | Excludes dependencies; includes generated TS bindings |
