#include "pexis/machine/memory.hpp"

#include <algorithm>
#include <limits>

namespace pexis::machine {

Memory::Memory(const std::size_t size_bytes) : data_(size_bytes, 0) {}

std::size_t Memory::size() const noexcept {
    return data_.size();
}

bool Memory::contains(const std::uint64_t address, const std::size_t length) const noexcept {
    if (address > static_cast<std::uint64_t>(std::numeric_limits<std::size_t>::max())) {
        return false;
    }

    const auto start = static_cast<std::size_t>(address);
    return start <= data_.size() && length <= (data_.size() - start);
}

bool Memory::read8(const std::uint64_t address, std::uint8_t& value) const noexcept {
    if (!contains(address)) {
        return false;
    }
    value = data_[static_cast<std::size_t>(address)];
    return true;
}

bool Memory::read64(const std::uint64_t address, std::uint64_t& value) const noexcept {
    if (!contains(address, sizeof(std::uint64_t))) {
        return false;
    }

    value = 0;
    const auto start = static_cast<std::size_t>(address);
    for (std::size_t i = 0; i < sizeof(std::uint64_t); ++i) {
        value |= static_cast<std::uint64_t>(data_[start + i]) << (i * 8U);
    }
    return true;
}

bool Memory::write8(const std::uint64_t address, const std::uint8_t value) noexcept {
    if (!contains(address)) {
        return false;
    }
    data_[static_cast<std::size_t>(address)] = value;
    return true;
}

bool Memory::write64(const std::uint64_t address, const std::uint64_t value) noexcept {
    if (!contains(address, sizeof(std::uint64_t))) {
        return false;
    }

    const auto start = static_cast<std::size_t>(address);
    for (std::size_t i = 0; i < sizeof(std::uint64_t); ++i) {
        data_[start + i] = static_cast<std::uint8_t>((value >> (i * 8U)) & 0xFFU);
    }
    return true;
}

bool Memory::write(const std::uint64_t address, const std::span<const std::uint8_t> bytes) noexcept {
    if (!contains(address, bytes.size())) {
        return false;
    }

    const auto start = static_cast<std::size_t>(address);
    std::copy(bytes.begin(), bytes.end(), data_.begin() + static_cast<std::ptrdiff_t>(start));
    return true;
}

void Memory::clear() noexcept {
    std::fill(data_.begin(), data_.end(), 0);
}

} // namespace pexis::machine
