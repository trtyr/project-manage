# Quickstart

## Binary location

The same binary that serves HTTP also acts as the CLI client:

```bash
./backend/target/debug/project-manage-backend           # debug build
./backend/target/release/project-manage-backend          # release build
```

The CLI talks to the API server over HTTP — it does NOT access the database
directly.

> **Naming note:** the binary is `project-manage-backend` (the crate name).
> In examples below and across the reference files, `project-manage` is used
> as shorthand for this binary — substitute the real path
> `./backend/target/debug/project-manage-backend` (or an alias you set up).

## Starting the server

The CLI requires a running API server. Start it first:

```bash
cd backend && PORT=9999 ./target/debug/project-manage-backend &
```

Wait for the startup log line:

```text
✅ 就绪检查通过 — 服务已完全启动，可接受请求
```

If the port is already in use, check with `lsof -ti:9999` and kill the old
process, or use a different `PORT`.

## Targeting the API

Three ways — pick one:

```bash
# 1. Environment variable (recommended for multi-command sessions)
export PROJECT_MANAGE_URL=http://localhost:9999

# 2. Per-command flag
./target/debug/project-manage-backend --api-url http://localhost:9999 projects list

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
project-manage --api-url http://localhost:9999 --format table projects list

# ❌ Wrong — --api-url ignored
project-manage projects list --api-url http://localhost:9999
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
project-manage --help                # top-level commands
project-manage projects --help       # project subcommands
project-manage tasks create --help   # create flags
```

## Error responses

When the API returns an error, the CLI prints the HTTP status and exits 1:

```text
CLI error: 404 Not Found
```

Common causes:

- **Server not running**: connection refused
- **Wrong `--api-url`**: 404 on everything
- **Wrong `--project-id`**: 404 on project-scoped resources
- **Invalid `--data` JSON**: 400 Bad Request or 422 Unprocessable Entity
