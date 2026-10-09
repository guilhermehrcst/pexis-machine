// M1G gates on an instrumented build. node gates-m1g.mjs <url>
import { chromium } from '../e2e/node_modules/playwright-core/index.mjs';
const url = process.argv[2];
const results = []; const check = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info !== '' ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const instrument = () => {
  const s = (window.__gl = { frames: 0, calls: 0, buffers: 0, programs: 0, textures: 0 });
  const P = WebGL2RenderingContext.prototype;
  for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) { const o = P[fn]; P[fn] = function (...a) { s.calls++; return o.apply(this, a); }; }
  for (const [fn, key] of [['createBuffer', 'buffers'], ['createProgram', 'programs'], ['createTexture', 'textures']]) { const o = P[fn]; P[fn] = function (...a) { s[key]++; return o.apply(this, a); }; }
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { const c = s.calls; cb(t); if (s.calls > c) s.frames++; });
};
async function open(opts = {}) {
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, ...opts });
  const page = await ctx.newPage(); page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message)); page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && page.errors.push(m.text()));
  await page.addInitScript(instrument);
  await page.goto(url); await page.locator('.status').waitFor(); await page.waitForTimeout(1000);
  return page;
}
const settle = async (page) => { for (let i = 0; i < 60; i++) { const f0 = await page.evaluate(() => window.__gl.frames); await page.waitForTimeout(700); if ((await page.evaluate(() => window.__gl.frames)) === f0) return true; } return false; };
const pose = (page) => page.evaluate(() => { const o = []; window.__pexis.scene.traverse((x) => o.push((x.name || x.type) + ':' + x.position.toArray().join(','))); return o; });
const partY = (page, name) => page.evaluate((n) => window.__pexis.scene.getObjectByName(n).position.y, name);
const machine = (page) => page.evaluate(() => ({ regs: [...document.querySelectorAll('.regs td.mono:not(.regs__dec)')].map((e) => e.textContent), metrics: [...document.querySelectorAll('.metrics dd')].map((e) => e.textContent), status: document.querySelector('.status').textContent }));
const enter = async (page) => {
  // The switcher toggles: click CPU only if it is not already selected.
  const cpu = page.locator('.segmented button', { hasText: 'CPU' });
  if ((await cpu.getAttribute('aria-pressed')) !== 'true') await cpu.click();
  await page.getByRole('button', { name: 'Inspect parts' }).click();
};
const runToHalt = async (page) => { await page.getByRole('button', { name: 'Run' }).click(); for (let i = 0; i < 40; i++) { if ((await page.locator('.status').textContent()).includes('Halted')) return true; await page.waitForTimeout(300); } return false; };

{
  const page = await open();
  await enter(page); await settle(page);
  // Occlusion: RAM between the camera and the lifted compute tile.
  let pt;
  // Evaluate with serialised camera functions.
  const place = async (mode) => page.evaluate((m) => {
    const { scene, camera, controls, render } = window.__pexis;
    controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI; controls.minDistance = 0; controls.maxDistance = 100; controls.enableDamping = false;
    const tile = scene.getObjectByName('compute.tile').getWorldPosition(camera.position.clone()); tile.y += 0.03;
    const p = camera.position.clone().set(-2.85, 0.6, 1.35);
    const c = m === 'occluded' ? p.clone().add(p.clone().sub(tile).multiplyScalar(0.8)) : tile.clone().add(camera.position.clone().set(0.4, 1, 1).normalize().multiplyScalar(5));
    camera.position.copy(c); controls.target.copy(tile); controls.update(); camera.updateMatrixWorld(); render();
    const v = tile.clone().project(camera); const r = document.querySelector('.scene-canvas').getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }, mode);
  pt = await place('occluded'); await page.waitForTimeout(300);
  await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(300);
  check('a part hidden behind RAM cannot be picked', (await page.locator('.part-chip.is-active').count()) === 0);
  pt = await place('clear'); await page.waitForTimeout(300);
  await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(300);
  check('the same part with a clear view is picked', (await page.locator('.part-chip.is-active').textContent().catch(() => '')) === 'Compute tile');
  await page.context().close();
}
{
  // Orbit inertia does not carry the camera off the fit after a flight.
  const page = await open();
  await page.locator('.segmented button', { hasText: 'CPU' }).click();
  const client = await page.context().newCDPSession(page);
  const touch = (type, x, y) => client.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const r = await page.locator('.scene-canvas').boundingBox(); const x = r.x + r.width * 0.7, y = r.y + r.height * 0.75;
  await touch('touchStart', x, y); for (let i = 1; i <= 8; i++) await touch('touchMove', x + i * 18, y); await touch('touchEnd');
  await page.getByRole('button', { name: 'Inspect parts' }).click();
  await page.waitForTimeout(900);
  const landed = await page.evaluate(() => window.__pexis.camera.position.toArray());
  await settle(page);
  const later = await page.evaluate(() => window.__pexis.camera.position.toArray());
  const drift = Math.max(...landed.map((v, i) => Math.abs(v - later[i])));
  check('no orbit inertia after the camera flight lands', drift < 1e-9, drift.toExponential(2));
  check('no console errors (review fixes)', page.errors.length === 0, page.errors.slice(0, 2));
  await page.context().close();
}
await b.close();
console.log(`\n${results.filter(Boolean).length}/${results.length}`);
