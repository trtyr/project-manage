// 走查 2：凭据弹窗内选中-拖动的原生 drag ghost 复现（用户点名①）
const { chromium } = require('playwright')
const BASE = 'http://localhost:3001'
const PID = '3cf2230a-f5c8-4137-8e60-bb4016cc9180'

;(async () => {
  const browser = await chromium.launch()
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[placeholder="用户名或邮箱"]', 'probe@detail.local')
  await page.fill('input[type="password"]', 'probe-detail-pass')
  await page.keyboard.press('Enter')
  await page.waitForURL(`${BASE}/`, { timeout: 15000 })

  await page.goto(`${BASE}/projects/${PID}`, { waitUntil: 'networkidle' })
  await page.locator('.project-tabs .ant-tabs-tab:has-text("资料")').click()
  await page.waitForTimeout(900)
  await page
    .locator('.ant-tabs-tabpane-active .ant-segmented-item:has-text("资产")')
    .first()
    .click()
  await page.waitForTimeout(900)

  // 打开「集团零信任」的凭据弹窗（多行 账号+密码）
  const row = page.locator('tr:has-text("集团零信任")')
  await row.locator('button:has-text("••••••")').click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: '/tmp/pw-audit/cred-modal-open.png' })

  // A. 弹窗里的文本长什么样
  const para = page.locator('.ant-modal:visible .ant-typography').first()
  const text = await para.innerText()
  console.log('[A] modal text =', JSON.stringify(text))

  // B. 段落是否 draggable / user-select 如何
  const css = await page.evaluate(() => {
    const p = [...document.querySelectorAll('.ant-modal .ant-typography')].find((el) => el.offsetParent) || document.querySelector('.ant-modal .ant-typography')
    const cs = getComputedStyle(p)
    return {
      userSelect: cs.userSelect,
      draggable: p.draggable,
      webkitUserDrag: cs.webkitUserDrag,
    }
  })
  console.log('[B] css =', JSON.stringify(css))

  // C. 双击选中「密码」那一行，然后按住拖动（用户动作还原）
  const box = await para.boundingBox()
  const pwLineY = box.y + box.height * 0.75 // 密码在第二行
  await page.mouse.dblclick(box.x + 30, pwLineY)
  const selAfterDbl = await page.evaluate(() => window.getSelection().toString())
  console.log('[C1] dblclick selection =', JSON.stringify(selAfterDbl))

  let dragstartFired = false
  await page.evaluate(() => {
    window.__dragGhost = 0
    document.addEventListener('dragstart', () => window.__dragGhost++)
  })
  // 在已选中的文本上按住并拖动 —— 触发原生选区拖拽
  await page.mouse.move(box.x + 30, pwLineY)
  await page.mouse.down()
  await page.mouse.move(box.x + 160, pwLineY - 6, { steps: 6 })
  await page.waitForTimeout(300)
  const duringDrag = await page.evaluate(() => ({
    dragstart: window.__dragGhost,
    selection: window.getSelection().toString(),
  }))
  console.log('[C2] during drag =', JSON.stringify(duringDrag))
  await page.mouse.up()
  await page.screenshot({ path: '/tmp/pw-audit/cred-modal-after-drag.png' })

  // D. 从未选中状态直接按住拖选（另一个路径）
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await row.locator('button:has-text("••••••")').click()
  await page.waitForTimeout(500)
  const box2 = await page.locator('.ant-modal:visible .ant-typography').first().boundingBox()
  await page.mouse.move(box2.x + 10, box2.y + box2.height * 0.3)
  await page.mouse.down()
  await page.mouse.move(box2.x + 150, box2.y + box2.height * 0.3, { steps: 6 })
  await page.waitForTimeout(200)
  const selD = await page.evaluate(() => window.getSelection().toString())
  const dragD = await page.evaluate(() => window.__dragGhost)
  await page.mouse.up()
  console.log('[D] fresh drag-select: selection =', JSON.stringify(selD), '| dragstart fired =', dragD)

  // E. 复制按钮复制的是整段还是可以只复制密码？
  console.log('[E] copy button copies entire value（含「账号：」前缀）: 无分段复制能力')

  await browser.close()
})().catch((e) => {
  console.error('FATAL', e.message)
  process.exit(1)
})
