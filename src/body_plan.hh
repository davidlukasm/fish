#pragma once
#include "body.hh"
#include "hormone_observations.hh"
#include "brain_interface.hh"
#include "environment.hh"
namespace fishsim {
inline double visual_weight(const BrainInterface::Receptor &r, double angle) {
  if (angle < r.view_left || angle > r.view_right)
    return 0;
  if (angle <= r.angle) {
    double width = r.angle - r.view_left;
    return width > 0 ? std::clamp((angle - r.view_left) / width, 0., 1.) : 1.;
  }
  double width = r.view_right - r.angle;
  return width > 0 ? std::clamp((r.view_right - angle) / width, 0., 1.) : 1.;
}
inline double visual_area(const BrainInterface::Receptor &r, double left, double right) {
  left = std::max(left, double(r.view_left));
  right = std::min(right, double(r.view_right));
  if (right <= left)
    return 0;
  const double middle = std::clamp(double(r.angle), left, right);
  return .5 * ((middle - left) * (visual_weight(r, left) + visual_weight(r, middle)) +
               (right - middle) * (visual_weight(r, middle) + visual_weight(r, right)));
}
std::shared_ptr<const BrainInterface> anatomical_interface(const field::Substrate &);
// How densely spines stand in each body sector: each defence effector spreads its strength over
// the sectors around its direction from the body's centre, less the further from it, none
// beyond its contact width. An effector's direction is its cell's from the body's centre (0
// ahead, positive towards side +1).
double spine_aim(const BrainInterface::Effector &, const field::Substrate &);
void spread_spines(std::array<double, BODY_SECTORS> &, const BrainInterface::Effector &,
                   const field::Substrate &);
std::array<double, BODY_SECTORS> spine_density(const BrainInterface &, const field::Substrate &);
// What the pigment absorbs once all pigment cells have been fully active long enough: what it
// keeps at rest and what they spread on top until it fades as fast as they add to it.
Color held_absorption(const BrainInterface &, const PhysiologyParameters &);
// How well spines raised to `defense` shield the body at `relative` radians from ahead (positive
// towards side +1): in proportion to their density there against their mean, at most fully.
double local_defense(double defense, const std::array<double, BODY_SECTORS> &density,
                     double relative);
bool has_required_organs(const field::Substrate &);
struct SensoryFrame {
  std::array<Point, 4> positions{}, relative{};
  std::array<double, 4> buried{};
  std::array<double, BODY_SECTORS> touch{}, impact_ring{};
  bool contact_ring = false;
  double satiety = 0, radius = 0, energy = 0, nutrient = 0, injury = 0, depth = 0, impact = 0,
         contact = 0, gonad = 0, sperm = 0;
  Point normal{};
};
SensoryFrame prepare_sensory_frame(const Body &, const BrainInterface &, const Field &,
                                   double gonad = 0);
SensoryFrame prepare_sensory_frame(const Body &, double gonad = 0, double sediment_contact = 0,
                                   Point disturbance = {});
// The lateral line samples the water at four corners LATERAL_ALONG body radii ahead and behind
// and LATERAL_ACROSS radii to either side.
inline constexpr double LATERAL_ALONG = .7, LATERAL_ACROSS = .5;
// How much a lateral-line cell weighs the water at each of the four corners the lateral line
// samples (k & 1: ahead, else behind; k & 2: towards side +1, else -1): the more the nearer the
// cell lies, blended towards all alike by its spatial width.
std::array<double, 4> lateral_weights(const BrainInterface::Receptor &);
double anatomical_stimulus(const Body &, const BrainInterface::Receptor &, const SensoryFrame &,
                           double sediment_contact, const PhysiologyParameters &);
float receptor_response(const BrainInterface::Receptor &, double stimulus, double mean = 0);
float anatomical_sensor(const Body &, const BrainInterface::Receptor &, const SensoryFrame &,
                        double sediment_contact = 0,
                        std::array<float, field::SENSE_COUNT> *components = nullptr,
                        const PhysiologyParameters & = {});
float anatomical_sensor(const Body &, const BrainInterface::Receptor &, double sediment_contact = 0,
                        Point disturbance = {}, double gonad = 0);
float sensory_response(double stimulus, double threshold);
float bounded_response(double stimulus, double threshold);
void record_touch(Body &, double nx, double ny, double impact = 0);
Point olfactory_position(const Body &, const BrainInterface &, int side);
double stroke_step(StrokeState &, double drive, const StrokeTiming &, double threshold);
// The share of its paid work a running stroke delivers this step.
double stroke_delivery(const StrokeState &, const StrokeTiming &);
struct EffectorActivity {
  std::array<double, ORGAN_PORTS> sum{};
  std::array<double, 2> egg{}, sperm{}, bladder{};
  field::Hormones secretion{}, binding{};
  Color pigment{}, egg_color{}, sperm_color{};
  double left = 0, right = 0;
};
EffectorActivity effector_activity(const std::vector<float> &, const BrainInterface &);
struct OrganDrive {
  std::array<double, HORMONE_ORGANS> values{};
  std::uint32_t present = 0;
};
OrganDrive continuous_organs(const std::vector<float> &, const BrainInterface &);
void anatomical_action(Body &, const BrainInterface &, const PhysiologyParameters & = {},
                       bool protected_life = false);
}
