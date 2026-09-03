# 功能 Bug 档案（bugs）

> 每条含：位置 / 现象 / 证据 / 建议修法 / 优先级。
> 优先级：P1 影响可用性 · P2 功能正确性/一致性 · P3 打磨。
> 状态标记：[已活体确认] = 在运行中的应用上复现；[代码证据] = 源码行号推断，未在 UI 复现（多因现有数据不满足触发条件）。

## B1 · 冒烟测试账号永久残留 users 表 — P2（卫生/安全） [fixed 8777ab3]（smoke 库隔离 <db>_smoke + dev 库残留账号已删）

- 位置：`backend/tests/smoke.rs:37-38` + 真实 DB
- 现象：全库唯一账号是测试遗留的 `smoke@test.local`，口令硬编码在测试源码里
  （`smoke-test-password`）。setup 通道因此被永久占用；知道这对凭据的人可直接登录。
- 证据：`psql: users → 6e083681…|smoke@test.local|2026-08-27`；smoke.rs:38
- 建议：auth_flow 测试改用独立测试库或运行后清理 users 行；当前 DB 手动
  `DELETE FROM users WHERE username='smoke@test.local'` 后重新 setup 真实账号。
  （本计划只记录，不执行。）

## B2 · 沟通/发现弹窗的默认时间不随重开刷新 — P2 [已活体确认] [fixed 3347141]（每次打开 setFieldsValue(dayjs())）

- 位置：`CommunicationsTab.tsx:144`（occurred_at）、`FindingsTab.tsx:236`（observed_at）
- 现象：`initialValue={dayjs()}` 只在字段首次注册时求值；弹窗关闭后组件不卸载
  （Modal 默认保持挂载），几小时后重开"添加沟通记录"，沟通时间默认还是
  第一次打开那一刻。
- 证据：活体探针——打开弹窗读 `22:31:04`，取消后等 2.5s 重开仍读 `22:31:04`
  （秒级纹丝不动）。
- 建议：打开弹窗时主动 `form.setFieldsValue({ occurred_at: dayjs() })`
  （在 setCommOpen(true) 处），而不是依赖 initialValue。

## B3 · 交付物编辑：日期回填缺 dayjs 转换，保存静默失败 — P2 [代码证据] [fixed 3347141]（dayjs 转换 + format 保护）

- 位置：`DeliverablesTab.tsx:146`（`form.setFieldsValue(r)` 直塞字符串）、`:198`
  （`v.due_date?.format(...)`）
- 现象：due_date 有值的交付物点编辑 → DatePicker 需要Dayjs 收到 string →
  显示为空；点保存 → `string.format is not a function` TypeError → onOk 的
  promise 链中断 → **无任何提示，弹窗不关，保存无效**。
- 证据：对照 `PhasesTab.tsx:246-251`（正确转换 dayjs）；现有 3 条交付物
  due_date 全 NULL（`psql: has_due=0`），所以空值路径正常、有值路径未在
  UI 复现——属数据未触发的必然路径。
- 建议：编辑时 `setFieldsValue({ ...r, due_date: r.due_date ? dayjs(r.due_date) : null })`。

## B4 · 阶段状态 Tag 背景色拼接非法 CSS — P2 [代码证据] [fixed 3347141]（color-mix 替代字符串拼接）

- 位置：`PhasesTab.tsx:210`（`background: \`${cfg.color}15\``）
- 现象：`cfg.color` 对 待开始/进行中 是 `var(--muted-hex)`/`var(--primary-hex)`，
  拼上 `15` 后是非法值 → 浏览器丢弃 → Tag 无背景；只有 已完成（`#2d8659`）
  拼出合法 8 位 hex 生效。视觉上三种状态两种有底色一种没有（暗色模式同理）。
- 证据：CSS 变量无法后缀拼接 alpha；statusConfig 定义 PhasesTab.tsx:54-58。
- 建议：改用 `color-mix(in srgb, ${cfg.color} 12%, transparent)` 或为三种状态
  预定义 token。

## B5 · 时间线状态 Tag 显示英文原值 — P3 [代码证据] [fixed 3347141]（STATUS_LABEL 中文映射）

- 位置：`TimelineTab.tsx:145`（`{p.status}` 直接渲染）
- 现象：进行中的阶段在时间线行首 Tag 显示 `in_progress`，而全站其他地方都是
  中文（statusConfig.label）。
- 建议：复用 PhasesTab 的 statusConfig 做标签映射。

## B6 · 上传弹窗同名文件移除会全删 — P3 [代码证据] [fixed 3347141]（按 uid/index 移除）

- 位置：`FilesTab.tsx:354-355`（`prev.filter((f) => f.name !== file.name)`）
- 现象：多选两个同名文件（不同目录）后点其中一个的移除 → 两个都消失。
- 建议：用 uid/对象引用过滤而非 name。

## B7 · 任务建后不可改不可删 — P2（功能缺口） [fixed 0ac7517]（TasksTab 编辑+删除）

