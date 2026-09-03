# 数据驱动的优化机会（data-optimization）

> 全部基于 2026-09-03 对本地 `project_manage` 库的真实 SQL 查询
> （真实使用数据：1 客户 / 1 项目）。数据画像速览：
> clients 1 · projects 1 · communications **0** · tasks **0** · issues **0** ·
> findings **0** · assets 6 · project_files 12 · phases 3 · people 6 ·
> deliverables 3 · users 1 · session 241

## SQL 证据汇总

```sql
-- ① 文件：类型分布 + 关联率 + 标签
SELECT source_type, count(*), count(communication_id) AS linked_comm,
       count(phase_id) AS linked_phase,
       count(*) FILTER (WHERE array_length(tags,1) > 0) AS has_tags
FROM project_files GROUP BY source_type;
-- → file | 12 | 0 | 12 | 0   （无一条 link 类型；100% 关联阶段；0% 关联沟通；0% 有标签）

-- ② 阶段：计划日期填写率
SELECT count(*), count(planned_start), count(planned_end),
       count(actual_start), count(actual_end) FROM phases;
-- → 3 | 0 | 0 | 0 | 0   （时间线完全无数据可画）

-- ③ 人员：两侧分布
SELECT side, count(*), count(role), count(notes) FROM people GROUP BY side;
-- → client | 6 | 6 | 6   （团队侧 0 人！）

-- ④ 会话堆积
SELECT count(*), count(*) FILTER (WHERE expiry_date < now()) FROM session;
-- → 241 | 0（每次登录 +1，审查期间 231→241；30 天滑期未到所以 0 过期，将无限累积）

-- ⑤ CRM 字段
SELECT tech_approval, competitors = '' FROM projects;
-- → '' | t   （技术认可空、竞品空字符串——双双 0% 使用）

-- ⑥ 交付物
SELECT count(*), count(due_date), count(linked_file_id) FROM deliverables;
-- → 3 | 0 | 3   （截止日 0% 使用；文件关联 100%）
```

## 优化条目

### D1 · 会话表需要过期清理 — P2（与 bugs B15 同源） [fixed 8777ab3]（启动 purge（同 B15））

数据说话：241 行且单调增长。建议启用 tower-sessions deletion driver 或
启动时清理过期行。SQL ④。

### D2 · 指派下拉永远空的 — P2 [fixed 62137e9]（空菜单引导文案）

数据：团队侧 0 人（SQL ③）。影响：任务/关切的"指派"下拉、成员 tab 左列、
任务表指派列，全部呈现空菜单/空列。单人使用时这个模型太重。
建议：(a) 引导时把自己加为团队成员（一人团队）；(b) 指派允许自由输入；
(c) 至少在空菜单里给"先到成员页添加团队成员"的引导。

### D3 · 时间线功能休眠 — P2 [fixed 62137e9]（时间线空状态直达按钮）

数据：3 个阶段 0 条计划/实际日期（SQL ②）。功能写完了但没人喂日期，
用户每次进概览都看到"阶段还没有计划日期"的空状态（geometry empties 也证实）。
建议：(a) 概览时间线空状态里放「去填日期」直达按钮（现在只有文字指引）；
(b) 阶段创建弹窗把计划日期从折叠为必填或高亮；(c) 或接受现状降权——
把时间线从概览首屏挪到折叠区。

### D4 · 文件标签 0% 采用 — P3 [fixed 62137e9]（标签筛选 chips）

数据：12 文件 0 有标签（SQL ①）。标签只在两个上传弹窗里出现，列表里
无筛选入口——无收益所以没人填。
建议：资料库/文件 tab 加标签筛选 chips，先让标签"有用"，再谈填写率；
否则可以从表单里降权（折叠到"更多"）。

### D5 · CRM 字段（技术认可/竞品）0% 采用 — P3 [fixed 62137e9]（Board 表单补 CRM 字段）

数据：双双空置（SQL ⑤）。且入口分裂——Board 建项目表单根本没有这两个
字段，只有 Detail 编辑弹窗有（走查发现）。
建议：先统一入口（Board 表单补字段或删字段二选一），观察一段时间，
仍 0% 使用则考虑从表单撤下（保留 DB 列）。

### D6 · 文件-阶段关联是真实工作流主轴 — 正向信号 [closed 无需动作]（正向信号，保持）

数据：12/12 文件全部关联阶段，0 关联沟通（SQL ①）。用户实际把文件挂在
阶段下当"阶段产物"用（SOP 文档按阶段组织）。PhasesTab 的产物区做得对。
建议：强化而非新建——阶段产物区支持排序/批量挂载已有潜力；
沟通附件功能保持现状即可（无数据支撑投入）。

### D7 · 交付物=文件链接的轻量用法 — P3 [fixed 62137e9]（关联文件提前/截止可选）

数据：3/3 关联文件、0/3 有截止日（SQL ⑥）。用户把交付物当"阶段成果物
清单"用，不看日期。
建议：表单里"关联文件"提前、截止日期降权（移到折叠区），列表逾期红字
逻辑（现 0 触发）保留不动。

### D8 · 沟通/任务/关切/发现全空 — 机会成本提示 [fixed 62137e9]（七处空状态带动作指引）

四类资源 0 数据。客户 tab 三个子页全是空状态。这不是 bug，但意味着：
(a) 空状态文案是这四个功能当前 100% 的真实体验，值得好好写
    （现在多数是"还没有记录的问题"这类平铺直叙，可以给"记下客户在会上
    提的顾虑"这类带动作指引的文案 + 直达按钮）；
(b) 若实际工作流里确实不用，可以在信息架构上降权，把真实高频区
    （资料/推进）放更前。

### D9 · 搜索在当前数据下的实际价值 — P3 [won't-fix]（按建议暂不动）

全局搜索覆盖 7 类资源，但 4 类为空——当前等价于"搜文件+资产+人员+项目"。
资料库本地过滤（文件名/项目/标签）已够用。等数据长起来再考虑搜索增强
（如高亮、分类计数）。

## 修复排期建议（给后续计划引用）

- 第一批（可用性）：L1+L2+L3（响应式与表格滚动）
- 第二批（正确性）：B2 B3 B4 B10（含 D1 会话清理）
- 第三批（功能补齐）：B7 B8（编辑/删除能力拉齐）+ D2 指派引导
- 第四批（打磨）：B5 B6 B9 B11-B16 + L4-L16 按页面渐进
