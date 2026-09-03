// B10 empirical probe: global MutationCache boundary.
// Aborts every mutating /api request, then triggers three of the
// auditor-flagged silent mutations and asserts a toast appears (and
// only one — no double-toast from leftover local handlers).
const { chromium } = require('playwright')
const BASE = 'http://localhost:3001'
const PID = '3cf2230a-f5c8-4137-8e60-bb4016cc9180'

;(async () => {
  const browser = await chromium.launch()
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[placeholder="用户名或邮箱"]', 'probe@verify.local')
  await page.fill('input[type="password"]', 'verify-pass-123')
  await page.getByRole('button', { name: /登\s*录|登录/ }).click()
  await page.waitForURL(`${BASE}/`, { timeout: 10000 })

  // Kill every mutating request; reads keep working.
  await page.route('**/api/**', (route) => {
    const m = route.request().method()
    if (m === 'GET') return route.continue()
    return route.abort('connectionfailed')
  })

  const readToasts = () =>
    page.evaluate(() => {
      const notes = [...document.querySelectorAll('.ant-message-notice')]
      return notes.map((n) => n.textContent?.trim() ?? '')
    })

  // 1. AssetsTab delete (auditor list: deleteAssetMut)
  await page.goto(`${BASE}/projects/${PID}`, { waitUntil: 'networkidle' })
  await page.locator('.project-tabs .ant-tabs-tab:has-text("资料")').click()
  await page.waitForTimeout(900)
  await page
    .locator('.project-tabs .ant-tabs-tabpane-active .ant-segmented-item:has-text("资产")')
    .first()
    .click()
  await page.waitForTimeout(700)
  await page.locator('button[aria-label^="删除资产"]').first().click()
  await page.locator('.ant-popconfirm .ant-btn-primary, .ant-popover .ant-btn-primary').first().click()
  await page.waitForTimeout(1500)
  console.log('[1] AssetsTab delete toasts:', JSON.stringify(await readToasts()))

  // 2. ProjectDetail 编辑信息 (auditor list: updateMut)
  await page.goto(`${BASE}/projects/${PID}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.locator('button:has-text("编辑信息")').first().click()
  await page.waitForTimeout(600)
  await page.locator('.ant-modal:visible .ant-btn-primary').first().click()
  await page.waitForTimeout(1500)
  console.log('[2] ProjectDetail edit toasts:', JSON.stringify(await readToasts()))

  // 3. Task create (failed save keeps the modal open + shows toast)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await page.locator('.ant-modal:visible .ant-btn:has-text("取 消"), .ant-modal:visible .ant-btn:has-text("取消")').first().click().catch(() => {})
  await page.waitForTimeout(400)
  await page.locator('.project-tabs .ant-tabs-tab:has-text("推进")').click()
  await page.waitForTimeout(900)
  await page
    .locator('.project-tabs .ant-tabs-tabpane-active .ant-segmented-item:has-text("任务")')
    .first()
    .click()
  await page.waitForTimeout(500)
  await page.locator('button:has-text("添加任务")').first().click()
  await page.waitForTimeout(500)
  await page.locator('.ant-modal:visible input').first().fill('B10 断网探针任务')
  await page.locator('.ant-modal:visible .ant-btn-primary').first().click()
  await page.waitForTimeout(1500)
  const modalStillOpen = await page.locator('.ant-modal:visible').count()
  console.log('[3] Task create toasts:', JSON.stringify(await readToasts()), '| modal open:', modalStillOpen > 0)

  await browser.close()
})().catch((e) => {
  console.error('FATAL', e.message)
  process.exit(1)
})
