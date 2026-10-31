// bau DIR: baut die Futtersammler-Klassen für v019 (eine gemeinsame Abstammungslinie).
#include "bau.hh"
#include <cstdlib>
using namespace bau;
namespace {
// Verdrahtungscodes (Angebot/Suche).
struct Code {
  double a, b;
};
constexpr Code EYE{-.6, .6}, NOSE{-.6, -.6}, RELAY{.6, .6}, FEEL{.0, -.7}, NOWHERE_S{.95, -.95},
    NOWHERE_R{-.95, .95};
double env(const char *name, double fallback) {
  const char *v = std::getenv(name);
  return v ? std::atof(v) : fallback;
}
Anlage cell(std::string name, int zone, Range u, Range v, Range w, double role, int corner_index,
            bool variant = false) {
  Anlage a;
  a.name = name;
  a.zone = zone;
  a.u = u;
  a.v = v;
  a.w = w;
  auto [i1, i2] = corner(corner_index);
  a.values[out::expression] = 1;
  a.values[out::identity_role] = role;
  a.values[out::identity1] = i1;
  a.values[out::identity2] = i2;
  a.values[out::identity3] = variant ? 1 : -1;
  a.values[out::identity4] = -1;
  a.values[out::sender1] = NOWHERE_S.a;
  a.values[out::sender2] = NOWHERE_S.b;
  a.values[out::receiver1] = NOWHERE_R.a;
  a.values[out::receiver2] = NOWHERE_R.b;
  a.values[out::search_width] = -1;
  return a;
}
void sends(Anlage &a, Code c, double crossing, double range = 1) {
  a.values[out::sender1] = c.a;
  a.values[out::sender2] = c.b;
  a.values[out::crossing] = crossing;
  a.values[out::range] = range;
}
void receives(Anlage &a, Code c, double width = -.4) {
  a.values[out::receiver1] = c.a;
  a.values[out::receiver2] = c.b;
  a.values[out::search_width] = width;
}
// Nervenzelle: Vorzeichen +1/-1, Lernart (identity2), Taktgeber/Modulator aus.
Anlage nerve(std::string name, int zone, Range u, Range v, Range w, double sign = 1,
             double mode = 0) {
  Anlage a = cell(name, zone, u, v, w, NERVE, 0);
  a.values[out::identity1] = sign;
  a.values[out::identity2] = mode;
  a.values[out::identity3] = -1;
  a.values[out::identity4] = -1;
  return a;
}
// Empfänger knapp neben einem Code: schwächere, seltenere Verbindungen.
Code near(Code c, double d) {
  return {c.a - d, c.b};
}
struct Plan {
  std::vector<Anlage> parts;
  void add(Anlage a) { parts.push_back(std::move(a)); }
};
// Grundkörper: Augen und Nase steuern über Relais Flossen, Schwanz und Pumpe; Gonaden tonisch.
Plan schnapper() {
  Plan p;
  const double cross = env("CROSS", 1);
  // Nase: Futterduft (Breite 90°), seitlich im Gesicht.
  auto nose = cell("nase", 0, at(1), at(.5), at(1), SENSOR, 2);
  nose.values[out::capacity] = 0;
  nose.values[out::quality1] = 0;
  nose.values[out::quality2] = 1;
  nose.values[out::quality_width] = -1;
  nose.values[out::threshold] = -.6;
  nose.values[out::time_constant] = -.4;
  sends(nose, NOSE, -1, .6);
  p.add(nose);
  auto smell = nerve("geruchsrelais", 1, at(0), at(2. / 3), at(1));
  smell.values[out::capacity] = -.2;
  smell.values[out::field_width] = -.2;
  smell.values[out::time_constant] = -.6;
  receives(smell, NOSE);
  sends(smell, RELAY, cross);
  p.add(smell);
  // Augen: rotempfindlich mit starkem Farbgegensatz, nach vorn und seitlich.
  auto eye = cell("auge", 1, from(env("EYEU", 2. / 3)), between(1. / 3, 2. / 3), any(), SENSOR, 0);
  eye.values[out::capacity] = 0;
  eye.values[out::quality1] = -1;
  eye.values[out::quality2] = 1;
  eye.values[out::field_width] = -.2;
  eye.values[out::threshold] = -.6;
  sends(eye, EYE, -1, .6);
  p.add(eye);
  auto sight = nerve("sehrelais", 1, at(1. / 3), between(1. / 3, 2. / 3), at(1));
  sight.values[out::capacity] = -.2;
  sight.values[out::field_width] = 0;
  sight.values[out::time_constant] = -.6;
  receives(sight, EYE);
  sends(sight, RELAY, cross);
  p.add(sight);
  // Pumpe (Mund) unten im Kopf, leicht tonisch; Darm für Fleisch/Kunstfutter.
  auto pump = cell("pumpe", 1, between(0, 2. / 3), at(0), upto(.5), EFFECTOR, 0);
  const bool big_pump = env("PUMPALL", 0) > 0;
  if (big_pump) {
    // Kehlsack: fast der ganze untere und hintere Kopf pumpt.
    pump.u = upto(1. / 3);
    pump.v = at(0);
    pump.w = any();
  }
  pump.values[out::capacity] = .4;
  pump.values[out::quality1] = -.6;
  pump.values[out::quality2] = .2;
  pump.values[out::threshold] = env("PUMPTHR", -.5);
  const double off = env("OFF", .2);
  receives(pump, near(RELAY, off), -.2);
  p.add(pump);
  if (big_pump) {
    auto throat = pump;
    throat.u = between(2. / 3, 1);
    throat.v = at(0);
    p.add(throat);
    auto roof = pump;
    roof.u = at(0);
    roof.v = from(2. / 3);
    roof.w = upto(.5);
    p.add(roof);
  }
  // Kiefer: fast das ganze Gesicht ist Kaumuskel (scharfe Zähne, langes Maul); nur die Nase bleibt
  // frei.
  auto jaw = cell("kiefer", 0, upto(2. / 3), any(), any(), EFFECTOR, 0);
  jaw.values[out::capacity] = env("JAWCAP", 1);
  jaw.values[out::quality1] = -1;
  jaw.values[out::quality2] = env("JAW", 1);
  jaw.values[out::threshold] = env("JAWTHR", -.6);
  receives(jaw, near(RELAY, off), -.2);
  p.add(jaw);
  for (double v : {0., 1.}) {
    auto lip = jaw;
    lip.u = at(1);
    lip.v = at(v);
    p.add(lip);
  }
  auto chin = jaw;
  chin.u = at(1);
  chin.v = at(.5);
  chin.w = at(0);
  p.add(chin);
  // Seitenflossen in der Brust, außen oben und unten.
  auto fin = cell("flosse", 2, at(1), Range{-.01, .01}, at(1), EFFECTOR, 0);
  fin.values[out::capacity] = .2;
  fin.values[out::threshold] = 0;
  receives(fin, near(RELAY, off), -.2);
  p.add(fin);
  auto fin2 = fin;
  fin2.v = at(1);
  p.add(fin2);
  // Schwanz: tonisch, beschleunigt bei Reiz.
  auto tail = cell("schwanz", 3, between(.25, .5), between(1. / 3, 2. / 3), at(0), EFFECTOR, 0);
  tail.values[out::capacity] = .6;
  tail.values[out::quality1] = 0;
  tail.values[out::threshold] = env("TAILTHR", -1);
  receives(tail, near(RELAY, off), -.2);
  p.add(tail);
  // Gonaden: innen speichern, außen abgeben; Eier und Sperma.
  auto ovary =
      cell("eierstock", 3, between(.5, .75), between(1. / 3, 2. / 3), at(.5), EFFECTOR, 2, false);
  ovary.values[out::capacity] = .6;
  ovary.values[out::threshold] = -1;
  p.add(ovary);
  auto egg_pore = cell("eiöffnung", 3, at(1), at(0), at(1), EFFECTOR, 2, false);
  egg_pore.values[out::capacity] = .2;
  egg_pore.values[out::threshold] = -1;
  p.add(egg_pore);
  auto testis = cell("hoden", 3, at(.75), between(1. / 3, 2. / 3), at(0), EFFECTOR, 2, true);
  testis.values[out::capacity] = .2;
  testis.values[out::threshold] = -1;
  p.add(testis);
  auto sperm_pore = cell("samenöffnung", 3, at(1), at(1), at(1), EFFECTOR, 2, true);
  sperm_pore.values[out::capacity] = 0;
  sperm_pore.values[out::threshold] = -1;
  p.add(sperm_pore);
  return p;
}
Genome make(const Plan &plan, std::shared_ptr<evolution::History> history, std::uint64_t seed) {
  Builder b(history);
  for (const auto &a : plan.parts)
    b.add(a);
  b.finish();
  return genome(b, seed);
}
}
int main(int argc, char **argv) {
  if (argc > 2) {
    std::fprintf(stderr, "Aufruf: bau [AUSGABEVERZEICHNIS]\n");
    return 2;
  }
  const std::string dir = argc > 1 ? argv[1] : ".";
  auto history = std::make_shared<evolution::History>();
  struct Entry {
    const char *name;
    Plan (*plan)();
  };
  const Entry classes[] = {{"schnapper", schnapper}};
  std::uint64_t seed = 29102026;
  for (const auto &c : classes) {
    auto g = make(c.plan(), history, seed++);
    g.save(dir + "/" + c.name + ".genome");
    std::printf("%s: %zu Knoten, %zu Verbindungen\n", c.name, std::size_t(g.cppn->nodes()),
                g.cppn->get_connection_genes().size());
  }
}
