# Solution Map — Findings（产品发现）

Role: topic-capsule
Status: planning
Read when: 实现 findings 或 ready-check 时
Related: [decisions/003-findings-model.md](../decisions/003-findings-model.md)

## One-Screen Summary

在 project 下新增 `findings` 资源：记录我们观察发现的、客户正在使用的产品
（我们的或第三方厂商的）存在的问题。轻跟踪（未反馈/已反馈）。

## 数据模型（草案）

```sql
CREATE TABLE IF NOT EXISTS findings (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title            TEXT NOT NULL,
    description      TEXT,
    product          TEXT,
    product_source   TEXT NOT NULL,                -- ours | third_party
    vendor           TEXT,
    observed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    communication_id UUID REFERENCES communications(id) ON DELETE SET NULL,
    feedback_status  TEXT NOT NULL DEFAULT 'unreported',  -- unreported | reported
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS findings_project_id_idx ON findings(project_id);
CREATE INDEX IF NOT EXISTS findings_feedback_status_idx ON findings(feedback_status);
```

`product_source` 与 `feedback_status` 在 Rust 层校验（`ProductSource` /
`FeedbackStatus`），沿用 tasks 的 `is_valid` 模式。

## API（草案，沿用双路由形态）

- `GET  /api/projects/:project_id/findings` — 列表（未反馈优先）
- `POST /api/projects/:project_id/findings` — 创建
- `GET/PUT/DELETE /api/findings/:id` — flat by id

校验：`ensure_project_exists` 第一个 await；`product_source` ∈ {ours, third_party}；
`communication_id` 若提供必须属于同一 project（否则 400）。

## 前端（草案）

- `types/generated/` 自动生成，`types/index.ts` re-export
- `api/index.ts` 加 `findingsApi`
- `components/FindingsTab.tsx` 接入 ProjectDetail（与 IssuesTab 并列）

## 验证路径

- 后端：`cargo test --manifest-path backend/Cargo.toml`（smoke：创建/更新/删除/
  状态流转/跨项目校验）
- 前端：`cd frontend && npm run test`
- 手动：跑起来，新增 finding，切 product_source，标记已反馈

## 风险与注意事项

- `product_source` 必填、无 DB 默认（避免拍脑袋假设归属）
- `communication_id` 跨项目一致性校验
- 迁移编号接 issues 之后：`00021_findings.sql`
