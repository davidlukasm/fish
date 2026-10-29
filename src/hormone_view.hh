#pragma once
#include "hormone_observations.hh"
#include <iosfwd>
namespace fishsim {
void write_hormone_profile(std::ostream &, const HormoneProfile &, const HormoneMoments &current);
void write_hormone_state(std::ostream &, const HormoneState &, const HormoneProfile *);
}
