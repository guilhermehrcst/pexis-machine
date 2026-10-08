# Vision

Pexis Machine is an experimental computer architecture laboratory.

Its purpose is to make complete computer systems designable, executable, measurable, and observable in software before any physical implementation exists.

The project starts deliberately small: a deterministic CPU, byte-addressable memory, a compact instruction set, and first-class telemetry. It can later grow toward caches, memory controllers, interconnects, GPUs, accelerators, heterogeneous systems, and experimental architectures.

## Core principles

1. **Simulation is truth. Visualization is observation.** The 3D Web Lab must never own architectural state or invent events that did not occur in the simulator.
2. **Correctness before realism.** A functional simulator must be deterministic and well tested before cycle-level timing or complex microarchitecture is introduced.
3. **Measurement is part of the architecture.** Experiments must expose reproducible telemetry from the beginning, especially data movement.
4. **Components remain replaceable.** CPU, memory hierarchy, interconnect, and accelerators should evolve behind explicit contracts rather than through cross-cutting coupling.
5. **Complexity must earn its place.** Caches, pipelines, branch prediction, SIMD, multicore, GPU execution, and physical implementations are added only when an experiment requires them.

## Relationship to Lume

Pexis Machine and Lume are independent projects with a possible experimental integration boundary.

Lume may produce workloads or hypotheses about representation and efficient execution. Pexis Machine may execute those workloads and return measurements. Neither project should import the other's internal architecture.
