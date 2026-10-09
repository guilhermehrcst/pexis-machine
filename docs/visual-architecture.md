# Visual architecture

The 3D layer is an observation surface over the simulator.

> **Simulation is truth. Visualization is observation.**

M1A introduces a semantic layer between raw Three.js objects and the rest of the Web Lab. It does not change the
C++ core, the WebAssembly boundary, machine events, or the rendered design.

## Direction

Pexis Machine is **procedural-first, asset-capable**.

- Procedural Three.js is the default for architecture that changes with machine configuration: compute modules,
  memory modules, Fabric topology, links, overlays, highlights, and future experimental devices.
- GLB/glTF remains a possible authoring adapter for a future component whose visual fidelity materially benefits
  from an external asset. The semantic contract must remain the same either way.
- Blender is therefore not a runtime dependency and is not on the M1 critical path.

This keeps the laboratory capable of drawing architectures that do not yet exist as physical products.

## Semantic contract

`web/src/scene/semantic.ts` defines two levels:

```text
MachineVisualRegistry
  └─ MachineVisualComponent
       ├─ id
       ├─ kind
       ├─ root Object3D
       └─ parts
            ├─ id
            ├─ semantic role
            ├─ renderable object(s)
            └─ optional anchor
```

The registry is an index, not a resource owner. `MachineScene` still owns WebGL lifecycle and disposal.

A component fails closed during construction when:

- its id or a part id is empty;
- part ids are duplicated;
- a part owns no renderable geometry;
- an object or anchor sits outside the component root;
- two parts claim the same renderable;
- any renderable under the component root is not claimed by a semantic part.

This is the equivalent of a binding smoke test for procedural geometry. It prevents anonymous meshes from silently
appearing in a scene where selection, inspection, x-ray, or future annotations cannot address them.

## Historical baseline: M1A component map

> This is the M1A map, kept for history. M1A gave the M1 blockout semantic identity without changing the
> picture. The CPU entry was replaced by the Pexis Compute Module in M1B; see below for the current map.
> RAM was replaced by the Pexis Memory Module in M1C. Interconnect and the planned GPU retain M1A parts.

```text
cpu · compute   (M1A blockout — superseded by M1B)
  ├─ substrate
  ├─ contacts
  ├─ activity-ring
  └─ heat-spreader

ram · memory
  ├─ slot
  ├─ pcb
  ├─ dram-packages
  ├─ contacts
  └─ activity-edge

interconnect · fabric
  ├─ ram-lanes
  └─ gpu-reserved-lanes

gpu · graphics (planned)
  ├─ planned-shell
  └─ planned-outline
```

The activity ring and edge are explicitly observation roles. They are not simulator state.

## Procedural primitive kit

`web/src/scene/primitives.ts` is intentionally small. M1A centralizes only shapes already needed by the existing
scene. New primitives are added when a real Pexis component needs them, not speculatively.

## M1B: Pexis Compute Module

The first authorial hardware component is the **Pexis Compute Module**. It replaces the M1 blockout CPU package
with a procedural industrial package while preserving the same simulator-facing identity: `cpu`.

The module is intentionally physical-looking but architecturally honest:

- it does not invent cores, cache hierarchy, frequency, temperature, or timing;
- its status ring remains an observation surface driven by real simulator state;
- repeated package contacts and frame details use `InstancedMesh`;
- semantic anchors are published for the package, contacts, frame, and compute surface;
- the component remains small enough to preserve the scene's browser-first rendering budget.

Current semantic parts (M1B, refined in M1B.1):

```text
cpu · compute                         renderables
  ├─ package         compute-package     compute.substrate
  ├─ contacts        electrical-contacts compute.contacts        (InstancedMesh ×64)
  ├─ module-frame    industrial-frame    compute.carrier, compute.frame-rails (InstancedMesh ×4)
  ├─ compute-tile    physical-compute-surface   compute.tile
  └─ activity-ring   observation-activity       compute.activity-ring
```

Six renderables in total, enforced by `PexisComputeModule.test.ts` together with a geometric check that no
renderable is enclosed by another one or sits below the platform. M1B shipped a seventh, `compute.underside`,
that was entirely inside the substrate footprint and under the platform top, so it never drew a pixel; M1B.1
removed it.

Materials follow the Pexis hardware palette: graphite structure, satin (not mirror) metal, a quiet silicon
surface and nickel contacts. The activity ring is a graphite line at rest; only the simulator-driven emissive
state (activity, halted, faulted) gives it colour.

The `compute-tile` is a physical visual surface, not a claim about the simulator's internal floorplan. A future
logical representation may map the same component id to cores, caches, or controllers only when the core exposes
those concepts.

## Camera framing (M1B.1)

The camera frames the **hardware**, not the platform, and does so geometrically
(`web/src/scene/framing.ts`, pure and unit-tested):

- the points to frame are the corners of each component's bounding box plus the label anchors (a single
  enclosing box would also frame the empty space between components);
