// Pixel-accurate label coverage of hardware. node coverage.mjs <url>
import { chromium } from '../e2e/node_modules/playwright-core/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const dir = process.argv[3]; mkdirSync(dir, { recursive: true });
const url = process.argv[2];
const VPS = [['1440x900', 1440, 900], ['1180x820', 1180, 820], ['1024x768', 1024, 768], ['820x1180', 820, 1180], ['390x844', 390, 844]];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const out = {};
for (const [name, w, h] of VPS) {
  const page = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 1440, isMobile: w < 500 })).newPage();
  await page.goto(url); await page.locator('.status').waitFor(); await page.waitForTimeout(1500);
  const box = await page.locator('.stage__viewport').boundingBox();
  const labels = await page.evaluate(() => [...document.querySelectorAll('.scene-label')].map((e) => { const r = e.getBoundingClientRect(); return { t: e.querySelector('.scene-label__title').textContent, x: r.x, y: r.y, w: r.width, h: r.height }; }));
  await page.addStyleTag({ content: '.scene-labels,.inspector,.stage__legend{visibility:hidden!important}' });
  const setHw = (v) => page.evaluate((v) => { const { scene, render } = window.__pexis; for (const c of scene.children) if (['PexisComputeModule', 'PexisMemoryModule', 'PexisFabric'].includes(c.name)) c.visible = v; render(); }, v);
  await page.waitForTimeout(300);
  writeFileSync(`${dir}/${name}-hw.png`, await page.screenshot({ clip: box }));
  await setHw(false); await page.waitForTimeout(400);
  writeFileSync(`${dir}/${name}-bg.png`, await page.screenshot({ clip: box }));
  out[name] = labels.map((l) => ({ ...l, x: l.x - box.x, y: l.y - box.y }));
  await page.context().close();
}
await b.close();
writeFileSync(`${dir}/labels.json`, JSON.stringify(out));
