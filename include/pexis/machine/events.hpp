#pragma once

#include <cstddef>
#include <cstdint>

#include "pexis/machine/snapshot.hpp"

namespace pexis::machine {

// Architectural events describe what the machine did during its most recent
// state transition. Snapshots say what the state is; events say what happened.
//
// Contract (per transition, in emission order):
//
//   InstructionFetch  memory -> CPU   address = instruction PC, size = bytes fetched
//   MemoryRead        RAM -> CPU      address, size = 8, value = bytes read (LE)
//   MemoryWrite       CPU -> RAM      address, size = 8, value = bytes written, reg = source
//   RegisterWrite     inside CPU      reg, value = new register value
//   InstructionRetired                address = instruction PC, value = next PC
//   Halted                            address = PC of the HALT instruction
//   Faulted                           address = PC of the faulting instruction, fault = code
//
// Invariants, checked by tests:
//   sum(InstructionFetch.size) == telemetry.instruction_bytes
//   count(MemoryRead)          == telemetry.loads
//   sum(MemoryRead.size)       == telemetry.data_bytes_read
//   count(MemoryWrite)         == telemetry.stores
//   sum(MemoryWrite.size)      == telemetry.data_bytes_written
//   count(InstructionRetired)  == telemetry.instructions_retired
//
// A faulting instruction reports the bytes it really fetched (they are counted
// in telemetry) and a Faulted event. It never reports register writes, memory
// accesses, or retirement.
enum class EventKind : std::uint8_t {
    InstructionFetch = 1,
    MemoryRead = 2,
    MemoryWrite = 3,
    RegisterWrite = 4,
    InstructionRetired = 5,
    Halted = 6,
    Faulted = 7,
};

inline constexpr std::uint8_t kNoRegister = 0xFF;

struct MachineEvent final {
    EventKind kind = EventKind::InstructionFetch;
    FaultCode fault = FaultCode::None;
    std::uint8_t reg = kNoRegister;
    std::uint32_t size = 0;
    std::uint64_t address = 0;
    std::uint64_t value = 0;
};

// Upper bound of events produced by one transition. The worst case in M1 is
// LOAD64: fetch, read, register write, retire.
inline constexpr std::size_t kMaxEventsPerStep = 8;

} // namespace pexis::machine
