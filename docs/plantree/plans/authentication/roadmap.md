# Roadmap

Role: current-state
Updated: 2026-08-27

状态：已实现落地（2026-08-27），全量验证通过。

## Done

- 需求澄清 + 决策（001-003）+ 影响面盘点 + 方案胶囊（规划 goal）
- 迁移 00022（users + session 表；users.organization_id 留多租户占位）
- models/user.rs（User 行 + UserPublic 投影；password_hash 不出后端）
- handlers/auth.rs 五端点 + require_auth fail-closed 中间件
- AppError 新增 Unauthorized(401) / Conflict(409)
- **官方 sqlx-store + 类型标注**（决策 004，用户裁决）：官方 store
  强开 sqlx `time` feature，feature 合并把全库时间列宏推断翻成
  time-crate 类型。解法：输出列加 `AS "col: chrono::..."` 标注
  （6 文件），绑定侧走 `dt_to_offset`/`date_to_time_date` helper
  （8 处）；store 以 `with_schema_name("public")` 指向迁移 00022
  建的 public.session（其默认是私有 tower_sessions schema）
- app.rs 拆 public_api（health+auth 白名单）/ guarded_api（全量
  require_auth）；session layer 挂全局
- cookie **无签名**（决策 005）：cookie 只存随机 session id，状态全在
  服务端；伪造无效、重启不掉线，无需 SESSION_SECRET
- smoke 改造：auth_login helper（cookie jar + 幂等 setup/login），
  新增 test_auth_flow（401/409/登出全流程）
- 前端：LoginPage / SetupPage / 启动分流 / 401 拦截器 / 登出按钮
- pm：auth login/logout/status/me + cookie 持久化 + PM_USER/PM_PASS
  自动重登；skill 文档 + 全局副本同步
- deploy.md §6.1 认证章节、conventions.md 错误表（4→6 变体）

验证证据：cargo test 51 passed（含 14 smoke）；npm run test 20 passed；
clippy -D warnings 零告警；npm run build 通过；pm 端到端 A-E 场景全过。

## In Progress

- （无）

## Next

- （无）

## Post-landing audit

- 2026-08-28 认证全链路体检（goal mtcihxxm-2rd2m1）：修复 3 处登录后缓存
  bug + 1 处抢跑闪屏，API 21/21、pm 7/7、重建复验 7/7 —— 见
  [topics/auth-chain-audit.md](topics/auth-chain-audit.md)

## Deferred

- 用户管理界面（加号/改密页）
- SSO/OAuth 登录源
- 多租户（organizations 表 + 行级隔离）——users 表已留列位
