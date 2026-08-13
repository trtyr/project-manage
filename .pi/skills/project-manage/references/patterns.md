# Common patterns

## Create a complete project in one go

```bash
# 1. Create project
PID=$(python3 ~/.pi/agent/skills/public/project-manage/pm projects create --data \
  '{"name":"新项目","client_id":"CLIENT_UUID","status":"in_progress"}' \
  | jq -r '.id')
echo "Project: $PID"

# 2. Import standard 7-phase template
for phase in 需求挖掘 技术预研 方案论证 立项审批 启动采购 商务招标 签单冲刺; do
  python3 ~/.pi/agent/skills/public/project-manage/pm phases create --project-id "$PID" --data \
    "{\"name\":\"$phase\",\"status\":\"pending\"}"
done

# 3. Add team members
python3 ~/.pi/agent/skills/public/project-manage/pm people create --project-id "$PID" --data \
  '{"side":"team","name":"项目经理","role":"项目经理"}'
python3 ~/.pi/agent/skills/public/project-manage/pm people create --project-id "$PID" --data \
  '{"side":"team","name":"张工","role":"项目负责人"}'

# 4. Add client contacts
python3 ~/.pi/agent/skills/public/project-manage/pm people create --project-id "$PID" --data \
  '{"side":"client","name":"客户决策人","role":"决策者"}'

# 5. Add initial tasks
python3 ~/.pi/agent/skills/public/project-manage/pm tasks create --project-id "$PID" --data \
  '{"title":"项目启动会","priority":"urgent","status":"current"}'
python3 ~/.pi/agent/skills/public/project-manage/pm tasks create --project-id "$PID" --data \
  '{"title":"信息收集","priority":"high","status":"next"}'
```

## Query and update workflow

Find a resource by name, extract its ID, then update:

```bash
# Find and deliver a deliverable
DID=$(python3 ~/.pi/agent/skills/public/project-manage/pm deliverables list --project-id "$PID" \
  | jq -r '.[] | select(.name=="项目验收报告") | .id')
python3 ~/.pi/agent/skills/public/project-manage/pm deliverables update "$DID" --data '{"status":"delivered"}'

# Find a person and change their role
PERSON_ID=$(python3 ~/.pi/agent/skills/public/project-manage/pm people list --project-id "$PID" \
  | jq -r '.[] | select(.name=="赵俊宇") | .id')
python3 ~/.pi/agent/skills/public/project-manage/pm people update "$PERSON_ID" --data '{"role":"技术负责人"}'

# Find a task and assign it
TASK_ID=$(python3 ~/.pi/agent/skills/public/project-manage/pm tasks list --project-id "$PID" \
  | jq -r '.[] | select(.title | test("Agent")) | .id')
python3 ~/.pi/agent/skills/public/project-manage/pm tasks update "$TASK_ID" --data \
  "{\"assignee_id\":\"$PERSON_ID\",\"status\":\"current\"}"
```

## Bulk status updates

Mark all completed phases and record a communication:

```bash
# Complete all pending phases
python3 ~/.pi/agent/skills/public/project-manage/pm phases list --project-id "$PID" \
  | jq -r '.[] | select(.status=="pending") | .id' \
  | while read -r PHASE_ID; do
      python3 ~/.pi/agent/skills/public/project-manage/pm phases update "$PHASE_ID" --data '{"status":"completed"}'
    done

# Log a milestone communication
python3 ~/.pi/agent/skills/public/project-manage/pm communications create --project-id "$PID" --data '{
  "content":"已完成全部阶段工作，进入交付验收阶段",
  "occurred_at":"2026-09-01T10:00:00Z",
  "participants":"项目经理、客户决策人",
  "conclusion":"项目交付完成"
}'
```

## Build a report

Combine multiple queries to generate a status report:

```bash
PID="3cf2230a-f5c8-4137-8e60-bb4016cc9180"

echo "=== 项目信息 ==="
python3 ~/.pi/agent/skills/public/project-manage/pm projects get "$PID" | jq '{name, status, phase, tech_approval}'

echo "=== 阶段进度 ==="
python3 ~/.pi/agent/skills/public/project-manage/pm phases list --project-id "$PID" \
  | jq '[.[] | {name, status, planned_end}]'

echo "=== 待完成任务 ==="
python3 ~/.pi/agent/skills/public/project-manage/pm tasks list --project-id "$PID" \
  | jq '[.[] | select(.status!="todo") | {title, priority, status}]'

echo "=== 交付物 ==="
python3 ~/.pi/agent/skills/public/project-manage/pm deliverables list --project-id "$PID" \
  | jq '[.[] | {name, status, due_date}]'

echo "=== 最近沟通 ==="
python3 ~/.pi/agent/skills/public/project-manage/pm communications list --project-id "$PID" \
  | jq '[.[] | {created_at, content: (.content[:60] + "...")}]'
```

## Add a file and link it to a deliverable

```bash
# Step 1: Upload the file (curl, not `pm`)
FILE_RESP=$(curl -s -F "file=@report.pdf" \
  -F "description=项目验收最终报告" \
  http://localhost:9999/api/projects/$PID/files)
FILE_ID=$(echo "$FILE_RESP" | jq -r '.id')

# Step 2: Link it to an existing deliverable
DELIV_ID=$(python3 ~/.pi/agent/skills/public/project-manage/pm deliverables list --project-id "$PID" \
  | jq -r '.[] | select(.name=="项目验收报告") | .id')
python3 ~/.pi/agent/skills/public/project-manage/pm deliverables update "$DELIV_ID" --data \
  "{\"linked_file_id\":\"$FILE_ID\",\"status\":\"delivered\"}"
```

## Safety: use variables, never hardcode IDs

Always extract UUIDs from queries — never copy-paste IDs from a previous run:

```bash
# ❌ Fragile — ID may have changed
python3 ~/.pi/agent/skills/public/project-manage/pm projects update "3cf2230a-f5c8-4137-8e60-bb4016cc9180" \
  --data '{"status":"completed"}'

# ✅ Robust — resolved from current data
PID=$(python3 ~/.pi/agent/skills/public/project-manage/pm projects list | jq -r '.[0].id')
python3 ~/.pi/agent/skills/public/project-manage/pm projects update "$PID" --data '{"status":"completed"}'
```
