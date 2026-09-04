# data-driven-ux-detail-audit — 数据驱动的 UX 细节审计

> 2026-09-04。起因：用户点名四类体验问题（凭据复制选中、凭据类型化/
> 多凭据/多 URL、设备类型、文件预览），要求以现有数据库内容为基线把
> 全部小细节问题清出来写成 plan tree。**只查只记，不修**。

## 范围与结论速览

- 数据基线：6 资产 / 12 文件 / 6 人员（全客户侧）/ 3 阶段（日期全空）/
  1 项目 1 客户 / 四业务表空（沟通/任务/关切/发现）
- 产出 findings：**31 条**（C×4 凭据、T×5 类型、F×8 文件预览、I×8 交互、
  M×6 模型表单），P1×3 / P2×9 / P3×19；另观察项 3 条（不加开发）
- 用户点名四例全部有专属结论：① C1（复制三连败+根因）② C2/C3/C4
  （类型化+多凭据+多 URL 建模方案）③ T1-T5（类型现状+动态化方案）
  ④ F1-F8（5 mime 实测矩阵+md 渲染+xlsx/docx 方案）

## 文件地图

| 文件 | 角色 |
|---|---|
| 本文件 | 入口（范围/结论/读法） |
| [roadmap.md](roadmap.md) | 当前状态 + 修复排期建议 + 方法学限制 |
| [findings/credentials-and-copy.md](findings/credentials-and-copy.md) | 凭据体验与复制（点名①②） |
| [findings/asset-taxonomy.md](findings/asset-taxonomy.md) | 资产类型与访问方式（点名③） |
| [findings/files-and-preview.md](findings/files-and-preview.md) | 文件与在线预览（点名④） |
| [findings/interaction-details.md](findings/interaction-details.md) | 其余交互细节 |
| [findings/model-and-forms.md](findings/model-and-forms.md) | 数据模型与表单（含后端轻扫） |
| evidence/data-profile.md | SQL 数据画像（全部结论的数据依据） |
| evidence/*.js + screenshots/ | 探针脚本与 16 张截图 |

## 读法建议

修复 goal 认领时：先读 roadmap 的排期分批 → 每条 finding 自带
位置（文件:行号）/ 现象 / 证据 / 建议 / 优先级，可直接转为任务。
凭据结构化（C2）与多 URL（C3）涉及 DB 迁移，方案已给出兼容路径
（自由文本 → other 类型凭据，不丢数据）。