- `SceneView` measures the HTML overlays of the stage (component switcher, legend) and passes them as insets;
- `fitPointsToView` keeps the authored view direction, solves the smallest camera distance at which every point
  projects inside the free area, and re-centres the projection in it;
- on resize or rotation the fit is recomputed. Until the user orbits, the authored 3/4 direction is used; after
  that, the user's viewing angle is kept and only distance and target are refitted.

Measured in the authored view, the hardware fills a free area of about 2:1 (width:height). A taller stage only
adds space no camera can use, so the stage height follows the stage width (`50cqi` plus the overlay chrome)
instead of stretching to the side rail. Labels are anchored by their bottom edge above the part they name, so they
never cover it.

## M1C: Pexis Memory Module

M1C replaces the RAM blockout with the procedural, authorial Pexis Memory Module. It retains the
simulator-facing identity of ram, the C++ linear-memory implementation, and all existing events
and telemetry. No memory hierarchy, channel, bandwidth, or clock model is added.

Semantic visual structure:

- slot / physical-mount: memory.mount
- pcb / memory-carrier: memory.carrier
- dram-packages / illustrative-memory-packages: memory.packages (16 instanced details)
- contacts / illustrative-connector: memory.contacts (48 instanced nickel details)
- chassis / industrial-frame: memory.chassis-cap and memory.chassis-rails (4 instances)
- routing / inert-surface-detail: memory.surface-routing (16 instances)
- activity-edge / observation-memory-access: memory.activity-edge

M1E removed the `routing` part (16 inert ticks that read as noise at tablet scale); the module has seven
renderables and six parts.

These details suggest an industrial cartridge, not simulated DRAM banks or channels. A semantic
anchor named anchor.fabric-port sits on its mounting edge for a future Pexis Fabric visual
contract. M1C does not change the existing event-driven CPU/RAM transfer path.

The renderable budget is enforced by a test. Other tests validate part identity, semantic anchors,
front/back instance placement, visible geometry, and a non-emissive initial activity strip.
The Compute Module and Memory Module now share a graphite/satin/nickel vocabulary.

## Future asset adapter

If a later component uses GLB, its loader must produce the same `MachineVisualComponent` contract. The rest of the
scene must not need to know whether geometry came from TypeScript, Blender, CAD, or another tool.

Conceptually:

```text
procedural builder ─┐
                    ├─ MachineVisualComponent ─▶ MachineVisualRegistry ─▶ MachineScene
GLB asset adapter ──┘
```

No GLB adapter is implemented in M1A.

## Resource ownership

Semantic registration never disposes geometry, materials, textures, controls, renderers, or WebGL contexts.
`MachineScene.dispose()` remains the single disposal path. This avoids double-free-style lifecycle bugs and keeps
the semantic layer independent from renderer policy.

## M1D: Pexis Fabric

Pexis Fabric replaces the basic interconnect line grouping with a standalone,
semantically indexed procedural module in `web/src/scene/components/PexisFabric.ts`.

The Fabric has one **event-backed CPU ↔ RAM path**, because the C++ simulator
emits real fetch/load/store events, and a **planned-only GPU path** drawn as
translucent dashed traces. There are no modeled GPU transactions, channel counts,
physical bandwidth, fabric timing, switches, or memory controllers.

Visual part contract:

```text
interconnect · fabric
  ├─ carrier                passive-interposer (satin since M1E)
  ├─ frame                  mechanical-frame (four instanced rails: two sides, front, centre divider)
  ├─ active-ports           observed-cpu-memory-endpoints
  ├─ graphics-reserved-port planned-only-endpoint
  ├─ fabric-mark            identity-only-detail (Pexis 2×2 mark, four instances)
  ├─ ram-lanes              event-backed-cpu-memory-link (three visual lanes)
  └─ gpu-reserved-lanes     planned-not-simulated-link (three dashed paths)
```

The primary memory path is used by the **unchanged** MachineScene transfer
animation; the C++ event stream alone decides whether and which way a pulse
travels. Merely drawing multiple parallel tracks does not imply multi-channel
hardware. The planned GPU route is structurally separate and never animates.

Ports are obtained from semantic anchors on the Compute, Memory, and graphics
placeholder component roots, transformed into world-space coordinates. Missing
anchors fail closed instead of silently generating disconnected geometry. A
typed visual-link manifest explicitly marks GPU as planned.

The Fabric's passive interposer, endpoint pads, and understated Pexis material
palette create a recognizable physical center without suggesting a functioning
controller. Repeated details use InstancedMesh. Camera framing and selection
remain driven by the existing 3D scene and accessibility controls.

## M1E: Visual system and scene composition

M1E refines presentation only. No simulator, ABI, event, or telemetry change.

**Surface palette.** `web/src/scene/components/palette.ts` is the closed surface vocabulary of opaque hardware:
graphite, graphite-soft, satin, rail, silicon, nickel. It holds specs, not shared material instances, so each mesh
owns its material and `MachineScene.dispose()` remains the single disposal path. `palette.test.ts` fails if an opaque
hardware part uses an off-palette colour or glows at rest. Pexis blue is never a surface: it marks real activity,
selection and information. Before M1E, Memory and Fabric used navy-tinted graphite and read as another family.

