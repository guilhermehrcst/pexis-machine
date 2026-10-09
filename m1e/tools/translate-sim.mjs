// Simulates a page translator the way browser translators work: every text
// node is REPLACED by a new <font> element holding the translated text, and
// the original node is detached. React keeps its reference to the original
// node; subsequent React text updates go to the detached node and are never
// seen. Usage: node translate-sim.mjs <url>
import { chromium } from '../e2e/node_modules/playwright-core/index.mjs';
const url = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
await p.addInitScript(() => {
  const dict = { 'Loading core…': 'Carregando núcleo…', 'RAM': 'BATER', 'Stores': 'Lojas', 'Pexis Fabric': 'Tecido Pexis', 'Fabric': 'Tecido', 'Ready': 'Pronto', 'Halted': 'Parado', 'Running': 'Executando', 'Run': 'Executar', 'Pause': 'Pausar', 'no steps yet': 'nenhum passo ainda' };
  const tr = (s) => dict[s.trim()] ?? s;
  const skip = (n) => n.parentElement?.closest('[translate="no"], script, style');
  const translate = (root) => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    for (const n of nodes) {
      if (!n.nodeValue.trim() || skip(n) || n.parentElement?.tagName === 'FONT') continue;
      const font = document.createElement('font'); font.textContent = tr(n.nodeValue);
      n.parentNode.replaceChild(font, n);
    }
  };
  // Translate once shortly after first paint (when only the loading shell exists),
  // then keep translating newly inserted content, like an auto-translate session.
  window.__translateNow = () => translate(document.body);
  document.addEventListener('DOMContentLoaded', () => {
    new MutationObserver(() => translate(document.body)).observe(document.body, { childList: true, subtree: true });
  });
});
await p.goto(url);
await p.evaluate(() => window.__translateNow());
await p.locator('.status').waitFor({ timeout: 15000 }); await p.waitForTimeout(1200);
const read = () => p.evaluate(() => ({ status: document.querySelector('.status')?.innerText, run: document.querySelector('.toolbar .button--primary')?.innerText, r0: document.querySelector('.regs tbody tr:nth-child(2) td')?.innerText, retired: document.querySelector('.metrics dd')?.innerText, activity: document.querySelector('.activity .panel__meta')?.innerText }));
const atReady = await read();
await p.getByRole('button', { name: /Step/ }).click(); await p.waitForTimeout(400);
const afterStep = await read();
for (let i = 0; i < 8; i++) { const b = p.getByRole('button', { name: /Step/ }); if (await b.isDisabled()) break; await b.click(); await p.waitForTimeout(150); }
await p.waitForTimeout(800);
const truth = await p.evaluate(() => document.querySelector('.status')?.className);
const atEnd = await read();
console.log(JSON.stringify({ atReady, afterStep, atEnd, statusClass: truth }));
const out = await p.evaluate(() => ({
  badge: document.querySelector('.core-badge')?.innerText,
  badgeClass: document.querySelector('.core-badge')?.className,
  status: document.querySelector('.status')?.innerText,
  labels: [...document.querySelectorAll('.scene-label__title')].map((e) => e.innerText),
  stores: [...document.querySelectorAll('.telemetry dt, dt')].map((e) => e.innerText).filter((t) => /Stores|Lojas/.test(t)),
  segmented: [...document.querySelectorAll('.segmented button')].map((e) => e.innerText),
}));
console.log(JSON.stringify(out));
await b.close();
