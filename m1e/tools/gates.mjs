// M1E gate checks on an instrumented build. Usage: node gates.mjs <url>
import { chromium } from '../e2e/node_modules/playwright-core/index.mjs';
const url = process.argv[2];
const results = []; const check = (name, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== '' ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const instrument = () => {
  const s = (window.__gl = { frames: 0, calls: 0 });
  const P = WebGL2RenderingContext.prototype;
  for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) { const o = P[fn]; P[fn] = function (...a) { s.calls++; return o.apply(this, a); }; }
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { const c = s.calls; cb(t); if (s.calls > c) s.frames++; });
};
const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true });
const page = await ctx.newPage(); const errors = [];
page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text()));
await page.addInitScript(instrument);
await page.goto(url); await page.locator('.status').waitFor(); await page.waitForTimeout(1500);
const idle = async (settle = 2500, window = 1500) => { await page.waitForTimeout(settle); const f0 = await page.evaluate(() => window.__gl.frames); await page.waitForTimeout(window); return (await page.evaluate(() => window.__gl.frames)) - f0; };
const cam = () => page.evaluate(() => { const { camera, controls } = window.__pexis; return { p: camera.position.toArray(), t: controls.target.toArray() }; });
const project = (world) => page.evaluate((w) => {
  const { camera } = window.__pexis; const v = camera.position.clone().set(...w).project(camera);
  const r = document.querySelector('.scene-canvas').getBoundingClientRect();
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
}, world);
// --- Gate C: tap-select each component at its projected centre; camera must not jump.
const targets = { CPU: [0, 0.3, -1.25], RAM: [-2.85, 0.6, 1.35], Fabric: [0.35, 0.03, 0.5], GPU: [2.85, 0.15, 1.35] };
const before = await cam();
for (const [name, world] of Object.entries(targets)) {
  const pt = await project(world);
  await page.touchscreen.tap(pt.x, pt.y); await page.waitForTimeout(300);
  const head = await page.locator('.inspector__card h3').textContent().catch(() => null);
  const after = await cam();
  check(`tap selects ${name}`, head === name, head);
  const jump = Math.max(...after.p.map((v, i) => Math.abs(v - before.p[i])), ...after.t.map((v, i) => Math.abs(v - before.t[i])));
  check(`camera does not jump on ${name} selection`, jump < 1e-4, jump.toExponential(2));
}
check('idle after selection changes', (await idle()) === 0);
await page.locator('.inspector__card button[aria-label="Close inspector"]').click();
// --- Gate A/E: step animation, pulse stays in observed corridor; planned GPU never lights.
await page.evaluate(() => {
  const { scene } = window.__pexis; window.__pulseX = []; window.__plannedOpacity = new Set();
  const pulse = scene.children.find((c) => c.isGroup && c.children.some((m) => m.isSprite));
  const planned = []; scene.traverse((o) => { if (o.name === 'fabric.graphics-planned' || o.name === 'fabric.graphics-reserved-port') planned.push(o); });
  const tick = () => { if (pulse.visible) window.__pulseX.push(pulse.position.x); for (const p of planned) window.__plannedOpacity.add(p.material.opacity + ':' + (p.material.emissiveIntensity ?? 0)); requestAnimationFrame(tick); };
  tick();
});
for (let i = 0; i < 6; i++) { const s = page.getByRole('button', { name: 'Step', exact: true }); if (await s.isDisabled()) break; await s.click(); await page.waitForTimeout(950); }
const pulse = await page.evaluate(() => ({ n: window.__pulseX.length, maxX: Math.max(...window.__pulseX), planned: [...window.__plannedOpacity] }));
check('transfer pulse animated from real events', pulse.n > 0, pulse.n);
check('pulse never enters the planned corridor (x > 0)', pulse.maxX <= 0.001, pulse.maxX.toFixed(3));
check('planned GPU route never changes appearance', pulse.planned.length === 2, pulse.planned);
check('halted', (await page.locator('.status').textContent()).includes('Halted'));
check('idle after animations end', (await idle()) === 0);
// --- Gate C: touch orbit via CDP, then rotate portrait/landscape: user angle preserved, hardware in view.
const client = await ctx.newCDPSession(page);
const c = await project([0, 0, 0]);
const touch = (type, x, y) => client.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
await touch('touchStart', c.x, c.y); for (let i = 1; i <= 10; i++) await touch('touchMove', c.x + i * 12, c.y + i * 2); await touch('touchEnd');
// Damping decays per frame, and SwiftShader renders slowly: wait for the
// inertia to converge (no frames for 1 s), not for a fixed time.
const settle = async () => { for (let i = 0; i < 60; i++) { const f0 = await page.evaluate(() => window.__gl.frames); await page.waitForTimeout(1000); if ((await page.evaluate(() => window.__gl.frames)) === f0) return true; } return false; };
check('orbit inertia converges and rendering stops', await settle());
const dir = () => page.evaluate(() => { const { camera, controls } = window.__pexis; return camera.position.clone().sub(controls.target).normalize().toArray(); });
const d1 = await dir();
check('touch orbit changed view', Math.acos(Math.min(1, d1[0] * 0.2753 + d1[1] * 0.6618 + d1[2] * 0.6971)) > 0.05);
const inView = () => page.evaluate(() => {
  const { scene, camera } = window.__pexis; let worst = 0;
  for (const name of ['PexisComputeModule', 'PexisMemoryModule', 'PexisFabric']) {
    const o = scene.getObjectByName(name); const box = new (camera.position.constructor === undefined ? null : Object)(); 
    o.traverse((m) => { if (!m.geometry) return; const pos = m.geometry.attributes.position; const v = camera.position.clone();
      for (let i = 0; i < pos.count; i += 7) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).project(camera); worst = Math.max(worst, Math.abs(v.x), Math.abs(v.y)); } });
  }
  return +worst.toFixed(3);
});
for (const [w, h] of [[820, 1180], [1180, 820], [390, 844], [1440, 900]]) {
  await page.setViewportSize({ width: w, height: h }); await settle();
  const d2 = await dir(); const ang = Math.acos(Math.min(1, d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2])) * 180 / Math.PI;
  check(`resize ${w}x${h}: user angle preserved`, ang < 0.5, ang.toFixed(3) + '°');
  const worst = await inView();
  check(`resize ${w}x${h}: hardware inside viewport`, worst <= 1, worst);
}
// --- Zoom with the wheel stays within the fitted range.
await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(800);
const dist = () => page.evaluate(() => { const { camera, controls } = window.__pexis; return [camera.position.distanceTo(controls.target), controls.minDistance, controls.maxDistance]; });
const [d0] = await dist(); const cc = await project([0, 0, 0]); await page.mouse.move(cc.x, cc.y);
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -200); await page.waitForTimeout(60); }
await page.waitForTimeout(2500); const [dz, mn, mx] = await dist();
check('wheel zoom moves camera closer within limits', dz < d0 - 0.01 && dz >= mn - 1e-6 && dz <= mx + 1e-6, { d0: +d0.toFixed(2), dz: +dz.toFixed(2), min: +mn.toFixed(2) });
check('idle after orbit/zoom settle', (await idle(4000)) === 0);
// --- Remount: navigate away and back three times; DOM resources do not accumulate.
for (let i = 0; i < 3; i++) { await page.getByRole('button', { name: 'Overview' }).first().click().catch(async () => { await page.locator('.toolbar__menu').click(); await page.getByRole('button', { name: 'Overview' }).click(); }); await page.waitForTimeout(300); await page.getByRole('button', { name: 'Machine' }).first().click().catch(async () => { await page.locator('.toolbar__menu').click(); await page.getByRole('button', { name: 'Machine' }).click(); }); await page.waitForTimeout(600); }
const dom = await page.evaluate(() => ({ canvases: document.querySelectorAll('canvas.scene-canvas').length, labels: document.querySelectorAll('.scene-label').length, tags: document.querySelectorAll('.pulse-tag').length, layers: document.querySelectorAll('.scene-labels').length }));
check('remount leaves exactly one scene', dom.canvases === 1 && dom.labels === 4 && dom.tags === 1 && dom.layers === 1, dom);
check('no console errors or warnings', errors.length === 0, errors.slice(0, 3));
await b.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} gate checks passed`);
