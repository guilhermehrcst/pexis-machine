#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "pexis/machine/isa.hpp"
#include "pexis/machine/memory.hpp"
#include "pexis/machine/snapshot.hpp"

namespace pexis::machine {

struct MachineConfig final {
    std::size_t memory_size_bytes = 64 * 1024;
};

struct StepResult final {
    MachineStatus status = MachineStatus::Ready;
    FaultCode fault = FaultCode::None;
    std::uint64_t pc_before = 0;
    std::uint64_t pc_after = 0;
};

class Machine final {
public:
    explicit Machine(MachineConfig config = {});

    void reset() noexcept;

    [[nodiscard]] bool load_program(std::span<const std::uint8_t> program,
                                    std::uint64_t address = 0) noexcept;

    [[nodiscard]] StepResult step() noexcept;
    [[nodiscard]] MachineStatus run(std::uint64_t max_instructions = 1'000'000) noexcept;

    [[nodiscard]] MachineSnapshot snapshot() const noexcept;
    [[nodiscard]] const Memory& memory() const noexcept;

private:
    [[nodiscard]] bool fetch8(std::uint64_t& cursor, std::uint8_t& value) noexcept;
    [[nodiscard]] bool fetch64(std::uint64_t& cursor, std::uint64_t& value) noexcept;
    [[nodiscard]] bool valid_register(std::uint8_t index) const noexcept;
    [[nodiscard]] StepResult fault(FaultCode code, std::uint64_t pc_before) noexcept;
    void retire(std::uint64_t next_pc) noexcept;

    Memory memory_;
    std::array<std::uint64_t, kRegisterCount> registers_{};
    std::uint64_t pc_ = 0;
    MachineStatus status_ = MachineStatus::Ready;
    FaultCode fault_ = FaultCode::None;
    Telemetry telemetry_{};
};

} // namespace pexis::machine
