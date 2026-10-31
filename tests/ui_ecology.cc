#include "test_support.hh"
#include "checkpoint.hh"
#include "render_capture.hh"
#include "observations.hh"
#include "founders.hh"
#include <numeric>
using namespace test;
namespace {
void individual_grass_and_fragments() {
  Ecosystem w(552);
  w.resize(300, 300);
  auto &f = w.field;
  f.sync_environment();
  f.flow = 0;
  f.set_energy_headroom(100000);
  auto &surfaces = StateAccess::vegetation(f).surfaces;
  std::size_t at = 0;
  for (std::size_t i = 0; i < surfaces.size(); ++i) {
    auto &s = surfaces[i];
    if (s.normal.y < -.9) {
      s.sediment = 24 * s.length / 4;
      if (s.a.x < 150 && s.b.x > 150)
        at = i;
    }
  }
  auto &s = surfaces[at];
  s.stump = true;
  s.grass_traits = {.5, .5, .7, .25};
  s.grass = f.env().seed_energy;
  f.index_plants();
  check(s.organs.size() > 2 && s.organs[0].energy > 0 && s.organs[1].energy == 0,
        "bandgrass starts with one thin blade and dormant buds");
  check(s.organs[0].display_width < .4 * s.organs[0].width,
        "young bandgrass has a thin physical and displayed blade");
  s.organs[0].elongation = 1;
  s.organs[0].bare_steps = 100000;
  s.organs[0].energy = s.organs[0].target * .5;
  s.organs[1].energy = s.organs[1].target * .5;
  s.organs[1].elongation = .4;
  s.grass = s.organs[0].energy + s.organs[1].energy;
  f.index_plants();
  const double total = w.total_energy();
  f.advance_grass();
  check(s.organs[0].energy == 0 && s.organs[1].energy > 0 && !f.vegetation().drifting_grass.empty(),
        "old grass blade detaches while the younger blade remains rooted");
  check(near(w.total_energy(), total), "detached blade transfers its biomass to driftwood");
  // The view names drifting grass by the piece's own id; a bite from the menu finds it by that id.
  {
    f.index_plants();
    const auto &drift = f.vegetation().drifting_grass.front();
    const auto parts = f.vegetation().plants;
    const auto part = std::find_if(parts.begin(), parts.end(), [&](const PlantPart &q) {
      return q.kind == 5 && q.patch >= surfaces.size() && q.energy > 0;
    });
    check(part != parts.end(), "drifting grass is indexed for bites");
    check(f.bite_target(drift.id, part->organ,
                        .5 * (stroke_along(*part, -1) + stroke_along(*part, 1))),
          "the menu bites drifting grass by the id the view shows");
  }
  Point crumb{150, 288};
  Food food{crumb.x, crumb.y, 0, 0, 0, 30};
  food.origin = 8;
  food.radius = food_radius(food.energy);
  f.append_fragment(food);
  check(f.feeding().pieces.back().bottom_steps > 0, "fragments render on the bed immediately");
  for (int tick = 0; tick < 12; ++tick)
    f.motion();
  const auto &rest = f.feeding().pieces.back();
  check(near(rest.x, crumb.x) && near(rest.y, crumb.y) && rest.energy > 19,
        "edible crumbs retain position and energy instead of jumping up or becoming buried");
  w.refresh_food_allowance();
  check(f.encourage_target(5, s.id), "growth menu uses available energy for a living plant");
  f.reset_growth_history();
  f.begin_production();
  f.grow_plants(true);
  f.finish_production();
  const auto &growth = f.vegetation();
  check(growth.algae_added + growth.grass_added > 0 &&
            near(f.plant_growth_rate(), growth.algae_added + growth.grass_added),
        "growth history records settled imports from the shared production budget");
  // A full plant still answers the menu: it puts out new organs instead of being refused.
  s.grass = f.grass_capacity(s);
  f.set_energy_headroom(0);
  w.refresh_food_allowance();
  check(f.encourage_target(5, s.id), "growth menu also encourages a full plant to bud");
}
// One bite from the menu leaves a mark at once that the view shows (it drops marks below .02).
void leaf_bite_marks() {
  Ecosystem w(554);
  w.resize(300, 300);
  auto &f = w.field;
  f.sync_environment();
  f.flow = 0;
  f.set_energy_headroom(100000);
  auto &surfaces = StateAccess::vegetation(f).surfaces;
  std::size_t at = 0;
  for (std::size_t i = 0; i < surfaces.size(); ++i)
    if (surfaces[i].normal.y < -.9) {
      surfaces[i].sediment = 24 * surfaces[i].length / 4;
      if (surfaces[i].a.x < 150 && surfaces[i].b.x > 150)
        at = i;
    }
  auto &s = surfaces[at];
  s.stump = true;
  s.grass_traits = {.5, .5, .7, .4};
  s.grass = f.grass_capacity(s);
  for (int step = 0; step < 4000; ++step)
    f.advance_grass();
  f.index_plants();
  const auto parts = f.vegetation().plants;
  const auto leaf = std::find_if(parts.begin(), parts.end(), [&](const PlantPart &q) {
    return q.kind == 5 && q.patch == at && q.organ >= 0 && s.organs[q.organ].kind >= 2 &&
           q.energy > 0;
  });
  check(grass_form(s) == 1 && leaf != parts.end(), "leaf plant fixture has a grown leaf");
  const int organ = leaf->organ;
  check(f.bite_target(s.id, organ, .5 * (stroke_along(*leaf, -1) + stroke_along(*leaf, 1))),
        "the menu bites the leaf");
  double deepest = 0;
  for (const auto &n : s.organs[organ].notches)
    deepest = std::max(deepest, std::abs(notch_depth(n, f.time, f.env().plant_notch_heal)));
  check(deepest >= .1 || s.organs[organ].cuts > 0, "one bite leaves a clearly visible mark");
}
void buried_rock_faces() {
  Ecosystem w(553);
  w.resize(300, 300);
  w.polygon({{100, 280}, {180, 280}, {180, 294}, {100, 294}});
  auto &f = w.field;
  f.sync_environment();
  auto &surfaces = StateAccess::vegetation(f).surfaces;
  for (auto &s : surfaces)
    if (s.owner == 0 && s.normal.y < -.9)
      s.sediment = 32 * s.length / 4;
  f.index_plants();
  bool covered = false, root_blocked = false;
  for (const auto &s : surfaces) {
    if (near(s.a.y, 280) && s.normal.y < -.9) {
      covered = true;
      check(s.algae_open[1] <= s.algae_open[0], "foreign sediment masks upward rock faces too");
    }
    if (s.owner == 0 && s.a.x > 105 && s.b.x < 175) {
      root_blocked = true;
      check(!f.bed_site_clear(s, .5, 12, 16), "roots cannot emerge through rock overhangs");
    }
  }
  check(covered && root_blocked, "rock coverage fixture exercises both placement and coating");
}
void editor_slopes() {
  Ecosystem w(551);
  w.resize(400, 400);
  w.safety = false;
  w.polygon({{80, 240}, {240, 160}, {280, 300}, {80, 300}});
  auto &f = w.field;
  f.sync_environment();
  f.set_energy_headroom(100000);
  auto &surfaces = StateAccess::vegetation(f).surfaces;
  std::size_t at = surfaces.size();
  for (std::size_t i = 0; i < surfaces.size(); ++i) {
    auto &s = surfaces[i];
    s.algae = s.grass = s.sediment = 0;
    s.stump = false;
    s.organs.clear();
    if (s.normal.y < -.5 && std::abs(s.normal.x) > .1)
      at = i;
  }
  check(at < surfaces.size(), "sloped rock fixture");
  auto &s = surfaces[at];
  const double x = s.a.x + .1 * (s.b.x - s.a.x), y = s.a.y + .1 * (s.b.y - s.a.y);
  check(f.edit_environment("algae", x, y, 1),
        "one-pixel brush reaches rock face away from midpoint");
  check(s.algae > 0, "algae lands on the requested rock surface");
  s.algae = 0;
  s.sediment = 20 * s.length / 4;
  f.index_plants();
  check(f.place_animals(7, x, y, 4, 1, .5) == 1, "worm can be placed in sloped sediment");
  auto &h = StateAccess::food_web(f).heads.back();
  check(near(h.x, h.base_x) && h.y < h.base_y, "new worm grows vertically up the slope");
  f.advance_food_web();
  check(std::abs(f.delta_x(h.x - h.base_x)) < .25 * (h.base_y - h.y),
        "moving worm remains upright, with limited sway");
}
void crab_leaves_rim() {
  Ecosystem w(55);
  w.resize(300, 300);
  w.safety = false;
  w.polygon({{100, 100}, {120, 100}, {120, 250}, {100, 250}});
  w.polygon({{120, 200}, {240, 200}, {240, 250}, {120, 250}});
  auto &f = w.field;
  f.sync_environment();
  auto &v = StateAccess::vegetation(f);
  for (auto &s : v.surfaces) {
    s.sediment = 0;
    s.grass = s.algae = 0;
    if (s.normal.y < -.9 && s.a.y > 190 && s.a.y < 210)
      s.sediment = 20 * s.length / 4;
  }
  auto &web = StateAccess::food_web(f);
  web.crabs.clear();
  for (auto &s : v.surfaces)
    if (s.normal.y < -.9 && s.a.y == 100) {
      Crab c;
      c.id = 10000;
      c.patch = s.id;
      c.along = .5;
      c.x = (s.a.x + s.b.x) / 2;
      c.energy = 30;
      c.y = 100 - .58 * crab_radius(c.energy, f.env(), c.morph);
      c.state = 0;
      c.exposure = 1;
      c.next_move = 0;
      web.crabs.push_back(c);
      break;
    }
  check(web.crabs.size() == 1, "rim fixture has one crab");
  bool crossed = false;
  for (int i = 0; i < 150; ++i) {
    f.advance_food_web();
    crossed |= web.crabs.front().crossing > 0;
    check(f.free(web.crabs.front().x, web.crabs.front().y, 0), "swimming crab stays outside rock");
  }
  check(crossed, "crab escapes pot rim by arched swim");
  auto &crab = web.crabs.front();
  crab.crossing = 0;
  crab.state = 2;
  crab.exposure = .1;
  for (auto &surface : v.surfaces)
    surface.sediment = 0;
  f.advance_food_web();
  check(crab.state != 0 && crab.state != 2 && crab.exposure > .1,
        "eroded sediment exposes and releases a buried crab");
  f.startle_animals(crab.x, crab.y, 20);
  f.advance_food_web();
  check(crab.state != 2, "startled crab flees before digging again");
}
void suspended_trial_food() {
  Ecosystem world(187);
  world.resize(615, 410);
  world.safety = false;
  world.field.flow = world.field.gravity = 0;
  world.field.set_energy_supply(0);
  world.food_burst.strength = world.mutation_burst.strength = 0;
  check(place_trial_food(world, 340, 205, 120), "place suspended trial food");
  for (int step = 0; step < 300; ++step)
    world.tick();
  check(world.field.food_count() == 1 && world.field.feeding().pieces[0].bottom_steps == 0,
        "motionless food survives the complete founder trial in open water");
}
void initial_food_clouds() {
  Ecosystem w(817);
  w.starter_world();
  w.refresh_food_allowance();
  auto &f = w.field;
  const double before = w.total_energy(), available = f.energy_available;
  f.configure_seed_food(1200);
  f.place_initial_food();
  const auto &p = f.food_web().plankton;
  const double plankton = f.small_animal_stores()[0];
  const auto supply = f.food_supply();
  const double target = std::min(available, f.niche_limit(0));
  check(w.ticks == 0 && f.time == 0 && f.food_count() > 0 && plankton > 1000,
        "artificial and natural food clouds are stocked before the first step");
  check(target > 0 && f.food_energy() >= target - f.source_count() * supply.minimum &&
            f.food_energy() <= target + 1e-7,
        "starting food fills its energy budget up to one remaining grain per source");
  check(near(f.feeding().food_initial, f.food_energy()) && near(f.food_web().initial, plankton) &&
            near(f.food_web().introduced, plankton),
        "starting food is booked once, separately from ongoing production");
  check(near(available - f.energy_available, w.total_energy() - before) &&
            w.total_energy() <= w.energy_limit() + 1e-7 &&
            plankton <= f.env().plankton_seed_threshold * f.niche_limit(6) + 1e-7,
        "starting stocks share the tank budget and natural source limit");
  for (int cloud = 0; cloud < f.source_count(); ++cloud)
    check(std::any_of(f.feeding().pieces.begin(), f.feeding().pieces.end(),
                      [&](const auto &piece) { return piece.cloud == cloud; }),
          "every artificial-food source already contains grains at startup");
  for (auto source : p.sources)
    check(f.plankton_density(source.x * p.width, source.y * p.height) > 0,
          "every natural-food source starts with edible biomass");
  const double maximum = f.env().plankton_max_density * p.width / p.columns * p.height / p.rows;
  for (std::size_t at = 0; at < p.energy.size(); ++at)
    check(p.energy[at] <= maximum + 1e-7 && (p.energy[at] == 0 || f.plankton_water_cell(at)),
          "startup respects local density, walls and sediment");

  const double stocked = f.food_energy();
  std::vector<Point> eggs{{180, 180}, {400, 180}, {620, 180}};
  f.distribute_start_food(eggs);
  check(near(stocked, f.food_energy()), "placing starter food preserves energy");
  std::vector<int> nearby(eggs.size());
  for (const auto &piece : f.feeding().pieces)
    for (std::size_t i = 0; i < eggs.size(); ++i)
      nearby[i] += std::hypot(f.delta_x(piece.x - eggs[i].x), piece.y - eggs[i].y) <= 42.001;
  check(std::size_t(*std::min_element(nearby.begin(), nearby.end())) >=
            f.food_count() / eggs.size(),
        "starter food reaches every egg neighbourhood");
  for (double headroom : {0., .5}) {
    Ecosystem limited(818);
    limited.field.configure_seed_food(0);
    limited.field.set_energy_headroom(headroom);
    limited.field.place_initial_food();
    const double stock = limited.field.small_animal_stores()[0];
    check(limited.field.food_count() == 0 && near(stock, headroom) &&
              near(stock, limited.field.food_web().initial),
          "disabled artificial food and restricted initial energy are respected");
  }
  Ecosystem disabled(819);
  disabled.set_parameter("energy_supply", 0);
  disabled.field.configure_seed_food(0);
  disabled.field.place_initial_food();
  check(disabled.field.small_animal_energy() == 0 && disabled.field.food_count() == 0,
        "zero supply leaves an intentionally unfed world empty");
}
double sediment_mass(const Field &f) {
  double result = std::accumulate(f.sediment().suspended.begin(), f.sediment().suspended.end(), 0.);
  for (const auto &s : f.vegetation().surfaces)
    result += s.sediment;
  return result;
}
void fertilized_growth() {
  auto poor = small_world(731), rich = small_world(731);
  poor.starter_world();
  rich.starter_world();
  auto &a = StateAccess::vegetation(poor.field).surfaces;
  auto &b = StateAccess::vegetation(rich.field).surfaces;
  std::size_t at = 0;
  while (at < a.size() &&
         (!a[at].stump || a[at].sediment < 1 ||
          poor.field.light((a[at].a.x + a[at].b.x) / 2, (a[at].a.y + a[at].b.y) / 2) < .3 ||
          poor.field.grass_capacity(a[at]) <= a[at].grass))
    ++at;
  check(at < a.size(), "fertilization habitat exists");
  a[at].detritus = 0;
  b[at].detritus = 4 * b[at].sediment;
  check(rich.field.root_stability(at) > poor.field.root_stability(at),
        "organic soil strengthens rooted sediment");
  poor.field.set_energy_supply(190);
  rich.field.set_energy_supply(190);
  poor.refresh_food_allowance();
  rich.refresh_food_allowance();
  poor.field.grow_plants();
  rich.field.grow_plants();
  check(b[at].grass > a[at].grass, "organic soil gives the local plant more growth");
  check(rich.total_energy() <= rich.energy_limit() + 1e-7, "fertilization respects energy budget");
}
void beds_and_growth() {
  auto w = small_world(634);
  w.starter_world();
  auto &f = w.field;
  auto &surfaces = StateAccess::vegetation(f).surfaces;
  int grasses = 0, algae = 0;
  for (const auto &s : surfaces) {
    grasses += s.grass > 0;
    algae += s.algae > 0;
    check(s.grass <= f.env().seed_energy && s.algae <= f.env().seed_energy,
          "new worlds start plants with the same seed energy as recolonisation");
    for (const auto &o : s.organs)
      check(o.energy < .05 * o.target,
            "initial visible leaves are seedlings rather than funded adult organs");
  }
  check(grasses > 10 && algae > 10, "seedlings occupy several grass and algae habitats");
  std::size_t pot = surfaces.size();
  double low = 100, high = 0;
  for (std::size_t i = 0; i < surfaces.size(); ++i) {
    auto &s = surfaces[i];
    if (s.sediment_hold > 0) {
      pot = i;
      s.sediment = 12 * s.length / 4;
    }
    low = std::min(low, grass_root_depth(s));
    high = std::max(high, grass_root_depth(s));
  }
  check(pot < surfaces.size() && high - low > 2,
        "planters retain sediment; roots vary between patches");
  bool raised = false, flat = false;
  for (std::size_t i = 0; i < surfaces.size(); ++i) {
    if (surfaces[i].sediment_hold <= 0)
      continue;
    const auto edges = f.sediment_edges(i);
    for (auto depth : edges) {
      check(depth >= 12 - 1e-8 && depth <= 13.5 + 1e-8,
            "planter soil stays full height at its walls");
      raised |= depth > 12.5;
      flat |= near(depth, 12);
    }
    if (i + 1 < surfaces.size() && surfaces[i + 1].owner == surfaces[i].owner &&
        surfaces[i + 1].edge == surfaces[i].edge && surfaces[i + 1].slot == surfaces[i].slot + 1)
      check(near(edges[1], f.sediment_edges(i + 1)[0]), "curved soil has continuous patch joins");
  }
  check(raised && flat, "planter soil curves gently up only near its walls");
  f.index_plants();
  const auto &s = surfaces[pot];
  const Point base{(s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2};
  Point crumb{base.x + s.normal.x * 5, base.y + s.normal.y * 5};
  check(f.rests_on_sediment(crumb, .4) &&
            near((crumb.x - base.x) * s.normal.x + (crumb.y - base.y) * s.normal.y, 5),
        "resting fragments retain their depth within the displayed soil strip");
  Point water{base.x + s.normal.x * 40, base.y + s.normal.y * 40};
  check(!f.rests_on_sediment(water, .4), "suspended fragments are not snapped to a distant bed");
  Body swimmer;
  swimmer.hatched = swimmer.alive = true;
  swimmer.tissue = 40;
  swimmer.energy = 100;
  swimmer.x = (s.a.x + s.b.x) / 2;
  swimmer.y = (s.a.y + s.b.y) / 2 - s.sediment_hold - 2;
  StateAccess::motor(swimmer).relative_speed = 10;
  StateAccess::motor(swimmer).thrust = 100;
  const auto mass = sediment_mass(f);
  for (int i = 0; i < 100; ++i)
    f.stir_sediment(swimmer);
  check(std::abs(mass - sediment_mass(f)) < 1e-6, "stirring conserves sediment mass");
  check(s.sediment >= s.sediment_hold * s.length / 4 - 1e-8, "fish cannot erode the protected bed");
  std::istringstream source(saved(w));
  Ecosystem restored(0);
  restored.read(source);
  check(std::count_if(restored.field.vegetation().surfaces.begin(),
                      restored.field.vegetation().surfaces.end(),
                      [](const auto &p) { return p.sediment_hold > 0; }) > 0,
        "checkpoint restores planter protection from geometry");
  for (std::size_t i = 0; i < surfaces.size(); ++i)
    for (int side = 0; side < 2; ++side)
      check(std::abs(f.sediment_edges(i)[side] - restored.field.sediment_edges(i)[side]) < 1e-5,
            "checkpoint reconstructs the same sediment surface");
  for (auto &p : surfaces) {
    p.grass = p.algae = 0;
    p.stump = false;
    p.organs.clear();
  }
  StateAccess::vegetation(f).drifting_grass.clear();
  f.set_energy_headroom(0);
  for (int k = 0; k < 30; ++k) {
    ++f.time;
    f.grow_plants();
  }
  check(f.grass_energy() == 0 && f.algae_energy() == 0, "recolonisation obeys the energy budget");
  f.set_energy_supply(.0001);
  // This is a recolonisation/budget fixture: new rocks must not turn it into
  // a stochastic test of deeply shaded seed germination.
  w.set_parameter("light_shadow", 1);
  w.set_parameter("light_bottom", 1);
  for (int k = 0; k < 600 && f.grass_energy() == 0; ++k) {
    f.set_energy_headroom(8);
    ++f.time;
    f.grow_plants();
  }
  check(f.grass_energy() > 0,
        "suitable bare soil recolonises without an adjacent living grass patch");
  const auto before = f.grass_energy() + f.algae_energy();
  f.set_energy_headroom(8);
  ++f.time;
  f.grow_plants();
  check(f.grass_energy() + f.algae_energy() <= before + 8.00001,
        "recovery growth respects total allowance");
}
void exposed_rock_and_egg_decay() {
  auto w = small_world(714);
  check(w.polygon({{180, 410}, {180, 350}, {240, 350}, {240, 410}}), "place supported rock");
  const auto owner = w.field.geometry().obstacles.back().id;
  bool top = false, side = false;
  for (const auto &patch : w.field.vegetation().surfaces)
    if (patch.owner == owner) {
      check(patch.normal.y <= 0, "contact face at the floor cannot grow algae");
      top |= patch.normal.y < 0;
      side |= near(patch.normal.y, 0);
    }
  check(top && side, "exposed top and sides support algae");
  w.field.edit_environment("algae", 210, 350, 70);
  check(w.field.algae_energy() > 0, "newly placed rock can carry algae");
  w.refresh_food_allowance();
  const double before_animals = w.field.small_animal_energy(),
               introduced = StateAccess::food_web(w.field).introduced;
  check(w.field.place_animals(9, 210, 350, 70, 3, 2.4) == 3,
        "mussels can be placed on exposed rock surfaces");
  check(near(w.field.small_animal_energy() - before_animals,
             StateAccess::food_web(w.field).introduced - introduced),
        "manual fauna energy is booked exactly once");
  check(w.field.edit_environment("sediment", 300, 408, 120, -1, 12),
        "prepare sediment for fauna brush");
  w.refresh_food_allowance();
  check(w.field.place_animals(7, 300, 402, 80, 1) == 1 && !w.field.food_web().heads.empty(),
        "worm brush creates an immediately visible individual");
  w.refresh_food_allowance();
  check(w.field.place_animals(8, 350, 402, 80, 1) == 1,
        "crab brush creates a walking animal on sediment");
  auto &animals = StateAccess::food_web(w.field);
  auto &crab = animals.crabs.back();
  crab.state = 0;
  crab.exposure = 0;
  const auto buried = capture_render(w, RenderView{}, 0, {});
  check(buried.rows[std::size_t(RenderKind::Invertebrate)].count(crab.id) == 1,
        "buried crabs retain a render instance for their mound and emergence");
  const auto &head = animals.heads.back();
  w.field.startle_animals(head.x, head.y, 120);
  check(head.withdrawing && crab.state == 3,
        "a local touch retracts nearby worms and starts crab escape");
  check(int(animals.mussels.front().morph) == 2, "selected mussel family reaches the simulation");
  animals.mussels.front().filtered = 17.25;
  animals.mussels.front().filter_rate = .025;
  animals.heads.front().filter_rate = .013;
  animals.crabs.front().depth = .73;
  animals.crabs.front().feeding = {.03, 250, 390, 5, 15};
  auto placed_copy = w.fork();
  check(saved(w) == saved(placed_copy), "placed fauna survives save and load");
  const auto frightened_id = crab.id;
  for (int step = 0; step < 150; ++step) {
    ++w.field.time;
    w.field.advance_food_web();
  }
  const auto escaped =
      std::find_if(w.field.food_web().crabs.begin(), w.field.food_web().crabs.end(),
                   [&](const auto &c) { return c.id == frightened_id; });
  check(escaped != w.field.food_web().crabs.end() && escaped->state == 3,
        "touch-induced flight survives emergence and route replanning");
  const double energy_before = w.field.food_energy() + w.field.small_animal_energy();
  check(w.field.crush_target(8, frightened_id, -1), "radial action cracks the selected crab");
  check(near(energy_before, w.field.food_energy() + w.field.small_animal_energy()),
        "manual cracking transfers all animal energy to real edible fragments");
  check(!w.field.crush_target(8, frightened_id, -1), "a second click cannot duplicate dead prey");
  check(std::count_if(animals.shells.begin(), animals.shells.end(),
                      [](const auto &shell) { return shell.morph >= 8; }) == 3,
        "cracking leaves three decorative carapace fragments without food duplication");
  for (auto &surface : StateAccess::vegetation(w.field).surfaces)
    if (surface.id == animals.mussels.front().patch)
      surface.algae = w.field.algae_capacity(surface) + 40;
  {
    auto &mussel = animals.mussels.front();
    const double before =
        w.field.algae_energy() + w.field.small_animal_energy() + w.field.food_energy();
    const auto begin = w.field.feeding().pieces.size();
    check(w.field.crush_target(9, mussel.id, -1), "a coated mussel can be cracked");
    double coating = 0;
    int coating_pieces = 0;
    for (std::size_t k = begin; k < w.field.feeding().pieces.size(); ++k) {
      const auto &piece = w.field.feeding().pieces[k];
      check(piece.energy <= 4 * w.field.env().crumb_min,
            "shell meat and coating share the edible fragment size bound");
      if (piece.origin == 4) {
        coating += piece.energy;
        ++coating_pieces;
      }
    }
    check(coating > 0 && coating_pieces > 1, "shell algae become several real food flakes");
    check(near(before,
               w.field.algae_energy() + w.field.small_animal_energy() + w.field.food_energy()),
          "cracking conserves both shell coating and meat energy");
    auto gentle = small_world(782), strong = small_world(782);
    SmallAnimalMeal meat;
    meat.x = 300;
    meat.y = 120;
    meat.radius = 6;
    meat.energy = 1500;
    meat.hardness = .4;
    meat.origin = 8;
    meat.color = {.8, .3, .2};
    gentle.field.scatter_fragments(meat, 1);
    strong.field.scatter_fragments(meat, 1, 4);
    check(gentle.field.feeding().pieces.size() == strong.field.feeding().pieces.size(),
          "scatter does not create more food");
    for (std::size_t k = 0; k < gentle.field.feeding().pieces.size(); ++k) {
      const auto &a = gentle.field.feeding().pieces[k], &b = strong.field.feeding().pieces[k];
      check(near(b.x - meat.x, 4 * (a.x - meat.x)) && near(b.y - meat.y, 4 * (a.y - meat.y)),
            "mouse cracking spreads fragments four times farther in open water");
      check(near(b.vx, 4 * a.vx) && near(b.vy, 4 * a.vy),
            "mouse cracking imparts fourfold scatter impulse");
    }
  }
  const double algae = w.field.algae_energy();
  std::istringstream coating(saved(w));
  Ecosystem after_coating(0);
  after_coating.read(coating);
  check(near(algae, after_coating.field.algae_energy()),
        "geometry reconstruction retains the mussel coating energy");
  auto floating = small_world(719);
  floating.field.gravity = .01;
  for (int i = 0; i < 12; ++i) {
    Corpse c{300. + i, 100, 0, 0, 80, 80};
    c.radius = 2;
    c.hatched = true;
    floating.corpses.push_back(c);
  }
  for (int step = 0; step < 80; ++step)
    floating.drift_corpses();
  check(floating.corpses.size() == 12 && floating.corpses.front().y > 102 &&
            !floating.corpses.front().resting && near(floating.corpses.front().energy, 80),
        "slow sinking corpses neither decay as grounded nor trigger ground crowding in open water");
  auto descent = small_world(720);
  descent.resize(1000, 1640);
  descent.field.gravity = .036;
  Corpse falling{500, 20, 0, 0, 80, 80};
  falling.radius = 2;
  falling.hatched = true;
  descent.corpses.push_back(falling);
  for (int k = 0; k < 100; ++k)
    descent.drift_corpses();
  check(descent.corpses.front().y > 90 && descent.corpses.front().y < 150,
        "fresh remains descend gently during their first hundred steps");
  for (int k = 100; k < 500; ++k)
    descent.drift_corpses();
  check(descent.corpses.front().y >= 1637,
        "remains reach the floor within five hundred isolated motion updates");
  auto dead_fish = small_world(715), dead_egg = small_world(715);
  Corpse corpse{300, 408, 0, 0, 80, 80};
  corpse.radius = 2;
  dead_fish.corpses.push_back(corpse);
  corpse.hatched = false;
  dead_egg.corpses.push_back(corpse);
  for (int step = 0; step < 300; ++step)
    dead_fish.drift_corpses();
  for (int step = 0; step < 1200; ++step)
    dead_egg.drift_corpses();
  check(near(dead_fish.corpses.front().energy, dead_egg.corpses.front().energy) &&
            near(corpse_decay_age(dead_fish.corpses.front()),
                 corpse_decay_age(dead_egg.corpses.front())),
        "dead eggs take four times as long to lose the same energy and freshness");
  auto bits = small_world(716);
  StateAccess::env(bits.field).rest_steps = 1;
  Food piece{300, 408, 0, 0, 0, 80};
  piece.radius = 2;
  piece.origin = 2;
  piece.initial_energy = 80;
  bits.field.append_fragment(piece);
  for (int step = 0; step < 1200; ++step)
    bits.field.motion();
  check(bits.field.feeding().pieces.size() == 1 &&
            near(bits.field.feeding().pieces.front().energy, 40),
        "egg fragments keep their 1200-step half-life even while resting on the floor");
}
void remains_identity() {
  auto w = small_world(713);
  auto genes = Genome::load("genomes/cppn-start.genome");
  auto &p = adult(w, genes);
  const auto id = p.id;
  const auto species = p.species;
  p.death_cause = 1;
  p.body.alive = false;
  w.collect_corpses();
  check(!w.corpses.empty() && w.corpses.back().blood_id == id &&
            w.corpses.back().species == species,
        "corpse keeps individual and species identity");
  std::istringstream source(saved(w));
  Ecosystem restored(0);
  restored.read(source);
  check(restored.corpses.back().blood_id == id && restored.corpses.back().species == species &&
            restored.corpses.back().death_cause == 1,
        "corpse identity and cause survive checkpoint");
}
void frozen_histories_and_species() {
  auto w = small_world(719);
  auto genes = Genome::load("genomes/cppn-start.genome");
  adult(w, genes);
  auto sibling = genes;
  sibling.cppn = std::make_shared<evolution::Genome>(*genes.cppn);
  adult(w, sibling, 300, 200);
  auto &groups = StateAccess::taxonomy(w).species;
  check(groups.size() == 1, "checkpoint fixture starts with one species");
  auto other = groups.front();
  other.id += 10;
  groups.push_back(other);
  w.fish.back().species = other.id;
  auto species = [&](std::uint64_t id = 0) {
    std::ostringstream out;
    write_species(out, w, true, id);
    return out.str();
  };
  const auto first = species(groups.front().id), second = species(other.id);
  check(species() == first.substr(0, first.size() - 1) + "," + second.substr(1),
        "single-species output preserves exactly the full list's records");
  check(species(other.id + 1) == "[]", "unknown species has an empty record list");
  const auto selected = w.fish.front().id;
  const auto frozen = capture_checkpoint(w, genes, selected, true, false, 0, 0, 0);
  const auto before = serialize_checkpoint(frozen);
  check(before == serialize_checkpoint({w, genes, selected, 0, 0, true, false, 0}),
        "freezing preserves all checkpoint bytes");
  const auto &a = frozen.world.fish.front().genome.cppn;
  const auto &b = frozen.world.fish.back().genome.cppn;
  check(a != genes.cppn && b != sibling.cppn && a != b, "checkpoint owns separate genome copies");
  check(a->history() == b->history() && a->history() != genes.cppn->history(),
        "checkpoint clones each shared history once, without retaining the live history");
  genes.cppn->history()->next_generation();
  genes.cppn->history()->observe_node(100000);
  check(serialize_checkpoint(frozen) == before,
        "live evolution cannot change a checkpoint awaiting background serialization");
}
void breeder_ranking() {
  auto w = small_world(720);
  auto genes = Genome::load("genomes/cppn-start.genome");
  auto &p = adult(w, genes);
  p.body.nutrition = 10;
  auto &bank = StateAccess::support(w).breeders;
  w.evo.breeder_slots = 1000;
  for (int i = 0; i < 100; ++i) {
    Breeder b;
    b.id = 1000 + i;
    b.environment = i % 3;
    b.food_rate = (i % 7) * .2;
    b.resting_cost = .5;
    b.offspring = i % 4;
    b.observed_steps = 100;
    bank.push_back(b);
  }
  for (const auto weight : {4., 1.}) {
    w.evo.breeder_offspring_weight = weight;
    ++w.environment;
    auto expected = bank;
    auto tier = [&](const Breeder &b) {
      return b.environment != w.environment ? -1
             : b.feeds_adequately()         ? (b.offspring > 0 ? 2 : 1)
                                            : 0;
    };
    std::stable_sort(expected.begin(), expected.end(), [&](const auto &a, const auto &b) {
      return tier(a) != tier(b) ? tier(a) > tier(b) : a.score(weight) > b.score(weight);
    });
    w.remember_breeder(p);
    std::vector<std::uint64_t> actual_ids, expected_ids;
    for (const auto &b : bank)
      if (b.id >= 1000)
        actual_ids.push_back(b.id);
    for (const auto &b : expected)
      if (b.id >= 1000)
        expected_ids.push_back(b.id);
    check(actual_ids == expected_ids,
          "breeder ranking preserves stable ties, environment and changed score weights");
  }
}
}
int main() {
  individual_grass_and_fragments();
  leaf_bite_marks();
  buried_rock_faces();
  editor_slopes();
  crab_leaves_rim();
  suspended_trial_food();
  initial_food_clouds();
  fertilized_growth();
  beds_and_growth();
  remains_identity();
  exposed_rock_and_egg_decay();
  frozen_histories_and_species();
  breeder_ranking();
  std::cout << "Pflanzen, Sedimenthaltung und Kadaveridentität: OK\n";
  std::cout << "Unabhängige Speicherstände und begrenzte Rekordausgabe: OK\n";
}
