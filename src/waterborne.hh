#pragma once
#include "environment.hh"
#include <map>
namespace fishsim {
// Bilinear samples weight the four surrounding cell centres.
inline constexpr int SAMPLE_CORNERS = 4;
// Diffusion moves at most this share of a cell to each open neighbour per step.
inline constexpr double MAX_DIFFUSION_SHARE = .2;
// The odour probe previews this many transport steps from the probe's source.
inline constexpr int ODOR_PREVIEW_STEPS = 12;
struct WaterborneSample {
  std::array<std::size_t, SAMPLE_CORNERS> index{};
  std::array<double, SAMPLE_CORNERS> weight{};
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
  std::array<std::pair<std::size_t, double>, SAMPLE_CORNERS> destinations(std::size_t);
  int neighbor(int, int) const;
  bool wet(std::size_t);
  bool linked(std::size_t, int);
  std::map<std::uint32_t, double> advance(const std::map<std::uint32_t, double> &);
};
}
