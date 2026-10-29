#pragma once
#include "individual.hh"
#include "food.hh"
#include "mutation_parameters.hh"
#include <deque>
#include <map>
namespace fishsim {
inline constexpr std::size_t MAX_SPERM_RELEASES = 2000;
struct Sperm {
  Genome genome;
  double x = 0, y = 0;
  std::uint64_t parent = 0;
  double energy = 0;
  int depth = 0;
  std::uint64_t species = 0;
  bool natural = false;
  double novelty = 0;
  unsigned g = 0;
  std::array<double, 3> color{};
  std::uint64_t render_id = next_render_id();
  double release_radius = BODY_RADIUS;
  int columns = 0, rows = 0;
  double width = 0, height = 0;
  std::map<std::uint32_t, double> cells{};
  unsigned feeding_generations = 0;
  bool fertile = true;
};
struct ArchiveEntry {
  Genome genome;
  std::array<double, BEHAVIOR_FEATURES> behavior{};
  double quality = 0, novelty = 0;
  std::uint64_t tick = 0;
  bool egg_role = true;
  std::uint64_t environment = 0, species = 0;
  int offspring = 0;
  std::uint64_t source_id = 0;
};
struct Breeder {
  Genome genome;
  std::uint64_t id = 0, species = 0, environment = 0;
  double food = 0;
  int offspring = 0, depth = 0;
  double food_rate = 0, resting_cost = 0;
  int observed_steps = 0;
  bool feeds_adequately() const {
    return observed_steps >= 80 && food_rate > 0 && food_rate >= resting_cost;
  }
  double score(double offspring_weight) const {
    return std::log1p(food_rate / std::max(.001, resting_cost)) +
           offspring_weight * std::log1p(offspring);
  }
};
// Adjustable evolution parameters.
struct EvolutionParameters {
  double nutrient_egg_threshold = 1, recruitment_target = 150, assist_min_population = 15,
         assist_species_minimum = 3;
  double founder_sense_quotas = 1;
  double mutation = .03, selfing_delay = 60, fertilisation_wait = 90;
  double breeder_slots = 16, breeder_offspring_weight = 4;
  double yolk = 180, egg_fill_rate = 2, egg_reserve = 150, egg_capacity = 160, egg_overhead = 2;
  double egg_organ_capacity = 10;
  // Development budget per step: at least development_queries, more when many eggs wait (open
  // developments should finish in about eight steps), never above development_query_limit.
  double development_queries = 131072, development_query_limit = 1048576;
  double development_finalizations = 3; // Brains completed per step at most.
  double sperm_fill_rate = .2, sperm_portion = 2;
  double egg_crowding_radius = 64, egg_crowding_limit = 4;
  // Five equally weighted groups describe observed ways of life.
  double novelty_neighbors = 15;
  MutationRates rates{};
};
struct DiseaseParameters {
  double rate = .00005, carrion = .02, food = .005, reach = 24, spread = .05, duration = 400,
         harm = .001;
};
struct BurstParameters {
  double gap = 1400, duration = 140, strength = 3;
};
struct BurstState {
  std::uint64_t next = 0, until = 0;
  double size = 1, cluster = 4, manual_strength = 0;
  bool active(std::uint64_t tick) const { return until > tick; }
};
struct BreedingHelp {
  bool enabled = false;
  double target = 0, current = 0, scale = 1, nutrition = 0;
  std::uint64_t exposure = 0, steps = 0;
};
struct BreedingFood {
  double rate = 0, limit = 1, minimum = 1, maximum = 1;
};
struct PerformanceSample {
  std::uint64_t tick = 0, exposure = 0, natural_deaths = 0, hatches = 0, support_deaths = 0,
                support_hatches = 0;
  double food = 0, nutrition = 0, drift = 0;
  std::array<double, DIET_COUNT> diet{};
};
struct ParameterInfo {
  std::string name;
  double value;
  double lo, hi;
  bool integer;
  const char *group;
  double step = .1, initial_value = 0;
  const char *label = "", *help = "", *unit = "";
  bool initial = false;
};
struct WorldEvent {
  std::uint64_t tick = 0;
  std::string command;
};
struct Corpse {
  double x = 0, y = 0, vx = 0, vy = 0, energy = 0, initial_energy = 0;
  std::array<double, 3> color{};
  std::uint64_t age = 0, render_id = next_render_id();
  double angle = 0, radius = 0;
  bool hatched = true;
  std::uint64_t bone_age = 0;
  // Frozen outline and fins, relative to the living body's radius.
  std::shared_ptr<const BrainInterface> visual{};
  std::array<double, 25> visual_state{};
  bool resting = false;
  double decay_age = -1;
  std::uint64_t blood_id = 0, species = 0;
  int death_cause = 0;
  double blood_loss = 0, blood_x = 0, blood_y = 0;
};
inline double corpse_decay_age(const Corpse &c) {
  return c.decay_age < 0 ? double(c.age) : c.decay_age;
}
double corpse_extent(const Corpse &);
std::array<double, 3> remains_color(const Corpse &, double, double, double bone_time = 1000);
struct ReplacementSample {
  std::uint64_t tick = 0, hatches = 0, deaths = 0;
};
struct SpeciesBodyProfile {
  std::uint64_t samples = 0;
  std::array<double, 3> vision{};
  std::array<double, 3> fillings{};
  std::array<double, field::SENSE_COUNT> senses{}, thresholds{}, early{}, late{}, span{},
      directions{};
  std::array<double, 8> scents{}, scent_thresholds{};
  double radius = 0, mass = 0, mouth = 0, propulsion = 0, armor = 0, egg_organs = 0,
         sperm_organs = 0;
  double internal = 0, bite = 0, aperture = 0, barbels = 0, smell_sites = 0, hermaphrodites = 0,
         head = 0, cord = 0;
  double jaw_length = 0, gut_length = 0, blunt_teeth = 0, undulation = 0;
  template <class F> void values(F f) {
    for (auto &v : vision)
      f(v);
    for (auto &v : fillings)
      f(v);
    for (auto &v : senses)
      f(v);
    for (auto &v : thresholds)
      f(v);
    for (auto &v : early)
      f(v);
    for (auto &v : late)
      f(v);
    for (auto &v : span)
      f(v);
    for (auto &v : directions)
      f(v);
    for (auto &v : scents)
      f(v);
    for (auto &v : scent_thresholds)
      f(v);
    f(radius);
    f(mass);
    f(mouth);
    f(propulsion);
    f(armor);
    f(egg_organs);
    f(sperm_organs);
    f(internal);
    f(bite);
    f(aperture);
    f(barbels);
    f(smell_sites);
    f(hermaphrodites);
    f(head);
    f(cord);
    f(jaw_length);
    f(gut_length);
    f(blunt_teeth);
    f(undulation);
  }
  template <class F> void values(F f) const {
    for (auto v : vision)
      f(v);
    for (auto v : fillings)
      f(v);
    for (auto v : senses)
      f(v);
    for (auto v : thresholds)
      f(v);
    for (auto v : early)
      f(v);
    for (auto v : late)
      f(v);
    for (auto v : span)
      f(v);
    for (auto v : directions)
      f(v);
    for (auto v : scents)
      f(v);
    for (auto v : scent_thresholds)
      f(v);
    f(radius);
    f(mass);
    f(mouth);
    f(propulsion);
    f(armor);
    f(egg_organs);
    f(sperm_organs);
    f(internal);
    f(bite);
    f(aperture);
    f(barbels);
    f(smell_sites);
    f(hermaphrodites);
    f(head);
    f(cord);
    f(jaw_length);
    f(gut_length);
    f(blunt_teeth);
    f(undulation);
  }
};
struct GeneticSpecies {
  HormoneProfile hormones;
  SpeciesBodyProfile lifetime_body;
  std::array<double, BEHAVIOR_FEATURES> lifetime_profile{};
  std::uint64_t lifetime_profile_samples = 0, habitat_steps = 0;
  std::array<double, 5> lifetime_habitat{};
  std::array<double, DIET_COUNT> lifetime_diet{}, lifetime_raw_diet{};
  double lifetime_digested = 0;
  double lifetime_drift = 0;
  std::uint64_t diet_steps = 0;
  std::uint64_t genus = 0, name_since = 0;
  std::string epithet, name_candidate, name_reason, candidate_reason;
  double max_founder_distance = 0;
  std::deque<ReplacementSample> replacement_history{{}};
  double best_nutrition_rate = 0;
  unsigned feeding_generations = 0, protection_used = 0;
  std::uint64_t last_protection = 0;
  std::uint64_t id = 0, born = 0, last_seen = 0, hatches = 0, successful_offspring = 0,
                replacement_hatches = 0, replacement_deaths = 0;
  std::string name;
  Genome representative;
  bool confirmed = false;
  std::uint64_t mother_species = 0, father_species = 0, extinct_at = 0, profile_environment = 0;
  int origin = 0;
  std::uint64_t profile_samples = 0;
  std::array<double, BEHAVIOR_FEATURES> profile{};
  std::uint64_t first_profile_tick = 0, first_profile_samples = 0;
  int comparison_parents = 0;
  std::array<double, BEHAVIOR_FEATURES> first_delta{};
};
struct EcologicalMilestone {
  std::uint64_t tick = 0, species = 0;
  std::string key, title, evidence;
};
struct SupportMember {
  Genome candidate;
  std::uint64_t parent = 0;
  int depth = 0;
  double energy = 0;
};
struct SupportGroup {
  Genome source;
  std::vector<SupportMember> members;
  int origin = 2, depth = 0;
  std::uint64_t parent = 0, species = 0;
};
}
