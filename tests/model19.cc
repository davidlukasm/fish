#include "genome.hh"
#include "ecology.hh"
#include "field/maturation.hh"
#include <cmath>
#include <iostream>
#include <sstream>
#include <stdexcept>

using namespace fishsim;
namespace {
void check(bool ok, const char *message) {
  if (!ok)
    throw std::runtime_error(message);
}
std::string saved(const field::Network &brain) {
  std::ostringstream out;
  brain.write_runtime(out);
  return out.str();
}
std::shared_ptr<evolution::Genome> marker_fixture() {
  auto g = std::make_shared<evolution::Genome>(cppn::INPUTS, cppn::OUTPUTS);
  for (int id = 0; id < cppn::INPUTS + cppn::OUTPUTS; ++id)
    g->add_node(evolution::NodeGene{id, 1, evolution::NodeType::LINEAR});
  auto put = [&](int input, std::size_t port, float weight) {
    check(g->connect(input, cppn::INPUTS + int(port), weight), "fixture connection accepted");
  };
  put(cppn::BIAS, cppn::output::expression, 1);
  put(1, cppn::output::identity_role, .6f);
  for (auto port : {cppn::output::identity_a, cppn::output::identity_b, cppn::output::identity_c,
                    cppn::output::identity_d})
    put(cppn::BIAS, port, -.8f);
  put(1, cppn::output::sender1, 1);
  put(1, cppn::output::receiver1, 1);
  put(cppn::BIAS, cppn::output::threshold, .1f);
  put(2, cppn::output::capacity, .1f);
  for (int k = 0; k < cppn::output::link_kinds; ++k) {
    put(10, cppn::output::link_expression(k), -1);
    put(cppn::BIAS, cppn::output::link_weight(k), .4f);
    put(cppn::MATCH, cppn::output::link_weight(k), .1f);
    put(cppn::MATCH + 1, cppn::output::link_weight(k), .2f);
  }
  return g;
}
void marker_development() {
  auto genes = marker_fixture();
  cppn::CPPN query(genes);
  cppn::Program program(query);
  const cppn::Point points[] = {{-.5f, -.75f, 0, .5f, -.25f, 0, .2f, .1f},
                                {-.5f, -.75f, 0, .5f, -.25f, 0, -.3f, .4f}};
  std::array<std::array<float, cppn::OUTPUTS>, 64> values{};
  for (std::size_t count : {2u, 1u}) {
    program.evaluate(points, count, cppn::ALL_OUTPUTS, values);
    for (std::size_t j = 0; j < count; ++j) {
      const auto &p = points[j];
      const auto reference = query.query_view(p.a, p.b, p.z, p.c, p.d, p.w, p.match1, p.match2);
      for (int k = 0; k < cppn::OUTPUTS; ++k)
        check(std::abs(values[j][k] - reference[k]) < 1e-6f,
              "scalar, cached and batched CPPNs agree including marker products");
      check(std::abs(reference[cppn::output::sense_nerve_weight] -
                     (.4f + .1f * p.match1 + .2f * p.match2)) < 1e-6f,
            "both marker matches affect connection weights");
    }
  }
  auto changed = std::make_shared<evolution::Genome>(*genes);
  for (const auto &edge : changed->get_connection_genes())
    if (changed->get_node(edge.get_target())->get_branch() == 1)
      changed->edit_connection(edge.get_innovation_number(), .8f, true);
  cppn::CPPN properties(changed);
  const auto before = query.query_view(.2f, .3f, .4f, -.3f, -.4f, -.5f, .7f, .8f);
  const auto after = properties.query_view(.2f, .3f, .4f, -.3f, -.4f, -.5f, .7f, .8f);
  check(before[cppn::output::threshold] != after[cppn::output::threshold],
        "property branch can change thresholds");
  for (int k = 0; k < cppn::OUTPUTS; ++k)
    if (cppn::output::branch(k) != 1)
      check(before[k] == after[k], "property changes leave anatomy, markers and link rules intact");
  const int hidden = cppn::INPUTS + cppn::OUTPUTS;
  evolution::NodeGene node{hidden, 1, evolution::NodeType::LINEAR};
  node.set_branch(1);
  changed->add_node(node);
  check(!changed->connect(hidden, cppn::INPUTS + cppn::output::expression, 1),
        "cross-branch hidden connections are impossible");

  field::Options options;
  options.depth = 2;
  field::Substrate built(query, options);
  while (!built.cell_parameters_complete())
    built.advance_development(1);
  check(built.queries == 64 * 9, "early anatomy boundary precedes all hormone receptor queries");
  while (!built.anatomy_complete())
    built.advance_development(1);
  check(built.queries == 64 * (9 + field::HORMONE_EFFECTS),
        "expressed grid points include placement, cell and six receptor queries");
  for (const auto &n : built.neurons) {
    check(n.hormone_receptors[field::Excitation].baseline !=
              n.hormone_receptors[field::Learning].baseline,
          "functional receptor contexts can evolve independently");
    for (int k = 0; k < field::HORMONE_EFFECTS; ++k) {
      const auto v = query.query_view(n.x, n.y, n.z, n.x < 0 ? -(2.f + k) : 2.f + k, 0, 0);
      check(std::abs(n.hormone_receptors[k].baseline - v[cppn::output::capacity]) < 1e-6,
            "incremental receptor development agrees with direct CPPN queries");
    }
  }
  for (int k = 0; k < field::HORMONE_EFFECTS; ++k) {
    const float d = 2.f + k;
    const auto left = cppn::geometry_inputs(-.4f, .3f, .2f, -d, 0, 0);
    const auto right = cppn::geometry_inputs(.4f, .3f, .2f, d, 0, 0);
    for (int i : {1, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13})
      check(left[i] == right[i], "hormone queries preserve all mirror-even founder inputs");
  }
  check(built.regions == 4, "marker boundaries form four connected regions");
  while (!built.advance_development(64)) {
  }
  std::array<bool, 3> connected{};
  for (const auto &edge : built.edges) {
    const auto &a = built.neurons[edge.source], &b = built.neurons[edge.target];
    check(a.x * b.x < 0, "side-specific preselection admits only crossed connections in fixture");
    connected[field::connection_kind(a, b)] = true;
  }
  check(connected[0] && connected[1] && connected[2],
        "crossed links survive region preselection for all three connection kinds");
  options.reference_development = true;
  field::Substrate reference(query, options);
  while (!reference.advance_development(64)) {
  }
  check(built.neurons.size() == reference.neurons.size() &&
            built.edges.size() == reference.edges.size(),
        "reference and optimized development have matching topology");
  for (std::size_t i = 0; i < built.edges.size(); ++i)
    check(built.edges[i].source == reference.edges[i].source &&
              built.edges[i].target == reference.edges[i].target &&
              std::abs(built.edges[i].weight - reference.edges[i].weight) < 1e-6f,
          "reference development uses the same marker-dependent links");
  for (const auto &edge : genes->get_connection_genes())
    if (edge.get_target() == cppn::INPUTS + cppn::output::expression)
      genes->edit_connection(edge.get_innovation_number(), -1, true);
  cppn::CPPN empty_query(genes);
  field::Substrate empty(empty_query, options);
  while (!empty.advance_development(64)) {
  }
  check(empty.queries == 64 && empty.neurons.empty(), "empty raster points spend only one query");
}

void development_and_runtime() {
  auto g = Genome::load("genomes/cppn-start.genome");
  const auto &s = *g.blueprint;
  check(g.viable(), "start genome develops a viable body");
  check(g.cppn->inputs() == 15 && g.cppn->outputs() == 26,
        "15 inputs, 26 outputs and marker-driven connectivity");
  check(s.neurons.size() <= s.options.max_nodes && s.edges.size() <= s.options.max_edges,
        "development respects cell and connection budgets");
  check(field::Maturation(s).ticks() >= 100, "embryonic learning phase lasts at least 100 steps");
  for (const auto &edge : s.edges) {
    check(field::connection_kind(s.neurons[edge.source], s.neurons[edge.target]) >= 0,
          "all connections follow the three model roles");
    const float sign = s.neurons[edge.source].role == field::Role::Sensor
                           ? 1.f
                           : field::cell_class(s.neurons[edge.source]).sign;
    check(sign * edge.weight >= 0, "birth synapse follows its source transmitter");
  }
  auto variant = g;
  Rng random(18019);
  variant.begin_individual(random);
  variant.compile();
  check(g.same_genes(variant) && g.variation_seed != variant.variation_seed,
        "individual variation preserves inherited genes");
  check(variant.blueprint->neurons.size() == s.neurons.size(),
        "individual jitter preserves cell identities");
  bool moved = false;
  for (std::size_t i = 0; i < s.neurons.size(); ++i) {
    const auto &a = s.neurons[i], &b = variant.blueprint->neurons[i];
    check(a.id == b.id && (a.x >= 0) == (b.x >= 0) && (a.z >= 0) == (b.z >= 0),
          "individual variation preserves side, depth and identity");
    moved |= a.x != b.x || a.y != b.y || a.bias != b.bias;
  }
  check(moved, "individuals have distinct developed tissue");
  std::stringstream genome;
  variant.write(genome);
  const auto read = Genome::read(genome);
  check(read.same_genes(variant) && read.variation_seed == variant.variation_seed,
        "current genome roundtrip preserves markers and both seeds");

  field::Network a(g.blueprint), b(g.blueprint);
  a.set_development(.5, false);
  std::vector<float> input(g.interface->sensory.size());
  auto step = [&](field::Network &n, int t) {
    for (std::size_t i = 0; i < input.size(); ++i)
      input[i] = float(.5 + .4 * std::sin(.03 * t + .1 * i));
    n.step(input, {.05 + .04 * std::sin(.02 * t), .05 + .04 * std::cos(.017 * t), .1, .2}, 18019);
  };
  for (int t = 0; t < 160; ++t)
    step(a, t);
  const auto runtime = saved(a);
  std::istringstream source(runtime);
  b.read_runtime(source);
  check(saved(b) == runtime, "current brain runtime roundtrip");
  for (int t = 160; t < 180; ++t) {
    step(a, t);
    step(b, t);
    check(saved(a) == saved(b), "learning and rewiring continue after loading");
    for (const auto &edge : a.synapses()) {
      check(std::isfinite(edge.weight) && edge.weight * edge.formed >= 0,
            "learning preserves finite weights and source sign");
      check(field::connection_kind(s.neurons[edge.source], s.neurons[edge.target]) >= 0,
            "new synapses preserve model roles");
    }
  }
}
void individual_checkpoint() {
  auto g = Genome::load("genomes/cppn-start.genome");
  Ecosystem w(18019);
  w.safety = false;
  check(w.spawn(g, 100, 100, 2, 0, 0, 250) && w.spawn(g, 200, 100, 2, 0, 0, 250),
        "two individuals placed");
  check(w.assistance_shortfall() == w.assistance_target() - 2,
        "funded assistance eggs count while individual plans are pending");
  check(w.fish[0].genome.variation_seed != w.fish[1].genome.variation_seed,
        "placed individuals receive separate variation seeds");
  for (int t = 0; t < 8; ++t)
    w.tick();
  auto copy = w.fork();
  check(copy.fish.size() == w.fish.size(), "checkpoint preserves population");
  for (std::size_t i = 0; i < w.fish.size(); ++i)
    check(copy.fish[i].genome.variation_seed == w.fish[i].genome.variation_seed,
          "checkpoint never merges individual development");
  for (int t = 0; t < 8; ++t) {
    w.tick();
    copy.tick();
  }
  for (std::size_t i = 0; i < w.fish.size(); ++i) {
    const auto &a = w.fish[i], &b = copy.fish[i];
    check(a.body.energy == b.body.energy &&
              a.genome.pending_queries() == b.genome.pending_queries(),
          "partial embryo development resumes consistently");
    if (a.body.brain())
      check(b.body.brain() && saved(*a.body.brain()) == saved(*b.body.brain()),
            "embryonic learning survives checkpoint");
  }
}
}
int main() {
  try {
    Genome::begin_run(18019);
    marker_development();
    development_and_runtime();
    individual_checkpoint();
    std::cout
        << "Modell 19: Entwicklung, Variation, Vererbung, Lernen, Umbau und Speicherzustand: OK\n";
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
