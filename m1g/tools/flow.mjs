// M1G vertical slice flow. node flow.mjs <url> <label> [w h]
import { chromium } from '../e2e/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'node:fs';
const [url, label, W = '1180', H = '820'] = process.argv.slice(2);
const OUT = new URL(`./shots/${label}/`, import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 2, hasTouch: true });
const page = await ctx.newPage(); const errors = [];
page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text()));
await page.goto(url); await page.locator('.status').waitFor(); await page.waitForTimeout(1200);
const box = await page.locator('.stage__viewport').boundingBox();
const shot = (n) => page.screenshot({ path: `${OUT}${n}.png`, clip: +W < 600 ? undefined : box });
const snapshotPose = () => page.evaluate(() => { const out = []; window.__pexis.scene.traverse((o) => out.push((o.name || o.type) + '#' + (o.isCSS2DObject ? 'css2d' : '') + ':' + o.position.toArray().join(',') + ':' + o.quaternion.toArray().join(',') + ':' + o.scale.toArray().join(','))); return out; });
const cam = () => page.evaluate(() => { const { camera, controls } = window.__pexis; return { p: camera.position.toArray(), t: controls.target.toArray() }; });
const rest = await snapshotPose(); const cam0 = await cam();
await shot('01-assembled');
await page.locator('.segmented button', { hasText: 'CPU' }).click(); await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Inspect parts' }).click(); await page.waitForTimeout(1500);
await shot('02-exploded');
const slider = page.locator('.explode-bar input[type=range]');
await slider.fill('50'); await page.waitForTimeout(500); await shot('03-half');
await slider.fill('100'); await page.waitForTimeout(500);
// Tap the compute tile at its projected world position.
const tileAt = await page.evaluate(() => {
  const { scene, camera } = window.__pexis; const tile = scene.getObjectByName('compute.tile');
  const v = tile.getWorldPosition(camera.position.clone()); v.y += 0.03; v.project(camera);
  const r = document.querySelector('.scene-canvas').getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
});
await page.touchscreen.tap(tileAt.x, tileAt.y); await page.waitForTimeout(500);
const card = await page.locator('.inspector__card--parts').innerText();
await shot('04-part-selected');
await page.getByRole('button', { name: 'Activity ring' }).click(); await page.waitForTimeout(400); await shot('05-ring-selected');
await page.getByRole('button', { name: 'Assemble' }).click(); await page.waitForTimeout(1200); await shot('06-assembled-in-mode');
await page.getByRole('button', { name: 'Done' }).click(); await page.waitForTimeout(1500);
await shot('07-after-done');
const after = await snapshotPose(); const cam1 = await cam();
const diff = rest.filter((r, i) => r !== after[i]);
console.log(JSON.stringify({ card: card.split('\n').slice(0, 12), poseDiffs: diff.length, diffNames: diff, restOf: rest.filter((r) => !after.includes(r)), sameCount: rest.length === after.length, camDelta: Math.max(...cam1.p.map((v, i) => Math.abs(v - cam0.p[i]))), errors }, null, 1));
await b.close();
