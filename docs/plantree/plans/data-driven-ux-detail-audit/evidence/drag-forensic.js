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

  // 给 Paragraph 挂标记 + 每 50ms 轮询选区与节点存活
  await page.evaluate(() => {
    const p = [...document.querySelectorAll('.ant-modal .ant-typography')].pop();
    window.__node = p;
    p.setAttribute('data-marker', 'm1');
    window.__poll = [];
    window.__timer = setInterval(() => {
      const sel = window.getSelection().toString();
      const alive = !!document.querySelector('[data-marker="m1"]');
      window.__poll.push({ sel: sel.slice(0, 20), alive, ae: document.activeElement?.tagName });
    }, 50);
  });

  const para = page.locator('.ant-modal:has-text("账号：") .ant-typography').last();
  const box = await para.boundingBox();
  const y1 = box.y + 9;
  await page.mouse.move(box.x + 12, y1);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(box.x + 12 + i * 20, y1, { steps: 1 }); await page.waitForTimeout(25); }
  await page.waitForTimeout(300);
  await page.mouse.up();
  const report = await page.evaluate(() => {
    clearInterval(window.__timer);
    return {
      polls: window.__poll.slice(0, 30),
      nodeStillSame: window.__node === [...document.querySelectorAll('.ant-modal .ant-typography')].pop(),
    };
  });
  console.log('node identity kept:', report.nodeStillSame);
  const selSamples = report.polls.filter((p) => p.sel !== '').slice(0, 5);
  console.log('polls with non-empty selection:', JSON.stringify(selSamples));
  console.log('activeElements seen:', [...new Set(report.polls.map((p) => p.ae))].join(','));
  const aliveAll = report.polls.every((p) => p.alive);
  console.log('marker alive across all polls:', aliveAll);
  await browser.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
