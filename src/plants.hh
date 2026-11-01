#pragma once
#include "environment.hh"
namespace fishsim {
Color plant_organ_color(const SurfacePatch &, int);
void release_organ(PlantOrgan &, double cut = 0);
// The part of a cubic curve up to t, with the same split as bites.
Curve lower_curve(Curve, double t);
}
