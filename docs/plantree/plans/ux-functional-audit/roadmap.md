# Roadmap — ux-functional-audit

## Done

- [x] 环境就绪：backend :3001 生产模式（3000 被其他应用占用）+ SPA 静态托管，
      真实数据登录可行（2026-09-03）
- [x] 后端 19 组读端点全量核实（全 200；无会话 401；坏项目 UUID 404）
      → [inventory.md](inventory.md)
- [x] 前端 6 路由 + 5 聚合 tab + 全部内层 Segmented 走查截图（23 张）
      + 布局几何审计（geometry.json，desktop 1440 / narrow 390）
- [x] CSS 体系审查（index.css 953 行 / App.css 死代码 184 行 / 内联样式 187 处）
- [x] 组件代码级审查：23 个 pages/components 全部过完
- [x] 活体探针确认两个疑似 bug（comm 弹窗 stale 时间 [确认]；
      deliverable 编辑空值路径 [正常，有值路径为代码证据]）
- [x] 数据现状分析：6 组真实 SQL（文件关联率/阶段日期/人员分布/会话堆积/
      CRM 字段/交付物用法）→ findings/data-optimization.md
- [x] findings 建档：bugs 16 条 + layout 16 条 + data-optimization 9 条，
      全部带证据与优先级；含修复排期建议

## In Progress

- 无（本计划产出已交付）

## Next（不在本计划范围——修复排期）

> **Last Landed 2026-09-04**：修复 goal（mtln31gn-b55dpv）把下列批次全部
> 落地——第一批 L1-L3（1820c86）、第二批 B2-B6+B11-B14（3347141）、
> 第三批 B7-B9（0ac7517）+ D2 指派引导、系统性 B1/B10/B15-D1（8777ab3）、
> 第四批 L4-L16（f0fdf9e）+ D3-D8（62137e9）+ L13 板内全局搜索（f0af827）。
> findings 三份档案已全条目标注 [fixed] / [closed] / [won't-fix(D9)]。
> D9 按其自身建议不实施。后续仅在数据长起来后重评搜索增强。

- [x] 第一批（可用性）：L1+L2+L3 响应式与表格滚动（1820c86）
- [x] 第二批（正确性）：B2 B3 B4 B10 + D1 会话清理（3347141 + 8777ab3）
- [x] 第三批（功能补齐）：B7 B8 + D2 指派引导（0ac7517 + 62137e9）
- [x] 第四批（打磨）：其余 B/L 条目按页面渐进（f0fdf9e + f0af827）

## 已知限制

- 视觉模型本轮网络故障，23 张截图未能做 AI 视觉复核——已用几何审计
  （可量化）替代，截图存 evidence/screenshots/ 待人工过目。
- B3 的"有截止日期交付物编辑失败"路径因现有数据全空 due_date 未在 UI
  复现，为代码证据级结论（对照 PhasesTab 正确实现）。

## Deferred

- 无
