# Roadmap — data-driven-ux-detail-audit

## Done

- [x] SQL 数据画像全维度留档（assets 凭据形态/共享、files mime、people、
      phases、CRM、空表）→ evidence/data-profile.md
- [x] 活体走查：6 路由 + 5 聚合 tab 全部内层视图 + 16 张截图 → evidence/
- [x] 用户点名①复制交互：双击 CJK 边界/拖拽幽灵/整段复制三路径实测，
      CDP 拖选局限用中立页对照实验证伪并记录方法学说明
- [x] 用户点名②凭据类型化 + 多凭据/多 URL 建模方案（C2/C3 含迁移方案）
- [x] 用户点名③设备类型：T1-T5（建议列表脱节/重复项/动态化方案）
- [x] 用户点名④预览矩阵：5 mime 活体实测 + md 不渲染/mermaid/docx-xlsx
      方案（F1-F8）
- [x] 后端模型轻扫 M1-M6 + 交互细节 I1-I8 + 表单设计并入 M

## In Progress

- 无（审计已交付，待修复 goal 认领）

## Next（修复排期建议——给后续 fix goal 引用）

- 第一批（P1 凭据工作流，用户每天都在用）：
  C1 快修（user-drag 防护 + user-select:all）→ C2 凭据结构化（表+UI+
  迁移）→ F2 markdown 渲染
- 第二批（P2 结构）：C3 多 URL、T1/T3/T4 建议列表动态化、I2/I3 模板
  确认与多套化、F3 xlsx/docx 预览、F5/I6 双格式关联、M2/M3 联系人归一
- 第三批（P3 打磨）：T2 重复项、F4 嗅探、F6/F7、I4/I5/I8、X 系列
- 观察项（不加开发，等数据）：M5 CRM 采用率、M6 时间线、F7 命名

## 已知限制（方法学）

- playwright/CDP 合成输入不支持「按住拖动选择文本」——中立页对照实验
  证实（evidence/control-select.js + drag-forensic.js + drag-final.js）；拖拽幽灵（用户口述「带着背景
  一起拖」）依据 Chromium 原生选区拖拽机制 + 代码根因（无 user-drag
  防护）定性，非探针直接复现
- Gemini 视觉模型本轮全程网络故障（与上一轮审计相同），截图未经 AI
  视觉复核，以 DOM/文本断言 + 几何探针代替；截图已存 evidence/
  screenshots/ 待人工过目
- 走查使用探针账号 `probe@detail.local`（SQL 直插 argon2id 哈希，
  轻参数 m=19456/t=2/p=1 与后端一致）；审计结束后已删除该账号及其
  全部 session（users/session 表恢复为仅剩用户本人）；业务表零写入

## Deferred

- 无
