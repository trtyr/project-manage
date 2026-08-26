# Solution Map — Client Issues Tracking

Role: topic-capsule
Status: planning
Read when: 开始实现或 ready-check 时
Related: [decisions/001-scope-and-attachment.md](../decisions/001-scope-and-attachment.md)

## One-Screen Summary

在 project 下新增 `issues` 资源：记录客户在意的问题，三态跟踪完成情况，可选关联来源 communication，字段范围待澄清（见 open-questions Q1）。

## 数据模型（草案）

```sql
CREATE TABLE IF NOT EXISTS issues (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title            TEXT NOT NULL,
    description      TEXT,
    status           TEXT NOT NULL DEFAULT 'pending',  -- pending | in_progress | resolved
    communication_id UUID REFERENCES communications(id) ON DELETE SET NULL,  -- 可选来源
    assignee_id      UUID REFERENCES people(id) ON DELETE SET NULL,          -- 待澄清
    priority         TEXT NOT NULL DEFAULT 'normal',                        -- 待澄清
    due_date         DATE,                                                  -- 待澄清
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS issues_project_id_idx ON issues(project_id);
```

状态与优先级校验放 Rust 层（`IssueStatus` / `IssuePriority`），沿用 tasks 的 `is_valid` 模式。

## API（草案，沿用 communications 的双路由形态）

- `GET  /api/projects/:project_id/issues` — 列表（未解决优先排序）
- `POST /api/projects/:project_id/issues` — 创建
- `GET  /api/issues/:id` / `PUT` / `DELETE` — flat by id

创建时 `ensure_project_exists` 必须是第一个 await；`communication_id` 若提供，必须属于同一 project（否则 400）。

## 前端（草案）

- `types/generated/` 由 ts-rs 自动生成，`types/index.ts` re-export
- `api/index.ts` 加 `issuesApi`（listByProject / create / get / update / delete）
- `components/IssuesTab.tsx` 加入 ProjectDetail 的 tab 列表

## 验证路径

- 后端：`cargo test --manifest-path backend/Cargo.toml`（含新增 smoke 用例）
- 前端：`cd frontend && npm run test`
- 手动：跑起前后端，在项目里新增 / 更新 / 删除一条 issue，验证状态流转与可选关联

## 风险与注意事项

- `communication_id` 的 project 一致性校验（跨项目关联会破坏数据一致性）
- `ensure_project_exists` 必须在 project-scoped handler 第一个 await
- 迁移编号接在 0019 之后（`...00020_issues.sql`）
- 项目删除时 issues 应 CASCADE（与 tasks / communications 一致）
