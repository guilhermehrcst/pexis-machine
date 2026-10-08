#include "pexis/machine/experiments.hpp"

#include <array>

#include "pexis/machine/program.hpp"

namespace pexis::machine {

namespace {

constexpr std::uint64_t kTransferAddress = 0x0100;
constexpr std::uint64_t kTransferValue = 0x0123456789ABCDEFULL;

// One past the end of the default 64 KiB RAM: guaranteed out of bounds.
constexpr std::uint64_t kOutOfBoundsAddress = 64ULL * 1024ULL;

std::array<Experiment, 3> build_catalog() {
    return {
        Experiment{
            "scalar-compute",
            "Scalar Compute",
            "Two immediates are added inside the CPU. Only instruction bytes move.",
            0,
            ProgramBuilder{}.mov_imm64(0, 40).mov_imm64(1, 2).add(0, 1).halt().bytes(),
        },
        Experiment{
            "memory-transfer",
            "Memory Transfer",
            "A 64-bit value is stored to RAM and loaded back into another register.",
            0,
            ProgramBuilder{}
                .mov_imm64(0, kTransferValue)
                .store64(0, kTransferAddress)
                .load64(1, kTransferAddress)
                .halt()
                .bytes(),
        },
        Experiment{
            "bounds-fault",
            "Bounds Fault",
            "A load past the end of RAM. The machine faults closed and nothing retires.",
            0,
            ProgramBuilder{}.mov_imm64(0, 1).load64(1, kOutOfBoundsAddress).halt().bytes(),
        },
    };
}

} // namespace

std::span<const Experiment> experiments() {
    static const auto catalog = build_catalog();
    return catalog;
}

const Experiment* find_experiment(const std::string_view id) {
    for (const auto& experiment : experiments()) {
        if (experiment.id == id) {
            return &experiment;
        }
    }
    return nullptr;
}

} // namespace pexis::machine
