#include "pexis/machine/program.hpp"

#include <array>
#include <cstdio>

namespace pexis::machine {

namespace {

constexpr std::uint8_t op(const Opcode opcode) noexcept {
    return static_cast<std::uint8_t>(opcode);
}

std::string format_register(const std::uint8_t reg) {
    return "R" + std::to_string(reg);
}

std::string format_address(const std::uint64_t address) {
    std::array<char, 24> buffer{};
    std::snprintf(buffer.data(), buffer.size(), "0x%04llX", static_cast<unsigned long long>(address));
    return buffer.data();
}

// Small immediates are shown in decimal (MOV R0, 40); large ones in hex.
std::string format_immediate(const std::uint64_t value) {
    if (value <= 0xFFFFU) {
        return std::to_string(value);
    }
    std::array<char, 24> buffer{};
    std::snprintf(buffer.data(), buffer.size(), "0x%016llX", static_cast<unsigned long long>(value));
    return buffer.data();
}

std::string format_byte(const std::uint8_t value) {
    std::array<char, 8> buffer{};
    std::snprintf(buffer.data(), buffer.size(), "0x%02X", static_cast<unsigned int>(value));
    return buffer.data();
}

} // namespace

ProgramBuilder& ProgramBuilder::nop() {
    bytes_.push_back(op(Opcode::Nop));
    return *this;
}

ProgramBuilder& ProgramBuilder::mov_imm64(const std::uint8_t reg, const std::uint64_t value) {
    bytes_.push_back(op(Opcode::MovImm64));
    bytes_.push_back(reg);
    emit_u64(value);
    return *this;
}

ProgramBuilder& ProgramBuilder::load64(const std::uint8_t reg, const std::uint64_t address) {
    bytes_.push_back(op(Opcode::Load64));
    bytes_.push_back(reg);
    emit_u64(address);
    return *this;
}

ProgramBuilder& ProgramBuilder::store64(const std::uint8_t reg, const std::uint64_t address) {
    bytes_.push_back(op(Opcode::Store64));
    bytes_.push_back(reg);
    emit_u64(address);
    return *this;
}

ProgramBuilder& ProgramBuilder::add(const std::uint8_t destination, const std::uint8_t source) {
    bytes_.push_back(op(Opcode::Add));
    bytes_.push_back(destination);
    bytes_.push_back(source);
    return *this;
}

ProgramBuilder& ProgramBuilder::halt() {
    bytes_.push_back(op(Opcode::Halt));
    return *this;
}

const std::vector<std::uint8_t>& ProgramBuilder::bytes() const noexcept {
    return bytes_;
}

void ProgramBuilder::emit_u64(const std::uint64_t value) {
    for (std::size_t i = 0; i < sizeof(value); ++i) {
        bytes_.push_back(static_cast<std::uint8_t>((value >> (i * 8U)) & 0xFFU));
    }
}

DecodedInstruction decode_instruction(const Memory& memory, const std::uint64_t address) {
    DecodedInstruction decoded;
    decoded.address = address;

    std::uint8_t opcode = 0;
    if (!memory.read8(address, opcode)) {
        decoded.status = DecodeStatus::Truncated;
        decoded.text = "<end of memory>";
        return decoded;
    }
    decoded.opcode = opcode;

    const auto truncated = [&decoded](const std::uint32_t available) {
        decoded.status = DecodeStatus::Truncated;
        decoded.length = available;
        decoded.text = "<truncated>";
        return decoded;
    };

    switch (static_cast<Opcode>(opcode)) {
        case Opcode::Nop:
            decoded.length = 1;
            decoded.text = "NOP";
            return decoded;

        case Opcode::Halt:
            decoded.length = 1;
            decoded.text = "HALT";
            return decoded;

        case Opcode::MovImm64:
        case Opcode::Load64:
        case Opcode::Store64: {
            std::uint8_t reg = 0;
            std::uint64_t operand = 0;
            if (!memory.read8(address + 1, reg) || !memory.read64(address + 2, operand)) {
                return truncated(1);
            }
            decoded.length = 10;
            if (static_cast<Opcode>(opcode) == Opcode::MovImm64) {
                decoded.text = "MOV " + format_register(reg) + ", " + format_immediate(operand);
            } else if (static_cast<Opcode>(opcode) == Opcode::Load64) {
                decoded.text = "LOAD " + format_register(reg) + ", [" + format_address(operand) + "]";
            } else {
                decoded.text = "STORE [" + format_address(operand) + "], " + format_register(reg);
            }
            return decoded;
        }

        case Opcode::Add: {
            std::uint8_t destination = 0;
            std::uint8_t source = 0;
            if (!memory.read8(address + 1, destination) || !memory.read8(address + 2, source)) {
                return truncated(1);
            }
            decoded.length = 3;
            decoded.text = "ADD " + format_register(destination) + ", " + format_register(source);
            return decoded;
        }
    }

    decoded.status = DecodeStatus::InvalidOpcode;
    decoded.length = 1;
    decoded.text = ".byte " + format_byte(opcode);
    return decoded;
}

std::vector<DecodedInstruction> disassemble(const Memory& memory, const std::uint64_t address,
                                            const std::uint64_t length) {
    std::vector<DecodedInstruction> listing;
    std::uint64_t cursor = address;
    const std::uint64_t end = address + length;
    if (end < address) {
        return listing;
    }

    while (cursor < end) {
        auto decoded = decode_instruction(memory, cursor);
        const bool stop = decoded.status != DecodeStatus::Ok || decoded.length == 0 ||
                          decoded.opcode == op(Opcode::Halt);
        cursor += decoded.length;
        listing.push_back(std::move(decoded));
        if (stop) {
            break;
        }
    }
    return listing;
}

} // namespace pexis::machine
