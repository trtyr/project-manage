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
| `DESIGN.md` | CSS/OKLCH palette and typography contract |
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
| Visual language | Inter + OKLCH tokens | Teal primary; amber accent |

## 1. Languages and source formats

| Language or format | Exact repository declaration | Role |
|---|---|---|
| Rust | `edition = "2024"` in `backend/Cargo.toml` | Backend HTTP service, handlers, models, errors, and database access |
| TypeScript | `"typescript": "~6.0.2"` in `frontend/package.json` | Frontend application, API client, types, and Vite config |
| SQL | SQLx feature `"postgres"`; `*.sql` migrations | PostgreSQL-dialect schema and data operations |
| CSS | Custom OKLCH variables specified by `DESIGN.md` | Palette, semantic states, typography, and layout styling |

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

The server composes Axum with Tower and Tower HTTP layers. The resulting
stack includes CORS handling, a 30-second request timeout, a body limit for
uploads, and structured HTTP traces.

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

Ant Design is configured with the `zh_CN` locale in `App.tsx`. Markdown
components pass `remarkGfm` through `remarkPlugins` to `ReactMarkdown`.

## 4. Build tooling and local development

| Tool | Exact manifest declaration | Purpose |
|---|---|---|
| Vite | `"vite": "^8.1.1"` | Development server and production bundler |
| React Vite plugin | `"@vitejs/plugin-react": "^6.0.3"` | React transform and HMR integration |
| TypeScript | `"typescript": "~6.0.2"` | Type checking and the `tsc -b` build step |
| Oxlint | `"oxlint": "^1.71.0"` | Frontend linting |
| Node types | `"@types/node": "^24.13.2"` | Node/Vite configuration types |
| React types | `"@types/react": "^19.2.17"` | React TypeScript declarations |
| React DOM types | `"@types/react-dom": "^19.2.3"` | React DOM TypeScript declarations |

The package scripts are also build-tooling contracts:

| Script | Exact `package.json` value | Behavior |
|---|---|---|
| `dev` | `"dev": "vite"` | Starts the Vite development server |
| `build` | `"build": "tsc -b && vite build"` | Type-checks project references, then bundles |
| `lint` | `"lint": "oxlint"` | Runs Oxlint |
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
| Schema format | 19 first-party `*.sql` migrations | Readable, diffable PostgreSQL schema history |
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

### Design contract from `DESIGN.md`

CSS uses named custom tokens with OKLCH values. The design source describes a
near-white surface, oxidized teal primary, and warm amber accent.

| CSS token | Exact OKLCH value | Intended use |
|---|---|---|
| `--bg` | `oklch(0.985 0.003 180)` | Near-white teal-tinted page background |
| `--surface` | `oklch(0.975 0.004 180)` | Cards and panels |
| `--ink` | `oklch(0.200 0.010 180)` | Body text |
| `--primary` | `oklch(0.550 0.095 180)` | Brand anchor and primary actions |
| `--accent` | `oklch(0.680 0.130 55)` | Badges and status pills |
| `--muted` | `oklch(0.500 0.008 180)` | Secondary text |

Semantic state tokens are also specified in OKLCH:

| State | Exact value |
|---|---|
| Success | `oklch(0.600 0.120 145)` |
| Warning | `oklch(0.700 0.140 65)` |
| Error | `oklch(0.550 0.180 25)` |
| Info | `oklch(0.600 0.080 200)` |

Typography is a single sans-serif family: **Inter**, with `system-ui` as the
fallback. The fixed scale runs from `0.75rem` labels through `1.5rem` hero
numbers; body line-height is `1.5` and heading line-height is `1.25`.

### Ant Design implementation in `frontend/src/theme.ts`

The React theme maps the design language to Ant Design tokens. The requested
hex anchors are present in the shared token object:

| Design role | Exact theme token | Value |
|---|---|---|
| Oxidized teal primary | `colorPrimary` | `'#148374'` |
| Warm amber accent | `colorWarning` | `'#d48042'` |
| Font | `fontFamily` | `"'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"` |
| Light algorithm | `lightTheme.algorithm` | `antdTheme.defaultAlgorithm` |
| Dark algorithm | `darkTheme.algorithm` | `antdTheme.darkAlgorithm` |

| Theme | Token or tokens | Exact value or values |
|---|---|---|
| Light | `colorBgContainer`; `colorBgLayout`; `colorText` | `'#ffffff'`; `'#f5f7f7'`; `'#1a1e1e'` |
| Dark | `colorBgContainer`; `colorBgLayout`; `colorText` | `'#1e2222'`; `'#141616'`; `'#e4e8e8'` |
| Dark primary | `darkTheme.token.colorPrimary` | `'#2db89e'` |

Both modes customize menus, buttons, cards, tables, tags, inputs, selects,
modals, and tabs. `App.tsx` selects `lightTheme` or `darkTheme` through
`ConfigProvider`, and supplies the `zh_CN` locale.

## 7. First-party source inventory

The repository’s approximate first-party source count is **101 files**:

| Bucket | Count | Scope |
|---|---:|---|
| Rust | 30 `.rs` | `backend/src/**/*.rs` |
| SQL | 18 `.sql` | `backend/migrations/` |
| TypeScript | 34 `.ts` | `frontend/src/**/*.ts` (incl. ts-rs `generated/`) |
| TSX | 19 `.tsx` | `frontend/src/**/*.tsx` |
| **Total** | **101** | Excludes dependencies; includes generated TS bindings |
