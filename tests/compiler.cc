#include "../werkzeug/atelier_connections.hh"
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
    // The former global expression weight grew to count-1 and collapsed at the mutation clamp.
    for (const auto &e : g.cppn->get_connection_genes())
      if (e.get_source() == cppn::BIAS && e.get_target() == cppn::INPUTS + out::expression)
        assert(e.get_weight() == -1);
    // A trait weight is local to its group, including at unoccupied development sites.
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
    // Small changes to every spatial boundary retain the chosen grid sites.
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
  // Binding is smooth, preserves the half-height and has exact finite support.
  assert(field::contact_affinity(0) == 1);
  assert(std::abs(field::contact_affinity(std::log(2.)) - .5) < 1e-12);
  assert(field::contact_affinity(field::CONTACT_SUPPORT) == 0);
  assert(field::contact_affinity_slope(field::CONTACT_CORE) == 0);
  assert(field::contact_affinity_slope(field::CONTACT_SUPPORT) == 0);
  {
    auto plan = cells(8);
    auto first = Builder().build(plan);
    auto second = std::make_shared<evolution::Genome>(*first);
    cppn::CPPN a(first), b(second);
    cppn::Program batch(a), single(b);
    std::array<cppn::Point, cppn::BATCH> points;
    std::array<std::array<float, cppn::OUTPUTS>, cppn::BATCH> values, one;
    for (std::size_t i = 0; i < points.size(); ++i)
      points[i] = field::development_site(i);
    batch.evaluate(points.data(), points.size(), cppn::ALL_OUTPUTS, values, true);
    for (std::size_t i = 0; i < points.size(); ++i) {
      single.evaluate(&points[i], 1, cppn::ALL_OUTPUTS, one, true);
      assert(values[i] == one[0]);
      assert(std::equal(values[i].begin(), values[i].end(), a.query_view(points[i]).begin()));
    }
    std::ostringstream left, right;
    first->write(left);
    second->write(right);
    assert(left.str() == right.str()); // mutation observations keep their exact query order
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
  // Capacity tolerances apply to the intended cell count.
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
  // Validation catches a missing required connection even with an otherwise valid fish.
  p.connections.push_back({2, 3, 2, 0});
  assert(!assess(p, g).ok());
  std::cout << "Compiler: local traits, stable sites, weight bounds and planned contacts passed\n";
}
