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

These details suggest an industrial cartridge, not simulated DRAM banks or channels. A semantic
anchor named anchor.fabric-port sits on its mounting edge for a future Pexis Fabric visual
contract. M1C does not change the existing event-driven CPU/RAM transfer path.

Eight renderables are enforced by a test. Other tests validate part identity, semantic anchors,
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
  ├─ carrier                passive-interposer
  ├─ frame                  mechanical-frame (four instanced rails)
  ├─ active-ports           observed-cpu-memory-endpoints
  ├─ graphics-reserved-port planned-only-endpoint
  ├─ fabric-mark            identity-only-detail
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

## Next gate

After the M1C memory module and M1D Fabric have been independently reviewed and
merged, continue visual design with the planned graphics placeholder and scene
composition. The visual layer must not grow GPU execution capabilities or
pretend that real fabric timing has been measured. Subsequent work on memory
hierarchies, timing, and heterogeneous execution belongs in the C++ core's
own M2/M3/M4 milestones.
