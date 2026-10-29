#include "test_support.hh"
#include "ecology_internal.hh"
#include <numeric>
using namespace test;
namespace {
double odor_mass(const Field &f) {
  const auto &p = f.food_web().plankton;
  return std::accumulate(p.odor.begin(), p.odor.end(), 0.) * p.width * p.height /
         (p.columns * p.rows);
}
double sperm_mass(const Ecosystem &w) {
  double total = 0;
  for (const auto &s : w.sperm)
    total += s.energy;
  return total;
}
void release(Ecosystem &w, const Genome &g, std::uint64_t parent, double x, double y,
             std::array<double, 3> color, double mass = 40) {
  Sperm s;
  s.genome = g;
  s.parent = parent;
  s.x = x;
  s.y = y;
  s.color = color;
  s.energy = mass;
  s.render_id = w.next_sperm_id++;
  w.seed_sperm(s);
  check(!s.cells.empty(), "release reaches water cells");
  w.sperm.push_back(std::move(s));
  w.refresh_sperm_field();
}
void transport() {
  auto w = small_world(91531);
  w.resize(768, 480);
  auto &f = w.field;
  auto &p = StateAccess::food_web(f).plankton;
  const auto at = std::uint32_t(5 * p.columns + 8);
  WaterborneTransport mixing(f, 1);
  std::map<std::uint32_t, double> one{{at, 40}};
  auto spread = mixing.advance(one);
  double total = 0;
  for (auto [i, mass] : spread) {
    check(mass > 0, "transport retains positive mass");
    total += mass;
  }
  check(near(total, 40) && spread.size() == 5, "diffusion conserves mass and fills its halo");
  auto &water = StateAccess::water(f);
  water.update(f);
  std::fill(water.u.begin(), water.u.end(), 6.);
  std::fill(water.v.begin(), water.v.end(), 0.);
  WaterborneTransport current(f, 0);
  auto moved = current.advance(one);
  double centre = 0;
  for (auto [i, mass] : moved)
    centre += (i % p.columns + .5) * 24 * mass;
  check(centre / 40 > (at % p.columns + .5) * 24 + 4, "water current carries the field downstream");
  check(moved.size() == 2, "a uniform current advects without artificial sideways diffusion");
  for (auto [i, mass] : moved)
    check(i / p.columns == at / p.columns && mass > 0,
          "a horizontal current preserves the vertical plume profile");
  w.wall(288, 0, 288, 480, 8);
  f.sync_food_web();
  WaterborneTransport barrier(f, 5);
  std::map<std::uint32_t, double> beside{{std::uint32_t(5 * p.columns + 11), 40}};
  // Stop before diffusion can go around the periodic tank boundary.
  for (int i = 0; i < 6; ++i)
    beside = barrier.advance(beside);
  for (auto [i, mass] : beside)
    check(i % p.columns < 12 && mass > 0, "thin wall blocks transport and diagonal leakage");
}
void sampling() {
  auto w = small_world(91536);
  w.resize(768, 480);
  w.wall(288, 40, 288, 440, 3);
  w.wall(400, 160, 620, 230, 5);
  w.obstacle(100, 300, 35);
  auto &f = w.field;
  f.sync_food_web();
  WaterborneTransport cached(f, 1);
  for (double y = -1; y <= 481; y += 7.125)
    for (double x = -24; x <= 792; x += 7.75) {
      const auto precise = waterborne_sample(f, x, y), fast = cached.sample(x, y);
      check(precise.index == fast.index, "cached sampling retains cell identity at barriers");
      for (int k = 0; k < 4; ++k)
        check(near(precise.weight[k], fast.weight[k]),
              "cached sampling respects walls, sediment and the periodic boundary");
    }
}
void dense_scent() {
  auto w = small_world(91537);
  w.resize(1152, 720);
  w.wall(480, 80, 480, 640, 8);
  auto &f = w.field;
  StateAccess::env(f).odor_emission = 0;
  auto &water = StateAccess::water(f);
  water.update(f);
  std::fill(water.u.begin(), water.u.end(), 2.5);
  std::fill(water.v.begin(), water.v.end(), -.7);
  auto &p = StateAccess::food_web(f).plankton;
  for (std::size_t at = 0; at < p.energy.size(); ++at)
    for (int c = 0; c < 7; ++c)
      p.odor[at * 7 + c] = f.plankton_water_cell(at) ? float((at * 17 + c * 31) % 71) / 71 : 0;
  StateAccess::env(f).odor_lifetime_eggs = 50;
  auto parallel = f;
  parallel.motion_workers = 4;
  const auto lifetimes = f.env().odor_lifetimes();
  std::vector<double> expected(p.odor.size());
  for (int c = 0; c < 7; ++c) {
    WaterborneTransport reference(f, f.env().odor_mixing);
    std::map<std::uint32_t, double> source;
    for (std::size_t at = 0; at < p.energy.size(); ++at)
      if (p.odor[at * 7 + c] > 0)
        source.emplace(std::uint32_t(at), p.odor[at * 7 + c]);
    for (auto [at, amount] : reference.advance(source))
      expected[at * 7 + c] = std::exp(-1. / lifetimes[c]) * amount;
  }
  f.advance_odor();
  parallel.advance_odor();
  for (std::size_t i = 0; i < p.odor.size(); ++i) {
    check(std::abs(p.odor[i] - expected[i]) < 3e-7,
          "dense odor retains the conservative transport across walls and seams");
    check(std::abs(parallel.food_web().plankton.odor[i] - expected[i]) < 3e-7,
          "parallel odor differs only by float accumulation rounding");
  }
  const double expected_mass = std::accumulate(expected.begin(), expected.end(), 0.) * p.width *
                               p.height / (p.columns * p.rows);
  check(std::abs(odor_mass(f) / expected_mass - 1) < 2e-7,
        "odor channels use their individual decay times");
}
void scent() {
  auto w = small_world(91532);
  w.resize(768, 480);
  auto &f = w.field;
  Food food{156, 132, 0, 0, 90, 600};
  food.age = 90;
  StateAccess::feeding(f).pieces = {food};
  check(f.odor_field(156, 132)[0] == 0, "food starts without an instantaneous distant field");
  f.advance_odor();
  const double initial = odor_mass(f);
  check(initial > 0 && f.odor_field(156, 132)[0] > 0 && f.odor_field(300, 132)[0] == 0,
        "emission creates local scent");
  StateAccess::feeding(f).pieces.clear();
  f.advance_odor();
  check(std::abs(odor_mass(f) / initial - std::exp(-1. / f.env().odor_lifetime_food)) < 1e-6,
        "a removed source leaves a decaying trail");
  const double before = odor_mass(f);
  w.resize(1536, 960);
  check(std::abs(odor_mass(f) - before) < before * 2e-6,
        "resize conserves all seven transported odor channels");
  auto clone = w.fork();
  check(saved(w) == saved(clone), "odor survives save and load");
  f.advance_odor();
  clone.field.advance_odor();
  check(saved(w) == saved(clone), "odor resumes with the same next step");
  auto &p = StateAccess::food_web(f).plankton;
  p.nonempty = true;
  p.energy[3 * p.columns + 3] = 100;
  check(f.odor_field(84, 84)[4] == 0, "plankton density is not an extra smell sensor");
  f.advance_odor();
  check(f.odor_field(84, 84)[4] > 0, "plankton emits into the transported odor field");
  p.energy[3 * p.columns + 3] = 0;
  check(f.odor_field(84, 84)[4] > 0, "a vanished plankton source leaves its scent behind");
}
void nose_adaptation(const Genome &base) {
  cppn::CPPN query(base.cppn);
  auto tissue = std::make_shared<field::Substrate>(query);
  for (int i = 0; i < 4; ++i) {
    auto n = sensor(i + 1, i % 2 ? 1 : -1, .5, 0, 1);
    n.parameters.time_constant = i < 2 ? 0 : 1;
    tissue->neurons.push_back(n);
  }
  auto binding = std::make_shared<BrainInterface>(*anatomical_interface(*tissue));
  for (auto &r : binding->sensory) {
    r.scents = {1, 0, 0, 0, 0, 0, 0, 0};
    r.response_threshold = .03f;
  }
  Genome g = base;
  g.blueprint = tissue;
  g.interface = binding;
  auto w = small_world(1819);
  auto &field = w.field;
  field.sync_food_web();
  auto &grid = StateAccess::food_web(field).plankton;
  auto concentration = [&](double value) {
    std::fill(grid.odor.begin(), grid.odor.end(), 0.f);
    for (std::size_t i = 0; i < grid.energy.size(); ++i)
      grid.odor[7 * i] = value;
  };
  Body b;
  b.x = 200;
  b.y = 180;
  b.tissue = 40;
  auto &p = StateAccess::perception(b);
  concentration(.4);
  // Paused inspection must not initialize or advance biological adaptation.
  b.refresh_senses(g, field);
  check(p.adapted.empty(), "inspection leaves a fresh nose unadapted");
  sense_generated(b, g, field);
  const float first = p.sensor_buffer[0];
  for (auto signal : p.sensor_buffer)
    check(std::abs(signal - first) < 1e-6, "equal concentrations have equal full responses");
  check(std::abs(p.adapted[0] - .1) < 1e-6 && std::abs(p.adapted[2] - .4 / 48) < 1e-6,
        "inherited endpoint time constants adapt over four and forty-eight steps");
  const auto mean = p.adapted;
  for (int i = 0; i < 8; ++i)
    b.refresh_senses(g, field);
  check(p.adapted == mean, "repeated UI refresh never advances the nose");
  sense_generated(b, g, field);
  check(p.sensor_buffer[0] < p.sensor_buffer[2] && p.sensor_buffer[2] < first,
        "steady odor adapts at the receptor's inherited rate");
  for (int i = 0; i < 120; ++i)
    sense_generated(b, g, field);
  check(std::abs(p.sensor_buffer[0] - .4 / (.4 + .4 + .03)) < 1e-6,
        "adaptation keeps a sustained concentration response");
  concentration(0);
  for (int i = 0; i < 40; ++i)
    sense_generated(b, g, field);
  check(p.sensor_buffer == std::vector<float>(4, 0) && p.adapted[0] < p.adapted[2],
        "clean water creates no signal and restores sensitivity at the inherited rate");
  concentration(.4);
  sense_generated(b, g, field);
  check(p.sensor_buffer[0] > p.sensor_buffer[2], "recovery affects the next odor encounter");
  // A unilateral input is sampled from the field, with no computed contralateral gain.
  for (std::size_t i = 0; i < grid.energy.size(); ++i)
    grid.odor[7 * i] = float(.002 * (i / grid.columns));
  p.adapted.assign(4, 0);
  const auto left = olfactory_position(b, *binding, 0), right = olfactory_position(b, *binding, 1);
  sense_generated(b, g, field);
  check(near(p.sensor_buffer[0], sensory_response(field.odor_field(left.x, left.y)[0], .03f)) &&
            near(p.sensor_buffer[1], sensory_response(field.odor_field(right.x, right.y)[0], .03f)),
        "each nose response depends on its own field concentration");
  p.disabled_senses[1] = true;
  const auto disabled_mean = p.adapted;
  sense_generated(b, g, field);
  check(p.sensor_buffer == std::vector<float>(4, 0) && p.adapted == disabled_mean,
        "a disabled nose contributes no input and has no hidden adaptation step");

  // Current checkpoint stores every receptor's accumulated concentration exactly.
  auto &individual = adult(w, base, 300, 200);
  auto &stored = StateAccess::perception(individual.body);
  stored.sensor_buffer.assign(base.interface->sensory.size(), 0);
  stored.adapted.resize(stored.sensor_buffer.size());
  for (std::size_t i = 0; i < stored.adapted.size(); ++i)
    stored.adapted[i] = float(.125 * (i % 7));
  auto copy = w.fork();
  check(copy.fish[0].body.perception().adapted == stored.adapted,
        "adaptation state survives current checkpoint roundtrip");
  check(saved(w) == saved(copy), "odor state does not add transient data to a checkpoint");
}
void manual_release(const Genome &g) {
  auto w = small_world(91539);
  auto &p = adult(w, g, 100, 100);
  auto &r = StateAccess::reproduction(p.body);
  r.sperm_store = 0;
  r.sperm_signal_color = {0.2, 0.6, 0.8};
  const double reserve = p.body.energy;
  check(w.release_sperm(p, true), "manual cloud works with empty store");
  check(w.sperm.size() == 1 && sperm_mass(w) > 0 && r.sperm_store == 0 &&
            p.body.energy == reserve && w.sperm[0].parent == p.id &&
            w.sperm[0].color == r.sperm_signal_color,
        "manual cloud uses fish color without consuming reserve or store");
  check(w.release_sperm(p, true) && w.sperm.size() == 2, "manual release can be repeated");
  r.sperm_store = 40;
  r.sperm_color = {0.4, 0.3, 0.2};
  check(w.release_sperm(p, true) && r.sperm_store == 40 && p.body.energy == reserve,
        "manual release also preserves a filled store");
  check(w.release_sperm(p) && r.sperm_store == 0, "natural release consumes the store");
  check(!w.release_sperm(p), "empty store still prevents natural release");
}
void sperm(const Genome &g) {
  auto w = small_world(91533);
  w.resize(768, 480);
  const auto father = adult(w, g, 100, 100).id;
  release(w, g, father, 396, 252, {0, 0, 1});
  check(near(w.field.odor_field(396, 252)[7], w.local_sperm(w.sperm[0], 396, 252)),
        "sperm smell and fertilisation sample the same distribution");
  const auto blue = w.field.sperm_optics(350, 252, 450, 252);
  check(blue.transmission[0] < 1 && near(blue.transmission[2], 1) && blue.scattering[2] > 0,
        "pigment both filters and scatters light");
  const auto clear = w.field.sperm_optics(10, 50, 110, 50);
  check(clear.transmission == std::array<double, 3>{1, 1, 1} &&
            clear.scattering == std::array<double, 3>{},
        "empty sight paths remain unchanged");
  const double released = w.field.food_web().released;
  for (int step = 0; step < 12; ++step)
    w.drift_sperm();
  check(std::abs(sperm_mass(w) + w.field.food_web().released - released - 40) < 1e-8,
        "dissolution is booked exactly once");
  auto clone = w.fork();
  check(saved(w) == saved(clone) &&
            w.field.sperm_field().size() == clone.field.sperm_field().size(),
        "origins, pigmentation and spatial mass survive save/load");
  w.drift_sperm();
  clone.drift_sperm();
  check(saved(w) == saved(clone), "sperm transport resumes deterministically");
  const double before = sperm_mass(w) + w.field.food_web().released;
  w.resize(1536, 960);
  check(std::abs(sperm_mass(w) + w.field.food_web().released - before) < 1e-8,
        "resize remaps origins and accounts losses once");
  check(saved(w) == saved(w.fork()), "resized sperm state is immediately saveable");
  auto mating = small_world(91534);
  mating.resize(768, 480);
  mating.evo.recruitment_target = 0;
  const auto parent = adult(mating, g, 100, 100).id;
  for (int i = 0; i < 6; ++i)
    egg(mating, g);
  // Two sub-portion origins jointly exceed the local concentration threshold.
  for (auto color : {std::array<double, 3>{1, 0, 0}, std::array<double, 3>{0, 0, 1}})
    release(mating, g, parent, 396, 252, color, 1.5);
  const double material = sperm_mass(mating);
  StateAccess::reproduce(mating);
  check(std::all_of(mating.fish.begin() + 1, mating.fish.end(),
                    [](const auto &p) { return p.fertilised; }),
        "one local mixture fertilises multiple eggs without a per-origin store threshold");
  check(near(sperm_mass(mating), material), "fertilisation does not consume sperm");
  const auto &cell = mating.field.sperm_field()[10 * mating.field.food_web().plankton.columns + 16];
  check(cell.density > 0 && near(cell.color[0], .5) && near(cell.color[2], .5),
        "overlapping origins retain a mass-weighted visible color");
  auto block = small_world(91535);
  block.resize(768, 480);
  const auto owner = adult(block, g, 100, 100).id;
  release(block, g, owner, 156, 132, {1, 1, 1});
  block.sperm[0].cells = {{std::uint32_t(5 * block.field.food_web().plankton.columns + 16), 40}};
  block.refresh_sperm_field();
  block.obstacle(156, 132, 25);
  check(!block.sperm.empty() && near(sperm_mass(block), 40),
        "covering an old release point preserves material that has drifted away");
}
}
int main() {
  try {
    transport();
    sampling();
    scent();
    dense_scent();
    const auto g = Genome::load("genomes/cppn-start.genome");
    nose_adaptation(g);
    manual_release(g);
    sperm(g);
    std::cout << "Geruch, Strömung, Spermien, Befruchtung, Licht und Speicherung: OK\n";
  } catch (const std::exception &e) {
    std::cerr << "Wasserfelder: " << e.what() << '\n';
    return 1;
  }
}
