#pragma once
#include "output_schema.hh"
#include "evolution/genome.hh"
#include "ann/network.hh"
#include <memory>
#include <iosfwd>
#include <array>
#include <cmath>
namespace cppn {
// Outputs of the fish CPPN (names in output_schema.hh). Cell query: placement field (the group
// moves toward its extremum within its grid cube), expression, identity (role + 4 values), the cell
// parameters, whose meaning depends on the role (field/substrate.hh), and the sender and receiver
// markers. Link query: per connection kind (sense -> nerve, nerve -> nerve, nerve -> effector) a
// pair of weight (binding strength) and connection expression (LEO).
namespace output {
inline constexpr int link_kinds = 3;
inline constexpr int branches = 2 + link_kinds;
inline constexpr std::size_t cell_outputs = sense_nerve_weight;
inline constexpr std::size_t link_weight(int kind) {
  return cell_outputs + 2 * std::size_t(kind);
}
inline constexpr std::size_t link_expression(int kind) {
  return link_weight(kind) + 1;
}
// CPPN branch of an output port: 0 body plan, 1 cell parameters, 2 + kind for the link outputs of a
// kind
inline constexpr int branch(std::size_t port) {
  return port >= cell_outputs                      ? 2 + int((port - cell_outputs) / 2)
         : port >= threshold && port <= plasticity ? 1
                                                   : 0;
}
inline constexpr unsigned cell_mask = (1u << cell_outputs) - 1;
inline constexpr unsigned link_mask(int kind) {
  return 3u << link_weight(kind);
}
static_assert(link_weight(link_kinds - 1) + 2 == count, "link outputs close the output list");
}
// Inputs: x, y of both points, their distance, z of both, the differences (target - source), the
// side product x_source * x_target (> 0 same side, < 0 across the midline), |x_source| + |x_target|
// two sender(source) * receiver(target) products (zero in cell queries), and the bias.
constexpr int INPUTS = 15;
constexpr int MATCH = 12;
constexpr int BIAS = INPUTS - 1;
constexpr int OUTPUTS = output::count;
constexpr unsigned ALL_OUTPUTS = (1u << OUTPUTS) - 1;
inline std::array<float, INPUTS - 1> geometry_inputs(float a, float b, float z, float c, float d,
                                                     float w, float match1 = 0, float match2 = 0) {
  return {a,
          b,
          c,
          d,
          std::sqrt((a - c) * (a - c) + (b - d) * (b - d) + (z - w) * (z - w)),
          z,
          w,
          c - a,
          d - b,
          w - z,
          a * c, // side product
          std::abs(a) + std::abs(c),
          match1,
          match2};
}
class CPPN {
  std::unique_ptr<ann::Network> net;
  std::vector<float> input_buffer, output_buffer;

public:
  explicit CPPN(std::shared_ptr<evolution::Genome>);
  ~CPPN();
  CPPN(const CPPN &) = delete;
  CPPN &operator=(const CPPN &) = delete;
  void reset();
  std::size_t outputs() const { return output_count; }
  ann::Network::Compiled compiled() const { return net->compiled(); }

private:
  std::size_t output_count = 0;
  std::size_t input_count = INPUTS;

public:
  const std::vector<float> &query_view(float x1, float y1, float z1, float x2, float y2, float z2,
                                       float match1 = 0, float match2 = 0);
};
}
