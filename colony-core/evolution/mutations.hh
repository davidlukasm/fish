#pragma once
#include <random>
#include <cstdint>
namespace evolution {
extern std::mt19937 generator;
extern std::uniform_real_distribution<float> random_weight_distribution;
extern std::uniform_int_distribution<int> random_node_type_distribution;
void seed(std::uint32_t value);
bool with_probability(float p);
std::size_t random_index(std::size_t size);
}
