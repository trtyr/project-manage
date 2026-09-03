# 布局与视觉档案（layout）

> 证据来源：`evidence/geometry.json`（desktop 1440×900 / narrow 390×844 实测）、
> `evidence/screenshots/`（23 张，供人工复核——本轮视觉模型不可用）、
> 组件源码行号。优先级：P1 可用性受损 · P2 明显不精致 · P3 打磨。

## L1 · 窄屏（≤390px）基本不可用 — P1 [fixed 1820c86]（960/640 断点 + 侧栏 icon-rail）

- 现象（geometry.json `narrow:*` 实测，viewport 390px）：
  - 项目列表页：`新建项目` 按钮 right=415、行 `⋯` 菜单 right=564 —— 按钮整体在屏幕外
  - 详情页：`编辑信息` right=467、`删除项目` right=584
  - 资料库：预览眼睛按钮 right=645（出屏 255px）
  - 每个页面都有 6 个左右可点元素 out-of-viewport
- 根因：`index.css` 全文仅 1 条 `@media (max-width: 960px)`（只管 comm-detail
  两栏布局）；`.app-sidebar` 220px 定宽、`.app-content` padding 36/40、
  表格列宽加总远超窄屏。
- 建议：补响应式层——侧栏 ≤960px 折叠为图标条或抽屉；page-header 换行；
  表格加 `scroll={{ x }}`；操作按钮在窄屏收纳进 Dropdown。

## L2 · 主体布局零响应式规则 — P1（与 L1 合并修） [fixed 1820c86]（3 个 @media 块）

- 证据：`index.css` @media 仅 :811（comm-detail-wrap）；board/detail/sidebar/
  tables 全无断点。
- 建议：与 L1 一并处理，断点建议 960px / 640px 两档。

## L3 · 数据表格窄屏横向溢出 — P1（L1 的主要成分） [fixed 1820c86]（7 表 scroll={{x:max-content}}）

- 证据：FilesTab 8 列、AssetsTab 9 列、Issues/Findings 7 列，均未设
  `scroll={{ x }}`；geometry narrow 每页 6 个 offscreen-clickable 全部来自表格
  操作列/行内链接。
- 建议：统一给 Table 配 `scroll={{ x: 'max-content' }}` 或按列收窄 + 操作列固定右侧。

## L4 · 资产访问地址列过窄 — P2 [fixed f0fdf9e]（URL 列 160→220）

- 证据：`AssetsTab.tsx:327`（maxWidth 160）；geometry：URL 实际需要 200-285px，
  5 条 URL 全部 ellipsis 到看不全主机名（`https://tjclientguard.sdata.net.cn:9093/`
  → 只显示前几个词）。
- 建议：value 列放宽到 220+ 或 hover 展示完整 URL（现已有 title 但截图显示
  信息密度不足）；考虑点击复制已有了，展示可截断更狠一点没问题，但 160 太窄。

## L5 · 图标按钮无障碍名缺失（26-45 个/页）— P2 [fixed f0fdf9e]（全部一方图标按钮补 aria-label）

- 证据：geometry `unnamedIconButtons`：files 页 42、detail 各 tab 26-45。
- 位置：PhasesTab 行内 添加子阶段/编辑/删除（:229-264）、DeliverablesTab
  编辑/删除（:140-157）、FilesTab 预览/下载/删除（:264-288）、MembersTab
  编辑/删除（:328-344）等全部裸 icon。
- 现象：屏幕阅读器读"按钮"；鼠标用户只能猜图标。
- 建议：统一加 `aria-label` 或 antd `Tooltip`（PhasesTab 上传按钮已有 Tooltip
  可作为范本 :365）。

## L6 · 触控目标偏小 — P3 [fixed f0fdf9e]（switch 默认尺寸；antd 内部件除外）

- 证据：geometry tiny-target——输入框清除按钮 h=12、主题 Switch（small）h=18、
  文件名链接 h=17、阶段产物 pill 内文字 h=15。
- 建议：链接行高提到 22-24px；Switch 用默认尺寸；antd 清除按钮属组件内部
  可接受。

## L7 · 新建沟通弹窗满宽无上限 — P2 [fixed f0fdf9e]（width={800} + 全局 modal max-width）

- 证据：`CommunicationsTab.tsx:133-135`（`width="100%"` + body 85vh）。
- 现象：在宽屏上表单横向拉满，12 行 TextArea 一行能装上百字，视觉松散。
- 建议：`width={{ xs: '100%', sm: 720 }}` 或 maxWidth 800 居中。

## L8 · 187 处内联样式绕过间距刻度 — P2（体系性） [fixed f0fdf9e]（触达文件迁移 + 约定 §6.2a）

