# Pitfalls

## Server must be running

Every CLI command is an HTTP call to the API server. If the server is down,
you get a connection error:

```
CLI error: error sending request for url (http://localhost:3000/api/projects):
  tcp connect error: Connection refused (os error 61)
```

Fix: start the server first.

```bash
cd backend && PORT=9999 ./target/debug/sec-tracker-backend &
# Wait for: ✅ 就绪检查通过
```

Check if it's already running: `lsof -ti:9999`

## `--data` must be valid JSON

Use single quotes for the shell wrapper and double quotes inside:

```bash
# ✅ Correct
sec-tracker projects create --data '{"name":"My Project","status":"in_progress"}'

# ❌ Wrong — shell variable expansion in double quotes
sec-tracker projects create --data "{"name":"$NAME"}"
# Shell tries to expand $NAME and breaks JSON parsing
```

For strings containing single quotes, use `'\''` escape:

```bash
sec-tracker projects create --data '{"name":"It'\''s a project"}'
```

Or use a heredoc:

```bash
sec-tracker projects create --data "$(cat <<'JSON'
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
sec-tracker --api-url http://localhost:9999 projects list

# ❌ Wrong — silently ignored
sec-tracker projects list --api-url http://localhost:9999
```

When in doubt, put everything before the resource name.

## Create JSON maps to DTOs exactly

Optional fields can be omitted — they get serde defaults. But WRONG field
names are silently ignored (serde ignores unknown fields by default on the
CLI side since we're constructing a generic `Value`):

```bash
# ❌ "nam" is a typo — it'll be silently ignored
sec-tracker projects create --data '{"nam":"Test"}'
# The API receives an empty body with no "name" field → returns 422
```

Always double-check field names against the DTO tables in [[resources]].

## No file upload via CLI

The `files create` and `files update` subcommands are intentionally absent.
File upload uses multipart/form-data which the CLI doesn't wrap.

Use `curl` instead:

```bash
curl -F "file=@local.pdf" \
     -F "description=desc" \
     http://localhost:9999/api/projects/PID/files
```

## PORT vs SEC_TRACKER_URL

- `PORT` env var → controls what port the **server** listens on
- `SEC_TRACKER_URL` env var → tells the **CLI** where the server is

They are independent. Setting `PORT=9999` when starting the server does NOT
make the CLI connect to `:9999` — you still need `--api-url` or
`SEC_TRACKER_URL`.

## Delete is irreversible

- **Project delete**: CASCADE deletes all child rows — phases, tasks,
  deliverables, assets, files metadata, people, communications. File data
  on disk (`./uploads/{project_id}/`) is NOT cleaned up automatically.
- **Client delete**: restricted if the client has projects.
- **No confirmation prompt**: the CLI does not ask "are you sure?".

## Project-scoped resources need `--project-id`

Tasks, phases, people, assets, deliverables ALL require `--project-id` for
list and create:

```bash
# ❌ Missing --project-id
sec-tracker tasks list
# Error: argument '--project-id' is required

# ✅
sec-tracker tasks list --project-id "$PID"
```

## Whitespace in shell loops

When iterating over names with spaces, use `while read` not `for`:

```bash
# ❌ Breaks on names with spaces
for name in $(sec-tracker people list --project-id "$PID" | jq -r '.[].name'); do
  echo "$name"
done

# ✅ Works with any name
sec-tracker people list --project-id "$PID" | jq -r '.[].name' | while read -r name; do
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
PORT=9998 ./target/debug/sec-tracker-backend &
export SEC_TRACKER_URL=http://localhost:9998
```

Note: `cargo run` spawns the binary as a child. If you kill the `cargo run`
process, the child binary may survive on the port. Always check with `lsof`.
