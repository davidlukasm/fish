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
// Odour transport runs in row tiles of at least ODOR_TILE_CELLS cells.
constexpr std::size_t ODOR_TILE_CELLS = 1024;
// Strain needs the flow FLOW_HALO cells around every occupied cell.
constexpr int FLOW_HALO = 2;
// Plankton cells are at least PLANKTON_CELL_MIN wide; the tank holds about PLANKTON_CELLS.
constexpr double PLANKTON_CELL_MIN = 24, PLANKTON_CELLS = 12000;
// At most MAX_PLANKTON_SOURCES nurseries; each new one is the best of SOURCE_TRIALS draws.
constexpr double MAX_PLANKTON_SOURCES = 256;
constexpr int SOURCE_TRIALS = 48;
// A deposit may sit SURFACE_TOLERANCE above the sediment.
constexpr double SURFACE_TOLERANCE = .1;
// Placed crabs first move after CRAB_FIRST_MOVE plus up to CRAB_FIRST_MOVE_SPREAD steps.
constexpr std::uint64_t CRAB_FIRST_MOVE = 300, CRAB_FIRST_MOVE_SPREAD = 400;
// A startled crab runs to an end and hides for CRAB_HIDE_TIME plus up to CRAB_HIDE_SPREAD steps;
// it eats only when exposed beyond CRAB_FEEDING_EXPOSURE.
constexpr double CRAB_FEEDING_EXPOSURE = .1;
constexpr std::uint64_t CRAB_HIDE_TIME = 420, CRAB_HIDE_SPREAD = 180;
// A cut organ is severed at most this far along.
constexpr double MAX_CUT_ALONG = .9;
// The mouse cuts and crushes with unlimited force, scattering pieces MOUSE_SCATTER wide; it bites
// plants like a fish of MOUSE_TISSUE body tissues with this jaw.
constexpr double MOUSE_FORCE = 1, MOUSE_SCATTER = 4, MOUSE_TISSUE = 3, MOUSE_BITE_STRENGTH = 24,
                 MOUSE_JAW = .6;
// Grazing returns plankton only to cells above PLANKTON_RETURN_MIN of their capacity, up to
// PLANKTON_RETURN_MAX capacities, at PLANKTON_RETURN_RATE of the offer; tiny offers return whole.
constexpr double PLANKTON_RETURN_MIN = .2, PLANKTON_RETURN_MAX = 2, PLANKTON_RETURN_RATE = .0005,
                 PLANKTON_RETURN_WHOLE = .001;
// Bed grazing starts above GRAZE_IMMERSION of immersion.
constexpr double GRAZE_IMMERSION = .1;
// Cracked prey bursts by sqrt(force / hardness), clamped to [BURST_MIN, BURST_MAX], over at least
// SCATTER_REACH; on the bed the spread is flattened to BED_FLATTEN. Pieces fly at SCATTER_SPEED
// of the burst and float with FRAGMENT_BUOYANCY.
constexpr double MIN_HARDNESS = .01, BURST_MIN = .5, BURST_MAX = 3, SCATTER_REACH = 2,
                 BED_FLATTEN = .15, SCATTER_SPEED = .3, FRAGMENT_BUOYANCY = .3;
// Closed mussels are this many times harder.
constexpr double CLOSED_SHELL_HARDNESS = 2;
// A cracked crab leaves CRAB_PLATES plates, CRAB_PLATE_SPACING radii apart, of CRAB_PLATE_SIZE
// plus CRAB_PLATE_GROWTH radii each, tilted by CRAB_PLATE_TILT.
constexpr int CRAB_PLATES = 3;
constexpr double CRAB_PLATE_SPACING = .8, CRAB_PLATE_SIZE = .28, CRAB_PLATE_GROWTH = .08,
                 CRAB_PLATE_TILT = .7;
