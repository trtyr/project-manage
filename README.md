![Version](https://img.shields.io/badge/version-0.1.0-6366F1?style=flat-square)
[![Rust](https://img.shields.io/badge/rust-2024-ed8225?style=flat-square&logo=rust)](https://rust-lang.org)
[![React](https://img.shields.io/badge/react-19-61DAFB?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/postgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://postgresql.org)
![Platform](https://img.shields.io/badge/platform-cross--platform-8B5CF6?style=flat-square)

# project-manage

**项目跟踪管理系统。** 把散落在 Excel / 微信 / 邮件里的客户信息、项目进度、沟通记录、任务规划集中到一处，让项目状态一目了然。基于 Rust/Axum + React/TypeScript + PostgreSQL 构建，编译期类型安全的 SQL 查询，前后端分离架构。

[🔧 快速开始](#-快速开始) · [🏗️ 架构](#-架构) · [✨ 核心能力](#-核心能力) · [💻 CLI 用法](#-cli-用法) · [📋 参考文档](#-参考文档) · [🧭 Agent 上下文](#-agent-上下文)

---

## ✨ 核心能力

**业务能力**

- **客户 → 项目 → 沟通 → 任务** 一条主线贯穿，项目状态一目了然
- 项目下挂阶段树（自引用嵌套）、资产设备、文件链接、**人员（团队 + 客户统一）**、**交付物（生命周期跟踪）**
- **全局搜索**：跨项目 / 客户 / 沟通 / 任务 / 人员一键检索
- **仪表盘 + 时间线**：项目全景与事件流
- 拖拽排序（人员、资产）；Markdown 渲染沟通记录（GitHub-flavored：表格、任务列表等）

**工程特性**

- **独立 CLI（`pm`）**：从 server 解耦出来的命令行客户端，AI 可编程管理资源（见下方 [CLI 用法](#-cli-用法)）
- 编译期类型检查的 SQL（`sqlx::query!`），拼写错误在编译阶段就暴露
- 运行时迁移（非编译期宏），SQL 文件保持可读、可 diff；启动自动重试 + 就绪自检
- 前后端类型同步：ts-rs 在测试期把后端 DTO 生成成 TypeScript
- 精致的 OKLCH 设计系统——氧化青主色 + 暖琥珀点缀，明暗双主题

## 🏗️ 架构

分层全栈应用，核心业务流如下：

```text
客户 ──► 项目 ──► 沟通 ──► 任务
 │       │       │       │
 │       │ status:        │ content +
 │       │ 进行中/         │ 参与人 +
 │       │ 已完成/暂停     │ 结论
 │       │
 │       ├─ 阶段树（嵌套，自引用 parent_id）
 │       ├─ 资产（IT 设备）
 │       ├─ 文件 + 链接（可关联沟通和阶段）
 │       ├─ 人员（团队 + 客户，统一 side）
 │       └─ 交付物（交付生命周期）
 │
 └─ 产品[], 背景信息
```

技术分层：

- **前端**：Vite 开发服务器（`:5173`）提供 React SPA，通过 React Query 管理服务端状态，Axios 发请求，`/api` 在开发期代理到后端
- **后端**：Axum 挂载扁平路由和项目作用域路由（客户、项目、沟通、任务、资产、文件、阶段、人员、交付物、搜索），启动时运行迁移、重试连接、设置请求超时、tracing、CORS、上传体积限制
- **CLI（`pm`）**：独立命令行客户端（`cli/` crate），通过 HTTP 调 `/api` 管理资源，供 AI 或脚本编程使用
- **数据库**：SQLx 连接 PostgreSQL 16，编译期检查查询 + 运行时迁移

> 完整架构细节见 [架构文档](docs/context/architecture.md)。

## 🔧 快速开始

### 前置条件

- **Rust** ≥ 1.85（edition 2024）
- **PostgreSQL 16**，默认连接 `postgres://localhost:5432/project_manage`
- **Node.js**（最新 LTS），用于前端构建

### 安装与开发

```bash
# 安装前端依赖
cd frontend && npm install && cd ..

# 开发模式——两个终端分别跑后端和前端
# 终端 1：后端（:3000）
just dev                                   # 提示启动命令

# 或者手动
cargo run --manifest-path backend/Cargo.toml
cd frontend && npm run dev
```

### 生产部署

```bash
# 一键构建前端 + 部署 static + 编译并启动后端
just prod

# 查看服务状态
just status

# 停止服务
just stop
```

### 容器部署（Docker）

仓库自带三阶段 `Dockerfile` + `docker-compose.yml`（postgres:16 sidecar），
干净主机上无需本地 Rust/Node 工具链：

```bash
docker compose up -d --build      # 构建镜像 + 启动 db + app（默认 :9999 → 容器 :3000）
docker compose logs -f app        # 看日志，等「✅ 就绪检查通过」
./scripts/db-backup.sh           # 备份数据库到 backups/
docker compose down               # 停止（保留数据卷）
```

完整拓扑、备份/恢复流程见 [部署指南](docs/context/deploy.md) §8–§9。

### 测试与检查

```bash
# 冒烟测试（11 个：全模块 CRUD + CRM 字段 + people 排序/换边）
just smoke

# 全量检查（clippy + 后端测试 + 冒烟测试 + 前端 tsc）
just check

# 手动构建
just build-backend       # 后端 release
just build-frontend      # 前端 production build
```

## 💻 CLI 用法

`pm` 是独立的命令行客户端（在 `cli/` crate 里，与 server 二进制 `project-manage-backend` 解耦），直接对 `/api` 增删改查，输出 JSON（默认，AI 友好）或表格。先构建一次：

```bash
cargo build --manifest-path cli/Cargo.toml     # 或 cargo install --path cli 装到 PATH
```

```bash
pm projects list                               # 列出所有项目
pm projects list --client-id <uuid>            # 按客户过滤
pm people flip <id>                            # 团队 ↔ 客户换边
pm deliverables list --project-id <uuid>
pm --format table search "关键词"              # 全局跨资源搜索
pm --api-url http://localhost:9999 clients list  # 指向远端实例（如 Docker）
```

支持的资源子命令：`clients` / `projects` / `phases` / `tasks` / `people` / `assets` / `files` / `communications` / `deliverables`，每个都有 `list` / `get` / `create --data '<json>'` / `update` / `delete`（`people` 额外有 `flip`），外加顶层的 `search`。默认连 `http://localhost:{PORT}`，可用 `--api-url` 或环境变量 `$PROJECT_MANAGE_URL` 覆盖。详见 [modules.md §G](docs/context/modules.md)。

## 📋 参考文档

项目已生成完整的上下文文档，位于 `docs/context/`：

| 文档 | 内容 |
|---|---|
| [architecture.md](docs/context/architecture.md) | 全栈架构、分层、核心业务流 |
| [modules.md](docs/context/modules.md) | 后端模块与路由清单 |
| [tech-stack.md](docs/context/tech-stack.md) | 技术栈、版本、依赖特性 |
| [database.md](docs/context/database.md) | 数据库引擎、迁移、连接池、ER 图 |
| [api.md](docs/context/api.md) | `/api` 端点参考 |
| [domain.md](docs/context/domain.md) | 领域模型与业务不变量 |
| [conventions.md](docs/context/conventions.md) | 代码与接口约定 |
| [deploy.md](docs/context/deploy.md) | 部署拓扑、启动序列、Docker/Compose、备份恢复 |
| [DESIGN.md](DESIGN.md) | 设计系统：OKLCH 色彩、Ant Design 主题、明暗双主题 |
| [AGENTS.md](AGENTS.md) | AI 编程助手的项目入口路由 |

## 🧭 Agent 上下文

[AGENTS.md](AGENTS.md) 是 AI 编程助手的项目入口路由——包含项目类型、快速参考、命令速查和 Danger Zone（修改前必读的业务不变量）。搭配 `docs/context/` 深度文档一起使用。

此外 `pm` CLI 已注册为 Pi 技能（`project-manage-cli`，位于 `.pi/skills/project-manage-cli/`），AI 助手可直接加载它来管理项目数据。

---

⭐ 发现有用？给 [project-manage](https://github.com/trtyr/project-manage) 点个 star。
