# Pitfalls

## Server must be running

Every `pm` command is an HTTP call to the API server. If the server is down,
you get a connection error:

```
error: [Errno 61] Connection refused
```

Fix: start the server first.

```bash
cargo run --manifest-path backend/Cargo.toml &
# Wait for: ✅ 就绪检查通过
```

Check if it's already running: `lsof -ti:9999`

## `--data` must be valid JSON

Use single quotes for the shell wrapper and double quotes inside:

```bash
# ✅ Correct
python3 ~/.pi/agent/skills/public/project-manage/pm projects create --data '{"name":"My Project","status":"in_progress"}'

# ❌ Wrong — shell variable expansion in double quotes
python3 ~/.pi/agent/skills/public/project-manage/pm projects create --data "{"name":"$NAME"}"
# Shell tries to expand $NAME and breaks JSON parsing
```

For strings containing single quotes, use `'\''` escape:

```bash
python3 ~/.pi/agent/skills/public/project-manage/pm projects create --data '{"name":"It'\''s a project"}'
```

Or use a heredoc:

```bash
python3 ~/.pi/agent/skills/public/project-manage/pm projects create --data "$(cat <<'JSON'
{
  "name": "It's a project",
  "status": "in_progress"
}
JSON
)"
```

## Global options go BEFORE the subcommand

`--api-url` and `--format` are parsed at the top level:

```bash
# ✅ Correct
python3 ~/.pi/agent/skills/public/project-manage/pm --api-url http://localhost:9999 projects list

# ❌ Wrong — argparse rejects it (exit 2)
python3 ~/.pi/agent/skills/public/project-manage/pm projects list --api-url http://localhost:9999
```

When in doubt, put everything before the resource name.

## Create JSON maps to DTOs exactly

Optional fields can be omitted — they get serde defaults. But WRONG field
names are silently ignored (serde ignores unknown fields by default on the
`pm` side since we're constructing a generic `Value`):

```bash
# ❌ "nam" is a typo — it'll be silently ignored
python3 ~/.pi/agent/skills/public/project-manage/pm projects create --data '{"nam":"Test"}'
# The API receives an empty body with no "name" field → returns 422
```

Always double-check field names against the DTO tables in [resources](resources.md).

## No file upload via `pm`

The `files create` and `files update` subcommands are intentionally absent.
File upload uses multipart/form-data which `pm` doesn't wrap.

Use `curl` instead:

```bash
curl -F "file=@local.pdf" \
     -F "description=desc" \
     http://localhost:9999/api/projects/PID/files
```

## PORT vs PROJECT_MANAGE_URL vs `--api-url`

`pm` resolves its target URL in this order (first wins):

1. `--api-url` flag (per-command)
2. `PROJECT_MANAGE_URL` env var
3. `PORT` env var → `http://localhost:$PORT` (so `PORT=9999` **does** make `pm`
   target `:9999` — handy when server and `pm` share a shell)
4. fallback `http://localhost:3000`

`PORT` is primarily the **server's** listen port, but `pm` reads it as a default
too. To point `pm` at a different host/port than the server, use `--api-url` or
`PROJECT_MANAGE_URL`.

## Delete is irreversible

- **Project delete**: CASCADE deletes all child rows — phases, tasks,
  deliverables, assets, files metadata, people, communications. File data
  on disk (`./uploads/{project_id}/`) is NOT cleaned up automatically.
- **Client delete**: restricted if the client has projects.
- **No confirmation prompt**: `pm` does not ask "are you sure?".

## Project-scoped resources need `--project-id`

Tasks, phases, people, assets, deliverables ALL require `--project-id` for
list and create:

```bash
# ❌ Missing --project-id
python3 ~/.pi/agent/skills/public/project-manage/pm tasks list
# Error: argument '--project-id' is required

# ✅
python3 ~/.pi/agent/skills/public/project-manage/pm tasks list --project-id "$PID"
```

## Whitespace in shell loops

When iterating over names with spaces, use `while read` not `for`:

```bash
# ❌ Breaks on names with spaces
for name in $(python3 ~/.pi/agent/skills/public/project-manage/pm people list --project-id "$PID" | jq -r '.[].name'); do
  echo "$name"
done

# ✅ Works with any name
python3 ~/.pi/agent/skills/public/project-manage/pm people list --project-id "$PID" | jq -r '.[].name' | while read -r name; do
  echo "Found: $name"
done
```

## Server can't start because port is already in use

```bash
# Check what's on the port
lsof -ti:9999

# Kill orphan processes
kill -9 $(lsof -ti:9999)

# Or use a different port
PORT=9998 cargo run --manifest-path backend/Cargo.toml &
export PROJECT_MANAGE_URL=http://localhost:9998
```

Note: `cargo run` spawns the binary as a child. If you kill the `cargo run`
process, the child binary may survive on the port. Always check with `lsof`.
