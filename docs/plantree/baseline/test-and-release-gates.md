# Test & Release Gates — project-manage

> 新项目，以下为预期测试策略。

## 测试策略

### 后端（Rust）
- 单元测试：业务逻辑、数据模型
- 集成测试：API 端点、数据库交互
- 框架：Rust 内置 `#[test]` + 可能的测试辅助库

### 前端（React）
- 组件测试：React Testing Library
- E2E 测试：待确认（Playwright / Cypress）

## 发布门禁

- [ ] 后端编译通过（`cargo build --release`）
- [ ] 后端测试通过（`cargo test`）
- [ ] 前端构建通过（`npm run build`）
- [ ] 前端测试通过（`npm test`）
- [ ] 数据库迁移脚本验证
- [ ] 手动冒烟测试

## 部署方式

待确认：Docker Compose / 直接二进制 + 静态文件
