#pragma once

#include <cstddef>
#include <cstdint>
#include <span>
#include <string>
#include <vector>

#include "pexis/machine/isa.hpp"
#include "pexis/machine/memory.hpp"

namespace pexis::machine {

// Encodes M0 instructions into program bytes (little-endian operands).
class ProgramBuilder final {
public:
    ProgramBuilder& nop();
    ProgramBuilder& mov_imm64(std::uint8_t reg, std::uint64_t value);
    ProgramBuilder& load64(std::uint8_t reg, std::uint64_t address);
    ProgramBuilder& store64(std::uint8_t reg, std::uint64_t address);
    ProgramBuilder& add(std::uint8_t destination, std::uint8_t source);
    ProgramBuilder& halt();

    [[nodiscard]] const std::vector<std::uint8_t>& bytes() const noexcept;

private:
    void emit_u64(std::uint64_t value);

    std::vector<std::uint8_t> bytes_;
};

enum class DecodeStatus : std::uint8_t {
    Ok,
    InvalidOpcode,
    Truncated,
};

// Static, read-only view of one encoded instruction. Used to present the
// program that is really in memory. Decoding never executes, never touches
// telemetry, and is not used by the execution path. Register operands are
// reported as encoded; register validity is enforced by execution.
struct DecodedInstruction final {
    std::uint64_t address = 0;
    std::uint32_t length = 0;
    std::uint8_t opcode = 0;
    DecodeStatus status = DecodeStatus::Ok;
    std::string text;
};

[[nodiscard]] DecodedInstruction decode_instruction(const Memory& memory, std::uint64_t address);

// Decodes [address, address + length) sequentially. Stops at the end of the
// range, after HALT, or after the first undecodable instruction.
[[nodiscard]] std::vector<DecodedInstruction> disassemble(const Memory& memory,
                                                          std::uint64_t address,
                                                          std::uint64_t length);

} // namespace pexis::machine
