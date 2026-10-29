#include "environment.hh"
#include "parallel.hh"
#include "waterborne.hh"
#include "physiology.hh"
#include <numeric>
#include <map>
#include <queue>
#include <limits>
namespace fishsim {
namespace {
Point center(const SurfacePatch &s) {
  return {(s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2};
}
struct GridSample {
  std::array<std::size_t, 4> index{};
  std::array<double, 4> weight{};
};
GridSample sample(const Field &f, double x, double y) {
  const auto &p = f.food_web().plankton;
  GridSample s;
  if (!p.columns || !p.rows)
    return s;
  const double gx = f.wrap_x(x) / p.width * p.columns - .5,
               gy = std::clamp(y / p.height * p.rows - .5, 0., double(p.rows - 1));
  const int i = int(std::floor(gx)), j = int(gy), a = (i + p.columns) % p.columns,
            b = (a + 1) % p.columns, k = std::min(j + 1, p.rows - 1);
  const double fx = gx - i, fy = gy - j;
  s.index = {std::size_t(j * p.columns + a), std::size_t(j * p.columns + b),
             std::size_t(k * p.columns + a), std::size_t(k * p.columns + b)};
  s.weight = {(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy};
  return s;
}
}
std::array<double, 8> Field::odor_field(double x, double y) const {
  std::array<double, 8> out{};
  const auto &p = food_web_.plankton;
  if (!p.columns || !p.rows)
    return out;
  auto sample = waterborne_sample(*this, x, y);
  if (p.odor.size() == p.energy.size() * 7)
    for (int k = 0; k < 4; ++k)
      if (sample.weight[k] > 0)
        for (int c = 0; c < 7; ++c)
          out[c] += sample.weight[k] * p.odor[sample.index[k] * 7 + c];
  if (has_sperm_)
    for (int k = 0; k < 4; ++k)
      if (sample.index[k] < sperm_field_.size())
        out[7] += sample.weight[k] * sperm_field_[sample.index[k]].density;
  return out;
}
void Field::advance_odor() {
  SedimentReadScope bed(*this);
  auto &p = food_web_.plankton;
  if (!p.columns || !p.rows)
    return;
  if (p.odor.size() != p.energy.size() * 7)
    p.odor.assign(p.energy.size() * 7, 0.f);
  WaterborneTransport transport(*this, env_.odor_mixing);
  const double area = p.width / p.columns * p.height / p.rows;
  auto emit = [&](int channel, double x, double y, double energy) {
    if (energy <= 0 || channel < 0 || channel >= 7)
      return;
    const auto sample = transport.sample(x, y);
    for (int k = 0; k < 4; ++k)
      if (sample.weight[k] > 0)
        p.odor[sample.index[k] * 7 + channel] +=
            float(env_.odor_emission * energy / area * sample.weight[k]);
  };
  for (const auto &q : feeding_.pieces)
    if (q.energy > 0) {
      int channel = q.origin == 0                    ? 0
                    : q.origin == 4                  ? 1
                    : q.origin == 5                  ? 2
                    : q.origin == 2                  ? 6
                    : q.origin == 7 || q.origin == 9 ? 3
                    : q.origin == 6 || q.origin == 8 ? 4
                                                     : 5;
      double fresh = q.origin == 1 || q.origin == 2 || q.origin == 3 || q.origin >= 6
                         ? std::exp2(-q.decay_age / (2 * env_.decay_half_life))
                         : 1;
      emit(channel, q.x, q.y, q.energy * fresh * odor_maturity(q.age, env_));
    }
  for (const auto &q : carrion_odor_)
    emit(5, q.x, q.y, q.energy);
  for (const auto &q : visible_) {
    emit(6, q.x, q.y, q.egg_odor * (q.hatched ? 1 : odor_maturity(q.age, env_)));
    if (q.odor_channel >= 0)
      emit(q.odor_channel, q.x, q.y, q.odor_energy);
  }
  for (const auto &q : vegetation_.plants)
    emit(q.kind == 4 ? 1 : 2, q.x, q.y, q.energy);
  for (const auto &q : vegetation_.surfaces) {
    const double lift = sediment_depth(q) + std::hypot(p.width / p.columns, p.height / p.rows);
    const double x = (q.a.x + q.b.x) / 2 + q.normal.x * lift,
                 y = (q.a.y + q.b.y) / 2 + q.normal.y * lift;
    emit(3, x, y, q.worms * env_.buried_odor);
  }
  if (p.nonempty && env_.odor_emission > 0)
    for (std::size_t at = 0; at < p.energy.size(); ++at)
      if (p.energy[at] > 0 && transport.wet(at))
        p.odor[at * 7 + 4] += float(env_.odor_emission * p.energy[at] / area);
  if (std::none_of(p.odor.begin(), p.odor.end(), [](float v) { return v > 0; }))
    return;
  // The dense field shares one wet mask and one flow sample per cell. Diffusion
  // gathers from neighbours, so every worker owns its destination outright.
  struct TransportCell {
    Point flow;
    double mixing;
    unsigned char wet;
  };
  thread_local std::vector<TransportCell> storage;
  storage.resize(p.energy.size());
  auto &cells = storage;
  const int nx = p.columns;
  const double dx = p.width / p.columns, dy = p.height / p.rows;
  const std::size_t count = p.energy.size();
  const std::size_t tiles =
      std::min<std::size_t>(std::max(1, motion_workers), std::max<std::size_t>(1, count / 1024));
  auto partition = [&](auto operation) {
    parallel(
        tiles, motion_workers,
        [&](std::size_t tile) {
          operation(count * tile / tiles, count * (tile + 1) / tiles, tile);
        },
        65536);
  };
  partition([&](auto first, auto end, auto) {
    for (auto at = first; at < end; ++at) {
      auto &c = cells[at];
      c.wet = plankton_water_cell(at);
      c.flow = c.wet ? water_.velocity((at % nx + .5) * dx, (at / nx + .5) * dy) : Point{};
      c.flow = {c.flow.x * env_.waterborne_drift, c.flow.y * env_.waterborne_drift};
      c.mixing = env_.odor_mixing / area;
    }
  });
  auto neighbor = [&](std::size_t at, int d) {
    const auto x = at % nx;
    return d == 0   ? (x ? at - 1 : at + nx - 1)
           : d == 1 ? (x + 1 < std::size_t(nx) ? at + 1 : at - nx + 1)
           : d == 2 ? at - nx
                    : at + nx;
  };
  auto linked = [&](std::size_t at, int d) {
    return (p.links[at] & (1 << d)) && cells[at].wet && cells[neighbor(at, d)].wet;
  };
  thread_local std::vector<std::vector<float>> planes;
  planes.resize(tiles);
  for (auto &plane : planes)
    plane.assign(p.odor.size(), 0.f);
  auto &buffers = planes;
  auto &moved = p.odor_scratch;
  moved.assign(p.odor.size(), 0.f);
  partition([&](auto first, auto end, auto tile) {
    auto &plane = buffers[tile];
    for (auto at = first; at < end; ++at) {
      if (!cells[at].wet)
        continue;
      bool live = false;
      for (int c = 0; c < 7; ++c)
        live |= p.odor[at * 7 + c] > 0;
      if (!live)
        continue;
      const auto w = cells[at].flow;
      const int hd = w.x >= 0 ? 1 : 0, vd = w.y >= 0 ? 3 : 2;
      const auto h = linked(at, hd) ? neighbor(at, hd) : at,
                 v = linked(at, vd) ? neighbor(at, vd) : at,
                 diagonal =
                     h != at && v != at && linked(h, vd) && linked(v, hd) ? neighbor(h, vd) : at;
      const double fx = h != at ? std::min(1., std::abs(w.x) / dx) : 0,
                   fy = v != at ? std::min(1., std::abs(w.y) / dy) : 0;
      const std::array<std::size_t, 4> targets{at, h, v, diagonal};
      const std::array<double, 4> weights{(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy,
                                          fx * fy};
      for (int j = 0; j < 4; ++j)
        if (weights[j] > 0)
          for (int c = 0; c < 7; ++c)
            plane[targets[j] * 7 + c] += float(weights[j] * p.odor[at * 7 + c]);
    }
  });
  for (const auto &plane : planes)
    for (std::size_t i = 0; i < moved.size(); ++i)
      moved[i] += plane[i];
  auto fade = env_.odor_lifetimes();
  for (auto &v : fade)
    v = std::exp(-1. / v);
  partition([&](auto first, auto end, auto) {
    for (auto at = first; at < end; ++at) {
      std::array<double, 7> value{};
      double retained = 1;
      for (int d = 0; d < 4; ++d)
        if (linked(at, d)) {
          const auto n = neighbor(at, d);
          const double k = std::min(.2, .5 * (cells[at].mixing + cells[n].mixing));
          retained -= k;
          for (int c = 0; c < 7; ++c)
            value[c] += k * moved[n * 7 + c];
        }
      for (int c = 0; c < 7; ++c) {
        const double v = fade[c] * (value[c] + retained * moved[at * 7 + c]);
        p.odor[at * 7 + c] = v >= 1e-9 ? float(v) : 0.f;
      }
    }
  });
}

void Field::prepare_plankton_flow() {
  auto &p = food_web_.plankton;
  const int nx = p.columns, ny = p.rows;
  const double dx = p.width / nx, dy = p.height / ny;
  p.flow.resize(p.energy.size());
  p.strain.assign(p.energy.size(), 0);
  p.sampled.assign(p.energy.size(), 0);
  // Two-cell halo supports both the derivative and the safer neighboring destination.
  for (int at = 0; at < nx * ny; ++at)
    if (p.energy[at] > 1e-9)
      for (int y = std::max(0, at / nx - 2); y <= std::min(ny - 1, at / nx + 2); ++y)
        for (int x = at % nx - 2; x <= at % nx + 2; ++x) {
          const int i = y * nx + (x + nx) % nx;
          if (p.open[i])
            p.sampled[i] = 1;
        }
  for (int at = 0; at < nx * ny; ++at)
    if (p.sampled[at])
      p.flow[at] = water_.velocity((at % nx + .5) * dx, (at / nx + .5) * dy);
  // Scatter each fish's existing disturbance model locally; no per-particle queries.
  for (const auto &f : visible_) {
    if (f.kind != 1 || f.hidden || !f.hatched || std::hypot(f.flow_x, f.flow_y) < .02)
      continue;
    const double reach = std::min(80., 8 + 6 * f.radius);
    for (int y = std::max(0, int((f.y - reach) / dy));
         y <= std::min(ny - 1, int((f.y + reach) / dy)); ++y)
      for (int x = int(std::floor((f.x - reach) / dx)); x <= int((f.x + reach) / dx); ++x) {
        const int at = y * nx + (x % nx + nx) % nx;
        if (!p.sampled[at])
          continue;
        const auto v = fish_disturbance(f, {(x + .5) * dx, (y + .5) * dy});
        p.flow[at].x += v.x;
        p.flow[at].y += v.y;
      }
  }
  for (int at = 0; at < nx * ny; ++at) {
    if (!p.sampled[at])
      continue;
    const auto link = p.links[at];
    const int x = at % nx, y = at / nx, l = link & 1 ? y * nx + (x + nx - 1) % nx : at,
              r = link & 2 ? y * nx + (x + 1) % nx : at, u = link & 4 ? at - nx : at,
              d = link & 8 ? at + nx : at;
    const auto axis = [&](int a, int b, double spacing) {
      if (a == b || !p.sampled[a] || !p.sampled[b])
        return Point{};
      const double span = spacing * ((a != at) + (b != at));
      return Point{(p.flow[b].x - p.flow[a].x) / span, (p.flow[b].y - p.flow[a].y) / span};
    };
    const auto horizontal = axis(l, r, dx), vertical = axis(u, d, dy);
    // Symmetric velocity gradient: uniform drift and rigid rotation cause no strain.
    const double shear = horizontal.y + vertical.x;
    p.strain[at] = horizontal.x * horizontal.x + vertical.y * vertical.y + .5 * shear * shear;
  }
}
int Field::place_animals(int kind, double x, double y, double radius, int count,
                         double requested_morph) {
  sync_environment();
  refresh_algae_exposure();
  sync_food_web();
  int placed = 0;
  for (int k = 0; k < std::clamp(count, 1, 20); ++k) {
    const double scatter = k ? radius * .4 * std::sqrt(double(k) / std::max(1, count - 1)) : 0,
                 qx = wrap_x(x + std::cos(k * 2.4) * scatter),
                 qy = y + std::sin(k * 2.4) * scatter * .25;
    std::size_t site = vegetation_.surfaces.size();
    double best = 1e30, along = .5;
    for (std::size_t i = 0; i < vegetation_.surfaces.size(); ++i) {
      const auto &candidate = vegetation_.surfaces[i];
      const auto edges = sediment_edges(i);
      if (kind == 9 ? edges[0] > .01 || edges[1] > .01 ||
                          candidate.algae_open[1] <= candidate.algae_open[0]
                    : candidate.normal.y > -.5)
        continue;
      const double t = std::clamp((delta_x(qx - candidate.a.x) * (candidate.b.x - candidate.a.x) +
                                   (qy - candidate.a.y) * (candidate.b.y - candidate.a.y)) /
                                      (candidate.length * candidate.length),
                                  kind == 9 ? candidate.algae_open[0] : 0.,
                                  kind == 9 ? candidate.algae_open[1] : 1.),
                   px = candidate.a.x + t * (candidate.b.x - candidate.a.x),
                   py = candidate.a.y + t * (candidate.b.y - candidate.a.y),
                   distance = std::hypot(delta_x(px - qx), py - qy);
      if (kind == 7 && edges[0] * (1 - t) + edges[1] * t <= env_.burrow_depth)
        continue;
      const double depth = edges[0] * (1 - t) + edges[1] * t;
      if (kind != 9 && !bed_site_clear(candidate, t, std::max(.5, .5 * depth), 10))
        continue;
      if (distance < best) {
        best = distance;
        site = i;
        along = t;
      }
    }
    if (site == vegetation_.surfaces.size())
      break;
    auto &s = vegetation_.surfaces[site];
    const double amount = kind == 9   ? env_.mussel_birth_energy * 4
                          : kind == 8 ? env_.crab_birth_energy * 2
                                      : env_.worm_head_energy * 4;
    if (energy_available < amount)
      break;
    const double morph =
        requested_morph < 0
            ? rng.index(4) + rng.uniform() * .999
            : std::floor(requested_morph) +
                  std::fmod(requested_morph - std::floor(requested_morph) + k * .61803398875, .999);
    if (kind == 9) {
      Mussel m;
      m.id = food_web_.next_id++;
      m.patch = s.id;
      m.along = along;
      m.energy = amount;
      m.morph = morph;
      const double lift = .62 * mussel_radius(amount, env_, morph);
      m.x = wrap_x(s.a.x + along * (s.b.x - s.a.x) + s.normal.x * lift);
      m.y = s.a.y + along * (s.b.y - s.a.y) + s.normal.y * lift;
      food_web_.mussels.push_back(m);
      s.mussel_arc += PI * mussel_radius(amount, env_, morph);
    } else if (kind == 8) {
      Crab c;
      c.id = food_web_.next_id++;
      c.depth = .2 + .6 * (morph - std::floor(morph));
      c.patch = c.target = s.id;
      c.along = along;
      c.destination = rng.uniform(.1, .9);
      c.exposure = 0;
      c.energy = amount;
      c.morph = morph;
      c.next_move = 300 + c.id % 400;
      const auto edges = sediment_edges(site);
      const double depth = edges[0] + along * (edges[1] - edges[0]),
                   height = crab_support_height(crab_radius(amount, env_, morph), depth, c.depth);
      c.x = wrap_x(s.a.x + along * (s.b.x - s.a.x) + s.normal.x * height);
      c.y = s.a.y + along * (s.b.y - s.a.y) + s.normal.y * height;
      food_web_.crabs.push_back(c);
    } else {
      WormHead h;
      h.id = food_web_.next_id++;
      h.patch = s.id;
      h.along = along;
      h.energy = std::min(amount, env_.worm_head_energy);
      h.morph = morph;
      h.extension = 1;
      h.duration = std::uint64_t(env_.worm_head_time);
      h.age = 1;
      const auto edges = sediment_edges(site);
      const double depth = edges[0] * (1 - along) + edges[1] * along,
                   burial = depth * (.2 + .6 * (h.id * 37 % 101) / 100.);
      h.base_x = wrap_x(s.a.x + along * (s.b.x - s.a.x) + s.normal.x * (depth - burial));
      h.base_y = s.a.y + along * (s.b.y - s.a.y) + s.normal.y * (depth - burial);
      const double length =
          worm_length(h.id, h.morph) * std::clamp((depth - env_.burrow_depth) / 8., 0., 1.);
      const double vertical_burial = burial / std::max(.5, -s.normal.y);
      h.x = h.base_x;
      h.y = h.base_y - vertical_burial - length;
      h.ground =
          std::clamp(1 - 2 * vertical_burial / std::max(.001, vertical_burial + length), -1., 1.);
      food_web_.heads.push_back(h);
      s.worms += amount - h.energy;
    }
    energy_available -= amount;
    food_web_.introduced += amount;
    ++placed;
  }
  return placed;
}
bool Field::crush_target(int kind, std::uint64_t id, int organ, double along) {
  if (kind == 5) {
    std::size_t patch = vegetation_.surfaces.size() + vegetation_.drifting_grass.size();
    for (std::size_t i = 0; i < vegetation_.surfaces.size(); ++i)
      if (vegetation_.surfaces[i].id == id) {
        patch = i;
        break;
      }
    for (std::size_t i = 0; i < vegetation_.drifting_grass.size(); ++i)
      if (vegetation_.drifting_grass[i].id == id) {
        patch = vegetation_.surfaces.size() + i;
        break;
      }
    if (patch >= vegetation_.surfaces.size() + vegetation_.drifting_grass.size())
      return false;
    const auto &plant = plant_source(patch);
    if (organ < 0 || std::size_t(organ) >= plant.organs.size() || plant.organs[organ].energy <= 0)
      return false;
    // Cut where the organ was picked; a leaf comes off at its base.
    cut_organ(patch, organ, plant.organs[organ].kind >= 2 ? 0 : std::clamp(along, 0., .9));
    index_plants();
    return true;
  }
  std::size_t index = ~std::size_t(0);
  auto find = [&](const auto &animals) {
    for (std::size_t i = 0; i < animals.size(); ++i)
      if (animals[i].id == id) {
        index = i;
        break;
      }
  };
  if (kind == 7)
    find(food_web_.heads);
  else if (kind == 8)
    find(food_web_.crabs);
  else if (kind == 9)
    find(food_web_.mussels);
  else
    return false;
  auto meal = take_small_animal(kind, index, 1e12, true, true);
  if (!meal)
    return false;
  constexpr double mouse_scatter = 4;
  scatter_fragments(*meal, 1, mouse_scatter);
  return true;
}
bool Field::bite_target(std::uint64_t id, int organ, double along) {
  for (std::size_t i = 0; i < vegetation_.plants.size(); ++i) {
    const auto &part = vegetation_.plants[i];
    if (part.kind != 5 || part.organ != organ || part.energy <= 0)
      continue;
    const auto &source = plant_source(part.patch);
    if (source.id != id)
      continue;
    // The stroke of this organ that covers the picked position.
    const double lo = stroke_along(part, -1), hi = stroke_along(part, 1);
    if (along < std::min(lo, hi) - 1e-6 || along > std::max(lo, hi) + 1e-6)
      continue;
    Body b{};
    b.alive = b.hatched = true;
    b.health = 1;
    b.tissue = 3 * BODY_TISSUE;
    b.bite_signal = 1;
    b.bite_strength = 24;
    b.jaw_length = .6;
    b.blunt_teeth = .5;
    b.force_scale = 110;
    const double s = hi != lo ? std::clamp(2 * (along - lo) / (hi - lo) - 1, -1., 1.) : 0.;
    if (auto piece = bite_plant(b, i, s, 1)) {
      append_fragment(*piece);
      index_plants();
      return true;
    }
    return false;
  }
  return false;
}
bool Field::encourage_target(int kind, std::uint64_t id) {
  if (kind == 5) {
    for (auto &s : vegetation_.surfaces)
      if (s.id == id && s.stump) {
        // Several hundred steps of faster growth, besides the immediate push.
        s.boost_until = time + 400;
        const double growth =
            std::min({energy_available, std::max(0., niche_limit(5) - grass_energy()),
                      std::max(0., grass_capacity(s) - s.grass), .08 * env_.grass_capacity});
        const bool young = std::any_of(s.organs.begin(), s.organs.end(), [&](const auto &o) {
          return o.energy > 0 && o.elongation < 1 &&
                 (o.kind == 0 || (grass_form(s) == 1 && o.kind >= 2));
        });
        if (growth <= 0 && !young)
          return false;
        s.grass += growth;
        energy_available -= growth;
        prepare_organs(s);
        for (auto &o : s.organs)
          if (o.energy > 0)
            o.elongation = std::min(1., o.elongation + .12);
        index_plants();
        return true;
      }
  } else if (kind == 7) {
    for (auto &h : food_web_.heads)
      if (h.id == id && h.energy > 0) {
        h.withdrawing = false;
        h.duration = std::max(h.duration, h.age + std::uint64_t(env_.worm_head_time));
        return true;
      }
  } else if (kind == 8) {
    for (auto &c : food_web_.crabs)
      if (c.id == id && c.energy > 0) {
        c.state = 1;
        c.digging = 0;
        c.path.clear();
        c.target = c.patch;
        c.destination = c.along;
        c.next_move = c.age + std::uint64_t(env_.crab_move_interval_max);
        return true;
      }
  } else if (kind == 9) {
    for (auto &m : food_web_.mussels)
      if (m.id == id && m.energy > 0 && !m.buried) {
        m.closed = 0;
        return true;
      }
  }
  return false;
}
void Field::startle_animals(double x, double y, double radius) {
  for (auto &h : food_web_.heads)
    if (std::hypot(delta_x(h.base_x - x), h.base_y - y) <= radius ||
        std::hypot(delta_x(h.x - x), h.y - y) <= radius)
      h.withdrawing = true;
  for (auto &c : food_web_.crabs)
    if (std::hypot(delta_x(c.x - x), c.y - y) <= radius) {
      const auto patch = std::find_if(vegetation_.surfaces.begin(), vegetation_.surfaces.end(),
                                      [&](const auto &s) { return s.id == c.patch; });
      if (patch == vegetation_.surfaces.end())
        continue;
      const double away =
          delta_x(c.x - x) * (patch->b.x - patch->a.x) + (c.y - y) * (patch->b.y - patch->a.y);
      c.state = 3;
      c.digging = 0;
      c.direction = away >= 0 ? 1 : -1;
      c.path.clear();
      c.destination = away > 0 || (std::abs(away) < 1e-6 && rng.uniform() < .5) ? .98 : .02;
      c.target = c.patch;
      c.next_move = c.age + 420 + c.id % 180;
    }
  for (auto &m : food_web_.mussels)
    if (std::hypot(delta_x(m.x - x), m.y - y) <= radius)
      m.closed = std::max(m.closed, int(env_.mussel_close_time));
}
double Field::feed_crabs(double x, double y, double energy, double radius) {
  double eaten = 0;
  for (auto &c : food_web_.crabs) {
    if (c.energy <= 0 || c.exposure <= .1 ||
        std::hypot(delta_x(c.x - x), c.y - y) > radius + crab_radius(c.energy, env_, c.morph))
      continue;
    const double capacity = crab_capacity(c.morph, env_),
                 amount = std::min({energy - eaten, std::max(0., capacity - c.energy),
                                    capacity / env_.crab_mature});
    c.energy += amount;
    eaten += amount;
    if (amount > 0)
      c.feeding = {amount, x, y, 3, 20};
    if (eaten >= energy)
      break;
  }
  return eaten;
}
void Field::sync_food_web() {
  // Biomass uses a coarse water field; individual crustaceans are a display effect.
  const double cell = std::max(24., std::sqrt(geometry_.width * geometry_.height / 12000));
  const int nx = int(std::ceil(geometry_.width / cell)),
            ny = int(std::ceil(geometry_.height / cell));
  auto &p = food_web_.plankton;
  if (p.columns == nx && p.rows == ny && p.width == geometry_.width &&
      p.height == geometry_.height && food_web_.geometry == environment_signature &&
      !p.open.empty() && food_web_.neighbor_gap == env_.crab_edge_gap &&
      food_web_.neighbors.size() == vegetation_.surfaces.size())
    return;
  const auto old = std::move(p.energy);
  const int old_nx = p.columns, old_ny = p.rows;
  const double old_area = p.width * p.height;
  p.columns = nx;
  p.rows = ny;
  p.width = geometry_.width;
  p.height = geometry_.height;
  p.energy.assign(nx * ny, 0);
  p.scratch.assign(nx * ny, 0);
  const auto old_odor = std::move(p.odor);
  p.odor.assign(std::size_t(nx) * ny * 7, 0.f);
  for (int j = 0; j < old_ny; ++j)
    for (int i = 0; i < old_nx; ++i) {
      const auto to =
          std::size_t(std::min(ny - 1, j * ny / old_ny) * nx + std::min(nx - 1, i * nx / old_nx));
      for (int c = 0; c < 7; ++c)
        if (old_odor.size() == std::size_t(old_nx) * old_ny * 7)
          p.odor[to * 7 + c] +=
              old_odor[(std::size_t(j) * old_nx + i) * 7 + c] *
              float(old_area / (p.width * p.height) * double(nx) * ny / (double(old_nx) * old_ny));
    }
  p.nursery.clear();
  if (p.cooldown.size() != p.energy.size())
    p.cooldown.assign(nx * ny, 0);
  p.open.assign(nx * ny, 0);
  p.links.assign(nx * ny, 0);
  p.water_area = 0;
  const double dx = p.width / nx, dy = p.height / ny;
  for (int j = 0; j < ny; ++j)
    for (int i = 0; i < nx; ++i) {
      const auto at = j * nx + i;
      p.open[at] = free((i + .5) * dx, (j + .5) * dy, 0);
      p.water_area += p.open[at] * dx * dy;
    }
  for (int j = 0; j < ny; ++j)
    for (int i = 0; i < nx; ++i) {
      const auto at = j * nx + i;
      if (!p.open[at])
        continue;
      for (int d = 0; d < 4; ++d) {
        const int x = (i +
                       (d == 0   ? -1
                        : d == 1 ? 1
                                 : 0) +
                       nx) %
                      nx,
                  y = j + (d == 2   ? -1
                           : d == 3 ? 1
                                    : 0);
        if (y >= 0 && y < ny && p.open[y * nx + x] &&
            waterborne_path(*this, (i + .5) * dx, (j + .5) * dy, (x + .5) * dx, (y + .5) * dy))
          p.links[at] |= 1 << d;
      }
    }
  for (int j = 0; j < old_ny; ++j)
    for (int i = 0; i < old_nx; ++i) {
      const auto at = std::min(ny - 1, j * ny / old_ny) * nx + std::min(nx - 1, i * nx / old_nx);
      if (p.open[at])
        p.energy[at] += old[j * old_nx + i];
      else
        food_web_.released += old[j * old_nx + i];
    }
  p.nonempty = std::any_of(p.energy.begin(), p.energy.end(), [](double e) { return e > 0; });
  food_web_.neighbor_gap = env_.crab_edge_gap;
  auto &neighbors = food_web_.neighbors;
  neighbors.assign(vegetation_.surfaces.size(), {});
  for (std::size_t i = 0; i < neighbors.size(); ++i) {
    const auto &s = vegetation_.surfaces[i];
    auto c = center(s);
    vegetation_.surface_grid.nearby(
        c.x, c.y, s.length + env_.crab_edge_gap + 16, [&](std::uint32_t j) {
          if (i == j)
            return;
          const auto &q = vegetation_.surfaces[j];
          if (q.normal.y > -.35)
            return;
          const double gap = std::min({std::hypot(delta_x(s.a.x - q.a.x), s.a.y - q.a.y),
                                       std::hypot(delta_x(s.a.x - q.b.x), s.a.y - q.b.y),
                                       std::hypot(delta_x(s.b.x - q.a.x), s.b.y - q.a.y),
                                       std::hypot(delta_x(s.b.x - q.b.x), s.b.y - q.b.y)});
          if (gap <= env_.crab_edge_gap)
            neighbors[i].push_back(j);
        });
    std::sort(neighbors[i].begin(), neighbors[i].end());
  }
  for (auto &s : vegetation_.surfaces)
    s.mussel_arc = 0;
  for (const auto &m : food_web_.mussels)
    for (auto &s : vegetation_.surfaces)
      if (s.id == m.patch && m.energy > 0) {
        s.mussel_arc += PI * mussel_radius(m.energy, env_, m.morph);
        break;
      }
  food_web_.geometry = environment_signature;
}
bool Field::threatens(const VisibleBody &f, double x, double y, double radius, double body,
                      double speed) const {
  return f.kind == 1 && f.relative_speed > speed &&
         std::hypot(delta_x(f.x - x), f.y - y) < radius + body * f.radius;
}
const VisibleBody *Field::danger_near(double x, double y, double radius, double body,
                                      double speed) const {
  const VisibleBody *nearest = nullptr;
  double best = 1e30;
  body_grid_.nearby(x, y, radius + body * indexed_body_radius_, [&](std::uint32_t i) {
    const auto &f = visible_[i];
    if (threatens(f, x, y, radius, body, speed)) {
      const double d = std::hypot(delta_x(f.x - x), f.y - y);
      if (d < best) {
        best = d;
        nearest = &f;
      }
    }
  });
  return nearest;
}
void Field::prepare_plankton_sources() {
  auto &p = food_web_.plankton;
  const std::size_t wanted =
      env_.plankton_limit > 0 && p.water_area > 0
          ? std::size_t(std::clamp(std::round(p.water_area / env_.plankton_seed_area), 1., 256.))
          : 0;
  bool changed = p.nursery.size() != p.energy.size();
  if (p.sources.size() > wanted) {
    p.sources.resize(wanted);
    changed = true;
  }
  auto suitable = [&](Point q) {
    return free(q.x * p.width, q.y * p.height, env_.plankton_seed_clearance);
  };
  for (auto it = p.sources.begin(); it != p.sources.end();)
    if (!suitable(*it)) {
      it = p.sources.erase(it);
      changed = true;
    } else
      ++it;
  while (p.sources.size() < wanted) {
    Point best;
    double distance = -1;
    for (int trial = 0; trial < 48; ++trial) {
      Point q{rng.uniform(), rng.uniform()};
      if (!suitable(q) || sediment_cover(q.x * p.width, q.y * p.height) > 0)
        continue;
      double nearest = p.width * p.width + p.height * p.height;
      for (auto v : p.sources) {
        const double dx = delta_x((q.x - v.x) * p.width), dy = (q.y - v.y) * p.height;
        nearest = std::min(nearest, dx * dx + dy * dy);
      }
      if (nearest > distance) {
        best = q;
        distance = nearest;
      }
    }
    if (distance < 0)
      break;
    p.sources.push_back(best);
    changed = true;
  }
  if (!changed)
    return;
  p.nursery.assign(p.energy.size(), 0);
  for (auto source : p.sources)
    for (const auto &[at, weight] : plankton_source_cells(source))
      p.nursery[at] = std::max(p.nursery[at], weight);
}
double Field::supply_plankton(double budget, double per_source) {
  auto &p = food_web_.plankton;
  if (p.sources.empty() || budget <= 0 || per_source <= 0)
    return 0;
  const double total = std::accumulate(p.energy.begin(), p.energy.end(), 0.),
               available = std::max(0., std::min({budget, energy_available,
                                                  env_.plankton_limit * p.water_area - total})),
               share = std::min(per_source, available / p.sources.size()),
               maximum = env_.plankton_max_density * p.width / p.columns * p.height / p.rows;
  double added = 0;
  for (auto source : p.sources) {
    const auto cells = plankton_source_cells(source);
    double weights = 0;
    for (const auto &[at, weight] : cells)
      if (plankton_water_cell(at))
        weights += weight;
    if (weights <= 0)
      continue;
    for (const auto &[at, weight] : cells) {
      if (!plankton_water_cell(at))
        continue;
      const double amount = std::max(
          0., std::min({share * weight / weights, maximum - p.energy[at], available - added}));
      p.energy[at] += amount;
      added += amount;
    }
  }
  energy_available -= added;
  feeding_.food_allowance = std::max(0., feeding_.food_allowance - added);
  food_web_.introduced += added;
  p.nonempty |= added > 0;
  return added;
}
std::vector<std::pair<std::size_t, double>> Field::plankton_source_cells(Point source) const {
  const auto &p = food_web_.plankton;
  const double dx = p.width / p.columns, dy = p.height / p.rows, x = source.x * p.width,
               y = source.y * p.height;
  constexpr double radius = 100, sigma = 44;
  std::vector<std::pair<std::size_t, double>> cells;
  for (int row = std::max(0, int((y - radius) / dy));
       row <= std::min(p.rows - 1, int((y + radius) / dy)); ++row)
    for (int col = int(std::floor((x - radius) / dx)); col <= int(std::floor((x + radius) / dx));
         ++col) {
      const auto at = std::size_t(row * p.columns + (col % p.columns + p.columns) % p.columns);
      const double rx = (col + .5) * dx - x, ry = (row + .5) * dy - y, square = rx * rx + ry * ry;
      if (square <= radius * radius && p.open[at] &&
          waterborne_path(*this, x, y, (col + .5) * dx, (row + .5) * dy))
        cells.push_back({at, std::exp(-square / (2 * sigma * sigma))});
    }
  return cells;
}
bool Field::plankton_water_cell(std::size_t at) const {
  if (water_cells_time_ == time && at < water_cells_.size())
    return water_cells_[at];
  return water_cell_geometry(at);
}
void Field::refresh_water_cells() {
  const auto &p = food_web_.plankton;
  water_cells_.resize(p.open.size());
  for (std::size_t at = 0; at < water_cells_.size(); ++at)
    water_cells_[at] = water_cell_geometry(at);
  water_cells_time_ = time;
}
bool Field::water_cell_geometry(std::size_t at) const {
  const auto &p = food_web_.plankton;
  if (at >= p.open.size() || !p.open[at])
    return false;
  const double x = (at % p.columns + .5) * p.width / p.columns,
               y = (at / p.columns + .5) * p.height / p.rows;
  if (sediment_.sediment_floor.empty())
    return true;
  const int col = std::clamp(int(x / p.width * sediment_.columns), 0, sediment_.columns - 1),
            row = std::clamp(int(y / p.height * sediment_.rows), 0, sediment_.rows - 1);
  const auto index = sediment_.sediment_floor[row * sediment_.columns + col];
  if (index >= vegetation_.surfaces.size())
    return sediment_cover(x, y) <= 0;
  const auto &s = vegetation_.surfaces[index];
  const double rx = delta_x(x - s.a.x), ry = y - s.a.y,
               along = (rx * (s.b.x - s.a.x) + ry * (s.b.y - s.a.y)) / (s.length * s.length),
               gap = rx * s.normal.x + ry * s.normal.y;
  if (along < 0 || along > 1 || gap < 0)
    return sediment_cover(x, y) <= 0;
  const auto edges = sediment_edges(index);
  return gap >= edges[0] + along * (edges[1] - edges[0]);
}
double Field::plankton_density(double x, double y) const {
  const auto &p = food_web_.plankton;
  if (!p.nonempty)
    return 0;
  const auto s = sample(*this, x, y);
  double sum = 0;
  for (int k = 0; k < 4; ++k)
    sum += s.weight[k] * p.energy[s.index[k]];
  return sum * p.columns * p.rows / (p.width * p.height);
}
double Field::consume_plankton(double x, double y, double area, double maximum) {
  auto &p = food_web_.plankton;
  if (p.energy.empty() || area <= 0)
    return 0;
  const auto s = sample(*this, x, y);
  const double fraction = area * p.columns * p.rows / (p.width * p.height);
  std::array<double, 4> weights = s.weight, take{};
  double proposed = 0;
  for (int k = 0; k < 4; ++k) {
    for (int j = k + 1; j < 4; ++j)
      if (s.index[j] == s.index[k]) {
        weights[k] += weights[j];
        weights[j] = 0;
      }
    take[k] = p.energy[s.index[k]] * std::min(1., fraction * weights[k]);
    proposed += take[k];
  }
  const double scale = proposed > 0 ? std::min(1., std::max(0., maximum) / proposed) : 0;
  double total = 0;
  for (int k = 0; k < 4; ++k) {
    const double amount = take[k] * scale;
    p.energy[s.index[k]] -= amount;
    total += amount;
  }
  return total;
}
double Field::filter_plankton(double x, double y, double radius, double share, double maximum) {
  auto &p = food_web_.plankton;
  if (p.energy.empty() || maximum <= 0)
    return 0;
  const double dx = p.width / p.columns, dy = p.height / p.rows;
  std::vector<std::size_t> cells;
  double total = 0;
  for (int j = std::max(0, int((y - radius) / dy));
       j <= std::min(p.rows - 1, int((y + radius) / dy)); ++j)
    for (int i = int(std::floor((x - radius) / dx)); i <= int(std::floor((x + radius) / dx)); ++i) {
      const auto at = j * p.columns + (i + p.columns) % p.columns;
      if (std::hypot((i + .5) * dx - x, (j + .5) * dy - y) <= radius) {
        cells.push_back(at);
        total += p.energy[at];
      }
    }
  const double fraction = total > 0 ? std::min(share, maximum / total) : 0;
  for (auto at : cells)
    p.energy[at] *= 1 - fraction;
  return total * fraction;
}
void Field::deposit_detritus(double x, double y, double energy, double radius) {
  if (energy <= 0)
    return;
  std::size_t target = vegetation_.surfaces.size();
  double closest = std::numeric_limits<double>::infinity();
  vegetation_.surface_grid.nearby(
      x, y, sediment_.max_sediment_depth + radius + 16, [&](std::uint32_t i) {
        const auto &s = vegetation_.surfaces[i];
        if (s.normal.y > -.5 || sediment_depth(s) < env_.burrow_depth)
          return;
        const double px = delta_x(x - s.a.x), py = y - s.a.y,
                     t = (px * (s.b.x - s.a.x) + py * (s.b.y - s.a.y)) / (s.length * s.length),
                     gap = px * s.normal.x + py * s.normal.y;
        if (t < 0 || t > 1 || gap < -radius || gap > sediment_depth(s) + radius + .1)
          return;
        if (std::abs(gap - sediment_depth(s)) < closest) {
          closest = std::abs(gap - sediment_depth(s));
          target = i;
        }
      });
  if (target < vegetation_.surfaces.size())
    vegetation_.surfaces[target].detritus += energy;
  else
    food_web_.released += energy;
}
std::optional<std::size_t> Field::bottom_patch(double x, double y) const {
  if (sediment_.sediment_floor.empty())
    return {};
  const int col = std::clamp(int(wrap_x(x) / geometry_.width * sediment_.columns), 0,
                             sediment_.columns - 1),
            row = std::clamp(int(y / geometry_.height * sediment_.rows), 0, sediment_.rows - 1);
  const auto i = sediment_.sediment_floor[row * sediment_.columns + col];
  return i < vegetation_.surfaces.size() ? std::optional<std::size_t>(i) : std::nullopt;
}
void Field::deposit_feces(double x, double y, double energy) {
  if (energy <= 0)
    return;
  const auto at = bottom_patch(x, y);
  if (at && sediment_depth(vegetation_.surfaces[*at]) > 0)
    vegetation_.surfaces[*at].detritus += energy;
  else
    food_web_.released += energy;
}
double Field::feed_plankton(double x, double y, double available, double radius) {
  auto &p = food_web_.plankton;
  if (available <= 0 || !p.columns || y < 0 || y >= p.height)
    return 0;
  const auto at =
      std::size_t(int(y / p.height * p.rows) * p.columns + int(wrap_x(x) / p.width * p.columns));
  const double cap = env_.plankton_max_density * p.width * p.height / (p.columns * p.rows);
  if (p.energy[at] < .2 * cap || !plankton_water_cell(at))
    return 0;
  const double amount = std::min(available, std::max(0., 2 * cap - p.energy[at]));
  const double taken = std::min(amount, available < .001 ? available : available * .0005);
  p.energy[at] += taken;
  if (taken > 0) {
    auto &traces = food_web_.grazing;
    auto found = std::find_if(traces.begin(), traces.end(), [&](const auto &q) {
      return std::hypot(delta_x(q.x - x), q.y - y) < 8;
    });
    if (found != traces.end()) {
      found->amount += taken;
      found->radius = std::max(found->radius, radius);
    } else if (traces.size() < 32)
      traces.push_back({x, y, radius, taken});
  }
  return taken;
}
double Field::graze_bed(double x, double y, double radius, double area, double maximum) {
  const double contact =
      std::clamp((sediment_immersion(x, y, radius) - .1) / (env_.burial_cover - .1), 0., 1.);
  if (maximum <= 0 || contact <= 0)
    return 0;
  const auto at = bottom_patch(x, y);
  if (!at)
    return 0;
  auto &s = vegetation_.surfaces[*at];
  const double depth = sediment_depth(s);
  if (depth < env_.burrow_depth)
    return 0;
  const double amount =
      std::min(maximum, s.detritus * std::min(1., area / (s.length * depth)) * contact);
  s.detritus -= amount;
  return amount;
}
double Field::grip_worm(double x, double y, double radius, double maximum) {
  if (maximum <= 0 || sediment_immersion(x, y, radius) < env_.burial_cover)
    return 0;
  const auto at = bottom_patch(x, y);
  if (!at)
    return 0;
  auto &s = vegetation_.surfaces[*at];
  const double amount = std::min({maximum, env_.worm_head_energy, s.worms});
  s.worms -= amount;
  return amount;
}
std::array<double, 5> Field::small_animal_stores() const {
  std::array<double, 5> stores{};
  stores[0] =
      std::accumulate(food_web_.plankton.energy.begin(), food_web_.plankton.energy.end(), 0.);
  for (const auto &s : vegetation_.surfaces) {
    stores[1] += s.worms;
    stores[4] += s.detritus;
  }
  for (const auto &v : food_web_.heads)
    stores[1] += v.energy;
  for (const auto &v : food_web_.crabs)
    stores[2] += v.energy;
  for (const auto &v : food_web_.mussels)
    stores[3] += v.energy;
  for (int k = 0; k < 4; ++k)
    stores[k] += loose_energy(k + 6);
  return stores;
}
double Field::small_animal_energy() const {
  const auto stores = small_animal_stores();
  return std::accumulate(stores.begin(), stores.end(), 0.);
}
void Field::index_small_animals(std::vector<VisibleBody> &out) const {
  auto add = [&](double x, double y, double energy, double radius, int kind, std::size_t source,
                 std::array<double, 3> color) {
    if (energy <= 0)
      return;
    VisibleBody v{x, y, 0, 0, false, true, color, 0, radius, kind, source};
    out.push_back(v);
  };
  for (std::size_t i = 0; i < food_web_.heads.size(); ++i) {
    const auto &v = food_web_.heads[i];
    if (v.energy <= 0)
      continue;
    add(v.x, v.y, v.energy, worm_head_radius, 7, i, {.7, .15, .15});
    out.back().id = v.id;
    out.back().odor_channel = 3;
    out.back().odor_energy = v.energy * odor_maturity(v.age, env_);
  }
  for (std::size_t i = 0; i < food_web_.crabs.size(); ++i) {
    const auto &v = food_web_.crabs[i];
    if (v.energy <= 0)
      continue;
    add(v.x, v.y, v.energy, crab_radius(v.energy, env_, v.morph), 8, i, {.55, .3, .2});
    out.back().id = v.id;
    out.back().hidden = !v.state;
    out.back().odor_channel = 4;
    out.back().odor_energy =
        v.energy * (v.state ? odor_maturity(v.exposed_age, env_) : env_.buried_odor);
  }
  for (std::size_t i = 0; i < food_web_.mussels.size(); ++i) {
    const auto &v = food_web_.mussels[i];
    if (v.energy <= 0)
      continue;
    add(v.x, v.y, v.energy, mussel_radius(v.energy, env_, v.morph), 9, i, {.25, .3, .35});
    out.back().id = v.id;
    out.back().odor_channel = 3;
    out.back().odor_energy = v.energy;
  }
}
void Field::scatter_fragments(const SmallAnimalMeal &meal, double force, double spread) {
  const double impulse = std::sqrt(std::max(0., force) / std::max(.01, meal.hardness)),
               burst = spread * std::clamp(impulse, .5, 3.),
               reach = std::max(2., meal.radius) * burst;
  const bool on_bed = rests_on_sediment({meal.x, meal.y}, meal.radius);
  auto scatter = [&](double energy, int origin, std::array<double, 3> color, double hardness) {
    const auto shares = fragment_shares(energy, force, hardness, env_);
    double remaining = energy;
    for (std::size_t k = 0; k < shares.size(); ++k) {
      const double amount = k + 1 == shares.size() ? remaining : energy * shares[k];
      remaining -= amount;
      const double angle = rng.uniform(0, 2 * PI), distance = reach * std::sqrt(rng.uniform()),
                   radius = food_radius(amount);
      Body shape{};
      shape.x = wrap_x(meal.x + std::cos(angle) * distance);
      shape.y = meal.y + std::sin(angle) * distance * (on_bed ? .15 : 1);
      collide(shape, meal.x, meal.y, radius);
      Food piece{shape.x, shape.y, .3 * burst * std::cos(angle), .3 * burst * std::sin(angle),
                 0,       amount};
      piece.origin = origin;
      piece.radius = radius;
      piece.initial_energy = amount;
      piece.color = color;
      piece.hardness = origin == 4 ? hardness : 0;
      piece.buoyancy = .3;
      piece.bitten = true;
      append_fragment(piece);
    }
  };
  scatter(meal.energy, meal.origin, meal.color, meal.hardness);
  scatter(meal.algae_energy, 4, {.27, .40, .18}, env_.hardness_algae);
}
void Field::release_excess_algae(SurfacePatch &s) {
  const double excess = std::max(0., s.algae - algae_capacity(s));
  if (excess <= 0)
    return;
  s.algae -= excess;
  SmallAnimalMeal algae;
  algae.x = wrap_x((s.a.x + s.b.x) / 2 + s.normal.x);
  algae.y = (s.a.y + s.b.y) / 2 + s.normal.y;
  algae.radius = 2;
  algae.algae_energy = excess;
  scatter_fragments(algae, env_.hardness_algae);
}
std::optional<SmallAnimalMeal> Field::take_small_animal(int kind, std::size_t index, double force,
                                                        bool biting, bool buried) {
  SmallAnimalMeal meal;
  meal.origin = kind;
  double *energy = nullptr;
  if (kind == 7 && index < food_web_.heads.size() && biting) {
    auto &v = food_web_.heads[index];
    energy = &v.energy;
    meal.x = v.x;
    meal.y = v.y;
    meal.radius = worm_head_radius;
    meal.color = {.85, .15, .12};
  } else if (kind == 8 && index < food_web_.crabs.size() && biting) {
    auto &v = food_web_.crabs[index];
    if (!v.state && !buried)
      return {};
    energy = &v.energy;
    meal.x = v.x;
    meal.y = v.y;
    meal.radius = crab_radius(v.energy, env_, v.morph);
    meal.hardness =
        env_.hardness_crab + env_.hardness_crab_growth * v.energy / crab_capacity(v.morph, env_);
    meal.color = {.9, .35, .2};
  } else if (kind == 9 && index < food_web_.mussels.size() && biting) {
    auto &v = food_web_.mussels[index];
    energy = &v.energy;
    meal.x = v.x;
    meal.y = v.y;
    meal.radius = mussel_radius(v.energy, env_, v.morph);
    meal.hardness = env_.hardness_mussel +
                    env_.hardness_mussel_growth * v.energy / mussel_capacity(v.morph, env_);
    if (v.closed)
      meal.hardness *= 2;
    meal.color = {.75, .25, .6};
  }
  if (!energy || *energy <= 0 ||
      (kind != 7 && rng.uniform() >= crack_success(force, meal.hardness, env_)))
    return {};
  meal.energy = *energy;
  *energy = 0;
  if (kind == 8) {
    const auto &c = food_web_.crabs[index];
    for (int k = 0; k < 3; ++k) {
      if (food_web_.shells.size() >= 128)
        food_web_.shells.erase(food_web_.shells.begin());
      food_web_.shells.push_back({food_web_.next_id++, wrap_x(c.x + (k - 1) * meal.radius * .8),
                                  c.y, meal.radius * (.28 + .08 * k), 4 + c.morph, (k - 1) * .7,
                                  0});
    }
  }
  if (kind == 9) {
    const auto &m = food_web_.mussels[index];
    if (food_web_.shells.size() >= 128)
      food_web_.shells.erase(food_web_.shells.begin());
    food_web_.shells.push_back({food_web_.next_id++, m.x, m.y, meal.radius, m.morph, 0, 0});
    for (auto &s : vegetation_.surfaces)
      if (s.id == m.patch) {
        const double arc = std::min(s.mussel_arc, PI * meal.radius),
                     area = s.length * (s.algae_open[1] - s.algae_open[0]) + s.mussel_arc;
        meal.algae_energy = area > 0 ? s.algae * arc / area : 0;
        s.mussel_arc -= arc;
        s.algae -= meal.algae_energy;
        break;
      }
  }
  return meal;
}
}
