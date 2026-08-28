# 001 — 认证形态与范围边界

Date: 2026-08-27

## Context

用户提出需要登录功能；最初设想连带多租户，经确认收敛：当前自用、暂不开放给
他人，多租户不做。规划型 goal，只产出 plan tree，实现另起。

## Decision

1. **本地账号认证**：用户名/邮箱 + 密码，argon2 哈希存储。
2. **多租户明确排除**：不建 organizations 表、不加行级隔离；但 users 表设计
   需兼容未来扩展（预留可空 organization 列位），标注 future 不实现。
3. **SSO/OAuth 不做**：仅保证认证模块有清晰的替换边界（auth handler 独立
   文件、session 中存 user_id 而非密码派生物），未来加 SSO 时不动业务资源。
4. **首次访问设置页** bootstrap：users 表为空时前端呈现初始化页面设置首个
   账号（后端 `POST /api/auth/setup` 仅在空表时放行）。
5. **暂不做用户管理界面**：单用户自用，加号/改密走 SQL 或后续 CLI；
   记为 Deferred。
6. **会话 30 天**：长会话，登出即时销毁。

## Consequences

- 实现体量可控：一张 users 表 + session 机制 + 登录/设置页 + 全端点保护。
- setup 端点是唯一的"空窗攻击面"：空库时任何人可建首账号——自用内部工具
  可接受，公网暴露前需先完成初始化。
- 未来多租户迁移成本被约束在 users 表加列 + 查询加 WHERE，业务表不动。
