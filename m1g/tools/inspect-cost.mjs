// Per-frame cost in exploded inspection, per viewport. node inspect-cost.mjs <url>
import { chromium } from '../e2e/node_modules/playwright-core/index.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [w, h] of [[1440, 900], [1180, 820], [1024, 768], [820, 1180], [390, 844]]) {
  const page = await (await b.newContext({ viewport: { width: w, height: h }, hasTouch: true })).newPage();
  await page.addInitScript(() => { const s = (window.__gl = { calls: 0, tris: 0, last: null }); const P = WebGL2RenderingContext.prototype;
    for (const [fn, tri] of [['drawElements', (a) => a[1] / 3], ['drawArrays', (a) => a[2] / 3], ['drawElementsInstanced', (a) => (a[1] / 3) * a[4]], ['drawArraysInstanced', (a) => (a[2] / 3) * a[3]]]) { const o = P[fn]; P[fn] = function (...a) { s.calls++; if (a[0] === 4) s.tris += tri(a); return o.apply(this, a); }; }
    const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf((t) => { const c = s.calls, tr = s.tris; cb(t); if (s.calls > c) s.last = [s.calls - c, Math.round(s.tris - tr)]; }); });
  await page.goto(process.argv[2]); await page.locator('.status').waitFor(); await page.waitForTimeout(800);
  await page.locator('.segmented button', { hasText: 'CPU' }).click(); await page.getByRole('button', { name: 'Inspect parts' }).click(); await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Compute tile' }).click(); await page.waitForTimeout(800);
  const inside = await page.evaluate(() => { const { scene, camera } = window.__pexis; let worst = 0; const o = scene.getObjectByName('PexisComputeModule');
    o.traverse((m) => { if (!m.geometry) return; const p = m.geometry.attributes.position; const v = camera.position.clone(); for (let i = 0; i < p.count; i += 5) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).project(camera); worst = Math.max(worst, Math.abs(v.x), Math.abs(v.y)); } }); return +worst.toFixed(3); });
  const last = await page.evaluate(() => window.__gl.last);
  console.log(`${w}x${h} inspect+part: drawCalls ${last[0]} triangles ${last[1]} · exploded module max |NDC| ${inside}`);
  await page.context().close();
}
await b.close();
