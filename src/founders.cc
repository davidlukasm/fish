#include "ecology_internal.hh"
#include "physiology.hh"
#include "body_plan.hh"
#include <algorithm>
#include <map>
#include <set>
namespace fishsim {
namespace {
constexpr int SEED_LIMIT = 800, SEED_LIMIT_PER_FISH = 4, SEED_LIMIT_MIN = 20;
constexpr int SPOT_ATTEMPTS = 1600, SPOT_ROUND = 80;
constexpr double SPOT_SPREAD = 48, SPOT_WIDEN = 16, SPOT_CLEARANCE = 8, SPOT_GAP = 40,
                 SPOT_GAP_RADII = 3;
constexpr std::size_t EDGE_COPIES = 2;
constexpr double PLANT_DIET = .7, PLANT_SPREAD = 24, PLANT_CLEARANCE = 16;
}
bool viable_entrant(const Genome &g) {
  return g.blueprint && g.interface && g.interface->mobile_reproductive && g.viable() &&
         !g.blueprint->resource_limited && !g.blueprint->edges.empty();
}
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
  auto roots = Genome::immigrants(founders, rng);
  for (const auto &root : roots) {
    if (!funded_egg_energy(root, physiology_, evo.yolk))
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
  std::map<std::size_t, const PlantPart *> edible_plants;
  for (const auto &part : field.vegetation().plants)
    if (part.kind == food_kind::plant && part.energy > field.env().seed_energy &&
        part.organ_kind != plant_organ::stem && field.free(part.x, part.y, PLANT_CLEARANCE) &&
        field.sediment_immersion(part.x, part.y, PLANT_CLEARANCE) == 0) {
      auto &chosen = edible_plants[part.patch];
      if (!chosen ||
          (part.organ_kind >= plant_organ::leaf && chosen->organ_kind < plant_organ::leaf) ||
          ((part.organ_kind >= plant_organ::leaf) == (chosen->organ_kind >= plant_organ::leaf) &&
           part.energy > chosen->energy))
        chosen = &part;
    }
  std::vector<Point> plant_anchors;
  for (const auto &[patch, part] : edible_plants)
    plant_anchors.push_back({part->x, part->y});
  for (std::size_t i = plant_anchors.size(); i > 1; --i)
    std::swap(plant_anchors[i - 1], plant_anchors[rng.index(i)]);
  const auto first_plant = plant_anchors.empty() ? 0 : rng.index(plant_anchors.size());
  struct Occupied {
    Point p;
    double radius;
  };
  std::vector<Occupied> occupied;
  std::set<std::uint64_t> plant_starters;
  for (const auto &p : fish)
    occupied.push_back({{p.body.x, p.body.y}, predicted_hatch_radius(p.body, p.genome)});
  for (int n = 0; n < rounds && !cancelled; ++n) {
    const int active = std::min(lines, count - n * lines);
    std::vector<Genome> group;
    std::vector<Point> positions;
    std::vector<double> energies;
    std::vector<std::optional<double>> headings;
    double required = 0;
    for (int line = 0; line < active; ++line) {
      group.push_back(roots[line]);
      auto energy = funded_egg_energy(group.back(), physiology_, evo.yolk);
      if (!energy)
        throw std::runtime_error("Start-Founder kann nicht versorgt werden");
      Body embryo;
      embryo.energy = *energy;
      embryo.prepare(group.back());
      const double radius =
          std::max(collision_radius(embryo), predicted_hatch_radius(embryo, group.back()));
      // Share the available clouds among lineages, then spread each lineage's fish across its
      // clouds. A small selection must not concentrate the whole population at a few sources.
      const int clouds =
          lines < field.source_count() ? 1 + (field.source_count() - 1 - line) / lines : 1;
      const bool plant_start = founders[line].interface &&
                               founders[line].interface->gut_length >= PLANT_DIET &&
                               !plant_anchors.empty();
      const auto anchor =
          plant_start ? plant_anchors[(first_plant + line + n * lines) % plant_anchors.size()]
                      : anchors[(line + (n % clouds) * lines) % anchors.size()];
      Point spot;
      bool placed = false;
      for (int attempt = 0; attempt < SPOT_ATTEMPTS && !placed; ++attempt) {
        const double spread =
            (plant_start ? PLANT_SPREAD : SPOT_SPREAD) + SPOT_WIDEN * (attempt / SPOT_ROUND);
        const double angle = rng.uniform(0, 2 * PI), distance = spread * std::sqrt(rng.uniform());
        spot = {field.wrap_x(anchor.x + distance * std::cos(angle)),
                anchor.y + distance * std::sin(angle)};
        placed = field.free(spot.x, spot.y, radius + SPOT_CLEARANCE) &&
                 field.sediment_immersion(spot.x, spot.y, radius) == 0 &&
                 (plant_start || std::none_of(anchors.begin(), anchors.end(),
                                              [&](Point other) {
                                                const double dx = field.delta_x(spot.x - other.x),
                                                             dy = spot.y - other.y;
                                                return dx * dx + dy * dy + tolerance::negligible <
                                                       distance * distance;
                                              })) &&
                 std::none_of(occupied.begin(), occupied.end(), [&](const auto &other) {
                   return std::hypot(field.delta_x(spot.x - other.p.x), spot.y - other.p.y) <
                          std::max(SPOT_GAP, SPOT_GAP_RADII * (radius + other.radius));
                 });
      }
      if (!placed)
        throw std::runtime_error(
            "Zu wenig freier Platz um die Futterquellen; weniger Startfische wählen.");
      positions.push_back(spot);
      headings.push_back(plant_start ? std::optional<double>(std::atan2(
                                           anchor.y - spot.y, field.delta_x(anchor.x - spot.x)))
                                     : std::nullopt);
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
    for (int line = 0; line < active; ++line) {
      if (!spawn(group[line], positions[line].x, positions[line].y, fish_origin::founder, 0, 0,
                 energies[line]))
        throw std::runtime_error("Start-Founder abgewiesen");
      // Resolve each founder's individual anatomy before reserving the next one. The cells
      // still develop and learn in the egg; unresolved max_nodes reservations truncated starts.
      fish.back().genome.compile();
      if (connection_storage(*this) > neural_budget)
        throw std::runtime_error(
            "Startpopulation überschreitet das Speicherbudget für Nervenkontakte.");
      if (headings[line]) {
        fish.back().body.angle = *headings[line];
        plant_starters.insert(fish.back().id);
      }
    }
    if (progress)
      progress(int(fish.size()));
  }
  if (count > 0) {
    std::vector<Point> eggs;
    for (const auto &p : fish)
      if (!plant_starters.count(p.id))
        eggs.push_back({p.body.x, p.body.y});
    if (!eggs.empty())
      field.distribute_start_food(eggs);
  }
}
}
