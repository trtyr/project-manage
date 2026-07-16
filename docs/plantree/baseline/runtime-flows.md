# Runtime Flows — sec-tracker

> 新项目，以下为预期运行时流程。

## 部署架构

```
用户浏览器  →  React SPA  →  Rust API Server  →  PostgreSQL
```

## 请求流程

1. 用户在浏览器中操作 React SPA
2. 前端通过 HTTP/JSON 调用 Rust 后端 REST API
3. 后端处理业务逻辑，读写 PostgreSQL
4. 返回 JSON 响应给前端渲染

## 关键流程

### 项目创建流程
用户创建项目 → 选择/创建客户 → 设定项目目标 → 进入跟踪阶段

### 沟通记录流程
用户添加沟通记录 → 关联项目 → 记录内容/参与人/结论 → 更新任务状态

## 运行环境

- 后端：单进程 Rust 二进制，监听 HTTP 端口
- 前端：构建为静态文件，由后端 serve 或独立部署
- 数据库：PostgreSQL 实例
