# Authentication

Role: plan-root
Status: Done
Updated: 2026-08-27

## Scope（一句话）

本地账号登录全链路：用户名/密码（argon2id）+ tower-sessions Postgres
会话（30 天滑动）+ 首次访问设置页 + fail-closed 中间件保护全部 API。
多租户/SSO/用户管理界面排除（users 表留 organization_id 占位）。

规划与实现两个 goal 均已完成（2026-08-27 同日落地）。

## 文件地图

- [roadmap.md](roadmap.md) — 落地清单与验证证据
- [open-questions.md](open-questions.md) — 未决问题（当前为空）
- [topics/solution-map.md](topics/solution-map.md) — 总方案（数据模型/流程/API/前端/测试）
- [topics/impact-inventory.md](topics/impact-inventory.md) — 影响面清单
- [decisions/001](decisions/001-auth-form-and-scope.md) — 形态与范围
- [decisions/002](decisions/002-session-vs-jwt.md) — session 定案与生态调研
- [decisions/003](decisions/003-bootstrap-and-lifecycle.md) — bootstrap / 生命周期 / pm 兼容
- [decisions/004](decisions/004-impl-session-store-and-cookie.md) — 实现期定案：自写 store + 无签名 cookie

## 决策摘要

1. 本地账号 + argon2id；多租户/SSO/用户管理界面 deferred
2. Session（tower-sessions 0.14 + 官方 sqlx-store 0.15 → public.session）30 天滑动
3. fail-closed：public_api（health+auth）/ guarded_api（其余全部）
4. AppError 6 变体（新增 Unauthorized 401 / Conflict 409）
5. cookie 无签名（id-only，服务端全量状态）— 无需 SESSION_SECRET
6. time feature 传染以「输出列类型标注 + 绑定侧转换 helper」消化（决策 004）
