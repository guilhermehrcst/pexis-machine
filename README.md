# Pexis Machine

**Experimental computer architecture laboratory.**

Pexis Machine is a platform for designing, simulating, measuring, and visualizing complete computer systems in software.

The project begins with a small deterministic CPU and memory system. It is designed to evolve, only when experiments justify it, toward caches, memory controllers, interconnects, GPUs, accelerators, heterogeneous systems, and experimental computer architectures.

> **Simulation is truth. Visualization is observation.**

## M0 · Machine Alive

The first milestone establishes the simulation contract:

- C++20 simulation core;
- eight 64-bit general-purpose registers;
- byte-addressable linear RAM;
- a minimal ISA (`NOP`, `MOV_IMM64`, `LOAD64`, `STORE64`, `ADD`, `HALT`);
- deterministic fetch → decode → execute;
- fail-closed fault handling;
- first-class telemetry for instructions, memory operations, and bytes moved;
- immutable machine snapshots ready for a future WebAssembly boundary;
- GCC, Clang, ASan, and UBSan CI coverage.

The 3D browser laboratory comes after this state contract is proven. JavaScript will observe and control the simulator; it will not reimplement the machine.

## Build

Requirements:

- CMake 3.20+
- a C++20 compiler

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel
ctest --test-dir build --output-on-failure
```

Run the minimal machine demo:

```bash
./build/pxm-demo
```

Expected architectural result: `R0 = 42`.

## Repository map

```text
include/pexis/machine/  public simulation contracts
src/                    simulation implementation
apps/pxm/               minimal executable demo
tests/                   deterministic core tests
docs/                    vision and architecture
web/                     future WebAssembly + Three.js laboratory boundary
```

## Roadmap

1. **M0 · Machine Alive**: functional CPU, RAM, ISA, faults, telemetry.
2. **M1 · Visible Machine**: WebAssembly adapter, machine events, interactive 3D Web Lab.
3. **M2 · Memory Hierarchy**: cache and memory-controller experiments.
4. **M3 · Timing**: pipeline and cycle-aware models.
5. **M4 · Heterogeneous Machine**: GPU/vector compute and shared interconnect.
6. **Future**: experimental architectures and possible FPGA implementations when evidence justifies them.

See [`docs/vision.md`](docs/vision.md) and [`docs/architecture.md`](docs/architecture.md) for the project contract.

## License

MIT.
