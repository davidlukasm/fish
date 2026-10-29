#include "mutations.hh"
#include "constants.hh"
#include <stdexcept>
namespace evolution {
std::mt19937 generator{std::random_device{}()};
std::uniform_real_distribution<float> random_weight_distribution{WEIGHT_MIN, WEIGHT_MAX};
std::uniform_int_distribution<int> random_node_type_distribution{0, NODE_TYPES - 1};
void seed(std::uint32_t value) {
  generator.seed(value);
}
bool with_probability(float p) {
  return std::uniform_real_distribution<float>(0.f, 1.f)(generator) < p;
}
std::size_t random_index(std::size_t size) {
  if (!size)
    throw std::invalid_argument("random choice from an empty set");
  return std::uniform_int_distribution<std::size_t>(0, size - 1)(generator);
}
}
