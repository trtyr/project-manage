# Solution Map — 项目详情信息架构精简

Role: topic-capsule
Status: planning
Read when: 实现本功能时
Related: [decisions/001-five-group-ia.md](../decisions/001-five-group-ia.md)

## One-Screen Summary

10 平级 tab → 5 聚合 tab（概览/推进/客户/资料/成员），聚合内部用
Segmented 分段，各现有 Tab 组件零改动；默认进概览（项目摘要+时间线）。

## 组件设计

### 新增 `components/GroupedTab.tsx`（通用聚合容器）

```tsx
interface Props {
  items: { label: string; count?: number; content: ReactNode }[]
}
// 内部：Segmented（label 带 count）+ 当前选中项 content 渲染
// count 仅在 > 0 时显示为 "label (n)"
```

### 新增 `components/OverviewTab.tsx`（概览）

- 上半：项目摘要 Descriptions（status / client.name+联系人 / phase /
  goals / tech_approval / competitors），数据取自 ProjectDetail 已有的
  project / client query（作为 props 传入，避免重复请求）
- 下半：`<TimelineTab projectId={...} />`（零改动复用）

### ProjectDetail.tsx 改造

Tabs items 从 10 项替换为 5 项：

| 主 tab | 内容 | 复用组件 |
|---|---|---|
| 概览 | OverviewTab | OverviewTab（新）→ TimelineTab |
| 推进 | GroupedTab | PhasesTab / TasksTab / DeliverablesTab |
| 客户 | GroupedTab | CommunicationsTab / IssuesTab / FindingsTab |
| 资料 | GroupedTab | FilesTab（含 onFilePreview 回调透传）/ AssetsTab |
| 成员 | MembersTab | MembersTab |

- FilesTab 的 `onFilePreview` prop 需从聚合层透传（ProjectDetail 的
  setPreviewFile 已存在）。
- GroupedTab 内各子项 count 数据源沿用 ProjectDetail 既有 query
  （tasks/communications/files/issues/findings/assets 已在），
  deliverables 若无现成 query 则新增一条（或首版不计数）。

## 不动的东西

- 所有 XxxTab 业务组件（Phases/Tasks/Communications/Issues/Findings/
  Assets/Members/Files/Timeline/Deliverables）内部实现零改动
- 后端零改动；路由零改动（tab 是页内状态，不进 URL——现状保持）

## 验证路径

- `cd frontend && npm run build`（tsc 类型检查）
- `npm run test`（既有 20 个测试应不受影响）
- 手动：5 tab 可达全部 10 个原模块；Segmented 切换与计数正确；
  文件预览/上传弹窗正常；概览页时间线渲染正常

## 已落地前置（同日）

- FilesTab / FileLibrary 列宽修复：文件名列去 Space 改内联 + ellipsis，
  描述/所属项目 ellipsis，标签列定宽 140，固定列瘦身（见 git diff）
