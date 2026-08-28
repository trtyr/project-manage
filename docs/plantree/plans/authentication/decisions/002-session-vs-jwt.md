# 002 — 会话机制：Session（tower-sessions）而非 JWT

Date: 2026-08-27

## Context

用户要求规划中对比后定案。约束：单实例部署、30 天长会话、需即时登出、
Postgres 已在栈内。

## 候选对比

| 维度 | Session（tower-sessions + sqlx store） | JWT |
|---|---|---|
| 即时登出 | ✅ 服务端删 session 即失效 | ❌ 令牌签发后自然有效至过期 |
| 30 天泄漏窗口 | ✅ 可随时主动吊销 | ❌ 除非加 token 版本表——退化为查库，失去无状态意义 |
| 改密码踢旧会话 | ✅ 全删该用户 session | ❌ 同上 |
| 每请求开销 | 查一次 session 表（单机 Postgres，可忽略） | 验签（更便宜，但差距无关紧要） |
| 实现复杂度 | 成熟中间件 + store，几行接入 | 自管签发/刷新/吊销逻辑 |
| 多实例扩展 | session 表天然共享（若未来上多实例） | 天然无状态（唯一优势，当前用不上） |

单用户内部工具 + 长会话 + 即时登出是硬需求，JWT 的注销短板在 30 天窗口下
被放大。**定案：Session。**

## 选型（2026-08-27 调研；同日实现定案见 decision 004）

- `tower-sessions 0.14` + `tower-sessions-sqlx-store 0.15`（官方
  PostgresStore，store 侧 core 0.14 与 tower-sessions 0.14 配套）。
  store 以 `with_schema_name("public")` 指向迁移 00022 建的
  `public.session`（官方默认是私有 tower_sessions schema）。
- **已知代价（已消化）**：sqlx-store 强开 sqlx `time` feature，全库
  时间列宏推断翻成 time-crate 类型——输出列加 `AS "col: chrono::..."`
  标注、绑定侧走 `dt_to_offset`/`date_to_time_date` helper（决策 004）。
- `argon2 0.5.3`（RustCrypto 稳定版）——`Argon2id` 变体，crate 默认参数。
- 会话数据只存 `user_id`，不存密码派生物；cookie 无签名（纯 id，
  决策 004 用户追认）。

## 已知注意点（实现时核对）

1. **版本错位**：tower-sessions-sqlx-store 0.15.0 依赖 tower-sessions-core
   ^0.14，与 tower-sessions 0.15 的 core 0.15 存在错位——实现时以
   `cargo tree -d` 验证组合可用，必要时锁 tower-sessions 0.14 配套。
2. **time 传递依赖告警**：store 链上 time < 0.3.47 有 RUSTSEC-2026-0009
   （RFC 2822 解析栈耗尽）；项目 sqlx 0.8.x 需确认 ≥ 0.8.1（已修
   RUSTSEC-2024-0363），并在 Cargo.lock 层面约束 time ≥ 0.3.47。
3. **SESSION_SECRET**：~~cookie 签名密钥走环境变量~~——实现定案取消
   （决策 004 用户追认）：cookie 只存随机 session id、状态全在服务端，
   纯 id cookie 无签名收益；不设此变量。

## Consequences

- 登出/改密/发现异常可即时踢会话——JWT 方案给不了。
- 引入两张新表（users + tower-sessions 的 session 表）与一个中间件层。
- 未来若真上多实例，session 表天然共享，无需改造。
