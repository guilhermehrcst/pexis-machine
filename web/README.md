# Pexis Machine Web Lab

Browser observer and controller for the Pexis Machine C++ core compiled to WebAssembly.

> Simulation is truth. Visualization is observation.

```bash
source /path/to/emsdk/emsdk_env.sh
npm ci
npm run wasm:build
npm run dev
```

```text
src/machine/   MachineClient, boundary validation, run scheduler, formatting, React hook
src/scene/     Three.js scene and the event → transfer mapping
src/ui/        toolbar, sidebar, panels, views
src/wasm/      type contract of the generated module (+ generated files, git-ignored)
```

The Web Lab must not duplicate CPU semantics, memory semantics, or telemetry calculations. See
[`../docs/web-lab.md`](../docs/web-lab.md) and [`../docs/wasm-boundary.md`](../docs/wasm-boundary.md).
