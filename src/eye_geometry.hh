#pragma once
#include "brain_interface.hh"
namespace field {
class Substrate;
}
namespace fishsim {
void prepare_body_geometry(BrainInterface &);
void prepare_zonal_geometry(field::Substrate &);
void prepare_eye_shape(BrainInterface &);
// Widths of the chest and hind sections and of the joint between them.
double chest_width(double trunk, double shoulder,
                   const std::array<double, field::PLAN_POINTS> &chest);
double hind_width(double trunk, const std::array<double, field::PLAN_POINTS> &torso);
double join_width(double chest, double hind);
}
