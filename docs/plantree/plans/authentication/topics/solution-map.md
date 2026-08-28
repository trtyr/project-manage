# Solution Map — Authentication

Role: topic-capsule
Status: planning
Read when: 实现前通读；实现 goal 的验收对照
Related: [decisions/001](../decisions/001-auth-form-and-scope.md)
· [decisions/002](../decisions/002-session-vs-jwt.md)
· [decisions/003](../decisions/003-bootstrap-and-lifecycle.md)
· [impact-inventory.md](impact-inventory.md)

## One-Screen Summary

本地账号 + 密码（argon2id）认证，tower-sessions + PostgresStore 会话
（HttpOnly cookie，30 天滑动），首次访问设置页 bootstrap，中间件层
fail-closed 保护全部 `/api/*`（auth 白名单除外）。多租户排除但表结构
留有扩展位。

## 数据模型（草案）

```sql
-- 00022_users.sql（迁移编号接 00021 之后）

CREATE TABLE IF NOT EXISTS users (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username         TEXT NOT NULL UNIQUE,          -- 用户名或邮箱，统一小写比较
    password_hash    TEXT NOT NULL,                 -- argon2id PHC 字符串（含盐+参数）
    display_name     TEXT,                          -- 显示名（可空，默认用 username）
    organization_id  UUID,                          -- FUTURE 多租户占位：可空，
                                                    -- 现在不建 FK、不建表、不查询
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (lower(username));

-- tower-sessions 官方 PostgresStore 的表结构（手写进迁移以统一管理；
-- store 侧需 with_schema_name("public") 指向本表——其默认 schema 是
-- 私有的 tower_sessions，见 decision 004）：
CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    data BYTEA NOT NULL,           -- MessagePack
    expiry_date TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_expiry_date ON session (expiry_date);
```

要点：

- `password_hash` 存 PHC 规范字符串（argon2 crate 默认输出，自带盐与
  参数版本，将来调参无需迁移）。
- 校验用恒时比较（`Argon2::verify`），登录失败统一
  `invalid username or password`，不区分哪错（防枚举）。
- `organization_id` 纯占位：rust 侧不出现该字段（模型不加），只在 SQL
  注释里声明意图——将来多租户时加列 FK + 查询过滤，本阶段零成本。

## 认证流程

```text
浏览器                                后端
  │ GET /api/auth/status               │
  │───────────────────────────────────▶│ users 空？→ {"needs_setup":true}
  │◀───────────────────────────────────│
  │                                    │
  │ [空库] POST /api/auth/setup        │  仅空表放行；argon2 哈希落库；
  │ {username, password}               │  建 session，Set-Cookie
  │───────────────────────────────────▶│  非空表 → 409
  │                                    │
  │ [日常] POST /api/auth/login        │  查用户 → verify → 建 session
  │ {username, password}               │  Set-Cookie (HttpOnly,
  │───────────────────────────────────▶│  SameSite=Lax, 30d)
  │                                    │
  │ 之后每个请求 cookie 自动带         │  中间件: session→user_id→
  │───────────────────────────────────▶│  塞 extension，否则 401
  │                                    │
  │ POST /api/auth/logout              │  删 session 行 + 过期 cookie
  │───────────────────────────────────▶│
```

## API 设计（草案）

| 方法 | 路径 | 认证 | 语义 |
|---|---|---|---|
| GET | `/api/auth/status` | 无 | `{needs_setup, authenticated?}`（登录页/前端引导） |
| POST | `/api/auth/setup` | 无（空表限定） | 建首账号并登录；409 if users 非空 |
| POST | `/api/auth/login` | 无 | 建会话；401 if 凭据错 |
| POST | `/api/auth/logout` | 有 | 销毁会话 |
| GET | `/api/auth/me` | 有 | 返回 UserPublic（id/username/display_name/created_at） |

错误走 AppError envelope（新增 `Unauthorized` 变体 → 401
`{"error":"unauthorized", ...}`；凭据错同样 401，文案不区分用户名/密码错）。

## 前端设计（草案）

- 路由：`/login`、`/setup` 独立页；`App.tsx` 启动时查 status：
  needs_setup → 强制 `/setup`；未登录 → `/login`；已登录 → 正常壳。
- axios 拦截器：响应 401 且非 auth 端点 → 跳 `/login`（登出/会话过期
  不白屏）。
- 登出按钮放应用头部；`classifyApiError` 增加 401 分支是**可选**优化
  （现状 401 落 unknown，拦截器已兜底）。

## 测试策略

- 单元：argon2 hash→verify roundtrip；username 归一化。
- smoke（改造 + 新增，详见 impact-inventory §4）：
  - auth 全流程测试（setup→me→logout→401；重复 setup→409；错密码→401）
  - 既有 13 个测试统一经 `auth_login` helper 携带会话
- 前端：classifyApiError 契约测试按需补 401 分支（若改）。

## 多租户兼容性评估（goal 约束项）

| 未来需求 | 届时改动 | 现在的预留 |
|---|---|---|
| 组织表 + 用户归属 | 建 organizations 表；users.organization_id 加 FK | ✅ 列位已留（无成本） |
| 数据按租户隔离 | 业务表加 organization_id + 查询过滤（大改，另立 plan） | 无预留（明确 out of scope） |
| SSO 登录源 | auth.rs 内加第三方回调分支；session 结构不变 | ✅ 认证边界独立（一文件） |

结论：登录功能不堵多租户的路；行级隔离届时另立 plan，与本方案无冲突。

## 实现排期建议（供实现 goal 拆任务）

1. 迁移 + user model + argon2 依赖
2. auth handler 五端点 + AppError::Unauthorized
3. session layer + fail-closed 中间件 + build_app 改造
4. smoke 改造（auth_login helper）+ auth 专项测试
5. 前端（login/setup 页 + 路由分流 + 401 拦截器）
6. pm 脚本 + skill 文档
7. 部署配置（SESSION_SECRET）+ 文档更新（deploy/conventions）
