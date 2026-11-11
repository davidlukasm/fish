#include "../werkzeug/atelier_connections.hh"
#include <cassert>
#include <iostream>

using namespace atelier;
void duplication_uses_shared_limits() {
  constexpr int INPUT = 0, OUTPUT = 1, ROOT = 2;
  constexpr float INITIAL_WEIGHT = .5f;
  for (int count : {evolution::MAX_GENOME_NODES / 2, evolution::MAX_GENOME_NODES - 1,
                    evolution::MAX_GENOME_NODES}) {
    evolution::Genome net(1, 1);
    for (int id = 0; id < count; ++id)
      net.add_node({id, 1, NodeType::LINEAR});
    assert(net.connect(INPUT, ROOT, 1) && net.connect(ROOT, OUTPUT, INITIAL_WEIGHT));
    std::vector<int> copies;
    const bool expected = count < evolution::MAX_GENOME_NODES;
    assert(net.duplicate_subgraph({ROOT}, &copies, false) == expected);
    assert(net.nodes() == count + int(expected));
    if (expected) {
      assert(copies.size() == 1);
      float combined = 0;
      for (const auto &edge : net.get_connection_genes())
        if (edge.get_target() == OUTPUT)
          combined += edge.get_weight();
      assert(combined == INITIAL_WEIGHT);
    }
    net.validate();
  }
}
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
void wired_cells_find_contact_places() {
  auto plan = cells(3);
  for (auto &g : plan.groups)
    g.copies = studio_plan::max_copies;
  auto &target = plan.groups[2];
  target.field = 0;
  plan.connections = {{0, 2, 0, 0}, {1, 2, 0, 1}};
  fit_contact_slots(plan);
  assert(field::input_slots(field::Role::Nerve, target.field) >= 2 * studio_plan::max_copies);
  auto roomy = cells(2);
  roomy.groups[1].field = 1;
  roomy.connections = {{0, 1, 0, 0}};
  fit_contact_slots(roomy);
  assert(roomy.groups[1].field == 1);
}
void shared_addresses_preserve_each_wire() {
  auto plan = cells(4);
  for (auto &g : plan.groups)
    g.copies = 8;
  plan.groups[0].copies = 4;
  plan.groups[1].copies = 12;
  plan.connections = {{0, 3, 0, 0}, {1, 3, 1, 0}};
  plan_addresses(plan, {}, 1000000);
  assert(plan.groups[0].sender1 == plan.groups[1].sender1 &&
         plan.groups[0].sender2 == plan.groups[1].sender2);
  fishsim::Genome genome;
  genome.cppn = Builder().build(plan);
  genome.development_seed = 1;
  genome.variation_seed = 2;
  genome.compile(false);
  const auto checked = assess(plan, genome);
  assert(checked.ok() && checked.missing == 0 && checked.additional == 0);
}
void assessment_checks_learning_and_every_cell() {
  auto plan = cells(1);
  plan.groups[0].copies = 4;
  fishsim::Genome genome;
  genome.cppn = Builder().build(plan);
  genome.compile(false);
  assert(assess(plan, genome).ok() && genome.blueprint->neurons.size() == 4);
  for (float Group::*property :
       {&Group::learning_tau, &Group::electrical_limit, &Group::teaching_limit}) {
    auto changed = plan;
    changed.groups[0].*property = .9f;
    assert(!assess(changed, genome).ok());
    changed.options.traitTolerance = .4f;
    assert(assess(changed, genome).ok());
  }
  auto later = plan;
  later.groups[0].growth = {true, 0, 0};
  assert(!assess(later, genome).ok());
  const auto rejects_last_cell = [&](auto change) {
    auto broken = genome;
    auto tissue = std::make_shared<field::Substrate>(*genome.blueprint);
    assert(tissue->neurons.front().group == tissue->neurons.back().group);
    change(tissue->neurons.back());
    broken.blueprint = tissue;
    assert(!assess(plan, broken).ok());
  };
  rejects_last_cell([](auto &cell) { cell.parameters.threshold = .9f; });
  rejects_last_cell([](auto &cell) { cell.parameters.learning_time = .9f; });
  rejects_last_cell([](auto &cell) { cell.electrical_limit = .9f; });
  rejects_last_cell([](auto &cell) { cell.teaching_limit = .9f; });
  rejects_last_cell([](auto &cell) { cell.development_receptor.baseline = 0; });
  rejects_last_cell([](auto &cell) { cell.hormone_receptors[field::Learning].baseline = 1; });
}
void inactive_growth_ignores_saved_settings() {
  auto plan = cells(1);
  plan.groups[0].growth = {false, .4f, 1, .1f, .3f, 2, 2, .2f};
  plan.growth = {false, .4f, 1, .1f, .3f, 2, 2, .2f};
  fishsim::Genome genome;
  genome.cppn = Builder().build(plan);
  genome.compile(false);
  assert(assess(plan, genome).ok());
  field::Hormones hormones;
  hormones.fill(1);
  assert(genome.blueprint->growth_receptor.occupancy(hormones) == 0);
  assert(genome.blueprint->neurons[0].development_receptor.response(hormones, 1) == 1);
}
void receptor_spread_checks_sensitive_cells() {
  auto plan = cells(1);
  plan.groups[0].copies = studio_plan::max_copies;
  plan.groups[0].receptors[field::Learning] = {true, .3f, 0, .01f, .05f, 2, 3, .1f};
  fishsim::Genome genome;
  genome.cppn = Builder().build(plan);
  genome.compile(false);
  assert(assess(plan, genome).ok());
  const auto &actual = genome.blueprint->neurons.back().hormone_receptors[field::Learning];
  assert(std::abs(actual.sensitivity) > .01f);
  const auto altered = [&](auto change, bool accepted) {
    auto changed = genome;
    auto tissue = std::make_shared<field::Substrate>(*genome.blueprint);
    auto &receptor = tissue->neurons.back().hormone_receptors[field::Learning];
    change(receptor);
    changed.blueprint = tissue;
    assert(assess(plan, changed).ok() == accepted);
  };
  altered([](auto &r) { r.half = field::HORMONE_HALF_MAX; }, false);
  altered([](auto &r) { r.affinity.fill(1); }, false);
  altered([](auto &r) { r.steepness = 0; }, false);
  altered(
      [](auto &r) {
        r.sensitivity = 0;
        r.half = field::HORMONE_HALF_MAX;
        r.affinity.fill(1);
        r.steepness = 0;
      },
      true);
}
void property_overrides_reach_outputs() {
  for (bool learning : {false, true})
    for (bool teaching : {false, true}) {
      auto plan = cells(1);
      auto &cell = plan.groups.front();
      cell.tau = .25f;
      cell.learning_tau = learning ? .75f : cell.tau;
      cell.electrical_limit = .35f;
      cell.teaching_limit = teaching ? .8f : cell.electrical_limit;
      fishsim::Genome genome;
      genome.cppn = Builder().build(plan);
      genome.compile(false);
      assert(assess(plan, genome).ok());
      std::map<int, std::vector<int>> parents;
      for (const auto &edge : genome.cppn->get_connection_genes())
        if (edge.get_enabled())
          parents[edge.get_target()].push_back(edge.get_source());
      std::vector<int> pending;
      for (int i = 0; i < cppn::OUTPUTS; ++i)
        pending.push_back(cppn::INPUTS + i);
      std::set<int> reachable;
      while (!pending.empty()) {
        const int id = pending.back();
        pending.pop_back();
        if (reachable.insert(id).second)
          pending.insert(pending.end(), parents[id].begin(), parents[id].end());
      }
      for (const auto &node : genome.cppn->get_node_genes())
        if (node.get_role() == evolution::NodeRole::Hidden)
          assert(reachable.count(node.get_id()));
    }
}
int choice_trace(bool late, bool pulsed, bool fed_start) {
  std::string name;
  auto plan = read_plan(std::cin, name);
  plan_addresses(plan);
  fishsim::Genome genome;
  genome.cppn = Builder().build(plan);
  genome.compile(false);
  assert(assess(plan, genome).ok());
  field::Network brain(genome.blueprint);
  std::vector<int> groups, sensors, count(plan.groups.size());
  for (const auto &cell : genome.blueprint->neurons) {
    int group = -1;
    for (std::size_t i = 0; i < plan.groups.size(); ++i)
      if (plan.groups[i].contains(cell.location))
        group = int(i);
    assert(group >= 0);
    groups.push_back(group);
    ++count[group];
    if (cell.role == field::Role::Sensor)
      sensors.push_back(group);
  }
  std::cout << "t";
  for (const auto &g : plan.groups)
    std::cout << ',' << g.name;
  std::cout << '\n';
  std::vector<double> total(plan.groups.size());
  for (int step = 0; step < 6200; ++step) {
    brain.set_maturity(std::min(1., .65 + .35 * step / 800));
    const float cue = step >= 4000 && step < 4400 ? 0 : .8f;
    const bool feeding = step >= 2000 && (step < 2800 || (step >= 5000 && step < 5800));
    const float food = step < 2000 ? (fed_start || (!late && step % 200 < 40) ? .6f : 0)
                       : feeding && (!pulsed || step % 80 < 20) ? .6f
                                                                : 0;
    std::vector<float> input;
    for (int i : sensors) {
      const auto &s = plan.groups[i].name;
      input.push_back(s.find("nose:") == 0                   ? cue
                      : s.find("gut:food") == 0              ? food
                      : s.find("pain:") == 0 && step >= 5800 ? .8f
                                                             : 0);
    }
    brain.step(input, {}, 27139);
    for (std::size_t i = 0; i < groups.size(); ++i)
      total[groups[i]] += brain.signal(i) / count[groups[i]];
    if (step % 50 == 49) {
      std::cout << step + 1;
      for (auto &value : total) {
        std::cout << ',' << value / 50;
        value = 0;
      }
      std::cout << '\n';
    }
  }
  return 0;
}
int main(int argc, char **argv) {
  fishsim::Genome::begin_run(34981);
  if (argc == 2 && std::string(argv[1]).find("choice") == 0)
    return choice_trace(std::string(argv[1]).find("late") != std::string::npos,
                        std::string(argv[1]).find("pulsed") != std::string::npos,
                        std::string(argv[1]).find("fed-start") != std::string::npos);
  duplication_uses_shared_limits();
  wired_cells_find_contact_places();
  shared_addresses_preserve_each_wire();
  assessment_checks_learning_and_every_cell();
  inactive_growth_ignores_saved_settings();
  receptor_spread_checks_sensitive_cells();
  property_overrides_reach_outputs();
  {
    auto plan = cells(2);
    auto &g = plan.groups.front();
    g.copies = 4;
    g.tau = .1f;
    g.learning_tau = field::encode_learning_steps(128);
    g.teaching_limit = .6f;
    g.spread_physiology = .04f;
    g.spread_contacts = .03f;
    g.receptors[field::Teaching] = {true, 0, 1, .1f, .2f, 0, 1};
    g.receptors[field::Teaching].spread_receptors = .02f;
    g.reception[0] = {{.75f, -.75f}, .2f, 1};
    g.reception_spread[0][0] = .01f;
    fishsim::Genome first;
    first.cppn = Builder().build(plan);
    first.development_seed = 17;
    first.variation_seed = 31;
    first.compile(false);
    assert(assess(plan, first).ok());
    auto same = first;
    same.compile(false);
    auto other = first;
    other.variation_seed = 37;
    other.compile(false);
    bool different = false, within_centre = false;
    for (std::size_t i = 0; i < first.blueprint->neurons.size(); ++i) {
      const auto &a = first.blueprint->neurons[i];
      assert(a.bias == same.blueprint->neurons[i].bias);
      assert(a.reception[0].address == same.blueprint->neurons[i].reception[0].address);
      if (a.group == 0) {
        assert(std::abs(a.parameters.learning_time - g.learning_tau) <= g.spread_physiology + 1e-6);
        assert(std::abs(a.teaching_limit - .6f) <= g.spread_contacts + 1e-6);
        assert(a.parameters.time_constant < .15f);
      }
      assert(a.electrical_limit >= 0 && a.electrical_limit <= field::MAX_CONTACT_LIMIT);
      different |= a.bias != other.blueprint->neurons[i].bias;
      if (i && a.group == first.blueprint->neurons[i - 1].group)
        within_centre |= a.bias != first.blueprint->neurons[i - 1].bias;
    }
    assert(different && within_centre);
    // Small scheduler slices must make the same draw and pay the same graph cost.
    auto sliced = first;
    sliced.discard_development();
    std::size_t steps = 0;
    while (!sliced.advance_development(1, false))
      assert(++steps < field::DEVELOPMENT_WORK_LIMIT);
    assert(sliced.blueprint->development_work() == first.blueprint->development_work());
  }
  {
    field::Neuron source{}, target{};
    source.role = target.role = field::Role::Nerve;
    source.identity = {0, 1, 1, -1, .59f};
    target.electrical_limit = .2f;
    target.teaching_limit = .9f;
    assert(!field::teaching_source(source));
    assert(field::contact_limit(source, target) == .2f);
    source.identity[4] = .61f;
    assert(field::teaching_source(source));
    assert(field::contact_limit(source, target) == .9f);
    target.role = field::Role::Effector;
    assert(field::contact_limit(source, target) == .2f);
  }
  {
    field::Neuron a{}, b{};
    a.role = b.role = field::Role::Nerve;
    a.sender = {-.8f, 0};
    b.receiver = {-.8f, 0};
    b.search_width = 0;
    b.reception[0] = {{.8f, 0}, 0, 1};
    const auto first = field::contact_parameters(a, b, 2).probability;
    a.sender = {.8f, 0};
    assert(field::contact_parameters(a, b, 2).probability == first);
    a.sender = {0, 0};
    assert(field::contact_parameters(a, b, 2).probability == 0);
  }

  {
    auto plan = cells(1);
    auto &r = plan.groups.front().receptors;
    plan.groups.front().growth = {true, .1f, .7f, .2f, 0, field::MATURITY_SUBSTANCE, 2};
    r[field::Excitation] = {true, -.2f, .4f, .1f, 0, 0, 1};
    r[field::Teaching] = {true, .1f, -.7f, .2f, 0, 1, 2};
    r[field::Learning] = {true, .3f, .5f, .4f, 0, 2, 0};
    fishsim::Genome g;
    g.cppn = Builder().build(plan);
    g.compile(false);
    assert(assess(plan, g).ok());
  }
  {
    const auto original = fishsim::Genome::load(fishsim::HAND_BUILT_GENOME);
    const auto &before = *original.blueprint;
    auto limited = original;
    limited.development_options.max_edges = 1;
    limited.compile(false);
    assert(limited.blueprint->resource_limited && !limited.viable());
    assert(limited.blueprint->diagnostic == "Technical synapse limit");
    assert(!limited.blueprint->network_layout);
    assert(limited.blueprint->development_work() < before.development_work());
    limited.development_options = original.development_options;
    limited.development_options.max_nodes = 1;
    limited.compile(false);
    assert(limited.blueprint->resource_limited && !limited.viable());
    assert(limited.blueprint->diagnostic == "Technical cell limit");
    assert(!limited.blueprint->network_layout);
    limited.development_options = original.development_options;
    limited.development_options.max_edges = before.edges.size();
    limited.compile(false);
    assert(!limited.blueprint->resource_limited);
    assert(limited.blueprint->edges.size() == before.edges.size());
    auto sibling = original;
    sibling.variation_seed ^= 1;
    sibling.compile(false);
    assert(sibling.same_genes(original));
    assert(sibling.blueprint->neurons.size() == before.neurons.size());
    const auto edges = [](const auto &g) {
      std::vector<std::tuple<field::NeuronIndex, field::NeuronIndex, float>> result;
      for (const auto &e : g.blueprint->edges)
        result.emplace_back(e.source, e.target, e.weight);
      return result;
    };
    assert(edges(sibling) != edges(original));
    const auto first_build = edges(sibling);
    sibling.compile(false);
    assert(edges(sibling) == first_build);
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
    for (int k = out::mean_count; k < cppn::OUTPUTS; ++k) {
      const auto &edges = first->get_connection_genes();
      assert(std::any_of(edges.begin(), edges.end(), [&](const auto &e) {
        return e.get_source() == cppn::BIAS && e.get_target() == cppn::INPUTS + k &&
               e.get_weight() == 0 && e.get_enabled();
      }));
    }
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
  p.groups[3].v0 = p.groups[3].v1 = 1;
  p.connections = {{0, 3, 0, 0}, {1, 3, 1, 0}};
  {
    auto timely = p, delayed = p;
    const auto now = std::chrono::steady_clock::now();
    const auto a = AddressFitter(timely).run({}, 2048, now);
    const auto b = AddressFitter(delayed).run({}, 2048, now - std::chrono::hours(1));
    assert(a.evaluations == b.evaluations && a.attempts == b.attempts);
    assert(a.expectedMissing == b.expectedMissing && a.leakage == b.leakage);
    for (std::size_t i = 0; i < timely.groups.size(); ++i) {
      const auto &x = timely.groups[i], &y = delayed.groups[i];
      assert(x.sender1 == y.sender1 && x.sender2 == y.sender2 && x.receiver1 == y.receiver1 &&
             x.receiver2 == y.receiver2 && x.sigma == y.sigma);
      for (int f = 0; f < field::CONTACT_FIELDS - 1; ++f)
        assert(x.reception[f].address == y.reception[f].address &&
               x.reception[f].width == y.reception[f].width);
    }
  }
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
      assert(a.partners[i].source == b.partners[i].source && a.partners[i].p == b.partners[i].p);
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
  std::cout << "Compiler: local traits, stable sites, weight bounds, planned contacts and their "
               "places passed\n";
}
