// WebAssembly adapter for the Pexis Machine Web Lab.
//
// This file is a bridge, not a model. It owns one pexis::machine::Machine and
// translates its state into plain JavaScript values. It must never implement
// instruction semantics, telemetry rules, or memory behavior of its own.
//
// Contract (ABI version 1), documented in docs/wasm-boundary.md:
//   abiVersion()             -> number
//   memorySize()             -> number
//   experiments()            -> [{ id, title, summary }]
//   loadExperiment(id)       -> boolean   (reset + load real program bytes)
//   reset()                  -> void      (reset + reload the loaded experiment)
//   step()                   -> void      (exactly one Machine::step())
//   snapshot()               -> RawSnapshot
//   lastEvents()             -> RawEvent[]
//   readMemory(addr, length) -> Uint8Array | null   (observation only)
//   program()                -> RawProgram | null    (decoded from RAM)
//
// All 64-bit quantities cross the boundary as BigInt.

#include <cmath>
#include <cstdint>
#include <string>
#include <vector>

#include <emscripten/bind.h>
#include <emscripten/val.h>

#include "pexis/machine/events.hpp"
#include "pexis/machine/experiments.hpp"
#include "pexis/machine/machine.hpp"
#include "pexis/machine/program.hpp"

namespace {

using emscripten::val;
using namespace pexis::machine;

constexpr std::uint32_t kAbiVersion = 1;
constexpr double kMaxMemoryRead = 4096.0;

val big(const std::uint64_t value) {
    return val(value);
}

// Enum names are the wire format, so a renumbered enum cannot be silently
// misread on the JavaScript side. Unknown values map to "unknown", which the
// TypeScript boundary rejects.
const char* name(const MachineStatus status) {
    switch (status) {
        case MachineStatus::Ready: return "ready";
        case MachineStatus::Running: return "running";
        case MachineStatus::Halted: return "halted";
        case MachineStatus::Faulted: return "faulted";
    }
    return "unknown";
}

const char* name(const FaultCode fault) {
    switch (fault) {
        case FaultCode::None: return "none";
        case FaultCode::InvalidOpcode: return "invalid-opcode";
        case FaultCode::InvalidRegister: return "invalid-register";
        case FaultCode::MemoryOutOfBounds: return "memory-out-of-bounds";
        case FaultCode::TruncatedInstruction: return "truncated-instruction";
        case FaultCode::StepLimitExceeded: return "step-limit-exceeded";
    }
    return "unknown";
}

const char* name(const EventKind kind) {
    switch (kind) {
        case EventKind::InstructionFetch: return "instruction-fetch";
        case EventKind::MemoryRead: return "memory-read";
        case EventKind::MemoryWrite: return "memory-write";
        case EventKind::RegisterWrite: return "register-write";
        case EventKind::InstructionRetired: return "instruction-retired";
        case EventKind::Halted: return "halted";
        case EventKind::Faulted: return "faulted";
    }
    return "unknown";
}

const char* name(const DecodeStatus status) {
    switch (status) {
        case DecodeStatus::Ok: return "ok";
        case DecodeStatus::InvalidOpcode: return "invalid-opcode";
        case DecodeStatus::Truncated: return "truncated";
    }
    return "unknown";
}

bool is_index(const double value) {
    return std::isfinite(value) && value >= 0.0 && std::floor(value) == value;
}

class WebMachine final {
public:
    std::uint32_t abiVersion() const {
        return kAbiVersion;
    }

    double memorySize() const {
        return static_cast<double>(machine_.memory().size());
    }

    val experiments() const {
        val list = val::array();
        for (const auto& experiment : pexis::machine::experiments()) {
            val item = val::object();
            item.set("id", std::string(experiment.id));
            item.set("title", std::string(experiment.title));
            item.set("summary", std::string(experiment.summary));
            list.call<void>("push", item);
        }
        return list;
    }

    // Unknown ids are rejected without touching machine state.
    bool loadExperiment(const std::string& id) {
        const auto* experiment = find_experiment(id);
        if (experiment == nullptr) {
            return false;
        }
        experiment_ = experiment;
        return machine_.load_program(experiment->program, experiment->load_address);
    }

