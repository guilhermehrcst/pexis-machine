# Exploded-view references (M1G)

Ten reference images were supplied for M1G as `Pexis_Machine_10_Exploded_Views.zip`. This document records how they
were used. **The images are not in the repository.** They are illustrative inputs, not specifications.

## Provenance and reliability

| Property | Finding |
|---|---|
| Files | `01_Pexis_Machine.jpeg` … `10_Gabinete.jpeg`, 1448×1086 JPEG each |
| Metadata | EXIF holds only resolution and orientation: no author, camera, software or date |
| Source | Not stated. Origin and licence are unknown, so the images are not redistributed here |
| Nature | Almost certainly AI-generated infographics (see below). They show plausible constructions, not documented hardware |

Why they are treated as generated illustrations:

- All ten share one six-panel template:
  1. assembled view;
  2. exploded view with callouts;
  3. selection highlight;
  4. detail card;
  5. assembly arrows;
  6. physical/logical toggle.
- They contain typographic glitches ("estraruturra", "Exploraçãõ").
- Image 01 depicts the Pexis Machine with **"BATER"**, the Safari mistranslation of "RAM" that M1E fixed. It was
  therefore derived from a machine-translated screenshot of the Web Lab.
- Image 01 attributes false properties to the Pexis Machine:
  - "Zen 4 architecture (simulated)";
  - a "32-bit data bus";
  - an "Active" state.

  The core simulates none of these: it is a custom 64-bit ISA with eight registers and no modelled bus width. **None
  of these claims was adopted.**

## What was taken from them

Only interaction and composition concepts were reused. Measurements, electrical behaviour, topologies, materials and
trademarks were not.

| Concept (panel) | Used in M1G as |
|---|---|
| Layers lifted along the stacking axis, assembled → exploded (2, 5) | `ExplodePlan`: vertical, ordered separation of the Compute layers, reversible by one parameter |
| Top layer leaves first (2) | Per-step `delay`: the ring lifts first, the contacts last |
| Selected element outlined in blue, named beside it (3) | `Box3Helper` outline plus one side label for the selected part; blue is reserved for selection |
| Detail card with fields (4) | Part inspector: semantic id, role, representation, summary, relation, what the core simulates |
| Physical / logical toggle (6) | **Deferred.** A logical view needs structures the core actually exposes (see below) |

## Traceability matrix

| Image | Concept observed | Pexis component | Semantic part | Permitted use | Limitation |
|---|---|---|---|---|---|
| 01 Pexis Machine | Machine exploded into platform, interconnect, CPU, RAM, planned GPU; assembly arrows; physical/logical toggle | Machine (all) | — | Interaction pattern only | Contains false claims (Zen 4, 32-bit bus) and a mistranslation; the "substrate with cut-outs" does not exist in Pexis and was not added |
| 02 CPU (AMD Threadripper Pro) | Lid → chiplets/I/O die → substrate → interconnect layers → LGA contacts, vertical stack | `cpu` | `activity-ring`, `compute-tile`, `module-frame`, `contacts`, `package` | Vertical layer order and top-first separation | No IHS, chiplets, I/O die, cache or core counts are modelled. AMD branding and package geometry not reused |
| 03 Motherboard | Sub-assemblies lifted off a multilayer PCB | `interconnect` (future) | `carrier`, `frame`, `active-ports`, `ram-lanes`, `gpu-reserved-lanes` | Future Fabric separation: carrier as base, routes and ports above | Sockets, VRM, PCIe slots and chipset do not exist in Pexis. ASUS model not reused |
| 04 GPU | Shroud, fans, heatsink, PCB, backplate | `gpu` (planned) | — | None in M1G | The GPU is not simulated (M4); exploding it would imply hardware that does not exist |
| 05 RAM (DDR5 RDIMM) | Heat spreader → DRAM chips → PCB → edge contacts | `ram` (next PR) | `chassis`, `dram-packages`, `pcb`, `contacts`, `slot`, `activity-edge` | Next increment: same rig, lateral and vertical separation | Packages are illustrative, not DRAM banks or channels. Capacity, speed and SPD figures not reused. NEMIX branding not reused |
| 06 SSD NVMe | Heatsink, controller, NAND, DRAM cache, M.2 PCB | — | — | Reference library only | Storage is not modelled. Samsung branding not reused |
| 07 SSD SATA | Lid, PCB, controller, NAND, tray | — | — | Reference library only | Storage is not modelled. Solidigm branding not reused |
| 08 Power supply | Grille, fan, capacitors, transformer, modular panel | — | — | Reference library only | Power is not modelled. Corsair branding not reused |
| 09 Water cooler | Fans, radiator, pump block, cold plate, tubes | — | — | Reference library only | Thermals are not modelled |
| 10 Case | Panels, chassis, bays, I/O panel, casters | — | — | Reference library only | Enclosure is not part of the architecture model |

## Deferred

- **Memory and Fabric explode plans.** These come in separate PRs, on the same `ExplodeRig` with no new infrastructure.
- **Logical view.** It is possible only for what the core models:
  - CPU: registers, PC, decoded instructions and retire events;
  - Memory: addressable regions and the bytes moved by observed fetch, load and store events.

  Caches, pipelines, physical buses, chiplets and any GPU view require explicit simulator support first.
- **GPU, storage, power, cooling, case.** These are not part of the simulated machine. They have no inspection until
  a milestone models them.
