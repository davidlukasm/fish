#include "environment.hh"
#include "body.hh"
#include <map>
#include <queue>
#include <numeric>
#include <limits>
namespace fishsim {
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
  // Planning and motion use the identical arch, including turns across a pot rim.
  auto crossing_point = [&](Point from, Point to, double from_angle, double to_angle, double radius,
                            double t) {
    const double blend = t * t * (3 - 2 * t),
                 distance = std::hypot(delta_x(to.x - from.x), to.y - from.y),
                 angle = from_angle + blend * std::remainder(to_angle - from_angle, 2 * PI),
                 arc = (.6 * radius + .5 * distance) * std::sin(PI * t);
    return Point{wrap_x(from.x + blend * delta_x(to.x - from.x) + arc * std::sin(angle)),
                 from.y + blend * (to.y - from.y) - arc * std::cos(angle)};
  };
  // Empty valves carry no nutrition. Their bounded visual state drifts and settles independently.
  for (auto &shell : web.shells) {
    ++shell.age;
    if (rests_on_sediment({shell.x, shell.y}, std::max(.2, shell.radius * .3)))
      continue;
    const auto water = water_.velocity(shell.x, shell.y);
    Body shape{};
    shape.x = wrap_x(shell.x + water.x * .3);
    shape.y = shell.y + water.y * .3 + (gravity > 0 ? .9 : 0);
    collide(shape, shell.x, shell.y, std::max(.2, shell.radius * .3));
    const double moved = std::hypot(delta_x(shape.x - shell.x), shape.y - shell.y);
    shell.angle += moved * .025;
    shell.x = shape.x;
    shell.y = shape.y;
  }
  web.shells.erase(std::remove_if(web.shells.begin(), web.shells.end(),
                                  [](const auto &s) { return s.age >= 1600; }),
                   web.shells.end());
  auto &p = web.plankton;
  const bool supply_due = time == 1 || time % std::uint64_t(env_.plankton_seed_period) == 0;
  prepare_plankton_sources();
  double production_left = plankton_supply();
  std::array<double, 3> benthic_left{};
  const auto stores = small_animal_stores();
  double missing = 0;
  for (int k = 0; k < 3; ++k) {
    const double limit = niche_limit(k + 7);
    benthic_left[k] = limit > 0 ? std::clamp(1 - stores[k + 1] / limit, 0., 1.) : 0;
    missing += benthic_left[k];
  }
  for (int k = 0; k < 3; ++k)
    benthic_left[k] = missing > 0 ? std::min(benthic_supply() * benthic_left[k] / missing,
                                             std::max(0., niche_limit(k + 7) - stores[k + 1]))
                                  : 0;
  const int nx = p.columns, ny = p.rows;
  const double dx = p.width / nx, dy = p.height / ny, cell_area = dx * dy,
               maximum = env_.plankton_max_density * cell_area;
  const auto neighbor = [&](int at, int d) {
    const int x = at % nx, y = at / nx;
    return d == 0   ? y * nx + (x + nx - 1) % nx
           : d == 1 ? y * nx + (x + 1) % nx
           : d == 2 ? at - nx
                    : at + nx;
  };
  auto startup_import = [&](double amount) {
    const double accepted = std::max(0., std::min(amount, energy_available));
    energy_available -= accepted;
    feeding_.food_allowance = std::max(0., feeding_.food_allowance - accepted);
    web.introduced += accepted;
    web.initial += accepted;
    return accepted;
  };
  // External settlement is a whole animal. Sample its occurrence from the group's
  // remaining allocation, then submit it to the same shared headroom allocation.
  auto reserve_birth = [&](int kind, double energy) {
    const double share = std::min(energy, benthic_left[kind]);
    benthic_left[kind] -= share;
    return rng.uniform() < share / energy;
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
    const int horizontal = water.x >= 0 ? 1 : 0, vertical = water.y >= 0 ? 3 : 2;
    const int h = p.links[at] & (1 << horizontal) ? neighbor(at, horizontal) : at;
    const int v = p.links[at] & (1 << vertical) ? neighbor(at, vertical) : at;
    const int diagonal =
        h != at && v != at && (p.links[h] & (1 << vertical)) && (p.links[v] & (1 << horizontal))
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
    for (int d = 0; d < 4; ++d)
      if (p.links[at] & (1 << d)) {
        const int n = neighbor(at, d);
        const double density =
                         (p.energy[n] - p.energy[at]) / std::max(1e-9, p.energy[n] + p.energy[at]),
                     calmer = (p.strain[at] - p.strain[n]) / (1e-8 + p.strain[at] + p.strain[n]),
                     score = density + .3 * calmer;
        if (p.energy[n] < maximum && score > best) {
          best = score;
          target = n;
        }
      }
    if (target != at) {
      // Weak density gradients keep broad swarms broad; isolated fringes move
      // more strongly towards company. This transfer conserves their energy.
      const double contrast = std::clamp(best, 0., 1.);
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
    for (int d = 0; d < 4; ++d)
      if (p.links[at] & (1 << d)) {
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
  // Crowding moves biomass into connected water cells. A bounded number of
  // local passes lets congestion relax over successive steps without mass loss.
  for (int pass = 0; pass < 4; ++pass) {
    bool moved = false;
    p.scratch = p.energy;
    for (int at = 0; at < nx * ny; ++at) {
      const double excess = p.energy[at] - maximum;
      if (excess <= 1e-12)
        continue;
      std::array<double, 4> room{};
      double space = 0;
      for (int d = 0; d < 4; ++d)
        if (p.links[at] & (1 << d)) {
          room[d] = std::max(0., maximum - p.scratch[neighbor(at, d)]);
          space += room[d];
        }
      if (space <= 0)
        continue;
      const double transfer = std::min(excess, space);
      for (int d = 0; d < 4; ++d)
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
  // Transfers from any suspended food remain internal, including carrion and plant scraps.
  for (std::size_t i = 0; i < feeding_.pieces.size(); ++i) {
    auto &food = feeding_.pieces[i];
    const double amount = feed_plankton(food.x, food.y, food.energy, food_radius(food));
    if (amount > 0) {
      bite_food(i, amount);
      total += amount;
      if (food.origin == 0)
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
  const double base_mortality = -std::expm1(-std::log(2.) * (1 / env_.microfauna_lifespan));
  // Density above the local carrying capacity increases mortality. Energy settles below.
  for (int at = 0; at < nx * ny; ++at) {
    const double v = p.energy[at];
    if (v <= 0)
      continue;
    const double pressure = maximum > 0 ? std::max(0., v / maximum - 1) : 1;
    const double lost =
        v * (pressure > 0
                 ? -std::expm1(-std::log(2.) * (1 / env_.microfauna_lifespan + pressure / 60))
                 : base_mortality);
    p.energy[at] -= lost;
    total -= lost;
    deposit_feces((at % nx + .5) * dx, (at / nx + .5) * dy, lost);
  }
  p.nonempty = total > 0;
  std::map<std::uint64_t, std::size_t> ids;
  for (std::size_t i = 0; i < vegetation_.surfaces.size(); ++i)
    ids.emplace(vegetation_.surfaces[i].id, i);
  std::vector<double> worms(vegetation_.surfaces.size()), exposed_worms(worms.size());
  for (const auto &h : web.heads) {
    const auto i = ids.find(h.patch);
    if (i != ids.end())
      exposed_worms[i->second] += h.energy;
  }
  auto worm_pieces = [&](const SurfacePatch &soil, double amount) {
    const auto point = patch_position(soil, .5, worm_head_radius);
    while (amount > 1e-12) {
      const double energy = std::min(amount, env_.worm_head_energy);
      Food f{wrap_x(point.x), point.y, 0, 0, 0, energy};
      f.origin = 7;
      f.radius = food_radius(energy);
      f.initial_energy = energy;
      f.color = {.85, .15, .12};
      append_fragment(f);
      amount -= energy;
    }
  };
  const double decay = -std::expm1(-std::log(2.) / env_.decay_half_life);
  for (std::size_t i = 0; i < vegetation_.surfaces.size(); ++i) {
    auto &s = vegetation_.surfaces[i];
    if (s.normal.y > -.5 || sediment_depth(s) < env_.burrow_depth) {
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
        -std::expm1(-std::log(2.) / (env_.microfauna_lifespan * (.8 + .4 * grass_traits(s)[1])));
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
      const auto midpoint = patch_position(s, .5, 0);
      const auto colony = std::uint64_t(std::max(0., std::floor(midpoint.x / 80))) +
                          7 * std::uint64_t(std::max(0., std::floor(midpoint.y / 80))) +
                          13 * s.owner;
      h.morph = double(colony % 4) + rng.uniform() * .999;
      h.duration = std::uint64_t(rng.uniform(
          env_.worm_head_time, std::max(env_.worm_head_time, env_.worm_head_time_max) + 1));
      h.along = rng.uniform();
      const auto edges = sediment_edges(i);
      const double depth = edges[0] + h.along * (edges[1] - edges[0]);
      if (!bed_site_clear(s, h.along, depth * (1 - (.2 + .6 * (h.id * 37 % 101) / 100.)), 10))
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
    h.filter_rate *= .92;
    h.withdrawing |= h.age >= h.duration || soil == ids.end() ||
                     sediment_depth(vegetation_.surfaces[soil->second]) < env_.burrow_depth;
    h.withdrawing |= danger_near(h.x, h.y, env_.worm_retreat_radius, env_.worm_retreat_body,
                                 env_.prey_alert_speed) != nullptr;
    const double individuality = (h.id * 37 % 101) / 100.;
    h.extension = std::clamp(h.extension + (h.withdrawing ? -1. / (16 + 12 * individuality)
                                                          : 1. / (12 + 8 * individuality)),
                             0., 1.);
    if (soil != ids.end()) {
      const auto &s = vegetation_.surfaces[soil->second];
      const auto edges = sediment_edges(soil->second);
      const double cover = edges[0] + h.along * (edges[1] - edges[0]);
      h.withdrawing |= cover < env_.burrow_depth;
      const double burial = cover * (.2 + .6 * individuality);
      const Point surface{s.a.x + h.along * (s.b.x - s.a.x) + s.normal.x * cover,
                          s.a.y + h.along * (s.b.y - s.a.y) + s.normal.y * cover};
      const Point base{surface.x - s.normal.x * burial, surface.y - s.normal.y * burial};
      if (h.age == 1) {
        h.base_x = wrap_x(base.x);
        h.base_y = base.y;
      } else {
        h.base_x = wrap_x(h.base_x + std::clamp(delta_x(base.x - h.base_x), -.25, .25));
        h.base_y += std::clamp(base.y - h.base_y, -.25, .25);
      }
      const double extension = h.extension * h.extension * (3 - 2 * h.extension),
                   length = worm_length(h.id, h.morph) * extension *
                            std::clamp((cover - env_.burrow_depth) / 8., 0., 1.);
      const auto flow = water_.velocity(h.base_x, h.base_y);
      const double sway =
          (.025 + .035 * individuality) * length *
              std::sin((.025 + .025 * individuality) * time + h.id * 2.4) +
          std::clamp(flow.x * s.normal.y - flow.y * s.normal.x, -1., 1.) * length * .12;
      const double vertical_burial = burial / std::max(.5, -s.normal.y), dx = sway, dy = -length,
                   reach = std::hypot(dx, dy),
                   allowed = reach > 0
                                 ? std::clamp((ray(h.base_x, h.base_y - vertical_burial, dx / reach,
                                                   dy / reach, worm_head_radius, reach) -
                                               .01) /
                                                  reach,
                                              0., 1.)
                                 : 0;
      h.x = wrap_x(h.base_x + allowed * dx);
      h.y = h.base_y - extension * vertical_burial + allowed * dy;
      h.ground = std::clamp(1 - 2 * vertical_burial /
                                    std::max(.001, extension * vertical_burial + allowed * length),
                            -1., 1.);
      if (!h.withdrawing && h.extension > .5) {
        auto &bed = vegetation_.surfaces[soil->second];
        const double room =
            std::max(0., env_.worm_max * bed.length - bed.worms - exposed_worms[soil->second]);
        const double taken =
            filter_plankton(h.x, h.y, 4 + 2 * individuality, env_.mussel_filter_rate,
                            std::min(room, env_.worm_head_energy / env_.worm_head_time));
        bed.worms += taken;
        h.filter_rate += .08 * taken;
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
    if (s.normal.y <= -.5 && sediment_depth(s) >= env_.burrow_depth)
      sediment_length += s.length;
  const auto crab_limit = std::size_t(sediment_length / env_.crab_spacing);
  // Nearest bed with sediment (other than the crab's own patch when `leave`), reached by a
  // jump in an arc; `clear` demands a free arc, otherwise any bed will do as a last resort.
  auto nearest_bed = [&](Crab &c, std::size_t from, bool leave, bool clear, double &nearest) {
    std::size_t target = from;
    nearest = std::numeric_limits<double>::infinity();
    for (double reach = env_.crab_search_radius;
         reach < 2 * std::hypot(geometry_.width, geometry_.height) && !std::isfinite(nearest);
         reach *= 2) {
      vegetation_.surface_grid.nearby(c.x, c.y, reach, [&](std::uint32_t j) {
        const auto &s = vegetation_.surfaces[j];
        if (s.normal.y > -.35 || sediment_depth(s) < env_.burrow_depth || (leave && j == from))
          return;
        Crab probe = c;
        probe.along = .5;
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
        const int samples = std::max(12, int(std::ceil(distance / std::max(2., radius * .5))));
        for (int k = 1; clear && k <= samples; ++k) {
          const auto point =
              crossing_point({c.x, c.y}, landing, angle, end_angle, radius, double(k) / samples);
          const double dx = delta_x(point.x - previous.x), dy = point.y - previous.y,
                       length = std::hypot(dx, dy);
          if (!free(point.x, point.y, .15 * radius) ||
              (length > 1e-9 && !clear_line(previous.x, previous.y, point.x, point.y) &&
               ray(previous.x, previous.y, dx / length, dy / length, .15 * radius, length) <
                   length - 1e-6))
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
    bool hungry = !danger && c.energy < .9 * crab_capacity(c.morph, env_);
    if (hungry) {
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
        if (food.origin > 0 && food.origin <= 5 && food.energy > 0 && d < nearest_meal) {
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
      const auto q = patch_position(s, .5, 0);
      if (s.normal.y <= -.35 && i != start->second &&
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
          // Wandering always heads for a bed it can dig into.
          const double weight = s.detritus + .2;
          sum += weight;
          if (rng.uniform() * sum < weight)
            target = i;
        }
      }
      for (auto j : web.neighbors[i]) {
        const auto r = patch_position(vegetation_.surfaces[j], .5, 0);
        if (previous[j] < 0 && vegetation_.surfaces[j].normal.y <= .35 &&
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
        c.along = .5;
      }
    }
    c.target = vegetation_.surfaces[target].id;
    const auto &goal = vegetation_.surfaces[target];
    const double gx = goal.b.x - goal.a.x, gy = goal.b.y - goal.a.y;
    c.destination = has_meal
                        ? std::clamp((delta_x(meal.x - goal.a.x) * gx + (meal.y - goal.a.y) * gy) /
                                         std::max(1e-9, gx * gx + gy * gy),
                                     .04, .96)
                        : rng.uniform(.08, .92);
    if (!has_meal && std::abs(c.destination - c.along) < .15)
      c.destination = c.along < .5 ? .92 : .08;
    for (auto i = target; c.crossing <= 0 && i != start->second; i = std::size_t(previous[i]))
      c.path.push_back(vegetation_.surfaces[i].id);
    std::reverse(c.path.begin(), c.path.end());
    if (c.state != 1)
      c.exposed_age = 0;
    const bool frightened = danger || (c.state == 3 && c.age < c.next_move);
    const auto deadline = c.next_move;
    c.state = frightened ? 3 : 1;
    c.next_move =
        frightened ? std::max(deadline, c.age + std::uint64_t(danger ? 360 : 0))
                   : c.age + std::uint64_t(2 * rng.uniform(env_.crab_move_interval,
                                                           std::max(env_.crab_move_interval,
                                                                    env_.crab_move_interval_max)));
    return true;
  };
  // A crab that cannot get anywhere on foot swims (jumps in an arc) to another sediment bed.
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
    c.along = .5;
    c.destination = rng.uniform(.2, .8);
    c.state = 1;
    c.digging = 0;
    c.next_move = c.age + 60;
  };
  std::vector<Crab> newborn;
  auto birth_crab = [&](std::size_t i, bool external = false) {
    if (web.crabs.size() + newborn.size() >= crab_limit)
      return;
    auto &source = vegetation_.surfaces[i];
    if ((external ? energy_available : source.detritus) < env_.crab_birth_energy ||
        (external && time != 1 && benthic_left[1] <= 0))
      return;
    const double separation = env_.crab_spacing * rng.uniform(.25, .6);
    std::size_t destination = i;
    double along = .5;
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
      if (target.normal.y > -.35)
        continue;
      along = rng.uniform(.1, .9);
      const auto edges = sediment_edges(j);
      const double depth = edges[0] + along * (edges[1] - edges[0]);
      if (!bed_site_clear(target, along, std::max(.5, depth * .5), 10))
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
    if (!placed || (external && time != 1 && !reserve_birth(1, env_.crab_birth_energy)))
      return;
    auto &s = vegetation_.surfaces[destination];
    Crab c;
    c.id = web.next_id++;
    c.exposure = 0;
    c.stride = rng.uniform(0, 2 * PI);
    c.depth = rng.uniform(.2, .8);
    c.morph = double(rng.index(4)) + rng.uniform() * .999;
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
      request_production(c.energy, [this, c](double grant) {
        if (grant + 1e-9 < c.energy)
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
    if (c.state == 1 || c.state == 3) {
      const double target =
          .2 + .6 * (.5 + .5 * std::sin(c.id * 1.73 +
                                        c.age / (170. + 90 * (c.morph - std::floor(c.morph)))));
      c.depth += std::clamp(target - c.depth, -.0015, .0015);
    }
    const auto found = ids.find(c.patch);
    if (++c.age >= env_.crab_lifespan * (.8 + .4 * (c.morph - std::floor(c.morph))) ||
        found == ids.end()) {
      deposit_detritus(c.x, c.y, c.energy);
      c.energy = 0;
      continue;
    }
    auto &s = vegetation_.surfaces[found->second];
    const double old_x = c.x, old_y = c.y, capacity = crab_capacity(c.morph, env_);
    const double intake =
        c.crossing > 0 ? 0
                       : std::min({capacity - c.energy, capacity / env_.crab_mature, s.detritus});
    c.energy += intake;
    s.detritus -= intake;
    if (intake > 0)
      c.feeding = {intake, c.x, c.y, 10, 18};
    if (c.state && c.exposure > .5 && c.energy < capacity) {
      feeding_.grid.nearby(
          c.x, c.y, crab_radius(c.energy, env_, c.morph) + feeding_.indexed_food_radius,
          [&](std::uint32_t j) {
            if (j >= feeding_.pieces.size())
              return;
            auto &food = feeding_.pieces[j];
            if (food.energy <= 0 ||
                (food.origin != 1 && food.origin != 2 && food.origin != 3 && food.origin != 5))
              return;
            if (std::hypot(delta_x(food.x - c.x), food.y - c.y) >
                food_radius(food) + crab_radius(c.energy, env_, c.morph))
              return;
            const double amount =
                std::min({food.energy, capacity - c.energy, capacity / env_.crab_mature});
            food.energy -= amount;
            c.energy += amount;
            if (amount > 0)
              c.feeding = {amount, food.x, food.y, food.origin, 18};
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
                         crumbs = std::min(std::max(0., o.energy - amount), amount * .5);
            o.energy -= amount + crumbs;
            plant.grass = std::max(0., plant.grass - amount - crumbs);
            c.energy += amount;
            room -= amount;
            if (amount > 0)
              c.feeding = {amount, part.x, part.y, 5, 22};
            if (crumbs > 0) {
              Food crumb{wrap_x(part.x), part.y, 0, 0, 0, crumbs};
              crumb.origin = 5;
              crumb.initial_energy = crumbs;
              crumb.hardness = plant_bite_hardness(o.kind, grass_traits(plant)[0], env_, 0);
              crumb.blunt = o.kind <= 1;
              crumb.radius = food_radius(crumbs);
              crumb.buoyancy = .2;
              crumb.color = {.30, .43, .16};
              append_fragment(crumb);
            }
            if (o.energy > 0 && o.length > 2) {
              // Shorten the remaining blade with the same cubic split used by feeding.
              const double t =
                  std::clamp(o.energy / std::max(.001, o.energy + amount + crumbs), 0., 1.);
              auto curve = o.curve;
              for (int level = 3; level > 0; --level) {
                for (int k = 0; k < level; ++k)
                  curve[k] = {curve[k].x + t * (curve[k + 1].x - curve[k].x),
                              curve[k].y + t * (curve[k + 1].y - curve[k].y)};
                o.curve[4 - level] = curve[0];
              }
              o.length *= t;
            }
          });
    }
    if (c.energy >= capacity - 1e-9 && c.age % std::uint64_t(env_.crab_mature) == 0 &&
        s.detritus >= 2 * env_.crab_leave * s.length)
      birth_crab(found->second);
    const auto *danger =
        danger_near(c.x, c.y, env_.worm_retreat_radius, env_.worm_retreat_body, -1);
    const auto bed_edges = sediment_edges(found->second);
    const double local_depth = bed_edges[0] + c.along * (bed_edges[1] - bed_edges[0]);
    const bool can_burrow =
        local_depth >= std::max(env_.burrow_depth, 1.2 * crab_radius(c.energy, env_, c.morph));
    if (!can_burrow && (c.state == 0 || c.state == 2)) {
      c.digging = 0;
      c.exposure = std::max(
          c.exposure,
          std::clamp(1 - local_depth / std::max(.1, 1.2 * crab_radius(c.energy, env_, c.morph)), 0.,
                     1.));
      plan_walk(c, danger);
    }
    if (danger && c.state == 2) {
      c.digging = 0;
      plan_walk(c, danger);
    }
    // The goal must still hold sediment; beds can be eaten away or washed off.
    if (c.state == 1 && c.crossing <= 0 && c.age % 50 == 0) {
      const auto goal = ids.find(c.target);
      if (goal == ids.end() ||
          sediment_depth(vegetation_.surfaces[goal->second]) < env_.burrow_depth) {
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
                   speed = std::max(.05, (c.state == 3 ? env_.crab_flee_speed : env_.crab_speed) *
                                             crab_pace(c.id, c.morph)),
                   height = .6 * radius + .5 * distance;
      c.crossing =
          std::max(0., c.crossing - speed / std::max(12 * speed, 2 * distance + 4 * height));
      const auto point =
          crossing_point({c.crossing_x, c.crossing_y}, landing, c.crossing_angle,
                         std::atan2(s.normal.x, -s.normal.y), radius, 1 - c.crossing);
      c.x = point.x;
      c.y = point.y;
    } else if (c.state == 0) {
      const auto q = crab_position(c, s);
      c.x = wrap_x(q.x);
      c.y = q.y;
      if (c.age >= c.next_move || !can_burrow) {
        const double radius = crab_radius(c.energy, env_, c.morph);
        const bool blocked =
            std::any_of(web.crabs.begin(), web.crabs.end(), [&](const Crab &other) {
              return other.id != c.id && other.energy > 0 && other.exposure > .5 &&
                     std::hypot(delta_x(other.x - c.x), other.y - c.y) <
                         1.1 * (radius + crab_radius(other.energy, env_, other.morph));
            });
        if (blocked)
          c.next_move = c.age + 30 + c.id % 70;
        else
          plan_walk(c, danger);
      }
    } else if (c.exposure < .99 && c.state != 2) {
      const auto q = crab_position(c, s);
      c.x = wrap_x(q.x);
      c.y = q.y;
    } else {
      const double away = danger ? delta_x(c.x - danger->x) : 0;
      if (danger && c.state != 2 && (c.state != 3 || away * c.direction < 0))
        plan_walk(c, danger);
      else if (!danger && c.state == 1 && c.age >= c.next_move) {
        if (can_burrow) {
          c.state = 2;
          c.digging = 0;
        } else
          plan_walk(c);
      }
      const double speed = (c.state == 3 ? env_.crab_flee_speed : env_.crab_speed) *
                           crab_pace(c.id, c.morph) * (.75 + .25 * std::sin(c.age * .025 + c.id));
      ++c.exposed_age;
      if (c.state == 2 && !can_burrow) {
        c.digging = 0;
        plan_walk(c, danger);
      }
      if (c.state == 2) {
        if (++c.digging >= env_.crab_burrow_time) {
          c.state = 0;
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
          if (c.state == 3 && !danger && c.age >= c.next_move && can_burrow) {
            c.state = 2;
            c.digging = 0;
          } else {
            const auto deadline = c.next_move;
            plan_walk(c);
            c.next_move = deadline;
          }
        } else if (c.age % 100 == 0)
          plan_walk(c);
      } else {
        const auto next = ids.find(c.path.front());
        if (next == ids.end()) {
          plan_walk(c);
          continue;
        }
        const auto &target = vegetation_.surfaces[next->second];
        int leave = 0, enter = 0;
        double nearest = 1e30;
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
        if (nearest > env_.crab_edge_gap + 1e-9) {
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
          if (std::abs(std::remainder(next_angle - angle, 2 * PI)) > .52) {
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
    if (c.state && !crossing && c.exposure > .5) {
      const double radius = crab_radius(c.energy, env_, c.morph);
      for (const auto &other : web.crabs) {
        if (other.id == c.id || other.energy <= 0 || other.exposure < .5)
          continue;
        const double separation = 1.1 * (radius + crab_radius(other.energy, env_, other.morph));
        const double before = std::hypot(delta_x(old_x - other.x), old_y - other.y),
                     after = std::hypot(delta_x(c.x - other.x), c.y - other.y);
        if (after < separation && after < before) {
          c.x = old_x;
          c.y = old_y;
          const double sx = s.b.x - s.a.x, sy = s.b.y - s.a.y;
          c.along = std::clamp((delta_x(old_x - s.a.x) * sx + (old_y - s.a.y) * sy) /
                                   std::max(1e-9, sx * sx + sy * sy),
                               .02, .98);
          if (can_burrow && !danger && c.state != 3) {
            c.state = 2;
            c.digging = 0;
          } else {
            // Turn away from the other crab (the patch may run either way).
            Crab probe = c;
            probe.along = std::min(.98, c.along + .05);
            const auto ahead = crab_position(probe, s);
            probe.along = std::max(.02, c.along - .05);
            const auto behind = crab_position(probe, s);
            c.path.clear();
            c.destination = std::hypot(delta_x(ahead.x - other.x), ahead.y - other.y) >=
                                    std::hypot(delta_x(behind.x - other.x), behind.y - other.y)
                                ? .92
                                : .08;
          }
          break;
        }
      }
    }
    const double exposed = c.state == 0 || c.state == 2 ? 0 : 1;
    c.exposure =
        std::clamp(c.exposure + std::clamp(exposed - c.exposure,
                                           -1. / std::max(36., env_.crab_burrow_time), 1. / 36.),
                   0., 1.);
    const double dx = delta_x(c.x - old_x), dy = c.y - old_y;
    if (!crossing && std::abs(dx) > 1e-6)
      c.direction = dx > 0 ? 1 : -1;
    const double distance = std::hypot(dx, dy),
                 step = std::max(.2, (c.state == 3 ? env_.crab_flee_speed : env_.crab_speed) *
                                         crab_pace(c.id, c.morph));
    if (!crossing && distance > step) {
      c.x = wrap_x(old_x + dx * step / distance);
      c.y = old_y + dy * step / distance;
    }
    const double travelled = std::hypot(delta_x(c.x - old_x), c.y - old_y);
    if (c.state == 1 || c.state == 3)
      c.stride += travelled * 3 / std::max(1., crab_radius(c.energy, env_, c.morph));
    // Never stand frozen in the open: after a while without progress swim elsewhere.
    if ((c.state == 1 || c.state == 3) && !crossing && c.crossing <= 0 && c.exposure > .5 &&
        c.feeding.remaining <= 0 && travelled < .02) {
      if (++c.stalled >= 90) {
        c.stalled = 0;
        escape(c);
      }
    } else
      c.stalled = 0;
  }
  if (time == 1 || time % std::uint64_t(env_.crab_mature) == 0) {
    const auto settlers =
        std::min(crab_limit,
                 std::size_t(std::max(1., std::ceil(sediment_length / (3 * env_.crab_spacing)))));
    for (std::size_t n = web.crabs.size() + newborn.size(); n < settlers; ++n) {
      std::size_t best = vegetation_.surfaces.size();
      double food = -1;
      for (std::size_t i = 0; i < vegetation_.surfaces.size(); ++i) {
        const auto &s = vegetation_.surfaces[i];
        if (s.normal.y > -.5 || sediment_depth(s) < env_.burrow_depth ||
            energy_available < env_.crab_birth_energy || (time != 1 && benthic_left[1] <= 0))
          continue;
        const auto site = patch_position(s, .5, 0);
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
  for (const auto &m : web.mussels)
    if (m.energy > 0) {
      const auto found = ids.find(m.patch);
      if (found == ids.end())
        continue;
      const auto &s = vegetation_.surfaces[found->second];
      const Point anchor{s.a.x + m.along * (s.b.x - s.a.x), s.a.y + m.along * (s.b.y - s.a.y)};
      mussel_sites.add(anchor.x, anchor.y, locations.size());
      locations.push_back(anchor);
    }
  std::vector<Mussel> young;
  auto settle = [&](std::size_t i, double &funds, bool external, const Mussel *parent = nullptr) {
    auto &s = vegetation_.surfaces[i];
    const auto edges = sediment_edges(i);
    if (edges[0] > 1e-9 || edges[1] > 1e-9 || s.algae_open[1] <= s.algae_open[0] ||
        funds < env_.mussel_birth_energy)
      return false;
    for (int trial = 0; trial < 4; ++trial) {
      const double family = parent ? std::floor(parent->morph) : double(rng.index(4)),
                   morph = family + rng.uniform() * .999,
                   along = parent && parent->patch == s.id
                               // Larvae settle beside the parent, not on top of it.
                               ? std::clamp(parent->along + (rng.uniform() < .5 ? -1. : 1.) *
                                                                rng.uniform(.4, 1.) *
                                                                env_.mussel_spawn_radius / s.length,
                                            s.algae_open[0], s.algae_open[1])
                               : rng.uniform(s.algae_open[0], s.algae_open[1]);
      bool free = true;
      const auto point = patch_position(s, along, 0);
      if (parent &&
          std::hypot(delta_x(point.x - parent->x), point.y - parent->y) > env_.mussel_spawn_radius)
        continue;
      // Room for the grown shell, so a bed spreads along the rock instead of piling up.
      const double spacing = std::max(
          env_.mussel_spacing * (.45 + .8 * rng.uniform()) * mussel_size(morph),
          (1.5 + .6 * rng.uniform()) * mussel_radius(mussel_capacity(morph, env_), env_, morph));
      mussel_sites.nearby(point.x, point.y, spacing, [&](std::uint32_t j) {
        if (std::hypot(delta_x(point.x - locations[j].x), point.y - locations[j].y) < spacing)
          free = false;
      });
      if (!free)
        continue;
      if (external && (energy_available < env_.mussel_birth_energy ||
                       (time != 1 && !reserve_birth(2, env_.mussel_birth_energy))))
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
      const double lift = .62 * mussel_radius(m.energy, env_, m.morph);
      const Point q{s.a.x + along * (s.b.x - s.a.x) + s.normal.x * lift,
                    s.a.y + along * (s.b.y - s.a.y) + s.normal.y * lift};
      m.x = wrap_x(q.x);
      m.y = q.y;
      if (external && time != 1) {
        request_production(m.energy, [this, m](double grant) {
          if (grant + 1e-9 < m.energy)
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
      return true;
    }
    return false;
  };
  for (auto &m : web.mussels) {
    m.filter_rate *= .96;
    if (m.energy <= 0)
      continue;
    const auto found = ids.find(m.patch);
    if (++m.age >= env_.mussel_lifespan * (.8 + .4 * (m.morph - std::floor(m.morph))) ||
        found == ids.end()) {
      web.released += m.energy;
      m.energy = 0;
      continue;
    }
    auto &s = vegetation_.surfaces[found->second];
    const double radius = mussel_radius(m.energy, env_, m.morph);
    // The byssus remains attached to the hard support, even if sand arrives.
    m.x = wrap_x(s.a.x + m.along * (s.b.x - s.a.x) + s.normal.x * .62 * radius);
    m.y = s.a.y + m.along * (s.b.y - s.a.y) + s.normal.y * .62 * radius;
    const double capacity = mussel_capacity(m.morph, env_);
    if (sediment_cover(m.x, m.y) > 0 || sediment_depth(s) > radius) {
      if (++m.buried >= env_.mussel_burial_death) {
        s.detritus += m.energy;
        m.energy = 0;
      }
      continue;
    }
    m.buried = 0;
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
    m.filter_rate += .04 * filtered;
    if (m.energy >= env_.mussel_spawn_filling * capacity &&
        m.age % std::uint64_t(env_.mussel_spawn) == 0) {
      const int brood = 1 + rng.index(4);
      int born = 0;
      vegetation_.surface_grid.nearby(m.x, m.y, env_.mussel_spawn_radius, [&](std::uint32_t i) {
        for (int trial = 0; trial < 6 && born < brood; ++trial)
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
    const auto settlers = std::size_t(std::ceil(bare / 80));
    for (std::size_t attempt = 0;
         attempt < settlers && web.mussels.size() + young.size() < settlers; ++attempt) {
      double funds = env_.mussel_birth_energy;
      bool placed = false;
      for (int trial = 0; trial < 24 && !placed; ++trial) {
        std::size_t best = rng.index(vegetation_.surfaces.size());
        double richest = -1;
        for (int candidate = 0; candidate < 8; ++candidate) {
          const auto i = rng.index(vegetation_.surfaces.size());
          const auto &surface = vegetation_.surfaces[i];
          if (sediment_depth(surface) > .01 || surface.algae_open[1] <= surface.algae_open[0])
            continue;
          const auto q = patch_position(surface, .5, 3);
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
      const auto start = young.size(), cluster = std::size_t(1 + rng.index(6));
      vegetation_.surface_grid.nearby(
          anchor.x, anchor.y, env_.mussel_spawn_radius, [&](std::uint32_t i) {
            for (int trial = 0; trial < 3 && young.size() < start + cluster &&
                                web.mussels.size() + young.size() < settlers;
                 ++trial)
              settle(i, funds, true, &anchor);
          });
    }
  }
  for (const auto &m : young)
    if (m.energy > 0)
      web.mussels.push_back(m);
  // Allocate each group's remaining regular supply over its eligible capacity gaps.
  // Feeding, reproduction and migration above only transfer already existing energy.
  std::array<double, 3> gaps{};
  auto worm_gap = [&](const SurfacePatch &s) {
    if (s.normal.y > -.5 || sediment_depth(s) < env_.burrow_depth)
      return 0.;
    const auto i = std::size_t(&s - vegetation_.surfaces.data());
    return std::max(0., env_.worm_max * s.length - s.worms - exposed_worms[i]);
  };
  auto crab_gap = [&](const Crab &c) {
    return c.energy > 0 ? std::max(0., crab_capacity(c.morph, env_) - c.energy) : 0.;
  };
  auto mussel_gap = [&](const Mussel &m) {
    return m.energy > 0 && !m.buried ? std::max(0., mussel_capacity(m.morph, env_) - m.energy) : 0.;
  };
  for (const auto &s : vegetation_.surfaces)
    gaps[0] += worm_gap(s);
  for (const auto &c : web.crabs)
    gaps[1] += crab_gap(c);
  for (const auto &m : web.mussels)
    gaps[2] += mussel_gap(m);
  std::array<double, 3> fractions{};
  double demand = 0;
  for (int k = 0; k < 3; ++k) {
    const double amount = std::min(gaps[k], benthic_left[k]);
    demand += amount;
    fractions[k] = gaps[k] > 0 ? amount / gaps[k] : 0;
  }
  std::vector<double> worm_growth(vegetation_.surfaces.size()), crabs(web.crabs.size()),
      mussels(web.mussels.size());
  for (std::size_t i = 0; i < worm_growth.size(); ++i)
    worm_growth[i] = fractions[0] * worm_gap(vegetation_.surfaces[i]);
  for (std::size_t i = 0; i < crabs.size(); ++i)
    crabs[i] = fractions[1] * crab_gap(web.crabs[i]);
  for (std::size_t i = 0; i < mussels.size(); ++i)
    mussels[i] = fractions[2] * mussel_gap(web.mussels[i]);
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
  // Transport, feeding and mortality are complete. Growth uses the remaining live field.
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
      vegetation_.surfaces[i->second].mussel_arc += PI * mussel_radius(m.energy, env_, m.morph);
  }
  for (auto &s : vegetation_.surfaces)
    release_excess_algae(s);
}
}
