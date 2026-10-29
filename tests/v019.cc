#include "test_support.hh"
#include "cppn/program.hh"
#include "founder_pool.hh"
#include <set>
using namespace test;
namespace {
std::shared_ptr<evolution::Genome> plain() {
  auto g = std::make_shared<evolution::Genome>(cppn::INPUTS, cppn::OUTPUTS);
  for (int i = 0; i < cppn::INPUTS + cppn::OUTPUTS; ++i)
    g->add_node({i, 1, evolution::NodeType::LINEAR});
  return g;
}
void tor() {
  auto g = plain();
  int gate = cppn::INPUTS + cppn::OUTPUTS;
  g->add_node({gate, 1, evolution::NodeType::TOR});
  check(g->connect(4, gate, 2, 0) && g->connect(7, gate, 1, 1), "TOR ports connect separately");
  g->connect(gate, cppn::INPUTS + cppn::output::expression, 1);
  cppn::CPPN q(g);
  cppn::Program p(q);
  std::array<std::array<float, cppn::OUTPUTS>, 64> out{};
  const cppn::Point points[] = {
      {1, .25, .3, .4, -1, 0}, {2, .9, .2, .1, 1, 0}, {0, .3, .4, .5, 0, 0}};
  p.evaluate(points, 3, cppn::ALL_OUTPUTS, out);
  for (int i = 0; i < 3; ++i) {
    auto reference = q.query_view(points[i]);
    check(near(reference[0], std::min(1.f, 2 * points[i].u) * points[i].side),
          "clamped product including zero gate");
    check(near(out[i][0], reference[0]), "compiled and scalar TOR");
  }
  std::stringstream text;
  g->write(text, true);
  auto copy = plain();
  copy->read(text);
  cppn::CPPN restored(copy);
  check(restored.query_view(points[0]) == q.query_view(points[0]), "TOR ports survive genome save");
  auto before = q.query_view(points[0]);
  check(g->duplicate_subgraph({gate}, nullptr, false), "neutral gate duplication");
  cppn::CPPN doubled(g);
  check(doubled.query_view(points[0]) == before,
        "duplication splits outgoing weights without changing phenotype");
}
void sites() {
  auto g = plain();
  g->connect(cppn::BIAS, cppn::INPUTS + cppn::output::expression, 1);
  // All nerves with one copy; expression and hormone queries have different contexts.
  g->connect(cppn::BIAS, cppn::INPUTS + cppn::output::capacity, -1);
  cppn::CPPN q(g);
  field::Substrate s(q);
  while (!s.advance_development(2048)) {
  }
  check(s.neurons.size() == 360, "four fixed zones have 360 sites");
  std::array<int, 4> zones{};
  std::set<std::uint64_t> ids;
  for (const auto &n : s.neurons) {
    ++zones[n.location.zone];
    ids.insert(n.id);
    check(n.role == field::Role::Nerve, "role middle third");
  }
  check(zones == std::array<int, 4>{48, 96, 96, 120} && ids.size() == 360,
        "zones and bilateral midline identities");
  check(s.queries == 360 * 8, "one cell and seven required hormone queries per nerve group");
  Rng rng(19);
  for (int i = 0; i < 10; ++i) {
    auto fresh = Genome::pool_randomized(rng);
    cppn::CPPN query(fresh.cppn);
    for (int effect = 1; effect <= 7; ++effect) {
      auto v = query.query_view({1, .3, .4, .5, -1, float(effect) / 7});
      check(near(v[cppn::output::capacity], effect == 6 ? 1 : 0) &&
                near(v[cppn::output::field_width], 0),
            "random founders begin hormonally neutral");
    }
  }
}
void death_and_damage(const Genome &g) {
  cppn::CPPN q(g.cppn);
  auto tissue = std::make_shared<field::Substrate>(q);
  auto nerve = sensor(2, 0, 0);
  nerve.role = field::Role::Nerve;
  nerve.functions.senses = {};
  nerve.functions.internal = 1;
  nerve.slots = 4;
  tissue->neurons = {sensor(1, 0, 0), nerve, motor(3, 0, 0, 0, field::Forward)};
  tissue->edges = {{0, 1, .4f}, {1, 2, .4f}};
  for (auto &n : tissue->neurons)
    n.hormone_receptors[field::Output].baseline = 1;
  tissue->neurons[1].hormone_receptors[field::Death].baseline = 1;
  field::Network n(tissue);
  n.step({1});
  check(n.dead(1) && n.dead_count() == 1 && n.signal(1) == 0, "dead cell emits no signal");
  for (auto &e : n.synapses())
    check(e.source != 1 && e.target != 1, "death frees all connections");
  std::stringstream saved;
  n.write_runtime(saved);
  field::Network restored(tissue);
  restored.read_runtime(saved);
  restored.reset_learning();
  check(restored.dead(1), "death persists across save and learning reset");
  Body b;
  b.tissue = 40;
  harm_body(b, .3, 1, 0);
  double sum = 0;
  for (double x : b.damage_sectors)
    sum += x;
  check(near(sum, 1 - b.health), "local sectors sum to health loss");
  check(*std::max_element(b.damage_sectors.begin(), b.damage_sectors.end()) >
            *std::min_element(b.damage_sectors.begin(), b.damage_sectors.end()),
        "directed damage remains local");
  auto world = small_world(19);
  auto &p = adult(world, g);
  harm_body(p.body, .2, 1, 1);
  auto copy = world.fork();
  check(copy.fish[0].body.damage_sectors == p.body.damage_sectors,
        "local damage persists in the world");
}
void pressure_target_and_probe(const Genome &base) {
  cppn::CPPN q(base.cppn);
  auto cells = std::make_shared<field::Substrate>(q);
  auto sensor_cell = sensor(1, .9, .9, 0, 9), gland = motor(2, .9, .9, 0, field::Bladder);
  gland.hormone_receptors[field::Death].baseline = 1;
  cells->neurons = {sensor_cell, gland, motor(3, -.5, -.5, 0, field::Forward)};
  Genome g = base;
  g.blueprint = cells;
  g.interface = anatomical_interface(*cells);
  check(g.interface->sensory[0].pressure_kind == 3,
        "pressure is attached to the nearest real gland");
  Body b;
  b.tissue = 40;
  b.energy = 100;
  b.hatched = true;
  StateAccess::brain(b).emplace(cells);
  StateAccess::brain(b)->step({0});
  b.refresh_organs(g);
  check(b.active_interface(g).sensory[0].pressure_kind == 0,
        "death retargets pressure to the remaining gut");
  b.set_actuation_probe([](std::uint32_t, float) { return 1.f; });
  double impulse = 0;
  for (int i = 0; i < 6; ++i) {
    anatomical_action(b, b.active_interface(g));
    impulse += b.motor().impulse_forward;
  }
  check(impulse > 0 && b.energy < 100,
        "trial intervention uses existing muscles and pays their work");
  check(b.bladder_fill == 0, "intervention cannot revive a dead organ");
}
void fair_production() {
  Field f(19, 0);
  f.set_energy_headroom(60);
  double a = 0, b = 0;
  f.begin_production();
  auto demand = [&](double &target, double amount) {
    f.request_production(amount, [&f, &target](double grant) {
      target += grant;
      f.set_energy_headroom(f.energy_available - grant);
      return grant;
    });
  };
  demand(a, 30);
  demand(b, 90);
  f.finish_production();
  check(near(a, 15) && near(b, 45) && near(f.energy_available, 0),
        "limited tank headroom is shared proportionally");
  f.set_energy_headroom(60);
  a = b = 0;
  f.begin_production();
  f.request_production(30, [](double) { return 0.; });
  demand(b, 90);
  f.finish_production();
  check(near(b, 60), "failed settlement frees capacity within the same step");
}

}
int main() {
  try {
    tor();
    sites();
    auto g = Genome::load("genomes/cppn-start.genome");
    cppn::CPPN q(g.cppn);
    death_and_damage(quiet(g, q));
    pressure_target_and_probe(g);
    fair_production();
    std::cout << "v019: TOR, zones, neutral receptors, cell death and local damage: OK\n";
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
