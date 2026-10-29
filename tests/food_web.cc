#include "test_support.hh"
#include "hormone_analysis.hh"
#include "material.hh"
#include <numeric>

using namespace test;
namespace {
void formulas() {
  FoodWebParameters p;
  for (double energy : {.5, 4., 10., 60., 150., 1500., 4000.})
    for (double f : {.01, .2, .5, .99}) {
      const auto shares = fragment_shares(energy, f, .2, p);
      check(near(std::accumulate(shares.begin(), shares.end(), 0.), 1),
            "fragment energy is conserved");
      check((energy < p.crumb_min ||
             *std::min_element(shares.begin(), shares.end()) * energy >= p.crumb_min - 1e-12),
            "smallest shard retains the material minimum");
    }
  const auto color = pigment_color({10, 10, 10}, 10);
  for (double v : color)
    check(v >= .6, "thirty mixed pigment cells remain light");
  check(sediment_resistance(.8, .3, .7) < sediment_resistance(.8, .3, 0),
        "undulation helps digging");
  check(near(sediment_vertical_resistance(17, -1), 5),
        "upward sediment drag remains a quarter of the extra resistance");
}

void names() {
  SpeciesRegistry registry;
  GeneticSpecies unknown;
  unknown.id = 19;
  unknown.name = "Test species";
  registry.name_hormones(unknown);
  check(unknown.hormones.names[0].stem.empty() && unknown.hormones.names[1].stem.empty(),
        "uninvestigated hormones do not receive invented names");
  HormoneProfile p;
  for (int round = 1; round <= 3; ++round) {
    for (int j = 0; j < 3; ++j) {
      HormoneInvestigation s;
      s.individual = 3 * round + j;
      s.round = round;
      s.tick = 4096 * round;
      s.organs = 1;
      s.arms = 15;
      s.effects[0][0] = s.effects[1][0] = .02;
      p.accept(s);
    }
    p.finish_round(round, 4096 * round);
    if (round < 3)
      check(p.names[0].suffix.empty(), "names require three rounds and eight distinct individuals");
  }
  check(p.names[0].suffix == "propulsivum", "consistent measured propulsion chooses its suffix");
  unknown.hormones = p;
  registry.name_hormones(unknown);
  check(!unknown.hormones.names[0].stem.empty() && unknown.hormones.names[1].stem.empty(),
        "only a channel with its own measured effect receives a name");

  for (int round = 4; round <= 8; ++round) {
    for (int j = 0; j < 3; ++j) {
      HormoneInvestigation s;
      s.individual = 3 * round + j;
      s.round = round;
      s.tick = 4096 * round;
      s.organs = 1;
      s.arms = 15;
      s.effects[0][0] = s.effects[1][0] = -.02;
      p.accept(s);
    }
    p.finish_round(round, 4096 * round);
  }
  check(p.names[0].suffix == "frenans",
        "a stable changed function survives the three-round hysteresis");
  for (int i = 0; i < 50; ++i) {
    HormoneInvestigation s;
    s.individual = 100 + i;
    p.accept(s);
  }
  check(p.samples.size() == 32, "bounded investigation ring");
  std::ostringstream a;
  a.precision(17);
  p.write(a);
  HormoneProfile q;
  std::istringstream input(a.str());
  q.read(input);
  std::ostringstream b;
  b.precision(17);
  q.write(b);
  check(a.str() == b.str(), "hormone profiles and naming history round-trip");
}

void foodweb() {
  auto w = small_world(17001);
  auto &f = w.field;
  f.sync_food_web();
  auto &env = StateAccess::env(f);
  env.plankton_growth = env.plankton_cohesion = 0;
  env.benthic_supply_share = 0;
  const double x = 300, y = 120;
  f.deposit_detritus(x, y, 10);
  check(near(f.food_web().released, 10), "bare-water detritus releases energy");
  auto &soil = StateAccess::vegetation(f).surfaces[6];
  soil.sediment = soil.length;
  f.index_plants();
  const double sx = (soil.a.x + soil.b.x) / 2, sy = soil.a.y - f.soil_depth(soil) + .5;
  f.deposit_detritus(sx, sy, 100);
  check(near(soil.detritus, 100), "material touching sufficient sediment becomes detritus");
  const double before = f.small_animal_energy(), release = f.food_web().released,
               introduced = f.food_web().introduced;
  ++f.time;
  f.advance_food_web();
  check(near(f.small_animal_energy() + f.food_web().released - release,
             before + f.food_web().introduced - introduced),
        "detritus conversion and decay conserve tracked energy");
  check(soil.worms > 0, "worms grow from the detritus transfer");
  const auto meal = f.graze_bed(sx, sy, 1, 20, 1e9);
  check(meal > 0 && soil.worms > 0, "a buried mouth grazes detritus and leaves worms for gripping");
  auto &p = StateAccess::food_web(f).plankton;
  const int at = p.rows / 3 * p.columns + p.columns / 2;
  p.energy[at] = 20;
  const auto total = std::accumulate(p.energy.begin(), p.energy.end(), 0.);
  const double amount = f.consume_plankton((at % p.columns + .5) * p.width / p.columns,
                                           (at / p.columns + .5) * p.height / p.rows, 1e9, 1e9);
  check(near(amount, total - std::accumulate(p.energy.begin(), p.energy.end(), 0.)) &&
            amount <= total,
        "bilinear ingestion subtracts exactly what was eaten");
  Food fragment{200, 200, 0, 0, 0, 3};
  fragment.radius = 1;
  fragment.origin = 9;
  fragment.cloud = -1;
  f.append_fragment(fragment);
  auto resumed = w.fork();
  check(saved(w) == saved(resumed), "new ecology round-trips with live detritus and worms");
  for (int t = 0; t < 2; ++t) {
    w.tick(false);
    resumed.tick(false);
  }
  check(saved(w) == saved(resumed), "new ecology continues deterministically");
}

void plankton_distribution() {
  auto w = small_world(17016);
  auto &f = w.field;
  f.sync_food_web();
  auto &env = StateAccess::env(f);
  env.plankton_cohesion = env.plankton_growth = 0;
  env.benthic_supply_share = env.worm_head_rate = env.detritus_uptake = 0;
  env.plankton_seed_area = f.food_web().plankton.water_area / 2;
  auto &web = StateAccess::food_web(f);
  auto &p = web.plankton;
  p.sources = {{.25, .35}, {.75, .35}};
  p.nursery.clear();
  const int core = p.columns * int(p.rows * .35) + p.columns / 2, trace = p.columns + 2;
  const double capacity = env.plankton_max_density * p.width / p.columns * p.height / p.rows;
  const auto sum = [&] { return std::accumulate(p.energy.begin(), p.energy.end(), 0.); };
  const auto accounted = [&] { return f.small_animal_energy() + web.released - web.introduced; };
  p.energy[core] = 5 * capacity;
  p.energy[trace] = .001 * capacity;
  f.time = 2001;
  const double before = accounted();
  f.advance_food_web();
  check(near(accounted(), before) &&
            *std::max_element(p.energy.begin(), p.energy.end()) <= capacity,
        "crowding redistributes plankton and mortality transfers rather than deletes energy");
  check(p.energy[core - 1] > 0 && p.energy[core + 1] > 0 && p.energy[trace] > 0,
        "crowding spreads both ways while dilute plankton remains edible");
  const int seam = p.columns * (p.rows / 3);
  std::fill(p.energy.begin(), p.energy.end(), 0);
  p.energy[seam] = 3 * capacity;
  const double seam_before = accounted();
  ++f.time;
  f.advance_food_web();
  check(p.energy[seam + p.columns - 1] > 0 && near(accounted(), seam_before),
        "crowding conserves energy across the periodic boundary");
  std::fill(p.energy.begin(), p.energy.end(), 0);
  env.energy_supply = .0001;
  f.set_energy_headroom(1000);
  f.time = 2500;
  const double introduced = web.introduced;
  f.advance_food_web();
  double left = 0, right = 0;
  for (std::size_t i = 0; i < p.energy.size(); ++i)
    (i % p.columns < std::size_t(p.columns / 2) ? left : right) += p.energy[i];
  check(sum() > 0 && near(left, right) && near(sum(), web.introduced - introduced) &&
            sum() <= f.small_animal_supply() + 1e-9,
        "limited external supply is shared between sources and counted once");
  const auto sources = p.sources;
  auto resumed = w.fork();
  check(saved(w) == saved(resumed), "plankton sources and energy survive checkpoints");
  f.time = resumed.field.time = 3000;
  f.advance_food_web();
  resumed.field.advance_food_web();
  check(saved(w) == saved(resumed) && near(p.sources[0].x, sources[0].x),
        "restored sources preserve their next supply");
}

void visible_habitats() {
  auto w = small_world(18001);
  auto &f = w.field;
  f.sync_food_web();
  auto &env = StateAccess::env(f);
  auto &surfaces = StateAccess::vegetation(f).surfaces;
  surfaces.clear();
  SurfacePatch bed;
  bed.id = 1;
  bed.owner = 1;
  bed.a = {100, 200};
  bed.b = {116, 200};
  bed.normal = {0, -1};
  bed.length = 16;
  bed.sediment = 80;
  bed.sediment_hold = 20;
  SurfacePatch wall;
  wall.id = 2;
  wall.owner = 2;
  wall.a = {100, 176};
  wall.b = {100, 192};
  wall.normal = {1, 0};
  wall.length = 16;
  wall.algae = 100;
  surfaces = {bed, wall};
  auto &grid = StateAccess::vegetation(f).surface_grid;
  grid.reset(f.geometry().width, f.geometry().height);
  grid.add(108, 200, 0);
  grid.add(100, 184, 1);
  f.refresh_algae_exposure();
  check(near(surfaces[1].algae_open[0], 0) && near(surfaces[1].algae_open[1], .25),
        "sediment in a planter masks the buried part of its inner wall");
  check(near(f.algae_capacity(surfaces[1]), env.algae_capacity * .25),
        "only the uncovered wall contributes algae capacity");
  surfaces[0].sediment = 0;
  f.refresh_algae_exposure();
  f.refresh_algae_exposure();
  check(near(surfaces[1].algae_open[1], 1),
        "erosion uncovers the wall and repeated queries preserve the result");
  surfaces[0].sediment = 80;
  f.refresh_algae_exposure();
  check(near(surfaces[1].algae_open[1], .25),
        "new sediment invalidates cached algae exposure without a geometry rebuild");
  f.index_plants();
  for (const auto &v : f.vegetation().plants)
    if (v.kind == 4)
      check(v.y < 180, "buried side-wall algae cannot be seen or eaten");
  env.worm_head_rate = 0;
  env.plankton_limit = 0;
  env.mussel_seed_period = 100000;
  auto &web = StateAccess::food_web(f);
  web.heads.clear();
  WormHead h;
  h.id = web.next_id++;
  h.patch = 1;
  h.energy = 8;
  h.duration = 80;
  h.along = .5;
  h.x = 108;
  h.y = 180;
  web.heads.push_back(h);
  for (int i = 0; i < 24; ++i) {
    ++f.time;
    f.advance_food_web();
  }
  check(web.heads.size() == 1 && std::hypot(web.heads[0].x - web.heads[0].base_x,
                                            web.heads[0].y - web.heads[0].base_y) > 7,
        "exposed worms extend well above their sediment anchor");
  web.heads[0].age = web.heads[0].duration - 1;
  ++f.time;
  f.advance_food_web();
  check(web.heads.size() == 1 && web.heads[0].withdrawing && web.heads[0].extension > .9,
        "a withdrawing worm stays visible and begins contracting");
  std::ostringstream store;
  store.precision(17);
  web.write(store);
  FoodWebState restored;
  std::istringstream input(store.str());
  restored.read(input);
  check(restored.heads.size() == 1 && restored.heads[0].withdrawing &&
            near(restored.heads[0].extension, web.heads[0].extension),
        "an interrupted withdrawal preserves its progress when saved");
  double extension = web.heads[0].extension;
  int retreat = 0;
  while (!web.heads.empty() && retreat < 32) {
    ++f.time;
    f.advance_food_web();
    ++retreat;
    if (!web.heads.empty()) {
      check(web.heads[0].extension < extension && extension - web.heads[0].extension < .07,
            "worm withdrawal is monotonic with bounded per-step movement");
      extension = web.heads[0].extension;
    }
  }
  check(web.heads.empty() && retreat >= 14 && near(surfaces[0].worms, h.energy),
        "a worm completes its visible retreat before returning its energy to the bed");
}

void nursery_after_sediment() {
  auto w = small_world(17031);
  auto &f = w.field;
  f.sync_food_web();
  auto &env = StateAccess::env(f);
  env.plankton_cohesion = env.worm_head_rate = 0;
  env.energy_supply = .001;
  env.plankton_seed_area = f.food_web().plankton.water_area;
  auto &p = StateAccess::food_web(f).plankton;
  p.sources = {{.5, .75}};
  p.nursery.clear();
  f.prepare_plankton_sources();
  const int at = (p.rows - 2) * p.columns + p.columns / 2;
  const double capacity = env.plankton_max_density * p.width / p.columns * p.height / p.rows;
  p.energy[at] = .2 * capacity;
  f.time = 2001;
  f.set_energy_headroom(1e5);
  f.advance_food_web();
  check(p.energy[at] > .2 * capacity, "an exposed nursery cell grows");
  const double before = p.energy[at];
  for (auto &s : StateAccess::vegetation(f).surfaces)
    if (!s.owner)
      s.sediment = 10 * s.length;
  f.index_plants();
  w.refresh_food_allowance();
  auto copy = w.fork();
  ++f.time;
  ++copy.field.time;
  f.advance_food_web();
  copy.field.advance_food_web();
  check(p.energy[at] < before &&
            near(p.energy[at], before * std::exp2(-1 / env.microfauna_lifespan)),
        "sediment stops nursery growth; natural mortality remains active");
  check(saved(w) == saved(copy), "checkpoint restore cannot change growth after sediment movement");
  for (auto &s : StateAccess::vegetation(f).surfaces)
    if (!s.owner)
      s.sediment = 0;
  f.index_plants();
  ++f.time;
  f.advance_food_web();
  check(p.energy[at] > before,
        "eroded nursery cells grow again without waiting for a supply interval");
}

void shellfish_fragments(const Genome &g) {
  std::size_t previous = 0;
  for (double energy : {30., 120.}) {
    auto w = small_world(17030);
    auto &b = adult(w, g, 200, 200).body;
    b.bite_strength = default_max_bite_force;
    b.bite_signal = 1;
    b.eat_signal = 0;
    auto &env = StateAccess::env(w.field);
    env.hardness_mussel = env.hardness_mussel_growth = 0;
    auto &web = StateAccess::food_web(w.field);
    Mussel m;
    m.id = web.next_id++;
    m.x = 205;
    m.y = 200;
    m.energy = energy;
    m.morph = 1.7;
    web.mussels.push_back(m);
    std::vector<VisibleBody> visible;
    w.field.index_small_animals(visible);
    w.field.index(visible);
    std::vector<unsigned char> bitten(w.fish.size());
    for (int i = 0; i < 5; ++i)
      advance_test_mouth(b);
    w.feeding(0, b.x, b.y, false, bitten, 0);
    double material = 0;
    const auto &pieces = w.field.feeding().pieces;
    for (const auto &p : pieces) {
      check(near(food_radius(p), food_radius(p.energy)),
            "shellfish fragments use the common energy density");
      check(w.field.free(p.x, p.y, food_radius(p)),
            "small animal fragments are placed in accessible water");
      material += p.energy;
    }
    check(near(material, energy) && pieces.size() > previous,
          "larger shellfish make more edible pieces with all their energy");
    previous = pieces.size();
  }
}
}
int main() {
  try {
    Genome::begin_run(42);
    auto base = Genome::load("genomes/cppn-start.genome");
    cppn::CPPN query(base.cppn);
    auto g = quiet(base, query);
    formulas();
    names();
    foodweb();
    plankton_distribution();
    visible_habitats();
    nursery_after_sediment();
    shellfish_fragments(g);
    std::cout << "food_web: OK\n";
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
