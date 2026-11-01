#include "ecology_internal.hh"
#include "physiology.hh"
#include "body_plan.hh"
#include <algorithm>
namespace fishsim {
namespace {
// The population limit is at least SEED_LIMIT or SEED_LIMIT_PER_FISH per start fish, between
// SEED_LIMIT_MIN and the population maximum.
constexpr int SEED_LIMIT = 800, SEED_LIMIT_PER_FISH = 4, SEED_LIMIT_MIN = 20;
// Start eggs are placed within SPOT_SPREAD of a food cloud, widening by SPOT_WIDEN every
// SPOT_ROUND attempts up to SPOT_ATTEMPTS; they keep SPOT_CLEARANCE from walls and at least
// SPOT_GAP (or SPOT_GAP_RADII times both radii) from other eggs.
constexpr int SPOT_ATTEMPTS = 1600, SPOT_ROUND = 80;
constexpr double SPOT_SPREAD = 48, SPOT_WIDEN = 16, SPOT_CLEARANCE = 8, SPOT_GAP = 40,
                 SPOT_GAP_RADII = 3;
// Each planned edge is stored in both directions.
constexpr std::size_t EDGE_COPIES = 2;
}
bool viable_entrant(const Genome &g) {
  return g.blueprint && g.interface && g.interface->mobile_reproductive && g.viable() &&
         !g.blueprint->resource_limited && !g.blueprint->edges.empty();
}
// Every chosen line starts as copies of its genome, spread over the food clouds.
void Ecosystem::seed(const std::vector<Genome> &founders, int count, int food,
                     const std::function<void(int)> &progress,
                     const std::function<void()> &configure) {
  if (founders.empty())
    throw std::runtime_error("Keine Startlinie gewählt.");
  population_limit = std::clamp(std::max(SEED_LIMIT, count * SEED_LIMIT_PER_FISH), SEED_LIMIT_MIN,
                                population_limits::max_fish);
  field.configure_seed_food(food);
  if (configure)
    configure();
  refresh_food_allowance();
  field.place_initial_food();
  std::vector<Genome> roots;
  for (const auto &founder : founders) {
    // Each run receives fresh histories for its start lines.
    roots.push_back(Genome::immigrants({founder}, rng).front());
    if (!funded_egg_energy(roots.back(), physiology_.neural_cost, evo.yolk))
      throw std::runtime_error(
          "Gewählte Startlinie kann mit diesen Einstellungen nicht versorgt werden.");
  }
  support_.founder = roots.front();
  support_.reserve = roots;
  const int lines = std::min(int(roots.size()), count),
            rounds = lines ? (count + lines - 1) / lines : 0;
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
      group.push_back(roots[line]);
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
      for (int attempt = 0; attempt < SPOT_ATTEMPTS && !placed; ++attempt) {
        const double spread = SPOT_SPREAD + SPOT_WIDEN * (attempt / SPOT_ROUND);
        const double angle = rng.uniform(0, 2 * PI), distance = spread * std::sqrt(rng.uniform());
        spot = {field.wrap_x(anchor.x + distance * std::cos(angle)),
                anchor.y + distance * std::sin(angle)};
        placed =
            field.free(spot.x, spot.y, radius + SPOT_CLEARANCE) &&
            field.sediment_immersion(spot.x, spot.y, radius) == 0 &&
            std::none_of(anchors.begin(), anchors.end(),
                         [&](Point other) {
                           const double dx = field.delta_x(spot.x - other.x), dy = spot.y - other.y;
                           return dx * dx + dy * dy + tolerance::negligible < distance * distance;
                         }) &&
            std::none_of(occupied.begin(), occupied.end(), [&](const auto &other) {
              return std::hypot(field.delta_x(spot.x - other.p.x), spot.y - other.p.y) <
                     std::max(SPOT_GAP, SPOT_GAP_RADII * (radius + other.radius));
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
      edges += EDGE_COPIES * planned_edges(genome);
    if (edges > neural_budget)
      break;
    for (int line = 0; line < active; ++line)
      if (!spawn(group[line], positions[line].x, positions[line].y, fish_origin::founder, 0, 0,
                 energies[line]))
        throw std::runtime_error("Start-Founder abgewiesen");
    if (progress)
      progress(int(fish.size()));
  }
  if (count > 0) {
    std::vector<Point> eggs;
    for (const auto &p : fish)
      eggs.push_back({p.body.x, p.body.y});
    field.distribute_start_food(eggs);
  }
}
}
