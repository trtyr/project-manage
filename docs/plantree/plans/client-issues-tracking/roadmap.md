# Roadmap

Role: current-state
Updated: 2026-08-26

状态：已实现落地（2026-08-26），全部验证通过。

## Done

- 需求澄清 + 决策记录（001 归属/来源/状态；002 命名/字段/搜索/UI；003 findings 建模）
- 后端：migration 00020_issues / 00021_findings
- 后端：models/issue.rs + models/finding.rs（状态枚举 Rust 校验）
- 后端：handlers/issues.rs + handlers/findings.rs（双路由 + 跨项目校验）
- 后端：search.rs 纳入 issues + findings
- 后端：路由挂载（models/mod.rs、handlers/mod.rs、app.rs）
- 前端：types/index.ts re-export + api/index.ts 加 issuesApi/findingsApi
- 前端：components/IssuesTab.tsx + FindingsTab.tsx 接入 ProjectDetail
- 测试：后端 smoke（issues/findings CRUD）+ 前端契约

验证证据：cargo test 48 passed；npm run test 20 passed；cargo clippy 无警告；npm run build 成功。

## In Progress

- （无）

## Next

- （无）

## Deferred

- （无）
