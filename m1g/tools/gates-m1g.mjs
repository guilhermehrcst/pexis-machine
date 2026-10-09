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

// --- Gate B: the simulator never sees the inspection.
{
  const plain = await open(); await runToHalt(plain); const ref = await machine(plain);
  const inspected = await open(); await enter(inspected); await settle(inspected);
  const ringBefore = await partY(inspected, 'compute.activity-ring');
  const halted = await runToHalt(inspected); const got = await machine(inspected);
  check('Run while inspecting: the core runs to HALT (not paused)', halted, got.status);
  check('Run while inspecting: registers and telemetry identical to a plain run', JSON.stringify(got) === JSON.stringify(ref));
  check('Run while inspecting: parts keep their exploded pose', (await partY(inspected, 'compute.activity-ring')) === ringBefore, ringBefore);
  const ringHalted = await inspected.evaluate(() => window.__pexis.scene.getObjectByName('compute.activity-ring').material.emissive.getHexString());
  check('activity ring shows real status while separated (halted green)', ringHalted === '2f9e6b', ringHalted);
  check('no console errors (run while inspecting)', inspected.errors.length === 0 && plain.errors.length === 0, inspected.errors.slice(0, 2));
  await plain.context().close(); await inspected.context().close();
}
// --- Camera does not move while dragging; renders stop; no growth per cycle.
{
  const page = await open(); await enter(page); await settle(page);
  const cam = () => page.evaluate(() => window.__pexis.camera.position.toArray().join(','));
  const slider = page.locator('.explode-bar input[type=range]');
  const c0 = await cam();
  for (const v of ['20', '65', '5', '100', '37']) { await slider.fill(v); await page.waitForTimeout(120); }
  check('camera does not move while the separation changes', (await cam()) === c0);
  const y37 = await partY(page, 'compute.activity-ring');
  await slider.fill('90'); await page.waitForTimeout(100); await slider.fill('37'); await page.waitForTimeout(100);
  check('same separation, same pose (history-independent)', (await partY(page, 'compute.activity-ring')) === y37, y37);
  check('rendering stops after separation changes', await settle(page));
  // Keyboard: chip by keyboard, slider by keys.
  await page.getByRole('button', { name: 'Module frame' }).focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  check('keyboard selects a part', (await page.locator('.part-chip.is-active').textContent()) === 'Module frame');
  await slider.focus(); const v0 = await slider.inputValue(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100);
  check('slider responds to arrow keys', +(await slider.inputValue()) === +v0 + 1, `${v0}→${await slider.inputValue()}`);
  // Empty tap clears the part, keeps the component selection.
  const r = await page.locator('.scene-canvas').boundingBox();
  await page.touchscreen.tap(r.x + r.width - 30, r.y + r.height * 0.75); await page.waitForTimeout(300);
  check('tap on empty space clears the part, CPU stays selected', (await page.locator('.part-chip.is-active').count()) === 0 && (await page.locator('.segmented__item.is-active').textContent()) === 'CPU');
  // Escape from a focused chip leaves inspection and restores the assembled pose.
  await page.getByRole('button', { name: 'Contacts' }).focus(); await page.keyboard.press('Escape'); await settle(page);
  check('Escape leaves the exploded view', (await page.locator('.explode-bar').count()) === 0);
  // Resource growth across cycles.
  const restPose = await pose(page);
  const counts = () => page.evaluate(() => [window.__gl.buffers, window.__gl.programs, window.__gl.textures]);
  await enter(page); await page.getByRole('button', { name: 'Compute tile' }).click(); await settle(page); await page.getByRole('button', { name: 'Done' }).click(); await settle(page);
  const c1 = await counts();
  for (let i = 0; i < 4; i++) { await enter(page); await page.getByRole('button', { name: 'Activity ring' }).click(); await settle(page); await page.getByRole('button', { name: 'Done' }).click(); await settle(page); }
  const c2 = await counts();
  check('no WebGL buffers/programs/textures created per inspection cycle', JSON.stringify(c1) === JSON.stringify(c2), { after1: c1, after5: c2 });
  check('pose identical after five cycles', JSON.stringify(await pose(page)) === JSON.stringify(restPose));
  // Interrupt: Done during the explode animation, then re-enter during the close.
  await enter(page); await page.waitForTimeout(150); await page.getByRole('button', { name: 'Done' }).click(); await page.waitForTimeout(120);
  await enter(page); await page.waitForTimeout(100); await page.getByRole('button', { name: 'Assemble' }).click(); await page.waitForTimeout(80);
  await page.getByRole('button', { name: 'Done' }).click(); await settle(page);
  check('interrupted transitions still restore the exact pose', JSON.stringify(await pose(page)) === JSON.stringify(restPose));
  const s = await page.evaluate(() => ({ enabled: window.__pexis.controls.enabled, min: window.__pexis.controls.minDistance, max: window.__pexis.controls.maxDistance }));
  check('controls re-enabled with finite limits after transitions', s.enabled && Number.isFinite(s.max) && s.min > 0, s);
  // Component selection works again after inspection.
  await page.locator('.segmented button', { hasText: 'RAM' }).click(); await page.waitForTimeout(200);
  check('component selection works after inspection', (await page.locator('.inspector__card h3').textContent()) === 'RAM');
  check('no console errors (cycles)', page.errors.length === 0, page.errors.slice(0, 2));
  await page.context().close();
}
// --- Reduced motion: separation is instant, controls and information intact.
{
  const page = await open({ reducedMotion: 'reduce' });
  await enter(page); await page.waitForTimeout(60);
  const y = await partY(page, 'compute.activity-ring');
  check('reduced motion: fully separated immediately', Math.abs(y - (0.349 + 1.14)) < 1e-9, y);
  check('reduced motion: rendering at rest', await settle(page));
  await page.getByRole('button', { name: 'Done' }).click(); await page.waitForTimeout(60);
  check('reduced motion: reassembled immediately', (await partY(page, 'compute.activity-ring')) === 0.349);
  await page.context().close();
}
// --- Review fixes.
{
  const page = await open();
  // Keyboard focus moves into the inspector and back.
  await page.locator('.segmented button', { hasText: 'CPU' }).click();
  await page.getByRole('button', { name: 'Inspect parts' }).focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  check('focus moves into the part inspector', await page.evaluate(() => document.activeElement?.tagName === 'H3' && document.activeElement.textContent.includes('parts')));
  await settle(page);
  // Escape with the slider focused.
  await page.locator('.explode-bar input[type=range]').focus(); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check('Escape works with the slider focused', (await page.locator('.explode-bar').count()) === 0);
  await page.waitForTimeout(50);
  check('focus returns to "Inspect parts"', await page.evaluate(() => document.activeElement?.textContent === 'Inspect parts'));
  await settle(page);
  // Occlusion: RAM between the camera and the lifted compute tile.
  await page.getByRole('button', { name: 'Inspect parts' }).click(); await settle(page);
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
console.log(`\n${results.filter(Boolean).length}/${results.length} M1G gate checks passed`);
