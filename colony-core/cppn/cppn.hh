#pragma once
#include "output_schema.hh"
#include "evolution/genome.hh"
#include "ann/network.hh"
#include <memory>
#include <iosfwd>
#include <array>
#include <cmath>
namespace cppn {
using OutputMask = std::uint64_t;
namespace output {
inline constexpr int mean_count = synapse_strength + 1;
inline constexpr OutputMask spread_mask(OutputMask mask) {
  return mask | (1ull << spread_physiology) | (1ull << spread_receptors) |
         (1ull << spread_development) | (1ull << spread_contacts);
}
inline constexpr OutputMask receptor_means =
    (1u << capacity) | (1u << field_width) | (1u << time_constant) | (1u << threshold) |
    (1u << quality1) | (1u << quality2) | (1u << quality_width);
inline constexpr OutputMask receptor_mask = spread_mask(receptor_means);
inline constexpr OutputMask contact_mask = spread_mask(
    (1ull << expression) | (1ull << receiver1) | (1ull << receiver2) | (1ull << search_width));
inline constexpr OutputMask property_mask =
    spread_mask((1ull << time_constant) | (1ull << synapse_strength));
inline constexpr OutputMask cell_mask = (1ull << count) - 1;
}
constexpr int INPUTS = 12, BIAS = 11, OUTPUTS = output::count;
namespace input {
constexpr int zone = 0, zones = 4, u = 4, v = 5, w = 6, side = 7, effect = 8, field = 9,
              property = 10;
}
constexpr OutputMask ALL_OUTPUTS = (1ull << OUTPUTS) - 1;
constexpr std::size_t BATCH = 64;
namespace property {
inline constexpr float cell = 0, learning = .5f, teaching = 1;
}
struct Point {
  int zone = 0;
  float u = 0, v = 0, w = 0, side = -1, effect = 0, field = 0, property = 0;
};
inline std::array<float, INPUTS - 1> cell_inputs(const Point &p) {
  return {float(p.zone == 0),
          float(p.zone == 1),
          float(p.zone == 2),
          float(p.zone == 3),
          p.u,
          p.v,
          p.w,
          p.side,
          p.effect,
          p.field,
          p.property};
}
struct WorkAlias {
  int source;
  float multiplier;
  bool relay;
};
enum class Preparation { Immediate, Deferred };
class CPPN {
  struct PreparationState;
  std::unique_ptr<PreparationState> preparation;
  std::unique_ptr<ann::Network> net;
  std::shared_ptr<evolution::Genome> genes;
  std::vector<float> input_buffer, output_buffer;
  std::map<int, WorkAlias> work_aliases;

public:
  explicit CPPN(std::shared_ptr<evolution::Genome>, Preparation = Preparation::Immediate);
  // Consumes deterministic node/edge work; the immediate constructor uses this same path.
  bool prepare(std::size_t &budget);
  bool prepared() const { return bool(net); }
  ~CPPN();
  CPPN(const CPPN &) = delete;
  CPPN &operator=(const CPPN &) = delete;
  void reset();
  std::size_t outputs() const { return output_count; }
  std::shared_ptr<evolution::Genome> genome() const { return genes; }
  std::shared_ptr<const ann::Network::Compiled> compiled() const { return net->compiled(); }
  const auto &aliases() const { return work_aliases; }

private:
  std::size_t output_count = 0;
  std::size_t input_count = INPUTS;

public:
  const std::vector<float> &query_view(const Point &);
};
}
