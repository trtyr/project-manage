# Resource commands

All 9 resources follow the pattern: `list`, `get`, `create`, `update`,
`delete`. Project-scoped resources require `--project-id` for `list` and
`create`.

Legend: 🏠 = flat resource (list doesn't need project), 📋 = project-scoped.

---

## 🏠 Projects

```bash
python3 scripts/pm projects list                          # all projects
python3 scripts/pm projects list --client-id UUID         # filter by client
python3 scripts/pm projects get UUID
python3 scripts/pm projects create --data '{...}'
python3 scripts/pm projects update UUID --data '{...}'
python3 scripts/pm projects delete UUID                   # ⚠ CASCADE deletes child rows
```

### CreateProject DTO

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `client_id` | UUID | ✅ | — | Must reference existing client |
| `name` | string | ✅ | — | Project name |
| `status` | string | — | `in_progress` | `in_progress` / `completed` / `paused` |
| `phase` | string | — | null | Free-text phase label |
| `goals` | string[] | — | `[]` | Array of goal strings |
| `tech_approval` | string | — | null | `未接触` / `POC中` / `已认可` / `技术否决` |
| `competitors` | string | — | null | Competitor notes |

### UpdateProject DTO

All fields optional: `name`, `client_id`, `status`, `phase`, `goals`,
`tech_approval`, `competitors`.

### Examples

```bash
# Minimal project
python3 scripts/pm projects create --data '{"client_id":"e37e...","name":"测试项目"}'

# Full project
python3 scripts/pm projects create --data '{
  "client_id":"e37e0c75-4921-4414-907c-2feb6d7af6d6",
  "name":"门户网站开发",
  "status":"in_progress",
  "phase":"POC",
  "goals":["提升交付效率","缩短交付周期"],
  "tech_approval":"已认可",
  "competitors":"竞品 A、竞品 B"
}'

# Mark complete
python3 scripts/pm projects update UUID --data '{"status":"completed"}'
```

---

## 🏠 Clients

```bash
python3 scripts/pm clients list
python3 scripts/pm clients get UUID
python3 scripts/pm clients create --data '{...}'
python3 scripts/pm clients update UUID --data '{...}'
python3 scripts/pm clients delete UUID         # ⚠ restricted if client has projects
```

### CreateClient DTO

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | ✅ | — | Client/company name |
| `contact_person` | string | — | null | Primary contact |
| `contact_info` | string | — | null | Phone/email |
| `notes` | string | — | null | Free-form notes |
| `products` | string[] | — | `[]` | Products they own |
| `background_info` | string | — | null | Background/context |

### UpdateClient DTO

All fields optional: `name`, `contact_person`, `contact_info`, `notes`,
`products`, `background_info`.

### Examples

```bash
python3 scripts/pm clients create --data '{
  "name":"示例客户",
  "products":["CRM","门户"]
}'
```

---

## 📋 Phases

```bash
python3 scripts/pm phases list --project-id PID
python3 scripts/pm phases get UUID
python3 scripts/pm phases create --project-id PID --data '{...}'
python3 scripts/pm phases update UUID --data '{...}'
python3 scripts/pm phases delete UUID
```

### CreatePhase DTO

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | ✅ | — | Phase name |
| `parent_id` | UUID | — | null | Parent phase (for hierarchy) |
| `status` | string | — | `pending` | `pending` / `in_progress` / `completed` |
| `description` | string | — | null | Free-text |
| `planned_start` | ISO 8601 | — | null | e.g. `"2026-09-01T00:00:00Z"` |
| `planned_end` | ISO 8601 | — | null | |
| `sort_order` | int | — | 0 | Display order |

### Examples

```bash
# Simple phase
python3 scripts/pm phases create --project-id PID --data '{"name":"需求挖掘","status":"pending"}'

# Phase with dates
python3 scripts/pm phases create --project-id PID --data '{
  "name":"POC测试",
  "status":"in_progress",
  "planned_start":"2026-09-01T00:00:00Z",
  "planned_end":"2026-09-30T00:00:00Z"
}'

# Import standard 7-phase template
for phase in "需求挖掘" "技术预研" "方案论证" "立项审批" "启动采购" "商务招标" "签单冲刺"; do
  python3 scripts/pm phases create --project-id $PID --data "{\"name\":\"$phase\",\"status\":\"pending\"}"
done
```

---

## 📋 Tasks

```bash
python3 scripts/pm tasks list --project-id PID
python3 scripts/pm tasks get UUID
python3 scripts/pm tasks create --project-id PID --data '{...}'
python3 scripts/pm tasks update UUID --data '{...}'
python3 scripts/pm tasks delete UUID
```

### CreateTask DTO

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `title` | string | ✅ | — | Task title |
| `status` | string | — | `todo` | `current` / `next` / `todo` |
| `priority` | string | — | `normal` | `urgent` / `high` / `normal` / `low` |
| `assignee_id` | UUID | — | null | FK to people |
| `planned_date` | date | — | null | YYYY-MM-DD format |

### Examples

```bash
# Urgent task with assignee
python3 scripts/pm tasks create --project-id PID --data '{
  "title":"梳理Agent架构",
  "priority":"urgent",
  "status":"current",
  "assignee_id":"UUID"
}'

# Simple todo
python3 scripts/pm tasks create --project-id PID --data '{"title":"更新接口文档"}'

# Move to next
python3 scripts/pm tasks update UUID --data '{"status":"next"}'
```

---

## 📋 People

```bash
python3 scripts/pm people list --project-id PID
python3 scripts/pm people get UUID
python3 scripts/pm people create --project-id PID --data '{...}'
python3 scripts/pm people update UUID --data '{...}'
python3 scripts/pm people delete UUID
python3 scripts/pm people flip UUID             # move team↔client
```

### CreatePerson DTO

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `side` | string | ✅ | — | `team` or `client` |
| `name` | string | ✅ | — | Person name |
| `role` | string | — | null | Role title |
| `notes` | string | — | null | Free-form |

### UpdatePerson DTO

All fields optional: `name`, `role`, `notes`.

### Examples

```bash
# Team member
python3 scripts/pm people create --project-id PID --data '{
  "side":"team",
  "name":"赵俊宇",
  "role":"项目经理"
}'

# Client-side contact
python3 scripts/pm people create --project-id PID --data '{
  "side":"client",
  "name":"黄嘉骏",
  "role":"领导"
}'

# Change role
python3 scripts/pm people update UUID --data '{"role":"技术负责人"}'

# Move to other side
python3 scripts/pm people flip UUID
```

---

## 📋 Assets

```bash
python3 scripts/pm assets list --project-id PID
python3 scripts/pm assets get UUID
python3 scripts/pm assets create --project-id PID --data '{...}'
python3 scripts/pm assets update UUID --data '{...}'
python3 scripts/pm assets delete UUID
```

### CreateAsset DTO

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | ✅ | — | Asset name |
| `asset_type` | string | — | null | 服务器 / 域名 / IP / 数据库 / 中间件 ... |
| `value` | string | — | null | URL/IP/identifier |
| `description` | string | — | null | Pure notes (no credentials here) |
| `access_method` | string | — | null | VPN / 直连 / 内网 / 远程桌面 ... |
| `credentials` | string | — | null | Account/password/API key (plaintext, masked in UI) |
| `vendor` | string | — | null | 示例厂商 / 示例厂商 A / 示例厂商 B / 示例厂商 C ... |

### Examples

```bash
# 服务器 asset
python3 scripts/pm assets create --project-id PID --data '{
  "name":"OA 服务器",
  "asset_type":"服务器",
  "access_method":"VPN",
  "vendor":"示例厂商",
  "value":"172.29.90.95"
}'

# Threat intelligence
python3 scripts/pm assets create --project-id PID --data '{
  "name":"NGTIP",
  "asset_type":"威胁情报",
  "vendor":"示例供应商",
  "credentials":"token:4c00a822c1234f57a006c75e60ae0ac2"
}'

# Update credentials only
python3 scripts/pm assets update UUID --data '{"credentials":"new-token-value"}'
```

---

## 🏠 Files

```bash
python3 scripts/pm files list                          # all files across projects
python3 scripts/pm files list --project-id PID         # per-project
python3 scripts/pm files get UUID
python3 scripts/pm files delete UUID
```

⚠ **File upload/update NOT available via CLI.** For multipart uploads:

```bash
curl -F "file=@local.pdf" \
     -F "description=desc" \
     http://localhost:9999/api/projects/PID/files
```

---

## 📋 Communications

```bash
python3 scripts/pm communications list                    # recent across all projects
python3 scripts/pm communications list --project-id PID   # per-project
python3 scripts/pm communications get UUID
python3 scripts/pm communications create --project-id PID --data '{...}'
python3 scripts/pm communications update UUID --data '{...}'
python3 scripts/pm communications delete UUID
```

### CreateCommunication DTO

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `content` | string | ✅ | — | Communication content |
| `occurred_at` | ISO 8601 | ✅ | — | When it occurred, e.g. `"2026-09-01T10:00:00Z"` |
| `participants` | string | — | null | Participant names as a single string |
| `conclusion` | string | — | null | Conclusion/outcome |

### UpdateCommunication DTO

All fields optional: `content`, `occurred_at`, `participants`, `conclusion`.

### Examples

```bash
python3 scripts/pm communications create --project-id PID --data '{
  "content":"与客户确认POC测试范围和时间节点",
  "occurred_at":"2026-09-01T10:00:00Z",
  "participants":"赵俊宇、黄嘉骏",
  "conclusion":"确认下周启动POC"
}'
```

---

## 📋 Deliverables

```bash
python3 scripts/pm deliverables list --project-id PID
python3 scripts/pm deliverables get UUID
python3 scripts/pm deliverables create --project-id PID --data '{...}'
python3 scripts/pm deliverables update UUID --data '{...}'
python3 scripts/pm deliverables delete UUID
```

### CreateDeliverable DTO

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | ✅ | — | Deliverable name |
| `status` | string | — | `pending` | `pending` / `delivered` / `accepted` |
| `due_date` | date | — | null | YYYY-MM-DD format |
| `linked_file_id` | UUID | — | null | FK to project_files |

### Examples

```bash
# New deliverable
python3 scripts/pm deliverables create --project-id PID --data '{
  "name":"项目验收报告",
  "status":"pending",
  "due_date":"2026-10-15"
}'

# Mark delivered with linked file
python3 scripts/pm deliverables update UUID --data '{
  "status":"delivered",
  "linked_file_id":"FILE_UUID"
}'

# Mark accepted
python3 scripts/pm deliverables update UUID --data '{"status":"accepted"}'
```

---

## 🔍 Search

```bash
python3 scripts/pm search "keyword"
```

Searches across projects, clients, communications, tasks, and people using
ILIKE matching. Returns array of `SearchHit`:

```json
{
  "resource": "project" | "client" | "communication" | "task" | "person",
  "id": "UUID",
  "title": "匹配的标题/名称",
  "subtitle": "补充信息" | null,
  "project_id": "UUID" | null
}
```

```bash
# Find everything related to "门户"
python3 scripts/pm search "门户"

# Find a person by name
python3 scripts/pm search "赵俊宇"
```
