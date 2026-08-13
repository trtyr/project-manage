# JSON and jq recipes

All CLI output is pretty-printed JSON by default. Use `jq` to filter,
transform, and extract exactly what you need.

## Basic extraction

```bash
# Get a specific field
pm projects list | jq '.[0].name'
# "门户网站开发"

# Raw output (no quotes)
pm projects list | jq -r '.[0].id'
# 3cf2230a-f5c8-4137-8e60-bb4016cc9180

# Multiple fields as an object
pm projects get "$PID" | jq '{name, status, phase}'
# {"name":"门户网站开发","status":"in_progress","phase":null}
```

## Filtering

```bash
# Filter by field value
pm tasks list --project-id "$PID" \
  | jq '.[] | select(.priority=="urgent")'

# Filter by multiple conditions
pm tasks list --project-id "$PID" \
  | jq '.[] | select(.status=="current" and .priority=="high")'

# Filter by text match (regex)
pm people list --project-id "$PID" \
  | jq '.[] | select(.name | test("赵"))'

# Filter by side
pm people list --project-id "$PID" \
  | jq '.[] | select(.side=="team")'

# Case-insensitive text match
pm clients list | jq '.[] | select(.name | test("数据"; "i"))'
```

## Extracting IDs

```bash
# First item's ID
pm projects list | jq -r '.[0].id'

# All IDs as an array
pm projects list | jq '[.[].id]'

# ID of a named item
pm clients list | jq -r '.[] | select(.name=="示例客户") | .id'

# IDs matching a pattern
pm deliverables list --project-id "$PID" \
  | jq -r '.[] | select(.status=="pending") | .id'
```

## Counting and aggregation

```bash
# Count items
pm tasks list --project-id "$PID" | jq 'length'

# Count by status
pm tasks list --project-id "$PID" \
  | jq 'group_by(.status) | map({status: .[0].status, count: length})'

# Count by priority
pm tasks list --project-id "$PID" \
  | jq 'group_by(.priority) | map({priority: .[0].priority, count: length})'

# Project completion stats
pm phases list --project-id "$PID" \
  | jq '{total: length, completed: [.[] | select(.status=="completed")] | length}'
```

## Transforming output

```bash
# Simplify to a flat list of names
pm assets list --project-id "$PID" \
  | jq '.[] | "\(.name) [\(.asset_type)]"'

# Build a markdown table
pm deliverables list --project-id "$PID" \
  | jq -r '["| 名称 | 状态 | 截止日期 |", "|---|---|---|"] + 
    [.[] | "| \(.name) | \(.status) | \(.due_date // "-") |"] | .[]'

# Key-value summary
pm projects get "$PID" | jq -r '
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
CID=$(pm clients list | jq -r '.[] | select(.name=="示例客户") | .id')
PID=$(pm projects list --client-id "$CID" | jq -r '.[0].id')
pm tasks list --project-id "$PID"

# Or in one line (less readable)
pm tasks list --project-id "$(
  pm projects list --client-id "$(
    pm clients list | jq -r '.[] | select(.name=="示例客户") | .id'
  )" | jq -r '.[0].id'
)"
```

## Error handling in scripts

```bash
# Check if a command succeeded before extracting output
if RESULT=$(pm projects get "$PID" 2>/dev/null); then
  NAME=$(echo "$RESULT" | jq -r '.name')
  echo "Project: $NAME"
else
  echo "Project not found or server down"
  exit 1
fi

# Validate JSON structure
pm projects list | jq -e '.[0].id' > /dev/null 2>&1 || {
  echo "No projects found or invalid response"
  exit 1
}
```

## Pretty-printing a single field

```bash
# If a field contains JSON or long text
pm communications get "$COMM_ID" | jq '.content' -r
```

## Common jq flags

| Flag | Effect |
|---|---|
| `-r` | Raw output (no JSON quotes around strings) |
| `-c` | Compact (one JSON object per line) |
| `-e` | Exit non-zero on null/false result |
| `-s` | Slurp — read entire input as one array |
