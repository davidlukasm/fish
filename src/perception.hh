#pragma once
#include "body.hh"
#include "brain_interface.hh"
namespace fishsim {
struct Genome;
struct Field;
struct VisualObject;
std::vector<VisualObject> visual_objects(const Body &, const Genome &, const Field &,
                                         bool filtered = true, bool deferred = false,
                                         std::array<VisualEye, 2> *origins = nullptr);
float visual_stimulus(const Body &, const BrainInterface::Receptor &, const Field &,
                      const std::vector<VisualObject> &);
std::vector<float> visual_stimuli(const Body &, const Genome &, const Field &,
                                  const std::vector<VisualObject> *prepared = nullptr);
void sense_generated(Body &, const Genome &, const Field &,
                     const std::vector<VisualObject> *objects = nullptr,
                     bool advance_adaptation = true, const PhysiologyParameters & = {});
bool bite_reaches(const Body &, const Field &, double, double, double, double, double radius,
                  double reach = -1);
void settle_energy(Body &, bool protected_life = false);
int behavior_niche(double speed, double turn, double pauses);
}
