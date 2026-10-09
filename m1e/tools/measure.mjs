// Usage: node measure.mjs <label> <url>
// Same states, viewports and camera for every build.
import { chromium } from '../e2e/node_modules/playwright-core/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const [label, url] = process.argv.slice(2);
const OUT = new URL(`./shots/${label}/`, import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const VIEWPORTS = [['desktop-1440x900', 1440, 900, false], ['tablet-1180x820', 1180, 820, true], ['tablet-1024x768', 1024, 768, true], ['tablet-820x1180', 820, 1180, true], ['mobile-390x844', 390, 844, true]];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

const instrument = () => {
  const s = (window.__gl = { calls: 0, tris: 0, frames: 0, buffers: 0, programs: 0, textures: 0, last: null });
  const P = WebGL2RenderingContext.prototype;
  for (const [fn, tri] of [['drawElements', (a) => a[1] / 3], ['drawArrays', (a) => a[2] / 3], ['drawElementsInstanced', (a) => (a[1] / 3) * a[4]], ['drawArraysInstanced', (a) => (a[2] / 3) * a[3]]]) {
    const orig = P[fn]; P[fn] = function (...a) { s.calls++; if (a[0] === 4) s.tris += tri(a); return orig.apply(this, a); };
  }
  for (const [fn, key] of [['createBuffer', 'buffers'], ['createProgram', 'programs'], ['createTexture', 'textures']]) { const o = P[fn]; P[fn] = function (...a) { s[key]++; return o.apply(this, a); }; }
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { const c = s.calls, tr = s.tris; cb(t); if (s.calls > c) { s.frames++; s.last = [s.calls - c, Math.round(s.tris - tr)]; } });
};

// Scene-side geometry: projected NDC bounds of every component root and the
// platform, plus scene resource counts. Reads only; never mutates the scene.
const sceneProbe = () => {
  const { scene, camera } = window.__pexis;
  const T = scene.children[0].constructor; // unused; keep probe self-contained
  const bounds = {};
  const proj = (obj) => {
    let minX = 9, maxX = -9, minY = 9, maxY = -9;
    obj.updateWorldMatrix(true, true);
    obj.traverse((o) => {
      if (!o.geometry || !o.visible) return;
      const pos = o.geometry.attributes.position; if (!pos) return;
      const v = new camera.position.constructor();
      const count = o.isInstancedMesh ? o.count : 1;
      const m = new camera.matrixWorld.constructor();
      for (let k = 0; k < count; k++) {
        if (o.isInstancedMesh) { o.getMatrixAt(k, m); m.premultiply(o.matrixWorld); } else m.copy(o.matrixWorld);
        for (let i = 0; i < pos.count; i += Math.max(1, Math.floor(pos.count / 400))) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m).project(camera);
          minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
        }
      }
    });
    return [minX, minY, maxX, maxY].map((n) => +n.toFixed(3));
  };
  for (const child of scene.children) {
    const name = child.name || (child.isMesh && child.geometry.parameters ? 'mesh' : child.type);
    if (['PexisComputeModule', 'PexisMemoryModule', 'PexisFabric'].includes(child.name)) bounds[child.name] = proj(child);
  }
  // Platform: the first two meshes added to the scene (base + plinth) in every build.
  const platform = scene.children.filter((c) => c.isMesh && c.material.visible !== false && c.receiveShadow).slice(0, 1)[0];
  if (platform) bounds.platform = proj(platform);
  const gpu = scene.children.find((c) => c.isGroup && c.children.some((m) => m.isLineSegments && m.material.isLineDashedMaterial));
  if (gpu) bounds.gpuPlanned = proj(gpu);
  let meshes = 0, geos = new Set(), mats = new Set(), lights = 0, shadowCasters = 0;
  scene.traverse((o) => { if (o.isLight) lights++; if (o.geometry && (o.visible !== false) && !(o.material && o.material.visible === false)) { meshes++; geos.add(o.geometry); [].concat(o.material).forEach((m) => mats.add(m)); if (o.castShadow) shadowCasters++; } });
  return { bounds, renderables: meshes, geometries: geos.size, materials: mats.size, lights, shadowCasters, camera: camera.position.toArray().map((n) => +n.toFixed(3)) };
};

