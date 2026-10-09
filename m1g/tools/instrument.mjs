// Measurement-only patch: exposes scene/camera on window. Applied identically to
// baseline and candidate builds, never committed.
import { readFileSync, writeFileSync } from 'node:fs';
const file = process.argv[2];
const src = readFileSync(file, 'utf8');
const needle = '    this.#resize.observe(container);\n    this.#onResize();\n';
if (!src.includes(needle)) throw new Error('needle not found');
const out = src.replace(needle, needle + '    (window as any).__pexis = { scene: this.#scene, camera: this.#camera, controls: this.#controls, render: () => this.#requestRender() };\n');
writeFileSync(file, out);
