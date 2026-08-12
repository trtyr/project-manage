# Resource commands

All 9 resources follow the pattern: `list`, `get`, `create`, `update`,
`delete`. Project-scoped resources require `--project-id` for `list` and
`create`.

Legend: 🏠 = flat resource (list doesn't need project), 📋 = project-scoped.

---

## 🏠 Projects

```bash
project-manage projects list                          # all projects
project-manage projects list --client-id UUID         # filter by client
project-manage projects get UUID
project-manage projects create --data '{...}'
project-manage projects update UUID --data '{...}'
project-manage projects delete UUID                   # ⚠ CASCADE deletes child rows
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
project-manage projects create --data '{"client_id":"e37e...","name":"测试项目"}'

# Full project
project-manage projects create --data '{
  "client_id":"e37e0c75-4921-4414-907c-2feb6d7af6d6",
  "name":"门户网站开发",
  "status":"in_progress",
  "phase":"POC",
  "goals":["实现自动化IT 运营","降低MTTR"],
  "tech_approval":"已认可",
  "competitors":"示例厂商、示例厂商"
}'

# Mark complete
project-manage projects update UUID --data '{"status":"completed"}'
```

---

## 🏠 Clients

```bash
project-manage clients list
project-manage clients get UUID
project-manage clients create --data '{...}'
project-manage clients update UUID --data '{...}'
project-manage clients delete UUID         # ⚠ restricted if client has projects
```

### CreateClient DTO

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | ✅ | — | Client/company name |
| `contact_person` | string | — | null | Primary contact |
| `contact_info` | string | — | null | Phone/email |
| `notes` | string | — | null | Free-form notes |
| `products` | string[] | — | `[]` | Products they own |
| `security_concerns` | string[] | — | `[]` | Security concerns |
| `background_info` | string | — | null | Background/context |

### UpdateClient DTO

All fields optional: `name`, `contact_person`, `contact_info`, `notes`,
`products`, `security_concerns`, `background_info`.

### Examples

```bash
project-manage clients create --data '{
  "name":"示例客户",
  "products":["监控系统","数据管理系统"],
  "security_concerns":["数据泄露","勒索软件"]
}'
```

---

## 📋 Phases

```bash
project-manage phases list --project-id PID
project-manage phases get UUID
project-manage phases create --project-id PID --data '{...}'
project-manage phases update UUID --data '{...}'
project-manage phases delete UUID
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
project-manage phases create --project-id PID --data '{"name":"需求挖掘","status":"pending"}'

# Phase with dates
project-manage phases create --project-id PID --data '{
  "name":"POC测试",
  "status":"in_progress",
  "planned_start":"2026-09-01T00:00:00Z",
  "planned_end":"2026-09-30T00:00:00Z"
}'

# Import standard 7-phase template
for phase in "需求挖掘" "技术预研" "方案论证" "立项审批" "启动采购" "商务招标" "签单冲刺"; do
  project-manage phases create --project-id $PID --data "{\"name\":\"$phase\",\"status\":\"pending\"}"
done
```

---

## 📋 Tasks

```bash
project-manage tasks list --project-id PID
project-manage tasks get UUID
project-manage tasks create --project-id PID --data '{...}'
project-manage tasks update UUID --data '{...}'
project-manage tasks delete UUID
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
project-manage tasks create --project-id PID --data '{
  "title":"梳理Agent架构",
  "priority":"urgent",
  "status":"current",
  "assignee_id":"UUID"
}'

# Simple todo
project-manage tasks create --project-id PID --data '{"title":"更新接口文档"}'

# Move to next
project-manage tasks update UUID --data '{"status":"next"}'
```

---

## 📋 People

```bash
project-manage people list --project-id PID
project-manage people get UUID
project-manage people create --project-id PID --data '{...}'
project-manage people update UUID --data '{...}'
project-manage people delete UUID
project-manage people flip UUID             # move team↔client
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
project-manage people create --project-id PID --data '{
  "side":"team",
  "name":"赵俊宇",
  "role":"项目经理"
}'

# Client-side contact
project-manage people create --project-id PID --data '{
  "side":"client",
  "name":"黄嘉骏",
  "role":"领导"
}'

# Change role
project-manage people update UUID --data '{"role":"技术负责人"}'

# Move to other side
project-manage people flip UUID
```

---

## 📋 Assets

```bash
project-manage assets list --project-id PID
project-manage assets get UUID
project-manage assets create --project-id PID --data '{...}'
project-manage assets update UUID --data '{...}'
project-manage assets delete UUID
```

### CreateAsset DTO

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | ✅ | — | Asset name |
| `asset_type` | string | — | null | 监控系统 / 数据管理系统 / 日志系统 / 网关 / 防火墙 ... |
| `value` | string | — | null | URL/IP/identifier |
| `description` | string | — | null | Pure notes (no credentials here) |
| `access_method` | string | — | null | 访问控制登录 / VPN / 直连 / 运维终端 ... |
| `credentials` | string | — | null | Account/password/API key (plaintext, masked in UI) |
| `vendor` | string | — | null | 示例厂商 / 示例厂商 / 示例厂商 / 示例厂商 / 示例厂商 ... |

### Examples

```bash
# 监控系统 asset
project-manage assets create --project-id PID --data '{
  "name":"示例厂商 监控系统",
  "asset_type":"监控系统",
  "access_method":"访问控制登录",
  "vendor":"示例厂商",
  "value":"172.29.90.95"
}'

# Threat intelligence
project-manage assets create --project-id PID --data '{
  "name":"NGTIP",
  "asset_type":"威胁情报",
  "vendor":"示例厂商在线",
  "credentials":"token:4c00a822c1234f57a006c75e60ae0ac2"
}'

# Update credentials only
project-manage assets update UUID --data '{"credentials":"new-token-value"}'
```

---

## 🏠 Files

```bash
project-manage files list                          # all files across projects
project-manage files list --project-id PID         # per-project
project-manage files get UUID
project-manage files delete UUID
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
project-manage communications list                    # recent across all projects
project-manage communications list --project-id PID   # per-project
project-manage communications get UUID
project-manage communications create --project-id PID --data '{...}'
project-manage communications update UUID --data '{...}'
project-manage communications delete UUID
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
project-manage communications create --project-id PID --data '{
  "content":"与客户确认POC测试范围和时间节点",
  "occurred_at":"2026-09-01T10:00:00Z",
  "participants":"赵俊宇、黄嘉骏",
  "conclusion":"确认下周启动POC"
}'
```

---

## 📋 Deliverables

```bash
project-manage deliverables list --project-id PID
project-manage deliverables get UUID
project-manage deliverables create --project-id PID --data '{...}'
project-manage deliverables update UUID --data '{...}'
project-manage deliverables delete UUID
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
project-manage deliverables create --project-id PID --data '{
  "name":"安全评估报告",
  "status":"pending",
  "due_date":"2026-10-15"
}'

# Mark delivered with linked file
project-manage deliverables update UUID --data '{
  "status":"delivered",
  "linked_file_id":"FILE_UUID"
}'

# Mark accepted
project-manage deliverables update UUID --data '{"status":"accepted"}'
```

---

## 🔍 Search

```bash
project-manage search "keyword"
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
# Find everything related to "安全"
project-manage search "安全"

# Find a person by name
project-manage search "赵俊宇"
```
