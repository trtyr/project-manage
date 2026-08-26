# 001 — 归属层级、来源关联、完成状态

Date: 2026-08-26

## Context

用户提出：每次去客户那儿交流，客户会暴露一些在意的问题；下次去之前需要知道还有哪些没解决。需要一个专门模块记录这些问题并跟踪完成情况。经用户问卷确认方向。

## Decision

1. **归属层级：项目级（project）**。问题挂 project 下，与现有 communications / tasks 对齐。选 project 而非 client，是为了与现有资源层级一致、实现最简单；同一客户多项目时问题分散的代价已被告知并被接受。
2. **来源关联：可选关联 communication**。记录时可关联到某次交流（`communication_id`），也可不关联、手动记。
3. **完成状态：三态** — 待解决 / 进行中 / 已解决。

## Consequences

- 实现可完全复用 tasks 的 handler / model 模式（status 校验 + `ensure_project_exists`）。
- 同客户跨项目的问题不汇总，若未来需要客户级视图需另议。
- 可选关联意味着 `communication_id` 可空，需要处理「来源缺失」和「跨项目一致性」两个边界。
