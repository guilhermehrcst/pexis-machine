#include <cstdint>
#include <iomanip>
#include <iostream>
#include <vector>

#include "pexis/machine/isa.hpp"
#include "pexis/machine/machine.hpp"

namespace {

void emit_u64(std::vector<std::uint8_t>& program, const std::uint64_t value) {
    for (std::size_t i = 0; i < sizeof(value); ++i) {
        program.push_back(static_cast<std::uint8_t>((value >> (i * 8U)) & 0xFFU));
    }
}

void emit_mov(std::vector<std::uint8_t>& program, const std::uint8_t reg, const std::uint64_t value) {
    program.push_back(static_cast<std::uint8_t>(pexis::machine::Opcode::MovImm64));
    program.push_back(reg);
    emit_u64(program, value);
}

void emit_add(std::vector<std::uint8_t>& program, const std::uint8_t destination,
              const std::uint8_t source) {
    program.push_back(static_cast<std::uint8_t>(pexis::machine::Opcode::Add));
    program.push_back(destination);
    program.push_back(source);
}

} // namespace

int main() {
    using namespace pexis::machine;

    std::vector<std::uint8_t> program;
    emit_mov(program, 0, 40);
    emit_mov(program, 1, 2);
    emit_add(program, 0, 1);
    program.push_back(static_cast<std::uint8_t>(Opcode::Halt));

    Machine machine;
    if (!machine.load_program(program)) {
        std::cerr << "failed to load demo program\n";
        return 1;
    }

    const auto final_status = machine.run();
    const auto snapshot = machine.snapshot();

    std::cout << "Pexis Machine · M0 Machine Alive\n";
    std::cout << "R0                " << snapshot.registers[0] << '\n';
    std::cout << "Instructions      " << snapshot.telemetry.instructions_retired << '\n';
    std::cout << "Cycles            " << snapshot.telemetry.cycles << '\n';
    std::cout << "Instruction bytes " << snapshot.telemetry.instruction_bytes << '\n';
    std::cout << "Bytes moved       " << snapshot.telemetry.bytes_moved() << '\n';

    return final_status == MachineStatus::Halted && snapshot.registers[0] == 42 ? 0 : 1;
}
