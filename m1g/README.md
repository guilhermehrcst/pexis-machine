# M1G evidence — Semantic Exploded Inspection (Compute)

Evidence for the PR "M1G: Semantic Exploded Inspection (Compute)", branch `pexis-machine/m1g-exploded-inspection-v01`.
This branch holds evidence only and is never merged.

## Method

- The baseline is `main` at `52d08ac`; the candidate is the M1G branch head.
- Both builds carry one identical measurement-only patch (`tools/instrument.mjs`, never committed). It exposes the
  scene, camera and controls on `window`.
- All runs use headless Chromium 1194 with SwiftShader (software WebGL). Its timings say nothing about iPad GPU
  performance, so only resource counts are compared.
- Every render shown here is a real capture from the build. Nothing is a mockup or a generated image.

## Results

**Normal mode is unchanged.** The two metrics files are identical at all five viewports:

- 38 draw calls and 27,650 triangles per frame;
- 30 renderables;
- the same WebGL objects created;
- 0 frames at rest;
- identical projected bounds for every module.

**Inspection mode**, with the module fully exploded and one part selected (`inspect-mode-cost.txt`): 37–38 draw calls
and 26,438–27,638 triangles. The outline adds one draw. Its 3 buffers and 2 programs are created once and are never
re-created per inspection cycle (gate below). The exploded module stays inside the viewport at every size, at a
maximum |NDC| of 0.58–0.70.

**Gates.**

- `gates-m1g.txt`: 28/28.
- `gates-m1e-regression.txt`: the M1E interaction gates, 28/28.

The prior e2e acceptance suite passes 63/63 on the production build. Highlights:

- Run to HALT while the Compute module is exploded: registers and telemetry are identical to a plain run, the core is
  not paused, the parts keep their pose, and the ring shows the real halted status.
- After Done, the whole scene graph is identical to before entering, overlays included (`poseDiffs: 0` at all five
  viewports).
- Five enter/exit cycles create no new WebGL buffers, programs or textures, and leave the pose identical.
- Interrupted transitions still restore the exact pose. The camera does not move while the separation slider changes.
  The same separation always gives the same pose.
- Reduced motion makes separation instant. Keyboard selects parts and moves the slider; Escape works, also from the
  slider. Focus moves into the part inspector and back.
- A tap on empty space clears the part and keeps the CPU selected.
- A part hidden behind RAM cannot be picked; the same part with a clear view can.
- Orbit inertia does not move the camera after a flight lands.

**Review-fix mutation check** (`review-fix-mutation-check.txt`): the occlusion and inertia gates fail on the
pre-fix commit `cb44d14`:

- the hidden part was picked;
- the camera drifted 1.23 units after landing.

Both pass on the fixed head.

## Images

- `ipad-landscape-flow.png` at 1180×820:
  1. assembled;
  2. separation at 50%;
  3. fully exploded;
  4. compute tile picked by touch;
  5. activity ring selected, shown as an observation surface;
  6. after Done.
- `viewport-*.png` show exploded, part selected and after Done at 1440×900, 1024×768 and 820×1180. At 390×844 the part
  inspector sits below the stage.
- `explode-sequence.gif` is 40 real renders while the slider runs 0→100→5%.

## Not verified

- Real Safari, iPad or iPhone, including touch on real hardware. Touch was emulated: Playwright taps and CDP touch
  events.
- GPU performance on Apple devices.
