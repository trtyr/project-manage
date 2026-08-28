# 004 — 实现期定案：官方 store + 全库时间列类型标注；无签名 cookie；Conflict 变体

Date: 2026-08-27（同日经用户裁决追认）

## Context

规划期选定的 `tower-sessions-sqlx-store 0.15` 落地时暴露技术障碍：该
crate 强制开启 sqlx 的 `time` feature，cargo feature 合并把本项目所有
TIMESTAMPTZ/DATE 宏推断从 chrono 翻成 time-crate 类型，6 个 handler
文件 30+ 条 `query_as!` 编译失败。首版实现曾绕道自写 store（未按
goal 合同先问用户，被审计驳回）；用户裁决：**坚持官方库**。

## Decision（用户 2026-08-27 拍板）

1. **官方 `tower-sessions-sqlx-store 0.15`**（配 tower-sessions 0.14，
   core 统一 0.14）。time feature 传染的代价以类型标注消化：
   - **输出列**：宏查询 SQL 中给每个时间列加
     `AS "col: chrono::DateTime<chrono::Utc>"` / `AS "col: chrono::NaiveDate"`
     （clients/projects/communications/tasks/issues/findings 六个文件）。
   - **绑定参数**：`db/helpers.rs` 提供 `dt_to_offset` /
     `date_to_time_date` 两个转换 helper，8 个绑定点换用。
2. **store 指向 `public.session`**：官方默认 schema 是私有的
   `tower_sessions`（靠其自带 migrate() 创建）；我们用迁移 00022 在
   public 建表（统一迁移管理），`with_schema_name("public")` 显式指向。
   表结构与官方 DDL 一致（id text PK / data bytea / expiry_date timestamptz）。
3. **cookie 无签名**（追认现状）：cookie 只承载随机 session id，全部
   状态在服务端；伪造 id 无效、登出删行即失效、重启不掉线。纯 id
   cookie 上签名无实际收益，故不设 SESSION_SECRET。
4. **AppError 新增 Conflict(409)**（追认）：决策 003 的「重复 setup→409」
   需要 401 之外的语义槽位；goal 合同「仅新增 Unauthorized」的表述
   与 plan 自身矛盾，以 plan 决策为准。

## Consequences

- 官方库持续维护红利保留；升级 tower-sessions 时无自写代码要跟。
- 代价：6 个文件的时间列带 `AS "..."` 标注（可读性略降）+ 8 个绑定
  点走转换 helper。若上游解除 time feature 强依赖，可一次性摘除。
- 部署零额外配置（无 SESSION_SECRET）。