    void reset() {
        if (experiment_ == nullptr) {
            machine_.reset();
            return;
        }
        static_cast<void>(machine_.load_program(experiment_->program, experiment_->load_address));
    }

    void step() {
        static_cast<void>(machine_.step());
    }

    val snapshot() const {
        const auto snapshot = machine_.snapshot();
        val registers = val::array();
        for (const auto value : snapshot.registers) {
            registers.call<void>("push", big(value));
        }

        const auto& t = snapshot.telemetry;
        val telemetry = val::object();
        telemetry.set("instructionsRetired", big(t.instructions_retired));
        telemetry.set("cycles", big(t.cycles));
        telemetry.set("loads", big(t.loads));
        telemetry.set("stores", big(t.stores));
        telemetry.set("instructionBytes", big(t.instruction_bytes));
        telemetry.set("dataBytesRead", big(t.data_bytes_read));
        telemetry.set("dataBytesWritten", big(t.data_bytes_written));
        telemetry.set("bytesMoved", big(t.bytes_moved()));

        val out = val::object();
        out.set("status", std::string(name(snapshot.status)));
        out.set("fault", std::string(name(snapshot.fault)));
        out.set("pc", big(snapshot.pc));
        out.set("registers", registers);
        out.set("telemetry", telemetry);
        return out;
    }

    val lastEvents() const {
        val list = val::array();
        for (const auto& event : machine_.last_events()) {
            val item = val::object();
            item.set("kind", std::string(name(event.kind)));
            item.set("fault", std::string(name(event.fault)));
            item.set("reg", static_cast<std::uint32_t>(event.reg));
            item.set("size", event.size);
            item.set("address", big(event.address));
            item.set("value", big(event.value));
            list.call<void>("push", item);
        }
        return list;
    }

    // Observation only: reads RAM without touching telemetry or events.
    // Returns null for any request that is not fully inside RAM.
    val readMemory(const double address, const double length) const {
        const auto size = memorySize();
        if (!is_index(address) || !is_index(length) || length > kMaxMemoryRead || address > size ||
            length > size - address) {
            return val::null();
        }

        const auto start = static_cast<std::uint64_t>(address);
        const auto count = static_cast<std::size_t>(length);
        std::vector<std::uint8_t> bytes(count, 0);
        for (std::size_t i = 0; i < count; ++i) {
            if (!machine_.memory().read8(start + i, bytes[i])) {
                return val::null();
            }
        }

        val out = val::global("Uint8Array").new_(count);
        out.call<void>("set", val(emscripten::typed_memory_view(bytes.size(), bytes.data())));
        return out;
    }

    // The program view is decoded from the bytes currently in RAM over the
    // loaded experiment's range, so it reflects exactly what will execute.
    val program() const {
        if (experiment_ == nullptr) {
            return val::null();
        }

        val instructions = val::array();
        for (const auto& line : disassemble(machine_.memory(), experiment_->load_address,
                                            experiment_->program.size())) {
            val item = val::object();
            item.set("address", big(line.address));
            item.set("length", line.length);
            item.set("opcode", static_cast<std::uint32_t>(line.opcode));
            item.set("status", std::string(name(line.status)));
            item.set("text", line.text);
            instructions.call<void>("push", item);
        }

        val out = val::object();
        out.set("experimentId", std::string(experiment_->id));
        out.set("base", big(experiment_->load_address));
        out.set("length", static_cast<std::uint32_t>(experiment_->program.size()));
        out.set("instructions", instructions);
        return out;
    }

private:
    Machine machine_{};
    const Experiment* experiment_ = nullptr;
};

} // namespace

EMSCRIPTEN_BINDINGS(pexis_machine) {
    emscripten::class_<WebMachine>("WebMachine")
        .constructor<>()
        .function("abiVersion", &WebMachine::abiVersion)
        .function("memorySize", &WebMachine::memorySize)
        .function("experiments", &WebMachine::experiments)
        .function("loadExperiment", &WebMachine::loadExperiment)
        .function("reset", &WebMachine::reset)
        .function("step", &WebMachine::step)
        .function("snapshot", &WebMachine::snapshot)
        .function("lastEvents", &WebMachine::lastEvents)
        .function("readMemory", &WebMachine::readMemory)
        .function("program", &WebMachine::program);
}
