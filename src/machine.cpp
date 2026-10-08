#include "pexis/machine/machine.hpp"

#include <algorithm>

namespace pexis::machine {

Machine::Machine(const MachineConfig config) : memory_(config.memory_size_bytes) {}

void Machine::reset() noexcept {
    memory_.clear();
    registers_.fill(0);
    pc_ = 0;
    status_ = MachineStatus::Ready;
    fault_ = FaultCode::None;
    telemetry_ = {};
    event_count_ = 0;
}

bool Machine::load_program(const std::span<const std::uint8_t> program,
                           const std::uint64_t address) noexcept {
    reset();
    if (!memory_.write(address, program)) {
        status_ = MachineStatus::Faulted;
        fault_ = FaultCode::MemoryOutOfBounds;
        return false;
    }

    pc_ = address;
    return true;
}

bool Machine::fetch8(std::uint64_t& cursor, std::uint8_t& value) noexcept {
    if (!memory_.read8(cursor, value)) {
        return false;
    }
    ++telemetry_.instruction_bytes;
    ++cursor;
    return true;
}

bool Machine::fetch64(std::uint64_t& cursor, std::uint64_t& value) noexcept {
    value = 0;
    for (std::size_t i = 0; i < sizeof(std::uint64_t); ++i) {
        std::uint8_t byte = 0;
        if (!fetch8(cursor, byte)) {
            return false;
        }
        value |= static_cast<std::uint64_t>(byte) << (i * 8U);
    }
    return true;
}

bool Machine::valid_register(const std::uint8_t index) const noexcept {
    return index < registers_.size();
}

void Machine::emit(const MachineEvent& event) noexcept {
    // The bound is structural (see kMaxEventsPerStep); never write past it.
    if (event_count_ < events_.size()) {
        events_[event_count_++] = event;
    }
}

StepResult Machine::fault(const FaultCode code, const std::uint64_t pc_before) noexcept {
    status_ = MachineStatus::Faulted;
    fault_ = code;
    emit(MachineEvent{EventKind::Faulted, code, kNoRegister, 0, pc_before, 0});
    return StepResult{status_, fault_, pc_before, pc_};
}

void Machine::retire(const std::uint64_t next_pc) noexcept {
    emit(MachineEvent{EventKind::InstructionRetired, FaultCode::None, kNoRegister, 0, pc_, next_pc});
    pc_ = next_pc;
    ++telemetry_.instructions_retired;
    ++telemetry_.cycles;
}

StepResult Machine::step() noexcept {
    const auto pc_before = pc_;
    event_count_ = 0;

    if (status_ == MachineStatus::Halted || status_ == MachineStatus::Faulted) {
        return StepResult{status_, fault_, pc_before, pc_};
    }

    status_ = MachineStatus::Running;
    const auto fetched_before = telemetry_.instruction_bytes;
    const auto result = execute(pc_before);

    // Instruction bytes are fetched before any data access of the same
    // instruction, so the fetch event is placed first. Its size is the exact
    // telemetry delta, including bytes fetched by a faulting instruction.
    const auto fetched = telemetry_.instruction_bytes - fetched_before;
    if (fetched > 0 && event_count_ < events_.size()) {
        std::copy_backward(events_.begin(),
                           events_.begin() + static_cast<std::ptrdiff_t>(event_count_),
                           events_.begin() + static_cast<std::ptrdiff_t>(event_count_ + 1));
        events_[0] = MachineEvent{EventKind::InstructionFetch, FaultCode::None, kNoRegister,
                                  static_cast<std::uint32_t>(fetched), pc_before, 0};
        ++event_count_;
    }

    return result;
}

StepResult Machine::execute(const std::uint64_t pc_before) noexcept {
    std::uint64_t cursor = pc_;
    std::uint8_t opcode_byte = 0;
    if (!fetch8(cursor, opcode_byte)) {
        return fault(FaultCode::TruncatedInstruction, pc_before);
    }

    const auto opcode = static_cast<Opcode>(opcode_byte);
    switch (opcode) {
        case Opcode::Nop: {
            retire(cursor);
            break;
        }

        case Opcode::MovImm64: {
            std::uint8_t destination = 0;
            if (!fetch8(cursor, destination)) {
                return fault(FaultCode::TruncatedInstruction, pc_before);
            }
            if (!valid_register(destination)) {
                return fault(FaultCode::InvalidRegister, pc_before);
            }

            std::uint64_t immediate = 0;
            if (!fetch64(cursor, immediate)) {
                return fault(FaultCode::TruncatedInstruction, pc_before);
            }

            registers_[destination] = immediate;
            emit(MachineEvent{EventKind::RegisterWrite, FaultCode::None, destination, 0, 0, immediate});
            retire(cursor);
            break;
        }

        case Opcode::Load64: {
            std::uint8_t destination = 0;
            if (!fetch8(cursor, destination)) {
                return fault(FaultCode::TruncatedInstruction, pc_before);
            }
            if (!valid_register(destination)) {
                return fault(FaultCode::InvalidRegister, pc_before);
            }

            std::uint64_t address = 0;
            if (!fetch64(cursor, address)) {
                return fault(FaultCode::TruncatedInstruction, pc_before);
            }

            std::uint64_t value = 0;
            if (!memory_.read64(address, value)) {
                return fault(FaultCode::MemoryOutOfBounds, pc_before);
            }

            registers_[destination] = value;
            ++telemetry_.loads;
            telemetry_.data_bytes_read += sizeof(std::uint64_t);
            emit(MachineEvent{EventKind::MemoryRead, FaultCode::None, destination,
                              sizeof(std::uint64_t), address, value});
            emit(MachineEvent{EventKind::RegisterWrite, FaultCode::None, destination, 0, 0, value});
            retire(cursor);
            break;
        }

        case Opcode::Store64: {
            std::uint8_t source = 0;
            if (!fetch8(cursor, source)) {
                return fault(FaultCode::TruncatedInstruction, pc_before);
            }
            if (!valid_register(source)) {
                return fault(FaultCode::InvalidRegister, pc_before);
            }

            std::uint64_t address = 0;
            if (!fetch64(cursor, address)) {
                return fault(FaultCode::TruncatedInstruction, pc_before);
            }

            if (!memory_.write64(address, registers_[source])) {
                return fault(FaultCode::MemoryOutOfBounds, pc_before);
            }

            ++telemetry_.stores;
            telemetry_.data_bytes_written += sizeof(std::uint64_t);
            emit(MachineEvent{EventKind::MemoryWrite, FaultCode::None, source,
                              sizeof(std::uint64_t), address, registers_[source]});
            retire(cursor);
            break;
        }

        case Opcode::Add: {
            std::uint8_t destination = 0;
            std::uint8_t source = 0;
            if (!fetch8(cursor, destination) || !fetch8(cursor, source)) {
                return fault(FaultCode::TruncatedInstruction, pc_before);
            }
            if (!valid_register(destination) || !valid_register(source)) {
                return fault(FaultCode::InvalidRegister, pc_before);
            }

            registers_[destination] += registers_[source];
            emit(MachineEvent{EventKind::RegisterWrite, FaultCode::None, destination, 0, 0,
                              registers_[destination]});
            retire(cursor);
            break;
        }

        case Opcode::Halt: {
            retire(cursor);
            status_ = MachineStatus::Halted;
            emit(MachineEvent{EventKind::Halted, FaultCode::None, kNoRegister, 0, pc_before, 0});
            break;
        }

        default:
            return fault(FaultCode::InvalidOpcode, pc_before);
    }

    return StepResult{status_, fault_, pc_before, pc_};
}

MachineStatus Machine::run(const std::uint64_t max_instructions) noexcept {
    std::uint64_t executed = 0;
    while (status_ != MachineStatus::Halted && status_ != MachineStatus::Faulted) {
        if (executed >= max_instructions) {
            event_count_ = 0;
            static_cast<void>(fault(FaultCode::StepLimitExceeded, pc_));
            break;
        }
        static_cast<void>(step());
        ++executed;
    }
    return status_;
}

MachineSnapshot Machine::snapshot() const noexcept {
    return MachineSnapshot{status_, fault_, pc_, registers_, telemetry_};
}

const Memory& Machine::memory() const noexcept {
    return memory_;
}

std::span<const MachineEvent> Machine::last_events() const noexcept {
    return std::span<const MachineEvent>(events_.data(), event_count_);
}

} // namespace pexis::machine
