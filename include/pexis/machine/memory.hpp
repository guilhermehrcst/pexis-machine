#pragma once

#include <cstddef>
#include <cstdint>
#include <span>
#include <vector>

namespace pexis::machine {

class Memory final {
public:
    explicit Memory(std::size_t size_bytes);

    [[nodiscard]] std::size_t size() const noexcept;
    [[nodiscard]] bool contains(std::uint64_t address, std::size_t length = 1) const noexcept;

    [[nodiscard]] bool read8(std::uint64_t address, std::uint8_t& value) const noexcept;
    [[nodiscard]] bool read64(std::uint64_t address, std::uint64_t& value) const noexcept;
    [[nodiscard]] bool write8(std::uint64_t address, std::uint8_t value) noexcept;
    [[nodiscard]] bool write64(std::uint64_t address, std::uint64_t value) noexcept;
    [[nodiscard]] bool write(std::uint64_t address, std::span<const std::uint8_t> bytes) noexcept;

    void clear() noexcept;

private:
    std::vector<std::uint8_t> data_;
};

} // namespace pexis::machine
