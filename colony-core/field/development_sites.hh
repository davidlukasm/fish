#pragma once
#include "cppn/cppn.hh"
#include "functions.hh"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <stdexcept>

namespace field {
inline constexpr double MIN_RANGE = .1;
inline constexpr int IDENTITY_CORNERS = 4, IDENTITY_VARIANTS = 2;
// The same fixed developmental sites and organ constraints are used by the
// evolving substrate and the manual-design editor.
inline cppn::Point development_site(std::size_t index) {
  constexpr std::array<std::array<int, 3>, cppn::input::zones> sizes{
      {{4, 3, 2}, {4, 4, 3}, {4, 4, 3}, {5, 4, 3}}};
  for (int zone = 0; zone < cppn::input::zones; ++zone) {
    const auto &n = sizes[zone];
    const std::size_t count = 2 * n[0] * n[1] * n[2];
    if (index >= count) {
      index -= count;
      continue;
    }
    const float side = index % 2 ? 1.f : -1.f;
    index /= 2;
    const float w = float(index % n[2]) / (n[2] - 1);
    index /= n[2];
    const float v = float(index % n[1]) / (n[1] - 1);
    index /= n[1];
    return {zone, float(index) / (n[0] - 1), v, w, side, 0};
  }
  throw std::out_of_range("cell site");
}

inline bool development_surface(const cppn::Point &p) {
  return 1 - std::max(p.w, std::abs(2 * p.v - 1)) < .5f;
}

inline int development_function(const cppn::Point &p, Role role, int corner, int variant) {
  constexpr int none = -1;
  const bool surface = development_surface(p);
  if (role == Role::Nerve)
    return 0;
  if (role == Role::Sensor) {
    if (corner == 0)
      return p.zone == 1 ? (variant ? Proximity : Light) : none;
    if (corner == 1)
      return surface ? Flow : none;
    if (corner == 2)
      return surface ? Odor : p.zone == 0 ? none : p.zone == 1 ? Blood : Intake;
    return variant ? Damage : surface ? Touch : InnerPressure;
  }
  if (corner == 0) {
    constexpr int muscle[cppn::input::zones] = {Aggression, Suction, Turn, Forward};
    return muscle[p.zone];
  }
  if (corner == 1)
    return surface ? Defense : none;
  if (corner == 3)
    return surface ? Pigment : none;
  return p.zone == 0 ? none : p.zone == 1 ? Gland : p.zone == 2 ? Bladder : variant ? Sperm : Eggs;
}
} // namespace field
