#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <string_view>
#include <vector>

#include "pexis/machine/events.hpp"
#include "pexis/machine/experiments.hpp"
#include "pexis/machine/isa.hpp"
#include "pexis/machine/machine.hpp"
#include "pexis/machine/program.hpp"

namespace {

using pexis::machine::EventKind;
using pexis::machine::FaultCode;
using pexis::machine::Machine;
using pexis::machine::MachineConfig;
using pexis::machine::MachineEvent;
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

// ---------------------------------------------------------------------------
// M1: architectural events
// ---------------------------------------------------------------------------

std::vector<MachineEvent> events_of(const Machine& machine) {
    const auto events = machine.last_events();
    return {events.begin(), events.end()};
}

bool is_event(const MachineEvent& event, const EventKind kind, const std::uint64_t address,
              const std::uint32_t size, const std::uint64_t value, const std::uint8_t reg) {
    return event.kind == kind && event.address == address && event.size == size &&
           event.value == value && event.reg == reg && event.fault == FaultCode::None;
}

constexpr std::uint8_t kNoReg = pexis::machine::kNoRegister;

void test_mov_and_add_events() {
    std::vector<std::uint8_t> program;
    emit_mov(program, 0, 40);
    emit_mov(program, 1, 2);
    emit_add(program, 0, 1);

    Machine machine;
    expect(machine.load_program(program), "program should load");
    expect(machine.last_events().empty(), "a freshly loaded machine reports no events");

    static_cast<void>(machine.step());
    auto events = events_of(machine);
    expect(events.size() == 3, "MOV emits fetch, register write, retire");
    expect(is_event(events[0], EventKind::InstructionFetch, 0, 10, 0, kNoReg), "MOV fetch covers 10 bytes at PC 0");
    expect(is_event(events[1], EventKind::RegisterWrite, 0, 0, 40, 0), "MOV writes R0 = 40");
    expect(is_event(events[2], EventKind::InstructionRetired, 0, 0, 10, kNoReg), "MOV retires with next PC 10");

    static_cast<void>(machine.step());
    static_cast<void>(machine.step());
    events = events_of(machine);
    expect(events.size() == 3, "ADD emits fetch, register write, retire");
    expect(is_event(events[0], EventKind::InstructionFetch, 20, 3, 0, kNoReg), "ADD fetch covers 3 bytes at PC 20");
    expect(is_event(events[1], EventKind::RegisterWrite, 0, 0, 42, 0), "ADD writes the architectural result");
    expect(is_event(events[2], EventKind::InstructionRetired, 20, 0, 23, kNoReg), "ADD retires with next PC 23");
}

void test_store_emits_memory_write_and_load_emits_memory_read() {
    constexpr std::uint64_t kAddress = 0x100;
    constexpr std::uint64_t kValue = 0x0123456789ABCDEFULL;

    std::vector<std::uint8_t> program;
    emit_mov(program, 0, kValue);
    emit_store(program, 0, kAddress);
    emit_load(program, 1, kAddress);

    Machine machine;
    expect(machine.load_program(program), "program should load");
    static_cast<void>(machine.step());

    static_cast<void>(machine.step());
    auto events = events_of(machine);
    expect(events.size() == 3, "STORE emits fetch, memory write, retire");
    expect(is_event(events[0], EventKind::InstructionFetch, 10, 10, 0, kNoReg), "STORE fetch is reported first");
    expect(is_event(events[1], EventKind::MemoryWrite, kAddress, 8, kValue, 0),
           "STORE reports address, size, value and source register");
    expect(is_event(events[2], EventKind::InstructionRetired, 10, 0, 20, kNoReg), "STORE retires");

    static_cast<void>(machine.step());
    events = events_of(machine);
    expect(events.size() == 4, "LOAD emits fetch, memory read, register write, retire");
    expect(is_event(events[0], EventKind::InstructionFetch, 20, 10, 0, kNoReg), "LOAD fetch is reported first");
    expect(is_event(events[1], EventKind::MemoryRead, kAddress, 8, kValue, 1),
           "LOAD reports address, size, value and destination register");
    expect(is_event(events[2], EventKind::RegisterWrite, 0, 0, kValue, 1), "LOAD writes the destination register");
    expect(is_event(events[3], EventKind::InstructionRetired, 20, 0, 30, kNoReg), "LOAD retires");
}

void test_halt_events_and_post_halt_step() {
    const std::vector<std::uint8_t> program{
        static_cast<std::uint8_t>(Opcode::Nop),
        static_cast<std::uint8_t>(Opcode::Halt),
    };

    Machine machine;
    expect(machine.load_program(program), "program should load");
    static_cast<void>(machine.step());
    static_cast<void>(machine.step());

    const auto events = events_of(machine);
    expect(events.size() == 3, "HALT emits fetch, retire, halted");
    expect(is_event(events[0], EventKind::InstructionFetch, 1, 1, 0, kNoReg), "HALT fetch is one byte");
    expect(is_event(events[1], EventKind::InstructionRetired, 1, 0, 2, kNoReg), "HALT retires");
    expect(is_event(events[2], EventKind::Halted, 1, 0, 0, kNoReg), "Halted names the HALT PC");
    expect(machine.snapshot().status == MachineStatus::Halted, "machine is halted");

    const auto before = machine.snapshot();
    const auto result = machine.step();
    const auto after = machine.snapshot();
    expect(result.status == MachineStatus::Halted, "step after HALT reports Halted");
    expect(machine.last_events().empty(), "step after HALT performs no transition and reports no events");
    expect(after.pc == before.pc, "step after HALT does not move PC");
    expect(after.telemetry.instruction_bytes == before.telemetry.instruction_bytes,
           "step after HALT fetches nothing");
    expect(after.telemetry.instructions_retired == before.telemetry.instructions_retired,
           "step after HALT retires nothing");
}

void expect_fault_only(const Machine& machine, const FaultCode code, const std::uint64_t pc,
                       const std::uint32_t fetched, const std::string_view label) {
    const auto events = events_of(machine);
    const std::size_t expected = fetched > 0 ? 2U : 1U;
    expect(events.size() == expected, label);
    if (fetched > 0) {
        expect(is_event(events[0], EventKind::InstructionFetch, pc, fetched, 0, kNoReg), label);
    }
    const auto& fault = events.back();
    expect(fault.kind == EventKind::Faulted && fault.fault == code && fault.address == pc, label);
    for (const auto& event : events) {
        expect(event.kind != EventKind::RegisterWrite && event.kind != EventKind::MemoryRead &&
                   event.kind != EventKind::MemoryWrite && event.kind != EventKind::InstructionRetired,
               label);
    }
}

void test_fault_events_have_no_false_architectural_effects() {
    {
        std::vector<std::uint8_t> program;
        emit_mov(program, 3, 7);
        emit_load(program, 3, 60);

        Machine machine(MachineConfig{64});
        expect(machine.load_program(program), "program should load");
        static_cast<void>(machine.step());
        const auto before = machine.snapshot();
        static_cast<void>(machine.step());
        const auto after = machine.snapshot();

        expect_fault_only(machine, FaultCode::MemoryOutOfBounds, 10, 10,
                          "out-of-bounds LOAD reports its real fetch and a fault, nothing else");
        expect(after.registers == before.registers, "faulting LOAD must not write registers");
        expect(after.pc == before.pc, "faulting LOAD must not advance PC");
        expect(after.telemetry.loads == 0 && after.telemetry.data_bytes_read == 0,
               "faulting LOAD must not count data traffic");
    }
    {
        std::vector<std::uint8_t> program;
        emit_store(program, 0, 60);

        Machine machine(MachineConfig{64});
        expect(machine.load_program(program), "program should load");
        static_cast<void>(machine.step());
        expect_fault_only(machine, FaultCode::MemoryOutOfBounds, 0, 10,
                          "out-of-bounds STORE reports no memory write");
        std::uint64_t untouched = 1;
        expect(machine.memory().read64(48, untouched) && untouched == 0, "faulting STORE leaves RAM untouched");
    }
    {
        Machine machine;
        expect(machine.load_program(std::vector<std::uint8_t>{0xAB}), "program should load");
        static_cast<void>(machine.step());
        expect_fault_only(machine, FaultCode::InvalidOpcode, 0, 1, "invalid opcode fetches one byte and faults");
    }
    {
        Machine machine(MachineConfig{16});
        expect(machine.load_program(std::vector<std::uint8_t>{static_cast<std::uint8_t>(Opcode::MovImm64)}, 15),
               "program should load");
        static_cast<void>(machine.step());
        expect_fault_only(machine, FaultCode::TruncatedInstruction, 15, 1,
                          "truncated instruction reports the single byte really fetched");
    }
    {
        Machine machine(MachineConfig{16});
        expect(machine.load_program(std::vector<std::uint8_t>{}, 16), "empty program at end of RAM loads");
        static_cast<void>(machine.step());
        expect_fault_only(machine, FaultCode::TruncatedInstruction, 16, 0,
                          "a fetch that reads nothing reports no fetch event");
    }
}

void test_run_budget_fault_event() {
    const std::vector<std::uint8_t> program{
        static_cast<std::uint8_t>(Opcode::Nop),
        static_cast<std::uint8_t>(Opcode::Nop),
        static_cast<std::uint8_t>(Opcode::Halt),
    };

    Machine machine;
    expect(machine.load_program(program), "program should load");
    expect(machine.run(1) == MachineStatus::Faulted, "budget should stop execution");
    expect_fault_only(machine, FaultCode::StepLimitExceeded, 1, 0,
                      "budget exhaustion is reported as a fault event at the next PC");
}

void test_reset_clears_events() {
    Machine machine;
    expect(machine.load_program(std::vector<std::uint8_t>{static_cast<std::uint8_t>(Opcode::Halt)}),
           "program should load");
    static_cast<void>(machine.step());
    expect(!machine.last_events().empty(), "HALT produced events");
    machine.reset();
    expect(machine.last_events().empty(), "reset clears the event log");
}

struct EventTotals final {
    std::uint64_t fetched = 0;
    std::uint64_t reads = 0;
    std::uint64_t read_bytes = 0;
    std::uint64_t writes = 0;
    std::uint64_t written_bytes = 0;
    std::uint64_t retired = 0;
    std::uint64_t halts = 0;
    std::uint64_t faults = 0;
};

void accumulate(EventTotals& totals, const Machine& machine) {
    for (const auto& event : machine.last_events()) {
        switch (event.kind) {
            case EventKind::InstructionFetch: totals.fetched += event.size; break;
            case EventKind::MemoryRead: ++totals.reads; totals.read_bytes += event.size; break;
            case EventKind::MemoryWrite: ++totals.writes; totals.written_bytes += event.size; break;
            case EventKind::InstructionRetired: ++totals.retired; break;
            case EventKind::Halted: ++totals.halts; break;
            case EventKind::Faulted: ++totals.faults; break;
            case EventKind::RegisterWrite: break;
        }
    }
}

void expect_events_match_telemetry(Machine& machine, const std::string_view label) {
    EventTotals totals;
    for (int guard = 0; guard < 100'000; ++guard) {
        const auto result = machine.step();
        accumulate(totals, machine);
        if (result.status == MachineStatus::Halted || result.status == MachineStatus::Faulted) {
            break;
        }
    }

    const auto snapshot = machine.snapshot();
    const auto& t = snapshot.telemetry;
    expect(snapshot.status == MachineStatus::Halted || snapshot.status == MachineStatus::Faulted, label);
    expect(totals.fetched == t.instruction_bytes, label);
    expect(totals.reads == t.loads && totals.read_bytes == t.data_bytes_read, label);
    expect(totals.writes == t.stores && totals.written_bytes == t.data_bytes_written, label);
    expect(totals.retired == t.instructions_retired, label);
    expect(totals.fetched + totals.read_bytes + totals.written_bytes == t.bytes_moved(), label);
    expect(totals.halts == (snapshot.status == MachineStatus::Halted ? 1U : 0U), label);
    expect(totals.faults == (snapshot.status == MachineStatus::Faulted ? 1U : 0U), label);
}

void test_events_match_telemetry() {
    for (const auto& experiment : pexis::machine::experiments()) {
        Machine machine;
        expect(machine.load_program(experiment.program, experiment.load_address), "experiment should load");
        expect_events_match_telemetry(machine, experiment.id);
    }

    // A program without HALT slides through zeroed RAM (NOP) until it fetches
    // the data it stored itself as an opcode: instructions and data share RAM.
    Machine machine(MachineConfig{32});
    std::vector<std::uint8_t> program;
    emit_mov(program, 2, 5);
    emit_store(program, 2, 24);
    expect(machine.load_program(program), "program should load");
    expect_events_match_telemetry(machine, "events must match telemetry through a NOP slide and fault");
    expect(machine.snapshot().fault == FaultCode::InvalidOpcode, "stored data 0x05 is fetched as an invalid opcode");
    expect(machine.snapshot().pc == 24, "the fault happens at the stored data");

    Machine slide(MachineConfig{8});
    expect(slide.load_program(std::vector<std::uint8_t>{static_cast<std::uint8_t>(Opcode::Nop)}), "program should load");
    expect_events_match_telemetry(slide, "events must match telemetry through a pure NOP slide");
    expect(slide.snapshot().fault == FaultCode::TruncatedInstruction, "a NOP slide ends past the end of RAM");
}

// ---------------------------------------------------------------------------
// M1: program encoding, disassembly, experiments
// ---------------------------------------------------------------------------

void test_program_builder_matches_reference_encoding() {
    std::vector<std::uint8_t> reference;
    emit_mov(reference, 0, 0x1122334455667788ULL);
    emit_store(reference, 0, 256);
    emit_load(reference, 1, 256);
    emit_add(reference, 1, 0);
    reference.push_back(static_cast<std::uint8_t>(Opcode::Nop));
    reference.push_back(static_cast<std::uint8_t>(Opcode::Halt));

    pexis::machine::ProgramBuilder builder;
    builder.mov_imm64(0, 0x1122334455667788ULL).store64(0, 256).load64(1, 256).add(1, 0).nop().halt();
    expect(builder.bytes() == reference, "ProgramBuilder must match the independent reference encoder");
}

void test_disassembly_text() {
    const auto* scalar = pexis::machine::find_experiment("scalar-compute");
    const auto* transfer = pexis::machine::find_experiment("memory-transfer");
    expect(scalar != nullptr && transfer != nullptr, "core experiments exist");
    expect(pexis::machine::find_experiment("gpu-vector-add") == nullptr, "no fake GPU experiment exists");

    Machine machine;
    expect(machine.load_program(scalar->program), "scalar should load");
    auto listing = pexis::machine::disassemble(machine.memory(), 0, scalar->program.size());
    expect(listing.size() == 4, "scalar listing has four instructions");
    expect(listing[0].text == "MOV R0, 40", "scalar line 1");
    expect(listing[1].text == "MOV R1, 2", "scalar line 2");
    expect(listing[2].text == "ADD R0, R1", "scalar line 3");
    expect(listing[3].text == "HALT", "scalar line 4");

    expect(machine.load_program(transfer->program), "transfer should load");
    listing = pexis::machine::disassemble(machine.memory(), 0, transfer->program.size());
    expect(listing.size() == 4, "transfer listing has four instructions");
    expect(listing[0].text == "MOV R0, 0x0123456789ABCDEF", "transfer line 1");
    expect(listing[1].text == "STORE [0x0100], R0", "transfer line 2");
    expect(listing[2].text == "LOAD R1, [0x0100]", "transfer line 3");
    expect(listing[3].text == "HALT", "transfer line 4");

    expect(machine.load_program(std::vector<std::uint8_t>{0xAB, 0x00}), "invalid program should load");
    listing = pexis::machine::disassemble(machine.memory(), 0, 2);
    expect(listing.size() == 1, "disassembly stops at the first invalid opcode");
    expect(listing[0].status == pexis::machine::DecodeStatus::InvalidOpcode, "invalid opcode is flagged");
    expect(listing[0].text == ".byte 0xAB", "invalid opcode is shown as raw data");

    Machine small(MachineConfig{16});
    expect(small.load_program(std::vector<std::uint8_t>{static_cast<std::uint8_t>(Opcode::Load64)}, 12),
           "truncated program should load");
    listing = pexis::machine::disassemble(small.memory(), 12, 4);
    expect(listing.size() == 1 && listing[0].status == pexis::machine::DecodeStatus::Truncated,
           "a truncated instruction is flagged, never read past the end of RAM");
}

void test_disassembly_matches_execution() {
    for (const auto& experiment : pexis::machine::experiments()) {
        Machine machine;
        expect(machine.load_program(experiment.program, experiment.load_address), "experiment should load");
        const auto listing = pexis::machine::disassemble(machine.memory(), experiment.load_address,
                                                         experiment.program.size());

        for (const auto& line : listing) {
            const auto result = machine.step();
            const auto events = machine.last_events();
            expect(!events.empty() && events[0].kind == EventKind::InstructionFetch,
                   "every executed listing line starts with a fetch");
            expect(events[0].address == line.address, "listing address must match executed PC");
            expect(events[0].size == line.length, "listing length must match fetched bytes");
            if (result.status == MachineStatus::Halted || result.status == MachineStatus::Faulted) {
                break;
            }
        }
    }
}

void test_experiments_outcomes() {
    const auto run_experiment = [](const std::string_view id) {
        const auto* experiment = pexis::machine::find_experiment(id);
        expect(experiment != nullptr, "experiment exists");
        Machine machine;
        expect(machine.load_program(experiment->program, experiment->load_address), "experiment should load");
        static_cast<void>(machine.run(1'000));
        return machine.snapshot();
    };

    auto snapshot = run_experiment("scalar-compute");
    expect(snapshot.status == MachineStatus::Halted && snapshot.registers[0] == 42, "Scalar Compute yields R0 = 42");

    snapshot = run_experiment("memory-transfer");
    expect(snapshot.status == MachineStatus::Halted, "Memory Transfer halts");
    expect(snapshot.registers[1] == 0x0123456789ABCDEFULL, "Memory Transfer loads the stored value");
    expect(snapshot.telemetry.loads == 1 && snapshot.telemetry.stores == 1, "Memory Transfer moves data both ways");
    expect(snapshot.telemetry.bytes_moved() == 47, "Memory Transfer moves 31 instruction + 16 data bytes");

    snapshot = run_experiment("bounds-fault");
    expect(snapshot.status == MachineStatus::Faulted, "Bounds Fault faults");
    expect(snapshot.fault == FaultCode::MemoryOutOfBounds, "Bounds Fault reports the memory bound");
    expect(snapshot.pc == 10, "Bounds Fault stops at the faulting LOAD");
    expect(snapshot.registers[1] == 0, "Bounds Fault never writes the destination register");
    expect(snapshot.telemetry.instructions_retired == 1, "only the MOV retires");
}

} // namespace

int main() {
    test_mov_add_halt();
    test_load_store_telemetry();
    test_invalid_register_fault_is_fail_closed();
    test_out_of_bounds_load_fault();
    test_truncated_instruction_at_memory_boundary();
    test_run_step_limit();
    test_mov_and_add_events();
    test_store_emits_memory_write_and_load_emits_memory_read();
    test_halt_events_and_post_halt_step();
    test_fault_events_have_no_false_architectural_effects();
    test_run_budget_fault_event();
    test_reset_clears_events();
    test_events_match_telemetry();
    test_program_builder_matches_reference_encoding();
    test_disassembly_text();
    test_disassembly_matches_execution();
    test_experiments_outcomes();

    std::cout << "PASS: all Pexis Machine tests\n";
    return 0;
}
