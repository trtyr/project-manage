# Storage & State — project-manage

## 数据库

- **选型**：PostgreSQL
- **状态**：待确认连接方式、迁移工具

## 预期数据实体

```
Client（客户）
├── products[]        # 客户产品
├── security_concerns[]  # 关注的安全问题
└── background_info    # 背景资料、关联记录

Project（项目）
├── status            # 进行中/已完成/暂停
├── phase             # 当前阶段
├── goals[]           # 项目目标
├── client_id         # 关联客户
├── communications[]  # 沟通记录
│   ├── content       # 沟通内容
│   ├── timestamp     # 时间
│   ├── participants  # 参与人
│   └── conclusion    # 结论
└── tasks[]           # 任务
    ├── title         # 任务标题
    ├── status        # 当前/下一步/待办
    └── planned_date  # 计划日期
```

## 状态管理

- 后端：无状态 REST API，状态全部持久化到 PostgreSQL
- 前端：React 状态管理方案待确认（React Query + Zustand / Context API）
