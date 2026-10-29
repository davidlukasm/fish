#include "test_support.hh"
#include "founder_pool.hh"
#include <map>
#include <cmath>
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
    b.out(sender1, band[0][k], k == 1 && std::getenv("NOSEFLIP") ? 4 : k % 2 ? -4 : 4);
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
  b.out(quality1, band[1][1], std::getenv("NOSEEGG") ? -.505 : 0);
  b.out(quality2, band[1][1], std::getenv("NOSEEGG") ? -.875 : -.1754);
  b.out(quality_width, band[1][1],
        -.8); // carrion odor channel 5; provisional warning odor, NOT a toxin
  for (int k = 0; k < 8; ++k)
    b.out(threshold, band[1][k], k < 2 ? -1.2 : k < 4 ? .12 : k == 4 ? 0 : (k == 6 && std::getenv("SPT")) ? -std::atof(std::getenv("SPT")) : -1.5);
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
  if (std::getenv("EGGPUMP")) {
    int oa = b.node(4, NodeType::ABS, 0, {{1, 1}, {cppn::BIAS, -.125}});
    int odor = b.node(4, NodeType::SIGN, 0, {{oa, -1}, {cppn::BIAS, .125}});
    int pumpt = b.node(4, NodeType::SIGN, 0, {{3, 1}, {cppn::BIAS, .5}});
    int a = b.node(4, NodeType::SIGN, 0, {{cm, 1}, {inh, -1}, {other, -1}, {odor, -2}, {cppn::BIAS, -4}});
    int c = b.node(4, NodeType::SIGN, 0, {{cs, 1}, {inh, 1}, {other, -1}, {cppn::BIAS, -2}});
    int d = b.node(4, NodeType::SIGN, 0, {{other, 1}, {inh, -1}, {odor, -1}, {cppn::BIAS, -2}});
    int e = b.node(4, NodeType::SIGN, 0, {{other, 1}, {pumpt, 1}, {odor, 1}, {cppn::BIAS, -2}});
    for (int n : {a, c, d, e})
      b.out(nerve_effector_expression, n, 1);
    b.constant(nerve_effector_expression, 3);
  } else {
  int a = b.node(4, NodeType::SIGN, 0, {{cm, 1}, {inh, -1}, {other, -1}, {cppn::BIAS, -2}});
  int c = b.node(4, NodeType::SIGN, 0, {{cs, 1}, {inh, 1}, {other, -1}, {cppn::BIAS, -2}});
  int d = b.node(4, NodeType::SIGN, 0, {{other, 1}, {inh, -1}, {cppn::BIAS, -1}});
  for (int n : {a, c, d})
    b.out(nerve_effector_expression, n, 1);
  b.constant(nerve_effector_expression, 2);
  }
  b.constant(nerve_effector_weight, 2);
  if (std::getenv("FOODNOSE")) {
    int fn0 = b.node(0, NodeType::SIGN, 0, {{band[0][1], 1}, {zsign, 1}, {cppn::BIAS, -1.5}});
    b.out(sender1, fn0, 4);
    b.constant(sender1, 4);
    int zs1n = b.node(1, NodeType::SIGN, 0, {{5, 1}});
    int fn1 = b.node(1, NodeType::SIGN, 0, {{band[1][1], 1}, {zs1n, 1}, {cppn::BIAS, -1.5}});
    b.out(quality2, fn1, 1);
    b.constant(quality2, 1);
  }
  if (std::getenv("EGGBLUE"))
    b.out(quality1, band[1][7], -4);
  if (std::getenv("NONOSE"))
    b.out(expression, band[0][1], -8);
  if (std::getenv("EGGHALF")) {
    int eggz = b.node(0, NodeType::SIGN, 0, {{band[0][7], 1}, {zsign, -1}, {cppn::BIAS, -1.5}});
    b.out(expression, eggz, -2);
    b.constant(expression, -2);
  }
  if (std::getenv("FWDZ")) {
    int fwd0 = b.node(0, NodeType::SIGN, 0, {{band[0][4], 1}, {zsign, 1}, {cppn::BIAS, -1.5}});
    b.out(expression, fwd0, 2);
    b.constant(expression, 2);
  }
  const double F = std::getenv("FWD") ? std::atof(std::getenv("FWD")) : 0;
  if (F != 0) {
    int zs1 = b.node(1, NodeType::SIGN, 0, {{5, 1}});
    int fwd1 = b.node(1, NodeType::SIGN, 0, {{band[1][4], 1}, {zs1, 1}, {cppn::BIAS, -1.5}});
    b.out(threshold, fwd1, -F / 2);
    b.constant(threshold, -F / 2);
    const double C = std::getenv("CAPF") ? std::atof(std::getenv("CAPF")) : 0;
    if (C != 0) {
      b.out(capacity, fwd1, C / 2);
      b.constant(capacity, C / 2);
    }
  }

  // ---- class options -------------------------------------------------------------
  auto env = [](const char *k, double d) { const char *v = std::getenv(k); return v ? std::atof(v) : d; };
  auto has = [](const char *k) { return std::getenv(k) != nullptr; };
  int zs1 = b.node(1, NodeType::SIGN, 0, {{5, 1}});
  // selector of one z half of a band: +1 inside, -1 elsewhere
  auto half0 = [&](int k, int side) { return b.node(0, NodeType::SIGN, 0, {{band[0][k], 1}, {zsign, double(side)}, {cppn::BIAS, -1.5}}); };
  auto half1 = [&](int k, int side) { return b.node(1, NodeType::SIGN, 0, {{band[1][k], 1}, {zs1, double(side)}, {cppn::BIAS, -1.5}}); };
  // shift an output by delta inside a selected region only
  auto shift = [&](int port, int sel, double delta) { b.out(port, sel, delta / 2); b.constant(port, delta / 2); };
  // Pump band quarters: z side x inner (|x| < .5, -1) / outer (+1) grid columns.
  int ax0 = b.node(0, NodeType::ABS, 0, {{0, 1}}), ax1 = b.node(1, NodeType::ABS, 0, {{0, 1}});
  int xs0 = b.node(0, NodeType::SIGN, 0, {{ax0, 1}, {cppn::BIAS, -.5}});
  int xs1 = b.node(1, NodeType::SIGN, 0, {{ax1, 1}, {cppn::BIAS, -.5}});
  int xe0 = b.node(0, NodeType::SIGN, 0, {{ax0, 1}, {cppn::BIAS, -.75}});
  int xe1 = b.node(1, NodeType::SIGN, 0, {{ax1, 1}, {cppn::BIAS, -.75}});
  // xside -1 inner columns, +1 outer columns, +2 only the outermost column
  auto quarter = [&](int zside, int xside) {
    const int x0 = xside == 2 ? xe0 : xs0, x1 = xside == 2 ? xe1 : xs1;
    const double xw = xside == 2 ? 1 : xside;
    return std::pair<int, int>{
        b.node(0, NodeType::SIGN, 0, {{band[0][5], 1}, {zsign, double(zside)}, {x0, xw}, {cppn::BIAS, -2.5}}),
        b.node(1, NodeType::SIGN, 0, {{band[1][5], 1}, {zs1, double(zside)}, {x1, xw}, {cppn::BIAS, -2.5}})};
  };
  // Replace pump cells of one quarter by another organ (pump identity is 1,-1,1,-1,-1).
  const double pump_id[5] = {1, -1, 1, -1, -1};
  auto organ = [&](int zside, int xside, std::initializer_list<double> id, double cap, double q1, double qw, double q2) {
    auto [s0, s1] = quarter(zside, xside);
    int j = 0;
    for (double v : id) { if (v != pump_id[j]) shift(identity_role + j, s0, 4 * (v - pump_id[j])); ++j; }
    shift(capacity, s1, cap);
    shift(quality1, s1, q1 - env("GUTQ", -1.2));
    shift(quality2, s1, q2 - env("MOUTHQ", 3));
    shift(quality_width, s1, qw + 1.2);
  };
  // Smaller body: remove the outer pump columns not used by pigment or gland (lower organ mass).
  if (has("SMALL")) {
    shift(expression, quarter(-1, 1).first, -8);
    if (has("HORM")) shift(expression, quarter(-1, 2).first, 8);
    if (!has("PIGQ")) shift(expression, quarter(1, 1).first, -8);
  }
  if (has("JAW"))   // jaw muscle (Aggression) in the inner z>0 quarter, driven like the pump; quality1 = teeth
    organ(1, -1, {1, -1, -1, 1, -1}, env("JAWCAP", -2), env("JAWTEETH", 0), -1.2, 0);
  if (has("GUTQ")) b.out(quality1, band[1][5], env("GUTQ", -1.2) + 1.2);  // gut length from pump quality1
  if (has("MOUTHQ")) b.out(quality2, band[1][5], env("MOUTHQ", 3) - 3);
  if (has("PIGQ"))  // pigment in the outer z>0 quarter: constant body colour from quality1 (absorbed hue)
    organ(1, 1, {1, 1, -1, 1, -1}, env("PIGCAP", -1), env("PIGQ", 0), env("PIGW", -1), 0);
  // Feeding hormone: gland band in the back (driven like the pump, hormone 0);
  // forward cells carry an excitation receptor that slows swimming while the gland is active.
  if (has("HORM")) {
    organ(-1, 2, {1, 1, -1, -1, 1}, env("GLANDCAP", -2), -1, -1.2, -1);  // gland in the outer z<0 quarter, hormone 0
    int plane = b.node(1, NodeType::ABS, 0, {{2, .125}});
    int excit = b.node(1, NodeType::GAUSSIAN, .03, {{plane, 1}, {cppn::BIAS, -.25}});
    int fwd = half1(4, 1);
    int rec = b.node(1, NodeType::SIGN, 0, {{excit, 2}, {fwd, 1}, {cppn::BIAS, -1.5}});
    shift(plasticity, rec, env("HORM", -.8) * 2);
    shift(quality1, rec, -2);
    shift(quality2, rec, -2);
  }
  // Appetite half of the nose: broad tuning toward food and one niche odour (lon/lat in degrees).
  if (has("NICHE")) {
    const double lon = env("NICHE", 0) * PI / 180, lat = env("NICHELAT", 62) * PI / 180;
    double q1 = lon / PI - 1; if (q1 < -1) q1 += 2;
    const double q2 = std::sin(lat);
    int n1 = half1(1, 1);
    // appetite half currently q1 = base (NOSEEGG -.505), q2 = 1 after FOODNOSE
    shift(quality1, n1, q1 - (-.505));
    shift(quality2, n1, q2 - 1.125);
    shift(quality_width, n1, 2 * env("NICHEW", .33) - 1 + 2.0);
  }
  if (has("EYEGREEN")) shift(quality1, half1(0, -1), (-1. / 3) + 4);
  // Learning gain receptor (hormone effect 1, reserved plane |x2| = 3): baseline LEARN for all cells,
  // plus LEARNHORM sensitivity to the feeding hormone (hormone 0).
  if (has("LEARN") || has("LEARNHORM")) {
    int lp = b.node(1, NodeType::ABS, 0, {{2, .125}});
    int lplane = b.node(1, NodeType::GAUSSIAN, .03, {{lp, 1}, {cppn::BIAS, -.375}});
    b.out(capacity, lplane, env("LEARN", 0));
    if (has("LEARNHORM")) {
      b.out(plasticity, lplane, env("LEARNHORM", 0));
      b.out(quality1, lplane, -2);
      b.out(quality2, lplane, -2);
    }
  }
  // Competitive (Oja-like) learning of the visual relay: learning type b > 0 gives mode > 0.
  if (has("LEARNMODE")) b.out(identity_b, band[0][int(env("LEARNBAND", 2))], env("LEARNMODE", 2));
  if (has("WAVES")) b.out(capacity, wave, env("WAVES", 3));  // retinal waves (learning in the egg): 3 full, 2.5 half
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
