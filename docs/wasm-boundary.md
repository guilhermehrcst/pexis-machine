# WebAssembly boundary

```text
C++ simulation core        truth       executes; owns registers, PC, RAM, faults, telemetry, events
        |
WebAssembly adapter        bridge      wasm/bindings.cpp — translates state into plain JS values
        |
MachineClient (TS)         gate        web/src/machine/client.ts + boundary.ts — validates, fails closed
        |
Web Lab                    observer    presents and controls; never simulates
```

The browser drives the **same** `pexis::machine::Machine` that the native tests verify. The core test suite is
also compiled to WebAssembly and run under Node in CI (`ctest --test-dir build-wasm`).

## Contract — ABI version 1

One class, `WebMachine`, owns one `Machine`. Nothing else crosses the boundary.

| Method | Returns | Meaning |
| --- | --- | --- |
| `abiVersion()` | `number` | `1`. The TS client refuses any other value. |
| `memorySize()` | `number` | RAM size in bytes (64 KiB). |
| `experiments()` | `{ id, title, summary }[]` | The C++ experiment catalog (`src/experiments.cpp`). |
| `loadExperiment(id)` | `boolean` | `Machine::load_program` with the experiment's real bytes. Unknown ids return `false` and do not touch state. |
| `reset()` | `void` | Core reset followed by a reload of the loaded experiment. |
| `step()` | `void` | Exactly one `Machine::step()`. |
| `snapshot()` | `RawSnapshot` | `{ status, fault, pc, registers[8], telemetry{…, bytesMoved} }` |
| `lastEvents()` | `RawEvent[]` | Events of the most recent transition, in emission order. |
| `readMemory(address, length)` | `Uint8Array \| null` | Observation only. `null` unless the whole range is inside RAM and `length ≤ 4096`. Never touches telemetry. |
| `program()` | `RawProgram \| null` | The loaded experiment's range, **decoded from the bytes currently in RAM** by the C++ decoder. |
| `delete()` | `void` | Releases the native object (Embind). |

Wire rules:

- every 64-bit quantity (PC, registers, addresses, values, counters) is a `BigInt` (`-sWASM_BIGINT`);
- enums travel as **names** (`"halted"`, `"memory-out-of-bounds"`, `"memory-write"`), produced in C++, so a renumbered
  enum cannot be misread silently;
- returned values are plain JS objects/arrays copied out of WASM; no Embind handles leak besides `WebMachine`.

## Validation (fail closed)

`web/src/machine/boundary.ts` validates every value before the UI sees it and throws `BoundaryError` on any missing
field, wrong type, unknown enum name, register index ≥ 8, value outside uint64, `status`/`fault` inconsistency, or a
`bytesMoved` that violates the documented relation. A boundary error stops the run scheduler and replaces the lab
with an error screen: no unvalidated value is ever rendered.

## Machine events

Defined in `include/pexis/machine/events.hpp`. Per transition, in order:

| Event | Direction | Fields |
| --- | --- | --- |
| `instruction-fetch` | RAM → CPU | address = PC, size = bytes fetched |
| `memory-read` | RAM → CPU | address, size = 8, value, reg = destination |
| `memory-write` | CPU → RAM | address, size = 8, value, reg = source |
| `register-write` | inside CPU | reg, value |
| `instruction-retired` | — | address = PC, value = next PC |
| `halted` | — | address = PC of HALT |
| `faulted` | — | address = faulting PC, fault code |

Invariants proven by native and WASM tests: fetch bytes = `instruction_bytes`; reads/writes count and size =
loads/stores and data bytes; retired events = `instructions_retired`. A faulting instruction reports the bytes it
really fetched and a `faulted` event — never a register write, memory access, or retirement. A `step()` on a halted
or faulted machine reports no events.

## Build

```bash
source /path/to/emsdk/emsdk_env.sh     # Emscripten 4.0.23
./scripts/build-wasm.sh                # -> web/src/wasm/pexis-machine.{js,wasm}
ctest --test-dir build-wasm --output-on-failure
```

Link flags (see `CMakeLists.txt`): Embind, ES module, `ENVIRONMENT=web,node` (browser + Vitest), BigInt, no
filesystem, fixed 4 MiB memory without growth, no `eval`.
