import { chromium } from '../e2e/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'node:fs';
const OUT = new URL('./shots/seq/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await b.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, hasTouch: true })).newPage();
await page.goto(process.argv[2]); await page.locator('.status').waitFor(); await page.waitForTimeout(800);
await page.locator('.segmented button', { hasText: 'CPU' }).click(); await page.getByRole('button', { name: 'Inspect parts' }).click(); await page.waitForTimeout(1500);
const box = await page.locator('.stage__viewport').boundingBox(); const slider = page.locator('.explode-bar input[type=range]');
const values = [...Array.from({ length: 21 }, (_, i) => i * 5), ...Array.from({ length: 19 }, (_, i) => 95 - i * 5)];
let n = 0;
for (const v of values) { await slider.fill(String(v)); await page.waitForTimeout(160); await page.screenshot({ path: `${OUT}${String(n++).padStart(3, '0')}.png`, clip: box }); }
await b.close();
