# Module Map — project-manage

> 新项目，尚未有代码。以下为预期模块结构，待实现后校准。

## 预期架构

```
project-manage/
├── backend/               # Rust 后端
│   ├── src/
│   │   ├── main.rs        # 入口
│   │   ├── routes/         # API 路由
│   │   ├── models/         # 数据模型
│   │   ├── db/             # 数据库层
│   │   └── services/       # 业务逻辑
│   ├── migrations/         # 数据库迁移
│   └── Cargo.toml
├── frontend/              # React 前端
│   ├── src/
│   │   ├── pages/          # 页面组件
│   │   ├── components/     # 通用组件
│   │   ├── api/            # API 调用层
│   │   └── types/          # TypeScript 类型
│   └── package.json
└── docs/                  # 文档
    └── plantree/          # 规划文档
```

## 核心业务模块

### 1. 项目进度（Project Progress）
- 项目整体状态（进行中/已完成/暂停等）
- 当前所处阶段

### 2. 客户信息（Client Info）
- 客户关注点：客户有哪些产品，关注哪些安全问题
- 客户相关信息：基于客户产品的背景资料、关联记录

### 3. 项目目标（Project Goals）
- 项目要达成的目的和预期效果

### 4. 项目跟踪（Project Tracking）
- 沟通记录：每次沟通的内容、时间、参与人、结论
- 任务规划：当前任务、下一步计划、待办事项
