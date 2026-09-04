# 数据模型与表单（model-and-forms）

> 后端轻扫：每点附前端影响。模型定义 models/asset.rs、handlers/assets.rs。

## M1 · credentials 单自由文本字段（= C2 的模型面）— P1

- 位置：`models/asset.rs:21`（credentials Option<String>）；
  迁移建议见 findings/credentials-and-copy.md C2
- 前端影响：类型化凭据、分段复制、过期提醒全部做不了

## M2 · value 单字段混装 URL/IP/域名 — P2（= C3 的模型面）

- 位置：`models/asset.rs`（value Option<String>，表单 label
  「访问地址 / 值」AssetsTab.tsx:506-508）
- 现象：占位符自己承认了语义混杂（`https://... 或 IP / 域名`）；
  实际库里 5/6 是 URL——字段名却叫「值」
- 建议：短期把表单 label 改「访问地址」+ URL 语义校验/自动补协议头；
  长期随 C3 拆多地址

## M3 · people 无联系方式列，客户联系人信息双轨 — P2

- 证据：`\d people` 无 contact 列（只有 name/role/notes）；而
  clients 表的 contact_person/contact_info/products **全空**——
  联系人实际都记在 people（张赛「一体化平台开发对接人」等 6 人
  role/notes 全有值）
- 现象：两套联系人模型（clients 联系人字段 vs people 客户侧），
  实际使用只用了 people；clients 的联系人字段是死字段
- 建议：定一套——推荐 people 为唯一联系人源（已有数据），clients
  的三个联系人字段从表单撤下（DB 列保留），或反向合并；
  people 可加 contact 列（迁移 ADD COLUMN IF NOT EXISTS，符合惯例）

## M4 · 表单必填项过少，半成品记录无提示 — P3

- 证据：资产 6 行里 vendor 2 空、access_method 1 空、credentials 2 空、
  description 3 空；只有 name 必填
- 现象：自由度大是内部工具优点，但「凭据空」的资产（亿格云 EDR/DLP）
  与「无凭据资产」（集团零信任）在列表上不可区分（都是 •••••• vs -）
- 建议：不加强制；列表凭据列区分「无凭据」（灰字「未登记」）vs
  「有凭据」（••••••）——现在已经是这样（-）✓ 此条降为观察项；
  真正要做的是 C2 后凭据数量徽标

## M5 · CRM 字段采用率 0% 延续 — P3（观察项）

- 证据：tech_approval=''、competitors=''（Board 与 Detail 双入口上线后
  仍未填写；goals 有真实内容说明用户确实会填有价值的字段）
- 判断：字段入口已修过（上轮 D5），可能是真没有此需求——**观察至
  下次真实使用**，若仍 0% 建议从表单撤下（保留 DB 列），符合
  「数据说话」原则

## M6 · phases 日期四列全空持续（时间线休眠）— P3（观察项）

- 证据：3 阶段 planned/actual 四列全空；「去填日期」CTA 已上线（D3）
- 判断：CTA 在位但尚未被使用；时间线价值待真实数据验证——不建议
  再加开发投入，等一次真实填日期的行为发生
