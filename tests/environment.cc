#include "test_support.hh"
#include <numeric>

using namespace test;
namespace {
void changing_light_cache() {
  auto w = small_world(330), other = small_world(331);
  auto &f = w.field;
  auto &q = other.field;
  Rng random(332);
  Field spacer(333, 0);
  StateAccess::geometry(spacer).width = StateAccess::geometry(spacer).height = 24;
  StateAccess::lighting(spacer).columns = StateAccess::lighting(spacer).rows = 2;
  StateAccess::lighting(spacer).illumination.assign(4, 1);
  StateAccess::lighting(spacer).clear_illumination = StateAccess::lighting(spacer).illumination;
  StateAccess::lighting(spacer).canopy_density.assign(4, .2);
  StateAccess::sediment(spacer).columns = StateAccess::sediment(spacer).rows = 1;
  StateAccess::sediment(spacer).suspended.assign(1, 0);
  for (int step : {0, 1, 2, 13, 17, 18, 26}) {
    auto &field = step % 3 ? f : q;
    if (step % 13 == 0) {
      std::fill(StateAccess::sediment(field).suspended.begin(),
                StateAccess::sediment(field).suspended.end(), 0.);
      StateAccess::lighting(field).canopy_density.assign(
          StateAccess::lighting(field).illumination.size(), 0.);
    } else {
      StateAccess::sediment(field)
          .suspended[random.index(StateAccess::sediment(field).suspended.size())] =
          random.uniform(0, 5);
      StateAccess::lighting(field).canopy_density.resize(
          StateAccess::lighting(field).illumination.size());
      StateAccess::lighting(field)
          .canopy_density[random.index(StateAccess::lighting(field).canopy_density.size())] =
          random.uniform(0, 2);
    }
    if (step % 17 == 0)
      StateAccess::env(field).sediment_path = 20 + step;
    auto expected = field;
    field.update_sediment_light();
    // A different grid discards all incremental depths. The second calculation
    // must rebuild the same physical lighting from the complete density field.
    StateAccess::lighting(spacer).shading_density.clear();
    spacer.update_sediment_light();
    StateAccess::lighting(expected).shading_density.clear();
    expected.update_sediment_light();
    check(StateAccess::lighting(field).illumination ==
                  StateAccess::lighting(expected).illumination &&
              StateAccess::lighting(field).shading_factor ==
                  StateAccess::lighting(expected).shading_factor,
          "incremental light stays exact when density moves, clears or alternates between worlds");
  }
}

void raster_caches() {
  auto w = small_world(213);
  w.wall(40, 160, 280, 220, 10);
  auto &f = w.field;
  auto masks = [&]() {
    f.sync_environment();
    const double dx = StateAccess::geometry(f).width / StateAccess::sediment(f).columns,
                 dy = StateAccess::geometry(f).height / StateAccess::sediment(f).rows;
    for (int y = 0; y < StateAccess::sediment(f).rows; ++y)
      for (int x = 0; x < StateAccess::sediment(f).columns; ++x) {
        auto at = y * StateAccess::sediment(f).columns + x;
        const double px = (x + .5) * dx, py = (y + .5) * dy;
        double best = f.geometry().height + 1;
        std::size_t support = 0;
        for (std::size_t k = 0; k < f.vegetation().surfaces.size(); ++k) {
          const auto &s = f.vegetation().surfaces[k];
          const double ax = px + f.delta_x(s.a.x - px), bx = ax + s.b.x - s.a.x;
          if (s.normal.y > -.5 || px < std::min(ax, bx) - .001 || px > std::max(ax, bx) + .001)
            continue;
          const double t = std::abs(bx - ax) > 1e-12 ? (px - ax) / (bx - ax) : .5;
          const double sy = s.a.y + t * (s.b.y - s.a.y);
          if (sy >= py && sy < best) {
            best = sy;
            support = k;
          }
        }
        check(StateAccess::sediment(f).sediment_floor[at] == support,
              "column supports agree with direct geometry after edits and resizing");
        check(bool(StateAccess::sediment(f).sediment_open[at]) ==
                  f.free((x + .5) * dx, (y + .5) * dy, 0),
              "sediment target mask matches exact geometry");
        check(bool(StateAccess::sediment(f).sediment_safe[at]) ==
                  f.free((x + .5) * dx, (y + .5) * dy, .5 * std::hypot(dx, dy)),
              "sediment interior mask stays conservative");
      }
  };
  masks();
  std::vector<std::array<double, 2>> edges;
  for (std::size_t i = 0; i < f.vegetation().surfaces.size(); ++i)
    edges.push_back(f.sediment_edges(i));
  {
    Field::SedimentReadScope reading(f);
    for (std::size_t i = 0; i < edges.size(); ++i)
      check(f.sediment_edges(i) == edges[i], "read scope retains smoothed sediment geometry");
  }
  StateAccess::vegetation(f).surfaces[0].sediment += 40;
  check(f.sediment_edges(0) != edges[0], "the read scope cannot hide later sediment changes");
  check(w.move_obstacle(160, 190, 200, 220, .2), "move cached geometry");
  masks();
  w.resize(720, 480);
  masks();
  for (double speed : {0., 3., 7., 12., -20.}) {
    auto fast = f, reference = f;
    StateAccess::water(fast).update(f);
    StateAccess::water(fast).u.assign(StateAccess::water(fast).u.size(), speed);
    StateAccess::water(fast).v.assign(StateAccess::water(fast).v.size(), -.7 * speed);
    StateAccess::water(reference) = StateAccess::water(fast);
    for (std::size_t i = 0; i < StateAccess::sediment(fast).suspended.size(); ++i)
      StateAccess::sediment(fast).suspended[i] = StateAccess::sediment(reference).suspended[i] =
          i % 11 == 0 ? .5 : 0;
    std::fill(StateAccess::sediment(reference).sediment_safe.begin(),
              StateAccess::sediment(reference).sediment_safe.end(), 0);
    for (int k = 0; k < 8; ++k) {
      fast.advance_sediment();
      reference.advance_sediment();
      check(StateAccess::sediment(fast).suspended == StateAccess::sediment(reference).suspended,
            "interior shortcut preserves exact transport across seams and fast currents");
      for (std::size_t j = 0; j < StateAccess::vegetation(fast).surfaces.size(); ++j)
        check(StateAccess::sediment(StateAccess::vegetation(fast).surfaces[j]) ==
                  StateAccess::sediment(StateAccess::vegetation(reference).surfaces[j]),
              "interior shortcut preserves exact bed exchange");
    }
  }
  for (int k = 0; k < 4; ++k) {
    ++f.time;
    auto rebuilt = StateAccess::water(f);
    rebuilt.geometry_signature = rebuilt.stencil_signature = 0;
    rebuilt.neighbor_weight.clear();
    rebuilt.previous_u.clear();
    rebuilt.previous_v.clear();
    rebuilt.update(f);
    StateAccess::water(f).update(f);
    check(rebuilt.u == StateAccess::water(f).u && rebuilt.v == StateAccess::water(f).v,
          "cached water stencils and reused buffers preserve the solver exactly");
  }
  auto reference = w.fork();
  w.profile_steps = true;
  w.tick(false);
  reference.tick(false);
  check(saved(w) == saved(reference), "phase timing changes no simulation state");
  check(std::accumulate(w.step_ms.begin(), w.step_ms.end(), 0.) > 0,
        "phase timing records the complete step");
}

void cached_plant_geometry_and_light() {
  auto w = small_world(306);
  auto &f = w.field;
  check(w.wall(200, 150, 430, 190, 12), "plant cache wall");
  f.seed_plants();
  for (auto &p : StateAccess::vegetation(f).surfaces)
    if (p.stump)
      p.grass = 0.25 * EnvironmentParameters{}.grass_capacity;
  f.index_plants();
  auto reference = f;
  // Disable the spatial shortcut, retaining the same exact obstacle geometry.
  StateAccess::geometry(reference).indexed_shapes =
      StateAccess::geometry(reference).obstacles.size() + 1;
  reference.index_plants();
  check(StateAccess::vegetation(f).plants.size() ==
            StateAccess::vegetation(reference).plants.size(),
        "geometry shortcut preserves all contact samples");
  for (std::size_t i = 0; i < StateAccess::vegetation(f).plants.size(); ++i) {
    const auto &a = StateAccess::vegetation(f).plants[i];
    const auto &b = StateAccess::vegetation(reference).plants[i];
    check(
        a.x == b.x && a.y == b.y && a.radius == b.radius && a.energy == b.energy,
        "free control hulls give exactly the same full-width leaf geometry as exact wall queries");
  }
  for (double mass : {0., .1, 2., 0.}) {
    std::fill(StateAccess::sediment(f).suspended.begin(), StateAccess::sediment(f).suspended.end(),
              mass);
    f.update_sediment_light();
    auto expected = StateAccess::lighting(f).illumination;
    f.update_sediment_light();
    check(StateAccess::lighting(f).illumination == expected,
          "reusing optical density preserves the complete light field");
    StateAccess::lighting(f).shading_density.clear();
    StateAccess::lighting(f).shading_factor.clear();
    f.update_sediment_light();
    check(StateAccess::lighting(f).illumination == expected,
          "cached and rebuilt leaf and cloud shadows are bit-identical");
  }
  auto cached = w.fork(), rebuilt = w.fork();
  for (int k = 0; k < 20; ++k) {
    cached.tick(false);
    StateAccess::lighting(rebuilt.field).shading_density.clear();
    StateAccess::lighting(rebuilt.field).shading_factor.clear();
    rebuilt.tick(false);
  }
  check(saved(cached) == saved(rebuilt),
        "shadow caching changes no simulation state over repeated steps");
}

void selective_plant_refresh() {
  auto w = small_world(717);
  auto &f = w.field;
  const std::size_t a = 6, b = 12;
  for (std::size_t i = 0; i < StateAccess::vegetation(f).surfaces.size(); ++i) {
    auto &s = StateAccess::vegetation(f).surfaces[i];
    StateAccess::sediment(s) = 80;
    s.stump = i == a || i == b;
    s.grass = s.stump ? 160 : 0;
    s.grass_traits = {.4, .6, .7, .45};
  }
  f.index_plants();
  f.time = 0;
  while (f.time % 5 == StateAccess::vegetation(f).surfaces[a].id % 5 ||
         f.time % 5 == StateAccess::vegetation(f).surfaces[b].id % 5)
    ++f.time;
  auto previous = StateAccess::vegetation(f).surfaces[b].organs.front().draw_curve;
  f.cut_organ(a, 0, .5);
  check(StateAccess::vegetation(f).plant_geometry_cache[a].empty() &&
            !StateAccess::vegetation(f).plant_geometry_cache[b].empty(),
        "cutting invalidates only the affected rooted plant");
  f.index_plants(true, true);
  check(!StateAccess::vegetation(f).plant_geometry_cache[a].empty(),
        "a cut plant is rebuilt immediately outside its scheduled phase");
  const auto &retained = StateAccess::vegetation(f).surfaces[b].organs.front().draw_curve;
  for (int k = 0; k < 4; ++k)
    check(previous[k].x == retained[k].x && previous[k].y == retained[k].y,
          "unaffected plants keep their scheduled geometry after a neighbouring cut");
  auto copy = w.fork();
  check(saved(w) == saved(copy),
        "selectively refreshed geometry resumes exactly from its checkpoint");
  for (int k = 0; k < 3; ++k) {
    f.index_plants(true, true);
    for (auto &geometry : StateAccess::vegetation(copy.field).plant_geometry_cache)
      geometry.canopy_ready = false;
    copy.field.index_plants(true, true);
    check(saved(w) == saved(copy),
          "cached canopy cells preserve geometry and illumination exactly");
  }

  // A growing bud is visible immediately, even outside the ten-step shape pass.
  auto &plant = StateAccess::vegetation(f).surfaces[b];
  PlantOrgan bud;
  bud.attach = .5;
  bud.root = plant.organs.front().root;
  bud.energy = bud.target = 1;
  plant.organs.push_back(bud);
  plant.grass += bud.energy;
  f.index_plants(true, true);
  const auto &grown = plant.organs.back();
  check(grown.display_width > 0 && grown.draw_curve[0].y > 100,
        "a new organ gets its rooted coordinates before becoming visible");
  bool indexed = false;
  for (const auto &part : StateAccess::vegetation(f).plant_geometry_cache[b].parts)
    indexed |= part.organ == int(plant.organs.size() - 1);
  check(indexed, "a new visible organ participates in the same contact geometry");
  for (int k = 0; k < 4; ++k)
    check(std::hypot(grown.draw_curve[k].x - grown.draw_curve[0].x,
                     grown.draw_curve[k].y - grown.draw_curve[0].y) < 300,
          "new plant control points remain near their root");
}

void editor_environment_palette() {
  Field f(96, 0);
  f.flow = 0;
  StateAccess::env(f).light_bottom = StateAccess::env(f).light_shadow = 1;
  f.sync_environment();
  auto &s = StateAccess::vegetation(f).surfaces[8];
  const double x = (s.a.x + s.b.x) / 2, y = (s.a.y + s.b.y) / 2;
  check(f.edit_environment("sediment", x, y, 2, -1, 2),
        "editor can paint a specified sediment thickness");
  check(near(4 * StateAccess::sediment(s) / s.length, 2), "sediment brush uses pixel layer height");
  for (int type = 0; type < 6; ++type) {
    StateAccess::sediment(s) = 100;
    s.stump = false;
    s.grass = 0;
    s.organs.clear();
    check(f.edit_environment("grass", x, y, 2, type),
          "editor plants every one of the six plant families");
    check(grass_type(s) == type && s.grass < .1 * f.grass_capacity(s),
          "plant palette preserves the chosen family and starts with a small shoot");
  }
  s.stump = false;
  s.grass = StateAccess::sediment(s) = s.algae = 0;
  s.organs.clear();
  f.index_plants();
  check(f.edit_environment("algae", x, y, 2) && s.algae > 0,
        "editor seeds thin algae on free illuminated surfaces");
  StateAccess::sediment(s) = .02 * s.length;
  check(f.edit_environment("algae", x, y, 2),
        "a subpixel dust film leaves the upper rock surface available for algae");
  check(s.sediment == 0, "invisible sediment films are removed from the actual bed");
  const double before = s.algae;
  StateAccess::sediment(s) = 10;
  check(!f.edit_environment("algae", x, y, 2) && s.algae == before,
        "editor cannot seed algae through sediment");
}

void loose_plant_rest_lengths() {
  auto w = small_world(326);
  auto &f = w.field;
  auto &s = StateAccess::vegetation(f).surfaces[8];
  s.stump = true;
  s.grass = 0.3125 * EnvironmentParameters{}.grass_capacity;
  StateAccess::sediment(s) = 80;
  f.index_plants();
  f.uproot(s);
  check(!StateAccess::vegetation(f).drifting_grass.empty(), "loose plant fixture");
  auto &d = StateAccess::vegetation(f).drifting_grass.back();
  d.root_contact = -1;
  double origin = d.plant.organs[0].curve[0].x, root_y = d.plant.organs[0].curve[0].y;
  d.x = .1;
  d.y = 160;
  for (auto &o : d.plant.organs) {
    for (auto &q : o.curve) {
      q.x += StateAccess::geometry(f).width + .1 - origin;
      q.y = 160 + (q.y - root_y);
    }
    o.loose_length = 0;
  }
  f.advance_grass();
  for (const auto &o : StateAccess::vegetation(f).drifting_grass.back().plant.organs) {
    double span = 0;
    for (int k = 1; k < 4; ++k)
      span += std::hypot(o.curve[k].x - o.curve[k - 1].x, o.curve[k].y - o.curve[k - 1].y);
    check(span <= o.loose_length * 1.016,
          "loose plant cannot gain tank-width segments across the periodic border");
  }
  for (int k = 0; k < 12 && !StateAccess::vegetation(f).drifting_grass.empty(); ++k) {
    f.advance_grass();
  }
  for (const auto &p : StateAccess::vegetation(f).drifting_grass)
    for (const auto &o : p.plant.organs) {
      double span = 0;
      for (int k = 1; k < 4; ++k)
        span += std::hypot(o.curve[k].x - o.curve[k - 1].x, o.curve[k].y - o.curve[k - 1].y);
      check(span <= o.loose_length * 1.016,
            "loose organs retain their released length while drifting and colliding");
    }
}

void released_plant_dimensions() {
  for (double size : {48., 96., 128.})
    for (int type = 0; type < 6; ++type) {
      auto w = small_world(334);
      auto &f = w.field;
      w.set_parameter("grass_length", size);
      auto &s = StateAccess::vegetation(f).surfaces[12];
      StateAccess::sediment(s) = 80;
      s.stump = true;
      s.grass_traits = {.4, .6, .7, (type + .5) / 6.};
      s.grass = f.env().grass_capacity;
      f.index_plants();
      const auto organs = s.organs;
      const double energy = f.grass_energy();
      auto point = [](const std::array<Point, 4> &q, double t) {
        double u = 1 - t;
        return Point{u * u * u * q[0].x + 3 * u * u * t * q[1].x + 3 * u * t * t * q[2].x +
                         t * t * t * q[3].x,
                     u * u * u * q[0].y + 3 * u * u * t * q[1].y + 3 * u * t * t * q[2].y +
                         t * t * t * q[3].y};
      };
      for (std::size_t j = 0; j < organs.size(); ++j) {
        if (organs[j].energy <= 1e-9)
          continue;
        auto bitten = f;
        bitten.cut_organ(12, int(j), .35);
        const auto &tip = bitten.vegetation().drifting_grass.back().plant.organs[0];
        check(near(bitten.grass_energy(), energy), "cutting transfers the existing plant energy");
        check(near(tip.loose_width, organs[j].display_width),
              "a cut keeps the original organ width at every configured size");
        for (double t : {0., .5, 1.}) {
          auto expected = point(organs[j].draw_curve, .35 + .65 * t), actual = point(tip.curve, t);
          check(near(actual.x, expected.x) && near(actual.y, expected.y),
                "a cut follows the exact severed section of the plant curve");
        }
      }
      f.uproot(s);
      auto &d = StateAccess::vegetation(f).drifting_grass.back();
      check(near(f.grass_energy(), energy), "uprooting preserves plant biomass at every size");
      for (std::size_t j = 0; j < organs.size(); ++j) {
        const auto &a = organs[j], &b = d.plant.organs[j];
        if (a.energy <= 1e-9)
          continue;
        check(near(a.display_width, b.loose_width),
              "released plants inherit the actual width at all configured sizes");
        for (int k = 0; k < 4; ++k)
          check(near(a.draw_curve[k].x, b.curve[k].x) && near(a.draw_curve[k].y, b.curve[k].y),
                "released plants inherit their visible curve without changing size");
      }
      // The growth control must not resize already detached material.
      const auto released = d.plant.organs;
      w.set_parameter("grass_length", 16);
      f.advance_grass();
      for (std::size_t j = 0; j < released.size(); ++j)
        check(near(d.plant.organs[j].loose_length, released[j].loose_length),
              "changing plant growth size must not shrink existing driftwood");
      f.index_plants();
      auto copy = w.fork();
      check(saved(copy) == saved(w), "released dimensions round-trip at every plant size");
    }
}
}
void plant_strokes_and_bites() {
  auto w = small_world(718);
  auto &f = w.field;
  const std::size_t a = 6;
  for (std::size_t i = 0; i < StateAccess::vegetation(f).surfaces.size(); ++i) {
    auto &s = StateAccess::vegetation(f).surfaces[i];
    StateAccess::sediment(s) = 80;
    s.stump = i == a;
    s.grass = s.stump ? 160 : 0;
    s.grass_traits = {.4, .6, .7, .45};
  }
  f.index_plants(true, true);
  auto &plant = StateAccess::vegetation(f).surfaces[a];
  check(!plant.organs.empty(), "stroke fixture grows organs");
  // Consecutive strokes of one organ share their joints, so a blade is one bent line.
  const PlantPart *previous = nullptr;
  bool joined = true, sized = true;
  for (const auto &p : StateAccess::vegetation(f).plants) {
    if (p.kind != 5 || p.patch != a)
      continue;
    sized = sized && p.width > 0 && p.radius >= stroke_half_length(p) + p.width - 1e-9 &&
            p.organ_kind == plant.organs[p.organ].kind;
    if (previous && previous->organ == p.organ)
      joined = joined && std::hypot(f.delta_x(previous->x + previous->hx - p.x + p.hx),
                                    previous->y + previous->hy - p.y + p.hy) < 1e-6;
    previous = &p;
  }
  check(sized && joined, "organs become joined strokes with their own width");
  // Foliage touches a body from its own side and covers part of it.
  for (const auto &p : StateAccess::vegetation(f).plants)
    if (p.kind == 5 && p.patch == a && stroke_half_length(p) > 1) {
      const double h = stroke_half_length(p), nx = -p.hy / h, ny = p.hx / h;
      const auto touch = f.foliage_contact(p.x + 3 * nx, p.y + 3 * ny, 4);
      check(touch.cover > 0 && touch.toward.x * nx + touch.toward.y * ny < -.5,
            "foliage touches a body from the side where it lies");
      check(f.foliage_contact(p.x + 40 * nx, p.y + 40 * ny, 4).cover < touch.cover,
            "distant foliage covers less of a body");
      check(f.foliage_contact(p.x, p.y, 8).blocked > f.foliage_contact(p.x, p.y, 1).blocked * .5 &&
                f.foliage_contact(p.x, p.y, 8).blocked > 0,
            "foliage bars a large piece across its width");
      break;
    }
  // A bite mark narrows the organ where it was made.
  int organ = 0;
  for (std::size_t j = 0; j < plant.organs.size(); ++j)
    if (plant.organs[j].energy > plant.organs[organ].energy)
      organ = int(j);
  auto width_at = [&](double t) {
    for (const auto &p : StateAccess::vegetation(f).plants)
      if (p.kind == 5 && p.patch == a && p.organ == organ && p.along_from <= t && t < p.along_to)
        return p.width;
    return -1.;
  };
  const double before = width_at(.5);
  plant.organs[organ].notches[0] = {.5, .6, .05, f.time};
  StateAccess::vegetation(f).plant_geometry_cache[a].clear();
  f.index_plants(true, true);
  check(before > 0 && width_at(.5) < before * .7, "a bite mark narrows the bitten stroke");
  // Cutting splits the energy along the organ's width profile; nothing is lost.
  const auto kind = plant.organs[organ].kind;
  const double energy = plant.organs[organ].energy;
  const auto drifting = StateAccess::vegetation(f).drifting_grass.size();
  f.cut_organ(a, organ, .5);
  check(StateAccess::vegetation(f).drifting_grass.size() == drifting + 1, "a cut releases drift");
  const double kept = plant.organs[organ].energy,
               loose = StateAccess::vegetation(f).drifting_grass.back().plant.organs[0].energy;
  check(near(kept + loose, energy), "a cut conserves the organ energy");
  check(kind != 0 || loose < .5 * energy,
        "a tapering blade loses less than half beyond its middle");
}

int main() {
  try {

    changing_light_cache();
    raster_caches();
    cached_plant_geometry_and_light();
    selective_plant_refresh();
    editor_environment_palette();
    loose_plant_rest_lengths();
    released_plant_dimensions();
    plant_strokes_and_bites();
    std::cout << "environment: OK\n";
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
