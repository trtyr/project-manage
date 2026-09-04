// 走查 4：全页面系统扫描——每视图截图 + 交互细节抽查
const { chromium } = require('playwright')
const BASE = 'http://localhost:3001'
const PID = '3cf2230a-f5c8-4137-8e60-bb4016cc9180'
const OUT = '/tmp/pw-audit/sweep'

;(async () => {
  const browser = await chromium.launch()
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage()
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 120))
  })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 120)))

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[placeholder="用户名或邮箱"]', 'probe@detail.local')
  await page.fill('input[type="password"]', 'probe-detail-pass')
  await page.keyboard.press('Enter')
  await page.waitForURL(`${BASE}/`, { timeout: 15000 })
  await page.waitForTimeout(800)

  const shot = (n) => page.screenshot({ path: `${OUT}-${n}.png`, fullPage: true })
  const note = (k, v) => console.log(`[${k}] ${v}`)

  // ===== board =====
  await shot('board')
  const boardStats = await page.locator('.ant-statistic').allInnerTexts()
  note('board-stats', boardStats.join(' | ').replace(/\n/g, ':'))
  // 新建项目弹窗字段清单
  await page.getByRole('button', { name: '新建项目' }).click()
  await page.waitForTimeout(600)
  const createFields = await page
    .locator('.ant-modal:visible .ant-form-item-label')
    .allInnerTexts()
  note('create-project-fields', createFields.join(','))
  await shot('board-create-modal')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const modalGone = (await page.locator('.ant-modal:visible').count()) === 0
  note('esc-closes-modal', modalGone)

  // ===== files 页 =====
  await page.goto(`${BASE}/files`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await shot('filelibrary')
  const cols = await page.locator('.ant-table-thead th').allInnerTexts()
  note('filelibrary-columns', cols.join(','))
  const row0 = page.locator('.ant-table-tbody tr').first()
  const nameLink = row0.locator('a')
  note('file-name-is-link', (await nameLink.count()) > 0)
  const tags = await page.locator('.ant-table-tbody .ant-tag').allInnerTexts()
  note('filelibrary-tags-in-table', tags.length ? tags.join(',') : '(none — 0 tagged)')

  // ===== detail: overview =====
  await page.goto(`${BASE}/projects/${PID}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  await shot('detail-overview')
  const hasTimelineCTA = (await page.locator('button:has-text("去填阶段日期")').count()) > 0
  note('overview-timeline-cta', hasTimelineCTA)
  const descRows = await page.locator('.ant-descriptions-item-label').allInnerTexts()
  note('overview-desc-rows', descRows.join(','))

  // ===== 推进 =====
  await page.locator('.project-tabs .ant-tabs-tab:has-text("推进")').click()
  await page.waitForTimeout(900)
  await shot('detail-progress-phases')
  // 阶段树:展开/收起了吗；产物区
  const phaseRows = await page.locator('.phase-node, [class*="phase"]').count().catch(() => 0)
  note('phase-node-count', phaseRows)
  const phaseFileChips = await page
    .locator('[class*="phase"] .ant-tag, [class*="phase"] span[class*="file"]')
    .count()
    .catch(() => 0)
  note('phase-file-chip-count', phaseFileChips)
  // 任务空状态文案
  await page
    .locator('.ant-tabs-tabpane-active .ant-segmented-item:has-text("任务")')
    .first()
    .click()
  await page.waitForTimeout(500)
  const taskEmpty = await page
    .locator('.ant-tabs-tabpane-active .ant-table-placeholder, .ant-tabs-tabpane-active .ant-empty')
    .first()
    .innerText()
    .catch(() => '(none)')
  note('tasks-empty-copy', JSON.stringify(taskEmpty.trim().slice(0, 80)))
  // 添加任务弹窗的指派下拉引导（D2 复核）
  await page.locator('button:has-text("添加任务")').first().click()
  await page.waitForTimeout(600)
  const taskFields = await page
    .locator('.ant-modal:visible .ant-form-item-label')
    .allInnerTexts()
  note('task-form-fields', taskFields.join(','))
  await page
    .locator('.ant-modal:visible .ant-form-item:has(.ant-form-item-label:has-text("指派给")) .ant-select')
    .click()
  await page.waitForTimeout(600)
  const dd = await page
    .locator('.ant-select-dropdown:visible')
    .last()
    .innerText()
    .catch(() => '(no dropdown)')
  note('assignee-dropdown-content', JSON.stringify(dd.trim().slice(0, 60)))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // ===== 客户 =====
  await page.locator('.project-tabs .ant-tabs-tab:has-text("客户")').click()
  await page.waitForTimeout(900)
  for (const seg of ['沟通记录', '客户关切', '产品发现']) {
    await page
      .locator(`.ant-tabs-tabpane-active .ant-segmented-item:has-text("${seg}")`)
      .first()
      .click()
    await page.waitForTimeout(500)
    const copy = await page
      .locator('.ant-tabs-tabpane-active')
      .innerText()
      .catch(() => '')
    const emptyCopy = copy.match(/还没有[^\n]{0,50}/)?.[0] ?? '(no empty copy)'
    note(`client-${seg}-empty`, JSON.stringify(emptyCopy))
  }
  await shot('detail-client-comms')

  // ===== 资料 =====
  await page.locator('.project-tabs .ant-tabs-tab:has-text("资料")').click()
  await page.waitForTimeout(900)
  await page
    .locator('.ant-tabs-tabpane-active .ant-segmented-item:has-text("资产")')
    .first()
    .click()
  await page.waitForTimeout(700)
  const assetCols = await page
    .locator('.ant-tabs-tabpane-active .ant-table-thead th')
    .allInnerTexts()
  note('asset-columns', assetCols.join(','))
  await shot('detail-assets')
  // 资产表单字段（添加资产弹窗）
  await page.locator('button:has-text("添加资产")').first().click()
  await page.waitForTimeout(600)
  const assetFields = await page
    .locator('.ant-modal:visible .ant-form-item-label')
    .allInnerTexts()
  note('asset-form-fields', assetFields.join(','))
  await page.keyboard.press('Escape')

  // ===== 成员 =====
  await page.locator('.project-tabs .ant-tabs-tab:has-text("成员")').click()
  await page.waitForTimeout(900)
  await shot('detail-members')
  const memberCols = await page.locator('.member-card').count()
  note('member-cards', memberCols)
  const teamEmpty = await page
    .locator('.ant-tabs-tabpane-active')
    .innerText()
    .catch(() => '')
  note('members-team-empty', JSON.stringify((teamEmpty.match(/团队[\s\S]{0,40}/) || [''])[0].replace(/\n/g, ' ')))

  // ===== 暗色模式 =====
  await page.evaluate(() => localStorage.setItem('theme', 'dark'))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  await shot('detail-dark')
  await page.evaluate(() => localStorage.setItem('theme', 'light'))

  // ===== comm detail 路由（空数据下的表现）=====
  await page.goto(`${BASE}/projects/${PID}/communications/00000000-0000-0000-0000-000000000000`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const commBody = await page.locator('body').innerText()
  note('comm-detail-missing', JSON.stringify(commBody.trim().slice(0, 60)))
  await shot('comm-detail-missing')

  console.log('\nconsole-errors:', errors.length ? errors.slice(0, 5) : 'none')
  await browser.close()
})().catch((e) => {
  console.error('FATAL', e.message)
  process.exit(1)
})
