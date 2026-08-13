---
name: project-manage-cli
description: >
  Use the standalone `pm` CLI to manage project-manage data (projects, clients,
  tasks, phases, people, assets, files, communications, deliverables) over HTTP.
  A thin HTTP client decoupled from the server — talks to any running
  project-manage server via --api-url or $PROJECT_MANAGE_URL. LOAD WHEN: the user
  wants to query/create/update/delete project-manage data programmatically or from
  the command line, without the web UI, or needs structured JSON output for
  further processing. TRIGGERS: pm CLI, project-manage 命令行, 操控 project-manage,
  pm projects, pm clients, pm search, project-manage list/search/create/update.
---

# pm CLI

`pm` is the standalone project-manage command-line client — it manages
projects, clients, tasks, phases, people, assets, files, communications, and
deliverables via HTTP API calls. It is **decoupled from the server binary**
(`project-manage-backend`) and only talks to a running server over HTTP.

## When to use

- An AI agent needs to interact with project-manage data programmatically
- You hear "pm CLI", "pm 命令行", or "操控 project-manage"
- A task involves creating/updating/querying project-manage without the web UI
- You need structured JSON output for further processing

## Quick start

```bash
# 1. Start the server (local) — or `docker compose up -d` for Docker
cargo run --manifest-path backend/Cargo.toml

# 2. Build the standalone CLI (once)
cargo build --manifest-path cli/Cargo.toml

# 3. Point the CLI at the server (Docker serves on :9999, local on :3000)
export PROJECT_MANAGE_URL=http://localhost:9999

# 4. Use it
cli/target/debug/pm projects list
cli/target/debug/pm search "关键词"
```

**Global options** (`--api-url`, `--format table`) go BEFORE the subcommand.

## Reference index

| File | What's in it |
|---|---|
| [quickstart](references/quickstart.md) | Binary location, startup, global options, output formats |
| [resources](references/resources.md) | All 9 resources with CRUD examples and full DTO field tables |
| [patterns](references/patterns.md) | Common patterns: create project in one go, query-update, bulk ops |
| [pitfalls](references/pitfalls.md) | Gotchas, error handling, server-must-be-running, JSON quoting |
| [json-jq](references/json-jq.md) | jq recipes for filtering, extracting IDs, finding by name |

Load the reference files you need based on the user's task.
Start with [quickstart](references/quickstart.md) if this is your first time.
