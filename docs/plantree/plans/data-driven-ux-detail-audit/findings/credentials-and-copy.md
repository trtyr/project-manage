# 凭据体验与复制（credentials-and-copy）— 用户点名①②

> 数据画像：credentials 4 形态并存（空×2 / `API Key:` 前缀×2 / 账号+密码多行×1 /
> 裸 hex×1）；云图与 AilPHA 共享同一把 API Key。证据：evidence/data-profile.md ①

## C1 · 凭据弹窗复制三连败 — P1（用户点名①）

- 位置：`AssetsTab.tsx:130-170`（SecretText 弹窗）
- 现象：用户想选中凭据文本手动复制，体验三条路全断：
  1. **双击**：CJK 词边界只选中一个「：」（探针实测 `dblclick selection = "："`）
  2. **拖动**：在已选中文本上按住拖动 → Chromium 原生行为把整个选区变成
     拖拽幽灵（选中文字+蓝色背景跟着鼠标走）——即用户描述的
     「带着背景一起拖」；且 drop 后选区丢失
  3. **复制按钮**：整段复制含「账号：」前缀的多行文本，**无法只复制密码**
- 证据：evidence/cred-modal-probe.js 运行输出（[A][C1][C2][E] 各场景）；
  截图 evidence/screenshots/cred-modal-open.png
- 根因：`Paragraph`（AssetsTab.tsx:160-168）无 `-webkit-user-drag: none` /
  `onDragStart` 防护；凭据是单块自由文本，没有字段化结构
- 建议（快修）：Paragraph 加 `style={{ WebkitUserDrag: 'none' }}` +
  `onDragStart={(e) => e.preventDefault()}`；弹窗内文本改为
  `user-select: all`（单击全选）
- 建议（根治）：见 C2 结构化凭据——按字段展示，每行独立复制按钮，
  选中复制这个动作本身就不需要了
- 方法学说明：playwright/CDP 合成输入**不支持拖动选择**（中立页面对照
  实验证实，见 evidence/drag-rootcause 记录），拖影行为依据浏览器原生
  机制推断 + 用户口述；双击与复制按钮路径为探针实测

## C2 · 凭据应类型化 + 一账号多凭据 — P1（用户点名②）

- 位置：数据模型 `models/asset.rs:21`（credentials Option<String>）+
  表单 `AssetsTab.tsx:512-517`（TextArea rows=3）
- 现状证据：库里 4 种形态并存；`账号：zhaojunyu\n密码：Nt2^Zt%c` 这种
  多行文本就是「一个凭据字段装了两个凭据」
- 建议（建模方案，供修复 goal 评审）：

  ```text
  asset_credentials 表：id / asset_id FK / cred_type(api_key|password|
  token|ssh_key|other) / label(如"管理台") / username / secret /
  expires_at / notes / created_at
  ```

  - 前端：凭据区改为字段列表，每条凭据一行（类型 Tag + label + 掩码值 +
    独立复制按钮 + 编辑/删除）；「添加凭据」选类型后出对应字段
    （api_key 只填 secret；password 填 username+secret）
  - 兼容迁移：现有自由文本迁移为一条 `cred_type=other, notes=<原文>`
    的凭据，不丢数据
- 优先级：P1（这是用户实际每天的复制密码工作流）

## C3 · 一资产多 URL / 入口地址需求 — P2（用户点名②延伸）

- 现状证据：EDR 与 DLP 的 value 是**同一个**零信任统一入口
  （`https://tjclientguard.sdata.net.cn:9093/login`）；「集团零信任」资产
  自己反而没有 URL（它就是入口本身）；AilPHA 的 value 是管理台首页
- 含义：value 单字段装不下「管理面/业务面/登录页」多地址的真实形态，
  也表达不了「多资产共用一个入口」
- 建议方案 A（轻）：value 保持主地址，urls 以 JSON TEXT[] 存
  （`[{label:'管理台',url:'...'}]`），前端凭据区下方渲染地址列表
- 建议方案 B（与 C2 同构）：asset_urls 子表（label/url/kind），
  与凭据表同批迁移
- 零信任入口共用：短期内保持「每个资产填同一个 URL」也可接受（数据
  已如此）；若做 C2/C3 子表可加「引用共享入口」能力，非必须

## C4 · 跨资产凭据共享（云图=AilPHA 同 Key）— P3

- 证据：`GROUP BY credentials HAVING count(*)>1` → 1 组（云图、AilPHA）
- 现状可接受：两行各自存同一把 key，改 key 要改两处（易漏改——安全债）
- 建议：C2 建模时加可选 `source_asset_id`（引用另一资产的凭据）或
  至少「同值凭据」UI 提示；优先级低（当前仅 1 组）
