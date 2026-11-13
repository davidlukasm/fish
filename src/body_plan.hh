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
// A gravity cell's hair points from the head (quality -1) over the flank (0) to the tail (1);
// cells on the other side mirror it. The hair is weighed down as far as it points to the bottom.
inline float hair_direction(float quality, float lateral) {
  return std::copysign(float(PI) * .5f * (1 + std::clamp(quality, -1.f, 1.f)), lateral);
}
std::shared_ptr<const BrainInterface> anatomical_interface(const field::Substrate &);
double spine_aim(const BrainInterface::Effector &, const field::Substrate &);
void spread_spines(std::array<double, BODY_SECTORS> &, const BrainInterface::Effector &,
                   const field::Substrate &);
std::array<double, BODY_SECTORS> spine_density(const BrainInterface &, const field::Substrate &);
Color visible_absorption(const BrainInterface &, const Color &dispersion,
                         const PhysiologyParameters &);
double local_defense(double defense, const std::array<double, BODY_SECTORS> &density,
                     double relative);
bool has_required_organs(const field::Substrate &);
// The lateral line samples the water on a ring around the body outline, one point per skin
// sector; a cell reads the sectors around its own direction, as a touch cell does.
template <class T> using LateralSamples = std::array<T, BODY_SECTORS>;
struct SensoryFrame {
  LateralSamples<Point> positions{}, relative{};
  LateralSamples<double> buried{};
  std::array<double, BODY_SECTORS> touch{}, impact_ring{};
  bool contact_ring = false;
  double satiety = 0, radius = 0, energy = 0, nutrient = 0, depth = 0, impact = 0, contact = 0,
         gonad = 0, sperm = 0;
  Point normal{};
};
SensoryFrame prepare_sensory_frame(const Body &, const BrainInterface &, const Field &,
                                   double gonad = 0);
SensoryFrame prepare_sensory_frame(const Body &, double gonad = 0, double sediment_contact = 0,
                                   Point disturbance = {});
inline constexpr double LATERAL_ALONG = .7, LATERAL_ACROSS = .5;
// Offset of ring point k from the body centre, forward along x and to the right along y.
Point lateral_point(int k, double radius);
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
float bounded_response(double stimulus, double half);
float excess_response(double stimulus, double half, double mean = 0);
void record_touch(Body &, double nx, double ny, double impact = 0);
Point nose_position(const Body &);
// The water relative to the nose, from the stream at the nose.
Point nose_flow(const Body &, Point nose, Point stream);
// flow: the water relative to the fish at its nose.
Point nostril_source(const Body &, Point nose, Point flow, int side);
// Barbels hang from the snout and grow with their taste cells; they taste only what their tips
// touch.
Point barbel_tip(const Body &, const BrainInterface &, int side);
double stroke_step(StrokeState &, double drive, const StrokeTiming &, double threshold);
double stroke_shape(const StrokeState &);
// What a muscle's cells ask of it this step. Each cell pulls with its own drive, as far as its
// fibres are rested; the twitch lasts as long as the cells that pull make it, and its work costs
// what their fibres charge. drive: the cells' pull per stroke; steps, price: their twitch
// duration and price of work, each weighted with that pull; weights: the pull of every entry of
// the layout's pulls.
struct MuscleDemand {
  std::array<double, STROKE_COUNT> drive{}, steps{}, price{};
  std::vector<double> weights;
};
MuscleDemand muscle_demand(const BrainInterface &, const std::vector<double> &amounts,
                           const std::vector<double> &reserve);
// The fast fibres of the cells that did the work spend their glycogen, every cell by its share
// of the work; the blood refills all of them.
void tire_fibres(const BrainInterface &, const MuscleDemand &,
                 const std::array<double, STROKE_COUNT> &work, std::vector<double> &reserve);
// The drive of a muscle while it twitches, else nothing.
inline double stroke_drive(const StrokeState &s) {
  return s.recovery > 0 ? s.drive : 0;
}
// Upkeep per step of an effector cell at the basal metabolism of a standard body.
double effector_upkeep(const BrainInterface::Effector &);
// Push along and across the body and turning per unit of force of each side fin stroke, from
// the cells' protraction shares, angles, levers and arms; the bending lever of each tail flank.
void fin_mechanics(BrainInterface &);
struct EffectorActivity {
  std::array<double, ORGAN_PORTS> sum{};
  std::array<double, 2> egg{}, sperm{}, bladder{};
  field::Hormones secretion{}, binding{};
  Color pigment{}, egg_color{}, sperm_color{};
  // The force of each side fin's back strokes and of the forward strokes of their antagonists,
  // per fin and side.
  std::array<std::array<double, 2>, SIDE_FINS> back{}, front{};
  // What every effector cell gives, in the layout's order.
  std::vector<double> cells;
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
