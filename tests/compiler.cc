#include "../werkzeug/atelier_import.hh"
#include <cassert>
#include <iostream>

using namespace atelier;
Plan cells(int count) {
  Plan p;
  for (std::size_t i = 0; i < field::DEVELOPMENT_SITES && int(p.groups.size()) < count; ++i) {
    const auto at = field::development_site(i);
    Group g;
    g.organ = int(i);
    g.name = "cell" + std::to_string(i);
    g.zone = at.zone;
    g.side = int(at.side);
    g.u0 = g.u1 = at.u;
    g.v0 = g.v1 = at.v;
    g.w0 = g.w1 = at.w;
    g.threshold = .2f;
    p.groups.push_back(g);
  }
  return p;
}
int main() {
  fishsim::Genome::begin_run(34981);
  {
    auto plan = cells(1);
    auto &r = plan.groups.front().receptors;
    r[field::Excitation] = {true, -.2f, .4f, .1f, 0, 0, 1};
    r[field::Teaching] = {true, .1f, -.7f, .2f, 0, 1, 2};
    r[field::Learning] = {true, .3f, .5f, .4f, 0, 2, 0};
    fishsim::Genome g;
    g.cppn = Builder().build(plan);
    g.compile(false);
    assert(assess(plan, g).ok());
    const auto imported = import_plan(g);
    for (const int effect : {field::Excitation, field::Teaching, field::Learning}) {
      const auto &before = r[effect], &after = imported.groups.front().receptors[effect];
      assert(after.active && before.substance == after.substance);
      assert(std::abs(before.baseline - after.baseline) < 1e-5f);
      assert(std::abs(before.sensitivity - after.sensitivity) < 1e-5f);
      assert(std::abs(before.half - after.half) < 1e-5f);
    }
    assert(assess(imported, g).ok());
  }
  {
    const auto original = fishsim::Genome::load(fishsim::HAND_BUILT_GENOME);
    auto plan = import_plan(original);
    assert(assess(plan, original).ok());
    fishsim::Genome rebuilt;
    rebuilt.cppn = Builder().build(plan);
    rebuilt.development_seed = plan.development_seed;
    rebuilt.variation_seed = plan.variation_seed;
    rebuilt.compile(false);
    assert(assess(plan, rebuilt).ok());
    assert(rebuilt.viable() == original.viable());
    const auto &before = *original.blueprint, &after = *rebuilt.blueprint;
    assert(before.neurons.size() == after.neurons.size());
    assert(before.edges.size() == after.edges.size());
    for (std::size_t i = 0; i < before.edges.size(); ++i) {
      const auto &a = before.edges[i], &b = after.edges[i];
      assert(a.source == b.source && a.target == b.target);
      assert(std::abs(a.weight - b.weight) < 1e-5);
    }
  }
  for (int count : {20, 80}) {
    auto p = cells(count);
    fishsim::Genome g;
    g.cppn = Builder().build(p);
    g.compile(false);
    assert(g.blueprint->neurons.size() == std::size_t(count));
    for (const auto &e : g.cppn->get_connection_genes())
      assert(std::abs(e.get_weight()) <= 2);
    cppn::CPPN net(g.cppn);
    assert(cppn::Program(net).safe());
    for (const auto &e : g.cppn->get_connection_genes())
      if (e.get_source() == cppn::BIAS && e.get_target() == cppn::INPUTS + out::expression)
        assert(e.get_weight() == -1);
    const auto &edge = *std::find_if(
        g.cppn->get_connection_genes().begin(), g.cppn->get_connection_genes().end(),
        [](const auto &e) { return e.get_target() == cppn::INPUTS + out::threshold; });
    std::vector<float> before;
    for (std::size_t i = 0; i < field::DEVELOPMENT_SITES; ++i)
      before.push_back(net.query_view(field::development_site(i))[out::threshold]);
    g.cppn->edit_connection(edge.get_innovation_number(), edge.get_weight() + .02f, true);
    cppn::CPPN changed(g.cppn);
    int differences = 0;
    for (std::size_t i = 0; i < field::DEVELOPMENT_SITES; ++i)
      differences +=
          std::abs(before[i] - changed.query_view(field::development_site(i))[out::threshold]) >
          1e-5;
    assert(differences == 1);
    for (const auto &node : g.cppn->get_node_genes())
      if (node.get_type() == NodeType::CUTOFF)
        g.cppn->edit_node(node.get_id(), node.get_weight() + .001f, node.get_type());
    g.compile(false);
    assert(g.blueprint->neurons.size() == std::size_t(count));
  }
  {
    auto shared = cells(3);
    shared.groups[1].organ = shared.groups[0].organ;
    auto genes = Builder().build(shared);
    const auto &edge = *std::find_if(
        genes->get_connection_genes().begin(), genes->get_connection_genes().end(),
        [](const auto &e) { return e.get_target() == cppn::INPUTS + out::threshold; });
    genes->edit_connection(edge.get_innovation_number(), edge.get_weight() + .02f, true);
    cppn::CPPN net(genes);
    for (int i = 0; i < 3; ++i)
      assert(std::abs(net.query_view(field::development_site(i))[out::threshold] -
                      (i < 2 ? .22f : .2f)) < 1e-5f);
  }
  assert(field::contact_affinity(0) == 1);
  assert(std::abs(field::contact_affinity(std::log(2.)) - .5) < 1e-12);
  assert(field::contact_affinity(field::CONTACT_SUPPORT) == 0);
  assert(field::contact_affinity_slope(field::CONTACT_CORE) == 0);
  assert(field::contact_affinity_slope(field::CONTACT_SUPPORT) == 0);
  {
    auto plan = cells(8);
    auto first = Builder().build(plan);
    const std::array<evolution::NodeType, 7> types{
        NodeType::LINEAR,  NodeType::SINE, NodeType::COSINE, NodeType::GAUSSIAN,
        NodeType::SIGMOID, NodeType::ABS,  NodeType::POW};
    std::size_t changed = 0;
    for (const auto &node : first->get_node_genes())
      if (node.get_role() == evolution::NodeRole::Hidden)
        first->edit_node(node.get_id(), 1.3f, types[changed++ % types.size()]);
    auto second = std::make_shared<evolution::Genome>(*first);
    cppn::CPPN a(first), b(second);
    cppn::Program batch(a), single(b);
    std::array<cppn::Point, cppn::BATCH> points;
    std::array<std::array<float, cppn::OUTPUTS>, cppn::BATCH> values, one;
    for (std::size_t i = 0; i < points.size(); ++i) {
      points[i] = field::development_site(i);
      if (i % 3)
        points[i].effect = field::receptor_effect_code(int(i % field::HORMONE_EFFECTS));
    }
    // A replay can populate the value cache before work recording resumes.
    batch.evaluate(points.data(), points.size(), cppn::ALL_OUTPUTS, values, false);
    single.evaluate(points.data(), 1, cppn::ALL_OUTPUTS, one, false);
    batch.evaluate(points.data(), points.size(), cppn::ALL_OUTPUTS, values, true);
    for (std::size_t i = 0; i < points.size(); ++i) {
      single.evaluate(&points[i], 1, cppn::ALL_OUTPUTS, one, true);
      assert(values[i] == one[0]);
      assert(std::equal(values[i].begin(), values[i].end(), a.query_view(points[i]).begin()));
    }
    std::ostringstream left, right;
    first->write(left);
    second->write(right);
    assert(left.str() == right.str());
  }
  {
    constexpr std::size_t COUNT = 257;
    std::vector<field::Neuron> neurons(COUNT);
    std::vector<field::ContactScale> scales;
    field::ContactIndex index;
    for (std::size_t i = 0; i < COUNT; ++i) {
      auto &n = neurons[i];
      n.role = field::Role::Nerve;
      n.sender = n.receiver = {float(2 * field::unit_center(field::splitmix(i)) - 1),
                               float(2 * field::unit_center(field::splitmix(i + COUNT)) - 1)};
      n.search_width = float(i % 9) / 8;
      scales.emplace_back(n);
      index.add(n, std::uint32_t(i));
    }
    std::vector<std::uint32_t> selected;
    for (std::size_t target = 0; target < COUNT; ++target) {
      index.candidates(neurons[target], scales[target], COUNT, selected);
      for (std::size_t source = 0; source < COUNT; ++source)
        if (field::contact_parameters(neurons[source], neurons[target], 2, scales[source],
                                      scales[target])
                .probability > 0)
          assert(std::binary_search(selected.begin(), selected.end(), source));
    }
  }
  auto p = cells(4);
  for (auto &g : p.groups) {
    g.copies = 4;
    g.threshold = 0;
  }
  p.connections = {{0, 3, 0, 0}, {1, 3, 1, 0}};
  const auto fit = plan_addresses(p);
  fishsim::Genome g;
  g.cppn = Builder().build(p);
  g.development_seed = 1;
  g.variation_seed = 2;
  g.compile(false);
  const auto checked = assess(p, g);
  assert(checked.ok() && checked.additional == 0 && fit.evaluations > 0);
  // Budget boundaries cross preparation, query batches, copy draws, SCC traversal and SIMD
  // layout. Every split must keep both the immutable brain and mutation observations identical.
  auto fresh = [&] {
    fishsim::Genome result;
    result.cppn = std::make_shared<evolution::Genome>(*g.cppn);
    result.development_seed = g.development_seed;
    result.variation_seed = g.variation_seed;
    return result;
  };
  auto whole = fresh();
  whole.compile(true);
  for (std::size_t quantum : {1u, 29u, 257u}) {
    auto split = fresh();
    std::size_t calls = 0;
    while (!split.blueprint) {
      const auto before = split.pending_work();
      split.advance_development(quantum, true);
      const auto after =
          split.blueprint ? split.blueprint->development_work() : split.pending_work();
      assert(after >= before && after - before <= quantum);
      assert(++calls <= field::DEVELOPMENT_WORK_LIMIT);
    }
    const auto &a = *whole.blueprint, &b = *split.blueprint;
    assert(a.development_work() == b.development_work() && a.queries == b.queries);
    assert(a.neurons.size() == b.neurons.size() && a.edges.size() == b.edges.size());
    assert(a.recurrent_edges == b.recurrent_edges && a.built_length == b.built_length);
    assert(a.partner_offset == b.partner_offset && a.partners.size() == b.partners.size());
    for (std::size_t i = 0; i < a.neurons.size(); ++i) {
      const auto &x = a.neurons[i], &y = b.neurons[i];
      assert(x.id == y.id && x.group == y.group && x.slots == y.slots && x.identity == y.identity &&
             x.x == y.x && x.y == y.y && x.z == y.z && x.strength == y.strength);
    }
    for (std::size_t i = 0; i < a.edges.size(); ++i)
      assert(a.edges[i].source == b.edges[i].source && a.edges[i].target == b.edges[i].target &&
             a.edges[i].weight == b.edges[i].weight);
    for (std::size_t i = 0; i < a.partners.size(); ++i)
      assert(a.partners[i].source == b.partners[i].source && a.partners[i].p == b.partners[i].p &&
             a.partners[i].strength == b.partners[i].strength);
    std::ostringstream left, right;
    whole.cppn->write(left);
    split.cppn->write(right);
    assert(left.str() == right.str());
    field::Network first(whole.blueprint), second(split.blueprint);
    for (int step = 0; step < 12; ++step) {
      first.step({});
      second.step({});
    }
    std::ostringstream first_runtime, second_runtime;
    first.write_runtime(first_runtime);
    second.write_runtime(second_runtime);
    assert(first_runtime.str() == second_runtime.str());
  }
  // A valid-looking initial draw cannot mask forbidden candidates in future turnover.
  auto broad = p;
  for (auto &cell : broad.groups) {
    cell.sender1 = cell.sender2 = cell.receiver1 = cell.receiver2 = 0;
    cell.sigma = 2;
  }
  fishsim::Genome leaky;
  leaky.cppn = Builder().build(broad);
  leaky.compile(false);
  assert(!assess(broad, leaky).ok());
  auto tolerant = p;
  tolerant.groups[0].copies = 5;
  assert(!assess(tolerant, g).ok());
  tolerant.options.capacityTolerance = .25f;
  assert(assess(tolerant, g).ok());
  auto traits = p;
  traits.groups[0].threshold = .1f;
  assert(!assess(traits, g).ok());
  traits.options.traitTolerance = .05f;
  assert(assess(traits, g).ok());
  auto hormones = p;
  hormones.groups[0].receptors[field::Output].active = true;
  hormones.groups[0].receptors[field::Output].baseline = .5f;
  assert(!assess(hormones, g).ok());
  hormones.options.traitTolerance = .25f;
  assert(assess(hormones, g).ok());
  p.connections.push_back({2, 3, 2, 0});
  assert(!assess(p, g).ok());
  std::cout << "Compiler: local traits, stable sites, weight bounds and planned contacts passed\n";
}
