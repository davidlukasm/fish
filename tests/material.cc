#include "test_support.hh"
#include "founder_pool.hh"
using namespace test;
namespace {
std::string brain_saved(const field::Network &b) {
  std::ostringstream s;
  b.write_runtime(s);
  return s.str();
}
void food_rebalance() {
  Ecosystem w(18018);
  auto &f = w.field;
  Food grain{100, 100, 0, 0, 0, 100};
  grain.radius = food_radius(grain.energy);
  f.append_fragment(grain);
  const auto index = f.feeding().pieces.size() - 1;
  f.bite_food(index, 75, true);
  check(f.feeding().pieces[index].bitten && near(f.feeding().pieces[index].radius, 2),
        "fish bite marks the remainder and preserves area per energy");
  Food crumb{120, 100, 0, 0, 0, 12.5};
  crumb.radius = food_radius(crumb.energy);
  const auto count = f.feeding().pieces.size();
  f.append_fragment(crumb);
  check(f.feeding().pieces.size() == count, "unbitten crumbs become detritus");
  crumb.bitten = true;
  f.append_fragment(crumb);
  check(f.feeding().pieces.size() == count + 1, "fish bite survives at the half threshold");
  const double total = w.total_energy() + f.food_web().released;
  f.bite_food(count, 1);
  check(f.feeding().pieces[count].energy == 0 &&
            near(w.total_energy() + f.food_web().released, total - 1),
        "plankton consumption transfers the tiny remainder to detritus exactly once");
  Ecosystem copy(18019);
  std::istringstream in(saved(w));
  copy.read(in);
  check(copy.field.feeding().pieces[index].bitten, "food bite flag survives save and load");
}
void lifecycle(const Genome &g) {
  Body b;
  b.energy = 800;
  b.x = b.y = 200;
  b.identity = 73;
  Field world(1, 0);
  b.prepare(g);
  const double initial = stored_energy(b);
  double spent = 0;
  for (int i = 0; i < 110; ++i) {
    advance_body(b, g, &world, {});
    settle_energy(b);
    spent += b.ledger().development_cost + b.ledger().movement_cost + b.ledger().brain_cost;
  }
  check(b.alive && !b.hatched && b.development()->ready(),
        "construction alone must not hatch a quiet egg");
  check(b.tissue >= HATCH_TISSUE && b.brain()->learning_steps() == 110,
        "body grows and brain learns in egg");
  check(std::abs(initial - stored_energy(b) - spent) < 1e-6,
        "egg pays construction, upkeep and action once; tissue transfer conserves energy");
  auto &m = StateAccess::motor(b);
  m.impulse_forward = 100;
  m.motor_factor = 1;
  advance_embryo(b, g, {});
  check(!b.hatched, "force cannot open an intact shell");
  b.embryo.shell = .1;
  m.impulse_forward = 0;
  advance_embryo(b, g, {});
  check(!b.hatched, "secretion without a contraction cannot hatch");
  const auto learned = brain_saved(*b.brain());
  const double tissue = b.tissue, energy = b.energy;
  m.impulse_forward = 100;
  advance_embryo(b, g, {});
  check(b.hatched && birth_exposure(b, 8) == 0, "paid force opens softened shell");
  check(b.tissue == tissue && b.energy == energy && brain_saved(*b.brain()) == learned,
        "hatch preserves tissue, energy and brain");
  advance_body(b, g, &world, {});
  check(birth_exposure(b, 8) > 0 && birth_exposure(b, 8) < 1,
        "birth gradually exposes real inputs");
  Body dying;
  dying.prepare(g);
  dying.embryo.target_tissue = 20;
  dying.tissue = 20;
  dying.energy = hatch_search_reserve(dying) - .01;
  settle_energy(dying);
  check(!dying.alive && !dying.hatched && dying.energy > 0,
        "positive death reserve never triggers emergency hatch");
}
void senses(const Genome &g) {
  Body b;
  b.prepare(g);
  b.energy = 700;
  b.tissue = 20;
  b.x = b.y = 200;
  auto frame = prepare_sensory_frame(b, 0);
  frame.relative.fill({50, 30});
  BrainInterface::Receptor r{};
  r.channel = 2;
  r.senses[2] = 1;
  r.spatial_width = 1;
  r.response_threshold = .1;
  check(anatomical_stimulus(b, r, frame, 1, {}) == 0,
        "outer water cannot stimulate egg lateral line");
  b.embryo.flow.fill(.7);
  check(near(anatomical_stimulus(b, r, frame, 1, {}), .7),
        "inner fluid motion reaches lateral receptors");
  r.senses = {};
  r.channel = 3;
  r.senses[3] = 1;
  b.embryo.touch.fill(.4);
  check(near(anatomical_stimulus(b, r, frame, 1, {}), .4),
        "egg touch reports shell contact rather than outer sediment");
  r.senses = {};
  r.channel = 10;
  r.senses[10] = 1;
  r.hormones = {0, 0, 0, 1};
  StateAccess::hormones(b).set_levels({0, 0, 0, .8});
  check(near(anatomical_stimulus(b, r, frame, 0, {}), .8), "fourth hormone reaches hormone sense");
}
void birth_and_pressure(const Genome &g) {
  Body b;
  b.hatched = true;
  b.age = 103;
  b.hatch_age = 100;
  check(near(birth_exposure(b, 4), .75) && near(birth_exposure(b, 48), .0625),
        "birth exposure follows each receptor's inherited time constant");
  b.prepare(g);
  b.tissue = 20;
  b.energy = 800;
  b.egg_shell_radius = body_radius(b);
  PhysiologyParameters p;
  p.embryo_crowding = .1;
  advance_embryo(b, g, p, true);
  check(near(b.embryo.pressure, p.embryo_fold - p.embryo_crowding),
        "existing tissue counts once, even before construction advances");
  p.embryo_crowding = 1;
  advance_embryo(b, g, p, true);
  check(b.embryo.pressure == 0, "crowding threshold is a physiology parameter");
}
void hormones(const Genome &g) {
  HormoneState h;
  h.set_levels({.8, .8, .8, .8});
  h.advance({0, 0, 0, 2}, {}, 1, {}, {4, 8, 16, 32});
  check(h.levels()[3] > h.levels()[2] && h.levels()[2] > h.levels()[1],
        "all four hormonal dynamics are independent");
  std::stringstream stream;
  stream.precision(17);
  h.write(stream);
  HormoneState copy;
  copy.read(stream);
  check(h.levels() == copy.levels(), "four hormones serialize exactly");
  field::HormoneReceptor r;
  r.affinity = {0, 0, 0, 1};
  r.baseline = -1;
  r.sensitivity = 2;
  check(r.response({}) == -1 && r.response({0, 0, 0, 1}) > 0,
        "CPPN receptor baseline and gain govern response");
  field::Network n(g.blueprint);
  n.step(std::vector<float>(g.interface->sensory.size()), {.1, .2, .3, .4}, 7);
  auto saved = brain_saved(n);
  std::stringstream in(saved);
  field::Network restored(g.blueprint);
  restored.read_runtime(in);
  n.step(std::vector<float>(g.interface->sensory.size()));
  restored.step(std::vector<float>(g.interface->sensory.size()));
  check(brain_saved(n) == brain_saved(restored), "hormonal runtime survives resumption");
}
void neuronal_control(const Genome &g) {
  cppn::CPPN query(g.cppn);
  auto plan = std::make_shared<field::Substrate>(query);
  auto nerve = sensor(2, 0, 0);
  nerve.role = field::Role::Nerve;
  nerve.functions.senses = {};
  nerve.functions.internal = 1;
  nerve.parameters.plasticity = 0;
  auto &r = nerve.hormone_receptors[field::Excitation];
  r.affinity = {0, 0, 0, 1};
  r.sensitivity = 1;
  r.half = .01;
  plan->neurons = {sensor(1, 0, 0), nerve, motor(3, 0, 0, 0, field::Forward)};
  plan->edges = {{0, 1, .2f}, {1, 2, .2f}};
  field::Network low(plan), high(plan);
  auto initial = high.synapses();
  for (int i = 0; i < 20; ++i) {
    low.step({.4f}, {0, 0, 0, 0}, 5);
    high.step({.4f}, {0, 0, 0, .8}, 5);
  }
  check(high.state()[1] > low.state()[1], "fourth hormone changes actual neuronal excitation");
  auto after = high.synapses();
  check(initial.size() == after.size(), "zero genetic plasticity preserves topology");
  for (std::size_t i = 0; i < initial.size(); ++i)
    check(near(initial[i].weight, after[i].weight),
          "hormones cannot create plasticity when its genetic base is zero");
}
void secretion_and_save(const Genome &g) {
  auto w = small_world(71);
  check(w.spawn(g, 200, 200, 0, 0, 0, 800), "egg placed");
  auto &p = w.fish.back();
  p.genome = g;
  StateAccess::brain(p.body).reset();
  StateAccess::development(p.body).reset();
  p.body.prepare(g);
  p.body.tissue = 20;
  p.body.embryo.target_tissue = 20;
  p.body.embryo.secretion = 2;
  StateAccess::reproduction(p.body).sperm_release = true;
  const auto before = stored_energy(p.body);
  StateAccess::reproduce(w, false);
  check(w.sperm.size() == 1 && !w.sperm[0].fertile && !w.fish[0].body.hatched,
        "egg releases nonfertile ink even when reproduction is disabled");
  check(near(stored_energy(w.fish[0].body) + w.sperm[0].energy, before) &&
            w.fish[0].body.embryo.shell < 1,
        "secretion conserves material and weakens shell");
  auto copy = w.fork();
  check(saved(w) == saved(copy), "egg mechanics and nonfertile ink survive checkpoint");
  for (int i = 0; i < 8; ++i) {
    w.tick(false);
    copy.tick(false);
  }
  check(saved(w) == saved(copy), "egg simulation resumes deterministically");
}
}
int main() {
  check(food_radius(400) == 8 && food_radius(25) == 2 && food_radius(0) == 0,
        "all food uses the common unclamped area density");
  try {
    food_rebalance();
    Genome::begin_run(18);
    auto base = Genome::load("genomes/cppn-start.genome");
    cppn::CPPN q(base.cppn);
    auto g = quiet(base, q);
    lifecycle(g);
    senses(g);
    birth_and_pressure(g);
    hormones(g);
    neuronal_control(g);
    secretion_and_save(g);
    std::cout << "Material: egg energy, sensory isolation, mechanical hatch, four hormones and "
                 "continuation OK\n";
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
