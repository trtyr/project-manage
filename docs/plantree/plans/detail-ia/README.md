# Detail IA — 项目详情信息架构精简

Role: plan-root
Status: Done
Updated: 2026-08-28

## Scope（一句话）

ProjectDetail 从 10 个平级 tab 精简为 5 类聚合（概览/推进/客户/资料/
成员），Segmented 分段切换，全部现有功能模块零改动，默认进概览。

## 动机

tab 累积到 10 个超出认知负荷，"又重又难用"；精简到 5 个语义分组，
每个内部 2-4 段，一扫可定位。

## 文件地图

- [roadmap.md](roadmap.md) — 状态
- [open-questions.md](open-questions.md) — 未决（当前为空）
- [topics/solution-map.md](topics/solution-map.md) — 组件设计/改造表/验证
- [decisions/001-five-group-ia.md](decisions/001-five-group-ia.md) — 五类聚合定案（含被否备选）

## 决策摘要

1. 10 → 5：概览（摘要+时间线）/ 推进（阶段|任务|交付物）/ 客户
   （沟通|关切|发现）/ 资料（文件|资产）/ 成员
2. Segmented 分段，业务组件零改动；主 tab 无计数，分段带 count
3. 默认 tab = 概览