**Tone mapping.** Khronos PBR Neutral replaces ACES Filmic: authored albedo is kept, the platform stays off-white
and graphite is not crushed. An environment map (`RoomEnvironment`) was evaluated and not adopted; its gain on satin
metal was marginal at tablet scale.

**Fabric.** The dark navy carrier was the heaviest flat mass in the scene. The carrier is now satin; observed lanes
are graphite (the only Fabric surface real events may light); planned routes are partial-opacity graphite dashes; a
centre divider separates the observed corridor (x < 0) from the planned one (x > 0); the 2×2 Pexis mark is its
identity. The carrier stops at the compute package, rails stop before any lane crosses them, and endpoint lands sit
where lanes leave each module. On main the Fabric's back rail was entirely buried in `compute.substrate`; a test now
checks that no Fabric primitive is buried in the modules it connects.

**Floor.** The camera frames the hardware, not the floor (M1B.1), so a hard-edged slab was cropped differently on
every viewport and orbit and read as a broken render. The floor and its grid now fade to transparent well before
their edges and the stage background continues them. No edge is drawn, so none can be cropped. Hardware size on
screen is unchanged.

**Labels.** Labels declare a side of their anchor; the camera fit reserves room on that side along screen-up. The
Fabric label hangs below the Fabric's front edge, where it covers neither the lanes entering the compute package nor
the live transfer tag, which is pinned above the static labels. Titles match the component switcher; details carry
the Pexis module name.

## M1G: Semantic exploded inspection

M1G adds exploded inspection on top of the existing semantic contract. It adds no second model, renderer or scene
graph. The first vertical slice is the Pexis Compute module. The concepts taken from the reference images are listed
in [`exploded-references.md`](exploded-references.md).

```text
ExplodePlan (data, per component)        ExplodeRig (scene/explode.ts, pure)
  componentId                              binds a plan to a MachineVisualComponent
  steps[] — one per semantic part          captures rest positions once
    partId                                 apply(t): rest + direction · distance · ease(progress(t, delay))
    direction (root-local)                 restore(): rest, bit for bit
    distance  (0 = base)                   envelope(t): bounds, without moving anything
    delay     (ordered separation)
```

**Invariants**, each enforced by a test:

- The plan names every part of its component exactly once. Unknown, duplicate or omitted parts fail closed.
- Only geometry that exists moves: the part's own objects plus its anchor, so inspection points stay on the part.
  Moved objects must be direct children of the component root, so travel can never compound.
- Every pose is derived from rest and the amount `t`; nothing is accumulated per frame. The same `t` gives the same
  pose whatever happened before. `t = 0` and `restore()` reproduce the assembled pose exactly. After leaving
  inspection, the whole scene graph, overlays included, is identical to before entering.
- Fully exploded, each Compute layer clears the one below it.
- **Instancing policy:** whole-object translation only. An `InstancedMesh` (the 64 contacts) moves and is selected
  as one set. Instances get no identity of their own.

**Picking.** In inspection, the raycast tests the inspected component's real geometry only, not the invisible
component hit targets. The nearest hit wins, so occluded geometry cannot be picked. A hit resolves to its part through
`component.partOf(object)`, which is derived from the ownership map that `createVisualComponent` already validates.
Mesh names play no part.

**Camera.** The fully exploded envelope is framed once, keeping the user's view direction, so dragging the separation
never moves the camera. Entering and leaving are short camera transitions. A refit arriving mid-flight (resize, new
overlay insets) retargets the transition instead of cutting it. With reduced motion, every move is instant.

**Representation.** Each part is labelled as either *illustrative physical geometry* or an *observation of real
core state*; only the activity ring is the latter. The inspector also states what the core really simulates: 8 ×
64-bit registers, a PC and in-order functional execution. No part is presented as a simulated structure. The compute
tile is explicitly not a floorplan.

**Simulator.** Inspection is visual state only. Run, Step and Reset keep working while a component is exploded:

- the core is never paused, reset or informed;
- the activity ring keeps showing real status wherever it is;
- the transfer pulse still ends at the package, which is the fixed base.

**Cost.** Normal mode is unchanged: same draw calls, triangles and WebGL objects. Inspection adds one outline draw
when a part is selected. Its buffers and programs are created once and never per inspection cycle.

## Next gate

M1G provides exploded inspection for the Compute module. The next increments apply
the same `ExplodeRig` to the Memory module and the Fabric (one plan each, no new
infrastructure). A logical view may follow only for structures the core exposes. The visual layer must not grow GPU execution capabilities or
pretend that real fabric timing has been measured. Subsequent work on memory
hierarchies, timing, and heterogeneous execution belongs in the C++ core's
own M2/M3/M4 milestones.
