#pragma once
#include "environment.hh"
namespace fishsim {
std::array<double, 3> plant_organ_color(const SurfacePatch &, int);
void release_organ(PlantOrgan &, double cut = 0);
// The part of a cubic curve up to t, with the same split as bites.
std::array<Point, 4> lower_curve(std::array<Point, 4>, double t);
}
