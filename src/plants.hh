#pragma once
#include "environment.hh"
namespace fishsim {
std::array<double, 3> plant_organ_color(const SurfacePatch &, int);
void release_organ(PlantOrgan &, double cut = 0);
}
