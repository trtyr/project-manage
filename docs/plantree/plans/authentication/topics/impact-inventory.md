# Impact Inventory — 加认证要动的每一处

Role: detail-shard
Status: planning
Read when: 实现排期 / 评估工作量时
Related: [solution-map.md](solution-map.md)

一图流：认证落地时的全部触点。实现 goal 按此清单逐项验收。

## 1. 端点保护清单

保护策略：**默认全拒，白名单放行**（fail-closed）。

| 端点 | 处置 |
|---|---|
| `GET /api/health` | 白名单（容器健康检查依赖） |
| `GET /api/auth/status` | 白名单（探测 needs_setup，登录页要用） |
| `POST /api/auth/setup` | 白名单 + 仅 users 空表放行（否则 409） |
| `POST /api/auth/login` | 白名单 |
| `POST /api/auth/logout` | 需认证（登出也是一种会话操作） |
| `GET /api/auth/me` | 需认证 |
| **其余全部 `/api/*`**（17 组 nest：clients/projects/communications/tasks/issues/findings/assets/files/phases/people/deliverables/search 及其 project-scoped 变体） | 需认证，未认证 → 401 |
| 非 `/api` 静态资源（ServeDir SPA） | 不拦（前端资产公开；数据全部走 API） |

## 2. 后端触点

| 文件 | 改动 |
|---|---|
| `migrations/00022_users.sql`（新） | users 表 + session 表（手写 DDL，不用 tower-sessions 的 runtime migrate，保持迁移统一管理） |
| `models/user.rs`（新） | User 行结构 + CreateUser；**不导出** password_hash 到 ts-rs |
| `handlers/auth.rs`（新） | login / logout / setup / status / me 五个 handler |
| `auth/middleware.rs` 或并入 auth.rs | from_fn 守卫：session 提取 user_id，失败 → 401 |
| `error.rs` | AppError 新增 `Unauthorized` 变体（error code `unauthorized`，envelope 结构不变）；4 变体 → 5 变体 |
| `app.rs` | build_app 签名扩展（+ SessionManager）；挂 session layer + auth 中间件 + auth 路由 |
| `main.rs` | 初始化官方 PostgresStore（`with_schema_name("public")` → 迁移 00022 的表）、构建 session layer 传入 build_app；无 SESSION_SECRET（决策 004：cookie 无签名） |
| `db/` | ensure_user_exists 之类的 helper（如需要） |

## 3. 前端触点

| 位置 | 改动 |
|---|---|
| `pages/LoginPage.tsx`（新） | 登录表单 |
| `pages/SetupPage.tsx`（新） | 首次初始化（needs_setup 时强制路由到此） |
| `App.tsx` | 路由加 /login /setup；启动时查 auth status 分流（已登录 → 正常；未登录 → /login；needs_setup → /setup）；头部加登出按钮 |
| `api/index.ts` | authApi（status/login/logout/setup/me）+ **axios 401 拦截器**（跳 /login，防止登出后白屏报错） |
| `types/` | UserPublic 生成与 re-export |

前端守卫是体验层，真正的强制在后端 401——SPA 挡不住直接打 API，无需过度设计。

## 4. 测试触点（隐性大头 #1）

`backend/tests/smoke.rs` 全部 13 个测试裸 HTTP：

- `start_test_server`：build_app 签名变了 → 传 SessionManager（测试用临时签名密钥即可）
- 新 helper `auth_login(http, base_url)`：幂等建号（users 空则 setup，409 则直接 login `smoke@test` 账号），reqwest Client 自动携带 cookie——并行测试下 setup 竞态由 409 → login 兜住
- 每个既有测试开头加一行 login 调用
- 新增 auth 专项测试：setup→login→me→logout→401 全流程 + 未认证访问业务端点 → 401
- argon2 哈希/验证 roundtrip 走单元测试（lib 内）

## 5. pm 脚本触点（隐性大头 #2）

pm 裸 HTTP，加认证即全瘫（003 决策 4）：

- `pm auth login`：登录并把 cookie 存 `~/.pm-session`（或 $PM_SESSION_FILE）
- 全局请求自动携带 cookie（读该文件）
- 环境变量 `PM_USER` / `PM_PASS` 存在时首次 401 自动登录重试一次
- skill 文档（SKILL.md + references/*）同步更新

## 6. 部署与配置触点

| 项 | 改动 |
|---|---|
| `docker-compose.yml` | 无需变更（无 SESSION_SECRET，决策 004） |
| `backend/.env` | SESSION_SECRET（开发用） |
| `docs/context/deploy.md` | 环境变量表 + 初始化流程说明（实现时更新） |
| `docs/context/conventions.md` §2 | AppError 变体表加 Unauthorized（实现时更新） |

## 7. 明确不动的东西

- 业务资源 handler/model（9 个资源零改动——保护在中间件层，不在 handler 层）
- CORS 策略（同源部署 + vite proxy 转发，无跨域 cookie 问题；若未来前后端分离部署，需收紧 CORS + allow credentials——记入 solution-map 风险区）
- uploads 磁盘结构、既有迁移

## 8. 风险备忘

1. **vite dev proxy**：`changeOrigin: true` 已配，Set-Cookie 经代理回传正常；cookie 属性用 `SameSite=Lax`（同源场景最稳）；dev 是 http 无 Secure，生产同源部署也可不带 Secure（除非上 TLS，再开）。
2. **tower-sessions 版本错位**（002 注意点 1）：实现时 `cargo tree -d` 核对。
3. **测试并行 setup 竞态**：靠 409→login 幂等兜底，不引入串行锁。
