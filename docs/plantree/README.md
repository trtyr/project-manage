# Plan Tree — project-manage

Role: entrypoint
Updated: 2026-08-27

## 这是什么

本目录是 project-manage 的规划树（plan-tree），保存跨会话的持久规划状态：方向、方案、决策、未决问题、落地证据。

它和 `docs/context/` 互补——`context` 描述「项目现在是什么样」（事实 / 架构 / 约定），这里记录「接下来往哪走、为什么、怎么落地」。

## 阅读顺序（authority order）

1. [baseline/README.md](baseline/README.md) — 指向 `docs/context/` 的项目基线索引
2. `plans/<plan>/README.md` — 具体计划的 scope 和文件地图
3. `plans/<plan>/roadmap.md` — 该计划的当前状态
4. `plans/<plan>/open-questions.md` + `topics/` + `decisions/` — 按需深入

冲突时优先级：`decisions/` 的稳定决策 > `roadmap.md` 的当前状态 > `topics/` 的方案胶囊 > `implementation-status.md` 的操作快照。

## Active Plans

| Plan | 状态 | 当前阶段 | 最后落地 | 下一步 |
| --- | --- | --- | --- | --- |
| [data-driven-ux-detail-audit](plans/data-driven-ux-detail-audit/README.md) | Done（档案已交付） | archived | 2026-09-04 数据驱动细节审计：31 条 findings（P1×3/P2×9/P3×19）+ 3 观察项，凭据/类型/预览/交互/模型五档，含修复排期 | 修复 goal 认领（roadmap 排期三批） |
| [ux-functional-audit](plans/ux-functional-audit/README.md) | Done（修复已全部落地） | archived | 2026-09-04 修复 goal 落地全部 41 条 findings（B1-B16 / L1-L16 / D1-D9，D9 按建议不实施），findings 档案全条目已标注状态 | 数据长起来后重评搜索增强（D9） |
| [detail-ia](plans/detail-ia/README.md) | Done | archived | 2026-08-28 五类聚合上线 | 无 |
| [authentication](plans/authentication/README.md) | Done | archived | 2026-08-27 全链路上线 | Deferred：用户管理界面 / SSO / 多租户 |
| [client-issues-tracking](plans/client-issues-tracking/README.md) | Done | archived | 2026-08-26 全链路上线 | 无 |
