# 数据画像 — data-driven-ux-detail-audit 基线（2026-09-04 13:0x）

> 全部为对本地 `project_manage` 库的真实只读 SQL。凭据值在输出中做了
> 脱敏替换（`<KEY-1>`），不影响形态判断。原始脚本见本文件末尾。

## ① assets（6 行）— 用户点名的重点

| name | asset_type | vendor | access_method | credentials 形态 | value（URL） |
|---|---|---|---|---|---|
| 亿格云 EDR | EDR | 亿格云 | 零信任登录 | （空） | `https://tjclientguard.sdata.net.cn:9093/login` |
| 亿格云 DLP | DLP | 亿格云 | 零信任登录 | （空） | `https://tjclientguard.sdata.net.cn:9093/login` |
| NGTIP | 威胁情报 | 微步在线 | 零信任登录 | 裸 hex（无标注） | `https://tjtip.sdata.net.cn/intelligence/login` |
| 云图 | 暴露面检测 | | 零信任登录 | `API Key：<KEY-1>` | `https://tjasm.sdata.net.cn/login` |
| 集团零信任 | 零信任 | | （空） | 账号+密码（多行文本） | （空） |
| AilPHA | SOC | 安恒 | 零信任登录 | `API Key：<KEY-1>` | `http://tjailpha.sdata.net.cn/` |

**信号（直指用户举例）：**

- **凭据 = 一个自由 TEXT 字段**，4 种形态并存：空×2 / `API Key:` 前缀标注×2 /
  账号+密码多行×1 / 裸 hex×1 —— 无类型、无结构、无法校验
- **跨资产凭据共享真实存在**：云图与 AilPHA 的 API Key 完全相同（同一把
  `<KEY-1>`）——"一凭据多资产"是真实需求，不是假设
- **URL 共享真实存在**：EDR 与 DLP 的 value 是**同一个**零信任统一入口 URL；
  集团零信任（凭据本体）自己反而没有 URL —— "一资产多 URL / 多资产一 URL"
  双向需求都出现了
- asset_type 6 行 6 个值（EDR/DLP/威胁情报/暴露面检测/零信任/SOC），自由
  TEXT、无受控词表；vendor 有 2 行为空
- `集团零信任` 无 access_method、无 URL —— 它是"承载凭据的入口资产"，
  当前模型没有这种角色概念

## ② files（12 行）— mime × 关联 × 命名

| mime | 数量 | 文件（简称） |
|---|---|---|
| application/pdf | 5 | NGTIP API 文档、AiLPHA OPENAPI、网络威胁告警 SOP、暴露面告警 SOP、终端告警 SOP 分_v3 |
| text/markdown | 3 | 网络威胁告警 SOP、互联网暴**漏**面告警 SOP 分析、终端告警分析 SOP_v3 |
| docx | 2 | Bot 接口文档、安全告警分析SOP梳理_v2.0 |
| text/plain | 1 | 一体化平台日志结构样例 |
| xlsx | 1 | 安全运营场景需要数据集团提供的数据-1 |

**信号：**

- **同一文档双格式并存**：`网络威胁告警分析 SOP`（pdf+md）、`终端告警`
  （pdf `_分_v3` + md `_v3`）—— md 是工作稿、pdf 是导出交付稿的双轨制
  是真实工作流，预览方案要同时吃下两种
- **命名不统一**：版本后缀形态 `_v2.0` / `_v3` / `分_v3` / `-1` 混用；
  `互联网暴漏面` 是「暴露面」的错别字——无命名约束/提示的代价
- 12/12 全部关联阶段、0/12 关联沟通、0/12 有标签（tag 功能上线了也无人用）
- 尺寸跨度 1.7KB → 2.3MB（预览方案要考虑大 pdf）

## ③ people（6 行）— 全 client 侧、0 team 侧

黄嘉骏（领导）/ 张赛（一体化平台开发对接人）/ 吴思海（集团运营）/
姚嘉豪（安全运维工程师）/ 周子傲（实习生）/ 李文斌（项目负责人）
—— 全部 `side=client`，notes 全有值；**team 侧仍然 0 人**（D2 老状态延续，
指派下拉的引导文案本轮要活体复核）。
表结构注意：people **没有 contact 列**（只有 name/role/notes）。

## ④ phases（3 行）— 日期依旧全空

SOP 梳理（completed）/ AI SOC MVP 开发（completed）/ AI SOC 对接生产环境
（in_progress）—— planned/actual 四列**全部为空**，时间线功能仍休眠
（D3 修的「去填日期」按钮要活体复核其可见性与引导力）。

## ⑤ projects / clients / deliverables

- 项目：phase 空、tech_approval 空、competitors 空（CRM 字段上线后仍是
  0% 采用——D5 的 Board 入口够不够顺手，本轮评估）；goals 有 3 条真实内容
- 客户：上海数据集团——contact_person / contact_info / products **全空**，
  客户记录只剩一个名字（联系人信息实际记在 people 的 role/notes 里了：
  「一体化平台开发对接人」等）
- 交付物：3/3 已验收 + 全部关联文件、0/3 有截止日（D7 判断的延续）

## ⑥ 空表

communications=0、tasks=0、issues=0、findings=0、带标签文件=0。
**四个空 tab 的空状态就是这些功能当前 100% 的真实体验。**

## 画像 SQL（复跑用）

见审计会话执行记录；核心查询：
assets 全量与凭据形态分类、`GROUP BY credentials HAVING count(*)>1`（共享
凭据）、`GROUP BY value`（共享 URL，EDR/DLP 同 URL）、project_files mime
分布与关联率、people side 分布、phases 日期四列计数、projects CRM 字段、
空表 UNION 计数。