const results = {};
for (const [name, w, h, touch] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: touch, isMobile: name.startsWith('mobile') });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text()));
  await page.addInitScript(instrument);
  await page.goto(url); await page.locator('.status').waitFor(); await page.waitForTimeout(1800);
  const f0 = await page.evaluate(() => window.__gl.frames); await page.waitForTimeout(1500);
  const idleFrames = (await page.evaluate(() => window.__gl.frames)) - f0;
  const geo = await page.evaluate(() => {
    const vp = document.querySelector('.stage__viewport').getBoundingClientRect();
    const labels = {}; const rects = [];
    for (const el of document.querySelectorAll('.scene-label')) {
      const t = el.querySelector('.scene-label__title')?.textContent; const r = el.getBoundingClientRect();
      labels[t] = { x: Math.round(r.x - vp.x), y: Math.round(r.y - vp.y), w: Math.round(r.width), h: Math.round(r.height), inside: r.x >= vp.x && r.y >= vp.y && r.right <= vp.right && r.bottom <= vp.bottom };
      rects.push([t, r]);
    }
    const overlaps = [];
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i][1], b = rects[j][1]; const ix = Math.min(a.right, b.right) - Math.max(a.x, b.x), iy = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
      if (ix > 0 && iy > 0) overlaps.push(`${rects[i][0]}×${rects[j][0]}:${Math.round(ix * iy)}px²`);
    }
    const doc = document.documentElement; const content = document.querySelector('.content');
    const badge = document.querySelector('.core-badge')?.textContent;
    return { stage: { w: Math.round(vp.width), h: Math.round(vp.height) }, labels, labelOverlaps: overlaps, hOverflow: Math.max(doc.scrollWidth - innerWidth, content.scrollWidth - content.clientWidth), badge };
  });
  const probe = await page.evaluate(sceneProbe);
  const stageBox = await page.locator('.stage__viewport').boundingBox();
  writeFileSync(`${OUT}${name}-stage.png`, await page.screenshot({ clip: stageBox }));
  await page.screenshot({ path: `${OUT}${name}-full.png` });
  const gl = await page.evaluate(() => window.__gl);
  // Interaction: orbit drag, then check rendering stops again.
  const cx = stageBox.x + stageBox.width / 2, cy = stageBox.y + stageBox.height * 0.6;
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 80, cy + 10, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(1600);
  const f1 = await page.evaluate(() => window.__gl.frames); await page.waitForTimeout(1200);
  const idleAfterOrbit = (await page.evaluate(() => window.__gl.frames)) - f1;
  results[name] = { ...geo, ...probe, lastFrame: { drawCalls: gl.last?.[0], triangles: gl.last?.[1] }, gpuObjectsCreated: { buffers: gl.buffers, programs: gl.programs, textures: gl.textures }, idleFramesIn1500ms: idleFrames, idleFramesAfterOrbit: idleAfterOrbit, errors };
  await ctx.close();
}

// States + details at the iPad landscape size, identical camera for all builds.
{
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript(instrument);
  await page.goto(url); await page.locator('.status').waitFor(); await page.waitForTimeout(1500);
  const box = await page.locator('.stage__viewport').boundingBox();
  const shot = (n) => page.screenshot({ path: `${OUT}state-${n}.png`, clip: box });
  await shot('idle');
  await page.getByRole('button', { name: 'Step', exact: true }).click(); await page.waitForTimeout(300); await shot('active');
  for (let i = 0; i < 6; i++) { if (await page.locator('.status', { hasText: /halted/i }).count()) break; await page.getByRole('button', { name: 'Step', exact: true }).click(); await page.waitForTimeout(950); }
  await page.waitForTimeout(1500); await shot('halted');
  results.haltedStatus = await page.locator('.status').textContent();
  // Detail views: a fixed authored camera per component (same in every build).
  const details = { compute: [[1.6, 2.4, 1.2], [0, 0.2, -1.25]], memory: [[-1.4, 2.0, 3.8], [-2.85, 0.5, 1.35]], fabric: [[0.9, 2.6, 3.0], [0, 0.05, 0.75]] };
  for (const [k, [pos, tgt]] of Object.entries(details)) {
    await page.evaluate(([p, t]) => { const { camera, controls, render } = window.__pexis; controls.minDistance = 0; controls.maxDistance = 100; controls.enableDamping = false; camera.position.set(...p); controls.target.set(...t); controls.update(); render(); }, [pos, tgt]);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}detail-${k}.png`, clip: box });
  }
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}metrics.json`, JSON.stringify(results, null, 1));
for (const [k, v] of Object.entries(results)) if (typeof v === 'object') console.log(k, JSON.stringify({ stage: v.stage, b: v.bounds, overl: v.labelOverlaps, frame: v.lastFrame, rend: v.renderables, geos: v.geometries, mats: v.materials, gpuObj: v.gpuObjectsCreated, idle: v.idleFramesIn1500ms, idleOrbit: v.idleFramesAfterOrbit, hOverflow: v.hOverflow, badge: v.badge, errors: v.errors })); else console.log(k, v);
