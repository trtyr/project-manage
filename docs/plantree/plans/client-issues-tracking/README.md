# Client Issues Tracking

Role: plan-root
Status: Ready
Updated: 2026-08-26

## Scope（一句话）

在 project 下新增两个「客户交流问题」资源，记录与客户交流中捕捉到的问题：

1. `issues` — 客户主动提出的关切，需要我们跟进解决（三态完成跟踪）
2. `findings` — 我们观察发现的、客户正在用的产品存在的问题（轻跟踪：未反馈/已反馈）

## 动机

沟通记录（communications）只记「这次聊了什么」的流水账，缺两个追踪维度：
客户到底在意什么、解决了没（issues）；客户用的产品有什么问题、反馈了没（findings）。
下次去客户那儿之前，需要一眼看到这些。

## 文件地图

- [roadmap.md](roadmap.md) — 当前状态
- [open-questions.md](open-questions.md) — 未决问题（当前为空）
- [topics/solution-map.md](topics/solution-map.md) — issues 方案胶囊
- [topics/findings-solution-map.md](topics/findings-solution-map.md) — findings 方案胶囊
- [decisions/001-scope-and-attachment.md](decisions/001-scope-and-attachment.md) — issues 归属/来源/状态
- [decisions/002-naming-fields-and-integration.md](decisions/002-naming-fields-and-integration.md) — issues 命名/字段/搜索/UI
- [decisions/003-findings-model.md](decisions/003-findings-model.md) — findings 建模

## 已确认决策摘要

**issues（客户关切）**：项目级；可选关联 communication；三态 `open`/`in_progress`/`resolved`；
字段 title/description/communication_id/assignee_id/priority/due_date；进全局搜索；IssuesTab。

**findings（产品发现）**：项目级；独立资源；轻跟踪 `unreported`/`reported`；
字段 title/description/product/product_source(ours|third_party)/vendor/observed_at/
communication_id/feedback_status；进全局搜索；FindingsTab。

详见 decisions/001、002、003。
