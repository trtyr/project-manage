// ux-functional-audit fix-goal re-verification probe (AFTER state).
//
// Reproduces the audit's geometry/a11y/color checks against the FIXED build:
//   1. narrow(390px) offscreen-clickable count on board / files / detail
//      (scrollable-ancestor-aware, same rule as the audit probe)
//   2. desktop(1440px) unnamed icon-only buttons per page (first-party = 0;
//      antd internals: input clear icon, tabs overflow, Input.Search suffix)
//   3. B2: comm modal default occurred_at refreshes between two opens
//   4. B4/L9: phase status tags compute non-transparent 12% tints in LIGHT
//      and DARK mode (tokens must resolve to literal hexes)
//
// Usage:  node reverify.js http://localhost:3001 probe@verify.local pass1234
// (needs a running server + an existing account; create one via
//  POST /api/auth/setup when the users table is empty, delete it afterwards)
const { chromium } = require('playwright')

const BASE = process.argv[2] || 'http://localhost:3001'
const USER = process.argv[3] || 'probe@verify.local'
const PASS = process.argv[4] || 'verify-pass-123'
const PID = process.argv[5] || '3cf2230a-f5c8-4137-8e60-bb4016cc9180'

const offscreenCount = () => {
  let n = 0
  const misses = []
  document.querySelectorAll('button, a, [role="button"]').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.right <= window.innerWidth || r.left < 0) return
    let p = el.parentElement,
      scrollable = false
    while (p) {
      const ox = getComputedStyle(p).overflowX
      if (
        (ox === 'auto' || ox === 'scroll' || ox === 'hidden') &&
        p.scrollWidth > p.clientWidth + 3
      ) {
        scrollable = true
        break
      }
      p = p.parentElement
    }
    if (!scrollable) {
      n++
      if (misses.length < 3)
        misses.push((el.textContent || el.className || '').trim().slice(0, 30))
    }
  })
  return { n, misses }
}

const unnamedCount = () => {
  let n = 0
  const misses = []
  document.querySelectorAll('button, [role="button"]').forEach((el) => {
    const iconOnly =
      el.querySelector('svg, .anticon') && !(el.innerText || '').trim()
    if (!iconOnly) return
    const named = (
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      el.closest('[title]')?.getAttribute('title') ||
      ''
    ).trim()
    if (!named) {
      n++
      if (misses.length < 4)
        misses.push(el.className.toString().slice(0, 40))
    }
  })
  return { n, misses }
}

