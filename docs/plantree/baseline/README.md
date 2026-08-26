# Baseline

Role: entrypoint
Updated: 2026-08-26

项目基线（事实、架构、约定）已存在于 `docs/context/`，这里不复制，只做索引。

## 索引

| 关注点 | 文档 |
| --- | --- |
| 技术栈与版本 | [docs/context/tech-stack.md](../../context/tech-stack.md) |
| 架构总览 | [docs/context/architecture.md](../../context/architecture.md) |
| API 参考 | [docs/context/api.md](../../context/api.md) |
| 数据库与迁移 | [docs/context/database.md](../../context/database.md) |
| 模块地图 | [docs/context/modules.md](../../context/modules.md) |
| 领域不变量 | [docs/context/domain.md](../../context/domain.md) |
| 约定与标准 | [docs/context/conventions.md](../../context/conventions.md) |
| 安全基线 | [docs/context/security-baseline.md](../../context/security-baseline.md) |
| 部署 | [docs/context/deploy.md](../../context/deploy.md) |

## 加一个资源的套路（关键）

任何新资源的实现路径（供 plan 引用，不在此重复细节）：

- **后端**：`migrations/<编号>_<name>.sql` → `src/models/<r>.rs`（row + Create/Update DTO，带 `#[ts(export)]`）→ `src/handlers/<r>.rs`（project-scoped 路由 + flat-by-id 路由，project-scoped handler 第一个 await 必须是 `ensure_project_exists`）→ 更新 `models/mod.rs`、`handlers/mod.rs`、`app.rs`
- **前端**：ts-rs 自动生成 `types/generated/`（跑 `cargo test`）→ `types/index.ts` re-export → `api/index.ts` 加 `<r>Api` → 组件/tab
