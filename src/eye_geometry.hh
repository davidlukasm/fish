#pragma once
#include "brain_interface.hh"
namespace field {
class Substrate;
}
namespace fishsim {
void prepare_body_geometry(BrainInterface &);
void prepare_zonal_geometry(field::Substrate &);
void prepare_eye_shape(BrainInterface &);
}
