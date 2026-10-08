#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <string_view>
#include <vector>

#include "pexis/machine/isa.hpp"
#include "pexis/machine/machine.hpp"

namespace {

using pexis::machine::FaultCode;
using pexis::machine::Machine;
using pexis::machine::MachineConfig;
using pexis::machine::MachineStatus;
using pexis::machine::Opcode;

[[noreturn]] void fail(const std::string_view message) {
    std::cerr << "FAIL: " << message << '\n';
    std::exit(1);
}

void expect(const bool condition, const std::string_view message) {
    if (!condition) {
        fail(message);
    }
}

void emit_u64(std::vector<std::uint8_t>& program, const std::uint64_t value) {
    for (std::size_t i = 0; i < sizeof(value); ++i) {
        program.push_back(static_cast<std::uint8_t>((value >> (i * 8U)) & 0xFFU));
    }
}

void emit_mov(std::vector<std::uint8_t>& program, const std::uint8_t reg, const std::uint64_t value) {
    program.push_back(static_cast<std::uint8_t>(Opcode::MovImm64));
    program.push_back(reg);
    emit_u64(program, value);
}

void emit_load(std::vector<std::uint8_t>& program, const std::uint8_t reg, const std::uint64_t address) {
    program.push_back(static_cast<std::uint8_t>(Opcode::Load64));
    program.push_back(reg);
    emit_u64(program, address);
}

void emit_store(std::vector<std::uint8_t>& program, const std::uint8_t reg, const std::uint64_t address) {
    program.push_back(static_cast<std::uint8_t>(Opcode::Store64));
    program.push_back(reg);
    emit_u64(program, address);
}

void emit_add(std::vector<std::uint8_t>& program, const std::uint8_t destination,
              const std::uint8_t source) {
    program.push_back(static_cast<std::uint8_t>(Opcode::Add));
    program.push_back(destination);
    program.push_back(source);
}

void test_mov_add_halt() {
    std::vector<std::uint8_t> program;
    emit_mov(program, 0, 40);
    emit_mov(program, 1, 2);
    emit_add(program, 0, 1);
    program.push_back(static_cast<std::uint8_t>(Opcode::Halt));

    Machine machine;
    expect(machine.load_program(program), "program should load");
    expect(machine.run() == MachineStatus::Halted, "machine should halt");

    const auto snapshot = machine.snapshot();
    expect(snapshot.registers[0] == 42, "R0 should contain 42");
    expect(snapshot.telemetry.instructions_retired == 4, "four instructions should retire");
    expect(snapshot.telemetry.cycles == 4, "M0 uses one cycle per retired instruction");
    expect(snapshot.telemetry.instruction_bytes == 24, "instruction byte count should be exact");
    expect(snapshot.telemetry.bytes_moved() == 24, "only instruction bytes moved in scalar demo");
}

void test_load_store_telemetry() {
    constexpr std::uint64_t kAddress = 256;
    constexpr std::uint64_t kValue = 0x1122334455667788ULL;

    std::vector<std::uint8_t> program;
    emit_mov(program, 0, kValue);
    emit_store(program, 0, kAddress);
    emit_load(program, 1, kAddress);
    program.push_back(static_cast<std::uint8_t>(Opcode::Halt));

    Machine machine;
    expect(machine.load_program(program), "program should load");
    expect(machine.run() == MachineStatus::Halted, "machine should halt");

    const auto snapshot = machine.snapshot();
    expect(snapshot.registers[1] == kValue, "LOAD64 should recover the stored value");
    expect(snapshot.telemetry.loads == 1, "one load should be measured");
    expect(snapshot.telemetry.stores == 1, "one store should be measured");
    expect(snapshot.telemetry.data_bytes_read == 8, "LOAD64 should move eight data bytes");
    expect(snapshot.telemetry.data_bytes_written == 8, "STORE64 should move eight data bytes");
    expect(snapshot.telemetry.instruction_bytes == 31, "instruction bytes should be measured separately");
    expect(snapshot.telemetry.bytes_moved() == 47, "total movement should include instructions and data");

    std::uint64_t memory_value = 0;
    expect(machine.memory().read64(kAddress, memory_value), "stored memory should be readable");
    expect(memory_value == kValue, "memory should use deterministic little-endian encoding");
}

void test_invalid_register_fault_is_fail_closed() {
    std::vector<std::uint8_t> program{
        static_cast<std::uint8_t>(Opcode::MovImm64),
        8,
    };

    Machine machine;
    expect(machine.load_program(program), "program should load");
    const auto result = machine.step();
    const auto snapshot = machine.snapshot();

    expect(result.status == MachineStatus::Faulted, "invalid register should fault");
    expect(result.fault == FaultCode::InvalidRegister, "fault code should identify invalid register");
    expect(snapshot.pc == 0, "faulting instruction must not advance PC");
    expect(snapshot.telemetry.instructions_retired == 0, "faulting instruction must not retire");
}

void test_out_of_bounds_load_fault() {
    std::vector<std::uint8_t> program;
    emit_load(program, 0, 60);

    Machine machine(MachineConfig{64});
    expect(machine.load_program(program), "program should fit in memory");
    const auto result = machine.step();

    expect(result.status == MachineStatus::Faulted, "out-of-bounds LOAD64 should fault");
    expect(result.fault == FaultCode::MemoryOutOfBounds, "fault code should identify memory bounds");
    expect(machine.snapshot().telemetry.loads == 0, "failed load must not increment load telemetry");
}

void test_truncated_instruction_at_memory_boundary() {
    Machine machine(MachineConfig{16});
    const std::vector<std::uint8_t> program{static_cast<std::uint8_t>(Opcode::MovImm64)};
    expect(machine.load_program(program, 15), "single opcode should load at final byte");

    const auto result = machine.step();
    expect(result.status == MachineStatus::Faulted, "truncated instruction should fault");
    expect(result.fault == FaultCode::TruncatedInstruction, "fault should identify truncation");
    expect(machine.snapshot().pc == 15, "truncated instruction must not advance PC");
}

void test_run_step_limit() {
    const std::vector<std::uint8_t> program{
        static_cast<std::uint8_t>(Opcode::Nop),
        static_cast<std::uint8_t>(Opcode::Nop),
        static_cast<std::uint8_t>(Opcode::Nop),
        static_cast<std::uint8_t>(Opcode::Halt),
    };

    Machine machine;
    expect(machine.load_program(program), "program should load");
    expect(machine.run(2) == MachineStatus::Faulted, "step limit should stop execution");

    const auto snapshot = machine.snapshot();
    expect(snapshot.fault == FaultCode::StepLimitExceeded, "step limit should have explicit fault code");
    expect(snapshot.telemetry.instructions_retired == 2, "only executed instructions should retire");
    expect(snapshot.pc == 2, "PC should point to the next unexecuted instruction");
}

} // namespace

int main() {
    test_mov_add_halt();
    test_load_store_telemetry();
    test_invalid_register_fault_is_fail_closed();
    test_out_of_bounds_load_fault();
    test_truncated_instruction_at_memory_boundary();
    test_run_step_limit();

    std::cout << "PASS: all Pexis Machine M0 tests\n";
    return 0;
}
