#include "ecology.hh"
#include "physiology.hh"
#include <cmath>
#include <map>
#include <type_traits>
namespace fishsim {
// Adjustable evolution and food parameters (interactive "parameter", --param, current checkpoint).
namespace {
template <class Number> struct ParameterBinding {
  std::string name;
  Number *value;
  double lo, hi;
  bool integer;
  const char *group;
  double step = .1;
  bool initial = false;
};
}
class ParameterAccess {
public:
  template <class World> static auto bindings(World &world) {
    using Number = std::remove_reference_t<decltype((world.evo.yolk))>;
    auto &e = world.evo;
    auto &m = world.evo.rates;
    auto &f = world.field;
    auto &d = world.disease;
    auto &env = f.env_;
    std::vector<ParameterBinding<Number>> table = {
#define FISH_REGISTER_FOOD_PARAMETER(name, initial, minimum, maximum)                              \
  {#name,                                                                                          \
   &env.name,                                                                                      \
   minimum,                                                                                        \
   maximum,                                                                                        \
   false,                                                                                          \
   "foodweb",                                                                                      \
   initial >= 10     ? 1                                                                           \
   : initial >= 1    ? .1                                                                          \
   : initial >= .01  ? .001                                                                        \
   : initial >= .001 ? .0001                                                                       \
                     : .0000001,                                                                   \
   false},
        FISH_FOOD_WEB_PARAMETERS(FISH_REGISTER_FOOD_PARAMETER)
#undef FISH_REGISTER_FOOD_PARAMETER
            {"max_bite_force", &world.physiology_.max_bite_force, .001, 10000, false, "body", 1,
             false},
        {"gut_time", &world.physiology_.gut_time, 1, 100000, false, "body", .01, false},
        {"fill_plant", &world.physiology_.fill_plant, 1, 10, false, "body", .01, false},
        {"fill_sediment", &world.physiology_.fill_sediment, 1, 20, false, "body", .01, false},
        {"organ_mass_ref", &world.physiology_.organ_mass_ref, 0.01, 100, false, "body", .01, false},
        {"undulation_loss", &world.physiology_.undulation_loss, 0, 1, false, "body", .01, false},
        {"embryo_fold", &world.physiology_.embryo_fold, 0, 2, false, "body", .01, false},
        {"embryo_crowding", &world.physiology_.embryo_crowding, 0, 2, false, "body", .01, false},
        {"embryo_flow_decay", &world.physiology_.embryo_flow_decay, 0, 1, false, "body", .01,
         false},
        {"embryo_flow_gain", &world.physiology_.embryo_flow_gain, 0, 10, false, "body", .01, false},
        {"embryo_touch_gain", &world.physiology_.embryo_touch_gain, 0, 10, false, "body", .01,
         false},
        {"embryo_pressure_damage", &world.physiology_.embryo_pressure_damage, 0, 1, false, "body",
         .01, false},
        {"embryo_reserve_damage", &world.physiology_.embryo_reserve_damage, 0, 1, false, "body",
         .01, false},
        {"embryo_damage_power", &world.physiology_.embryo_damage_power, 1, 10, false, "body", .01,
         false},
        {"embryo_defense_damage", &world.physiology_.embryo_defense_damage, 0, 1, false, "body",
         .01, false},
        {"hatch_shell_limit", &world.physiology_.hatch_shell_limit, 0, 1, false, "body", .01,
         false},
        {"hatch_force_base", &world.physiology_.hatch_force_base, 0, 10, false, "body", .01, false},
        {"hatch_force_shell", &world.physiology_.hatch_force_shell, 0, 100, false, "body", .01,
         false},
        {"hatch_mass_floor", &world.physiology_.hatch_mass_floor, 0.001, 10, false, "body", .01,
         false},
        {"embryo_nutrient_gain", &world.physiology_.embryo_nutrient_gain, 0, 10, false, "body", .01,
         false},
        {"resting_spines", &world.physiology_.resting_spines, 0, .85, false, "body", .01, false},
        {"resting_spines_half", &world.physiology_.resting_spines_half, .001, 10000, false, "body",
         1, false},
        {"pigment_half", &world.physiology_.pigment_half, .001, 10000, false, "body", 1, false},

        {"vision_range", &env.vision_range, 8, 1000, false, "vision", 0.1, false},
        {"vision_inhibition", &env.vision_inhibition, 0, 2, false, "vision", 0.1, false},
        {"vision_opponent", &env.vision_opponent, 0, 1, false, "vision", 0.01, false},
        {"vision_ambient", &env.vision_ambient, 0, 2, false, "vision", 0.1, false},
        {"vision_adaptation", &env.vision_adaptation, 0, 1, false, "vision", 0.01, false},
        {"vision_adaptation_angle", &env.vision_adaptation_angle, 1, 90, false, "vision", 0.1,
         false},
        {"vision_water_red", &env.vision_water_red, 0, 1, false, "vision", 0.01, false},
        {"vision_water_green", &env.vision_water_green, 0, 1, false, "vision", 0.01, false},
        {"vision_water_blue", &env.vision_water_blue, 0, 1, false, "vision", 0.01, false},
        {"vision_eye_offset", &env.vision_eye_offset, 0, 4, false, "vision", 0.1, false},
        {"vision_binocular_angle", &env.vision_binocular_angle, 0, .5, false, "vision", 0.01,
         false},
        {"vision_ink_scatter", &env.vision_ink_scatter, 0, 1, false, "vision", 0.01, false},
        {"vision_burial", &env.vision_burial, 0, 1, true, "vision", 1, false},
        {"lateral_connection", &m.lateral_connection, 0, 1, false, "evolution", 0.001, false},
        {"nutrient_egg_threshold", &e.nutrient_egg_threshold, .5, 2, false, "evolution", 0.1,
         false},
        {"recruitment_target", &e.recruitment_target, 0, 2000, false, "evolution", 0.1, false},
        {"assist_min_population", &e.assist_min_population, 0, 2000, true, "evolution", 1, false},
        {"assist_species_minimum", &e.assist_species_minimum, 0, 2000, true, "evolution", 1, false},

        {"day_period", &env.day_period, 0, 1000000, true, "light", 1, false},
        {"night_light", &env.night_light, 0, 1, false, "light", 0.01, false},
        {"algae_rate", &env.algae_rate, 0, 0.1, false, "plants", 2.5e-05, false},
        {"grass_rate", &env.grass_rate, 0, 0.1, false, "plants", 2.5e-05, false},
        {"algae_capacity", &env.algae_capacity, 2, 16000, false, "plants", 0.1, false},
        {"grass_capacity", &env.grass_capacity, 2, 16000, false, "plants", 0.1, false},
        {"algae_thickness", &env.algae_thickness, 0.1, 12, false, "plants", 0.1, false},
        {"grass_length", &env.grass_length, 16, 128, false, "plants", 0.1, false},
        {"light_bottom", &env.light_bottom, 0, 1, false, "light", 0.01, false},
        {"light_shadow", &env.light_shadow, 0, 1, false, "light", 0.01, false},
        {"sediment_half_life", &env.sediment_half_life, 1, 10000, false, "sediment", 0, false},
        {"sediment_path", &env.sediment_path, 1, 1000, false, "sediment", 0.1, false},
        {"sediment_reach", &env.sediment_reach, 1, 100, false, "sediment", 0.1, false},

        {"disease_food", &d.food, 0, 1, false, "disease", 0.001, false},
        {"disease_rate", &d.rate, 0, .1, false, "disease", 1e-05, false},
        {"disease_carrion", &d.carrion, 0, 1, false, "disease", 0.01, false},
        {"disease_reach", &d.reach, 0, 500, false, "disease", 0.01, false},
        {"disease_spread", &d.spread, 0, 1, false, "disease", 0.01, false},
        {"disease_duration", &d.duration, 1, 100000, true, "disease", 1, false},
        {"disease_harm", &d.harm, 0, .1, false, "disease", 0.0001, false},
        {"mutation", &e.mutation, 0, 1, false, "evolution", 0.01, false},
        {"broad_mutation", &m.broad_mutation, 0, 1, false, "evolution", .01, false},
        {"branch_mutation", &m.branch_mutation, 0, 1, true, "evolution", 1, false},
        {"step_evolution", &m.step_evolution, 0, 1, true, "evolution", 1, false},
        {"neutral_structure", &m.neutral_structure, 0, 1, true, "evolution", 1, false},
        {"selfing_delay", &e.selfing_delay, 0, 480, true, "evolution", 1, false},
        {"fertilisation_wait", &e.fertilisation_wait, 0, 10000, true, "evolution", 1, false},
        {"weight_share", &m.weight_share, 0, 1, false, "evolution", 0.01, false},
        {"add_node", &m.add_node, 0, 1, false, "evolution", 0.01, false},
        {"duplicate", &m.duplicate, 0, 1, false, "evolution", 0.01, false},
        {"add_connection", &m.add_connection, 0, 1, false, "evolution", 0.01, false},
        {"disable", &m.disable, 0, 1, false, "evolution", 0.01, false},
        {"node_edit", &m.node_edit, 0, 1, false, "evolution", 0.01, false},
        {"type_change", &m.type_change, 0, 1, false, "evolution", 0.01, false},
        {"gain_rate", &m.gain_rate, 0, 1, false, "evolution", 0.01, false},
        {"gain_step", &m.gain_step, 0, 1, false, "evolution", 0.01, false},

        {"breeder_slots", &e.breeder_slots, 1, 64, true, "evolution", 1, false},
        {"breeder_offspring_weight", &e.breeder_offspring_weight, 0, 100, false, "evolution", 0.1,
         false},
        {"yolk", &e.yolk, 0, 1000, false, "energy", 1, true},
        {"egg_fill_rate", &e.egg_fill_rate, .5, 100, false, "energy", 0.5, true},
        {"egg_reserve", &e.egg_reserve, 0, 500, false, "energy", 1, true},
        {"egg_capacity", &e.egg_capacity, 10, 1000, false, "energy", 1, true},
        {"egg_organ_capacity", &e.egg_organ_capacity, 0, 100, false, "energy", 0.01, false},
        {"egg_overhead", &e.egg_overhead, 0, 100, false, "evolution", 0.1, false},
        {"mating_distance", &world.taxonomy_.mating_distance, .01, 4, false, "evolution", .0025,
         false},
        {"egg_crowding_radius", &e.egg_crowding_radius, 0, 500, false, "evolution", 0.1, false},
        {"egg_crowding_limit", &e.egg_crowding_limit, 1, 100, true, "evolution", 1, false},
        {"impact_damage", &world.physiology_.impact_damage, 0, 1, false, "energy", 0.01, true},
        {"senescence_start", &world.physiology_.senescence_start, 0, 100000, true, "energy", 1,
         true},
        {"senescence_rate", &world.physiology_.senescence_rate, 0, .001, false, "energy", 1e-06,
         true},
        {"development_queries", &e.development_queries, 4096, 1048576, true, "evolution", 1, false},
        {"development_query_limit", &e.development_query_limit, 4096, 8388608, true, "evolution", 1,
         false},
        {"development_finalizations", &e.development_finalizations, 1, 64, true, "evolution", 1,
         false},
        {"bite_wound", &world.physiology_.bite_wound, .075, 1, false, "energy", 0.005, false},
        {"wound_weakness", &world.physiology_.wound_weakness, 0, 1, false, "energy", 0.01, false},
        {"size_physics", &world.physiology_.size_physics, 0, 1, true, "energy", 1, false},
        {"sperm_fill_rate", &e.sperm_fill_rate, .05, 10, false, "energy", 0.05, true},
        {"sperm_capacity", &world.physiology_.sperm_capacity, 2, 500, false, "energy", 0.01, true},
        {"sperm_portion", &e.sperm_portion, .1, 50, false, "energy", 0.01, true},
        {"sperm_mixing", &world.physiology_.sperm_mixing, .001, 5, false, "energy", 0.001, true},
        {"sperm_dilution", &world.physiology_.sperm_dilution, .00001, 1, false, "energy", 1e-05,
         true},
        {"sperm_opaque", &world.physiology_.sperm_opaque, .00001, 1, false, "energy", 1e-05, true},
        {"water_clarity", &f.water_clarity, 10, 1000, false, "energy", 0.01, true},
        {"ink_density", &f.ink_density, 0, 1, false, "energy", 0.01, true},
        {"sinking", &world.physiology_.sinking, 0, .02, false, "energy", 0.0001, true},
        {"bladder_strength", &world.physiology_.bladder_strength, 0, .05, false, "energy", 0.0001,
         true},
        {"bladder_rate", &world.physiology_.bladder_rate, .0001, .05, false, "energy", 0.0001,
         true},
        {"bladder_cost", &world.physiology_.bladder_cost, 0, 1, false, "energy", 0.001, true},
        {"touch_rest", &world.physiology_.touch_rest, 0, 1, false, "senses", 0.01, true},
        {"stroke_threshold", &world.physiology_.stroke_threshold, 0, 10, false, "body", 0.01, true},
        {"drag_along", &world.physiology_.drag_along, 0, 2, false, "body", 0.001, true},
        {"drag_across", &world.physiology_.drag_across, 0, 2, false, "body", 0.001, true},
        {"turn_cost", &world.physiology_.turn_cost, 0, 1, false, "energy", 0.0001, true},
        {"transfer_cost", &world.physiology_.transfer_cost, 0, 1, false, "energy", 0.0001, true},
        {"pigment_cost", &world.physiology_.pigment_cost, 0, 1, false, "energy", 0.0001, true},
        {"bite_cost", &world.physiology_.bite_cost, 0, 1, false, "energy", 0.0001, true},
        {"defense_cost", &world.physiology_.defense_cost, 0, 1, false, "energy", 0.001, true},
        {"spine_rate", &world.physiology_.spine_rate, 0, 1, false, "body", 0.001, true},
        {"spine_max", &world.physiology_.spine_max, 0, 1, false, "body", 0.01, true},
        {"pigment_rate", &world.physiology_.pigment_rate, 0, 1, false, "body", 0.001, true},
        {"wall_restitution", &world.physiology_.wall_restitution, 0, 1, false, "body", 0.01, true},
        {"spine_abrasion", &world.physiology_.spine_abrasion, 0, 1, false, "body", 0.0001, true},
        {"stroke_turn", &world.physiology_.stroke_turn, 0, 180, false, "energy", 0.1, true},
        {"stroke_push", &world.physiology_.stroke_push, 0, 10, false, "energy", 0.0001, true},
        {"swimming_cost", &world.physiology_.swimming_cost, 0, 2, false, "energy", 0.00001, true},
        {"suction_cost", &world.physiology_.suction_cost, 0, 2, false, "energy", 0.0001, true},
        {"suction_range", &world.physiology_.suction_range, .25, 4, false, "energy", 0.01, false},
        {"basal_metabolism", &world.physiology_.basal_metabolism, .1, 2, false, "energy", 0.01,
         false},
        {"novelty_strength", &world.novelty_strength, 0, 1, false, "evolution", 0.01, false},
        {"novelty_neighbors", &e.novelty_neighbors, 1, 50, true, "evolution", 1, false},

        {"food_min", &f.feeding_.food_min, 1, 200, false, "food", 0.1, false},
        {"food_max", &f.feeding_.food_max, 1, 400, false, "food", 0.1, false},
        {"food_bright", &f.feeding_.food_bright, 1, 1000, false, "food", 0.1, false},

        {"food_cluster", &f.feeding_.food_cluster, 1, 20, true, "food", 1, false},
        {"food_spread", &f.feeding_.food_spread, 0, 1000, false, "food", 0.1, false},
        {"source_motion", &f.feeding_.source_motion, 0, 1000, false, "food", 1, false},
        {"food_sink", &f.feeding_.food_sink, .05, 4, false, "food", 0.05, false}};
    auto burst = [&](auto &b, const char *prefix, const char *group, double maximum) {
      struct Entry {
        const char *suffix;
        Number *value;
        double lo, hi;
        bool integer;
      };
      for (auto e : std::initializer_list<Entry>{{"gap", &b.gap, 1, 100000, true},
                                                 {"duration", &b.duration, 1, 10000, true},
                                                 {"strength", &b.strength, 0, maximum, false}}) {
        auto name = std::string(prefix) + e.suffix;
        table.push_back({name, e.value, e.lo, e.hi, e.integer, group});
      }
    };
    burst(world.food_burst, "burst_food_", "burst-food", 9);
    burst(world.mutation_burst, "burst_mutation_", "burst-mutation", 1);
    return table;
  }
};
std::vector<ParameterInfo> Ecosystem::parameters() const {
  static const auto defaults = [] {
    const Ecosystem world(0);
    std::map<std::string, double> values;
    for (const auto &p : ParameterAccess::bindings(world))
      values[p.name] = *p.value;
    return values;
  }();
  std::vector<ParameterInfo> result;
  for (const auto &p : ParameterAccess::bindings(*this))
    result.push_back(
        {p.name, *p.value, p.lo, p.hi, p.integer, p.group, p.step, defaults.at(p.name), p.initial});
  return result;
}
void Ecosystem::set_neural_cost(double value) {
  if (!std::isfinite(value))
    throw std::invalid_argument("invalid neural cost");
  physiology_.neural_cost = std::clamp(value, .01, 100.);
}
bool Ecosystem::set_parameter(const std::string &name, double value) {
  placement_notice.clear();
  if (!std::isfinite(value))
    return false;
  auto table = ParameterAccess::bindings(*this);
  for (auto &p : table)
    if (name == p.name) {
      value = std::clamp(value, p.lo, p.hi);
      if (p.integer)
        value = std::round(value);
      if (name == "food_supply_share" || name == "plankton_supply_share" ||
          name == "benthic_supply_share") {
        const auto &e = field.env();
        if (e.food_supply_share + e.plankton_supply_share + e.benthic_supply_share - *p.value +
                value >
            1 + 1e-12)
          return false;
      }
      *p.value = value;
      if (name == "organ_mass_ref")
        for (auto &fish : this->fish)
          fish.body.organ_mass_ref = physiology_.organ_mass_ref;
      if (name == "sperm_capacity")
        for (auto &fish : this->fish)
          fish.body.reproduction_.sperm_limit =
              organ_capacity(fish.body, fish.genome, 5, physiology_.sperm_capacity);
      if (name == "egg_capacity" || name == "egg_organ_capacity")
        for (auto &fish : this->fish)
          fish.body.reproduction_.egg_limit =
              ovary_capacity(fish.body, fish.genome, evo.egg_capacity, evo.egg_organ_capacity);
      for (auto &other : table) {
        if (name == "food_min" && other.name == "food_max")
          *other.value = std::max(*other.value, value);
        if (name == "food_max" && other.name == "food_min")
          *other.value = std::min(*other.value, value);
      }
      refresh_food_allowance();
      if (name.rfind("burst_food_", 0) == 0)
        food_pulse = {};
      if (name.rfind("burst_mutation_", 0) == 0)
        mutation_pulse = {};
      return true;
    }
  return false;
}
void Ecosystem::advance_bursts() {
  auto draw = [&](double a, double b) {
    return std::uint64_t(std::max(1., std::round(rng.uniform(std::min(a, b), std::max(a, b)))));
  };
  auto advance = [&](const BurstParameters &config, BurstState &state, bool food) {
    if (state.active(ticks))
      return;
    if (config.strength <= 0) {
      state = {};
      return;
    }
    if (!state.next) {
      state.next = ticks + draw(config.gap * .7, config.gap * 1.3);
      return;
    }
    if (state.until) {
      if (ticks < state.until)
        return;
      state.until = 0;
      state.manual_strength = 0;
      state.next = ticks + draw(config.gap * .7, config.gap * 1.3);
      return;
    }
    if (ticks < state.next)
      return;
    state.until = ticks + draw(config.duration * .7, config.duration * 1.3);
    if (food) {
      state.size = rng.uniform(.6, 1.4);
      state.cluster = double(draw(std::max(1., field.feeding().food_cluster * .5),
                                  std::min(20., field.feeding().food_cluster * 2)));
    }
  };
  advance(food_burst, food_pulse, true);
  advance(mutation_burst, mutation_pulse, false);
}
bool Ecosystem::trigger_burst(const std::string &name) {
  BurstParameters *config = nullptr;
  BurstState *pulse = nullptr;
  if (name == "food") {
    config = &food_burst;
    pulse = &food_pulse;
  } else if (name == "mutation") {
    config = &mutation_burst;
    pulse = &mutation_pulse;

  } else
    return false;
  pulse->next = ticks;
  pulse->until = ticks + std::uint64_t(std::max(1., config->duration));
  pulse->manual_strength = config->strength > 0 ? config->strength : name == "mutation" ? .25 : 1;
  if (name == "food") {
    pulse->size = 1;
    pulse->cluster = field.feeding().food_cluster;
  }
  return true;
}
double Ecosystem::mutation_strength(bool) {
  double strong = 0;
  if (mutation_pulse.active(ticks))
    strong = std::max(strong, std::max(mutation_burst.strength, mutation_pulse.manual_strength));
  return rng.uniform() < std::clamp(strong, 0., 1.) ? std::min(1., 2.5 * evo.mutation)
                                                    : evo.mutation;
}
void Ecosystem::feed_burst() {
  auto supply = field.food_supply();
  const double rate = supply.rate, lo = supply.minimum, hi = supply.maximum, limit = supply.limit;
  const double strength = std::max(food_burst.strength, food_pulse.manual_strength);
  bool enabled = food_burst.strength > 0 && food_pulse.next;
  bool active = food_pulse.active(ticks);
  supply.factor = active ? 1 + strength
                  : enabled
                      ? std::max(0., 1 - food_burst.strength * food_burst.duration / food_burst.gap)
                      : 1;
  supply.rate = rate * supply.factor;
  if (active) {
    supply.limit = std::min(20000., std::floor(limit * (1 + strength)));
    supply.minimum = std::clamp(lo * food_pulse.size, 1., 200.);
    supply.maximum = std::clamp(hi * food_pulse.size, supply.minimum, 200.);
    supply.cluster = food_pulse.cluster;
  }
  field.top_up(supply);
}
std::uint64_t Ecosystem::performance_window() const {
  double cycle = 0;
  for (const auto *b : {&food_burst, &mutation_burst})
    if (b->strength > 0)
      cycle = std::max(cycle, b->gap + b->duration);
  return std::uint64_t(std::max(1000., cycle > 0 ? std::ceil(3 * 1.3 * cycle) : 6000.));
}
void Ecosystem::record_performance() {
  metrics_.record(ticks, performance_window());
  for (auto &s : taxonomy_.species) {
    if (ticks % 100 == 0)
      s.replacement_history.push_back({ticks, s.replacement_hatches, s.replacement_deaths});
    while (s.replacement_history.size() > 1 &&
           s.replacement_history[1].tick <= metrics_.performance_history.front().tick)
      s.replacement_history.pop_front();
    while (s.replacement_history.size() > 8192)
      s.replacement_history.pop_front();
  }
}
PerformanceSample Ecosystem::performance() const {
  return metrics_.performance(ticks);
}

}
