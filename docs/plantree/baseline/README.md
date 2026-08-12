# Baseline — project-manage

项目级上下文，供所有计划引用。

## 项目概述

为科技公司设计的项目跟踪管理系统（CRM + 项目管理结合体，专为项目交付场景设计）。

- **后端**：Rust
- **前端**：React
- **数据库**：PostgreSQL
- **权限**：单用户，不需要登录系统
- **部署**：单公司内部使用，非 SaaS

## 技术栈（已确认）

| 层 | 选型 | 状态 |
|---|---|---|
| 后端语言 | Rust | ✅ 已确认 |
| 前端框架 | React | ✅ 已确认 |
| 数据库 | PostgreSQL | ✅ 已确认 |
| 权限模型 | 单用户 | ✅ 已确认 |
| 部署模式 | 单公司内部 | ✅ 已确认 |

## 技术栈（已确认）

| 层 | 选型 | 状态 |
|---|---|---|
| Rust Web 框架 | Axum | ✅ |
| 数据库层 | sqlx (compile-time checked SQL) | ✅ |
| 前端脚手架 | Vite + React + TypeScript | ✅ |
| UI 组件库 | Ant Design | ✅ |
| 前端状态管理 | React Query + Zustand | 🟡 待验证 |
| 部署方式 | 直接二进制 + 静态文件 | ✅ |
