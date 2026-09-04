// 走查 3：文件预览支持矩阵活体实测（用户点名④）
// 对库里 5 种 mime 各挑一个文件点开预览，记录弹窗内实际渲染形态
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
    .locator('.ant-tabs-tabpane-active .ant-segmented-item:has-text("文件")')
    .first()
    .click()
  await page.waitForTimeout(1000)

  // 每种 mime 选一个代表文件
  const targets = [
    ['pdf', 'NGTIP平台功能API文档'],
    ['markdown', '网络威胁告警分析 SOP.md'],
    ['txt', '一体化平台日志结构样例'],
    ['docx', 'Bot接口文档'],
    ['xlsx', '安全运营场景需要数据集团提供'],
  ]
  for (const [kind, namePart] of targets) {
    const eye = page
      .locator(`tr:has-text("${namePart}") button[aria-label^="预览"]`)
      .first()
    if (!(await eye.count())) {
      console.log(`[${kind}] 预览按钮未找到（${namePart}）`)
      continue
    }
    await eye.click()
    await page.waitForTimeout(2500)
    const body = await page.evaluate(() => {
      const modal = [...document.querySelectorAll('.ant-modal')].find(
        (m) => m.offsetParent,
      )
      if (!modal) return { err: 'no modal' }
      const iframe = modal.querySelector('iframe')
      const img = modal.querySelector('img')
      const pre = modal.querySelector('pre')
      const fallback = modal.textContent?.includes('不支持在线预览')
      return {
        hasIframe: !!iframe,
        iframeSrc: iframe?.getAttribute('src')?.slice(0, 50),
        hasImg: !!img,
        hasPre: !!pre,
        preLines: pre ? pre.querySelectorAll('div').length : 0,
        mdRendered: !!modal.querySelector('h1,h2,h3,ul,ol,code'),
        fallback,
        bodySnippet: modal.textContent?.replace(/\s+/g, ' ').slice(0, 90),
      }
    })
    console.log(`[${kind}]`, JSON.stringify(body))
    await page.screenshot({
      path: `/tmp/pw-audit/preview-${kind}.png`,
    })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  }
  await browser.close()
})().catch((e) => {
  console.error('FATAL', e.message)
  process.exit(1)
})
