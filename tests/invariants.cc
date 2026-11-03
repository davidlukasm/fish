// Lasting rules of the simulation, independent of balance values: a closed tank never creates
// energy, a restored checkpoint continues exactly like the running tank, a starving fish
// breaks down tissue without losing maturity, and a body grows only while a hormone occupies its
// growth receptor.
#include "test_support.hh"
#include <map>
using namespace test;
namespace {
// The standard tank with its rocks, plants and small animals, FISH adult fish SPACING apart from
// FIRST_X at DEPTH, run for STEPS steps.
constexpr unsigned SEED = 4242;
constexpr int FISH = 4, STEPS = 120;
constexpr double FIRST_X = 200, SPACING = 300, DEPTH = 200;
// The tank receives no energy from outside: no supply, no assistance, no bursts, no mutation.
Ecosystem closed_tank(const Genome &g) {
  Ecosystem w(SEED);
  w.starter_world();
  w.set_parameter("energy_supply", 0);
  w.safety = false;
  w.evo.assist_min_population = w.evo.assist_species_minimum = 0;
  w.food_burst.strength = 0;
  no_mutation(w);
  for (int k = 0; k < FISH; ++k)
    adult(w, g, FIRST_X + k * SPACING, DEPTH);
  return w;
}
// Energy in the tank plus what left it into the water, minus what was introduced.
double tracked_energy(const Ecosystem &w) {
  const auto &web = w.field.food_web();
  return w.total_energy() + web.released - web.introduced;
}
void closed_tank_creates_no_energy(const Genome &g) {
  auto w = closed_tank(g);
  double before = tracked_energy(w);
  for (int step = 0; step < STEPS; ++step) {
    w.tick();
    const double now = tracked_energy(w);
    check(now <= before + tolerance::precision * std::max(1., before),
          "a closed tank never creates energy");
    before = now;
  }
}
// Fish without reserve live on their tissue; their brains keep the maturity they reached.
void maturity_never_decreases(const Genome &g) {
  auto w = closed_tank(g);
  std::map<std::uint64_t, double> tissue, maturity;
  for (auto &p : w.fish) {
    p.body.energy = 0;
    tissue[p.id] = p.body.tissue;
    maturity[p.id] = 0;
  }
  bool starved = false;
  for (int step = 0; step < STEPS; ++step) {
    w.tick();
    for (const auto &p : w.fish)
      if (maturity.count(p.id) && p.body.alive && p.body.brain()) {
        const double now = p.body.brain()->maturity();
        check(now >= maturity[p.id], "maturity never decreases");
        maturity[p.id] = now;
        starved |= p.body.tissue < tissue[p.id];
      }
  }
  check(starved, "a fish without reserve breaks down tissue");
}
// Young fish with a full gut: those whose glands are silenced keep their size, the others grow.
constexpr double YOUNG_TISSUE = 20, FULL_GUT = 300;
void growth_needs_a_hormone(const Genome &g) {
  auto w = closed_tank(g);
  std::map<std::uint64_t, bool> silenced;
  std::map<std::uint64_t, double> tissue;
  for (std::size_t k = 0; k < w.fish.size(); ++k) {
    auto &b = w.fish[k].body;
    b.tissue = b.peak_tissue = YOUNG_TISSUE;
    b.gut_energy = b.gut_digestible = FULL_GUT;
    silenced[w.fish[k].id] = k % 2;
    if (k % 2)
      for (const auto &e : g.interface->effectors)
        if (e.port == organ_port::gland)
          b.mute_neuron(e.neuron);
  }
  // Hormones last at most TIME_CONSTANT_MIN x TIME_CONSTANT_SPAN steps after the glands fall
  // silent.
  const int decay = int(field::TIME_CONSTANT_MIN * field::TIME_CONSTANT_SPAN) * 2;
  for (int step = 0; step < STEPS + decay; ++step) {
    w.tick();
    if (step == decay)
      for (const auto &p : w.fish)
        tissue[p.id] = p.body.tissue;
  }
  bool grew = false;
  for (const auto &p : w.fish)
    if (p.body.alive && tissue.count(p.id)) {
      if (silenced[p.id])
        check(p.body.tissue <= tissue[p.id], "a body without growth hormone does not grow");
      else
        grew |= p.body.tissue > tissue[p.id];
    }
  check(grew, "a body with growth hormone grows");
}
void checkpoint_continues_exactly(const Genome &g) {
  auto w = closed_tank(g);
  for (int step = 0; step < STEPS / 2; ++step)
    w.tick();
  auto copy = w.fork();
  check(saved(w) == saved(copy), "a checkpoint restores the whole tank");
  for (int step = 0; step < STEPS / 2; ++step) {
    w.tick();
    copy.tick();
  }
  check(saved(w) == saved(copy), "a restored tank continues exactly like the original");
}
}
int main() {
  try {
    Genome::begin_run(SEED);
    const auto g = Genome::load(HAND_BUILT_GENOME);
    closed_tank_creates_no_energy(g);
    checkpoint_continues_exactly(g);
    maturity_never_decreases(g);
    growth_needs_a_hormone(g);
    std::cout << "Energie, Speicherstand, Reife und Wachstum: OK\n";
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
