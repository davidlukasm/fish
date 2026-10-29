#pragma once
#include "simulation_types.hh"
#include <random>
#include <stdexcept>
namespace fishsim {
struct Rng {
  std::mt19937_64 engine;
  explicit Rng(std::uint64_t seed) : engine(seed) {}
  double uniform(double a = 0, double b = 1) {
    return a + (b - a) * std::generate_canonical<double, 53>(engine);
  }
  double normal() {
    double u = std::max(1e-12, uniform());
    return std::sqrt(-2 * std::log(u)) * std::cos(2 * PI * uniform());
  }
  int index(int n) {
    if (n <= 0)
      throw std::invalid_argument("Positive Auswahlgröße erforderlich");
    return int(engine() % n);
  }
};
}
