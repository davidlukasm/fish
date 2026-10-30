#include "test_support.hh"
#include "founders.hh"
#include <map>
using namespace test;
using evolution::NodeType;
struct Builder {
  Genome g;
  int next = cppn::INPUTS + cppn::OUTPUTS;
  std::map<std::pair<int, int>, double> edges;
  Builder() {
    g.development_seed = 28102026;
    g.variation_seed = 1701;
    g.cppn = std::make_shared<evolution::Genome>(cppn::INPUTS, cppn::OUTPUTS);
    for (int i = 0; i < next; ++i) {
      evolution::NodeGene n(i, 1, NodeType::LINEAR);
      n.set_branch(i < cppn::INPUTS ? -1 : cppn::output::branch(i - cppn::INPUTS));
      g.cppn->add_node(n);
    }
  }
  int node(int branch, NodeType type, float parameter,
           std::initializer_list<std::pair<int, double>> sources) {
    int id = next++;
    evolution::NodeGene n(id, parameter, type);
    n.set_branch(branch);
    g.cppn->add_node(n);
    for (auto [from, w] : sources)
      edges[{from, id}] += w;
    return id;
  }
  void out(int port, int from, double w) { edges[{from, cppn::INPUTS + port}] += w; }
  void constant(int port, double v) { out(port, cppn::BIAS, v); }
  void finish() {
    for (auto [edge, w] : edges)
      g.cppn->connect(edge.first, edge.second, float(w));
    g.cppn->validate();
    g.compile();
  }
};
int main(int argc, char **argv) {
  Genome::begin_run(28102026);
  Builder b;
  using namespace cppn::output;
  // Eight spatial bands: eye, nose, visual relay, inhibitory odor relay, steering,
  // pump, sperm, egg; steering band also contains forward cells. Both body sides use the same CPPN.
  const double y[] = {.875, .625, .375, .125, -.125, -.375, -.625, -.875};
  const double identity[8][5] = {{-1, -1, -1, -1, -1}, {-1, 1, -1, -1, 1},  {0, 1, 0, -1, -1},
                                 {0, -1, 0, -1, -1},   {1, -1, -1, -1, -1}, {1, -1, 1, -1, -1},
                                 {1, -1, 1, 1, 1},     {1, -1, 1, 1, -1}};
  int band[2][8];
  for (int branch = 0; branch < 2; ++branch)
    for (int k = 0; k < 8; ++k)
      band[branch][k] = b.node(branch, NodeType::GAUSSIAN, .55, {{1, 1}, {cppn::BIAS, -y[k]}});
  int absz = b.node(0, NodeType::ABS, 0, {{5, 1}});
  int sheet = b.node(0, NodeType::SIGN, 0, {{absz, -1}, {cppn::BIAS, .22}});
  b.out(expression, sheet, 2);
  b.constant(expression, -1.9);
  b.out(expression, band[0][5], 4);
  for (int k = 0; k < 8; ++k)
    for (int j = 0; j < 5; ++j)
      b.out(identity_role + j, band[0][k], 4 * identity[k][j]);
  int zsign = b.node(0, NodeType::SIGN, 0, {{5, 1}});
  int steering = b.node(0, NodeType::SIGN, 0, {{band[0][4], 1}, {zsign, -1}, {cppn::BIAS, -1.5}});
  for (int port : {int(identity_a), int(identity_b)}) {
    b.out(port, steering, 4);
    b.constant(port, 4);
  }
  int visual_inhib =
      b.node(0, NodeType::SIGN, 0, {{band[0][2], 1}, {zsign, 1}, {cppn::BIAS, -1.5}});
  b.out(identity_a, visual_inhib, -4);
  b.constant(identity_a, -4);
  for (int k = 0; k < 4; ++k) {
    b.out(sender1, band[0][k], k % 2 ? -4 : 4);
    b.out(receiver1, band[0][k], k % 2 ? -4 : 4);
  }
  // Active inherited plasticity: output 0 means cellular gain .5; hormone baseline 0.
  b.constant(plasticity, 0);
  b.constant(dendrites, .2);
  b.constant(capacity, 0);
  for (int k = 4; k < 8; ++k)
    b.out(capacity, band[1][k], 2);
  b.constant(time_constant, -2);
  b.out(time_constant, band[1][5], 4);
  b.constant(field_width, .15);
  b.constant(quality_width, -1.2);
  b.out(quality2, band[1][5], 3);
  b.out(quality1, band[1][5], -1.2);
  b.out(quality1, band[1][0], -4); // red eye preference
  b.out(quality2, band[1][0], 4);  // strong spectral opponency
  b.out(quality1, band[1][1], 0);
  b.out(quality2, band[1][1], -.1754);
  b.out(quality_width, band[1][1],
        -.8); // carrion odor channel 5; provisional warning odor, NOT a toxin
  for (int k = 0; k < 8; ++k)
    b.out(threshold, band[1][k], k < 2 ? -1.2 : k < 4 ? .12 : k == 4 ? 0 : -1.5);
  // Retinal pattern receptor uses reserved target plane |x_target|=7.
  // Only that inherited receptor baseline is reduced; learning receptors stay at baseline 0.
  int target = b.node(1, NodeType::ABS, 0, {{2, .125}});
  int wave = b.node(1, NodeType::GAUSSIAN, .15, {{target, 1}, {cppn::BIAS, -.875}});
  b.out(capacity, wave, -3);
  int dx = b.node(2, NodeType::ABS, 0, {{7, 1}});
  b.out(sense_nerve_expression, cppn::MATCH, 1);
  b.out(sense_nerve_expression, dx, -1);
  b.constant(sense_nerve_expression, -.85);
  b.constant(sense_nerve_weight, 2);
  b.constant(nerve_nerve_expression, -2);
  b.constant(nerve_nerve_weight, 0);
  int mirror = b.node(4, NodeType::ABS, 0, {{0, 1}, {2, 1}});
  int same = b.node(4, NodeType::ABS, 0, {{7, 1}});
  int cm = b.node(4, NodeType::SIGN, 0, {{mirror, -1}, {cppn::BIAS, .18}});
  int cs = b.node(4, NodeType::SIGN, 0, {{same, -1}, {cppn::BIAS, .18}});
  int inh = b.node(4, NodeType::SIGN, 0, {{1, 1}, {5, 1}, {cppn::BIAS, -.4}});
  int other = b.node(4, NodeType::SIGN, 0, {{3, -1}, {cppn::BIAS, -.25}});
  int a = b.node(4, NodeType::SIGN, 0, {{cm, 1}, {inh, -1}, {other, -1}, {cppn::BIAS, -2}});
  int c = b.node(4, NodeType::SIGN, 0, {{cs, 1}, {inh, 1}, {other, -1}, {cppn::BIAS, -2}});
  int d = b.node(4, NodeType::SIGN, 0, {{other, 1}, {inh, -1}, {cppn::BIAS, -1}});
  for (int n : {a, c, d})
    b.out(nerve_effector_expression, n, 1);
  b.constant(nerve_effector_expression, 2);
  b.constant(nerve_effector_weight, 2);
  b.finish();
  b.g.save(argc > 1 ? argv[1] : "manual-hunter.genome");
  std::cout << "CPPN nodes " << b.g.cppn->nodes() << " connections "
            << b.g.cppn->get_connection_genes().size() << " cells " << b.g.blueprint->neurons.size()
            << " synapses " << b.g.blueprint->edges.size() << " viable " << viable_entrant(b.g)
            << "\nSenses ";
  for (auto v : b.g.interface->sense_counts)
    std::cout << v << ' ';
  std::cout << "\nOrgans ";
  for (auto v : b.g.interface->capacities)
    std::cout << v << ' ';
  std::cout << '\n';
}
