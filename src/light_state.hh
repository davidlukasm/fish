#pragma once
#include <vector>
#include <cstddef>
#include <cstdint>
namespace fishsim {
struct LightState {
  int columns = 0;
  int rows = 0;
  std::vector<double> illumination;
  std::vector<double> clear_illumination;
  std::vector<double> canopy_density;
  std::vector<double> shading_density;
  std::vector<double> shading_factor;
  std::vector<unsigned char> canopy_counts;
};
}
