# 路由 × 功能清单（对照运行中应用核实）

> 核实时间：2026-09-03，backend `:3001` 生产模式（`PORT=3001
> STATIC_DIR=../frontend/dist cargo run`），登录会话（smoke 账号），
> 真实数据（client 上海数据集团 / project 安全运营 Agent 开发）。
> 后端 19 组读端点 curl 全 200；无会话 → 401；坏项目 UUID → 404。

## 1. 前端路由（6 条，App.tsx:386-396）

| 路由 | 页面 | 走查覆盖 | 备注 |
|---|---|---|---|
| `/` | ProjectBoard | 截图 02/03/17/20；几何 board | 项目列表 + 新建/编辑/删除 + 搜索 |
| `/files` | FileLibrary | 截图 04/23；几何 files | 跨项目文件库 |
| `/projects/:id` | ProjectDetail | 截图 05-14/18/19/21/22 | 5 聚合 tab，见 §2 |
| `/projects/:id/communications/:commId` | CommunicationDetail | 截图 15（缺省 404 态） | 全库 0 条沟通，只有错误态可测 |
| `/login` | LoginPage | 截图 01 | 独立壳 |
| `/setup` | SetupPage | 截图 16（users 非空时的直访态） | 首账号引导 |

## 2. ProjectDetail 5 聚合 tab（外层 Tabs + 内层 Segmented）

| 外层 tab | 内层 Segmented | 内容组件 | 走查覆盖 |
|---|---|---|---|
| 概览 | — | OverviewTab（含 TimelineTab） | 05/18/21 |
| 推进 | 阶段 / 任务 / 交付物 | PhasesTab / TasksTab / DeliverablesTab | 06/07/08 |
| 客户 | 沟通记录 / 客户关切 / 产品发现 | CommunicationsTab / IssuesTab / FindingsTab | 09/10/11/22 |
| 资料 | 文件 / 资产 | FilesTab / AssetsTab | 12/13 |
| 成员 | — | MembersTab | 14 |

注：内层是 antd **Segmented**（GroupedTab.tsx:32），不是嵌套 Tabs——
docs/context/modules.md E.1 昨日描述有误，已列入 bugs.md 勘误项。

## 3. 后端 API 面（22 nest，全部经 curl 核实）

| 组 | 端点 | 状态 |
|---|---|---|
| public | GET /api/health · /auth/status · /auth/setup* · /auth/login | 200（setup 直访 409，见走查） |
| auth（需会话） | POST /auth/logout · GET /auth/me | 200 |
| clients | GET /api/clients | 200（1 条：上海数据集团） |
| projects | GET /api/projects · ?client_id= 过滤 | 200（1 条） |
| communications | /recent?limit=5 · /search?q=告警 | 200（均空集） |
| 全局搜索 | /api/search?q=告警 | 200 |
| files | GET /api/files | 200（12 条） |
| 嵌套 ×9 | /projects/:id/{communications,tasks,issues,findings,assets,files,phases,people,deliverables} | 全 200 |
| 守卫 | 无 cookie GET /api/clients | 401 ✓ fail-closed |
| 守卫 | 坏 UUID …/tasks | 404 ✓ ensure_project_exists |

## 4. 关键数据现状（走查时，详见 data-optimization.md）

clients 1 · projects 1 · communications **0** · tasks **0** · issues **0** ·
findings **0** · assets 6 · project_files 12 · phases 3 · people 6 ·
deliverables 3 · users 1 · **session 231**

→ 客户/推进-任务/客户关切/产品发现四个面的空状态是当前真实首屏；
空状态质量 = 当前体验的主战场。
