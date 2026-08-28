# 认证全链路检查报告

Date: 2026-08-28
Goal: mtcihxxm-2rd2m1（认证链路体检）
Scope: 前端 auth 链路静态审查 + Docker 实例 API 实测 + pm 脚本实测

## 结论

链路整体健康：后端 fail-closed / 会话 / 登录流程无一失守。前端在
"认证成功后的缓存状态"上有一组连锁 bug（含 1 个关键级），已全部修复。

## 发现与处置

| # | 问题 | 级别 | 处置 |
|---|---|---|---|
| 0 | 未登录时侧边栏 projects query 无守卫发射 → 401 拦截器整页自刷新死循环（"跳跳跳"） | 🔴 关键 | `enabled: !!me` + 拦截器防自跳守卫（本报告前一轮已修） |
| A | Setup 成功后 `auth-status` 缓存仍是 `needs_setup:true`（60s staleTime）→ App effect 把用户弹回 /setup，后端会话已建但页面卡死 | 🔴 关键 | SetupPage 成功回调 `setQueryData` 翻转两个缓存 |
| B | Login/Setup 成功后 `auth-me` 缓存不更新（旧 error/disabled 状态无人刷新）→ 登出按钮不出现、侧边栏计数空，直到手动整页刷新 | 🔴 关键 | 成功回调 `setQueryData(['auth-me'], user)` 播种响应 |
| C | 认证未决期（status/me 加载中）业务页面挂载抢跑 → 401 整页跳（闪屏一次） | 🟡 UX | App 加 authReady 门：未决时渲染全屏 Spin，业务 query 不发射 |
| D | auth.rs 顶部注释声称 status 返回 `authenticated` 字段（实际只有 needs_setup） | 🟢 文档 | 注释修正 |

## API 实测（Docker :9999，21/21 通过）

needs_setup 探针 → setup 201 + Set-Cookie + UserPublic（无 password_hash
泄漏）→ 重复 setup 409 → 坏密码 401（通用消息，无用户枚举）→ 登录（用户名
大小写不敏感）→ me → 业务 CRUD（建/列/删）→ 会话保持（cookie 复用）→
logout 204 → 登出后 me/clients 均 401 → status 翻转 false → health 白名单
200 → search 守卫 401 → 未知路径 fail-closed 401。

## pm 脚本实测（7/7 通过）

裸调干净 401 → auth login（ok+user 包装）→ cookie 业务列表 → auth me →
清 session 文件后 PM_USER/PM_PASS 自动重登 → logout → 登出后裸调 401。

## 剩余风险

- **me 竞态发射**：authStatus 未到时 `enabled: !authStatus?.needs_setup`
  求值为 true，me 会先发一发（必然 401）。无害：/auth/ 端点豁免整页跳、
  error 状态被登录后的 setQueryData 覆盖。保留现状（修它要引入三态
  loading 复杂度，收益低）。
- **深链 401 是整页跳**（非 SPA navigate）：session 过期后点击旧深链，
  拦截器 window.location 跳 /login。可接受（一次跳、无循环）。
- **HTTP 明文 cookie**（非 Secure）：内网 HTTP 部署的既定决策，TLS 落地
  时 revisit（见 deploy.md §6.1）。
- pm 的 session 文件 ~/.pm-session 明文 cookie：本机文件权限保护范围。

## 用户浏览器确认清单

1. 打开 <http://localhost:9999> → 应停在「系统初始化」（不跳转）
2. 创建账号 → 应直接进入主页（**不再弹回 /setup**）
3. 侧边栏底部应出现登出按钮 + 用户名 tooltip（**不再需要手动刷新**）
4. 登出 → 回登录页 → 再登录 → 流程顺畅
5. 未登录直接访问旧深链 → 一次跳转到登录页（不闪烁不循环）
