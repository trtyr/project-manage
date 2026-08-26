# 002 — 命名、字段范围、全局搜索、UI 形态

Date: 2026-08-26

## Context

001 已定归属层级 / 来源关联 / 状态。补充确认资源命名、附加字段范围、
是否进全局搜索、前端 UI 形态。命名由 agent 确定，其余经用户问卷确认。

## Decision

1. **资源命名 `issues`**：表名 `issues`，路由 `/api/projects/:id/issues`
   与 `/api/issues/:id`，前端 `issuesApi`、`types/generated/Issue*.ts`。
2. **状态枚举**：`open` / `in_progress` / `resolved`。
3. **优先级**：复用 tasks 的 `urgent` / `high` / `normal` / `low`。
4. **字段**：`title`（必填）、`description`、`communication_id`（可选来源）、
   `assignee_id`（负责人，引用 people）、`priority`（默认 normal）、
   `due_date`（截止日期）。三个附加字段都要。
5. **纳入全局搜索**：`GET /api/search` 覆盖 issues。
6. **UI**：ProjectDetail 加 `IssuesTab`，与 TasksTab / CommunicationsTab 并列。

## Consequences

- 实现路径与 tasks 高度一致，可复用其校验模式。
- 全局搜索需要为 issues 增加一个搜索分支（含 project_name 的投影，
  参照 communications 的 `WithProject` 结构）。
- 附加字段引入 `assignee_id` / `priority` / `due_date`，
  校验与排序需在 handler 里处理。
