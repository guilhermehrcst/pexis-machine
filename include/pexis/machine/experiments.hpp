#pragma once

#include <cstdint>
#include <span>
#include <string_view>
#include <vector>

namespace pexis::machine {

// A runnable workload: real program bytes plus a description. Experiments are
// defined once, in C++, and consumed by tests and by the WebAssembly adapter,
// so the Web Lab cannot show a program different from the one it executes.
struct Experiment final {
    std::string_view id;
    std::string_view title;
    std::string_view summary;
    std::uint64_t load_address = 0;
    std::vector<std::uint8_t> program;
};

// Catalog order is presentation order.
[[nodiscard]] std::span<const Experiment> experiments();

// Returns nullptr when the id is unknown.
[[nodiscard]] const Experiment* find_experiment(std::string_view id);

} // namespace pexis::machine