- 位置：`TasksTab.tsx`（表格列定义 83-160：无操作列、无编辑弹窗）
- 现象：任务只有 状态/优先级/指派 三个内联下拉；标题、截止日期建后无法修改，
  也没有删除。写错标题只能弃用。
- 对照：Issues/Findings 有删除、Deliverables/Members/Assets 有完整编辑——
  同类资源能力不齐。
- 建议：补 action 列（编辑 + 删除），编辑弹窗复用 create 表单。

## B8 · 客户关切/产品发现建后不可编辑 — P2（功能缺口） [fixed 0ac7517]（Issues/Findings 编辑弹窗）

- 位置：`IssuesTab.tsx` / `FindingsTab.tsx`（仅内联下拉 + 删除）
- 现象：标题、描述、截止、来源交流关联等建后均不可改。
- 建议：同 B7。

## B9 · 文件描述/标签编辑 API 无 UI 入口 — P3 [fixed 0ac7517]（FilesTab 元数据编辑（描述/标签））

- 位置：`api/index.ts:181`（filesApi.update）在前端无任何调用点
- 现象：后端 `PUT /files/{id}`（改 description/tags）齐全，但 FilesTab/FileLibrary
  都没有编辑入口——上传时填错描述无法修正。
- 建议：FilesTab 行内加编辑动作或点描述列就地编辑。

## B10 · mutation 错误处理大面积缺失（失败静默）— P2（系统性） [fixed 8777ab3]（19 处 mutation onError 补齐）

- 位置：PhasesTab(create/update/delete)、TasksTab(create/update)、IssuesTab×3、
  FindingsTab×3、DeliverablesTab×3、MembersTab(create/update/delete)、
  FilesTab(delete)、ProjectBoard(createClient/update/delete)
- 现象：除 FilesTab 上传、MembersTab 拖拽、CommunicationTab 上传外，
  绝大多数 useMutation 无 onError → 网络失败/后端 4xx 时无提示、弹窗不关、
  用户不知情。
- 建议：全局约定 onError → `message.error(classifyApiError(...).message)`，
  或封装 useAppMutation 统一处理。

## B11 · 删除项目无错误分支 — P3 [代码证据] [fixed 3347141]（.catch(message.error)）

- 位置：`ProjectDetail.tsx:299`（`projectsApi.delete(...).then(...)` 无 catch）
- 现象：删除失败（如网络断）无提示，用户以为已删并跳转。
- 建议：补 catch + message.error。

## B12 · `var(--line)` 未定义 — P3 [代码证据] [fixed 3347141]（var(--hairline)）

- 位置：`App.tsx:103`（ErrorBoundary 兜底按钮 border）；index.css 变量表无 `--line`
- 现象：报错兜底页按钮边框色回落到 currentColor（非设计意图）。
- 建议：改用已定义的 `--hairline` 或补定义。

## B13 · 登录/引导页 CSS 变量兜底值与品牌不符 — P3 [代码证据] [fixed 3347141]（品牌色 fallback 修正）

- 位置：`LoginPage.tsx:64`（`var(--primary, #1a365d)`）、Login/Setup 的
  `--bg/--card-surface/--hairline` 兜底也与 token 实际值有偏差
- 现象：正常加载无影响，但 CSS 加载失败/嵌入场景下品牌点显示藏青而非
  teal（#148374）。
- 建议：兜底值对齐 DESIGN.md token。

## B14 · App.css 整文件是 Vite 脚手架死代码 — P3 [fixed 3347141]（App.css 删除）

- 位置：`frontend/src/App.css`（184 行：.counter/.hero/.vite/#next-steps 等）
- 现象：无任何组件引用这些类；还引用了未定义变量（--accent-bg/--border/
  --text-h/--social-bg/--shadow）。死代码进 bundle。
- 建议：删除文件 + App.tsx 中的 import。

## B15 · 过期会话永不清理，session 表无限增长 — P2（数据卫生） [fixed 8777ab3]（purge_expired_sessions 启动清理）

- 位置：backend session 层（tower-sessions 未启用 deletion driver）；真实 DB
- 现象：每次登录插一行；审查期间 231→241（我的 10 次探针登录贡献 10 行）。
  当前 0 过期只是因为 30 天滑期未到；将无限累积。
- 证据：`SELECT count(*), count(*) FILTER (WHERE expiry_date < now()) FROM session
  → 241 | 0`；oldest expiry 2026-09-10。
- 建议：启用 tower-sessions 的 continuous deletion，或启动时 `DELETE FROM
  session WHERE expiry_date < now()`（放进现有迁移/启动序列）。

## B16 · docs 勘误：modules.md 对 GroupedTab 的描述 — P3（已顺手修正） [fixed 审计时]（modules.md 已更正）

- 位置：`docs/context/modules.md` E.1（昨日写错为"嵌套 antd Tabs"）
- 实况：GroupedTab 渲染的是 antd **Segmented**（GroupedTab.tsx:2,32）。
- 状态：docs/context 属本计划允许的勘误面，writeup 阶段直接修正。
