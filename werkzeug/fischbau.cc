#include "atelier_compiler.hh"
#include <fstream>
#include <iostream>

using namespace atelier;
namespace {
using Code = std::array<float, 2>;
constexpr Code UNUSED{1, 1};
Group &cell(Plan &p, std::string name, int role, int function, int zone, float u, float v, float w,
            int side, int copies, Code sender, Code receiver) {
  Group g;
  g.name = std::move(name);
  g.organ = int(p.groups.size());
  g.role = role;
  g.function = function;
  g.zone = zone;
  g.side = side;
  g.u0 = g.u1 = u;
  g.v0 = g.v1 = v;
  g.w0 = g.w1 = w;
  g.copies = copies;
  g.threshold = role == 0 ? -1.f : -.5f;
  g.tau = .3f;
  g.field = .5f;
  g.qwidth = .8f;
  g.mode = 1;
  g.sign = 1;
  g.pace = -1;
  g.modulator = -1;
  g.learning_tau = field::encode_learning_steps(256);
  g.electrical_limit = g.teaching_limit = 1;
  g.sender1 = sender[0];
  g.sender2 = sender[1];
  g.receiver1 = receiver[0];
  g.receiver2 = receiver[1];
  g.sigma = .09f;
  g.range = 1;
  p.groups.push_back(std::move(g));
  return p.groups.back();
}
Plan starter() {
  Plan p;
  const Code beat{-.9f, -.9f}, swim{-.9f, -.5f}, mouthIn{-.3f, -.9f}, mouthRelay{-.3f, -.5f},
      mouthOut{-.3f, -.1f};
  auto &pacer = cell(p, "Takt", 1, -1, 1, 0, 1.f / 3, 0, -1, 8, beat, UNUSED);
  pacer.pace = 1;
  pacer.tau = .6f;
  cell(p, "Schwimmnerv", 1, -1, 1, 0, 2.f / 3, 0, -1, 8, swim, beat).pace = 1;
  for (int s : {-1, 1}) {
    const Code eye{.3f * s, .8f}, relay{.3f * s, .4f}, turn{.3f * s, 0};
    for (float u : {1.f / 3, 2.f / 3, 1.f}) {
      auto &r = cell(p, s < 0 ? "Auge links" : "Auge rechts", 0, field::Light, 1, u, 1.f / 3, 1, s,
                     3, eye, UNUSED);
      r.q1 = -1;
      r.q2 = 1;
      r.qwidth = .3f;
      r.field = .2f;
      r.receptors[field::Excitation] = {true, .6f, -1.6f, .15f, 0, field::MATURITY_SUBSTANCE, 3};
    }
    auto &near = cell(p, s < 0 ? "Nah links" : "Nah rechts", 0, field::Proximity, 1, 1, 2.f / 3, 0,
                      s, 6, mouthIn, UNUSED);
    near.q1 = -1;
    near.q2 = -1;
    near.qwidth = 0;
    near.threshold = -.6f;
    auto broad = near;
    broad.name = "Nahfeld";
    broad.u0 = broad.u1 = 2.f / 3;
    broad.copies = 3;
    broad.organ = int(p.groups.size());
    p.groups.push_back(broad);
    cell(p, "Sehsammlung", 1, -1, 2, 2.f / 3, 1.f / 3, .5f, s, 8, relay, eye);
    cell(p, "Lenkung", 1, -1, 2, 2.f / 3, 2.f / 3, .5f, s, 8, turn, relay);
    auto &fin = cell(p, "Drehflosse", 2, field::Turn, 2, 1, 0, .5f, s, 16, UNUSED, turn);
    fin.v1 = 1;
    fin.w1 = 1;
  }
  auto &sense = cell(p, "Maulsammlung", 1, -1, 1, 0, 1.f / 3, .5f, 1, 8, mouthRelay, mouthIn);
  sense.pace = 1;
  sense.reception[0] = {{-.9f, -.9f}, .05f, 1};
  cell(p, "Maulsteuerung", 1, -1, 1, 0, 2.f / 3, .5f, 1, 8, mouthOut, mouthRelay);
  for (int s : {-1, 1}) {
    cell(p, "Saugmuskel", 2, field::Suction, 1, 1, 0, 0, s, 16, UNUSED, mouthOut);
    auto &tail = cell(p, "Schwanzmuskel", 2, field::Forward, 3, 0, 0, .5f, s, 16, UNUSED, swim);
    tail.u1 = .5f;
    tail.v1 = 1;
    tail.w1 = 1;
  }
  auto &jaw = cell(p, "Kiefer", 2, field::Aggression, 0, 1.f / 3, 0, 0, 0, 16, UNUSED, mouthOut);
  jaw.u1 = jaw.v1 = jaw.w1 = 1;
  jaw.q2 = 1;
  auto &gland =
      cell(p, "Wachstumsdruese", 2, field::Gland, 1, 1.f / 3, 2.f / 3, 0, 1, 8, UNUSED, swim);
  gland.q1 = 1;
  gland.q2 = 0;
  gland.qwidth = 0;
  p.growth = {true, 0, 1, .02f, 0, 0, 0};
  for (int s : {-1, 1}) {
    auto &young = cell(p, "Jugendfarbe", 2, field::Pigment, 2, 0, 0, 1, s, 12, UNUSED, swim);
    young.q1 = -1;
    young.qwidth = .3f;
    young.receptors[field::Death] = {true, 0, 1, .6f, 0, field::MATURITY_SUBSTANCE, 0};
    auto &adult = cell(p, "Erwachsenenfarbe", 2, field::Pigment, 2, 0, 1, 1, s, 12, UNUSED, swim);
    adult.q1 = 1.f / 3;
    adult.qwidth = .3f;
    adult.receptors[field::Output] = {true, -1, 2, .75f, 0, field::MATURITY_SUBSTANCE, 3};
  }
  for (int function : {field::Eggs, field::Sperm})
    for (float w : {0.f, 1.f}) {
      auto &g = cell(p, function == field::Eggs ? "Eiorgan" : "Spermaorgan", 2, function, 3,
                     function == field::Eggs ? 1.f : .75f, 1.f / 3, w, 1, 12, UNUSED, swim);
      if (function == field::Eggs)
        g.receptors[field::Output] = {true, -1, 2, .7f, 0, field::MATURITY_SUBSTANCE, 3};
    }
  return p;
}
}
int main(int argc, char **argv) {
  try {
    fishsim::Genome::begin_run(398117);
    auto plan = starter();
    fishsim::Genome g;
    g.cppn = Builder().build(plan);
    g.development_seed = 9173;
    g.variation_seed = 31019;
    g.compile(false);
    ensure(g.viable(), "starter anatomy failed");
    std::ofstream out(argc > 1 ? argv[1] : fishsim::HAND_BUILT_GENOME);
    ensure(bool(out), "cannot write starter");
    g.write(out);
    std::cout << g.blueprint->neurons.size() << " cells, " << g.blueprint->edges.size()
              << " candidate contacts\n";
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
