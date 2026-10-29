#include "ecology_internal.hh"
#include "physiology.hh"
#include "parallel.hh"
#include "founder_pool.hh"
namespace fishsim {
namespace {
bool has_organs(const BrainInterface &layout) {
  return layout.mobile_reproductive;
}
}
bool viable_entrant(const Genome &g) {
  if (!g.blueprint || !g.interface || !has_organs(*g.interface) || !g.viable() ||
      g.blueprint->resource_limited)
    return false;
  return !g.blueprint->edges.empty();
}
void develop_entrant(Genome &g, const std::atomic<bool> &stop) {
  bool anatomy_checked = false;
  while (!stop && !g.advance_development(2048)) {
    if (g.growing->resource_limited)
      return;
    if (!anatomy_checked && g.growing->anatomy_complete()) {
      anatomy_checked = true;
      if (!has_organs(*body_interface(*g.growing)))
        return;
    }
  }
}
bool hatch_capable_anatomy(const BrainInterface &body) {
  return body.mobile_reproductive && body.capacities[5] > 0 && body.capacities[4] > 0;
}
bool founder_cell_plan_possible(const field::Substrate &body) {
  bool senses = false;
  std::array<double, field::MOTOR_COUNT> capacity{};
  for (const auto &n : body.neurons) {
    senses |= n.role == field::Role::Sensor && n.strength > 0;
    if (n.role == field::Role::Effector)
      for (int k = 0; k < field::MOTOR_COUNT; ++k)
        capacity[k] +=
            n.strength * n.parameters.capacity * n.functions.usable * n.functions.motors[k];
  }
  // Presence only: a sampled inactive cell or an immature response is not an impossibility proof.
  return senses && capacity[field::Forward] > 0 && capacity[field::Suction] > 0 &&
         capacity[field::Eggs] > 0 && capacity[field::Sperm] > 0;
}
bool founder_actuation_possible(const BrainInterface &body, const PhysiologyParameters &p) {
  // tanh outputs have magnitude <= 1. Each entire organ is an upper bound on either of its
  // production/release or left/right parts, even after individual position jitter.
  if (!hatch_capable_anatomy(body))
    return false;
  for (int port : {4, 5, 6})
    if (body.capacities[port] + 1e-9 < p.stroke_threshold)
      return false;
  if (body.capacities[1] + 1e-9 < p.stroke_threshold &&
      body.capacities[2] + 1e-9 < p.stroke_threshold)
    return false;
  field::CellParameters slow;
  slow.time_constant = 1;
  const double maximum_impulse =
      field::time_constant_steps(slow) * (body.capacities[1] + 2 * body.capacities[2]);
  // Grant full motor payment, completed construction and a completely dissolved shell.
  const double minimum_mass = std::max(p.hatch_mass_floor, .2 + body.organ_mass);
  return maximum_impulse / minimum_mass + 1e-9 >= p.hatch_force_base;
}
bool hatch_candidate(const Genome &g) {
  return viable_entrant(g) && hatch_capable_anatomy(*g.interface);
}
void develop_hatch_candidate(Genome &g, const std::atomic<bool> &stop) {
  bool cells_checked = false;
  while (!stop && !g.advance_development(2048)) {
    if (g.growing->resource_limited)
      return;
    if (!cells_checked && g.growing->cell_parameters_complete()) {
      cells_checked = true;
      if (!founder_cell_plan_possible(*g.growing))
        return;
    }
  }
}
RandomGenomeSearch::RandomGenomeSearch(int workers, MutationRates settings) : rates(settings) {
  if (workers > 1 && !cancelled)
    pool = std::make_unique<Workers>(std::clamp(workers, 1, 64));
}
RandomGenomeSearch::~RandomGenomeSearch() = default;
std::vector<Genome> RandomGenomeSearch::batch(const Genome &source, Rng &rng, int count) {
  // Mutations update a shared innovation history. Draw them serially before any development.
  // Fixed batches and ordered acceptance make the selected genomes independent of thread count.
  std::vector<Genome> candidates;
  candidates.reserve(count);
  for (int i = 0; i < count && !cancelled; ++i)
    candidates.push_back(Genome::randomized(source, rng, false, rates));
  return screen(std::move(candidates));
}
std::vector<Genome> RandomGenomeSearch::mutants(const Genome &source, Rng &rng, int count,
                                                double strength) {
  std::vector<Genome> candidates;
  candidates.reserve(count);
  for (int i = 0; i < count && !cancelled; ++i) {
    Genome g = source;
    g.mutate(rng, strength, false, rates);
    if (!g.same_genes(source))
      candidates.push_back(std::move(g));
  }
  return screen(std::move(candidates));
}
std::vector<Genome> RandomGenomeSearch::screen(std::vector<Genome> candidates) {
  auto develop = [&](std::size_t i) { develop_entrant(candidates[i], cancelled); };
  if (!cancelled) {
    if (pool)
      pool->run(candidates.size(), develop);
    else
      for (std::size_t i = 0; i < candidates.size() && !cancelled; ++i)
        develop(i);
  }
  if (cancelled)
    return {};
  candidates.erase(std::remove_if(candidates.begin(), candidates.end(),
                                  [](const auto &g) { return !viable_entrant(g); }),
                   candidates.end());
  return candidates;
}
std::optional<Genome> RandomGenomeSearch::first(const Genome &source, Rng &rng,
                                                const std::function<bool(const Genome &)> &accept) {
  for (int attempts = 0; attempts < 256 && !cancelled; attempts += 64) {
    std::vector<Genome> candidates;
    for (int i = 0; i < 64 && !cancelled; ++i)
      candidates.push_back(Genome::randomized(source, rng, false, rates));
    for (std::size_t offset = 0; offset < candidates.size() && !cancelled; offset += 4) {
      std::vector<Genome> chunk;
      for (std::size_t i = offset; i < std::min(offset + 4, candidates.size()); ++i)
        chunk.push_back(std::move(candidates[i]));
      auto accepted = screen(std::move(chunk));
      for (auto &candidate : accepted)
        if (!accept || accept(candidate))
          return std::move(candidate);
    }
  }
  return std::nullopt;
}
void Ecosystem::seed(const Genome &source, int count, int food,
                     const std::function<void(int, int)> &progress,
                     const std::function<void()> &configure) {
  Genome founder = source;
  support_.founder = founder;
  population_limit = std::clamp(std::max(800, count * 4), 20, 2000);
  field.configure_seed_food(food);
  if (configure)
    configure();
  refresh_food_allowance();
  field.place_initial_food();
  if (founder.blueprint && founder.viable())
    support_.reserve.push_back(founder);
  const int attempt_limit = std::max(512, count * 64), target = int(fish.size()) + count;
  bool exhausted = false;
  RandomGenomeSearch search(workers, evo.rates);
  for (int attempts = 0;
       int(fish.size()) < target && attempts < attempt_limit && !cancelled && !exhausted;) {
    const int batch = std::min(64, attempt_limit - attempts);
    if (progress)
      progress(int(fish.size()), attempts);
    auto candidates = search.batch(founder, rng, batch);
    attempts += batch;
    for (auto &g : candidates) {
      if (cancelled || int(fish.size()) >= target)
        break;
      double x = 0, y = 0;
      if (!field.position(rng, x, y)) {
        exhausted = true;
        break;
      }
      auto energy = funded_egg_energy(g, physiology_.neural_cost, evo.yolk);
      if (!energy)
        continue;
      if (spawn(g, x, y, 0, 0, 0, *energy)) {
      } else {
        exhausted = true;
        break;
      }
    }
    if (progress)
      progress(int(fish.size()), attempts);
  }
  if (count > 0) {
    std::vector<Point> eggs;
    for (const auto &p : fish)
      eggs.push_back({p.body.x, p.body.y});
    field.distribute_start_food(eggs);
  }
  if (progress)
    progress(int(fish.size()), -1);
  if (support_.reserve.empty())
    for (const auto &p : fish)
      if (!p.body.development_ || p.body.development_->viable()) {
        support_.reserve.push_back(p.genome);
        break;
      }
  if (support_.reserve.empty())
    support_.reserve.push_back(Genome::load("genomes/cppn-start.genome"));
}
void Ecosystem::seed(const std::vector<Genome> &founders, int count, int food,
                     const std::function<void(int, int)> &progress,
                     const std::function<void(int)> &replaced,
                     const std::function<void()> &configure, bool exact) {
  if (founders.empty())
    throw std::runtime_error("Founder-Pool ist leer");
  // Configure the same tank defaults without drawing another random founding population.
  seed(founders.front(), 0, food, {}, configure);
  support_.reserve.clear();
  std::vector<Genome> roots;
  for (const auto &founder : founders) {
    // Each run receives fresh histories for the independently generated pool roots.
    roots.push_back(Genome::immigrants({founder}, rng).front());
  }
  population_limit = std::clamp(std::max(800, count * 4), 20, 2000);
  const int lines = std::min(int(roots.size()), count),
            rounds = lines ? (count + lines - 1) / lines : 0;
  RandomGenomeSearch search(workers, evo.rates);
  std::vector<std::vector<Genome>> candidates(lines);
  int tried = 0;
  std::vector<Genome> attempted = founders;
  const double strength = evo.mutation;
  // Finish each lineage's complete quota before inserting any eggs. A failed root
  // can then be replaced without leaving a partial population or weakening screening.
  for (int line = 0; line < lines && !cancelled; ++line) {
    const int needed = count / lines + (line < count % lines), limit = std::max(256, needed * 64);
    for (;;) {
      auto &variants = candidates[line];
      variants.clear();
      if (funded_egg_energy(roots[line], physiology_.neural_cost, evo.yolk)) {
        if (exact || strength == 0)
          variants.assign(needed, roots[line]);
        for (int attempts = 0; int(variants.size()) < needed && attempts < limit && !cancelled;) {
          const int batch = std::min({16, 2 * (needed - int(variants.size())), limit - attempts});
          auto accepted = search.mutants(roots[line], rng, batch, strength);
          attempts += batch;
          tried += batch;
          for (auto &g : accepted)
            if (funded_egg_energy(g, physiology_.neural_cost, evo.yolk) &&
                std::none_of(variants.begin(), variants.end(),
                             [&](const Genome &previous) { return g.same_genes(previous); }))
              variants.push_back(std::move(g));
          if (progress)
            progress(int(fish.size()), tried);
        }
        if (int(variants.size()) >= needed) {
          variants.resize(needed);
          break;
        }
      }
      if (cancelled)
        return;
      if (exact)
        throw std::runtime_error(
            "Gewählte Startlinie kann mit diesen Einstellungen nicht versorgt werden.");
      std::vector<std::size_t> available;
      for (std::size_t i = 0; i < support_.pool_founders.size(); ++i)
        if (std::none_of(attempted.begin(), attempted.end(), [&](const Genome &old) {
              return same_founder_design(old, support_.pool_founders[i]);
            }))
          available.push_back(i);
      if (available.empty())
        throw std::runtime_error("Kein weiterer Pool-Founder mit genügend lebensfähigen "
                                 "Startmutanten verfügbar (Startlinie " +
                                 std::to_string(line + 1) + ").");
      const auto &next =
          support_.pool_founders[available[std::uniform_int_distribution<std::size_t>(
              0, available.size() - 1)(rng.engine)]];
      attempted.push_back(next);
      roots[line] = Genome::immigrants({next}, rng).front();
      if (replaced)
        replaced(line);
    }
  }
  if (cancelled)
    return;
  support_.founder = roots.front();
  support_.reserve = roots;
  // Fixed candidate batches, ordered acceptance and balanced insertion are independent of worker
  // count.
  const int first_cloud = rng.index(field.source_count());
  std::vector<Point> anchors(field.source_count());
  for (int i = 0; i < field.source_count(); ++i)
    anchors[i] = field.food_cloud(first_cloud + i);
  struct Occupied {
    Point p;
    double radius;
  };
  std::vector<Occupied> occupied;
  for (const auto &p : fish)
    occupied.push_back(
        {{p.body.x, p.body.y}, predicted_hatch_radius(p.body, p.genome, physiology_.neural_cost)});
  for (int n = 0; n < rounds && !cancelled; ++n) {
    const int active = std::min(lines, count - n * lines);
    std::vector<Genome> group;
    std::vector<Point> positions;
    std::vector<double> energies;
    double required = 0;
    for (int line = 0; line < active; ++line) {
      group.push_back(candidates[line][n]);
      auto energy = funded_egg_energy(group.back(), physiology_.neural_cost, evo.yolk);
      if (!energy)
        throw std::runtime_error("Start-Founder kann nicht versorgt werden");
      Body embryo;
      embryo.energy = *energy;
      embryo.prepare(group.back());
      const double radius =
          std::max(collision_radius(embryo),
                   predicted_hatch_radius(embryo, group.back(), physiology_.neural_cost));
      // Share the available clouds among lineages, then spread each lineage's fish across its
      // clouds. A small selection must not concentrate the whole population at a few sources.
      const int clouds =
          lines < field.source_count() ? 1 + (field.source_count() - 1 - line) / lines : 1;
      const auto anchor = anchors[(line + (n % clouds) * lines) % anchors.size()];
      Point spot;
      bool placed = false;
      for (int attempt = 0; attempt < 1600 && !placed; ++attempt) {
        const double spread = 48 + 16 * (attempt / 80);
        const double angle = rng.uniform(0, 2 * PI), distance = spread * std::sqrt(rng.uniform());
        spot = {field.wrap_x(anchor.x + distance * std::cos(angle)),
                anchor.y + distance * std::sin(angle)};
        placed = field.free(spot.x, spot.y, radius + 8) &&
                 field.sediment_immersion(spot.x, spot.y, radius) == 0 &&
                 std::none_of(anchors.begin(), anchors.end(),
                              [&](Point other) {
                                const double dx = field.delta_x(spot.x - other.x),
                                             dy = spot.y - other.y;
                                return dx * dx + dy * dy + 1e-8 < distance * distance;
                              }) &&
                 std::none_of(occupied.begin(), occupied.end(), [&](const auto &other) {
                   return std::hypot(field.delta_x(spot.x - other.p.x), spot.y - other.p.y) <
                          std::max(40., 3 * (radius + other.radius));
                 });
      }
      if (!placed)
        throw std::runtime_error(
            "Zu wenig freier Platz um die Futterquellen; weniger Startfische wählen.");
      positions.push_back(spot);
      occupied.push_back({spot, radius});
      energies.push_back(*energy);
      required += *energy;
    }
    if (cancelled)
      break;
    if (total_energy() + required > energy_limit())
      break;
    std::size_t edges = connection_storage(*this);
    for (const auto &genome : group)
      edges += 2 * planned_edges(genome);
    if (edges > neural_budget)
      break;
    for (int line = 0; line < active; ++line)
      if (!spawn(group[line], positions[line].x, positions[line].y, 0, 0, 0, energies[line]))
        throw std::runtime_error("Start-Founder abgewiesen");
    if (progress)
      progress(int(fish.size()), tried);
  }
  if (count > 0) {
    std::vector<Point> eggs;
    for (const auto &p : fish)
      eggs.push_back({p.body.x, p.body.y});
    field.distribute_start_food(eggs);
  }
  if (progress)
    progress(int(fish.size()), -1);
}
}
