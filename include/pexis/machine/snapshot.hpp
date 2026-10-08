#pragma once

#include <array>
#include <cstdint>

#include "pexis/machine/isa.hpp"

namespace pexis::machine {

enum class MachineStatus : std::uint8_t {
    Ready,
    Running,
    Halted,
    Faulted,
};

enum class FaultCode : std::uint8_t {
    None,
    InvalidOpcode,
    InvalidRegister,
    MemoryOutOfBounds,
    TruncatedInstruction,
    StepLimitExceeded,
};

struct Telemetry final {
    std::uint64_t instructions_retired = 0;
    std::uint64_t cycles = 0;
    std::uint64_t loads = 0;
    std::uint64_t stores = 0;
    std::uint64_t instruction_bytes = 0;
    std::uint64_t data_bytes_read = 0;
    std::uint64_t data_bytes_written = 0;

    [[nodiscard]] constexpr std::uint64_t bytes_moved() const noexcept {
        return instruction_bytes + data_bytes_read + data_bytes_written;
    }
};

struct MachineSnapshot final {
    MachineStatus status = MachineStatus::Ready;
    FaultCode fault = FaultCode::None;
    std::uint64_t pc = 0;
    std::array<std::uint64_t, kRegisterCount> registers{};
    Telemetry telemetry{};
};

} // namespace pexis::machine
