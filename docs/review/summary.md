# Project Review Summary

**Project:** sec-tracker (网络安全项目跟踪工具)
**Date:** 2026-07-14
**Stack:** Rust (Axum + sqlx + PostgreSQL) / React 19 (Vite + Ant Design + React Query)

## Quantitative Score (fuck-u-code)

| Dimension      | Score      | Weight |
| -------------- | ---------- | ------ |
| **Overall**    | **94/100** | —      |
| Complexity     | 99/100     | 32%    |
| Duplication    | 99/100     | 20%    |
| Size           | 99/100     | 18%    |
| Structure      | 100/100    | 12%    |
| Error Handling | 68/100     | 8%     |
| Documentation  | 53/100     | 5%     |
| Naming         | 100/100    | 5%     |

> 42 files analyzed (backend + frontend source). Complexity, naming, structure all near-perfect. Two weak spots pull the score down: **error handling** (68) and **documentation** (53).

## Qualitative Assessment (Scout Analysis)

| Dimension          | Grade | Key Finding                                                                          |
| ------------------ | ----- | ------------------------------------------------------------------------------------ |
| Architecture       | **C+** | Acyclic dependency graph and solid DTO/error patterns, but no service layer — handlers own raw SQL, validation, and routing. God-component `ProjectDetail.tsx` (1,078 lines). |
| Runtime Health     | **D+** | Concurrency safety is excellent (A), but no graceful shutdown (F), minimal logging (D), no retry logic (D), and no HTTP request timeouts (C). |
| Network Resilience | **D** | DB pool well-tuned (B), but no axios timeout (D), no error classification (D), no graceful degradation (D), and CORS set to `Any` on the production path (D). |

## Overall Grade: **B-**

量化指标优秀（94/100），代码结构干净，命名规范，复杂度极低。但这是一个「**好看但不结实**」的 MVP——量化工具看不到的地方（运行时韧性、网络弹性、错误处理）存在系统性缺陷。作为单用户内部工具可以运行，但距离生产级还差关键的基础设施层。

## Top 3 Strengths

1. **代码质量指标全面优秀** — 复杂度 99、命名 100、结构 100、重复率 99。函数短小、嵌套浅、命名一致，几乎没有 over-engineering。
2. **并发安全做到 A 级** — 无共享可变状态，所有 handler 无状态，PgPool 通过 Arc 共享，连接生命周期管理完善。
3. **DTO / Error / DI 模式正确** — backend 的 Create/Update DTO 分离防止了客户端注入 id/created_at，统一的 AppError → IntoResponse 映射，axum FromRef 注入——这些是最强的架构亮点。

## Top 3 Areas to Improve

1. **运行时韧性几乎为零** (`backend/src/main.rs`) — 无优雅关停 (SIGTERM 直接 kill 进程)、无 HTTP 请求超时、无 TraceLayer 访问日志、启动时 `.expect()` 在 DB 不可用时直接 panic。这意味着每次部署或重启都可能中断进行中的请求。修复成本极低（一个 `with_graceful_shutdown` + 一个 `TraceLayer`），ROI 极高。
2. **前端 god-component** (`frontend/src/pages/ProjectDetail.tsx`, 1,078 行) — 单个文件管理 6 个子域（项目信息/沟通/任务/资产/文件/阶段），11 个 mutation，6 个 query，内嵌 form/modal 逻辑。已有的 `PhasesTab`/`MembersTab` 组件证明了拆分模式可行，但其余 4 个 tab 的逻辑仍堆在主文件里。
3. **错误处理与文档是量化最弱项** — error_handling 68/100，documentation 53/100。`files.rs` 的 error_handling 评分仅 2.7/100（13 处错误中 11 处被 `let _ =` 静默忽略），上传失败时文件留在磁盘但 DB 记录未写入。注释覆盖率最低的文件为 0%。

## Quick Wins (high impact, low effort)

1. **加优雅关停** — `main.rs` 里 `axum::serve(listener, app)` 改为 `.with_graceful_shutdown(shutdown_signal)`，再加 `pool.close().await`。4 行代码，修复 F 级问题。
2. **加 axios timeout** — `api/index.ts` 的 `axios.create({ baseURL: '/api' })` 加 `timeout: 30000`。1 行代码，修复网络请求可能永久挂起的问题。
3. **加 TraceLayer** — `main.rs` 加 `tower_http::trace::TraceLayer::new_for_http()`。每个请求自动产生结构化日志。
4. **移除未使用的 zustand** — `package.json` 声明了 zustand 依赖但代码中零处 import，属于死重量。
5. **files.rs 的 `let _ =` 全部替换为 `.context()?` 或 `tracing::warn!`** — 消除静默错误。

## Critical Files (fuck-u-code score < 60)

| File | Score  | Worst Metric |
| ---- | ------ | ------------ |
| —    | —      | 无文件总分低于 60 |

> 无文件在总体评分上低于 60，但以下文件在 **单维度** 上存在严重问题：

| File                         | Dimension         | Score  |
| ---------------------------- | ----------------- | ------ |
| `backend/src/handlers/files.rs` | error_handling | 2.7/100 |
| `backend/src/handlers/files.rs` | complexity (upload_file) | CC=20, 97 行 |
| (多个文件)                   | comment_ratio     | 0%     |

## Systemic Issues (patterns, not one-offs)

1. **无基础设施层** — 没有 TraceLayer、TimeoutLayer、retry/backoff、graceful shutdown、health check wiring。这些不是单个 bug，而是整个运维基础层的缺失。对于 MVP 可以接受，但必须标记为技术债。
2. **Handler = SQL + 路由 + 校验 三合一** — 9 个 handler 文件全部直接内联 SQL，`ensure_project_exists` 被复制粘贴了 7 次，COALESCE partial-update 模式在每个 resource handler 里重复。缺少 service/repository 中间层。
3. **前后端类型无同步机制** — `frontend/src/types/index.ts` 手写镜像 backend models，新增字段需手动改两处，无工具检查 drift。
4. **文件系统与 DB 非原子操作** — 上传时先写磁盘再写 DB（INSERT 失败则磁盘文件成为孤儿），删除项目时不清理 `./uploads/{project_id}/` 目录。
5. **错误不分类** — 前端所有错误统一 `message.error('xxx失败，请重试')`，不区分 4xx（不要重试）vs 5xx（可以重试）vs 网络断开（离线提示）。后端 `.expect()` 在启动时直接 panic，无重试。