- 证据：`rg 'style={{' src --glob '*.tsx' | wc -l` → 187；index.css 定义了
  --space-1..12 刻度但组件几乎不用（ProjectBoard 29 处、PhasesTab 23 处）。
- 现象：marginBottom 8/12/16/20/24/28/32 随手写，同一视图内节奏不一致
  （截图 02/05 可复核）。
- 建议：新代码强制走 token；存量按页面渐进迁移（改一处清一处）。

## L9 · 状态色硬编码绕过 token，暗色模式不适配 — P2 [fixed f0fdf9e]（状态色 4 token 化（含暗色））

- 证据：`#2d8659/#d48042`（index.css status-dot/status-badge）、`#52c41a/
  #faad14/#722ed1`（ProjectBoard.tsx:343-365 统计卡）、`#ff4d4f`（Tasks/
  Issues/Deliverables 逾期色 ×3 文件）。
- 现象：暗色模式下完成/暂停色点与浅色完全同值，视觉不协调；逾期红与
  antd error token 重复定义。
- 建议：扩 token（--success/--warning/--danger/--purple 系）并在 html.dark
  给对应值。

## L10 · 概览与头部信息重复展示 — P3 [fixed f0fdf9e]（概览只留目标/竞品）

- 证据：`ProjectDetail.tsx:222-276`（头部：状态 Tag+阶段+技术认可+竞品+客户）
  vs `OverviewTab.tsx:46-101`（Descriptions 同字段再列一遍）。
- 建议：概览只保留头部没有的深度信息（目标、竞品全文、时间线），或头部
  精简为纯标题+状态。

## L11 · 统计卡图标语义 & 加载态 — P3 [fixed f0fdf9e]（FolderOutlined + Skeleton）

- 证据：`ProjectBoard.tsx:363-366`（"资料"卡用 AlertOutlined 紫色）；`:390-393`
  （项目列表 loading 是一行文字"加载中…"，而详情页有 Skeleton）。
- 建议：资料卡换 FileOutlined/FolderOutlined；列表 loading 用 Skeleton 行。

## L12 · 时间线（甘特）细节 — P3 [fixed f0fdf9e]（今天线 + 月份标头）

- 证据：`TimelineTab.tsx:87`（标签区 marginLeft 160 定宽）、`:125`（width 150
  定宽）、周刻度无月份上下文、无"今天"指示线、状态 Tag 见 B5。
- 现状提醒：当前 3 个阶段 0 条计划日期（数据分析 #4），时间线长期处于
  空状态引导页。
- 建议：加今天线 + 月份标头；标签宽度 min() 自适应；与 D3 一并考虑要不要
  增强"快速填日期"入口。

## L13 · 两套搜索行为不一致 — P2 [fixed]（板内大搜索改走 /api/search，新增其他资源组；活体验证人员可搜到）

- 证据：侧栏全局搜索（`App.tsx` searchApi，覆盖 7 类资源）vs 板内大搜索
  （`ProjectBoard.tsx:85-89` communicationsApi.search + 本地项目过滤，只覆盖
  沟通+项目名/竞品/客户名）。placeholder 却写着"搜索项目、竞品或沟通记录…"。
- 现象：任务/关切/发现/人员/资产在板内搜不到，侧栏又能搜到；两个入口
  结果集不同容易困惑。
- 建议：板内搜索也走 /api/search，或干脆合并成一个全局搜索入口。

## L14 · 日期字段时间精度过剩 — P3 [fixed f0fdf9e]（5 处 DatePicker 去 showTime）

- 证据：阶段 计划开始/结束（PhasesTab.tsx:487-550 `showTime`）、发现日期
  （FindingsTab.tsx:237 `showTime`）都是日期语义，却带时分秒选择器。
- 建议：日期字段去 showTime；沟通时间保留时间精度是对的。

## L15 · Issues 与 Findings 列头同词 — P3 [fixed f0fdf9e]（发现/详情 文案）

- 证据：两表列头都是"问题/描述"（IssuesTab.tsx:102,176；FindingsTab.tsx:92,155），
  产品发现表其实是"发现/现象"。
- 建议：FindingsTab 列头改"发现/详情"，弹窗 label 同步。

## L16 · 删除确认交互不统一 — P3 [fixed f0fdf9e]（项目级删除统一 modal.confirm）

- 证据：Board 删除项目用 modal.confirm（ProjectBoard.tsx:162-169），Detail
  用 Popconfirm（ProjectDetail.tsx:292-308），阶段/文件/成员用 Popconfirm——
  同一动作三种确认形态。
- 建议：高危（项目级）统一 modal，行级统一 Popconfirm，按影响面分档即可，
  但项目级两种应统一。
