// Fails fast, with an actionable message, when the WebAssembly adapter has
// not been generated. The Web Lab has no fallback simulator by design.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const required = ['../src/wasm/pexis-machine.js', '../src/wasm/pexis-machine.wasm'];
const missing = required.filter((path) => !existsSync(fileURLToPath(new URL(path, import.meta.url))));

if (missing.length > 0) {
  console.error('error: the Pexis Machine WebAssembly adapter is missing:');
  for (const path of missing) console.error(`  web/src/wasm/${path.split('/').pop()}`);
  console.error('Build it first (requires an activated emsdk):  npm run wasm:build');
  process.exit(1);
}
