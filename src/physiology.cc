#include "maturation_cache.hh"
#include "physiology.hh"
#include "brain_interface.hh"
#include <stdexcept>
namespace fishsim {
void advance_mouth(Body &b, bool pump_started, bool bite_started, double pump_steps,
                   double bite_steps) {
  auto &m = b.mouth;
  m.closing = false;
  m.swallowed = m.filtered = 0;
  const double suction = std::clamp(b.eat_signal, 0., 1.);
  if (m.biting) {
    const double previous = m.phase;
    m.phase += MOUTH_CYCLE_STEPS / m.duration;
    m.closing = previous < 4 && m.phase >= 4 && b.bite_signal > 0;
    if (m.phase >= MOUTH_CYCLE_STEPS) {
      m.biting = false;
      m.phase = -1;
    }
  }
  if (bite_started && !m.biting) {
    ++m.cycle;
    m.biting = true;
    m.phase = 0;
    // Finish the closure before this organ can recover and start another one.
    m.duration = std::min(MOUTH_CYCLE_STEPS, std::max(4., std::floor(bite_steps)));
  }
  if (pump_started) {
    m.budget = swallow_area(b) * suction * pump_steps * MOUTH_TRANSPORT_RATE;
    m.credit = 0;
  }
  if (m.biting) {
    constexpr double opening[9] = {.35, .8, 1, 1, .65, .1, 0, .15, .35};
    const int step = int(m.phase);
    m.opening = opening[step] + (opening[step + 1] - opening[step]) * (m.phase - step);
  } else {
    m.opening = std::clamp(
        m.opening + (suction > 0 ? 2 / MOUTH_CYCLE_STEPS : -2 / MOUTH_CYCLE_STEPS), 0., 1.);
  }
  m.flow = suction * m.opening;
  if (m.biting && m.phase >= 4)
    m.flow = 0;
  m.credit = std::min(m.budget, swallow_area(b) * m.flow * MOUTH_TRANSPORT_RATE);
  m.budget -= m.credit;
}
double maternal_reserve(const Body &b, double adult_reserve) {
  return std::max(0., adult_reserve) * std::sqrt(std::max(0., b.tissue) / BODY_TISSUE);
}
double minimum_egg_energy(const Genome &g, const PhysiologyParameters &p) {
  if (!g.blueprint || !g.interface)
    return 0;
  auto stage = maturation_template(g);
  if (!stage.viable())
    return ENERGY_MAX;
  double energy = PhysiologyParameters::tissue_build_cost * HATCH_TISSUE +
                  HATCH_RESERVE_FRACTION * reserve_capacity_for_tissue(HATCH_TISSUE) +
                  g.blueprint->queries / QUERY_ENERGY_DIVISOR;
  // Mandatory costs at minimum viable tissue, following the same construction schedule
  // as Body::prepare_step. Motor, secretion and delayed hatching costs remain additional.
  for (int step = 0, steps = stage.ticks(); step < steps; ++step) {
    const double tissue = HATCH_TISSUE * stage.progress();
    energy += basal_cost(tissue, p) + g.interface->muscle_maintenance * p.basal_metabolism;
    energy += (stage.advance_construction() + stage.running_cost()) * p.neural_cost;
  }
  return energy;
}
double development_energy(const Genome &g, double scale, double yolk) {
  const double upkeep = g.interface ? g.interface->muscle_maintenance : 0;
  const double steps = g.blueprint ? maturation_template(g).ticks() : 100;
  yolk = std::max(yolk, PhysiologyParameters::tissue_build_cost * HATCH_TISSUE +
                            HATCH_RESERVE_FRACTION * reserve_capacity_for_tissue(HATCH_TISSUE) +
                            steps * (FOUNDER_UPKEEP_ALLOWANCE + upkeep));
  double cost;
  if (g.blueprint) {
    const auto &m = maturation_template(g);
    cost = m.birth_cost();
  } else {
    const auto &o = g.development_options;
    auto n = std::min(std::size_t(360), o.max_nodes);
    field::Maturation maximum(n, std::min(o.max_edges, n * n));
    cost = maximum.birth_cost();
  }
  return std::max(yolk, cost * scale + yolk +
                            (g.blueprint ? g.blueprint->queries : BRAIN_QUERY_LIMIT) /
                                QUERY_ENERGY_DIVISOR);
}
double organ_capacity(const Body &b, const Genome &g, int port, double ceiling, double per_cell) {
  const double cells = g.interface ? b.active_interface(g).motor_counts[port] : 0;
  return growth_fraction(b) * std::min(ceiling, per_cell * cells);
}
double gonad_filling(const Body &b) {
  return bounded_filling(b.reproduction().egg_yolk, b.reproduction().egg_limit);
}
double gut_filling(const Body &b) {
  return bounded_filling(b.gut_fill, gut_capacity(b));
}
double ovary_capacity(const Body &b, const Genome &g, double ceiling, double per_cell) {
  return organ_capacity(b, g, 4, ceiling, per_cell);
}

double body_mass(const Body &b) {
  return std::max(.2, b.tissue / BODY_TISSUE + (std::max(0., b.energy) + b.reproduction().egg_yolk +
                                                b.reproduction().sperm_store + b.gut_fill +
                                                b.embryo.secretion + b.embryo.pending) /
                                                   RESERVE_ENERGY_PER_MASS) +
         b.organ_mass;
}
double stored_energy(const Body &b) {
  return std::max(0., b.energy) + std::max(0., b.tissue) + b.reproduction().egg_yolk +
         b.reproduction().sperm_store + b.gut_energy + b.feces_pending + b.embryo.secretion +
         b.embryo.pending;
}
std::array<double, 3> corpse_color(const std::array<double, 3> &base, double age, double energy,
                                   double bright, double half_life) {
  double fresh = std::exp2(-age / half_life);
  std::array<double, 3> color;
  for (int k = 0; k < 3; ++k)
    color[k] = fresh * base[k] + (1 - fresh) * (k == 0 ? std::min(1., energy / bright) : 0);
  return color;
}
void size_egg(Body &b) {
  if (!b.hatched)
    b.egg_shell_radius = std::max(b.egg_shell_radius, egg_radius(b.energy));
}
double hatch_search_reserve(const Body &b) {
  return HATCH_RESERVE_FRACTION *
         reserve_capacity_for_tissue(std::max(HATCH_TISSUE, b.embryo.target_tissue));
}
void mature_body(Body &b) {
  if (!b.alive || b.hatched || !b.development_ || !b.development_->ready() ||
      b.tissue < HATCH_TISSUE || b.energy < hatch_search_reserve(b))
    return;
  b.birth_tissue = b.tissue;
  b.peak_tissue = std::max(b.peak_tissue, b.tissue);
  b.hatched = true;
  b.hatch_age = b.age;
  // Unreleased embryonic secretion remains nonfertile through birth.
  b.embryo.pending += b.embryo.secretion;
  b.embryo.secretion = 0;
}
std::optional<double> predicted_hatch_reserve(const Body &b, const Genome &g, double neural_cost) {
  if (b.hatched || !g.blueprint || !g.interface || !g.viable())
    return std::nullopt;
  auto stage =
      b.development() ? *b.development() : maturation_template(g, g.interface->mobile_reproductive);
  if (!stage.viable())
    return std::nullopt;
  stage.prepaid_construction(b.ledger().construction_paid);
  double queries =
      double(std::max(g.blueprint->queries, b.ledger().queries_paid) - b.ledger().queries_paid) /
      QUERY_ENERGY_DIVISOR;
  const double remaining = b.energy - stage.remaining_cost() * neural_cost - queries,
               tissue = b.embryo.target_tissue > 0 ? std::max(0., b.embryo.target_tissue - b.tissue)
                                                   : hatch_tissue(remaining);
  return remaining - PhysiologyParameters::tissue_build_cost * tissue;
}
double predicted_hatch_radius(const Body &b, const Genome &g, double neural_cost) {
  if (b.hatched)
    return structural_radius(b.birth_tissue > 0 ? b.birth_tissue : b.tissue, b.organ_mass);
  const double queries = g.blueprint
                             ? double(std::max(g.blueprint->queries, b.ledger().queries_paid) -
                                      b.ledger().queries_paid) /
                                   QUERY_ENERGY_DIVISOR
                             : 0;
  const double remaining =
      b.energy - (b.development() ? b.development()->remaining_cost() * neural_cost : 0) - queries;
  return structural_radius(
      b.embryo.target_tissue > 0 ? b.embryo.target_tissue : hatch_tissue(remaining), b.organ_mass);
}
double take_nutrition(Body &b, double amount, int source, const PhysiologyParameters &p) {
  const double accepted = std::clamp(amount, 0., gut_room(b, source, p)),
               usable = accepted * digestibility(b, source);
  b.gut_energy += accepted;
  b.gut_digestible += usable;
  b.gut_fill += accepted * fill_factor(source, p);
  b.nutrition += usable;
  b.nutrient_flow += .2 * usable;
  if (accepted > 0)
    b.hunger = 0;
  return accepted;
}
double digest_nutrition(Body &b, const PhysiologyParameters &p) {
  b.digestion = 0;
  if (!b.alive || !b.hatched || b.energy >= reserve_capacity(b) || b.gut_energy <= 0)
    return 0;
  double fraction = std::min(1., 1 / gut_transit(b, p));
  if (b.gut_digestible > 0)
    fraction = std::min(fraction, std::max(0., reserve_capacity(b) - b.energy) /
                                      ((1 - p.digestion_cost) * b.gut_digestible));
  const double raw = b.gut_energy * fraction;
  b.digestion = b.gut_digestible * fraction;
  b.gut_energy *= 1 - fraction;
  b.gut_digestible *= 1 - fraction;
  b.gut_fill *= 1 - fraction;
  b.energy += (1 - p.digestion_cost) * b.digestion;
  b.digested += b.digestion;
  return std::max(0., raw - b.digestion);
}
namespace {
void mobilize_tissue(Body &b, double target) {
  if (!b.hatched || !b.alive || b.health <= 0 || b.energy >= target)
    return;
  b.peak_tissue = std::max(b.peak_tissue, b.tissue);
  const double consumed =
      std::min(std::max(0., b.tissue - tissue_floor(b)), (target - b.energy) / .8);
  harm_body(b, starvation_damage(b, consumed), 0);
  b.tissue -= consumed;
  b.energy += .8 * consumed;
}
}
double pay_activity(Body &b, double requested, bool protected_life) {
  if (requested <= 0)
    return 0;
  if (protected_life)
    return requested;
  mobilize_tissue(b, requested);
  const double paid = std::min(requested, std::max(0., b.energy));
  b.energy -= paid;
  return paid;
}
void maintain_body(Body &b, bool protected_life) {
  if (!b.alive)
    return;
  if (b.development_ && !b.development_->viable()) {
    b.alive = false;
    return;
  }
  if (!b.hatched) {
    const double body_work = std::max(0., b.embryo.target_tissue - b.tissue);
    if (b.energy <= 0 ||
        (!protected_life && (b.health <= 0 || (b.embryo.target_tissue > 0 &&
                                               b.energy - body_work < hatch_search_reserve(b))))) {
      b.energy = std::max(0., b.energy);
      b.alive = false;
      if (b.fatal_cause < 0)
        b.fatal_cause = 0;
    }
    return;
  }
  if (b.tissue == 0 && !b.development_ &&
      b.energy >= PhysiologyParameters::tissue_build_cost * BODY_TISSUE) {
    b.energy -= PhysiologyParameters::tissue_build_cost * BODY_TISSUE;
    b.tissue = BODY_TISSUE;
  }
  b.peak_tissue = std::max(b.peak_tissue, b.tissue);
  const double minimum = tissue_floor(b);
  if (b.energy < 0 && !protected_life)
    mobilize_tissue(b, 0);
  b.energy = std::max(0., b.energy);
  if (!protected_life && (b.health <= 0 || b.tissue <= minimum)) {
    if (b.fatal_cause < 0)
      b.fatal_cause = 0;
    b.alive = false;
    return;
  }
  const double surplus = (1 - PhysiologyParameters::digestion_cost) * b.digestion -
                         b.ledger_.movement_cost - b.ledger_.brain_cost;
  if (!protected_life && b.energy > .10 * reserve_capacity(b) && surplus > 0 &&
      b.tissue < tissue_capacity(b)) {
    const double growth =
        std::min({.16 * std::sqrt(std::max(1., b.tissue / BODY_TISSUE)),
                  tissue_capacity(b) - b.tissue, surplus / PhysiologyParameters::tissue_build_cost,
                  std::max(0., b.energy - .10 * reserve_capacity(b)) /
                      PhysiologyParameters::tissue_build_cost});
    b.energy -= PhysiologyParameters::tissue_build_cost * growth;
    b.tissue += growth;
    b.peak_tissue = std::max(b.peak_tissue, b.tissue);
  }
  if (!protected_life && b.energy > .15 * reserve_capacity(b) && b.health < 1) {
    const double before = 1 - b.health;
    b.health = std::min(1., b.health + .001);
    for (auto &v : b.damage_sectors)
      v *= before > 0 ? (1 - b.health) / before : 0;
    b.energy -= .03;
  }
}
void injure(Body &b, double damage, bool protected_life, Point normal) {
  if (protected_life || damage <= 0 || !b.alive)
    return;
  const double bearing = (normal.x || normal.y) ? std::atan2(normal.y, normal.x)
                                                : std::numeric_limits<double>::quiet_NaN();
  const double prevented = damage * b.local_defense(bearing);
  double before = b.health;
  b.motor_.impact_wound += std::min(b.health, std::max(0., damage - prevented));
  harm_body(b, damage - prevented, 1, bearing);
  if (b.health < before) {
    b.motor_.blood_loss += before - b.health;
    b.motor_.blood_x = normal.x;
    b.motor_.blood_y = normal.y;
  }
}
void Body::orient_to(double radians) {
  if (!std::isfinite(radians))
    throw std::invalid_argument("invalid orientation");
  angle = std::remainder(radians, 2 * PI);
}
void cppn_action(Body &, const Genome &, const PhysiologyParameters &, bool);
bool Body::prepare_step(const Genome &g, const PhysiologyParameters &physiology,
                        bool protected_life) {
  nutrient_flow *= .8;
  organ_mass_ref = physiology.organ_mass_ref;
  feces_pending += digest_nutrition(*this, physiology);
  feeding_action_age = std::max(0, feeding_action_age - 1);
  if (!feeding_action_age)
    feeding_action = 0;
  if (!alive)
    return false;
  double query_cost = 0;
  if (g.cppn && (!hatched || !brain_)) {
    auto queries = g.blueprint ? g.blueprint->queries : g.pending_queries();
    if (queries > ledger_.queries_paid) {
      query_cost = (queries - ledger_.queries_paid) / QUERY_ENERGY_DIVISOR;
      ledger_.queries_paid = queries;
      if (!protected_life)
        energy -= query_cost;
    }
  }
  ledger_.development_cost = query_cost;
  if (g.blueprint && g.blueprint->resource_limited) {
    auto c = field::scaled_costs(g.development_options);
    double built = g.blueprint->built_neurons * c.neuron_build +
                   g.blueprint->built_edges * c.edge_build +
                   g.blueprint->built_length * c.edge_length_build,
           newly = std::max(0., built - ledger_.construction_paid);
    ledger_.construction_paid += newly;
    double cost = (c.egg_basal + newly) * physiology.neural_cost;
    ledger_.development_cost += cost;
    if (!protected_life)
      energy -= cost;
  }
  prepare(g);
  refresh_organs(g);
  rest_cost = basal_cost(tissue, physiology) +
              active_muscle_maintenance * physiology.basal_metabolism +
              (development_ ? neural_upkeep() * physiology.neural_cost : 0);
  force_scale = physiology.max_bite_force;
  resting_defense =
      g.interface ? resting_spine_height(active_interface(g).capacities[11],
                                         physiology.resting_spines, physiology.resting_spines_half)
                  : 0;
  if (development_ && !development_->viable())
    return false;
  if (g.cppn && !g.blueprint) {
    ++age;
    ledger_.movement_cost = ledger_.brain_cost = 0;
    field::DevelopmentCosts costs;
    double built = g.growing ? g.growing->neurons.size() * costs.neuron_build +
                                   g.growing->built_edges * costs.edge_build +
                                   g.growing->built_length * costs.edge_length_build
                             : 0;
    double newly = std::max(0., built - ledger_.construction_paid);
    ledger_.construction_paid += newly;
    double physical = (costs.egg_basal + newly) * physiology.neural_cost;
    ledger_.development_cost += physical;
    if (!protected_life)
      energy -= physical;
    return false;
  }
  if (g.cppn && !hatched) {
    if (embryo.target_tissue == 0) {
      embryo.target_tissue =
          hatch_tissue(energy - development_->remaining_cost() * physiology.neural_cost);
    }
    const double physical = development_->advance_construction() * physiology.neural_cost;
    const double tissue_work =
        std::min(std::max(0., energy - physical) / PhysiologyParameters::tissue_build_cost,
                 std::max(0., embryo.target_tissue * development_->progress() - tissue));
    ledger_.development_cost +=
        physical + (PhysiologyParameters::tissue_build_cost - 1) * tissue_work;
    if (!protected_life)
      energy -= physical + PhysiologyParameters::tissue_build_cost * tissue_work;
    tissue += tissue_work;
    peak_tissue = std::max(peak_tissue, tissue);
    nutrient_flow += physiology.embryo_nutrient_gain * tissue_work;
    // Settlement records death once at the population barrier; no further action below reserve.
    return protected_life || energy - PhysiologyParameters::tissue_build_cost *
                                          std::max(0., embryo.target_tissue - tissue) >=
                                 hatch_search_reserve(*this);
  }
  return true;
}
void Body::act(const Genome &g, const PhysiologyParameters &physiology, bool protected_life) {
  ledger_.brain_cost = development_ ? neural_upkeep() * physiology.neural_cost : 0;
  ledger_.movement_cost = std::max(0., rest_cost - ledger_.brain_cost);
  if (!protected_life)
    energy -= ledger_.movement_cost + ledger_.brain_cost;
  cppn_action(*this, g, physiology, protected_life);
  ledger_.movement_cost += ledger_.muscle_cost + motor_.combat_cost;
  motor_.contact_x = motor_.contact_y = 0;
  perception_.touch_ring.fill(0);
  perception_.impact_ring.fill(0);
}
void Body::finish_step() {
  hunger = std::min(800, hunger + 1);
  ++age;
  ++nutrition_steps;
}
void settle_energy(Body &b, bool protected_life) {
  maintain_body(b, protected_life);
}

}
