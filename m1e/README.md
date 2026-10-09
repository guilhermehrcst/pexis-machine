# M1E evidence — Visual System & Scene Composition

Evidence for PR "M1E: Visual System & Scene Composition" (branch
`pexis-machine/m1e-visual-system-scene-v01`). This branch holds evidence only and is never merged.

## How it was measured

- Before: `main` at `3e21340`. After: the M1E branch (code at `3d0763d`; later commits are docs only).
- Headless Chromium 1194 with SwiftShader (software WebGL), deviceScaleFactor 2 unless stated.
- Both builds carry the same measurement-only patch (`tools/instrument.mjs`). It exposes the scene and camera on
  `window` so the tools can read projected bounds and set one fixed detail camera for both builds. It is never committed.
- Same viewport, same machine state and same camera on both sides of every comparison. The detail views use one
  authored camera per module, identical for both builds.
- SwiftShader timings say nothing about iPad GPU performance. Only resource counts are compared.

## Results

| Metric (1180×820, idle) | main | M1E |
|---|---|---|
| Draw calls per frame | 40 | 38 |
| Triangles per frame | 28,884 | 27,650 |
| Scene renderables / geometries / materials | 32 / 32 / 32 | 30 / 30 / 30 |
| WebGL programs / textures / buffers created | 11 / 5 / 120 | 12 / 6 / 115 |
| Frames while idle (1.5 s) | 0 | 0 |
| Horizontal overflow | 0 | 0 |
| Console errors / warnings | 0 | 0 |

The extra program is the vertex-alpha line shader for the fading grid. The extra texture is the 128×128 floor fade mask.

**Hardware on screen is unchanged.** Projected NDC bounds of Compute and Memory are identical at all five viewports.
The Fabric box changes only because the Fabric geometry changed. See `metrics-*.json`.

**Labels over hardware**, in CSS px² of hardware pixels under each label. The hardware mask is a render with the
hardware visible minus a render with it hidden. See `label-coverage-*.json`.

| Viewport | main (Pexis Fabric label) | M1E (Fabric label) |
|---|---|---|
| 1440×900 | 5,574 | 16 |
| 1180×820 | 5,603 | 16 |
| 1024×768 | 5,971 | 5 |
| 820×1180 | 5,404 | 8 |
| 390×844 | 1,645 | 0 |

The CPU, RAM and GPU labels cover at most 12 px² in both builds. The remaining few pixels are shadow fringes.

**Simulated machine translation**. `tools/translate-sim.mjs` replaces every text node with a translated node, the way
browser translators do:

- **main:** the badge shows "Carregando núcleo…" on a ready machine (class `is-ready`). The status pill stays
  "Pronto" after the core has halted (class `status--halted`). "RAM" becomes "BATER", "Fabric" becomes "Tecido" and
  "Stores" becomes "Lojas".
- **M1E:** the badge, status ("Halted") and identifiers stay correct, and ordinary prose is still translated.
- This is a simulation. Real Safari behaviour on iPad was not tested.

**Gates** (`gates-after.txt`, 28/28; main also passes the same interaction checks):

- **Tap selection:** a tap on each module's projected centre selects CPU, RAM, Fabric and GPU, and the camera does
  not move on selection.
- **Rendering stops:** no frames are drawn at rest after a selection change, after the Step animations and after
  orbit and zoom settle.
- **Transfers:** the pulse is animated only from core events and never enters the planned corridor (x > 0).
- **Planned route:** its appearance never changes.
- **Rotation and resize:** after a touch orbit, rotating portrait↔landscape and resizing to 390 and 1440 keeps the
  user's angle within 0.03°. The hardware stays inside the viewport.
- **Zoom:** wheel zoom stays within the fitted limits.
- **Remount:** three remounts leave exactly one canvas, four labels and one transfer tag.

## Images

- `compare-*.png` — full stage, before | after, per viewport, plus the full page at 1180×820.
- `detail-{compute,memory,fabric}.png` — fixed detail camera.
- `state-{idle,active,halted}.png` — after load, 300 ms into the first Step, and after HALT.
- `lighting-tonemap-envmap-ab.png` — main's materials under ACES (main), Neutral (adopted), and Neutral +
  RoomEnvironment (evaluated, rejected).

## Not verified here

- Real Safari, iPad and iPhone hardware, including Safari's translator.
- GPU performance on Apple devices.
- The user's original iPad screenshot was not available in this environment. The "before" images are a fresh
  capture of `main`.
