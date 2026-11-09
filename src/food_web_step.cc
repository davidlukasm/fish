#include "environment.hh"
#include "plants.hh"
#include "body.hh"
#include <queue>
#include <numeric>
#include <limits>
namespace fishsim {
namespace {
namespace benthic {
constexpr int worms = 0, crabs = 1, mussels = 2, count = 3;
}
constexpr double PATCH_MIDDLE = .5;
constexpr double SHELL_CONTACT_MIN = .2, SHELL_CONTACT_SHARE = .3, SHELL_DRIFT = .3,
                 SHELL_SINK = .9, SHELL_SPIN = .025;
constexpr double CALM_PREFERENCE = .3, CROWDING_HALF_LIFE = 60;
constexpr int CROWDING_PASSES = 4;
constexpr double WORM_COLONY_CELL = 80;
constexpr std::uint64_t WORM_COLONY_ROW = 7, WORM_COLONY_OWNER = 13;
constexpr double WORM_FILTER_KEEP = .92, MUSSEL_FILTER_KEEP = .96;
constexpr double WORM_WITHDRAW_STEPS = 16, WORM_WITHDRAW_SPREAD = 12, WORM_EXTEND_STEPS = 12,
                 WORM_EXTEND_SPREAD = 8, WORM_BASE_SPEED = .25;
constexpr double WORM_SWAY_AMPLITUDE = .025, WORM_SWAY_AMPLITUDE_SPREAD = .035,
                 WORM_SWAY_RATE = .025, WORM_SWAY_RATE_SPREAD = .025, WORM_FLOW_BEND = .12,
                 WORM_CLEARANCE = .01;
constexpr double WORM_FEEDING_EXTENSION = .5, WORM_FILTER_RADIUS = 4, WORM_FILTER_SPREAD = 2;
constexpr double SEARCH_DIAGONALS = 2;
constexpr double CROSSING_ARC_RADII = .6, CROSSING_ARC_SPAN = .5, CROSSING_SPACING = .5,
                 CROSSING_MIN_SPACING = 2, CROSSING_PROBE = .15, CROSSING_MIN_STEPS = 12,
                 CROSSING_SPAN_WEIGHT = 2, CROSSING_HEIGHT_WEIGHT = 4, CROSSING_MIN_SPEED = .05;
constexpr int CROSSING_SAMPLES = 12;
constexpr double CRAB_OVERHANG = .35, CRAB_MAX_TURN = .52;
constexpr double CRAB_HUNGRY = .9, WANDER_WEIGHT = .2;
constexpr double CRAB_MEAL_MARGIN = .04, CRAB_WANDER_MARGIN = .08, CRAB_MIN_WALK = .15,
                 CRAB_LANDING_MARGIN = .2;
constexpr std::uint64_t CRAB_FLEE_TIME = 360, CRAB_LANDING_PAUSE = 60;
constexpr double CRAB_WALK_INTERVALS = 2;
constexpr double CRAB_BIRTH_SPACING_MIN = .25, CRAB_BIRTH_SPACING_MAX = .6;
constexpr double CRAB_BOB_PHASE = 1.73, CRAB_BOB_PERIOD = 170, CRAB_BOB_PERIOD_SPREAD = 90,
                 CRAB_BOB_RATE = .0015;
constexpr double CRAB_OUT = .5, CRAB_FULLY_OUT = .99, CRAB_EMERGE_STEPS = 36;
constexpr double CRAB_CRUMB_SHARE = .5, MIN_SHORTEN_LENGTH = 2;
constexpr double CRAB_BIRTH_DETRITUS = 2;
constexpr double CRAB_HEADROOM = 1.5, CRAB_HEADROOM_PROBE = .6, CRAB_BURROW_DEPTH = 1.2,
                 MIN_BURROW_DEPTH = .1;
constexpr std::uint64_t CRAB_GOAL_CHECK = 50, CRAB_REPLAN = 100;
constexpr double CRAB_SEPARATION = 1.1, CRAB_LOOK_AHEAD = .05;
constexpr std::uint64_t CRAB_BLOCKED_WAIT = 30, CRAB_BLOCKED_SPREAD = 70;
constexpr double CRAB_GAIT_MIN = .75, CRAB_GAIT_RATE = .025, CRAB_MIN_STEP = .2,
                 CRAB_STRIDE_RATE = 3;
constexpr double CRAB_STALL_MOVE = .02;
constexpr int CRAB_STALL_STEPS = 90;
constexpr double CRAB_SETTLER_SPACINGS = 3;
constexpr double MUSSEL_REACH_MIN = .7, MUSSEL_REACH_SPREAD = .6, FAN_TOP_NORMAL = .3,
                 RAZOR_FLANK_NORMAL = .75, HABITAT_AVOIDANCE = .6, LARVA_MIN_REACH = .3;
constexpr int SETTLE_TRIALS = 4, FAR_TRIALS = 8, NEAR_TRIALS = 6;
constexpr double BROOD_MIN = .4, BROOD_SPREAD = .8;
constexpr double MUSSEL_SETTLER_LENGTH = 80, PLANKTON_PROBE_LIFT = 3;
constexpr int MUSSEL_CANDIDATES = 8, MUSSEL_SETTLE_TRIALS = 24, MUSSEL_CLUSTER_TRIALS = 3;
struct MusselSpread {
  double brood, reach, algae;
};
MusselSpread mussel_spread(double morph) {
  constexpr MusselSpread family[] = {{3, 1.0, 1.0}, {2, 1.1, 1.0}, {2, .8, .9}, {2, 1.0, 1.1},
                                     {2, 1.4, .8},  {1, 1.6, .7},  {3, .6, 1.2}};
  static_assert(std::size(family) == std::size_t(mussel_families));
  return family[mussel_family(morph)];
}
}
void Field::advance_food_web() {
  sync_food_web();
  SedimentReadScope bed(*this);
  auto &web = food_web_;
  web.grazing.clear();
  auto patch_position = [&](const SurfacePatch &s, double along, double lift) {
    const auto edges = sediment_edges(&s - vegetation_.surfaces.data());
    const double depth = edges[0] + along * (edges[1] - edges[0]);
    return Point{s.a.x + along * (s.b.x - s.a.x) + s.normal.x * (depth + lift),
                 s.a.y + along * (s.b.y - s.a.y) + s.normal.y * (depth + lift)};
  };
  auto crab_position = [&](Crab &c, const SurfacePatch &s) {
    const double r = crab_radius(c.energy, env_, c.morph);
    const auto edges = sediment_edges(&s - vegetation_.surfaces.data());
    const double depth = edges[0] + c.along * (edges[1] - edges[0]),
                 height = crab_support_height(r, depth, c.depth), lift = height - depth;
    return patch_position(s, c.along, lift);
  };
  auto crossing_point = [&](Point from, Point to, double from_angle, double to_angle, double radius,
                            double t) {
    const double blend = t * t * (3 - 2 * t),
                 distance = std::hypot(delta_x(to.x - from.x), to.y - from.y),
                 angle = from_angle + blend * std::remainder(to_angle - from_angle, 2 * PI),
                 arc = (CROSSING_ARC_RADII * radius + CROSSING_ARC_SPAN * distance) *
                       std::sin(PI * t);
    return Point{wrap_x(from.x + blend * delta_x(to.x - from.x) + arc * std::sin(angle)),
                 from.y + blend * (to.y - from.y) - arc * std::cos(angle)};
  };
  for (auto &shell : web.shells) {
    ++shell.age;
    const double contact = std::max(SHELL_CONTACT_MIN, shell.radius * SHELL_CONTACT_SHARE);
    if (rests_on_sediment({shell.x, shell.y}, contact))
      continue;
    const auto water = water_.velocity(shell.x, shell.y);
    Body shape{};
    shape.x = wrap_x(shell.x + water.x * SHELL_DRIFT);
    shape.y = shell.y + water.y * SHELL_DRIFT + (gravity > 0 ? SHELL_SINK : 0);
    collide(shape, shell.x, shell.y, contact);
    const double moved = std::hypot(delta_x(shape.x - shell.x), shape.y - shell.y);
    shell.angle += moved * SHELL_SPIN;
    shell.x = shape.x;
    shell.y = shape.y;
  }
  web.shells.erase(std::remove_if(web.shells.begin(), web.shells.end(),
                                  [](const auto &s) { return s.age >= SHELL_LIFETIME; }),
                   web.shells.end());
  auto &p = web.plankton;
  const bool supply_due = time == 1 || time % std::uint64_t(env_.plankton_seed_period) == 0;
  prepare_plankton_sources();
  double production_left = plankton_supply();
  std::array<double, benthic::count> benthic_left{};
  const auto stores = small_animal_stores();
  double missing = 0;
  for (int k = 0; k < benthic::count; ++k) {
    const double limit = niche_limit(food_kind::worm + k);
    benthic_left[k] =
        limit > 0 ? std::clamp(1 - stores[animal_store::worms + k] / limit, 0., 1.) : 0;
    missing += benthic_left[k];
  }
  for (int k = 0; k < benthic::count; ++k)
    benthic_left[k] = missing > 0 ? std::min(benthic_supply() * benthic_left[k] / missing,
                                             std::max(0., niche_limit(food_kind::worm + k) -
                                                              stores[animal_store::worms + k]))
                                  : 0;
  const int nx = p.columns, ny = p.rows;
  const double dx = p.width / nx, dy = p.height / ny, cell_area = dx * dy,
               maximum = env_.plankton_max_density * cell_area;
  const auto neighbor = [&](int at, int d) { return cell_neighbor(at, d, nx); };
  auto startup_import = [&](double amount) {
    const double accepted = std::max(0., std::min(amount, energy_available));
    energy_available -= accepted;
    feeding_.food_allowance = std::max(0., feeding_.food_allowance - accepted);
    web.introduced += accepted;
    web.initial += accepted;
    return accepted;
  };
  auto birth_funds = [&](int kind) {
    return std::min(energy_available, time == 1 ? energy_available : benthic_left[kind]);
  };
  std::fill(p.scratch.begin(), p.scratch.end(), 0);
  for (int at = 0; at < nx * ny; ++at) {
    if (p.cooldown[at])
      --p.cooldown[at];
    const double amount = p.energy[at];
    if (amount <= 0)
      continue;
    const double x = (at % nx + .5) * dx, y = (at / nx + .5) * dy;
    const auto water = water_.velocity(x, y);
    const double fx = std::min(1., std::abs(water.x) / dx),
                 fy = std::min(1., std::abs(water.y) / dy);
    const int horizontal = water.x >= 0 ? cell_side::right : cell_side::left,
              vertical = water.y >= 0 ? cell_side::down : cell_side::up;
    const int h = side_linked(p.links[at], horizontal) ? neighbor(at, horizontal) : at;
    const int v = side_linked(p.links[at], vertical) ? neighbor(at, vertical) : at;
    const int diagonal = h != at && v != at && side_linked(p.links[h], vertical) &&
                                 side_linked(p.links[v], horizontal)
                             ? neighbor(h, vertical)
                             : at;
    p.scratch[at] += amount * (1 - fx) * (1 - fy);
    p.scratch[h] += amount * fx * (1 - fy);
    p.scratch[v] += amount * fy * (1 - fx);
    p.scratch[diagonal] += amount * fx * fy;
  }
  p.energy.swap(p.scratch);
  prepare_plankton_flow();
  p.scratch = p.energy;
  for (int at = 0; at < nx * ny; ++at) {
    if (p.energy[at] <= 0)
      continue;
    int target = at;
    double best = 0;
    for (int d = 0; d < cell_side::count; ++d)
      if (side_linked(p.links[at], d)) {
        const int n = neighbor(at, d);
        const double density = (p.energy[n] - p.energy[at]) /
                               std::max(tolerance::negligible, p.energy[n] + p.energy[at]),
                     calmer = (p.strain[at] - p.strain[n]) /
                              (tolerance::negligible + p.strain[at] + p.strain[n]),
                     score = density + CALM_PREFERENCE * calmer;
        if (p.energy[n] < maximum && score > best) {
          best = score;
          target = n;
        }
      }
    if (target != at) {
      // Even shallow gradients draw the fringe into a shared swarm. Transfer only
      // existing biomass, bounded by the receiving cell's carrying capacity.
      const double contrast = std::sqrt(std::clamp(best, 0., 1.));
      const double amount = std::min(env_.plankton_cohesion * p.energy[at] * contrast,
                                     std::max(0., maximum - p.scratch[target]));
      p.scratch[at] -= amount;
      p.scratch[target] += amount;
    }
  }
  p.energy.swap(p.scratch);
  p.scratch = p.energy;
  const double threshold2 = env_.plankton_flee_gradient * env_.plankton_flee_gradient;
  for (int at = 0; at < nx * ny; ++at) {
    if (p.cooldown[at] || p.energy[at] <= 0 || p.strain[at] <= threshold2)
      continue;
    int target = at;
    double weights = 0;
    for (int d = 0; d < cell_side::count; ++d)
      if (side_linked(p.links[at], d)) {
        const int n = neighbor(at, d);
        const double safer = std::max(0., p.strain[at] - p.strain[n]);
        if (safer <= 0 || p.cooldown[n])
          continue;
        weights += safer;
        if (rng.uniform() * weights < safer)
          target = n;
      }
    if (target == at)
      continue;
    const double response = 1 - threshold2 / p.strain[at],
                 amount = std::min(p.energy[at] * env_.plankton_flee_share * response,
                                   std::max(0., maximum - p.scratch[target]));
    if (amount <= 0)
      continue;
    p.scratch[at] -= amount;
    p.scratch[target] += amount;
    p.cooldown[at] = p.cooldown[target] = std::uint16_t(env_.plankton_flee_pause);
  }
  p.energy.swap(p.scratch);
  for (int pass = 0; pass < CROWDING_PASSES; ++pass) {
    bool moved = false;
    p.scratch = p.energy;
    for (int at = 0; at < nx * ny; ++at) {
      const double excess = p.energy[at] - maximum;
      if (excess <= tolerance::rounding)
        continue;
      std::array<double, cell_side::count> room{};
      double space = 0;
      for (int d = 0; d < cell_side::count; ++d)
        if (side_linked(p.links[at], d)) {
          room[d] = std::max(0., maximum - p.scratch[neighbor(at, d)]);
          space += room[d];
        }
      if (space <= 0)
        continue;
      const double transfer = std::min(excess, space);
      for (int d = 0; d < cell_side::count; ++d)
        if (room[d] > 0)
          p.scratch[neighbor(at, d)] += transfer * room[d] / space;
      p.scratch[at] -= transfer;
      moved = true;
    }
    p.energy.swap(p.scratch);
    if (!moved)
      break;
  }
  const double limit = env_.plankton_limit * p.water_area;
  double total = std::accumulate(p.energy.begin(), p.energy.end(), 0.);
  for (std::size_t i = 0; i < feeding_.pieces.size(); ++i) {
    auto &food = feeding_.pieces[i];
    const double amount = feed_plankton(food.x, food.y, food.energy, food_radius(food));
    if (amount > 0) {
      bite_food(i, amount);
      total += amount;
      if (food.origin == food_kind::feed)
        web.food_eaten += amount;
    }
  }
  for (auto &d : vegetation_.drifting_grass) {
    for (auto &o : d.plant.organs) {
      const auto &q = o.curve[2];
      const double amount = feed_plankton(q.x, q.y, o.energy, std::max(1., o.display_width));
      o.energy -= amount;
      d.plant.grass -= amount;
      total += amount;
    }
    d.plant.grass = std::max(0., d.plant.grass);
  }
  // The normal aging rate is shared by the field; only crowding needs a new exponential.
  const double base_mortality = half_life_loss(1 / env_.microfauna_lifespan);
  for (int at = 0; at < nx * ny; ++at) {
    const double v = p.energy[at];
    if (v <= 0)
      continue;
    const double pressure = maximum > 0 ? std::max(0., v / maximum - 1) : 1;
    const double lost =
        v * (pressure > 0
                 ? half_life_loss(1 / env_.microfauna_lifespan + pressure / CROWDING_HALF_LIFE)
                 : base_mortality);
    p.energy[at] -= lost;
    total -= lost;
    deposit_feces((at % nx + .5) * dx, (at / nx + .5) * dy, lost);
  }
  p.nonempty = total > 0;
  const auto &ids = web.patches;
  std::vector<double> worms(vegetation_.surfaces.size()), exposed_worms(worms.size());
  for (const auto &h : web.heads) {
    const auto i = ids.find(h.patch);
    if (i != ids.end())
      exposed_worms[i->second] += h.energy;
  }
  auto worm_pieces = [&](const SurfacePatch &soil, double amount) {
    const auto point = patch_position(soil, PATCH_MIDDLE, worm_head_radius);
    while (amount > tolerance::rounding) {
      const double energy = std::min(amount, env_.worm_head_energy);
      Food f{wrap_x(point.x), point.y, 0, 0, 0, energy};
      f.origin = food_kind::worm;
      f.radius = food_radius(energy);
      f.initial_energy = energy;
      f.color = WORM_FLESH_COLOR;
      append_fragment(f);
      amount -= energy;
    }
  };
  const double decay = half_life_loss(1 / env_.decay_half_life);
  for (std::size_t i = 0; i < vegetation_.surfaces.size(); ++i) {
    auto &s = vegetation_.surfaces[i];
    if (s.normal.y > -seabed::floor_normal || sediment_depth(s) < env_.burrow_depth) {
      web.released += s.detritus;
      s.detritus = 0;
      std::vector<std::size_t> destinations;
      for (auto j : web.neighbors[i])
        if (sediment_depth(vegetation_.surfaces[j]) >= env_.burrow_depth)
          destinations.push_back(j);
      if (!destinations.empty()) {
        for (auto j : destinations)
          worms[j] += s.worms / destinations.size();
      } else if (s.worms > 0)
        worm_pieces(s, s.worms);
      s.worms = 0;
      continue;
    }
    const double mortality =
        s.worms *
        half_life_loss(1 / individual_lifespan(env_.microfauna_lifespan, grass_traits(s)[1]));
    s.worms -= mortality;
    s.detritus += mortality;
    const double lost = s.detritus * decay;
    s.detritus -= lost;
    web.released += lost;
    const double uptake =
        std::min(s.detritus * env_.detritus_uptake,
                 std::max(0., env_.worm_max * s.length - s.worms - exposed_worms[i]));
    s.detritus -= uptake;
    s.worms += uptake;
    for (auto j : web.neighbors[i]) {
      const auto &q = vegetation_.surfaces[j];
      if (s.owner != q.owner || s.edge != q.edge || std::abs(s.slot - q.slot) != 1 ||
          sediment_depth(q) < env_.burrow_depth || s.detritus + q.detritus <= 0)
        continue;
      const double amount = s.worms * env_.worm_spread * q.detritus / (s.detritus + q.detritus);
      worms[i] -= amount;
      worms[j] += amount;
    }
  }
  for (std::size_t i = 0; i < worms.size(); ++i) {
    auto &s = vegetation_.surfaces[i];
    const double available = std::max(0., s.worms + worms[i]);
    const double cap = sediment_depth(s) >= env_.burrow_depth
                           ? std::max(0., env_.worm_max * s.length - exposed_worms[i])
                           : 0;
    s.worms = std::min(available, cap);
    if (available > cap)
      worm_pieces(s, available - cap);
    if (s.worms > 0 &&
        rng.uniform() < env_.worm_head_rate * std::min(1., s.worms / (env_.worm_max * s.length))) {
      WormHead h;
      h.id = web.next_id++;
      h.patch = s.id;
      const auto midpoint = patch_position(s, PATCH_MIDDLE, 0);
      const auto cell = [](double v) {
        return std::uint64_t(std::max(0., std::floor(v / WORM_COLONY_CELL)));
      };
      const auto colony =
          cell(midpoint.x) + WORM_COLONY_ROW * cell(midpoint.y) + WORM_COLONY_OWNER * s.owner;
      h.morph = double(colony % worm_families) + rng.uniform() * placement::morph_span;
      h.duration = std::uint64_t(rng.uniform(
          env_.worm_head_time, std::max(env_.worm_head_time, env_.worm_head_time_max) + 1));
      h.along = rng.uniform();
      const auto edges = sediment_edges(i);
      const double depth = edges[0] + h.along * (edges[1] - edges[0]);
      if (!bed_site_clear(s, h.along, depth * (1 - burial_share(worm_individuality(h.id))),
                          placement::animal_headroom))
        continue;
      h.energy = std::min(env_.worm_head_energy, s.worms);
      s.worms -= h.energy;
      exposed_worms[i] += h.energy;
      auto q = patch_position(s, h.along, 0);
      h.base_x = h.x = wrap_x(q.x);
      h.base_y = h.y = q.y;
      web.heads.push_back(h);
    }
  }
  for (auto &h : web.heads) {
    if (h.energy <= 0)
      continue;
    const auto soil = ids.find(h.patch);
    ++h.age;
    h.filter_rate *= WORM_FILTER_KEEP;
    h.withdrawing |= h.age >= h.duration || soil == ids.end() ||
                     sediment_depth(vegetation_.surfaces[soil->second]) < env_.burrow_depth;
    h.withdrawing |= danger_near(h.x, h.y, env_.worm_retreat_radius, env_.worm_retreat_body,
                                 env_.prey_alert_speed) != nullptr;
    const double individuality = worm_individuality(h.id);
    h.extension = std::clamp(
        h.extension + (h.withdrawing
                           ? -1. / (WORM_WITHDRAW_STEPS + WORM_WITHDRAW_SPREAD * individuality)
                           : 1. / (WORM_EXTEND_STEPS + WORM_EXTEND_SPREAD * individuality)),
        0., 1.);
    if (soil != ids.end()) {
      const auto &s = vegetation_.surfaces[soil->second];
      const auto edges = sediment_edges(soil->second);
      const double cover = edges[0] + h.along * (edges[1] - edges[0]);
      h.withdrawing |= cover < env_.burrow_depth;
      const double burial = cover * burial_share(individuality);
      const Point surface{s.a.x + h.along * (s.b.x - s.a.x) + s.normal.x * cover,
                          s.a.y + h.along * (s.b.y - s.a.y) + s.normal.y * cover};
      const Point base{surface.x - s.normal.x * burial, surface.y - s.normal.y * burial};
      if (h.age == 1) {
        h.base_x = wrap_x(base.x);
        h.base_y = base.y;
      } else {
        h.base_x = wrap_x(
            h.base_x + std::clamp(delta_x(base.x - h.base_x), -WORM_BASE_SPEED, WORM_BASE_SPEED));
        h.base_y += std::clamp(base.y - h.base_y, -WORM_BASE_SPEED, WORM_BASE_SPEED);
      }
      const double extension = h.extension * h.extension * (3 - 2 * h.extension),
                   length =
                       worm_length(h.id, h.morph) * extension *
                       std::clamp((cover - env_.burrow_depth) / fauna::worm_full_depth, 0., 1.);
      const auto flow = water_.velocity(h.base_x, h.base_y);
      const double sway =
          (WORM_SWAY_AMPLITUDE + WORM_SWAY_AMPLITUDE_SPREAD * individuality) * length *
              std::sin((WORM_SWAY_RATE + WORM_SWAY_RATE_SPREAD * individuality) * time +
                       h.id * placement::golden_angle) +
          std::clamp(flow.x * s.normal.y - flow.y * s.normal.x, -1., 1.) * length * WORM_FLOW_BEND;
      const double vertical_burial = burial / std::max(seabed::floor_normal, -s.normal.y),
                   dx = sway, dy = -length, reach = std::hypot(dx, dy),
                   allowed = reach > 0
                                 ? std::clamp((ray(h.base_x, h.base_y - vertical_burial, dx / reach,
                                                   dy / reach, worm_head_radius, reach) -
                                               WORM_CLEARANCE) /
                                                  reach,
                                              0., 1.)
                                 : 0;
      h.x = wrap_x(h.base_x + allowed * dx);
      h.y = h.base_y - extension * vertical_burial + allowed * dy;
      h.ground = std::clamp(1 - 2 * vertical_burial /
                                    std::max(.001, extension * vertical_burial + allowed * length),
                            -1., 1.);
      if (!h.withdrawing && h.extension > WORM_FEEDING_EXTENSION) {
        auto &bed = vegetation_.surfaces[soil->second];
        const double room =
            std::max(0., env_.worm_max * bed.length - bed.worms - exposed_worms[soil->second]);
        const double taken = filter_plankton(
            h.x, h.y, WORM_FILTER_RADIUS + WORM_FILTER_SPREAD * individuality,
            env_.mussel_filter_rate, std::min(room, env_.worm_head_energy / env_.worm_head_time));
        bed.worms += taken;
        h.filter_rate += (1 - WORM_FILTER_KEEP) * taken;
      }
    }
    const bool hide = soil == ids.end() || (h.withdrawing && h.extension <= 0);
    if (hide) {
      auto i = ids.find(h.patch);
      if (i != ids.end()) {
        auto &soil = vegetation_.surfaces[i->second];
        const double room = sediment_depth(soil) >= env_.burrow_depth
                                ? std::max(0., env_.worm_max * soil.length - soil.worms)
                                : 0;
        const double returned = std::min(room, h.energy);
        soil.worms += returned;
        if (h.energy > returned)
          worm_pieces(soil, h.energy - returned);
      } else
        deposit_detritus(h.x, h.y, h.energy);
      h.energy = 0;
    }
  }
  web.heads.erase(std::remove_if(web.heads.begin(), web.heads.end(),
                                 [](const auto &v) { return v.energy <= 0; }),
                  web.heads.end());
  double sediment_length = 0;
  for (const auto &s : vegetation_.surfaces)
    if (s.normal.y <= -seabed::floor_normal && sediment_depth(s) >= env_.burrow_depth)
      sediment_length += s.length;
  const auto crab_limit = std::size_t(sediment_length / env_.crab_spacing);
  auto algae_food = [&](const SurfacePatch &s) {
    return std::max(0., s.algae - env_.mussel_algae_limit * algae_capacity(s));
  };
  auto nearest_bed = [&](Crab &c, std::size_t from, bool leave, bool clear, double &nearest) {
    std::size_t target = from;
    nearest = std::numeric_limits<double>::infinity();
    for (double reach = env_.crab_search_radius;
         reach < SEARCH_DIAGONALS * std::hypot(geometry_.width, geometry_.height) &&
         !std::isfinite(nearest);
         reach *= 2) {
      vegetation_.surface_grid.nearby(c.x, c.y, reach, [&](std::uint32_t j) {
        const auto &s = vegetation_.surfaces[j];
        if (s.normal.y > -CRAB_FOOTING || sediment_depth(s) < env_.burrow_depth ||
            (leave && j == from))
          return;
        Crab probe = c;
        probe.along = PATCH_MIDDLE;
        const auto landing = crab_position(probe, s);
        const double distance = std::hypot(delta_x(landing.x - c.x), landing.y - c.y);
        if (distance >= nearest)
          return;
        const auto &source = vegetation_.surfaces[from];
        const double angle = std::atan2(source.normal.x, -source.normal.y),
                     end_angle = std::atan2(s.normal.x, -s.normal.y),
                     radius = crab_radius(c.energy, env_, c.morph);
        Point previous{c.x, c.y};
        // This runs only when selecting a new route, never for every crab every tick.
        const int samples = std::max(
            CROSSING_SAMPLES,
            int(std::ceil(distance / std::max(CROSSING_MIN_SPACING, radius * CROSSING_SPACING))));
        for (int k = 1; clear && k <= samples; ++k) {
          const auto point =
              crossing_point({c.x, c.y}, landing, angle, end_angle, radius, double(k) / samples);
          const double dx = delta_x(point.x - previous.x), dy = point.y - previous.y,
                       length = std::hypot(dx, dy);
          if (!free(point.x, point.y, CROSSING_PROBE * radius) ||
              (length > tolerance::negligible &&
               !clear_line(previous.x, previous.y, point.x, point.y) &&
               ray(previous.x, previous.y, dx / length, dy / length, CROSSING_PROBE * radius,
                   length) < length - tolerance::precision))
            return;
          previous = point;
        }
        nearest = distance;
        target = j;
      });
    }
    return target;
  };
  auto plan_walk = [&](Crab &c, const VisibleBody *danger = nullptr) {
    auto start = ids.find(c.patch);
    if (start == ids.end())
      return false;
    Point meal{c.x, c.y};
    double nearest_meal = env_.crab_search_radius;
    bool hungry = !danger && c.energy < CRAB_HUNGRY * crab_capacity(c.morph, env_);
    if (hungry && c.crossing <= 0 && (c.state != crab_state::fleeing || c.age >= c.next_move) &&
        algae_food(vegetation_.surfaces[start->second]) > 0) {
      c.path.clear();
      c.target = c.patch;
      c.destination = c.along;
      c.digging = 0;
      if (c.state != crab_state::foraging)
        c.exposed_age = 0;
      c.state = crab_state::foraging;
      return true;
    }
    if (hungry) {
      vegetation_.surface_grid.nearby(c.x, c.y, env_.crab_search_radius, [&](std::uint32_t j) {
        const auto &s = vegetation_.surfaces[j];
        const auto q = patch_position(s, PATCH_MIDDLE, 0);
        const double d = std::hypot(delta_x(q.x - c.x), q.y - c.y);
        if (algae_food(s) > 0 && d < nearest_meal) {
          nearest_meal = d;
          meal = q;
        }
      });
      vegetation_.plant_grid.nearby(c.x, c.y, env_.crab_search_radius, [&](std::uint32_t j) {
        const auto &part = vegetation_.plants[j];
        const double d = std::hypot(delta_x(part.x - c.x), part.y - c.y);
        if (part.patch >= vegetation_.surfaces.size() && part.energy > 0 && d < nearest_meal) {
          nearest_meal = d;
          meal = {part.x, part.y};
        }
      });
      feeding_.grid.nearby(c.x, c.y, env_.crab_search_radius, [&](std::uint32_t j) {
        const auto &food = feeding_.pieces[j];
        const double d = std::hypot(delta_x(food.x - c.x), food.y - c.y);
        if (food.origin > food_kind::feed && food.origin <= food_kind::plant && food.energy > 0 &&
            d < nearest_meal) {
          nearest_meal = d;
          meal = {food.x, food.y};
        }
      });
    }
    const bool has_meal = hungry && nearest_meal < env_.crab_search_radius;
    std::vector<int> previous(vegetation_.surfaces.size(), -1);
    std::vector<std::size_t> queue{start->second};
    previous[start->second] = int(start->second);
    std::size_t target = start->second;
    double sum = 0;
    for (std::size_t at = 0; at < queue.size(); ++at) {
      const auto i = queue[at];
      const auto &s = vegetation_.surfaces[i];
      const auto q = patch_position(s, PATCH_MIDDLE, 0);
      if (s.normal.y <= -CRAB_FOOTING && i != start->second &&
          (sediment_depth(vegetation_.surfaces[start->second]) >= env_.burrow_depth ||
           sediment_depth(s) >= env_.burrow_depth)) {
        if (danger) {
          const double distance = std::hypot(delta_x(q.x - danger->x), q.y - danger->y);
          if (distance > sum) {
            sum = distance;
            target = i;
          }
        } else if (has_meal) {
          const double score = 1 / (1 + std::hypot(delta_x(q.x - meal.x), q.y - meal.y));
          if (score > sum) {
            sum = score;
            target = i;
          }
        } else if (sediment_depth(s) >= env_.burrow_depth) {
          const double weight = s.detritus + WANDER_WEIGHT;
          sum += weight;
          if (rng.uniform() * sum < weight)
            target = i;
        }
      }
      for (auto j : web.neighbors[i]) {
        const auto r = patch_position(vegetation_.surfaces[j], PATCH_MIDDLE, 0);
        if (previous[j] < 0 && vegetation_.surfaces[j].normal.y <= CRAB_OVERHANG &&
            std::hypot(delta_x(r.x - c.x), r.y - c.y) <= env_.crab_search_radius &&
            std::hypot(delta_x(q.x - r.x), q.y - r.y) <=
                s.length + vegetation_.surfaces[j].length + env_.crab_edge_gap) {
          previous[j] = int(i);
          queue.push_back(j);
        }
      }
    }
    c.path.clear();
    if (target == start->second &&
        sediment_depth(vegetation_.surfaces[target]) < env_.burrow_depth) {
      double nearest = std::numeric_limits<double>::infinity();
      target = nearest_bed(c, start->second, false, true, nearest);
      if (!std::isfinite(nearest))
        target = nearest_bed(c, start->second, false, false, nearest);
      if (std::isfinite(nearest)) {
        c.crossing = 1;
        c.crossing_x = c.x;
        c.crossing_y = c.y;
        const auto &s = vegetation_.surfaces[start->second];
        c.crossing_angle = std::atan2(s.normal.x, -s.normal.y);
        c.patch = vegetation_.surfaces[target].id;
        c.along = PATCH_MIDDLE;
      }
    }
    c.target = vegetation_.surfaces[target].id;
    const auto &goal = vegetation_.surfaces[target];
    const double gx = goal.b.x - goal.a.x, gy = goal.b.y - goal.a.y;
    c.destination = has_meal
                        ? std::clamp((delta_x(meal.x - goal.a.x) * gx + (meal.y - goal.a.y) * gy) /
                                         std::max(tolerance::negligible, gx * gx + gy * gy),
                                     CRAB_MEAL_MARGIN, 1 - CRAB_MEAL_MARGIN)
                        : rng.uniform(CRAB_WANDER_MARGIN, 1 - CRAB_WANDER_MARGIN);
    if (!has_meal && std::abs(c.destination - c.along) < CRAB_MIN_WALK)
      c.destination = c.along < PATCH_MIDDLE ? 1 - CRAB_WANDER_MARGIN : CRAB_WANDER_MARGIN;
    for (auto i = target; c.crossing <= 0 && i != start->second; i = std::size_t(previous[i]))
      c.path.push_back(vegetation_.surfaces[i].id);
    std::reverse(c.path.begin(), c.path.end());
    if (c.state != crab_state::foraging)
      c.exposed_age = 0;
    const bool frightened = danger || (c.state == crab_state::fleeing && c.age < c.next_move);
    const auto deadline = c.next_move;
    c.state = frightened ? crab_state::fleeing : crab_state::foraging;
    c.next_move = frightened
                      ? std::max(deadline, c.age + (danger ? CRAB_FLEE_TIME : 0))
                      : c.age + std::uint64_t(CRAB_WALK_INTERVALS *
                                              rng.uniform(env_.crab_move_interval,
                                                          std::max(env_.crab_move_interval,
                                                                   env_.crab_move_interval_max)));
    return true;
  };
  auto escape = [&](Crab &c) {
    const auto start = ids.find(c.patch);
    if (start == ids.end())
      return;
    double nearest;
    auto target = nearest_bed(c, start->second, true, true, nearest);
    if (!std::isfinite(nearest))
      target = nearest_bed(c, start->second, true, false, nearest);
    if (!std::isfinite(nearest)) {
      plan_walk(c);
      return;
    }
    const auto &s = vegetation_.surfaces[start->second];
    c.path.clear();
    c.crossing = 1;
    c.crossing_x = c.x;
    c.crossing_y = c.y;
    c.crossing_angle = std::atan2(s.normal.x, -s.normal.y);
    c.patch = c.target = vegetation_.surfaces[target].id;
    c.along = PATCH_MIDDLE;
    c.destination = rng.uniform(CRAB_LANDING_MARGIN, 1 - CRAB_LANDING_MARGIN);
    c.state = crab_state::foraging;
    c.digging = 0;
    c.next_move = c.age + CRAB_LANDING_PAUSE;
  };
  std::vector<Crab> newborn;
  auto birth_crab = [&](std::size_t i, bool external = false) {
    if (web.crabs.size() + newborn.size() >= crab_limit)
      return;
    auto &source = vegetation_.surfaces[i];
    if ((external ? birth_funds(benthic::crabs) : source.detritus) < env_.crab_birth_energy)
      return;
    const double separation =
        env_.crab_spacing * rng.uniform(CRAB_BIRTH_SPACING_MIN, CRAB_BIRTH_SPACING_MAX);
    std::size_t destination = i;
    double along = PATCH_MIDDLE;
    bool placed = false;
    std::vector<std::size_t> candidates{i};
    if (!external)
      vegetation_.surface_grid.nearby(source.a.x, source.a.y, env_.crab_search_radius,
                                      [&](std::uint32_t j) {
                                        if (j != i)
                                          candidates.push_back(j);
                                      });
    for (const auto j : candidates) {
      const auto &target = vegetation_.surfaces[j];
      if (target.normal.y > -CRAB_FOOTING)
        continue;
      along = rng.uniform(CRAB_SITE_MARGIN, 1 - CRAB_SITE_MARGIN);
      const auto edges = sediment_edges(j);
      const double depth = edges[0] + along * (edges[1] - edges[0]);
      if (!bed_site_clear(target, along,
                          std::max(placement::site_min_height, depth * placement::site_depth_share),
                          placement::animal_headroom))
        continue;
      const auto site = patch_position(target, along, 0);
      const auto close = [&](const Crab &q) {
        return q.energy > 0 && std::hypot(delta_x(q.x - site.x), q.y - site.y) < separation;
      };
      if (std::any_of(web.crabs.begin(), web.crabs.end(), close) ||
          std::any_of(newborn.begin(), newborn.end(), close))
        continue;
      destination = j;
      placed = true;
      break;
    }
    if (!placed)
      return;
    auto &s = vegetation_.surfaces[destination];
    Crab c;
    c.id = web.next_id++;
    c.exposure = 0;
    c.stride = rng.uniform(0, 2 * PI);
    c.depth = burial_share(rng.uniform());
    c.morph = double(rng.index(crab_families)) + rng.uniform() * placement::morph_span;
    c.patch = s.id;
    c.along = along;
    c.energy =
        external && time == 1 ? startup_import(env_.crab_birth_energy) : env_.crab_birth_energy;
    if (!external)
      source.detritus -= c.energy;
    const auto q = crab_position(c, s);
    c.x = wrap_x(q.x);
    c.y = q.y;
    plan_walk(c);
    if (external && time != 1) {
      benthic_left[benthic::crabs] -= c.energy;
      request_production(c.energy, [this, c](double grant) {
        if (grant + tolerance::negligible < c.energy)
          return 0.;
        food_web_.crabs.push_back(c);
        energy_available -= c.energy;
        food_web_.introduced += c.energy;
        feeding_.food_allowance = std::max(0., feeding_.food_allowance - c.energy);
        return c.energy;
      });
      c.energy = 0;
    }
    newborn.push_back(c);
  };
  for (auto &c : web.crabs) {
    if (c.energy <= 0)
      continue;
    if (c.feeding.remaining > 0)
      --c.feeding.remaining;
    else
      c.feeding.rate = 0;
    if (crab_walking(c)) {
      const double target = burial_share(
          (1 +
           std::sin(c.id * CRAB_BOB_PHASE +
                    c.age / (CRAB_BOB_PERIOD + CRAB_BOB_PERIOD_SPREAD * morph_variant(c.morph)))) /
          2);
      c.depth += std::clamp(target - c.depth, -CRAB_BOB_RATE, CRAB_BOB_RATE);
    }
    const auto found = ids.find(c.patch);
    if (++c.age >= individual_lifespan(env_.crab_lifespan, morph_variant(c.morph)) ||
        found == ids.end()) {
      deposit_detritus(c.x, c.y, c.energy);
      c.energy = 0;
      continue;
    }
    auto &s = vegetation_.surfaces[found->second];
    const double old_x = c.x, old_y = c.y, old_along = c.along,
                 capacity = crab_capacity(c.morph, env_);
    const auto old_patch = c.patch;
    const double intake =
        c.crossing > 0 ? 0
                       : std::min({capacity - c.energy, capacity / env_.crab_mature, s.detritus});
    c.energy += intake;
    s.detritus -= intake;
    if (intake > 0)
      c.feeding = {intake, c.x, c.y, food_kind::benthic, CRAB_FEEDING_STEPS};
    if (c.state != crab_state::buried && c.exposure > CRAB_OUT && c.energy < capacity) {
      if (c.crossing <= 0) {
        const double amount =
            std::min({algae_food(s), capacity - c.energy, capacity / env_.crab_mature});
        s.algae -= amount;
        s.algae_grazed += amount;
        c.energy += amount;
        if (amount > 0)
          c.feeding = {amount, c.x, c.y, food_kind::algae, CRAB_FEEDING_STEPS};
      }
      feeding_.grid.nearby(
          c.x, c.y, crab_radius(c.energy, env_, c.morph) + feeding_.indexed_food_radius,
          [&](std::uint32_t j) {
            if (j >= feeding_.pieces.size())
              return;
            auto &food = feeding_.pieces[j];
            if (food.energy <= 0 ||
                (food.origin < food_kind::fish || food.origin > food_kind::plant))
              return;
            if (std::hypot(delta_x(food.x - c.x), food.y - c.y) >
                food_radius(food) + crab_radius(c.energy, env_, c.morph))
              return;
            const double amount =
                std::min({food.energy, capacity - c.energy, capacity / env_.crab_mature});
            food.energy -= amount;
            c.energy += amount;
            if (amount > 0)
              c.feeding = {amount, food.x, food.y, food.origin, CRAB_FEEDING_STEPS};
          });
      double room = std::min(capacity - c.energy, capacity / env_.crab_mature);
      vegetation_.plant_grid.nearby(
          c.x, c.y, crab_radius(c.energy, env_, c.morph) + vegetation_.indexed_plant_radius,
          [&](std::uint32_t j) {
            const auto &part = vegetation_.plants[j];
            if (room <= 0 || part.patch < vegetation_.surfaces.size() || part.organ < 0 ||
                stroke_distance(part, delta_x(c.x - part.x), c.y - part.y) >
                    crab_radius(c.energy, env_, c.morph))
              return;
            auto &plant = plant_source_mut(part.patch);
            auto &o = plant.organs[part.organ];
            const double amount = std::min(room, o.energy),
                         crumbs =
                             std::min(std::max(0., o.energy - amount), amount * CRAB_CRUMB_SHARE);
            o.energy -= amount + crumbs;
            plant.grass = std::max(0., plant.grass - amount - crumbs);
            c.energy += amount;
            room -= amount;
            if (amount > 0)
              c.feeding = {amount, part.x, part.y, food_kind::plant, CRAB_PLANT_FEEDING_STEPS};
            if (crumbs > 0) {
              Food crumb{wrap_x(part.x), part.y, 0, 0, 0, crumbs};
              crumb.origin = food_kind::plant;
              crumb.initial_energy = crumbs;
              crumb.hardness = plant_bite_hardness(o.kind, grass_traits(plant)[0], env_, 0);
              crumb.blunt = plant_bite_is_hard(o.kind);
              crumb.radius = food_radius(crumbs);
              crumb.buoyancy = PLANT_BUOYANCY;
              crumb.color = plant_organ_color(plant, part.organ);
              append_fragment(crumb);
            }
            if (o.energy > 0 && o.length > MIN_SHORTEN_LENGTH) {
              const double t =
                  std::clamp(o.energy / std::max(.001, o.energy + amount + crumbs), 0., 1.);
              o.curve = lower_curve(o.curve, t);
              o.length *= t;
            }
          });
    }
    if (c.energy >= capacity - tolerance::negligible &&
        c.age % std::uint64_t(env_.crab_mature) == 0 &&
        s.detritus >= CRAB_BIRTH_DETRITUS * env_.crab_leave * s.length)
      birth_crab(found->second);
    const auto *danger =
        danger_near(c.x, c.y, env_.worm_retreat_radius, env_.worm_retreat_body, -1);
    const auto bed_edges = sediment_edges(found->second);
    const double local_depth = bed_edges[0] + c.along * (bed_edges[1] - bed_edges[0]);
    const double body = crab_radius(c.energy, env_, c.morph);
    const auto open_water = [&](double x, double y) {
      return free(x + s.normal.x * CRAB_HEADROOM * body, y + s.normal.y * CRAB_HEADROOM * body,
                  CRAB_HEADROOM_PROBE * body);
    };
    const bool can_burrow = open_water(c.x, c.y) &&
                            local_depth >= std::max(env_.burrow_depth, CRAB_BURROW_DEPTH * body);
    if (!can_burrow && crab_hidden(c)) {
      c.digging = 0;
      c.exposure = std::max(
          c.exposure,
          std::clamp(1 - local_depth / std::max(MIN_BURROW_DEPTH, CRAB_BURROW_DEPTH * body), 0.,
                     1.));
      plan_walk(c, danger);
    }
    if (danger && c.state == crab_state::digging) {
      c.digging = 0;
      plan_walk(c, danger);
    }
    if (c.state == crab_state::foraging && c.crossing <= 0 && c.age % CRAB_GOAL_CHECK == 0) {
      const auto goal = ids.find(c.target);
      if (goal == ids.end() ||
          (sediment_depth(vegetation_.surfaces[goal->second]) < env_.burrow_depth &&
           algae_food(vegetation_.surfaces[goal->second]) <= 0)) {
        const auto deadline = c.next_move;
        plan_walk(c, danger);
        c.next_move = deadline;
      }
    }
    const bool crossing = c.crossing > 0;
    if (crossing) {
      const auto landing = crab_position(c, s);
      const double distance =
                       std::hypot(delta_x(landing.x - c.crossing_x), landing.y - c.crossing_y),
                   radius = crab_radius(c.energy, env_, c.morph),
                   speed = std::max(
                       CROSSING_MIN_SPEED,
                       (c.state == crab_state::fleeing ? env_.crab_flee_speed : env_.crab_speed) *
                           crab_pace(c.id, c.morph)),
                   height = CROSSING_ARC_RADII * radius + CROSSING_ARC_SPAN * distance;
      c.crossing = std::max(0., c.crossing - speed / std::max(CROSSING_MIN_STEPS * speed,
                                                              CROSSING_SPAN_WEIGHT * distance +
                                                                  CROSSING_HEIGHT_WEIGHT * height));
      const auto point =
          crossing_point({c.crossing_x, c.crossing_y}, landing, c.crossing_angle,
                         std::atan2(s.normal.x, -s.normal.y), radius, 1 - c.crossing);
      c.x = point.x;
      c.y = point.y;
    } else if (c.state == crab_state::buried) {
      const auto q = crab_position(c, s);
      c.x = wrap_x(q.x);
      c.y = q.y;
      if (c.age >= c.next_move || !can_burrow) {
        const double radius = crab_radius(c.energy, env_, c.morph);
        const bool blocked =
            std::any_of(web.crabs.begin(), web.crabs.end(), [&](const Crab &other) {
              return other.id != c.id && other.energy > 0 && other.exposure > CRAB_OUT &&
                     std::hypot(delta_x(other.x - c.x), other.y - c.y) <
                         CRAB_SEPARATION * (radius + crab_radius(other.energy, env_, other.morph));
            });
        if (blocked)
          c.next_move = c.age + CRAB_BLOCKED_WAIT + c.id % CRAB_BLOCKED_SPREAD;
        else
          plan_walk(c, danger);
      }
    } else if (c.exposure < CRAB_FULLY_OUT && c.state != crab_state::digging) {
      const auto q = crab_position(c, s);
      c.x = wrap_x(q.x);
      c.y = q.y;
    } else {
      const double away = danger ? delta_x(c.x - danger->x) : 0;
      if (danger && c.state != crab_state::digging &&
          (c.state != crab_state::fleeing || away * c.direction < 0))
        plan_walk(c, danger);
      else if (!danger && c.state == crab_state::foraging && c.age >= c.next_move) {
        if (can_burrow) {
          c.state = crab_state::digging;
          c.digging = 0;
        } else
          plan_walk(c);
      }
      const double speed =
          (c.state == crab_state::fleeing ? env_.crab_flee_speed : env_.crab_speed) *
          crab_pace(c.id, c.morph) *
          (CRAB_GAIT_MIN + (1 - CRAB_GAIT_MIN) * std::sin(c.age * CRAB_GAIT_RATE + c.id));
      ++c.exposed_age;
      if (c.state == crab_state::digging && !can_burrow) {
        c.digging = 0;
        plan_walk(c, danger);
      }
      if (c.state == crab_state::digging) {
        if (++c.digging >= env_.crab_burrow_time) {
          c.state = crab_state::buried;
          c.digging = 0;
          c.next_move = c.age + std::uint64_t(rng.uniform(env_.crab_move_interval,
                                                          std::max(env_.crab_move_interval,
                                                                   env_.crab_move_interval_max)));
        }
      } else if (c.path.empty()) {
        const double delta = c.destination - c.along, step = speed / s.length;
        c.along += std::clamp(delta, -step, step);
        const auto point = crab_position(c, s);
        c.x = wrap_x(point.x);
        c.y = point.y;
        if (std::abs(delta) <= step) {
          if (c.state == crab_state::fleeing && !danger && c.age >= c.next_move && can_burrow) {
            c.state = crab_state::digging;
            c.digging = 0;
          } else {
            const auto deadline = c.next_move;
            plan_walk(c);
            c.next_move = deadline;
          }
        } else if (c.age % CRAB_REPLAN == 0)
          plan_walk(c);
      } else {
        const auto next = ids.find(c.path.front());
        if (next == ids.end()) {
          plan_walk(c);
          continue;
        }
        const auto &target = vegetation_.surfaces[next->second];
        int leave = 0, enter = 0;
        double nearest = std::numeric_limits<double>::infinity();
        for (int from = 0; from < 2; ++from)
          for (int to = 0; to < 2; ++to) {
            const auto a = from ? s.b : s.a, b = to ? target.b : target.a;
            const double distance = std::hypot(delta_x(a.x - b.x), a.y - b.y);
            if (distance < nearest) {
              nearest = distance;
              leave = from;
              enter = to;
            }
          }
        if (nearest > env_.crab_edge_gap + tolerance::negligible) {
          plan_walk(c);
          continue;
        }
        const double delta = leave - c.along, step = speed / s.length;
        c.along += std::clamp(delta, -step, step);
        const auto q = crab_position(c, s);
        c.x = wrap_x(q.x);
        c.y = q.y;
        if (std::abs(delta) <= step) {
          c.patch = c.path.front();
          c.path.erase(c.path.begin());
          c.along = enter;
          const double angle = std::atan2(s.normal.x, -s.normal.y),
                       next_angle = std::atan2(target.normal.x, -target.normal.y);
          if (std::abs(std::remainder(next_angle - angle, 2 * PI)) > CRAB_MAX_TURN) {
            c.crossing = 1;
            c.crossing_x = c.x;
            c.crossing_y = c.y;
            c.crossing_angle = angle;
          } else {
            const auto q = crab_position(c, target);
            c.x = wrap_x(q.x);
            c.y = q.y;
          }
        }
      }
    }
    if (!crossing && c.patch == old_patch && (c.x != old_x || c.y != old_y) &&
        !open_water(c.x, c.y) && open_water(old_x, old_y)) {
      c.x = old_x;
      c.y = old_y;
      c.along = old_along;
      c.path.clear();
      plan_walk(c, danger);
    }
    if (c.state != crab_state::buried && !crossing && c.exposure > CRAB_OUT) {
      const double radius = crab_radius(c.energy, env_, c.morph);
      for (const auto &other : web.crabs) {
        if (other.id == c.id || other.energy <= 0 || other.exposure < CRAB_OUT)
          continue;
        const double separation =
            CRAB_SEPARATION * (radius + crab_radius(other.energy, env_, other.morph));
        const double before = std::hypot(delta_x(old_x - other.x), old_y - other.y),
                     after = std::hypot(delta_x(c.x - other.x), c.y - other.y);
        if (after < separation && after < before) {
          c.x = old_x;
          c.y = old_y;
          const double sx = s.b.x - s.a.x, sy = s.b.y - s.a.y;
          c.along = std::clamp((delta_x(old_x - s.a.x) * sx + (old_y - s.a.y) * sy) /
                                   std::max(tolerance::negligible, sx * sx + sy * sy),
                               CRAB_END_MARGIN, 1 - CRAB_END_MARGIN);
          if (can_burrow && !danger && c.state != crab_state::fleeing) {
            c.state = crab_state::digging;
            c.digging = 0;
          } else {
            Crab probe = c;
            probe.along = std::min(1 - CRAB_END_MARGIN, c.along + CRAB_LOOK_AHEAD);
            const auto ahead = crab_position(probe, s);
            probe.along = std::max(CRAB_END_MARGIN, c.along - CRAB_LOOK_AHEAD);
            const auto behind = crab_position(probe, s);
            c.path.clear();
            c.destination = std::hypot(delta_x(ahead.x - other.x), ahead.y - other.y) >=
                                    std::hypot(delta_x(behind.x - other.x), behind.y - other.y)
                                ? 1 - CRAB_WANDER_MARGIN
                                : CRAB_WANDER_MARGIN;
          }
          break;
        }
      }
    }
    const double exposed = crab_hidden(c) ? 0 : 1;
    c.exposure =
        std::clamp(c.exposure + std::clamp(exposed - c.exposure,
                                           -1. / std::max(CRAB_EMERGE_STEPS, env_.crab_burrow_time),
                                           1. / CRAB_EMERGE_STEPS),
                   0., 1.);
    const double dx = delta_x(c.x - old_x), dy = c.y - old_y;
    if (!crossing && std::abs(dx) > tolerance::precision)
      c.direction = dx > 0 ? 1 : -1;
    const double distance = std::hypot(dx, dy),
                 step =
                     std::max(CRAB_MIN_STEP, (c.state == crab_state::fleeing ? env_.crab_flee_speed
                                                                             : env_.crab_speed) *
                                                 crab_pace(c.id, c.morph));
    if (!crossing && distance > step) {
      c.x = wrap_x(old_x + dx * step / distance);
      c.y = old_y + dy * step / distance;
    }
    const double travelled = std::hypot(delta_x(c.x - old_x), c.y - old_y);
    if (crab_walking(c))
      c.stride += travelled * CRAB_STRIDE_RATE / std::max(1., crab_radius(c.energy, env_, c.morph));
    if (crab_walking(c) && !crossing && c.crossing <= 0 && c.exposure > CRAB_OUT &&
        c.feeding.remaining <= 0 && travelled < CRAB_STALL_MOVE) {
      if (++c.stalled >= CRAB_STALL_STEPS) {
        c.stalled = 0;
        escape(c);
      }
    } else
      c.stalled = 0;
  }
  if (time == 1 || time % std::uint64_t(env_.crab_mature) == 0) {
    const auto settlers =
        std::min(crab_limit,
                 std::size_t(std::max(1., std::ceil(sediment_length /
                                                    (CRAB_SETTLER_SPACINGS * env_.crab_spacing)))));
    for (std::size_t n = web.crabs.size() + newborn.size(); n < settlers; ++n) {
      std::size_t best = vegetation_.surfaces.size();
      double food = -1;
      for (std::size_t i = 0; i < vegetation_.surfaces.size(); ++i) {
        const auto &s = vegetation_.surfaces[i];
        if (s.normal.y > -seabed::floor_normal || sediment_depth(s) < env_.burrow_depth ||
            birth_funds(benthic::crabs) < env_.crab_birth_energy)
          continue;
        const auto site = patch_position(s, PATCH_MIDDLE, 0);
        auto too_close = [&](const auto &c) {
          return c.energy > 0 &&
                 std::hypot(delta_x(c.x - site.x), c.y - site.y) < env_.crab_spacing;
        };
        const bool occupied = std::any_of(web.crabs.begin(), web.crabs.end(), too_close) ||
                              std::any_of(newborn.begin(), newborn.end(), too_close);
        const double score = time == 1 ? rng.uniform() : s.detritus / s.length;
        if (!occupied && score > food) {
          best = i;
          food = score;
        }
      }
      if (best == vegetation_.surfaces.size())
        break;
      birth_crab(best, true);
    }
  }
  web.crabs.erase(std::remove_if(web.crabs.begin(), web.crabs.end(),
                                 [](const auto &v) { return v.energy <= 0; }),
                  web.crabs.end());
  for (const auto &c : newborn)
    if (c.energy > 0)
      web.crabs.push_back(c);
  SpatialGrid mussel_sites;
  mussel_sites.reset(geometry_.width, geometry_.height);
  std::vector<Point> locations;
  std::vector<double> clearances;
  double max_clearance = 0;
  for (const auto &m : web.mussels)
    if (m.energy > 0) {
      const auto found = ids.find(m.patch);
      if (found == ids.end())
        continue;
      const auto &s = vegetation_.surfaces[found->second];
      const Point anchor{s.a.x + m.along * (s.b.x - s.a.x), s.a.y + m.along * (s.b.y - s.a.y)};
      mussel_sites.add(anchor.x, anchor.y, locations.size());
      locations.push_back(anchor);
      clearances.push_back(mussel_bed_radius(m.morph, env_));
      max_clearance = std::max(max_clearance, clearances.back());
    }
  std::vector<Mussel> young;
  auto spawn_reach = [&](const Mussel &m) {
    return env_.mussel_spawn_radius * mussel_spread(m.morph).reach *
           (MUSSEL_REACH_MIN + MUSSEL_REACH_SPREAD * morph_variant(m.morph));
  };
  auto settle = [&](std::size_t i, double &funds, bool external, const Mussel *parent = nullptr,
                    bool far = false) {
    auto &s = vegetation_.surfaces[i];
    const auto edges = sediment_edges(i);
    if (edges[0] > tolerance::negligible || edges[1] > tolerance::negligible ||
        s.algae_open[1] <= s.algae_open[0] || funds < env_.mussel_birth_energy)
      return false;
    const double family = parent ? std::floor(parent->morph) : double(rng.index(mussel_families));
    if (s.algae > env_.mussel_algae_limit * mussel_spread(family).algae * algae_capacity(s))
      return false;
    const int kind = mussel_family(family);
    if ((kind == mussel_form::fan && s.normal.y > -FAN_TOP_NORMAL &&
         rng.uniform() < HABITAT_AVOIDANCE) ||
        (kind == mussel_form::razor && std::abs(s.normal.y) > RAZOR_FLANK_NORMAL &&
         rng.uniform() < HABITAT_AVOIDANCE))
      return false;
    const double reach = parent ? spawn_reach(*parent) : env_.mussel_spawn_radius;
    for (int trial = 0; trial < SETTLE_TRIALS; ++trial) {
      const double morph = family + rng.uniform() * placement::morph_span,
                   along = parent && !far && parent->patch == s.id
                               ? std::clamp(parent->along + (rng.uniform() < .5 ? -1. : 1.) *
                                                                rng.uniform(LARVA_MIN_REACH, 1.) *
                                                                reach / s.length,
                                            s.algae_open[0], s.algae_open[1])
                               : rng.uniform(s.algae_open[0], s.algae_open[1]);
      bool free = true;
      const auto point = patch_position(s, along, 0);
      if (parent && !far && std::hypot(delta_x(point.x - parent->x), point.y - parent->y) > reach)
        continue;
      const double spacing = mussel_bed_radius(morph, env_);
      mussel_sites.nearby(point.x, point.y, spacing + max_clearance, [&](std::uint32_t j) {
        if (std::hypot(delta_x(point.x - locations[j].x), point.y - locations[j].y) <
            spacing + clearances[j])
          free = false;
      });
      if (!free)
        continue;
      if (external && birth_funds(benthic::mussels) < env_.mussel_birth_energy)
        return false;
      const double amount = external && time == 1 ? startup_import(env_.mussel_birth_energy)
                                                  : env_.mussel_birth_energy;
      if (amount < env_.mussel_birth_energy) {
        web.released += amount;
        return false;
      }
      if (!external)
        funds -= amount;
      Mussel m;
      m.id = web.next_id++;
      m.patch = s.id;
      m.energy = amount;
      m.along = along;
      m.morph = morph;
      const double lift = fauna::mussel_lift * mussel_radius(m.energy, env_, m.morph);
      const Point q{s.a.x + along * (s.b.x - s.a.x) + s.normal.x * lift,
                    s.a.y + along * (s.b.y - s.a.y) + s.normal.y * lift};
      m.x = wrap_x(q.x);
      m.y = q.y;
      if (external && time != 1) {
        benthic_left[benthic::mussels] -= m.energy;
        request_production(m.energy, [this, m](double grant) {
          if (grant + tolerance::negligible < m.energy)
            return 0.;
          food_web_.mussels.push_back(m);
          energy_available -= m.energy;
          food_web_.introduced += m.energy;
          feeding_.food_allowance = std::max(0., feeding_.food_allowance - m.energy);
          return m.energy;
        });
        m.energy = 0;
      }
      young.push_back(m);
      mussel_sites.add(point.x, point.y, locations.size());
      locations.push_back(point);
      clearances.push_back(spacing);
      max_clearance = std::max(max_clearance, spacing);
      return true;
    }
    return false;
  };
  for (auto &m : web.mussels) {
    m.filter_rate *= MUSSEL_FILTER_KEEP;
    if (m.energy <= 0)
      continue;
    const auto found = ids.find(m.patch);
    if (++m.age >= individual_lifespan(env_.mussel_lifespan, morph_variant(m.morph)) ||
        found == ids.end()) {
      web.released += m.energy;
      m.energy = 0;
      continue;
    }
    auto &s = vegetation_.surfaces[found->second];
    const double radius = mussel_radius(m.energy, env_, m.morph);
    m.x = wrap_x(s.a.x + m.along * (s.b.x - s.a.x) + s.normal.x * fauna::mussel_lift * radius);
    m.y = s.a.y + m.along * (s.b.y - s.a.y) + s.normal.y * fauna::mussel_lift * radius;
    const double capacity = mussel_capacity(m.morph, env_);
    if (sediment_cover(m.x, m.y) > 0 || sediment_depth(s) > radius) {
      if (++m.buried >= env_.mussel_burial_death) {
        s.detritus += m.energy;
        m.energy = 0;
      }
      continue;
    }
    m.buried = 0;
    const double overgrowth = mussel_overgrowth(s);
    if (overgrowth > 0) {
      double loss = m.energy * half_life_loss(overgrowth / env_.mussel_burial_death);
      if (m.energy - loss < env_.mussel_birth_energy) {
        loss = m.energy;
        web.shells.push_back(
            {web.next_id++, m.x, m.y, radius, m.morph, std::atan2(s.normal.x, -s.normal.y), 0});
      }
      m.energy -= loss;
      deposit_detritus(m.x, m.y, loss);
      continue;
    }
    if (danger_near(m.x, m.y, env_.worm_retreat_radius, env_.worm_retreat_body,
                    env_.prey_alert_speed))
      m.closed = int(env_.mussel_close_time);
    else
      m.closed = std::max(0, m.closed - 1);
    if (m.closed)
      continue;
    const double filtered =
        filter_plankton(m.x, m.y, env_.mussel_filter_radius, env_.mussel_filter_rate,
                        std::min(capacity / env_.mussel_mature, capacity - m.energy));
    m.energy += filtered;
    m.filtered += filtered;
    m.filter_rate += (1 - MUSSEL_FILTER_KEEP) * filtered;
    if (m.energy >= env_.mussel_spawn_filling * capacity &&
        m.age % std::uint64_t(env_.mussel_spawn) == 0) {
      const auto spread = mussel_spread(m.morph);
      const int brood =
          1 + rng.index(std::max(
                  1, int(std::lround(spread.brood * (BROOD_MIN + BROOD_SPREAD * rng.uniform())))));
      int born = 0;
      if (rng.uniform() < env_.mussel_far_settling)
        for (int trial = 0; trial < FAR_TRIALS && !born; ++trial)
          born += settle(std::size_t(rng.index(int(vegetation_.surfaces.size()))), m.energy, false,
                         &m, true);
      vegetation_.surface_grid.nearby(m.x, m.y, spawn_reach(m), [&](std::uint32_t i) {
        for (int trial = 0; trial < NEAR_TRIALS && born < brood; ++trial)
          if (settle(i, m.energy, false, &m))
            ++born;
      });
    }
  }
  web.mussels.erase(std::remove_if(web.mussels.begin(), web.mussels.end(),
                                   [](const auto &v) { return v.energy <= 0; }),
                    web.mussels.end());
  if (!vegetation_.surfaces.empty() &&
      (time == 1 || time % std::uint64_t(env_.mussel_seed_period) == 0)) {
    double bare = 0;
    for (const auto &s : vegetation_.surfaces)
      bare += s.length * (s.algae_open[1] - s.algae_open[0]);
    const auto settlers = std::size_t(std::ceil(bare / MUSSEL_SETTLER_LENGTH));
    for (std::size_t attempt = 0;
         attempt < settlers && web.mussels.size() + young.size() < settlers; ++attempt) {
      double funds = env_.mussel_birth_energy;
      bool placed = false;
      for (int trial = 0; trial < MUSSEL_SETTLE_TRIALS && !placed; ++trial) {
        std::size_t best = rng.index(vegetation_.surfaces.size());
        double richest = -1;
        for (int candidate = 0; candidate < MUSSEL_CANDIDATES; ++candidate) {
          const auto i = rng.index(vegetation_.surfaces.size());
          const auto &surface = vegetation_.surfaces[i];
          if (sediment_depth(surface) > seabed::bare_depth ||
              surface.algae_open[1] <= surface.algae_open[0] ||
              surface.algae > env_.mussel_algae_limit * algae_capacity(surface))
            continue;
          const auto q = patch_position(surface, PATCH_MIDDLE, PLANKTON_PROBE_LIFT);
          const double density = plankton_density(q.x, q.y);
          if (density > richest) {
            richest = density;
            best = i;
          }
        }
        placed = settle(best, funds, true);
      }
      if (!placed)
        break;
      const Mussel anchor = young.back();
      const auto start = young.size(),
                 cluster = std::size_t(rng.index(int(1 + mussel_spread(anchor.morph).brood)));
      vegetation_.surface_grid.nearby(
          anchor.x, anchor.y, spawn_reach(anchor), [&](std::uint32_t i) {
            for (int trial = 0; trial < MUSSEL_CLUSTER_TRIALS && young.size() < start + cluster &&
                                web.mussels.size() + young.size() < settlers;
                 ++trial)
              settle(i, funds, true, &anchor);
          });
    }
  }
  for (const auto &m : young)
    if (m.energy > 0)
      web.mussels.push_back(m);
  std::array<double, benthic::count> gaps{};
  auto worm_gap = [&](const SurfacePatch &s) {
    if (s.normal.y > -seabed::floor_normal || sediment_depth(s) < env_.burrow_depth)
      return 0.;
    const auto i = std::size_t(&s - vegetation_.surfaces.data());
    return std::max(0., env_.worm_max * s.length - s.worms - exposed_worms[i]);
  };
  auto crab_gap = [&](const Crab &c) {
    return c.energy > 0 ? std::max(0., crab_capacity(c.morph, env_) - c.energy) : 0.;
  };
  auto mussel_gap = [&](const Mussel &m) {
    const auto at = ids.find(m.patch);
    return m.energy > 0 && !m.buried && at != ids.end() &&
                   mussel_overgrowth(vegetation_.surfaces[at->second]) <= 0
               ? std::max(0., mussel_capacity(m.morph, env_) - m.energy)
               : 0.;
  };
  for (const auto &s : vegetation_.surfaces)
    gaps[benthic::worms] += worm_gap(s);
  for (const auto &c : web.crabs)
    gaps[benthic::crabs] += crab_gap(c);
  for (const auto &m : web.mussels)
    gaps[benthic::mussels] += mussel_gap(m);
  std::array<double, benthic::count> fractions{};
  double demand = 0;
  for (int k = 0; k < benthic::count; ++k) {
    const double amount = std::min(gaps[k], benthic_left[k]);
    demand += amount;
    fractions[k] = gaps[k] > 0 ? amount / gaps[k] : 0;
  }
  std::vector<double> worm_growth(vegetation_.surfaces.size()), crabs(web.crabs.size()),
      mussels(web.mussels.size());
  for (std::size_t i = 0; i < worm_growth.size(); ++i)
    worm_growth[i] = fractions[benthic::worms] * worm_gap(vegetation_.surfaces[i]);
  for (std::size_t i = 0; i < crabs.size(); ++i)
    crabs[i] = fractions[benthic::crabs] * crab_gap(web.crabs[i]);
  for (std::size_t i = 0; i < mussels.size(); ++i)
    mussels[i] = fractions[benthic::mussels] * mussel_gap(web.mussels[i]);
  request_production(demand, [this, worm_growth = std::move(worm_growth), crabs = std::move(crabs),
                              mussels = std::move(mussels), demand](double amount) {
    const double f = amount / demand;
    for (std::size_t i = 0; i < worm_growth.size(); ++i)
      vegetation_.surfaces[i].worms += f * worm_growth[i];
    for (std::size_t i = 0; i < crabs.size(); ++i)
      food_web_.crabs[i].energy += f * crabs[i];
    for (std::size_t i = 0; i < mussels.size(); ++i)
      food_web_.mussels[i].energy += f * mussels[i];
    energy_available -= amount;
    food_web_.introduced += amount;
    feeding_.food_allowance = std::max(0., feeding_.food_allowance - amount);
    return amount;
  });
  std::vector<double> plankton(p.energy.size());
  double plankton_want = 0;
  total = std::accumulate(p.energy.begin(), p.energy.end(), 0.);
  for (std::size_t i = 0; i < p.energy.size(); ++i) {
    const double v = p.energy[i];
    if (v > 0 && p.nursery[i] > 0 && plankton_water_cell(i))
      plankton[i] =
          std::min(std::max(0., maximum - v),
                   env_.plankton_growth * v * std::max(0., 1 - v / maximum) * p.nursery[i]);
  }
  if (supply_due && total < env_.plankton_seed_threshold * limit)
    for (const auto source : p.sources) {
      const auto cells = plankton_source_cells(source);
      double weights = 0;
      for (const auto &[at, w] : cells)
        if (plankton_water_cell(at))
          weights += w;
      if (weights > 0)
        for (const auto &[at, w] : cells)
          if (plankton_water_cell(at))
            plankton[at] = std::min(std::max(0., maximum - p.energy[at]),
                                    plankton[at] + env_.plankton_seed_energy * w / weights);
    }
  plankton_want = std::accumulate(plankton.begin(), plankton.end(), 0.);
  const double plankton_request =
      std::min({plankton_want, production_left, std::max(0., limit - total)});
  request_production(plankton_request,
                     [this, plankton = std::move(plankton), plankton_want](double amount) {
                       for (std::size_t i = 0; i < plankton.size(); ++i)
                         food_web_.plankton.energy[i] += amount / plankton_want * plankton[i];
                       food_web_.plankton.nonempty |= amount > 0;
                       energy_available -= amount;
                       food_web_.introduced += amount;
                       feeding_.food_allowance = std::max(0., feeding_.food_allowance - amount);
                       return amount;
                     });

  for (auto &s : vegetation_.surfaces)
    s.mussel_arc = 0;
  for (const auto &m : web.mussels) {
    auto i = ids.find(m.patch);
    if (i != ids.end())
      vegetation_.surfaces[i->second].mussel_arc +=
          mussel_algae_share * PI * mussel_radius(m.energy, env_, m.morph);
  }
  for (auto &s : vegetation_.surfaces)
    release_excess_algae(s);
}
}
