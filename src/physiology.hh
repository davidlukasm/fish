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
// The gut and what it does with a meal. Food is made of three things. Flesh can be taken up at
// once and spoils when it stays long. Fibre, the stuff of leaves, has to be broken open first,
// which needs a long stay, and never spoils. Pulp is matter digested once before, the stuff of
// flocks: it can be taken up at once, spoils late and hurts no gut. Algae are fibre with some
// pulp, plankton is half flesh, half fibre. So every food has its own span of time in which it
// is worth most. How long a meal stays follows from the gut's length and from how fast the gut
// muscle moves it.
//
// The shared constants `digestion::`: `shortest` and `longest` are the gut's length in body
// lengths. What is open is taken up within `uptake_steps`. Fibre that stays `open_steps` is half
// broken open; flesh that stays `spoil_steps` and pulp that stays `pulp_steps` spoil as fast as
// they are taken up. All three run with the power `sharpness` of the stay, so a little too
// short or too long costs much. The largest gut muscle moves the content `fastest` times as
// fast as a resting gut. A full gut hurts when the meal in it is the wrong one for its pace:
// flesh that stays longer than `ache_flesh` times `spoil_steps`, and the later the less of the
// meal is flesh; or a meal that is fibre by more than the share `ache_fibre` and stays shorter
// than `open_steps` times that excess. Past these limits by the share `cramp` it hurts as much
// as it can, empties the gut `diarrhoea` times faster on top and costs `harm` of the
// health per step. A gut of the greatest length leaves the gonads `belly` less room; per body
// length it weighs `wall_mass` of the tissue and raises the basal metabolism by `upkeep`.
// Faeces leave as a flock once they amount to `pellet` of what the gut holds.
namespace digestion {
inline constexpr double uptake_rate = 1. / uptake_steps;
// How far a process that needs `needed` steps has come in a meal that stays `stay` steps, as
// the ratio of what it has done to what it has left.
inline double progress(double stay, double needed) {
  return std::pow(stay / needed, sharpness);
}
// Per step, in a gut that holds its content `stay` steps: the share of the closed fibre that
// is broken open, and the shares of the flesh and of the pulp that spoil.
inline double opening_rate(double stay) {
  return std::min(1., progress(stay, open_steps) / stay);
}
inline double spoiling_rate(double stay, double within) {
  return std::min(1., uptake_rate * progress(stay, within));
}
}
// What a mouthful is to the gut: how much of it is flesh and how much fibre, the rest being
// pulp; how much room it takes per energy; and whether its remains leave as plant matter.
struct Fodder {
  double flesh, fibre, fill;
  bool plant;
};
// Flocks of every origin are pulp: feed, faeces and what has settled on the ground.
inline Fodder flock_fodder(bool plant) {
  return {0, 0, 1, plant};
}
inline Fodder fodder(int source, const PhysiologyParameters &p) {
  switch (source) {
  case food_kind::plant:
    return {0, 1, p.fill_plant, true};
  case food_kind::algae:
    return {0, .75, p.fill_plant, true};
  case food_kind::benthic:
    return {0, 0, p.fill_sediment, true};
  case food_kind::feed:
    return {0, 0, 1, false};
  case food_kind::plankton:
    return {.5, .5, 1, false};
  default:
    return {1, 0, 1, false};
  }
}
inline double gut_size(double length) {
  return digestion::shortest *
         std::pow(digestion::longest / digestion::shortest, std::clamp(length, 0., 1.));
}
inline double gut_size_factor(const Body &b) {
  return gut_size(b.gut_length);
}
inline double gut_capacity(const Body &b) {
  return reserve_capacity_for_tissue(b.tissue) * gut_size_factor(b);
}
// Share of the belly the gut leaves the gonads.
inline double belly_room(const Body &b) {
  return 1 - digestion::belly * (gut_size_factor(b) - digestion::shortest) /
                 (digestion::longest - digestion::shortest);
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
// Share of a mouthful the gut takes up when the mouthful stays `stay` steps: of its flesh and
// its pulp what is taken up before it spoils or passes, of its fibre what is broken open in
// that time and then taken up.
inline double gut_yield(double stay, const Fodder &f) {
  using namespace digestion;
  const double passage = 1 / stay, opening = opening_rate(stay);
  const auto taken = [&](double spoiling) {
    return uptake_rate / (uptake_rate + spoiling + passage);
  };
  return f.flesh * taken(spoiling_rate(stay, spoil_steps)) +
         f.fibre * opening / (opening + passage) * taken(0) +
         (1 - f.flesh - f.fibre) * taken(spoiling_rate(stay, pulp_steps));
}
// Steps a mouthful stays in a gut of this length that moves it `speed` times as fast as at rest.
inline double gut_stay(double length, double speed, const PhysiologyParameters &p) {
  return p.gut_time * gut_size(length) / speed;
}
inline double gut_room(const Body &b, const Fodder &f) {
  return std::max(0., gut_capacity(b) - b.gut_fill) / f.fill;
}
inline double gut_room(const Body &b, int source, const PhysiologyParameters &p) {
  return gut_room(b, fodder(source, p));
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
// How fast the gut muscle can move the content, as a multiple of the resting gut: a larger
// muscle is more than proportionally faster.
inline double gut_speed(const Body &b) {
  const double strength = suction_share(b.gut_strength * body_scale(b), b.force_scale);
  return 1 + (digestion::fastest - 1) * strength * strength;
}
// Share of its content the gut moves on per step. The wall moves food on with twice its pose,
// which averages its drive.
inline double gut_pace(const Body &b, const PhysiologyParameters &p) {
  return (1 + (gut_speed(b) - 1) * 2 * std::clamp(b.gut_motility, 0., 1.)) / gut_transit(b, p);
}
// How much a full gut hurts that holds a meal of these shares of flesh and of fibre for `stay`
// steps: nothing within the meal's own span of time, all it can beyond it.
inline double gut_ache(double stay, double flesh, double fibre) {
  using namespace digestion;
  const double spoiling = flesh > 0 ? stay * flesh / (ache_flesh * spoil_steps) - 1 : 0,
               closed = fibre > ache_fibre ? 1 - stay / (open_steps * (fibre - ache_fibre)) : 0;
  return std::clamp(std::max(spoiling, closed) / cramp, 0., 1.);
}
// Share of what the gut holds now that it takes up as fast as it moves now.
inline double gut_use(const Body &b, const PhysiologyParameters &p) {
  if (b.gut_energy <= 0)
    return 0;
  const double stay = 1 / gut_pace(b, p),
               opened = std::max(0., b.gut_energy - b.gut_flesh - b.gut_pulp - b.gut_fibre -
                                         b.gut_rot - b.gut_sour);
  return (b.gut_flesh * gut_yield(stay, {1, 0, 1, false}) +
          b.gut_pulp * gut_yield(stay, {0, 0, 1, false}) +
          b.gut_fibre * gut_yield(stay, {0, 1, 1, true}) +
          opened * digestion::uptake_rate / (digestion::uptake_rate + 1 / stay)) /
         b.gut_energy;
}
// Share of a mouthful the gut takes up as fast as it moves now.
inline double digestibility(const Body &b, const Fodder &f, const PhysiologyParameters &p) {
  return gut_yield(1 / gut_pace(b, p), f);
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
double take_nutrition(Body &, double amount, const Fodder &, const PhysiologyParameters &);
inline double take_nutrition(Body &b, double amount, int source = 0,
                             const PhysiologyParameters &p = {}) {
  return take_nutrition(b, amount, fodder(source, p), p);
}
double digest_nutrition(Body &, const PhysiologyParameters &);
void injure(Body &, double damage, bool protected_life = false, Point normal = {});
struct FleshBite {
  double tissue = 0, energy = 0;
};
FleshBite sever_flesh(Body &, Body &, double wound = DEFAULT_FLESH_WOUND,
                      bool protected_life = false);
}
