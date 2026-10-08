# Architecture

## M0: Machine Alive

M0 proves the smallest end-to-end architecture that can become a computer laboratory.

```text
Program bytes
    |
    v
+-----------+      +-----------+
|    CPU    | <--> |  Memory   |
+-----------+      +-----------+
      |
      v
+------------------+
|    Telemetry     |
+------------------+
      |
      v
 MachineSnapshot
      |
      v
WebAssembly adapter (M1)
      |
      v
3D Web Lab (M1)
```

The simulation core is the sole owner of machine state. Frontends consume immutable snapshots and explicit events. They do not mutate CPU or memory internals directly.

## M0 machine model

- 64-bit general-purpose values.
- Eight general-purpose registers: `R0` through `R7`.
- 64-bit program counter.
- Byte-addressable linear memory.
- Little-endian 64-bit values.
- Deterministic functional execution.
- One abstract cycle per successfully retired instruction in M0. This is a functional accounting rule, not a claim about physical timing.

## M0 instruction set

| Opcode | Encoding | Semantics |
| --- | --- | --- |
| `NOP` | `00` | No operation |
| `MOV_IMM64` | `10 rr imm64` | `R[rr] = imm64` |
| `LOAD64` | `20 rr addr64` | `R[rr] = memory[addr64..addr64+7]` |
| `STORE64` | `21 rr addr64` | `memory[addr64..addr64+7] = R[rr]` |
| `ADD` | `30 dst src` | `R[dst] = R[dst] + R[src]` modulo 2^64 |
| `HALT` | `FF` | Stop execution normally |

Multi-byte immediates and addresses are encoded little-endian.

## Fault model

M0 fails closed. Invalid opcodes, invalid register indices, truncated instructions, and out-of-bounds memory accesses transition the machine to `Faulted`. A faulting instruction does not retire and does not advance the architectural program counter.

`run(max_instructions)` also has a mandatory execution budget. Exceeding it produces `StepLimitExceeded` so callers cannot accidentally create an unbounded execution loop.

## Telemetry contract

M0 records:

- retired instructions;
- abstract cycles;
- data loads;
- data stores;
- instruction bytes fetched;
- data bytes read;
- data bytes written;
- total bytes moved.

For M0:

```text
bytes_moved = instruction_bytes + data_bytes_read + data_bytes_written
```

Instruction fetch traffic is intentionally visible. Future cache and hierarchy models can refine where those bytes move without changing the meaning of the base counters.

## M1: Visible Machine

M1 makes the machine observable in a browser without moving any machine rule out of C++.

```text
C++ core (truth) ──▶ WebAssembly adapter (bridge) ──▶ MachineClient (validation) ──▶ Web Lab (observer)
   Machine             wasm/bindings.cpp               web/src/machine                  React + Three.js
```

### Machine events

Snapshots say what the state is; events say what happened. `Machine::last_events()` returns the events of the
most recent transition (`include/pexis/machine/events.hpp`): `InstructionFetch`, `MemoryRead`, `MemoryWrite`,
`RegisterWrite`, `InstructionRetired`, `Halted`, `Faulted`. The event buffer is a fixed-size array (no allocation
in `step()`, which stays `noexcept`). Event totals equal telemetry counters by test.

M0 semantics are unchanged: same ISA, same fault model, same telemetry. Events are additive.

### Programs and experiments

- `ProgramBuilder` encodes M0 instructions (verified against an independent encoder in the tests).
- `decode_instruction` / `disassemble` are a read-only decoder used to present the program really in RAM. It never
  executes and never touches telemetry; tests prove its instruction addresses and lengths match the fetches the
  CPU performs.
- `experiments()` is the single catalog (Scalar Compute, Memory Transfer, Bounds Fault) used by tests and by the
  Web Lab.

### Web boundary

See [`wasm-boundary.md`](wasm-boundary.md) for the adapter contract and [`web-lab.md`](web-lab.md) for the browser
application. The 3D layer animates a RAM ↔ CPU transfer only after the simulator reports the corresponding event.
