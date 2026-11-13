#include "maturation_cache.hh"
#include "physiology.hh"
#include "brain_interface.hh"
#include <stdexcept>
namespace fishsim {
namespace {
constexpr double PROTECTED_CONSTRUCTION_ENERGY = 1e6;
}
// The jaw has two antagonists that work like every other muscle: a twitch pulls with its present
// drive under its rise and fall. The opener (suction) pulls the mouth open as its twitch rises and
// lets it spring back as it fades; the water it draws follows the same curve and its drive, so
// slow and fast openers draw alike over time while fast ones gulp hard and short. The closer (bite)
// gathers force over the first half of its stroke while the opener may still hold the jaw open, and
// snaps it shut when its pull peaks; the bite takes no more than the widest gape before the snap
// lets through. Without an opener the jaw opens only slowly to rest; without a closer it shuts
// without a bite. The gill covers draw water on through the open mouth; they filter it themselves
// (feeding.cc), so it carries nothing into the mouth.
void advance_mouth(Body &b, bool pump_started, bool bite_started, double pump_steps,
                   double bite_steps) {
  auto &m = b.mouth;
  m.closing = false;
  m.swallowed = m.filtered = 0;
  const double suction = std::clamp(b.eat_signal, 0., 1.), stroke = std::max(1., pump_steps);
  if (m.biting && ++m.phase >= m.duration) {
    m.biting = false;
    m.phase = -1;
  }
  if (bite_started && !m.biting) {
    ++m.cycle;
    m.biting = true;
    m.phase = 0;
    m.duration = std::max(1., bite_steps);
    m.gape = std::max(MOUTH_REST, m.opening);
  }
  if (pump_started) {
    m.credit = 0;
    m.twitch = 0;
  } else if (m.twitch >= 0 && ++m.twitch >= stroke)
    m.twitch = -1;
  // The twitch as stroke_delivery shapes it: pull rises to 1 and falls, its shares sum to 1.
  const double rise = std::sin(PI * (m.twitch + .5) / stroke),
               pull = m.twitch >= 0 ? rise * rise : 0,
               target = MOUTH_REST + (1 - MOUTH_REST) * pull;
  const double snap = jaw_snap(m);
  m.closing = m.biting && m.phase == snap;
  if (jaw_shutting(m))
    m.opening = m.gape * std::max(0., 1 - (m.phase - snap + 1) / (m.duration - snap));
  else if (pull > 0)
    m.opening = std::min(target, m.opening + (1 - MOUTH_REST) * PI / stroke);
  else
    m.opening += std::clamp(MOUTH_REST - m.opening, -MOUTH_DRIFT, MOUTH_DRIFT);
  if (m.biting && m.phase < snap)
    m.gape = std::max(m.gape, m.opening);
  const bool open = !jaw_shutting(m);
  const double drawn = open ? std::clamp(b.gill_signal, 0., 1.) * m.opening : 0;
  m.flow = open ? std::min(1., suction * pull + drawn) : 0;
  // The twitch's shares 2 * pull average one over its length, like the force of every twitch.
  if (open)
    m.credit += swallow_area(b) * suction * 2 * pull * MOUTH_TRANSPORT_RATE;
}
double maternal_reserve(const Body &b, double adult_reserve) {
  return std::max(0., adult_reserve) * std::sqrt(std::max(0., b.tissue) / BODY_TISSUE);
}
double embryo_development(const Body &b) {
  if (b.hatched)
    return 1;
  if (!b.brain() || !b.development())
    return 0;
  const auto &brain = *b.brain();
  const auto cells = brain.blueprint().neurons.size();
  double progress = 0;
  for (std::size_t i = 0; i < cells; ++i)
    progress += brain.dead(i) ? 1 : brain.development_progress(i);
  return cells ? b.development()->work_fraction() * progress / cells : 0;
}
double minimum_egg_energy(const Genome &g, const PhysiologyParameters &p, int incubation_steps) {
  if (!g.blueprint || !g.interface)
    return 0;
  auto stage = embryo_construction_template(g);
  if (!stage.viable())
    return ENERGY_MAX;
  double energy = HATCH_TISSUE +
                  HATCH_RESERVE_FRACTION * reserve_capacity_for_tissue(HATCH_TISSUE) +
                  g.blueprint->queries / QUERY_ENERGY_DIVISOR;
  for (int step = 0, steps = std::max(stage.work_ticks(), incubation_steps); step < steps; ++step) {
    const double tissue = HATCH_TISSUE * stage.work_fraction();
    energy += basal_cost(tissue, p) + muscle_upkeep(g.interface->muscle_maintenance, tissue, p);
    stage.advance();
    energy += stage.running_cost() * p.neural_cost;
  }
  return energy + embryo_construction_template(g).remaining_construction() * p.neural_cost;
}
double egg_energy_needed(const Body &parent, const Genome &g, const PhysiologyParameters &p) {
  // Embryos also move and learn before they hatch; the parent's own incubation shows that cost.
  const double observed =
      parent.hatch_age > 0 ? HATCH_TISSUE + hatch_search_reserve(parent) + parent.embryo.spent : 0;
  return std::max(minimum_egg_energy(g, p, parent.hatch_age), observed);
}
double development_energy(const Genome &g, double scale, double yolk) {
  const double upkeep = g.interface ? g.interface->muscle_maintenance : 0;
  const auto estimate = [&] {
    if (g.blueprint)
      return embryo_construction_template(g);
    const auto &o = g.development_options;
    const auto n = std::min(field::DEVELOPMENT_SITES, o.max_nodes);
    return field::EmbryoConstruction(n, std::min(o.max_edges, n * n));
  }();
  const double steps = estimate.work_ticks();
  yolk = std::max(yolk, HATCH_TISSUE +
                            HATCH_RESERVE_FRACTION * reserve_capacity_for_tissue(HATCH_TISSUE) +
                            steps * (FOUNDER_UPKEEP_ALLOWANCE + upkeep));
  return std::max(yolk, estimate.birth_cost() * scale + yolk +
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
  return belly_room(b) * organ_capacity(b, g, organ_port::eggs, ceiling, per_cell);
}

double body_mass(const Body &b) {
  return std::max(MIN_BODY_MASS,
                  (1 + digestion::wall_mass * gut_size_factor(b)) * b.tissue / BODY_TISSUE +
                      (std::max(0., b.energy) + b.reproduction().egg_yolk +
                       b.reproduction().sperm_store + b.gut_fill + b.embryo.secretion +
                       b.embryo.pending) /
                          RESERVE_ENERGY_PER_MASS) +
         b.organ_mass;
}
double stored_energy(const Body &b) {
  return std::max(0., b.energy) + std::max(0., b.tissue) + b.reproduction().egg_yolk +
         b.reproduction().sperm_store + b.gut_energy + b.feces_pending + b.embryo.secretion +
         b.embryo.pending;
}
void empty_stores(Body &b) {
  b.energy = b.tissue = b.reproduction_.egg_yolk = b.reproduction_.sperm_store = b.gut_energy =
      b.gut_flesh = b.gut_raw = b.gut_rot = b.gut_mild = b.gut_plant = b.gut_fill =
          b.feces_pending = b.feces_plant = b.embryo.secretion = b.embryo.pending = 0;
}
Color corpse_color(const Color &base, double age, double energy, double bright, double half_life) {
  double fresh = std::exp2(-age / half_life);
  Color color;
  for (int k = 0; k < rgb::count; ++k)
    color[k] = fresh * base[k] + (1 - fresh) * (k == rgb::red ? std::min(1., energy / bright) : 0);
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
  if (!b.alive || b.hatched || !b.development_ || !b.development_->complete() ||
      b.tissue < HATCH_TISSUE || b.energy < hatch_search_reserve(b))
    return;
  b.birth_tissue = b.tissue;
  b.peak_tissue = std::max(b.peak_tissue, b.tissue);
  b.hatched = true;
  b.hatch_age = b.age;
  b.embryo.pending += b.embryo.secretion;
  b.embryo.secretion = 0;
}
std::optional<double> predicted_hatch_reserve(const Body &b, const Genome &g, double neural_cost) {
  if (b.hatched || !g.blueprint || !g.interface || !g.viable())
    return std::nullopt;
  auto stage = b.development() ? *b.development()
                               : embryo_construction_template(g, g.interface->mobile_reproductive);
  if (!stage.viable())
    return std::nullopt;
  double queries =
      double(std::max(g.blueprint->queries, b.ledger().queries_paid) - b.ledger().queries_paid) /
      QUERY_ENERGY_DIVISOR;
  const double remaining = b.energy - stage.remaining_cost() * neural_cost - queries,
               tissue = b.embryo.target_tissue > 0 ? std::max(0., b.embryo.target_tissue - b.tissue)
                                                   : hatch_tissue(remaining);
  return remaining - tissue;
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
double take_nutrition(Body &b, double amount, const Fodder &f, const PhysiologyParameters &p) {
  const double accepted = std::clamp(amount, 0., gut_room(b, f)),
               usable = accepted * digestibility(b, f, p);
  b.gut_energy += accepted;
  b.gut_flesh += accepted * f.flesh;
  b.gut_raw += accepted;
  b.gut_mild += f.mild ? accepted : 0;
  b.gut_plant += f.plant ? accepted : 0;
  b.gut_fill += accepted * f.fill;
  b.nutrition += usable;
  b.nutrient_flow += PhysiologyParameters::nutrient_share * usable;
  if (accepted > 0)
    b.hunger = 0;
  return accepted;
}
// One step of the gut. What it holds counts as one food, as much flesh as its parts together.
// Its closed part is broken open, its open part is taken up or spoils, and all of it moves on;
// the gut muscle moves it sooner. A fish with a full reserve takes up nothing and holds its
// meal. Much spoiled matter hurts, and so do plants that pass still closed: the gut empties
// itself and the body wears down. Returns what leaves as faeces.
double digest_nutrition(Body &b, const PhysiologyParameters &p) {
  b.digestion = b.gut_irritation = 0;
  if (!b.alive || !b.hatched || b.gut_energy <= 0)
    return 0;
  const double held = b.gut_energy, fresh = std::max(0., held - b.gut_rot),
               open = std::max(0., fresh - b.gut_raw),
               flesh = fresh > 0 ? std::clamp(b.gut_flesh / fresh, 0., 1.) : 0,
               pace = gut_pace(b, p), stay = 1 / pace;
  // What hurts: spoiled matter lying in the gut, and plant matter passing on still closed.
  const double harsh = 1 - std::clamp(b.gut_mild / held, 0., 1.), capacity = gut_capacity(b),
               spoilt = (harsh * b.gut_rot / capacity - digestion::tolerated) / digestion::cramp,
               closed = (harsh * (1 - flesh) * b.gut_raw * pace / capacity -
                         digestion::closed_tolerated) /
                        digestion::closed_cramp;
  b.gut_irritation = std::clamp(std::max(0., spoilt) + std::max(0., closed), 0., 1.);
  harm_body(b, digestion::harm * b.gut_irritation, death_reason::hunger);
  const bool full = b.energy >= reserve_capacity(b);
  const double room = std::max(0., reserve_capacity(b) - b.energy);
  b.digestion = full ? 0 : std::min(open * digestion::uptake_rate, room / (1 - p.digestion_cost));
  const double opened = b.gut_raw * digestion::opening_rate(stay, flesh),
               spoiled = (open - b.digestion) * digestion::spoiling_rate(stay, flesh);
  const bool resting = full && b.gut_motility <= 0 && b.gut_irritation <= 0;
  const double passage =
                   resting ? 0 : std::min(1., pace * (1 + digestion::diarrhoea * b.gut_irritation)),
               left = held - b.digestion, lost = left * passage, kept = (left - lost) / held,
               stays = 1 - passage;
  b.feces_plant += b.gut_plant * lost / held;
  b.gut_flesh *= fresh > 0 ? (fresh - b.digestion - spoiled) * stays / fresh : 0;
  b.gut_raw = (b.gut_raw - opened) * stays;
  b.gut_rot = (b.gut_rot + spoiled) * stays;
  b.gut_energy = left - lost;
  b.gut_plant *= kept;
  b.gut_mild *= kept;
  b.gut_fill *= kept;
  b.energy += (1 - p.digestion_cost) * b.digestion;
  b.digested += b.digestion;
  return lost;
}
void mobilize_tissue(Body &b, double target) {
  if (!b.hatched || !b.alive || b.health <= 0 || b.energy >= target)
    return;
  b.peak_tissue = std::max(b.peak_tissue, b.tissue);
  const double consumed = std::min(std::max(0., b.tissue - tissue_floor(b)),
                                   (target - b.energy) / PhysiologyParameters::catabolism_yield);
  harm_body(b, starvation_damage(b, consumed), death_reason::hunger);
  b.tissue -= consumed;
  b.energy += PhysiologyParameters::catabolism_yield * consumed;
}
double pay_activity(Body &b, double requested, bool protected_life) {
  if (requested <= 0)
    return 0;
  if (protected_life || b.immortal)
    return requested;
  mobilize_tissue(b, requested);
  const double paid = std::min(requested, std::max(0., b.energy));
  b.energy -= paid;
  return paid;
}
void maintain_body(Body &b, bool protected_life) {
  if (!b.alive)
    return;
  if (b.immortal) {
    b.energy = std::max(1., b.energy);
    return;
  }
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
        b.fatal_cause = death_reason::hunger;
    }
    return;
  }
  if (b.tissue == 0 && !b.development_ && b.energy >= BODY_TISSUE) {
    b.energy -= BODY_TISSUE;
    b.tissue = BODY_TISSUE;
  }
  b.peak_tissue = std::max(b.peak_tissue, b.tissue);
  const double minimum = tissue_floor(b);
  if (b.energy < 0 && !protected_life)
    mobilize_tissue(b, 0);
  b.energy = std::max(0., b.energy);
  if (!protected_life && (b.health <= 0 || b.tissue <= minimum)) {
    if (b.fatal_cause < 0)
      b.fatal_cause = death_reason::hunger;
    b.alive = false;
    return;
  }
  const double surplus = (1 - PhysiologyParameters::digestion_cost) * b.digestion -
                         b.ledger().movement_cost - b.ledger().brain_cost;
  using P = PhysiologyParameters;
  if (!protected_life && b.energy > P::growth_reserve * reserve_capacity(b) && surplus > 0 &&
      b.tissue < tissue_capacity(b)) {
    constexpr double build = 1 + P::growth_cost;
    double growth = std::min(P::growth_rate * growth_permission(b) *
                                 std::sqrt(std::max(1., b.tissue / BODY_TISSUE)),
                             std::min(tissue_capacity(b) - b.tissue, surplus / build));
    b.energy -= growth * build;
    b.tissue += growth;
    b.peak_tissue = std::max(b.peak_tissue, b.tissue);
  }
  if (!protected_life && b.energy > P::heal_reserve * reserve_capacity(b) && b.health < 1) {
    const double before = 1 - b.health;
    b.health = std::min(1., b.health + P::heal_rate);
    for (auto &v : b.damage_sectors)
      v *= before > 0 ? (1 - b.health) / before : 0;
    b.energy -= P::heal_cost;
  }
}
void injure(Body &b, double damage, bool protected_life, Point normal) {
  if (protected_life || b.immortal || damage <= 0 || !b.alive)
    return;
  const double bearing = (normal.x || normal.y) ? std::atan2(normal.y, normal.x)
                                                : std::numeric_limits<double>::quiet_NaN();
  double prevented = damage * b.local_defense(bearing),
         cost = prevented * BODY_TISSUE * PhysiologyParameters::spine_block_cost;
  const double paid = pay_activity(b, cost);
  if (cost > 0)
    prevented *= paid / cost;
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
void Body::grow_brain(const Genome &g, const PhysiologyParameters &p, bool protected_life) {
  if (growth_prepared_ || !alive)
    return;
  growth_prepared_ = true;
  organ_mass_ref = p.organ_mass_ref;
  prepare(g);
  if (!brain_)
    return;
  if (!hatched && embryo.target_tissue == 0)
    embryo.target_tissue = hatch_tissue(energy - development_->remaining_cost() * p.neural_cost);
  const double missing = hatched ? 0 : std::max(0., embryo.target_tissue - tissue);
  const double reserve = hatched ? PhysiologyParameters::growth_reserve * reserve_capacity(*this)
                                 : hatch_search_reserve(*this);
  const double queries = g.blueprint->queries > ledger_.queries_paid
                             ? (g.blueprint->queries - ledger_.queries_paid) / QUERY_ENERGY_DIVISOR
                             : 0;
  const double available = protected_life
                               ? PROTECTED_CONSTRUCTION_ENERGY
                               : std::max(0., energy - missing - reserve - queries - rest_cost);
  pending_build_cost_ =
      brain_->grow(hormones_.levels(), body_maturity(*this), available, p.neural_cost);
  if (!protected_life) {
    energy -= pending_build_cost_;
    record_incubation(pending_build_cost_);
  }
  refresh_organs(g);
}
bool Body::prepare_step(const Genome &g, const PhysiologyParameters &physiology,
                        bool protected_life) {
  grow_brain(g, physiology, protected_life);
  growth_prepared_ = false;
  nutrient_flow *= PhysiologyParameters::nutrient_keep;
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
      if (!protected_life) {
        energy -= query_cost;
        record_incubation(query_cost);
      }
    }
  }
  ledger_.development_cost = query_cost + pending_build_cost_;
  pending_build_cost_ = 0;
  prepare(g);
  refresh_organs(g);
  rest_cost = (1 + digestion::upkeep * gut_size_factor(*this)) * basal_cost(tissue, physiology) +
              muscle_upkeep(active_muscle_maintenance, tissue, physiology) +
              (development_ ? neural_upkeep() * physiology.neural_cost : 0);
  force_scale = physiology.max_bite_force;
  resting_defense =
      g.interface ? resting_spine_height(active_interface(g).capacities[organ_port::defense],
                                         physiology.resting_spines, physiology.resting_spines_half)
                  : 0;
  if (development_ && !development_->viable()) {
    const double basal = field::DevelopmentCosts{}.egg_basal * physiology.neural_cost;
    ledger_.development_cost += basal;
    ledger_.brain_cost = ledger_.movement_cost = 0;
    if (!protected_life) {
      energy -= basal;
      record_incubation(basal);
    }
    advance_age();
    return false;
  }
  if (g.cppn && !g.blueprint) {
    advance_age();
    ledger_.movement_cost = ledger_.brain_cost = 0;
    const double basal = field::DevelopmentCosts{}.egg_basal * physiology.neural_cost;
    ledger_.development_cost += basal;
    if (!protected_life) {
      energy -= basal;
      record_incubation(basal);
    }
    return false;
  }
  if (g.cppn && !hatched) {
    if (embryo.target_tissue == 0) {
      embryo.target_tissue =
          hatch_tissue(energy - development_->remaining_cost() * physiology.neural_cost);
    }
    development_->advance();
    const double tissue_work =
        std::min(std::max(0., energy),
                 std::max(0., embryo.target_tissue * development_->work_fraction() - tissue));
    if (!protected_life)
      energy -= tissue_work;
    tissue += tissue_work;
    peak_tissue = std::max(peak_tissue, tissue);
    nutrient_flow += physiology.embryo_nutrient_gain * tissue_work;
    return protected_life ||
           energy - std::max(0., embryo.target_tissue - tissue) >= hatch_search_reserve(*this);
  }
  return true;
}
void Body::act(const Genome &g, const PhysiologyParameters &physiology, bool protected_life) {
  ledger_.brain_cost = development_ ? neural_upkeep() * physiology.neural_cost : 0;
  ledger_.movement_cost = std::max(0., rest_cost - ledger_.brain_cost);
  if (!protected_life) {
    energy -= ledger_.movement_cost + ledger_.brain_cost;
    record_incubation(ledger_.movement_cost + ledger_.brain_cost);
  }
  const double reserve =
      hatched ? PhysiologyParameters::growth_reserve * reserve_capacity(*this)
              : hatch_search_reserve(*this) + std::max(0., embryo.target_tissue - tissue);
  brain_->construction_budget(protected_life ? PROTECTED_CONSTRUCTION_ENERGY
                                             : std::max(0., energy - reserve),
                              physiology.neural_cost);
  cppn_action(*this, g, physiology, protected_life);
  const auto &built = brain_->formed_wiring();
  const auto costs = field::scaled_costs(g.development_options);
  const double construction =
      (built.contacts * costs.edge_build + built.length * costs.edge_length_build) *
      physiology.neural_cost;
  ledger_.brain_cost += construction;
  if (!protected_life) {
    energy -= construction;
    record_incubation(construction);
  }
  // Muscle work was paid in cppn_action, unless the body is spared.
  if (!protected_life && !immortal)
    record_incubation(ledger_.muscle_cost + motor_.combat_cost);
  ledger_.movement_cost += ledger_.muscle_cost + motor_.combat_cost;
  motor_.contact_x = motor_.contact_y = 0;
  perception_.touch_ring.fill(0);
  perception_.impact_ring.fill(0);
}
void Body::finish_step() {
  hunger = std::min(800, hunger + 1);
  advance_age();
  if (nutrition_steps < std::numeric_limits<int>::max())
    ++nutrition_steps;
}
void settle_energy(Body &b, bool protected_life) {
  b.balance_held_energy();
  maintain_body(b, protected_life);
  b.balance_held_energy();
}

void Body::balance_held_energy() {
  if (!held_energy_ || !alive || !hatched)
    return;
  const double difference = *held_energy_ - energy;
  supplied_energy_ += std::max(0., difference);
  withdrawn_energy_ += std::max(0., -difference);
  energy = *held_energy_;
}

}
