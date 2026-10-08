#pragma once

#include <cstddef>
#include <cstdint>

namespace pexis::machine {

enum class Opcode : std::uint8_t {
    Nop = 0x00,
    MovImm64 = 0x10,
    Load64 = 0x20,
    Store64 = 0x21,
    Add = 0x30,
    Halt = 0xFF,
};

inline constexpr std::size_t kRegisterCount = 8;

} // namespace pexis::machine
