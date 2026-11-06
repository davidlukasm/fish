#pragma once
#include "brain_interface.hh"
namespace field {
class Substrate;
}
namespace fishsim {
void prepare_body_geometry(BrainInterface &);
// Where an eye of this side sits for a mean longitudinal place of its light cells (0 tail end,
// 1 front, as in its organ form): on the outline of face and skull, in body units from the
// body's center. The body itself places eyes so; the Atelier asks it for every possible place.
std::array<double, 2> eye_seat(const BrainInterface &, int side, double place);
void prepare_zonal_geometry(field::Substrate &);
void prepare_eye_shape(BrainInterface &);
double chest_width(double trunk, double shoulder,
                   const std::array<double, field::PLAN_POINTS> &chest);
double hind_width(double trunk, const std::array<double, field::PLAN_POINTS> &torso);
double join_width(double chest, double hind);
}
