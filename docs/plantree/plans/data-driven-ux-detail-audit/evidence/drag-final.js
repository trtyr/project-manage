const { chromium } = require('playwright');
const BASE = 'http://localhost:3001';
const PID = '3cf2230a-f5c8-4137-8e60-bb4016cc9180';
(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[placeholder="用户名或邮箱"]', 'probe@detail.local');
  await page.fill('input[type="password"]', 'probe-detail-pass');
  await page.keyboard.press('Enter');
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
  await page.goto(`${BASE}/projects/${PID}`, { waitUntil: 'networkidle' });
  await page.locator('.project-tabs .ant-tabs-tab:has-text("资料")').click();
  await page.waitForTimeout(800);
  await page.locator('.ant-tabs-tabpane-active .ant-segmented-item:has-text("资产")').first().click();
  await page.waitForTimeout(700);
  await page.locator('tr:has-text("集团零信任") button:has-text("••••••")').click();
  await page.waitForTimeout(700);

  const para = page.locator('.ant-modal:has-text("账号：") .ant-typography').last();
  const box = await para.boundingBox();
  const y1 = box.y + 9; // 行内实线区
  await page.mouse.move(box.x + 12, y1);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(box.x + 12 + i * 20, y1, { steps: 1 }); await page.waitForTimeout(25); }
  await page.waitForTimeout(250);
  const dragSel = await page.evaluate(() => window.getSelection().toString());
  await page.mouse.up();
  console.log('[drag in-line1] selection =', JSON.stringify(dragSel.slice(0, 40)));

  // 跨行拖选
  await page.mouse.move(box.x + 12, y1);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) { await page.mouse.move(box.x + 12 + i * 20, y1 + 24, { steps: 1 }); await page.waitForTimeout(25); }
  await page.waitForTimeout(250);
  const crossSel = await page.evaluate(() => window.getSelection().toString());
  await page.mouse.up();
  console.log('[drag cross-line] selection =', JSON.stringify(crossSel.slice(0, 50)));

  // 键盘选择对照
  await page.locator('.ant-modal:has-text("账号：") .ant-typography').last().click();
  await page.keyboard.press('Home');
  for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowRight');
  const kbSel = await page.evaluate(() => window.getSelection().toString());
  console.log('[keyboard shift+arrows] selection =', JSON.stringify(kbSel));

  await browser.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
