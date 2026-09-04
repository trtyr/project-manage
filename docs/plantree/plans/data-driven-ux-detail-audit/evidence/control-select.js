const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await (await browser.newContext()).newPage();
  await page.setContent('<div style="padding:40px;font-size:20px" id="t">账号：zhaojunyu 密码：Nt2pass</div>');
  const box = await page.locator('#t').boundingBox();
  await page.mouse.move(box.x + 10, box.y + 20);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(box.x + 10 + i * 20, box.y + 20, { steps: 1 }); await page.waitForTimeout(25); }
  await page.waitForTimeout(200);
  const sel = await page.evaluate(() => window.getSelection().toString());
  await page.mouse.up();
  console.log('neutral page drag selection =', JSON.stringify(sel));
  await browser.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
