# 003 — findings 资源建模

Date: 2026-08-26

## Context

用户补充：除客户主动提出的关切（issues）外，还有一种记录——我们观察发现的、
客户正在使用的产品（可能是我们的、也可能是第三方厂商的）存在的问题。解决权
在客户手里，我们的价值是记录、下次提出来、作为方案依据。经问卷确认。

## Decision

1. **独立资源 `findings`**，挂 project 下，与 issues 并列。
2. **轻跟踪**：`feedback_status` ∈ `unreported`（未反馈）/ `reported`（已反馈），
   默认 `unreported`。
3. **产品维度**：`product`（产品名，文本）+ `product_source`
   （`ours` / `third_party`，必填，无 DB 默认）+ `vendor`（厂商名，第三方时填）。
4. **字段**：`title`（必填）、`description`、`observed_at`（默认 now）、
   `communication_id`（可选来源）、`product`、`product_source`、`vendor`、
   `feedback_status`。
5. **进全局搜索**，与 issues 一致。
6. **UI**：ProjectDetail 加 `FindingsTab`，与 IssuesTab 并列。

## Consequences

- findings 与 issues 结构相似但生命周期不同，独立建模避免状态语义混淆。
- `product_source` 无 DB 默认、创建时必填，避免拍脑袋假设归属；
  前端表单可默认选中 `third_party`。
- 与 issues 共享「可选关联 communication + 跨项目一致性校验」的边界处理。
