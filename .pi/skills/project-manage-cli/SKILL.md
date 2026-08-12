# project-manage CLI

Use project-manage's CLI binary to manage projects, clients, tasks, phases,
people, assets, files, communications, deliverables — all via HTTP API
calls. The same binary that serves HTTP doubles as a CLI client.

## When to use

- An AI agent needs to interact with project-manage data programmatically
- You hear "project-manage CLI", "project-manage 命令行", or "操控 project-manage"
- A task involves creating/updating/querying project-manage without the web UI
- You need structured JSON output for further processing

## Quick start

```bash
# Start server (keep running)
cd backend && PORT=9999 ./target/debug/project-manage-backend &

# Point CLI at it
export PROJECT_MANAGE_URL=http://localhost:9999

# Use it
./target/debug/project-manage-backend projects list
./target/debug/project-manage-backend search "关键词"
```

**Global options** (`--api-url`, `--format table`) go BEFORE the subcommand.

## Reference index

| File | What's in it |
|---|---|
| [[quickstart]] | Binary location, startup, global options, output formats |
| [[resources]] | All 9 resources with CRUD examples and full DTO field tables |
| [[patterns]] | Common patterns: create project in one go, query-update, bulk ops |
| [[pitfalls]] | Gotchas, error handling, server-must-be-running, JSON quoting |
| [[json-jq]] | jq recipes for filtering, extracting IDs, finding by name |

Load the reference files you need based on the user's task.
Start with [[quickstart]] if this is your first time.
