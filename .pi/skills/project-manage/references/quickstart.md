# Quickstart

## The script

`pm` is a **stdlib-only Python script** at `scripts/pm` — no build step, no
dependencies (just Python 3). It is decoupled from the server and only talks to
a running server over HTTP:

```bash
python3 scripts/pm projects list             # run it directly, no build needed
```

`pm` talks to the API server over HTTP — it does NOT access the database
directly, and it does **not** need to run on the same machine as the server.

## Starting the server

`pm` requires a running API server. Two options:

```bash
# Local dev — serves on :3000
cargo run --manifest-path backend/Cargo.toml

# Docker (recommended for a clean host) — app on :9999 → container :3000
docker compose up -d --build
```

Wait for the startup log line:

```text
✅ 就绪检查通过 — 服务已完全启动，可接受请求
```

If the port is already in use, check with `lsof -ti:<PORT>` and kill the old
process, or use a different `PORT`.

## Targeting the API

Three ways — pick one:

```bash
# 1. Environment variable (recommended for multi-command sessions)
export PROJECT_MANAGE_URL=http://localhost:9999

# 2. Per-command flag
python3 scripts/pm --api-url http://localhost:9999 projects list

# 3. The default is http://localhost:3000 if nothing is set
```

## Global options

| Option | Default | Description |
|---|---|---|
| `--api-url URL` | `http://localhost:3000` or `$PROJECT_MANAGE_URL` | API server base URL |
| `--format json\|table` | `json` | Output format |
| `--help` | — | Show help for any command level |
| `--version` | — | Show binary version |

**Global options must come BEFORE the subcommand:**

```bash
# ✅ Correct
python3 scripts/pm --api-url http://localhost:9999 --format table projects list

# ❌ Wrong — --api-url ignored
python3 scripts/pm projects list --api-url http://localhost:9999
```

## Output formats

### JSON (default)

Pretty-printed JSON. Designed for AI consumption and piping to `jq`:

```json
[
  {
    "id": "3cf2230a-f5c8-4137-8e60-bb4016cc9180",
    "client_id": "e37e0c75-4921-4414-907c-2feb6d7af6d6",
    "name": "门户网站开发",
    "status": "in_progress",
    ...
  }
]
```

### Table (`--format table`)

Human-readable aligned columns:

```text
id                                   │ name               │ status
──────────────────────────────────────┼────────────────────┼────────────
3cf2230a-f5c8-4137-8e60-bb4016cc9180 │ 门户网站开发  │ in_progress
1 items
```

## Help

Every command level supports `--help`:

```bash
python3 scripts/pm --help                # top-level commands
python3 scripts/pm projects --help       # project subcommands
python3 scripts/pm tasks create --help   # create flags
```

## Error responses

When the API returns an error, `pm` prints the HTTP status and exits 1:

```text
error: 404 Not Found
```

Common causes:

- **Server not running**: connection refused
- **Wrong `--api-url`**: 404 on everything
- **Wrong `--project-id`**: 404 on project-scoped resources
- **Invalid `--data` JSON**: 400 Bad Request or 422 Unprocessable Entity
