#pragma once
#include "body.hh"
#include "environment.hh"
#include "perception.hh"
#include "physiology_parameters.hh"
namespace fishsim {
void move_body(Body &, const Field *, const PhysiologyParameters &, bool protected_life = false);
void limit_swimming(Body &, const Field &, const PhysiologyParameters &);
void advance_body(Body &, const Genome &, const Field *, const PhysiologyParameters &,
                  bool protected_life = false);
}
