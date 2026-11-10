#pragma once
#include "substrate.hh"
#include "development_sites.hh"
#include <algorithm>
#include <cmath>

namespace field {
inline constexpr double MIN_SEARCH = .03, MAX_SEARCH = 2;
inline double search_radius(double width) {
  return MIN_SEARCH * std::pow(MAX_SEARCH / MIN_SEARCH, width);
}
inline double search_width(double radius) {
  return std::log(radius / MIN_SEARCH) / std::log(MAX_SEARCH / MIN_SEARCH);
}
inline double spread_radius(double spread) {
  return MIN_SEARCH + spread * (MAX_SEARCH - MIN_SEARCH);
}
inline constexpr int EFFECTOR_SLOTS = 32;
inline constexpr float SLOTS_MIN = 4, SLOTS_RANGE = 128;
inline constexpr int MAX_INPUT_SLOTS = std::max(EFFECTOR_SLOTS, int(SLOTS_MIN *SLOTS_RANGE)),
                     CONTACT_LANES = 8;
inline constexpr std::size_t contact_storage(std::size_t capacity) {
  return (capacity + CONTACT_LANES - 1) / CONTACT_LANES * CONTACT_LANES;
}
inline int input_slots(Role role, float field_width) {
  return role == Role::Effector ? EFFECTOR_SLOTS
         : role == Role::Nerve
             ? int(std::lround(SLOTS_MIN *
                               std::pow(SLOTS_RANGE, std::clamp(field_width, 0.f, 1.f))))
             : 0;
}
inline int input_slots(const Neuron &cell) {
  return input_slots(cell.role, cell.parameters.field_width);
}
inline int contact_capacity(const Neuron &cell) {
  return std::min(MAX_INPUT_SLOTS, std::max<int>(cell.slots, input_slots(cell)));
}
// A stable binding core and a smooth finite falloff. The half-height remains at q = log(2).
// The flat core tolerates small mutations; zero support excludes distant senders in turnover.
inline constexpr double CONTACT_CORE = .25, CONTACT_SUPPORT = 1.1362943611198906;
inline std::size_t connection_reservation(const Substrate &s) {
  std::size_t slots = 0;
  for (const auto &cell : s.neurons)
    slots += contact_storage(contact_capacity(cell));
  return slots;
}
inline double contact_affinity(double q) {
  if (q <= CONTACT_CORE)
    return 1;
  if (q >= CONTACT_SUPPORT)
    return 0;
  const double t = std::clamp((q - CONTACT_CORE) / (CONTACT_SUPPORT - CONTACT_CORE), 0., 1.);
  return (1 - t) * (1 - t) * (1 + 2 * t);
}
inline double contact_affinity_slope(double q) {
  if (q <= CONTACT_CORE || q >= CONTACT_SUPPORT)
    return 0;
  const double t = std::clamp((q - CONTACT_CORE) / (CONTACT_SUPPORT - CONTACT_CORE), 0., 1.);
  return -6 * t * (1 - t) / (CONTACT_SUPPORT - CONTACT_CORE);
}
struct ContactParameters {
  double probability = 0, affinity = 0;
};
struct ContactScale {
  std::array<double, CONTACT_FIELDS> variance{};
  double reach;
  explicit ContactScale(const Neuron &n) {
    const double sigma = search_radius(n.search_width);
    variance[0] = 2 * sigma * sigma;
    for (int k = 1; k < CONTACT_FIELDS; ++k) {
      const auto radius = search_radius(n.reception[k - 1].width);
      variance[k] = 2 * radius * radius;
    }
    reach = MIN_RANGE + (1 - MIN_RANGE) * n.range;
  }
};
// Eight bins along each address axis keep narrow receivers local. Small populations and
// receivers covering at least half the bins use a scan, avoiding indexing overhead there.
inline constexpr std::size_t CONTACT_INDEX_SIDE = 8, CONTACT_INDEX_MIN_GROUPS = 128;
inline constexpr std::size_t CONTACT_INDEX_SCAN_DIVISOR = 2;
class ContactIndex {
  std::array<std::vector<std::uint32_t>, CONTACT_INDEX_SIDE * CONTACT_INDEX_SIDE> bins;
  static std::size_t bin(double address) {
    return std::size_t(
        std::clamp(int((address + 1) * CONTACT_INDEX_SIDE / 2), 0, int(CONTACT_INDEX_SIDE - 1)));
  }

public:
  void add(const Neuron &cell, std::uint32_t index) {
    bins[bin(cell.sender[1]) * CONTACT_INDEX_SIDE + bin(cell.sender[0])].push_back(index);
  }
  void candidates(const Neuron &target, const ContactScale &scale, std::size_t count,
                  std::vector<std::uint32_t> &result) const {
    result.clear();
    if (count < CONTACT_INDEX_MIN_GROUPS) {
      for (std::size_t i = 0; i < count; ++i)
        result.push_back(std::uint32_t(i));
      return;
    }
    for (int field = 0; field < CONTACT_FIELDS; ++field) {
      if (field && target.reception[field - 1].expression <= 0)
        continue;
      const auto &address = field ? target.reception[field - 1].address : target.receiver;
      const double radius = std::sqrt(CONTACT_SUPPORT * scale.variance[field]);
      const auto left = bin(address[0] - radius), right = bin(address[0] + radius),
                 top = bin(address[1] - radius), bottom = bin(address[1] + radius);
      if ((right - left + 1) * (bottom - top + 1) >= bins.size() / CONTACT_INDEX_SCAN_DIVISOR) {
        result.clear();
        for (std::size_t i = 0; i < count; ++i)
          result.push_back(std::uint32_t(i));
        return;
      }
      for (auto y = top; y <= bottom; ++y)
        for (auto x = left; x <= right; ++x) {
          const auto &row = bins[y * CONTACT_INDEX_SIDE + x];
          result.insert(result.end(), row.begin(), row.end());
        }
    }
    // Input selection hashes depend on cell identities; retain the canonical source order too.
    std::sort(result.begin(), result.end());
    result.erase(std::unique(result.begin(), result.end()), result.end());
  }
};
inline ContactParameters contact_parameters(const Neuron &a, const Neuron &b, double body_length,
                                            const ContactScale &sender,
                                            const ContactScale &receiver) {
  if (connection_kind(a, b) < 0)
    return {};
  double mu = 0;
  for (int field = 0; field < CONTACT_FIELDS; ++field) {
    const float expression = field ? b.reception[field - 1].expression : 1.f;
    if (expression <= 0)
      continue;
    const auto &address = field ? b.reception[field - 1].address : b.receiver;
    const double dx = a.sender[0] - address[0], dy = a.sender[1] - address[1];
    mu =
        std::max(mu, expression * contact_affinity((dx * dx + dy * dy) / receiver.variance[field]));
  }
  if (mu == 0)
    return {};
  const double side = a.x == 0 || b.x == 0
                          ? 1
                          : std::clamp(1 + (a.x * b.x < 0 ? 1 : -1) * double(a.crossing), 0., 1.);
  if (side == 0)
    return {0, mu};
  const double distance =
      std::sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) + (a.z - b.z) * (a.z - b.z)) /
      body_length;
  return {mu * side * std::exp(-distance / sender.reach), mu};
}
inline ContactParameters contact_parameters(const Neuron &a, const Neuron &b, double body_length) {
  return contact_parameters(a, b, body_length, ContactScale(a), ContactScale(b));
}
}