using GridSample = WaterborneSample;
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
std::array<double, odor_channel_count> Field::odor_field(double x, double y) const {
  std::array<double, odor_channel_count> out{};
  const auto &p = food_web_.plankton;
  if (!p.columns || !p.rows)
    return out;
  auto sample = waterborne_sample(*this, x, y);
  if (p.odor.size() == p.energy.size() * odor_channel_count)
    for (int k = 0; k < SAMPLE_CORNERS; ++k)
      if (sample.weight[k] > 0)
        for (int c = 0; c < odor_channel_count; ++c)
          out[c] += sample.weight[k] * p.odor[sample.index[k] * odor_channel_count + c];
  return out;
}
void Field::advance_odor() {
  SedimentReadScope bed(*this);
  auto &p = food_web_.plankton;
  if (!p.columns || !p.rows)
    return;
  if (p.odor.size() != p.energy.size() * odor_channel_count)
    p.odor.assign(p.energy.size() * odor_channel_count, 0.f);
  WaterborneTransport transport(*this, env_.odor_mixing);
  const double area = p.width / p.columns * p.height / p.rows;
  auto emit = [&](int channel, double x, double y, double energy) {
    if (energy <= 0 || channel < 0 || channel >= odor_channel_count)
      return;
    const auto sample = transport.sample(x, y);
    for (int k = 0; k < SAMPLE_CORNERS; ++k)
      if (sample.weight[k] > 0)
        p.odor[sample.index[k] * odor_channel_count + channel] +=
            float(env_.odor_emission * energy / area * sample.weight[k]);
  };
  // Carrion and eggs are rare and short-lived, but smell strongly.
  auto strong = [&](int channel, double x, double y, double energy) {
    emit(channel, x, y,
         energy * (channel == odor_kind::carrion ? env_.odor_strength_carrion
                   : channel == odor_kind::eggs  ? env_.odor_strength_eggs
                                                 : 1.));
  };
  for (const auto &q : feeding_.pieces)
    if (q.energy > 0) {
      int channel = q.origin == food_kind::feed     ? odor_kind::food
                    : q.origin == food_kind::algae  ? odor_kind::algae
                    : q.origin == food_kind::plant  ? odor_kind::plants
                    : q.origin == food_kind::egg    ? odor_kind::eggs
                    : q.origin == food_kind::mussel ? odor_kind::mussels
                    : q.origin == food_kind::worm || q.origin == food_kind::crab
                        ? odor_kind::benthos
                    : q.origin == food_kind::plankton ? odor_kind::plankton
                                                      : odor_kind::carrion;
      double fresh = q.origin == food_kind::fish || q.origin == food_kind::egg ||
                             q.origin == food_kind::carrion || q.origin >= food_kind::plankton
                         ? env_.odor_freshness(q.decay_age)
                         : 1;
      strong(channel, q.x, q.y, q.energy * fresh * odor_maturity(q.age, env_));
    }
  for (const auto &q : carrion_odor_)
    strong(odor_kind::carrion, q.x, q.y, q.energy);
  for (const auto &q : visible_) {
    strong(odor_kind::eggs, q.x, q.y, q.egg_odor * (q.hatched ? 1 : odor_maturity(q.age, env_)));
    if (q.odor_channel >= 0)
      emit(q.odor_channel, q.x, q.y, q.odor_energy);
  }
  for (const auto &q : vegetation_.plants)
    emit(q.kind == food_kind::algae ? odor_kind::algae : odor_kind::plants, q.x, q.y, q.energy);
  for (const auto &q : vegetation_.surfaces) {
    const double lift = sediment_depth(q) + std::hypot(p.width / p.columns, p.height / p.rows);
    const auto mid = surface_midpoint(q);
    const double x = mid.x + q.normal.x * lift, y = mid.y + q.normal.y * lift;
    emit(odor_kind::benthos, x, y, q.worms * env_.buried_odor);
  }
  if (p.nonempty && env_.odor_emission > 0)
    for (std::size_t at = 0; at < p.energy.size(); ++at)
      if (p.energy[at] > 0 && transport.wet(at))
        p.odor[at * odor_channel_count + odor_kind::plankton] +=
            float(env_.odor_emission * p.energy[at] / area);
  // Sperm is a local source, like eggs. Its smell persists and travels independently
  // of the material used for fertilisation and pigment optics.
  if (has_sperm_ && env_.odor_emission > 0)
    for (std::size_t at = 0; at < sperm_field_.size(); ++at)
      if (sperm_field_[at].density > 0 && transport.wet(at))
        p.odor[at * odor_channel_count + odor_kind::eggs] +=
            float(env_.odor_emission * env_.odor_strength_eggs * sperm_field_[at].density);
  if (std::none_of(p.odor.begin(), p.odor.end(), [](float v) { return v > 0; }))
    return;
  // The dense field shares one wet mask and one flow sample per cell. Diffusion
  // gathers from neighbours, so every worker owns its destination outright.
  struct TransportCell {
    Point flow;
    unsigned char wet;
  };
  thread_local std::vector<TransportCell> storage;
  storage.resize(p.energy.size());
  auto &cells = storage;
  const int nx = p.columns;
  const double dx = p.width / p.columns, dy = p.height / p.rows;
  const std::size_t count = p.energy.size();
  const std::size_t tiles = std::min<std::size_t>(
      {std::size_t(std::max(1, motion_workers)), std::max<std::size_t>(1, count / ODOR_TILE_CELLS),
       std::size_t(p.rows)});
  auto boundary = [&](std::size_t tile) { return p.rows * tile / tiles * nx; };
  auto partition = [&](auto operation) {
    parallel(
        tiles, motion_workers,
        [&](std::size_t tile) { operation(boundary(tile), boundary(tile + 1), tile); },
        PARALLEL_WORK);
  };
  partition([&](auto first, auto end, auto) {
    for (auto at = first; at < end; ++at) {
      auto &c = cells[at];
      c.wet = plankton_water_cell(at);
      c.flow = c.wet ? water_.velocity((at % nx + .5) * dx, (at / nx + .5) * dy) : Point{};
      c.flow = {c.flow.x * env_.waterborne_drift, c.flow.y * env_.waterborne_drift};
    }
  });
  auto neighbor = [&](std::size_t at, int d) { return cell_neighbor(at, d, std::size_t(nx)); };
  auto linked = [&](std::size_t at, int d) {
    return side_linked(p.links[at], d) && cells[at].wet && cells[neighbor(at, d)].wet;
  };
  struct Plane {
    std::size_t first;
    std::vector<float> values;
  };
  thread_local std::vector<Plane> planes;
  planes.resize(tiles);
  // Advection reaches at most one adjacent row. Each worker only needs its rows
  // plus that halo, rather than a complete copy of every channel in the tank.
  if (tiles > 1)
    for (std::size_t tile = 0; tile < tiles; ++tile) {
      auto &plane = planes[tile];
      plane.first = tile ? boundary(tile) - nx : 0;
      const auto end = std::min(count, boundary(tile + 1) + nx);
      plane.values.assign((end - plane.first) * odor_channel_count, 0.f);
    }
  auto &buffers = planes;
  auto &moved = p.odor_scratch;
  moved.assign(p.odor.size(), 0.f);
  partition([&](auto first, auto end, auto tile) {
    auto &plane = tiles == 1 ? moved : buffers[tile].values;
    const auto offset = tiles == 1 ? 0 : buffers[tile].first;
    for (auto at = first; at < end; ++at) {
      if (!cells[at].wet)
        continue;
      bool live = false;
      for (int c = 0; c < odor_channel_count; ++c)
        live |= p.odor[at * odor_channel_count + c] > 0;
      if (!live)
        continue;
      const auto w = cells[at].flow;
      const int hd = w.x >= 0 ? cell_side::right : cell_side::left,
                vd = w.y >= 0 ? cell_side::down : cell_side::up;
      const auto h = linked(at, hd) ? neighbor(at, hd) : at,
                 v = linked(at, vd) ? neighbor(at, vd) : at,
                 diagonal =
                     h != at && v != at && linked(h, vd) && linked(v, hd) ? neighbor(h, vd) : at;
      const double fx = h != at ? std::min(1., std::abs(w.x) / dx) : 0,
                   fy = v != at ? std::min(1., std::abs(w.y) / dy) : 0;
      const std::array<std::size_t, SAMPLE_CORNERS> targets{at, h, v, diagonal};
      const std::array<double, SAMPLE_CORNERS> weights{(1 - fx) * (1 - fy), fx * (1 - fy),
                                                       (1 - fx) * fy, fx * fy};
      for (int j = 0; j < SAMPLE_CORNERS; ++j)
        if (weights[j] > 0)
          for (int c = 0; c < odor_channel_count; ++c)
            plane[(targets[j] - offset) * odor_channel_count + c] +=
                float(weights[j] * p.odor[at * odor_channel_count + c]);
    }
  });
  if (tiles > 1)
    for (const auto &plane : planes)
      for (std::size_t i = 0; i < plane.values.size(); ++i)
        moved[plane.first * odor_channel_count + i] += plane.values[i];
  auto fade = env_.odor_lifetimes();
  for (auto &v : fade)
    v = std::exp(-1. / v);
  const double mixing = std::min(MAX_DIFFUSION_SHARE, env_.odor_mixing / area);
  partition([&](auto first, auto end, auto) {
    for (auto at = first; at < end; ++at) {
      std::array<double, odor_channel_count> value{};
      double retained = 1;
      for (int d = 0; d < cell_side::count; ++d)
        if (linked(at, d)) {
          const auto n = neighbor(at, d);
          retained -= mixing;
          for (int c = 0; c < odor_channel_count; ++c)
            value[c] += mixing * moved[n * odor_channel_count + c];
        }
      for (int c = 0; c < odor_channel_count; ++c) {
        const double v = fade[c] * (value[c] + retained * moved[at * odor_channel_count + c]);
        p.odor[at * odor_channel_count + c] = v >= 1e-9 ? float(v) : 0.f;
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
  // The halo supports both the derivative and the safer neighboring destination.
  // Expand each occupied row horizontally once, then combine neighboring rows.
  // Dense swarms no longer mark the same neighborhood for every single cell.
  thread_local std::vector<unsigned char> horizontal;
  horizontal.resize(p.energy.size());
  for (int y = 0; y < ny; ++y) {
    const auto *energy = p.energy.data() + y * nx;
    int occupied = 0;
    for (int x = -FLOW_HALO; x <= FLOW_HALO; ++x)
      occupied += energy[(x % nx + nx) % nx] > 1e-9;
    int leaving = (nx - FLOW_HALO % nx) % nx, entering = (FLOW_HALO + 1) % nx;
    for (int x = 0; x < nx; ++x) {
      horizontal[y * nx + x] = occupied > 0;
      occupied += int(energy[entering] > 1e-9) - int(energy[leaving] > 1e-9);
      if (++leaving == nx)
        leaving = 0;
      if (++entering == nx)
        entering = 0;
    }
  }
  thread_local std::vector<int> occupied_rows;
  occupied_rows.assign(nx, 0);
  for (int y = 0; y < std::min(ny, FLOW_HALO + 1); ++y)
    for (int x = 0; x < nx; ++x)
      occupied_rows[x] += horizontal[y * nx + x];
  for (int y = 0; y < ny; ++y) {
    for (int x = 0; x < nx; ++x)
      p.sampled[y * nx + x] = p.open[y * nx + x] && occupied_rows[x];
    if (y >= FLOW_HALO)
      for (int x = 0; x < nx; ++x)
        occupied_rows[x] -= horizontal[(y - FLOW_HALO) * nx + x];
    if (y + FLOW_HALO + 1 < ny)
      for (int x = 0; x < nx; ++x)
        occupied_rows[x] += horizontal[(y + FLOW_HALO + 1) * nx + x];
  }
  for (int at = 0; at < nx * ny; ++at)
    if (p.sampled[at])
      p.flow[at] = water_.velocity((at % nx + .5) * dx, (at / nx + .5) * dy);
  // Scatter each fish's existing disturbance model locally; no per-particle queries.
  for (const auto &f : visible_) {
    if (f.kind != food_kind::fish || f.hidden || !f.hatched ||
        std::hypot(f.flow_x, f.flow_y) < STILL_FLOW)
      continue;
    const double reach = disturbance_reach(f.radius);
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
    const auto across = [&](int side) {
      return side_linked(link, side) ? cell_neighbor(at, side, nx) : at;
    };
    const int l = across(cell_side::left), r = across(cell_side::right), u = across(cell_side::up),
              d = across(cell_side::down);
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
  struct OccupiedShell {
    Point anchor;
    double radius;
  };
  std::vector<OccupiedShell> occupied_shells;
  if (kind == food_kind::mussel)
    for (const auto &m : food_web_.mussels) {
      if (m.energy <= 0)
        continue;
      const auto found = food_web_.patches.find(m.patch);
      if (found != food_web_.patches.end()) {
        const auto &support = vegetation_.surfaces[found->second];
        occupied_shells.push_back({{support.a.x + m.along * (support.b.x - support.a.x),
                                    support.a.y + m.along * (support.b.y - support.a.y)},
                                   mussel_bed_radius(m.morph, env_)});
      }
    }
  int placed = 0;
  const bool mussel = kind == food_kind::mussel, crab = kind == food_kind::crab;
  for (int k = 0; k < std::clamp(count, 1, placement::animal_max); ++k) {
    const double scatter = k ? radius * placement::animal_spread *
                                   std::sqrt(double(k) / std::max(1, count - 1))
                             : 0,
                 qx = wrap_x(x + std::cos(k * placement::golden_angle) * scatter),
                 qy = y +
                      std::sin(k * placement::golden_angle) * scatter * placement::animal_flatten;
    const double morph =
        requested_morph < 0
            ? rng.index(mussel ? mussel_families
                        : crab ? crab_families
                               : worm_families) +
                  rng.uniform() * placement::morph_span
            : std::floor(requested_morph) +
                  std::fmod(morph_variant(requested_morph) + k * placement::morph_step,
                            placement::morph_span);
    std::size_t site = vegetation_.surfaces.size();
    double best = std::numeric_limits<double>::infinity(), along = .5;
    for (std::size_t i = 0; i < vegetation_.surfaces.size(); ++i) {
      const auto &candidate = vegetation_.surfaces[i];
      const auto edges = sediment_edges(i);
      if (mussel ? edges[0] > seabed::bare_depth || edges[1] > seabed::bare_depth ||
                       candidate.algae_open[1] <= candidate.algae_open[0]
                 : candidate.normal.y > -seabed::floor_normal)
        continue;
      const double t = std::clamp((delta_x(qx - candidate.a.x) * (candidate.b.x - candidate.a.x) +
                                   (qy - candidate.a.y) * (candidate.b.y - candidate.a.y)) /
                                      (candidate.length * candidate.length),
                                  mussel ? candidate.algae_open[0] : 0.,
                                  mussel ? candidate.algae_open[1] : 1.),
                   px = candidate.a.x + t * (candidate.b.x - candidate.a.x),
                   py = candidate.a.y + t * (candidate.b.y - candidate.a.y),
                   distance = std::hypot(delta_x(px - qx), py - qy);
      if (kind == food_kind::worm && edges[0] * (1 - t) + edges[1] * t <= env_.burrow_depth)
        continue;
      const double depth = edges[0] * (1 - t) + edges[1] * t;
      if (!mussel &&
          !bed_site_clear(candidate, t,
                          std::max(placement::site_min_height, placement::site_depth_share * depth),
                          placement::animal_headroom))
        continue;
      if (mussel) {
        const double space = mussel_bed_radius(morph, env_);
        if (distance > radius ||
            std::any_of(occupied_shells.begin(), occupied_shells.end(), [&](const auto &other) {
              return std::hypot(delta_x(px - other.anchor.x), py - other.anchor.y) <
                     space + other.radius;
            }))
          continue;
      }
      if (distance < best) {
        best = distance;
        site = i;
        along = t;
      }
    }
    if (site == vegetation_.surfaces.size())
      break;
    auto &s = vegetation_.surfaces[site];
    const double amount = mussel ? env_.mussel_birth_energy * placement::mussel_births
                          : crab ? env_.crab_birth_energy * placement::crab_births
                                 : env_.worm_head_energy * placement::worm_heads;
    if (energy_available < amount)
      break;
    if (mussel) {
      Mussel m;
      m.id = food_web_.next_id++;
      m.patch = s.id;
      m.along = along;
      m.energy = amount;
      m.morph = morph;
      const double lift = fauna::mussel_lift * mussel_radius(amount, env_, morph);
      m.x = wrap_x(s.a.x + along * (s.b.x - s.a.x) + s.normal.x * lift);
      m.y = s.a.y + along * (s.b.y - s.a.y) + s.normal.y * lift;
      food_web_.mussels.push_back(m);
      occupied_shells.push_back({{s.a.x + along * (s.b.x - s.a.x), s.a.y + along * (s.b.y - s.a.y)},
                                 mussel_bed_radius(morph, env_)});
      s.mussel_arc += mussel_algae_share * PI * mussel_radius(amount, env_, morph);
    } else if (crab) {
      Crab c;
      c.id = food_web_.next_id++;
      c.depth = burial_share(morph_variant(morph));
      c.patch = c.target = s.id;
      c.along = along;
      c.destination = rng.uniform(CRAB_SITE_MARGIN, 1 - CRAB_SITE_MARGIN);
      c.exposure = 0;
      c.energy = amount;
      c.morph = morph;
      c.next_move = CRAB_FIRST_MOVE + c.id % CRAB_FIRST_MOVE_SPREAD;
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
                   burial = depth * burial_share(worm_individuality(h.id));
      h.base_x = wrap_x(s.a.x + along * (s.b.x - s.a.x) + s.normal.x * (depth - burial));
      h.base_y = s.a.y + along * (s.b.y - s.a.y) + s.normal.y * (depth - burial);
      const double length =
          worm_length(h.id, h.morph) *
          std::clamp((depth - env_.burrow_depth) / fauna::worm_full_depth, 0., 1.);
      const double vertical_burial = burial / std::max(seabed::floor_normal, -s.normal.y);
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
  if (kind == food_kind::plant) {
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
    cut_organ(patch, organ,
              plant.organs[organ].kind >= plant_organ::leaf ? 0
                                                            : std::clamp(along, 0., MAX_CUT_ALONG));
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
  if (kind == food_kind::worm)
    find(food_web_.heads);
  else if (kind == food_kind::crab)
    find(food_web_.crabs);
  else if (kind == food_kind::mussel)
    find(food_web_.mussels);
  else
    return false;
  auto meal = take_small_animal(kind, index, std::numeric_limits<double>::infinity(), true, true);
  if (!meal)
    return false;
  scatter_fragments(*meal, MOUSE_FORCE, MOUSE_SCATTER);
  return true;
}
bool Field::bite_target(std::uint64_t id, int organ, double along) {
  for (std::size_t i = 0; i < vegetation_.plants.size(); ++i) {
    const auto &part = vegetation_.plants[i];
    if (part.kind != food_kind::plant || part.organ != organ || part.energy <= 0 ||
        plant_id(part.patch) != id)
      continue;
    // The stroke of this organ that covers the picked position.
    const double lo = stroke_along(part, -1), hi = stroke_along(part, 1);
    if (along < std::min(lo, hi) - 1e-6 || along > std::max(lo, hi) + 1e-6)
      continue;
    Body b{};
    b.alive = b.hatched = true;
    b.health = 1;
    b.tissue = MOUSE_TISSUE * BODY_TISSUE;
    b.bite_signal = 1;
    b.bite_strength = MOUSE_BITE_STRENGTH;
    b.jaw_length = MOUSE_JAW;
    b.blunt_teeth = TRAIT_MIDDLE;
    b.force_scale = default_max_bite_force;
    const double s = hi != lo ? std::clamp(2 * (along - lo) / (hi - lo) - 1, -1., 1.) : 0.;
    // Without a fish the bitten side alternates.
    if (auto piece = bite_plant(b, i, s, (time + id) % 2 ? 1. : -1.)) {
      append_fragment(*piece);
      index_plants();
      return true;
    }
    return false;
  }
  return false;
}
bool Field::encourage_target(int kind, std::uint64_t id, unsigned steps) {
  if (!steps || steps > GrowthBoost::max_steps)
    return false;
  if (kind == food_kind::plant) {
    for (auto &s : vegetation_.surfaces)
      if (s.id == id && s.stump) {
        const double growth = std::min({energy_available, std::max(0., grass_capacity(s) - s.grass),
                                        GrowthBoost::grass * env_.grass_capacity});
        const bool young = std::any_of(s.organs.begin(), s.organs.end(), [&](const auto &o) {
          return o.energy > 0 && o.elongation < 1 &&
                 (o.kind == plant_organ::blade ||
                  (grass_form(s) == 1 && o.kind >= plant_organ::leaf));
        });
        // A full plant still grows on by putting out new organs, funded from its old ones.
        const bool budding = s.organs.size() < MAX_PLANT_ORGANS && s.vitality > BUDDING_VITALITY;
        if (growth <= 0 && !young && !budding)
          return false;
        s.boost_until = time + steps;
        // Buds that are still waiting emerge sooner.
        for (auto &o : s.organs)
          if (o.energy <= 0 && o.ready > time)
            o.ready = time + std::uint64_t((o.ready - time) / GrowthBoost::budding);
        s.grass += growth;
        energy_available -= growth;
        prepare_organs(s);
        for (auto &o : s.organs)
          if (o.energy > 0)
            o.elongation = std::min(1., o.elongation + (o.kind == plant_organ::blade
                                                            ? GrowthBoost::blade_elongation
                                                            : GrowthBoost::leaf_elongation));
        index_plants();
        return true;
      }
  } else if (kind == food_kind::worm) {
    for (auto &h : food_web_.heads)
      if (h.id == id && h.energy > 0) {
        h.withdrawing = false;
        h.duration = std::max(h.duration, h.age + std::uint64_t(env_.worm_head_time));
        return true;
      }
  } else if (kind == food_kind::crab) {
    for (auto &c : food_web_.crabs)
      if (c.id == id && c.energy > 0) {
        c.state = crab_state::foraging;
        c.digging = 0;
        c.path.clear();
        c.target = c.patch;
        c.destination = c.along;
        c.next_move = c.age + std::uint64_t(env_.crab_move_interval_max);
        return true;
      }
  } else if (kind == food_kind::mussel) {
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
      c.state = crab_state::fleeing;
      c.digging = 0;
      c.direction = away >= 0 ? 1 : -1;
      c.path.clear();
      c.destination = away > 0 || (std::abs(away) < 1e-6 && rng.uniform() < .5)
                          ? 1 - CRAB_END_MARGIN
                          : CRAB_END_MARGIN;
      c.target = c.patch;
      c.next_move = c.age + CRAB_HIDE_TIME + c.id % CRAB_HIDE_SPREAD;
    }
  for (auto &m : food_web_.mussels)
    if (std::hypot(delta_x(m.x - x), m.y - y) <= radius)
      m.closed = std::max(m.closed, int(env_.mussel_close_time));
}
double Field::feed_crabs(double x, double y, double energy, double radius) {
  double eaten = 0;
  for (auto &c : food_web_.crabs) {
    if (c.energy <= 0 || c.exposure <= CRAB_FEEDING_EXPOSURE ||
        std::hypot(delta_x(c.x - x), c.y - y) > radius + crab_radius(c.energy, env_, c.morph))
      continue;
    const double capacity = crab_capacity(c.morph, env_),
                 amount = std::min({energy - eaten, std::max(0., capacity - c.energy),
                                    capacity / env_.crab_mature});
    c.energy += amount;
    eaten += amount;
    if (amount > 0)
      c.feeding = {amount, x, y, food_kind::carrion, CRAB_FEEDING_STEPS};
    if (eaten >= energy)
      break;
  }
  return eaten;
}
void Field::sync_food_web() {
  // Biomass uses a coarse water field; individual crustaceans are a display effect.
  const double cell =
      std::max(PLANKTON_CELL_MIN, std::sqrt(geometry_.width * geometry_.height / PLANKTON_CELLS));
  const int nx = int(std::ceil(geometry_.width / cell)),
            ny = int(std::ceil(geometry_.height / cell));
  auto &p = food_web_.plankton;
  if (p.columns == nx && p.rows == ny && p.width == geometry_.width &&
      p.height == geometry_.height && food_web_.geometry == environment_signature &&
      !p.open.empty() && food_web_.neighbor_gap == env_.crab_edge_gap &&
      food_web_.neighbors.size() == vegetation_.surfaces.size() &&
      food_web_.patches.size() == vegetation_.surfaces.size())
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
  p.odor.assign(std::size_t(nx) * ny * odor_channel_count, 0.f);
  for (int j = 0; j < old_ny; ++j)
    for (int i = 0; i < old_nx; ++i) {
      const auto to =
          std::size_t(std::min(ny - 1, j * ny / old_ny) * nx + std::min(nx - 1, i * nx / old_nx));
      for (int c = 0; c < odor_channel_count; ++c)
        if (old_odor.size() == std::size_t(old_nx) * old_ny * odor_channel_count)
          p.odor[to * odor_channel_count + c] +=
              old_odor[(std::size_t(j) * old_nx + i) * odor_channel_count + c] *
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
      for (int d = 0; d < cell_side::count; ++d) {
        const int x = (i + side_dx(d) + nx) % nx, y = j + side_dy(d);
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
  auto &patches = food_web_.patches;
  patches.clear();
  for (std::size_t i = 0; i < neighbors.size(); ++i) {
    const auto &s = vegetation_.surfaces[i];
    patches.emplace(s.id, i);
    auto c = surface_midpoint(s);
    vegetation_.surface_grid.nearby(
        c.x, c.y, s.length + env_.crab_edge_gap + SURFACE_SEARCH_MARGIN, [&](std::uint32_t j) {
          if (i == j)
            return;
          const auto &q = vegetation_.surfaces[j];
          if (q.normal.y > -CRAB_FOOTING)
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
  for (const auto &m : food_web_.mussels) {
    const auto found = patches.find(m.patch);
    if (found != patches.end() && m.energy > 0)
      vegetation_.surfaces[found->second].mussel_arc +=
          mussel_algae_share * PI * mussel_radius(m.energy, env_, m.morph);
  }
  food_web_.geometry = environment_signature;
}
bool Field::threatens(const VisibleBody &f, double x, double y, double radius, double body,
                      double speed) const {
  return f.kind == food_kind::fish && f.relative_speed > speed &&
         std::hypot(delta_x(f.x - x), f.y - y) < radius + body * f.radius;
}
const VisibleBody *Field::danger_near(double x, double y, double radius, double body,
                                      double speed) const {
  const VisibleBody *nearest = nullptr;
  double best = std::numeric_limits<double>::infinity();
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
          ? std::size_t(std::clamp(std::round(p.water_area / env_.plankton_seed_area), 1.,
                                   MAX_PLANKTON_SOURCES))
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
    for (int trial = 0; trial < SOURCE_TRIALS; ++trial) {
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
  for (int k = 0; k < SAMPLE_CORNERS; ++k)
    sum += s.weight[k] * p.energy[s.index[k]];
  return sum * p.columns * p.rows / (p.width * p.height);
}
double Field::consume_plankton(double x, double y, double area, double maximum) {
  auto &p = food_web_.plankton;
  if (p.energy.empty() || area <= 0)
    return 0;
  const auto s = sample(*this, x, y);
  const double fraction = area * p.columns * p.rows / (p.width * p.height);
  std::array<double, SAMPLE_CORNERS> weights = s.weight, take{};
  double proposed = 0;
  for (int k = 0; k < SAMPLE_CORNERS; ++k) {
    for (int j = k + 1; j < SAMPLE_CORNERS; ++j)
      if (s.index[j] == s.index[k]) {
        weights[k] += weights[j];
        weights[j] = 0;
      }
    take[k] = p.energy[s.index[k]] * std::min(1., fraction * weights[k]);
    proposed += take[k];
  }
  const double scale = proposed > 0 ? std::min(1., std::max(0., maximum) / proposed) : 0;
  double total = 0;
  for (int k = 0; k < SAMPLE_CORNERS; ++k) {
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
      x, y, sediment_.max_sediment_depth + radius + SURFACE_SEARCH_MARGIN, [&](std::uint32_t i) {
        const auto &s = vegetation_.surfaces[i];
        if (s.normal.y > -seabed::floor_normal || sediment_depth(s) < env_.burrow_depth)
          return;
        const double px = delta_x(x - s.a.x), py = y - s.a.y,
                     t = (px * (s.b.x - s.a.x) + py * (s.b.y - s.a.y)) / (s.length * s.length),
                     gap = px * s.normal.x + py * s.normal.y;
        if (t < 0 || t > 1 || gap < -radius || gap > sediment_depth(s) + radius + SURFACE_TOLERANCE)
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
  if (p.energy[at] < PLANKTON_RETURN_MIN * cap || !plankton_water_cell(at))
    return 0;
  const double amount = std::min(available, std::max(0., PLANKTON_RETURN_MAX * cap - p.energy[at]));
  const double taken = std::min(
      amount, available < PLANKTON_RETURN_WHOLE ? available : available * PLANKTON_RETURN_RATE);
  p.energy[at] += taken;
  if (taken > 0) {
    auto &traces = food_web_.grazing;
    auto found = std::find_if(traces.begin(), traces.end(), [&](const auto &q) {
      return std::hypot(delta_x(q.x - x), q.y - y) < GRAZING_TRACE_CELL;
    });
    if (found != traces.end()) {
      found->amount += taken;
      found->radius = std::max(found->radius, radius);
    } else if (traces.size() < MAX_GRAZING_TRACES)
      traces.push_back({x, y, radius, taken});
  }
  return taken;
}
double Field::graze_bed(double x, double y, double radius, double area, double maximum) {
  const double contact = std::clamp((sediment_immersion(x, y, radius) - GRAZE_IMMERSION) /
                                        (env_.burial_cover - GRAZE_IMMERSION),
                                    0., 1.);
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
std::array<double, animal_store::count> Field::small_animal_stores() const {
  namespace A = animal_store;
  std::array<double, A::count> stores{};
  stores[A::plankton] =
      std::accumulate(food_web_.plankton.energy.begin(), food_web_.plankton.energy.end(), 0.);
  for (const auto &s : vegetation_.surfaces) {
    stores[A::worms] += s.worms;
    stores[A::detritus] += s.detritus;
  }
  for (const auto &v : food_web_.heads)
    stores[A::worms] += v.energy;
  for (const auto &v : food_web_.crabs)
    stores[A::crabs] += v.energy;
  for (const auto &v : food_web_.mussels)
    stores[A::mussels] += v.energy;
  for (int k = 0; k < A::animals; ++k)
    stores[k] += loose_energy(store_food_kind(k));
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
    add(v.x, v.y, v.energy, worm_head_radius, food_kind::worm, i,
        small_animal_color(food_kind::worm));
    out.back().id = v.id;
    out.back().odor_channel = odor_kind::benthos;
    out.back().odor_energy = v.energy * odor_maturity(v.age, env_);
  }
  for (std::size_t i = 0; i < food_web_.crabs.size(); ++i) {
    const auto &v = food_web_.crabs[i];
    if (v.energy <= 0)
      continue;
    add(v.x, v.y, v.energy, crab_radius(v.energy, env_, v.morph), food_kind::crab, i,
        small_animal_color(food_kind::crab));
    out.back().id = v.id;
    out.back().hidden = v.state == crab_state::buried;
    out.back().odor_channel = odor_kind::benthos;
    out.back().odor_energy =
        v.energy *
        (v.state != crab_state::buried ? odor_maturity(v.exposed_age, env_) : env_.buried_odor);
  }
  for (std::size_t i = 0; i < food_web_.mussels.size(); ++i) {
    const auto &v = food_web_.mussels[i];
    if (v.energy <= 0)
      continue;
    add(v.x, v.y, v.energy, mussel_radius(v.energy, env_, v.morph), food_kind::mussel, i,
        small_animal_color(food_kind::mussel));
    out.back().id = v.id;
    out.back().odor_channel = odor_kind::mussels;
    out.back().odor_energy = v.energy;
  }
}
void Field::scatter_fragments(const SmallAnimalMeal &meal, double force, double spread) {
  const double impulse = std::sqrt(std::max(0., force) / std::max(MIN_HARDNESS, meal.hardness)),
               burst = spread * std::clamp(impulse, BURST_MIN, BURST_MAX),
               reach = std::max(SCATTER_REACH, meal.radius) * burst;
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
      shape.y = meal.y + std::sin(angle) * distance * (on_bed ? BED_FLATTEN : 1);
      collide(shape, meal.x, meal.y, radius);
      Food piece{shape.x,
                 shape.y,
                 SCATTER_SPEED * burst * std::cos(angle),
                 SCATTER_SPEED * burst * std::sin(angle),
                 0,
                 amount};
      piece.origin = origin;
      piece.radius = radius;
      piece.initial_energy = amount;
      piece.color = color;
      piece.hardness = origin == food_kind::algae ? hardness : 0;
      piece.buoyancy = FRAGMENT_BUOYANCY;
      piece.bitten = true;
      append_fragment(piece);
    }
  };
  scatter(meal.energy, meal.origin, meal.color, meal.hardness);
  scatter(meal.algae_energy, food_kind::algae, ALGAE_COLOR, env_.hardness_algae);
}
void Field::release_excess_algae(SurfacePatch &s) {
  const double excess = std::max(0., s.algae - algae_capacity(s));
  if (excess <= 0)
    return;
  s.algae -= excess;
  SmallAnimalMeal algae;
  const auto mid = surface_midpoint(s);
  algae.x = wrap_x(mid.x + s.normal.x);
  algae.y = mid.y + s.normal.y;
  algae.radius = SCATTER_REACH;
  algae.algae_energy = excess;
  scatter_fragments(algae, env_.hardness_algae);
}
std::optional<SmallAnimalMeal> Field::take_small_animal(int kind, std::size_t index, double force,
                                                        bool biting, bool buried) {
  SmallAnimalMeal meal;
  meal.origin = kind;
  double *energy = nullptr;
  if (kind == food_kind::worm && index < food_web_.heads.size() && biting) {
    auto &v = food_web_.heads[index];
    energy = &v.energy;
    meal.x = v.x;
    meal.y = v.y;
    meal.radius = worm_head_radius;
    meal.color = WORM_FLESH_COLOR;
  } else if (kind == food_kind::crab && index < food_web_.crabs.size() && biting) {
    auto &v = food_web_.crabs[index];
    if (v.state == crab_state::buried && !buried)
      return {};
    energy = &v.energy;
    meal.x = v.x;
    meal.y = v.y;
    meal.radius = crab_radius(v.energy, env_, v.morph);
    meal.hardness =
        env_.hardness_crab + env_.hardness_crab_growth * v.energy / crab_capacity(v.morph, env_);
    meal.color = CRAB_FLESH_COLOR;
  } else if (kind == food_kind::mussel && index < food_web_.mussels.size() && biting) {
    auto &v = food_web_.mussels[index];
    energy = &v.energy;
    meal.x = v.x;
    meal.y = v.y;
    meal.radius = mussel_radius(v.energy, env_, v.morph);
    meal.hardness = env_.hardness_mussel +
                    env_.hardness_mussel_growth * v.energy / mussel_capacity(v.morph, env_);
    if (v.closed)
      meal.hardness *= CLOSED_SHELL_HARDNESS;
    meal.color = MUSSEL_FLESH_COLOR;
  }
  if (!energy || *energy <= 0 ||
      (kind != food_kind::worm && rng.uniform() >= crack_success(force, meal.hardness, env_)))
    return {};
  meal.energy = *energy;
  *energy = 0;
  if (kind == food_kind::crab) {
    const auto &c = food_web_.crabs[index];
    for (int k = 0; k < CRAB_PLATES; ++k) {
      if (food_web_.shells.size() >= MAX_EMPTY_SHELLS)
        food_web_.shells.erase(food_web_.shells.begin());
      const int offset = k - CRAB_PLATES / 2;
      food_web_.shells.push_back({food_web_.next_id++,
                                  wrap_x(c.x + offset * meal.radius * CRAB_PLATE_SPACING), c.y,
                                  meal.radius * (CRAB_PLATE_SIZE + CRAB_PLATE_GROWTH * k),
                                  fauna::crab_shell_morph + c.morph, offset * CRAB_PLATE_TILT, 0});
    }
  }
  if (kind == food_kind::mussel) {
    const auto &m = food_web_.mussels[index];
    if (food_web_.shells.size() >= MAX_EMPTY_SHELLS)
      food_web_.shells.erase(food_web_.shells.begin());
    food_web_.shells.push_back({food_web_.next_id++, m.x, m.y, meal.radius, m.morph, 0, 0});
    for (auto &s : vegetation_.surfaces)
      if (s.id == m.patch) {
        const double arc = std::min(s.mussel_arc, mussel_algae_share * PI * meal.radius),
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
