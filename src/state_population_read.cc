#include "state_population.hh"
#include "state_validation.hh"
#include "body_state_limits.hh"
#include "environment.hh"
#include "species_registry.hh"
#include "physiology.hh"
#include <map>
#include <set>
namespace fishsim {
using state::same_options;
using state::scalar;
using state::value;
void PopulationCheckpoint::read_identity(std::istream &in, Individual &p,
                                         const PopulationStateContext &context,
                                         std::set<std::uint64_t> &ids) {
  p.genome = state::genome(in, context.genes, false);
  value(in, p.id);
  value(in, p.parent);
  value(in, p.father);
  value(in, p.born);
  value(in, p.last_spawn);
  value(in, p.depth);
  value(in, p.offspring);
  value(in, p.origin);
  value(in, p.observations_.window_food);
  value(in, p.observations_.window_steps);
  scalar(in, p.observations_.window_turn, 0, 1e9);
  value(in, p.observations_.window_pauses);
  value(in, p.fertilised);
  value(in, p.clonal);
  value(in, p.observations_.visited);
  if (p.fertilised && p.clonal)
    throw std::runtime_error("invalid egg mode");
  scalar(in, p.novelty, 0, 4);
  scalar(in, p.observations_.window_travel, 0, 1e12);
  value(in, p.last_sperm);
  value(in, p.observations_.window_eggs);
  value(in, p.observations_.window_corpses);
  value(in, p.species);
  value(in, p.maternal_species);
  value(in, p.paternal_species);
  value(in, p.maternal_depth);
  value(in, p.paternal_depth);
  value(in, p.maternal_natural);
  value(in, p.paternal_natural);
  value(in, p.observations_.window_mouth);
  value(in, p.g);
  value(in, p.maternal_g);
  value(in, p.nutrient_egg);
  value(in, p.feeding_generations);
  std::string life_tag;
  value(in, life_tag);
  value(in, p.body.immortal);
  value(in, p.remembered);
  value(in, p.assisted);
  value(in, p.death_cause);
  if (life_tag != "LIFE" || p.death_cause < -1 || p.death_cause > 7 ||
      (p.body.immortal && !p.assisted) || (p.assisted && (p.g || p.feeding_generations)))
    throw std::runtime_error("invalid life assistance state");
  if (p.feeding_generations > 2 || (p.origin != 1 && p.feeding_generations))
    throw std::runtime_error("invalid feeding ancestry");
  if (p.g > 2000000 || p.maternal_g > 2000000 || (p.origin != 1 && p.g))
    throw std::runtime_error("invalid aid-free generations");
  if ((p.species && !context.taxonomy.find(p.species)) || (!p.species && p.developing()) ||
      (p.maternal_species && !context.taxonomy.find(p.maternal_species)) ||
      (p.paternal_species && !context.taxonomy.find(p.paternal_species)) || p.maternal_depth < 0 ||
      p.paternal_depth < 0 || p.observations_.window_corpses < 0)
    throw std::runtime_error("invalid ancestry");
  if (p.id == 0 || p.id >= context.next_id || !ids.insert(p.id).second || p.born > context.ticks ||
      p.last_spawn > context.ticks || p.last_sperm > context.ticks ||
      p.observations_.window_eggs < 0 || p.depth < 0 || p.offspring < 0 || p.origin < 0 ||
      p.origin > 3 || p.observations_.window_food < 0 || p.observations_.window_steps < 0 ||
      p.observations_.window_pauses < 0)
    throw std::runtime_error("invalid individual");
}
void PopulationCheckpoint::restore_development(std::istream &in, Individual &p,
                                               std::vector<Genome> &genes,
                                               std::map<std::size_t, Genome> &plans) {
  std::string construction_tag;
  bool pending;
  std::size_t queries, plan_id;
  value(in, construction_tag);
  value(in, pending);
  value(in, queries);
  value(in, plan_id);
  if ((p.nutrient_egg && (pending || queries || plan_id)) || construction_tag != "DEVELOPMENT" ||
      queries > BRAIN_QUERY_LIMIT || plan_id > 2000 || (!pending && (queries || plan_id)) ||
      (!plan_id && queries))
    throw std::runtime_error("invalid brain construction state");
  if (pending) {
    auto known = plans.find(plan_id);
    if (plan_id && known != plans.end()) {
      if (!state::same_development(known->second, p.genome) ||
          known->second.pending_queries() != queries)
        throw std::runtime_error("invalid shared brain plan");
      p.genome = known->second;
    } else {
      p.genome.blueprint.reset();
      p.genome.interface.reset();
      p.genome.growing.reset();
      p.genome.growth_query.reset();
      if (plan_id) {
        // Development yields at anatomical boundaries, even with budget left.
        do {
          const auto before = p.genome.pending_queries();
          if (p.genome.advance_development(queries - before) ||
              (p.genome.pending_queries() == before && before < queries))
            throw std::runtime_error("invalid pending brain progress");
        } while (p.genome.pending_queries() < queries);
        plans.emplace(plan_id, p.genome);
      }
    }
  } else if (!p.nutrient_egg && !p.genome.blueprint) {
    p.genome.compile();
    for (auto &gene : genes)
      if (state::same_development(gene, p.genome)) {
        gene.blueprint = p.genome.blueprint;
        gene.interface = p.genome.interface;
      }
  }
}
void PopulationCheckpoint::read_injuries(std::istream &in, Body &b) {
  {
    value(in, b.fatal_cause);
    if (b.fatal_cause < -1 || b.fatal_cause > 7)
      throw std::runtime_error("invalid fatal cause");
    state::body_scalar(in, b.tissue, state::body_limit_tissue(b));
    state::body_scalar(in, b.health, state::body_limit_health(b));
    state::body_scalar(in, b.motor_.vx, state::body_limit_motor_vx(b));
    state::body_scalar(in, b.motor_.vy, state::body_limit_motor_vy(b));
    state::body_scalar(in, b.motor_.thrust, state::body_limit_motor_thrust(b));
    state::body_scalar(in, b.motor_.torque, state::body_limit_motor_torque(b));
    state::body_scalar(in, b.motor_.aggression, state::body_limit_motor_aggression(b));
    state::body_scalar(in, b.motor_.defense, state::body_limit_motor_defense(b));
    state::body_scalar(in, b.motor_.combat_cost, state::body_limit_motor_combat_cost(b));
    state::body_scalar(in, b.motor_.contact_x, state::body_limit_motor_contact_x(b));
    state::body_scalar(in, b.motor_.contact_y, state::body_limit_motor_contact_y(b));
    state::body_scalar(in, b.motor_.impact, state::body_limit_motor_impact(b));
    state::body_scalar(in, b.nutrient_flow, state::body_limit_nutrient_flow(b));
  }

  {
    std::string tag;
    value(in, tag);
    if (tag != "TISSUE_PEAK")
      throw std::runtime_error("missing peak tissue");
    state::body_scalar(in, b.peak_tissue, state::body_limit_peak_tissue(b));
    state::body_scalar(in, b.birth_tissue, state::body_limit_birth_tissue(b));
  }
}
void PopulationCheckpoint::read_mouth(std::istream &in, Body &b) {
  {
    std::string tag;
    value(in, tag);
    if (tag != "MOUTH")
      throw std::runtime_error("missing mouth state");
    state::body_scalar(in, b.bite_signal, state::body_limit_bite_signal(b));
    state::body_scalar(in, b.egg_shell_radius, state::body_limit_egg_shell_radius(b));
    scalar(in, b.force_scale, .001, 1e9);
    scalar(in, b.resting_defense, 0, 1);
    scalar(in, b.sediment_coverage, 0, 1);
  }
  {
    std::string tag;
    value(in, tag);
    if (tag != "EMBRYO")
      throw std::runtime_error("missing embryo state");
    scalar(in, b.embryo.target_tissue, 0, MAX_TISSUE);
    scalar(in, b.embryo.shell, 0, 1);
    scalar(in, b.embryo.secretion, 0, 1e9);
    scalar(in, b.embryo.pending, 0, 1e9);
    scalar(in, b.embryo.pressure, 0, 1e9);
    for (auto &v : b.embryo.touch)
      scalar(in, v, 0, 1);
    for (auto &v : b.embryo.flow)
      scalar(in, v, 0, 1e9);
    value(in, tag);
    if (tag != "MOUTH_CYCLE")
      throw std::runtime_error("missing mouth cycle");
    scalar(in, b.mouth.phase, -1, MOUTH_CYCLE_STEPS);
    scalar(in, b.mouth.duration, 4, MOUTH_CYCLE_STEPS);
    value(in, b.mouth.cycle);
    value(in, b.mouth.biting);
    value(in, b.mouth.closing);
    scalar(in, b.mouth.opening, 0, 1);
    scalar(in, b.mouth.budget, 0, 1e12);
    scalar(in, b.mouth.credit, 0, b.mouth.budget);
    scalar(in, b.mouth.flow, 0, 1);
    scalar(in, b.mouth.swallowed, 0, 1e12);
    scalar(in, b.mouth.filtered, 0, b.mouth.swallowed);
    if (b.mouth.phase < -1 || b.mouth.phase >= MOUTH_CYCLE_STEPS)
      throw std::runtime_error("invalid mouth phase");
    b.motor_.suction_pose = b.mouth.flow;
    b.motor_.bite_pose = b.mouth.biting ? b.mouth.opening : 0;
  }
}
void PopulationCheckpoint::read_body(std::istream &in, Individual &p,
                                     const PopulationStateContext &context) {
  auto &b = p.body;
  if (p.developing())
    b.prepare(p.genome);
  scalar(in, b.x, 0, context.field.geometry().width);
  scalar(in, b.y, 0, context.field.geometry().height);
  state::body_scalar(in, b.angle, state::body_limit_angle(b));
  state::body_scalar(in, b.motor_.speed, state::body_limit_motor_speed(b));
  state::body_scalar(in, b.motor_.turn, state::body_limit_motor_turn(b));
  state::body_scalar(in, b.motor_.travel, state::body_limit_motor_travel(b));
  value(in, b.eaten);
  value(in, b.hunger);
  value(in, b.age);
  scalar(in, b.energy, 0, context.energy_limit);
  value(in, b.alive);
  value(in, b.hatched);
  value(in, b.hatch_age);
  value(in, b.reproduction_.egg_role);
  state::body_scalar(in, b.reproduction_.spawn_signal,
                     state::body_limit_reproduction_spawn_signal(b));
  state::body_scalar(in, b.reproduction_.readiness, state::body_limit_reproduction_readiness(b));
  state::body_scalar(in, b.reproduction_.contact, state::body_limit_reproduction_contact(b));
  state::body_scalar(in, b.ledger_.movement_cost, state::body_limit_ledger_movement_cost(b));
  state::body_scalar(in, b.ledger_.brain_cost, state::body_limit_ledger_brain_cost(b));
  state::body_scalar(in, b.ledger_.development_cost, state::body_limit_ledger_development_cost(b));
  state::body_scalar(in, b.ledger_.construction_paid,
                     state::body_limit_ledger_construction_paid(b));
  value(in, b.ledger_.queries_paid);
  if (b.ledger_.queries_paid > BRAIN_QUERY_LIMIT)
    throw std::runtime_error("invalid query payment");
  if (b.development_)
    b.development_->prepaid_construction(b.ledger_.construction_paid);
  value(in, b.anchored);
  {
    state::body_scalar(in, b.reproduction_.sperm_signal,
                       state::body_limit_reproduction_sperm_signal(b));
    state::body_scalar(in, b.eat_signal, state::body_limit_eat_signal(b));
    state::body_scalar(in, b.reproduction_.egg_readiness,
                       state::body_limit_reproduction_egg_readiness(b));
    state::body_scalar(in, b.reproduction_.sperm_readiness,
                       state::body_limit_reproduction_sperm_readiness(b));
    value(in, b.eggs_eaten);
    if (b.eggs_eaten < 0)
      throw std::runtime_error("invalid predation count");
    for (auto &c : b.color)
      scalar(in, c, 0, 1);
  }

  read_injuries(in, b);
  read_mouth(in, b);
  if (p.genome.interface)
    b.reproduction_.egg_role = p.genome.interface->motor_counts[4] > 0;
  if (b.age < 0 || b.age > 2000000 || b.eaten < 0 || b.hunger < 0 ||
      (!p.developing() && b.hatched) || (p.nutrient_egg && (p.fertilised || p.clonal || p.g)))
    throw std::runtime_error("invalid fish body");
}
void PopulationCheckpoint::read_measurements(std::istream &in, Individual &p) {
  auto &b = p.body;
  std::string tag;
  value(in, tag);
  if (tag != "MEASUREMENTS")
    throw std::runtime_error("invalid nutritional measurements");
  state::body_scalar(in, b.nutrition, state::body_limit_nutrition(b));
  value(in, b.nutrition_steps);
  if (b.nutrition_steps < 0 || b.nutrition_steps > b.age)
    throw std::runtime_error("invalid nutrition age");
  scalar(in, p.observations_.window_nutrition, 0, 1e12);
  scalar(in, p.observations_.window_prey_nutrition, 0,
         p.observations_.window_nutrition + 1e-9 + 1e-12 * p.observations_.window_nutrition);
  scalar(in, p.observations_.window_spawn, 0, 1e9);
  scalar(in, p.observations_.window_sperm, 0, 1e9);
  for (auto &d : p.observations_.window_traits)
    scalar(in, d, 0, std::max(0, p.observations_.window_steps));
  {
    for (auto &d : p.observations_.raw_diet)
      scalar(in, d, 0, 1e12);
    for (auto &d : p.observations_.diet)
      scalar(in, d, 0, 1e15);
    value(in, p.observations_.habitat_steps);
    value(in, p.observations_.bottom_steps);
    value(in, p.observations_.top_steps);
    for (auto &x : p.observations_.window_diet)
      scalar(in, x, 0, 1e15);
    value(in, p.observations_.window_bottom);
    value(in, p.observations_.window_top);
    value(in, p.observations_.window_pulses);
    value(in, p.observations_.window_glides);
    if (p.observations_.window_bottom + p.observations_.window_top >
            std::uint64_t(p.observations_.window_steps) ||
        p.observations_.window_pulses > std::uint64_t(p.observations_.window_steps) ||
        p.observations_.window_glides > std::uint64_t(p.observations_.window_steps))
      throw std::runtime_error("invalid behavior window");
    if (p.observations_.bottom_steps + p.observations_.top_steps > p.observations_.habitat_steps)
      throw std::runtime_error("invalid habitat measurements");
  }
}
void PopulationCheckpoint::read_swimming(std::istream &in, Body &b) {
  std::string tag;
  value(in, tag);
  if (tag != "SWIMMING")
    throw std::runtime_error("invalid swimming state");
  state::body_scalar(in, b.motor_.water_vx, state::body_limit_motor_water_vx(b));
  state::body_scalar(in, b.motor_.water_vy, state::body_limit_motor_water_vy(b));
  state::body_scalar(in, b.motor_.relative_speed, state::body_limit_motor_relative_speed(b));
  state::body_scalar(in, b.motor_.impulse_left, state::body_limit_motor_impulse_left(b));
  state::body_scalar(in, b.motor_.impulse_right, state::body_limit_motor_impulse_right(b));
  state::body_scalar(in, b.motor_.tail, state::body_limit_motor_tail(b));
  state::body_scalar(in, b.motor_.impulse_forward, state::body_limit_motor_impulse_forward(b));
  state::body_scalar(in, b.motor_.motor_factor, state::body_limit_motor_motor_factor(b));
  for (auto &tension : b.motor_.fin_tension)
    scalar(in, tension, 0, 65536);
  value(in, b.motor_.swimming_pending);
  scalar(in, b.motor_.angular_velocity, -MAX_TURN, MAX_TURN);
}
void PopulationCheckpoint::read_gametes(std::istream &in, Body &b, double energy_limit) {
  std::string tag;
  value(in, tag);
  if (tag != "GAMETES")
    throw std::runtime_error("invalid egg filling state");
  scalar(in, b.reproduction_.egg_yolk, 0, energy_limit);
  value(in, b.reproduction_.egg_laying);
  scalar(in, b.reproduction_.sperm_store, 0, energy_limit);
  for (auto *colors : {&b.reproduction_.egg_color, &b.reproduction_.sperm_color,
                       &b.reproduction_.egg_signal_color, &b.reproduction_.sperm_signal_color})
    for (auto &c : *colors)
      scalar(in, c, 0, 1);
  if ((!b.hatched && (b.reproduction_.egg_yolk > 0 || b.reproduction_.sperm_store > 0)) ||
      (b.reproduction_.egg_laying && b.reproduction_.egg_yolk == 0))
    throw std::runtime_error("invalid retained egg");
}
void PopulationCheckpoint::read_motors(std::istream &in, Body &b) {
  std::string motor_tag;
  value(in, motor_tag);
  if (motor_tag != "MOTORS")
    throw std::runtime_error("invalid motor state");
  for (auto &stroke : b.motor_.strokes) {
    scalar(in, stroke.mean, 0, 1e6);
    scalar(in, stroke.power, 0, 1e6);
    value(in, stroke.recovery);
    if (stroke.recovery < 0 || stroke.recovery > 48)
      throw std::runtime_error("invalid stroke recovery");
  }
  for (auto &x : b.motor_.pigment)
    scalar(in, x, 0, 100000);
  state::body_scalar(in, b.reproduction_.egg_transfer,
                     state::body_limit_reproduction_egg_transfer(b));
  state::body_scalar(in, b.reproduction_.sperm_transfer,
                     state::body_limit_reproduction_sperm_transfer(b));
  value(in, b.reproduction_.sperm_laying);
  state::body_scalar(in, b.motor_.mouth_pose, state::body_limit_motor_mouth_pose(b));
}
void PopulationCheckpoint::read_organs(std::istream &in, Body &b) {
  std::string tag;
  value(in, tag);
  if (tag != "ORGAN_STATE")
    throw std::runtime_error("invalid organ state");
  scalar(in, b.gut_energy, 0, 1e12);
  scalar(in, b.gut_digestible, 0, 1e12);
  scalar(in, b.digestion, 0, 1e12);
  scalar(in, b.rest_cost, 0, 1e12);
  scalar(in, b.digested, 0, 1e12);
  scalar(in, b.feces_pending, 0, 1e12);
  scalar(in, b.organ_mass_ref, .001, 1e12);
  value(in, b.feeding_action);
  value(in, b.feeding_action_age);
  if (b.feeding_action < 0 || b.feeding_action > 10 || b.feeding_action_age < 0 ||
      b.feeding_action_age > 48 || b.gut_digestible > b.gut_energy + 1e-7)
    throw std::runtime_error("invalid digestion state");
  state::body_scalar(in, b.gut_fill, state::body_limit_gut_fill(b));
  state::body_scalar(in, b.pain, state::body_limit_pain(b));
  state::body_scalar(in, b.previous_health, state::body_limit_previous_health(b));
  state::body_scalar(in, b.bladder_fill, state::body_limit_bladder_fill(b));
  state::body_scalar(in, b.buoyancy_force, state::body_limit_buoyancy_force(b));
  value(in, b.reproduction_.egg_release);
  value(in, b.reproduction_.sperm_release);
  b.hormones_.read(in);
  for (auto &v : b.perception_.touch_ring)
    scalar(in, v, 0, 1);
  for (auto &v : b.perception_.impact_ring)
    scalar(in, v, 0, 1e9);
}
void PopulationCheckpoint::read_senses(std::istream &in, Body &b) {
  std::string tag;
  value(in, tag);
  if (tag != "SENSE_SWITCHES")
    throw std::runtime_error("missing sense switches");
  for (auto &disabled : b.perception_.disabled_senses)
    value(in, disabled);
}
void PopulationCheckpoint::read_habitat(std::istream &in, Individual &p) {
  {
    std::string tag;
    value(in, tag);
    if (tag != "HABITAT")
      throw std::runtime_error("invalid habitat");
    for (auto *v : {&p.observations_.window_surface, &p.observations_.window_grass,
                    &p.observations_.window_turbidity, &p.observations_.window_current})
      scalar(in, *v, 0, p.observations_.window_steps);
  }
  {
    std::string tag;
    value(in, tag);
    if (tag != "ECOLOGY")
      throw std::runtime_error("invalid ecology measurements");
    value(in, p.observations_.ecology_steps);
    if (p.observations_.ecology_steps > p.observations_.habitat_steps)
      throw std::runtime_error("invalid ecology age");
    scalar(in, p.observations_.drift_nutrition, 0, p.observations_.diet[5]);
    for (auto &v : p.observations_.habitat_totals)
      scalar(in, v, 0, p.observations_.ecology_steps);
  }
}
void PopulationCheckpoint::read_runtime(std::istream &in, Body &b) {
  {
    std::string tag;
    value(in, tag);
    value(in, b.disease);
    if (tag != "DISEASE" || b.disease < 0 || b.disease > 100000 || (!b.hatched && b.disease))
      throw std::runtime_error("invalid disease state");
  }
  b.perception_.sensor_buffer.resize(state::count(in, 65536));
  for (auto &v : b.perception_.sensor_buffer) {
    double d;
    scalar(in, d, -1, 1);
    v = float(d);
  }
  {
    std::string tag;
    value(in, tag);
    if (tag != "ADAPTED")
      throw std::runtime_error("invalid sensory adaptation state");
    auto &mean = b.perception_.adapted;
    mean.resize(state::count(in, 8192));
    if (!mean.empty() && mean.size() != b.perception_.sensor_buffer.size())
      throw std::runtime_error("sensory adaptation does not match receptors");
    for (auto &v : mean) {
      double d;
      scalar(in, d, 0, 1e9);
      v = float(d);
    }
  }
  double work;
  scalar(in, work, 0, 1e9);
  if (b.development_)
    b.development_->restore(work);
  else if (work != 0)
    throw std::runtime_error("work stored before brain planning completed");
  if (b.brain_)
    b.brain_->read_runtime(in);
}
void PopulationCheckpoint::read(std::istream &in, std::vector<Individual> &fish,
                                const PopulationStateContext &context) {
  std::map<std::size_t, Genome> plans;
  std::set<std::uint64_t> ids;
  fish.clear();
  for (auto remaining = state::count(in, 20000000); remaining; --remaining) {
    Individual p;
    read_identity(in, p, context, ids);
    restore_development(in, p, context.genes, plans);
    state::value(in, p.observations_.hormone_release_pending);
    scalar(in, p.observations_.hormone_nutrition_sample, 0, 1e18);
    p.observations_.hormones.read(in);
    p.observations_.window_hormones.read(in);
    read_body(in, p, context);
    read_measurements(in, p);
    read_swimming(in, p.body);
    read_gametes(in, p.body, context.energy_limit);
    read_motors(in, p.body);
    read_organs(in, p.body);
    read_senses(in, p.body);
    read_habitat(in, p);
    read_runtime(in, p.body);
    fish.push_back(std::move(p));
  }
}
void read_population_state(std::istream &in, std::vector<Individual> &fish,
                           const PopulationStateContext &context) {
  PopulationCheckpoint::read(in, fish, context);
}

}
