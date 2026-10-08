# Web Lab

The Web Lab is the browser surface of Pexis Machine: it **observes and controls** the C++ simulator compiled to
WebAssembly. It contains no CPU, memory, or telemetry implementation.

## Stack

Vite · React · TypeScript (strict) · Three.js (direct, no React Three Fiber) · Radix Icons · Vitest.
No backend, no global state library, no remote APIs.

## Data flow

```text
user action ── MachineClient ── WebMachine (WASM) ── Machine::step()
                     │
                     ├─ snapshot (validated)  ─▶ registers, telemetry, program highlight, status
                     ├─ events   (validated)  ─▶ 3D transfers, activity timeline, "Last step" panel
                     └─ readMemory (one page) ─▶ memory viewer, program bytes
```

React state (`useMachineLab`) holds only the latest snapshot, the decoded program, the last step's events and a
48-step event history. After every command the client re-reads state from WASM, so JS cannot drift.

## Step, Run, Pause

- **Step** calls `Machine::step()` once, then reads snapshot and events.
- **Run** is `RunController`: a single timer, steps paced for visualization (1, 3, 10 steps/s or unpaced batches of at
  most 256 steps per tick, yielding to the browser between ticks). It stops by itself on `halted` or `faulted`.
- **Pause** cancels the pending timer before the next step.
- A browser-side guard pauses a run after 1,000,000 steps. It is a host pause, never a machine fault.
- **Pace is not a clock.** M0/M1 is a functional model with abstract cycles; the UI never shows GHz or IPC.
- **Reset** = core reset + reload of the selected experiment. Selecting an experiment also resets.

## 3D view

`web/src/scene/MachineScene.ts` — procedural geometry (no model files), on-demand rendering (frames only while the
camera moves, an animation runs, or after resize/state change), DPR capped at 2, `ResizeObserver`, complete
`dispose()` of geometries, materials, textures, controls and WebGL context. M1A adds a fail-closed semantic component
registry (`scene/semantic.ts`) and a small procedural geometry kit (`scene/primitives.ts`); see
[`visual-architecture.md`](visual-architecture.md).

Transfers come only from `scene/transfers.ts`, which maps events to motion:
`instruction-fetch` and `memory-read` → RAM → CPU, `memory-write` → CPU → RAM. Register writes, retire, halt and
fault never move data. The scene animates the most recent step; the timeline records every step.

The GPU is drawn as an inert dashed outline labeled *Planned · M4*. It has no state, metrics, or activity, and the
GPU Vector Add experiment is shown disabled.

## Accessibility

Everything is operable without the 3D view: toolbar buttons, component inspector buttons, panels and keyboard
(`S` step, `Space` run/pause, `R` reset). Semantic tables and live status, visible focus rings, ≥ 44 px targets on
coarse pointers, `prefers-reduced-motion` (pulses become static highlights; workflow unchanged), and a fallback
message when WebGL is unavailable.

## Commands

```bash
cd web
npm ci
npm run wasm:build   # needs an activated emsdk; see docs/wasm-boundary.md
npm run dev          # http://localhost:5173
npm test             # unit tests + integration tests against the real WASM module
npm run build        # typecheck + production bundle in web/dist
```

`dev`, `test` and `build` refuse to start, with an explicit message, if the WASM module was not generated.

## Dependency note

`rollup` is pinned to 4.63.5 through `overrides` in `web/package.json`: rollup 4.64.2 hangs `vite build` while
bundling `react-dom/client` (reproduced in isolation). Remove the override once a fixed rollup release is verified.
