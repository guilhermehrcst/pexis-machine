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

## Current M1A component map

The current visuals are intentionally preserved while receiving semantic identity:

```text
cpu · compute
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

## Next gate

M1B should build the first authorial **Pexis Compute Module** on top of this contract. That work may add semantic
anchors and richer hardware primitives, but must not move CPU behavior into the visual layer.
