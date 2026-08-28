# 003 — 引导、生命周期与 pm 脚本兼容

Date: 2026-08-27

## Context

会话机制已定（002）。剩余生命周期决策：首账号引导细节、会话参数、
对既有工具链（pm 脚本 / smoke 测试）的兼容义务。

## Decision

1. **Bootstrap = 首次访问设置页**：`GET /api/auth/status` 返回
   `{"needs_setup": true}` 时，前端强制进入 `/setup` 页设置账号；
   `POST /api/auth/setup` 仅当 users 表为空时放行（否则 409）。
2. **会话 30 天滑动续期**：tower-sessions 的 session 过期即 30 天，
   活跃使用自动续期（middleware 默认行为，实现时确认续期策略配置）。
3. **登出即时销毁**：`POST /api/auth/logout` 删除服务端 session +
   过期 cookie。
4. **pm 脚本必须继续可用**：加认证后所有 `/api/*`（auth 白名单外）返
   401，pm 需新增登录步骤——规划：`pm` 增加 `auth login`（存 cookie 到
   `~/.pm-session` 或内存）与 `--cookie`/`PM_USER`+`PM_PASS` 环境变量
   自动登录；skill 文档同步更新。
5. **smoke 测试改造义务**：现有 13 个测试全部裸 HTTP——改造模式统一为
   测试内先 `setup/login` 拿会话 cookie（reqwest Client 自动携带），
   封装成 helper 复用。
6. **用户管理界面 Deferred**：加号/改密近期走 SQL；`/setup` 是唯一的
   建号入口。

## Consequences

- pm 与 smoke 的改造是本功能的隐性工作量大头（影响面详见
  topics/impact-inventory.md），必须与后端保护同批落地，否则功能上线
  即全工具链瘫痪。
- needs_setup 探测让前端能在未初始化时引导，也暴露了"空库可建号"窗口
  （自用风险可接受，见 001）。
