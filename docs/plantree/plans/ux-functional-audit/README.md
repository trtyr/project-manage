# UX & Functional Audit — project-manage

Role: plan root
Created: 2026-09-03 · Mode: audit (read-only against src/)

## Scope

对 project-manage 全部路由与功能做系统性审查，重点锤前端布局与视觉；
产出 = 带证据的问题档案，供后续修复计划引用。**本计划不修改任何
backend/frontend 源码**（唯一写入面 = 本目录 + plantree README 一行）。

三类发现（见 findings/）：

1. **bugs** — 功能性小 bug（前后端）
2. **layout** — 布局与视觉问题（留白/对齐/响应式/状态覆盖/可访问性）
3. **data-optimization** — 基于真实数据现状的优化机会（含 SQL 证据）

## 文件地图

| 文件 | 角色 |
|---|---|
| [roadmap.md](roadmap.md) | 审查进度与阶段状态 |
| [inventory.md](inventory.md) | 路由 × 功能清单（对照运行中应用核实） |
| findings/bugs.md | 功能 bug 档案 |
| findings/layout.md | 布局与视觉档案 |
| findings/data-optimization.md | 数据驱动的优化机会 |
| evidence/screenshots/ | 23 张全路由截图（1440×900 + 390×844 + 暗色）+ report.json（console 错误与 4xx/5xx 记录） |
| evidence/geometry.json | 每路由布局几何审计（溢出/裁剪/小目标/小字号/未命名图标按钮） |

## 审查方法与证据规则

- 前后端真实运行（backend :3001 生产模式 + SPA 静态托管，本地真实数据，
  登录账号 `smoke@test.local`——冒烟测试遗留，见 bugs #B1）
- 每条发现必须带证据：截图文件名 / geometry.json 指标 / 代码行号 / SQL 输出
- 视觉走查截图存 evidence/screenshots/，供人工复核
- 优先级：P1 影响可用性 / P2 明显不精致 / P3 打磨项

## 关联

- 基线：[docs/plantree/baseline/README.md](../../baseline/README.md)
- 架构事实：[docs/context/architecture.md](../../../context/architecture.md)
- 上一个 UI 重构：[plans/detail-ia/](../detail-ia/README.md)（5 聚合 tab 的来源）
