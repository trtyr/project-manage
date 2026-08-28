# Roadmap

Role: current-state
Updated: 2026-08-28

状态：已实现落地（2026-08-28），验证通过。

## Done

- 需求澄清（三方案对比，用户选定五类聚合）
- 前置：FilesTab / FileLibrary 列宽修复（ellipsis + 定宽）
- GroupedTab 通用聚合容器（Segmented + count + key 驱动）
- OverviewTab（Descriptions 摘要 props 传入 + TimelineTab 复用）
- ProjectDetail Tabs 10 → 5（概览/推进/客户/资料/成员，默认概览）
- onFilePreview 三处透传（Phases/Communications/Files）+ deliverables 计数 query

验证证据：npm run build（tsc 零错误）通过；npm run test 20 passed；
oxlint ok；结构走查——5 主 tab key 齐、10 个原模块全部在渲染树
（Timeline 经 OverviewTab）。

## In Progress

- （无）

## Next

- （无）

## Deferred

- （无）
