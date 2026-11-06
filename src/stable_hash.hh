#pragma once
#include "field/mix.hh"
#include <cstdint>
#include <cstring>
namespace fishsim {
using field::splitmix_finish;
using field::SPLITMIX_GAMMA;
using field::SPLITMIX_MIX1;
using field::unit_interval;
inline constexpr std::uint64_t FNV_OFFSET = 14695981039346656037ULL, FNV_PRIME = 1099511628211ULL;
inline std::uint64_t fnv_add(std::uint64_t h, std::uint64_t word) {
  return (h ^ word) * FNV_PRIME;
}
inline std::uint64_t fnv_add(std::uint64_t h, double value) {
  std::uint64_t bits;
  std::memcpy(&bits, &value, sizeof bits);
  return fnv_add(h, bits);
}
}
