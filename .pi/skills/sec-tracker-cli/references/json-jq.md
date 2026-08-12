# JSON and jq recipes

All CLI output is pretty-printed JSON by default. Use `jq` to filter,
transform, and extract exactly what you need.

## Basic extraction

```bash
# Get a specific field
sec-tracker projects list | jq '.[0].name'
# "门户网站开发"

# Raw output (no quotes)
sec-tracker projects list | jq -r '.[0].id'
# 3cf2230a-f5c8-4137-8e60-bb4016cc9180

# Multiple fields as an object
sec-tracker projects get "$PID" | jq '{name, status, phase}'
# {"name":"门户网站开发","status":"in_progress","phase":null}
```

## Filtering

```bash
# Filter by field value
sec-tracker tasks list --project-id "$PID" \
  | jq '.[] | select(.priority=="urgent")'

# Filter by multiple conditions
sec-tracker tasks list --project-id "$PID" \
  | jq '.[] | select(.status=="current" and .priority=="high")'

# Filter by text match (regex)
sec-tracker people list --project-id "$PID" \
  | jq '.[] | select(.name | test("赵"))'

# Filter by side
sec-tracker people list --project-id "$PID" \
  | jq '.[] | select(.side=="team")'

# Case-insensitive text match
sec-tracker clients list | jq '.[] | select(.name | test("数据"; "i"))'
```

## Extracting IDs

```bash
# First item's ID
sec-tracker projects list | jq -r '.[0].id'

# All IDs as an array
sec-tracker projects list | jq '[.[].id]'

# ID of a named item
sec-tracker clients list | jq -r '.[] | select(.name=="示例客户") | .id'

# IDs matching a pattern
sec-tracker deliverables list --project-id "$PID" \
  | jq -r '.[] | select(.status=="pending") | .id'
```

## Counting and aggregation

```bash
# Count items
sec-tracker tasks list --project-id "$PID" | jq 'length'

# Count by status
sec-tracker tasks list --project-id "$PID" \
  | jq 'group_by(.status) | map({status: .[0].status, count: length})'

# Count by priority
sec-tracker tasks list --project-id "$PID" \
  | jq 'group_by(.priority) | map({priority: .[0].priority, count: length})'

# Project completion stats
sec-tracker phases list --project-id "$PID" \
  | jq '{total: length, completed: [.[] | select(.status=="completed")] | length}'
```

## Transforming output

```bash
# Simplify to a flat list of names
sec-tracker assets list --project-id "$PID" \
  | jq '.[] | "\(.name) [\(.asset_type)]"'

# Build a markdown table
sec-tracker deliverables list --project-id "$PID" \
  | jq -r '["| 名称 | 状态 | 截止日期 |", "|---|---|---|"] + 
    [.[] | "| \(.name) | \(.status) | \(.due_date // "-") |"] | .[]'

# Key-value summary
sec-tracker projects get "$PID" | jq -r '
  "项目: \(.name)",
  "状态: \(.status)",
  "阶段: \(.phase // "未设置")",
  "技术认可: \(.tech_approval)"
'
```

## Piping between commands

The ID-from-one-command-as-input-to-another pattern:

```bash
# Find project ID from client name, then list tasks
CID=$(sec-tracker clients list | jq -r '.[] | select(.name=="示例客户") | .id')
PID=$(sec-tracker projects list --client-id "$CID" | jq -r '.[0].id')
sec-tracker tasks list --project-id "$PID"

# Or in one line (less readable)
sec-tracker tasks list --project-id "$(
  sec-tracker projects list --client-id "$(
    sec-tracker clients list | jq -r '.[] | select(.name=="示例客户") | .id'
  )" | jq -r '.[0].id'
)"
```

## Error handling in scripts

```bash
# Check if a command succeeded before extracting output
if RESULT=$(sec-tracker projects get "$PID" 2>/dev/null); then
  NAME=$(echo "$RESULT" | jq -r '.name')
  echo "Project: $NAME"
else
  echo "Project not found or server down"
  exit 1
fi

# Validate JSON structure
sec-tracker projects list | jq -e '.[0].id' > /dev/null 2>&1 || {
  echo "No projects found or invalid response"
  exit 1
}
```

## Pretty-printing a single field

```bash
# If a field contains JSON or long text
sec-tracker communications get "$COMM_ID" | jq '.content' -r
```

## Common jq flags

| Flag | Effect |
|---|---|
| `-r` | Raw output (no JSON quotes around strings) |
| `-c` | Compact (one JSON object per line) |
| `-e` | Exit non-zero on null/false result |
| `-s` | Slurp — read entire input as one array |
