# docs/context — project-manage 档案

项目的「现在是什么样」：事实、架构、约定。全部从真实源码与真实命令输出
校对而来。**改代码后请同步更新对应文档**（这是 AGENTS.md 的既定契约）。

跨会话的「接下来往哪走」不在这里 —— 那是 [docs/plantree/](../plantree/README.md)。

## 阅读顺序

| 文档 | 覆盖什么 | 什么时候读 |
|---|---|---|
| [architecture.md](architecture.md) | 系统分层、22 个路由的挂载、public/guarded 拆分、两条代表性数据流、关键设计决策 | 改跨层流程之前 |
| [tech-stack.md](tech-stack.md) | 语言/框架/依赖的精确版本与 feature flags、构建工具链 | 升级依赖、排查版本问题 |
| [api.md](api.md) | 全部 HTTP 端点、DTO schema、错误码映射、前端 API 映射 | 加/改端点、对齐前后端契约 |
| [database.md](database.md) | 22 个 migration 清单、ER 图、查询模式、迁移编写规范 | 动 schema 之前 |
| [modules.md](modules.md) | 每个后端 handler/model、前端 page/component 的职责与依赖 | 找代码该放哪/在哪 |
| [domain.md](domain.md) | 状态机、引用不变量、认证模型、验证面 | 理解业务规则和边界 |
| [conventions.md](conventions.md) | 命名/错误处理/验证/迁移/前端的既定模式 | 写任何新代码之前 |
| [deploy.md](deploy.md) | 本地/裸机/Docker 三种部署、环境变量、备份恢复 | 部署、运维、排障 |
| [security-baseline.md](security-baseline.md) | 依赖审计的滚动记录 | 加依赖后、定期复查 |
| [current-state.md](current-state.md) | 验证基线：哪些命令跑过、结果、已知问题 | 接手工作、评估风险时**先读这篇** |

## 维护规则

- 每篇文档只写自己的维度，不复制别的文档内容 —— 交叉引用代替重复。
- 所有断言必须有出处（文件路径或命令输出）；验证不了的就明说。
- `current-state.md` 里的命令结果带日期；过期了就重跑再更新，不要凭记忆改。