;(async () => {
  const browser = await chromium.launch()
  const results = { base: BASE, ranAt: new Date().toISOString(), checks: {} }

  // --- login (narrow context for geometry) ---
  const nctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const npage = await nctx.newPage()
  await npage.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await npage.fill('input[placeholder="用户名或邮箱"]', USER)
  await npage.fill('input[type="password"]', PASS)
  await npage.getByRole('button', { name: /登\s*录|登录/ }).click()
  await npage.waitForURL(`${BASE}/`, { timeout: 10000 })

  results.checks.narrow = {}
  for (const [name, path] of [
    ['board', '/'],
    ['files', '/files'],
    ['detail', `/projects/${PID}`],
  ]) {
    await npage.goto(BASE + path, { waitUntil: 'networkidle' })
    await npage.waitForTimeout(900)
    const r = await npage.evaluate(offscreenCount)
    results.checks.narrow[name] = r
    console.log(`narrow(390) ${name}: offscreen-clickable=${r.n}`, r.misses)
  }
  await nctx.close()

  // --- desktop a11y + B2 + B4 ---
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[placeholder="用户名或邮箱"]', USER)
  await page.fill('input[type="password"]', PASS)
  await page.getByRole('button', { name: /登\s*录|登录/ }).click()
  await page.waitForURL(`${BASE}/`, { timeout: 10000 })

  results.checks.unnamed = {}
  for (const [name, path] of [
    ['board', '/'],
    ['files', '/files'],
    ['detail', `/projects/${PID}`],
  ]) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    const r = await page.evaluate(unnamedCount)
    results.checks.unnamed[name] = r
    console.log(`desktop ${name}: unnamed icon buttons=${r.n}`, r.misses)
  }
  for (const tab of ['推进', '客户', '资料', '成员']) {
    await page
      .locator(`.project-tabs .ant-tabs-tab:has-text("${tab}")`)
      .first()
      .click()
      .catch(() => {})
    await page.waitForTimeout(600)
    const segs = await page
      .locator('.project-tabs .ant-tabs-tabpane-active .ant-segmented-item')
      .allInnerTexts()
      .catch(() => [])
    for (const s of segs) {
      await page
        .locator(
          `.project-tabs .ant-tabs-tabpane-active .ant-segmented-item:has-text("${s.replace(/\s*\(\d+\)$/, '')}")`,
        )
        .first()
        .click()
        .catch(() => {})
      await page.waitForTimeout(400)
    }
    const r = await page.evaluate(unnamedCount)
    results.checks.unnamed[`detail-${tab}`] = r
    console.log(`desktop detail-${tab}: unnamed=${r.n}`, r.misses.slice(0, 3))
  }

  // B2: comm modal default time refreshes
  await page.goto(`${BASE}/projects/${PID}`, { waitUntil: 'networkidle' })
  await page.locator('.project-tabs .ant-tabs-tab:has-text("客户")').click()
  await page.waitForTimeout(900)
  await page
    .locator('.project-tabs .ant-tabs-tabpane-active .ant-segmented-item:has-text("沟通记录")')
    .first()
    .click()
  await page.waitForTimeout(500)
  const pickerInput = () =>
    page
      .locator('.ant-modal:visible .ant-form-item:has(.ant-form-item-label:has-text("沟通时间")) input')
      .first()
  await page.locator('button:has-text("添加沟通记录")').first().click()
  await page.waitForTimeout(500)
  const t1 = await pickerInput().inputValue().catch(() => '')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(2500)
  await page.locator('button:has-text("添加沟通记录")').first().click()
  await page.waitForTimeout(500)
  const t2 = await pickerInput().inputValue().catch(() => '')
  results.checks.b2 = { firstOpen: t1, secondOpen: t2, refreshed: t1 !== t2 }
  console.log(`B2 first-open=${t1} second-open=${t2} refreshed=${t1 !== t2}`)
  await page.keyboard.press('Escape')

  // B4/L9: three-state tag computed backgrounds, light + dark
  const tagAudit = () => {
    const out = { tags: [], tokens: [] }
    document.querySelectorAll('.ant-tag').forEach((t) => {
      if (t.textContent.match(/待开始|进行中|已完成/)) {
        const cs = getComputedStyle(t)
        out.tags.push({
          label: t.textContent.trim(),
          bg: cs.backgroundColor,
          color: cs.color,
          transparent: cs.backgroundColor === 'rgba(0, 0, 0, 0)',
        })
      }
    })
    out.tokens = [
      '--success-hex',
      '--warning-hex',
      '--danger-hex',
      '--info-hex',
      '--accent-hex',
    ].map((v) =>
      getComputedStyle(document.documentElement).getPropertyValue(v).trim(),
    )
    return out
  }
  await page.locator('.project-tabs .ant-tabs-tab:has-text("推进")').click()
  await page.waitForTimeout(900)
  const light = await page.evaluate(tagAudit)
  results.checks.b4_light = light
  light.tags.forEach((t) =>
    console.log(`B4 LIGHT ${t.label}: bg=${t.bg} transparent=${t.transparent}`),
  )
  console.log('L9 LIGHT tokens:', light.tokens.join(' | '))

  await page.evaluate(() => localStorage.setItem('theme', 'dark'))
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.project-tabs .ant-tabs-tab:has-text("推进")').click()
  await page.waitForTimeout(900)
  const dark = await page.evaluate(tagAudit)
  results.checks.b4_dark = dark
  dark.tags.forEach((t) =>
    console.log(`B4 DARK ${t.label}: bg=${t.bg} transparent=${t.transparent}`),
  )
  console.log('L9 DARK tokens:', dark.tokens.join(' | '))
  await page.evaluate(() => localStorage.setItem('theme', 'light'))

  await browser.close()
  require('fs').writeFileSync(
    __dirname + '/reverify-results.json',
    JSON.stringify(results, null, 2),
  )
  console.log('\nwrote reverify-results.json')
})().catch((e) => {
  console.error('FATAL', e.message)
  process.exit(1)
})
