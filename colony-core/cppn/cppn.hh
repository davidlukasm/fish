#pragma once
#include "output_schema.hh"
#include "evolution/genome.hh"
#include "ann/network.hh"
#include <memory>
#include <iosfwd>
#include <array>
#include <cmath>
namespace cppn {
// One cell network, queried by zone, local position, side and hormone effect.
namespace output {
inline constexpr unsigned receptor_mask = (1u << capacity) | (1u << field_width) |
                                          (1u << threshold) | (1u << quality1) | (1u << quality2) |
                                          (1u << quality_width);
inline constexpr unsigned cell_mask = (1u << count) - 1;
}
constexpr int INPUTS = 10, BIAS = 9, OUTPUTS = output::count;
constexpr unsigned ALL_OUTPUTS = (1u << OUTPUTS) - 1;
struct Point {
  int zone = 0;
  float u = 0, v = 0, w = 0, side = -1, effect = 0;
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
          p.effect};
}
struct WorkAlias {
  int source;
  float multiplier;
  bool relay;
};
class CPPN {
  std::unique_ptr<ann::Network> net;
  std::shared_ptr<evolution::Genome> genes;
  std::vector<float> input_buffer, output_buffer;
  std::map<int, WorkAlias> work_aliases;

public:
  explicit CPPN(std::shared_ptr<evolution::Genome>);
  ~CPPN();
  CPPN(const CPPN &) = delete;
  CPPN &operator=(const CPPN &) = delete;
  void reset();
  std::size_t outputs() const { return output_count; }
  std::shared_ptr<evolution::Genome> genome() const { return genes; }
  ann::Network::Compiled compiled() const { return net->compiled(); }
  const auto &aliases() const { return work_aliases; }

private:
  std::size_t output_count = 0;
  std::size_t input_count = INPUTS;

public:
  const std::vector<float> &query_view(const Point &);
};
}
