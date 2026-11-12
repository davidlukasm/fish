#pragma once
#include <limits>
#include "body.hh"
#include "material.hh"
#include "geometry_types.hh"
#include "genome.hh"
#include "physiology_parameters.hh"
namespace fishsim {
constexpr double HATCH_RESERVE_FRACTION = .2, FOUNDER_UPKEEP_ALLOWANCE = .06;
constexpr double MIN_BODY_MASS = .2;
constexpr double TISSUE_PER_ORGAN_REF = 2.25;
constexpr std::uint64_t IDENTITY_HASH = 2654435761ULL, IDENTITY_BUCKETS = 1009;
constexpr double MOUTH_SHARE_SHORT = body_unit::mouth_share_short,
                 MOUTH_SHARE_SPAN = body_unit::mouth_share_span;
constexpr double MOUTH_FORCE_GAIN = 2, BITE_REACH = .9;
constexpr double MOUTH_REACH_MIN = .5, MOUTH_REACH_MAX = 8, SWALLOW_AREA = 4,
                 SWALLOW_SPEED_LOSS = 3;
constexpr double DEFAULT_FLESH_WOUND = .25;
constexpr double BODY_TISSUE = body_unit::body_tissue, MAX_TISSUE = 2560, MIN_TISSUE = 10,
                 HATCH_TISSUE = 20, HATCH_RESERVE = 250, ADULT_RESERVE = body_unit::adult_reserve;
static_assert(HATCH_TISSUE > MIN_TISSUE);
inline double tissue_floor(const Body &b) {
  return std::max(MIN_TISSUE,
                  PhysiologyParameters::tissue_floor_share * std::max(b.peak_tissue, b.tissue));
}
inline double starvation_damage(const Body &b, double used) {
  return used / std::max(1., std::max(b.peak_tissue, b.tissue) - tissue_floor(b));
}
inline double senescence_loss(const Body &b, const PhysiologyParameters &p) {
  return p.senescence_rate() *
         std::max(0., b.age - b.hatch_age -
                          p.senescence_start() *
                              (1 - PhysiologyParameters::senescence_spread / 2 +
                               PhysiologyParameters::senescence_spread *
                                   double((b.identity * IDENTITY_HASH) % IDENTITY_BUCKETS) /
                                   double(IDENTITY_BUCKETS - 1)));
}
Color corpse_color(const Color &, double age, double energy, double food_bright, double half_life);
double minimum_egg_energy(const Genome &, const PhysiologyParameters &, int incubation_steps);
double egg_energy_needed(const Body &parent, const Genome &, const PhysiologyParameters &);
double embryo_development(const Body &);
inline double basal_cost(double tissue, const PhysiologyParameters &p) {
  using P = PhysiologyParameters;
  return P::basal_rate * p.basal_metabolism() *
         (P::basal_fixed + (1 - P::basal_fixed) * std::max(0., tissue) / BODY_TISSUE);
}
inline double muscle_upkeep(double maintenance, double tissue, const PhysiologyParameters &p) {
  return maintenance * p.basal_metabolism() *
         std::clamp(tissue / BODY_TISSUE, 0., MAX_TISSUE / BODY_TISSUE);
}
double maternal_reserve(const Body &, double adult_reserve);
double development_energy(const Genome &, double neural_cost, double hatch_tissue);
inline double bounded_filling(double content, double capacity) {
  return capacity > 0 ? std::clamp(content / capacity, 0., 1.) : content > 0 ? 1. : 0.;
}
constexpr double EGG_FULL_SHARE = .95;
constexpr double ORGAN_CELL_CAPACITY = 10;
double organ_capacity(const Body &, const Genome &, int port, double ceiling,
                      double per_cell = ORGAN_CELL_CAPACITY);
double gonad_filling(const Body &);
double gut_filling(const Body &);
double ovary_capacity(const Body &, const Genome &, double ceiling, double per_cell);
double body_mass(const Body &);
double pay_activity(Body &, double requested, bool protected_life = false);
void mobilize_tissue(Body &, double target);
inline void harm_body(Body &b, double damage, int cause,
                      double bearing = std::numeric_limits<double>::quiet_NaN()) {
  if (!b.immortal && damage > 0 && b.health > 0) {
    const double taken = std::min(b.health, damage);
    if (std::isfinite(bearing)) {
      constexpr int sectors = SECTOR_COUNT;
      const double at = sector_position(bearing - b.angle);
      const int sector = int(std::floor(at));
      const double mix = at - sector;
      b.damage_sectors[(sector + sectors) % sectors] += taken * (1 - mix);
      b.damage_sectors[(sector + sectors + 1) % sectors] += taken * mix;
    } else
      for (auto &v : b.damage_sectors)
        v += taken / double(BODY_SECTORS);
    b.health -= taken;
    if (b.health <= 0 && b.fatal_cause < 0)
      b.fatal_cause = cause;
  }
}
inline double growth_fraction(const Body &b) {
  return std::clamp(b.tissue / BODY_TISSUE, 0., MAX_TISSUE / BODY_TISSUE);
}
inline double structural_radius(double tissue, double organs) {
  return std::clamp(BODY_RADIUS * std::sqrt(std::max(MIN_BODY_MASS, tissue / BODY_TISSUE + organs)),
                    BODY_RADIUS, MAX_BODY_RADIUS);
}
inline double body_radius(const Body &b) {
  return structural_radius(b.tissue, b.organ_mass);
}
inline double tissue_capacity(const Body &b) {
  return std::min(MAX_TISSUE, TISSUE_PER_ORGAN_REF * BODY_TISSUE * b.organ_mass / b.organ_mass_ref);
}
inline double growth_permission(const Body &b) {
  return b.brain() ? b.brain()->blueprint().growth_receptor.occupancy(b.hormones().levels()) : 0;
}
// Maturity is the largest tissue share reached so far: hunger breaks tissue down, never maturity.
inline double body_maturity(const Body &b) {
  return std::clamp(std::max(b.peak_tissue, b.tissue) /
                        std::max(tolerance::negligible, tissue_capacity(b)),
                    0., 1.);
}
constexpr double EGG_ENERGY_PER_RADIUS2 = RESERVE_ENERGY_PER_MASS / (BODY_RADIUS * BODY_RADIUS);
inline double egg_radius(double energy) {
  return std::sqrt(std::max(0., energy) / EGG_ENERGY_PER_RADIUS2);
}
inline double corpse_radius(double energy) {
  return std::clamp(BODY_RADIUS * std::sqrt(std::max(0., energy) / BODY_TISSUE), 1.,
                    MAX_BODY_RADIUS);
}
inline double collision_radius(const Body &b) {
  return b.hatched ? body_radius(b) : std::max(b.egg_shell_radius, egg_radius(b.energy));
}
void size_egg(Body &);
inline double reserve_capacity_for_tissue(double tissue) {
  return std::max(HATCH_RESERVE,
                  ADULT_RESERVE * std::clamp(tissue / BODY_TISSUE, 0., MAX_TISSUE / BODY_TISSUE));
}
inline double reserve_capacity(const Body &b) {
  return b.hatched ? reserve_capacity_for_tissue(b.tissue) : ENERGY_MAX;
}
inline double gut_size(double length) {
  return (1 + length) / (1 + TRAIT_MIDDLE);
}
inline double gut_size_factor(const Body &b) {
  return gut_size(b.gut_length);
}
inline double gut_capacity(const Body &b) {
  return reserve_capacity_for_tissue(b.tissue) * gut_size_factor(b);
}
inline double gut_transit(const Body &b, const PhysiologyParameters &p) {
  return p.gut_time * gut_size_factor(b);
}
inline double nutrient_signal(const Body &b) {
  return b.nutrient_flow / (b.nutrient_flow + std::max(tolerance::negligible, b.rest_cost));
}
inline double mouth_offset(const Body &b) {
  return body_radius(b) * b.snout_position;
}
inline double gut_utilisation(double length, int source) {
  using P = PhysiologyParameters;
  const auto utilisation = [](double l) { return 1 - P::gut_linear * l - P::gut_square * l * l; };
  length = std::clamp(length, 0., 1.);
  return source == food_kind::benthic || source == food_kind::feed  ? P::fixed_utilisation
         : source == food_kind::algae || source == food_kind::plant ? utilisation(1 - length)
                                                                    : utilisation(length);
}
inline double digestibility(const Body &b, int source) {
  return gut_utilisation(b.gut_length, source);
}
inline double fill_factor(int source, const PhysiologyParameters &p) {
  return source == food_kind::algae || source == food_kind::plant ? p.fill_plant
         : source == food_kind::benthic                           ? p.fill_sediment
                                                                  : 1.;
}
inline double gut_room(const Body &b, int source, const PhysiologyParameters &p) {
  return std::max(0., gut_capacity(b) - b.gut_fill) / fill_factor(source, p);
}
inline double swimming_limit(const Body &b, const PhysiologyParameters &p) {
  return MAX_SPEED * (p.scaled_by_size() ? std::sqrt(body_radius(b) / BODY_RADIUS) : 1.);
}
inline double body_scale(const Body &b) {
  return body_radius(b) / BODY_RADIUS;
}
inline double mouth_force(const Body &b) {
  return effective_force(b.suction_strength * body_scale(b), b.force_scale);
}
inline double mouth_share(double jaw_length) {
  return MOUTH_SHARE_SHORT + MOUTH_SHARE_SPAN * jaw_length;
}
inline double jaw_lever(double jaw_length) {
  return mouth_share(TRAIT_MIDDLE) / mouth_share(jaw_length);
}
inline double jaw_leverage(const Body &b) {
  return jaw_lever(b.jaw_length);
}
// Sharp teeth cut flesh; blunt teeth grind plant tissue and crack shells. A loose piece gives way
// to either: sharp teeth tear it, blunt ones crush it.
enum class BiteKind { cutting, grinding, loose };
// Mixed teeth do neither well: each grip falls off with a power of the share of its own form.
constexpr double TOOTH_SPECIALISATION = 2;
inline double tooth_grip(double blunt, BiteKind kind) {
  blunt = std::clamp(blunt, 0., 1.);
  return kind == BiteKind::loose      ? 1
         : kind == BiteKind::grinding ? std::pow(blunt, TOOTH_SPECIALISATION)
                                      : std::pow(1 - blunt, TOOTH_SPECIALISATION);
}
inline double scrape_force(const Body &b) {
  return effective_force(b.suction_strength * b.mouth.flow * body_scale(b) *
                             std::pow(jaw_leverage(b), 2),
                         b.force_scale);
}
inline double bite_force(const Body &b, BiteKind kind = BiteKind::cutting) {
  return effective_force(b.bite_strength * std::clamp(b.bite_signal, 0., 1.) * body_scale(b) *
                             jaw_leverage(b) * tooth_grip(b.blunt_teeth, kind),
                         b.force_scale);
}
inline double mouth_factor(const Body &b) {
  return MOUTH_FORCE_GAIN * mouth_force(b);
}
inline double suction_share(double suction, double force_scale) {
  return std::min(1., MOUTH_FORCE_GAIN * effective_force(suction, force_scale));
}
inline double maximum_mouth_aperture(const Body &b) {
  return body_radius(b) * mouth_share(b.jaw_length);
}
inline double mouth_aperture(const Body &b) {
  return maximum_mouth_aperture(b) * b.mouth.opening;
}
// A bite closes from the gape the jaw had when it began: nothing larger than that opening is bitten
// off or swallowed whole.
inline double bite_aperture(const Body &b) {
  return maximum_mouth_aperture(b) * b.mouth.gape;
}
inline double bite_radius(const Body &b) {
  return BITE_REACH * bite_aperture(b);
}
inline double bite_share(const Body &b, double radius) {
  const double bite = bite_radius(b);
  return radius > bite ? bite * bite / (radius * radius) : 1;
}
inline double mouth_reach(const Body &b) {
  return std::min(MOUTH_REACH_MAX, std::max(MOUTH_REACH_MIN, mouth_aperture(b)));
}
inline double swallow_area(const Body &b) {
  const double speed = std::clamp(b.motor().relative_speed / MAX_SPEED, 0., 1.);
  return SWALLOW_AREA * maximum_mouth_aperture(b) * maximum_mouth_aperture(b) *
         suction_share(b.suction_strength * body_scale(b), b.force_scale) /
         (1 + SWALLOW_SPEED_LOSS * speed * speed);
}
// Water through the gills keeps the plankton the rakers hold: dense rakers nearly all of it, a
// fish without rakers only what sticks to its gills.
inline double raker_retention(const Body &b) {
  namespace G = gill_filter;
  return G::rakerless_retention + (1 - G::rakerless_retention) * b.raker_density;
}
// Share of the water dense rakers still let through.
inline double raker_passage(const Body &b) {
  return 1 - gill_filter::raker_drag * b.raker_density;
}
// Water the gill covers can draw through a mouth held wide open at full pumping.
inline double gill_area(const Body &b) {
  const double widest = maximum_mouth_aperture(b);
  return SWALLOW_AREA * widest * widest *
         suction_share(b.gill_strength * body_scale(b), b.force_scale);
}
// Water the gill covers pump through the open mouth, and the water a mouth opened wider than at
// rest meets while the fish swims (ram filtering).
inline double gill_water(const Body &b) {
  const double widest = maximum_mouth_aperture(b),
               pumped = gill_area(b) * 2 * b.gill_signal * b.mouth.opening,
               held = std::max(0., b.mouth.opening - MOUTH_REST) / (1 - MOUTH_REST),
               ram = 2 * widest * held * std::max(0., b.motor().relative_speed);
  return (pumped + ram) * raker_passage(b);
}
inline bool fits_mouth(const Body &b, double radius) {
  return radius <= mouth_aperture(b) + tolerance::negligible;
}
constexpr double MOUTH_TRANSPORT_RATE = 1 / MOUTH_CYCLE_STEPS;
// The closer's pull peaks halfway through its stroke: that is when the jaw snaps shut.
inline double jaw_snap(const MouthState &m) {
  return std::floor(m.duration / 2);
}
inline bool jaw_shutting(const MouthState &m) {
  return m.biting && m.phase >= jaw_snap(m);
}
void advance_mouth(Body &, bool pump_started, bool bite_started, double pump_steps,
                   double bite_steps);
double stored_energy(const Body &);
void empty_stores(Body &);
// Excess hatch funding becomes tissue instead of overflowing a tiny reserve.
inline double hatch_tissue(double energy) {
  return std::clamp(std::min(energy - HATCH_RESERVE, energy / (1 + ADULT_RESERVE / BODY_TISSUE)),
                    HATCH_TISSUE, MAX_TISSUE);
}
inline double birth_exposure(const Body &b, double tau) {
  if (!b.hatched)
    return 0;
  return b.hatch_age < 0 ? 1 : std::clamp(double(b.age - b.hatch_age) / tau, 0., 1.);
}
double hatch_search_reserve(const Body &);
void advance_embryo(Body &, const Genome &, const PhysiologyParameters &, bool = false);
void mature_body(Body &);
std::optional<double> predicted_hatch_reserve(const Body &, const Genome &, double neural_cost = 1);
double predicted_hatch_radius(const Body &, const Genome &, double neural_cost = 1);
void maintain_body(Body &, bool protected_life = false);
double take_nutrition(Body &, double amount, int source = 0, const PhysiologyParameters & = {});
double digest_nutrition(Body &, const PhysiologyParameters &);
void injure(Body &, double damage, bool protected_life = false, Point normal = {});
struct FleshBite {
  double tissue = 0, energy = 0;
};
FleshBite sever_flesh(Body &, Body &, double wound = DEFAULT_FLESH_WOUND,
                      bool protected_life = false);
}
