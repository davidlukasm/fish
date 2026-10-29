#pragma once
#include "environment.hh"
#include <map>
namespace fishsim {
struct WaterborneSample {
  std::array<std::size_t, 4> index{};
  std::array<double, 4> weight{};
};
WaterborneSample waterborne_sample(const Field &, double, double);
bool waterborne_path(const Field &, double, double, double, double);
struct WaterborneTransport {
  const Field &field;
  std::vector<Point> velocity;
  std::vector<unsigned char> sampled;
  std::vector<unsigned char> water;
  std::vector<unsigned char> clear_samples;
  double diffusion_rate;
  explicit WaterborneTransport(const Field &, double);
  WaterborneSample sample(double, double);
  Point flow(std::size_t);
  std::array<std::pair<std::size_t, double>, 4> destinations(std::size_t);
  int neighbor(int, int) const;
  bool wet(std::size_t);
  bool linked(std::size_t, int);
  std::map<std::uint32_t, double> advance(const std::map<std::uint32_t, double> &);
};
}
