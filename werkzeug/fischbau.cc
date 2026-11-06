// Fischbau v019: Bauplan -> CPPN -> Entwicklung durch die Engine -> Pruefung -> Versuche.
// Aufruf: bin/fischbau [ausgabe.genome] [name=wert ...], z. B. spur=1 schwanz=8
#include "../tests/test_support.hh"
#include "body_plan.hh"
#include "movement.hh"
#include "physiology.hh"
#include "field/contacts.hh"
#include <fstream>
#include <iomanip>
#include <map>
#include <set>

using namespace test;
namespace out = cppn::output;
using evolution::NodeType;

namespace {
constexpr std::array<double, 3> TRIAL_CARRION_COLOR{.5, .25, .2};
bool place_trial_food(Ecosystem &world, double x, double y, double energy,
                      int origin = food_kind::feed) {
  if (world.total_energy() + energy > world.energy_limit())
    return false;
  Food f{x, y, 0, 0, 0, energy};
  f.initial_energy = energy;
  f.origin = origin;
  f.hardness = origin == food_kind::algae   ? world.field.env().hardness_algae
               : origin == food_kind::plant ? world.field.env().hardness_leaf
                                            : 0;
  f.color = origin == food_kind::algae || origin == food_kind::plant ? ALGAE_COLOR
            : origin == food_kind::carrion                           ? TRIAL_CARRION_COLOR
                                                                     : FEED_COLOR;
  f.radius = food_radius(energy);
  if (!world.field.free(x, y, f.radius))
    return false;
  world.field.append_fragment(f);
  return true;
}
enum class Kind { Sensor, Nerve, Effector };
using Code = std::array<float, 2>;
Code channel(int k) {
  return {-.9f + .3f * float(k % 7), -.9f + .3f * float(k / 7)};
}
const Code UNUSED{1, 1};
Code eye_code(bool left) {
  return {left ? -.3f : .3f, .5f};
}
Code side_code(bool left) {
  return {left ? -.2f : .2f, .5f};
}
Code near_code(bool left) {
  return {left ? -.05f : .05f, .5f};
}
const Code MOUTH_FIELD{0, .5f};

struct Box {
  int zone;
  float u0 = 0, u1 = 1, v0 = 0, v1 = 1, w0 = 0, w1 = 1;
  int side = 0; // -1, +1, 0 beide
  bool has(const cppn::Point &p) const {
    return p.zone == zone && p.u > u0 - .05f && p.u < u1 + .05f && p.v > v0 - .05f &&
           p.v < v1 + .05f && p.w > w0 - .05f && p.w < w1 + .05f && (!side || p.side == side);
  }
};
struct Cell {
  std::string name;
  Box at;
  Kind kind;
  int function = -1; // field::Sense oder field::Motor
  int copies = 1;    // Sensor, Nerv: Zellen je Platz; Organ: Groesse in Sechzehnteln
  float threshold = 0, tau = .5f, q1 = 0, q2 = 0, width = 0, field = .5f;
  Code sender = UNUSED, receiver = UNUSED;
  float crossing = 0, range = 1, sign = 1;
  float sigma = .03f;
  float gain = 1;
  struct Receptor {
    int effect = -1;
    float baseline = 0, sensitivity = 0, half = .05f;
    int substance = 0, steepness = 0;
  };
  std::vector<Receptor> receptors{};
};
struct Growth {
  float sensitivity = 0, half = .05f;
  int hormone = 0;
};
float half_output(float half) {
  return float(2 * std::log(half / field::HORMONE_HALF_MIN) /
                   std::log(field::HORMONE_HALF_MAX / field::HORMONE_HALF_MIN) -
               1);
}
std::pair<float, float> hormone_place(int k) {
  const double a = 2 * PI * k / field::BLOOD_SUBSTANCES;
  return {float(std::cos(a)), float(std::sin(a))};
}
std::pair<int, int> corner_of(Kind k, int f) {
  if (k == Kind::Sensor)
    switch (f) {
    case field::Light:
      return {0, 0};
    case field::Proximity:
      return {0, 1};
    case field::Flow:
      return {1, 0};
    case field::Odor:
    case field::Blood:
    case field::Intake:
      return {2, 0};
    case field::Damage:
      return {3, 1};
    default:
      return {3, 0};
    }
  switch (f) {
  case field::Defense:
    return {1, 0};
  case field::Pigment:
    return {3, 0};
  case field::Gland:
  case field::Bladder:
  case field::Eggs:
    return {2, 0};
  case field::Sperm:
    return {2, 1};
  default:
    return {0, 0};
  }
}
std::array<float, cppn::OUTPUTS> outputs(const Cell &c) {
  std::array<float, cppn::OUTPUTS> v{};
  v[out::expression] = 1;
  v[out::identity_role] = c.kind == Kind::Sensor ? -1 : c.kind == Kind::Effector ? 1 : 0;
  if (c.kind == Kind::Nerve) {
    v[out::identity1] = c.sign;
    v[out::identity3] = v[out::identity4] = -1;
  } else {
    const auto [corner, variant] = corner_of(c.kind, c.function);
    v[out::identity1] = corner % 2 ? 1 : -1;
    v[out::identity2] = corner / 2 ? 1 : -1;
    v[out::identity3] = variant ? 1 : -1;
  }
  auto raw = [](float unit) { return 2 * unit - 1; };
  v[out::capacity] = raw(float(c.copies) / 16);
  v[out::threshold] = c.threshold;
  v[out::time_constant] = raw(c.tau);
  v[out::field_width] = raw(c.field);
  v[out::quality1] = c.q1;
  v[out::quality2] = c.q2;
  v[out::quality_width] = raw(c.width);
  v[out::sender1] = c.sender[0];
  v[out::sender2] = c.sender[1];
  v[out::receiver1] = c.receiver[0];
  const double fraction = .5 - std::sin(std::asin(2 * c.gain - 1) / 3);
  const double q = c.gain >= 1 ? 0 : field::CONTACT_CORE +
                      fraction * (field::CONTACT_SUPPORT - field::CONTACT_CORE);
  v[out::receiver2] = c.receiver[1] + c.sigma * std::sqrt(2 * q);
  v[out::search_width] = raw(float(std::log(c.sigma / .03) / std::log(2 / .03)));
  v[out::crossing] = c.crossing;
  v[out::range] = raw(c.range);
  return v;
}

struct Builder {
  std::shared_ptr<evolution::Genome> g =
      std::make_shared<evolution::Genome>(cppn::INPUTS, cppn::OUTPUTS);
  int next = cppn::INPUTS + cppn::OUTPUTS;
  std::map<std::tuple<int, int, float>, int> tests;
  Builder() {
    for (int i = 0; i < next; ++i)
      g->add_node({i, 1, NodeType::LINEAR});
  }
  int node(NodeType type, float parameter) {
    g->add_node({next, parameter, type});
    return next++;
  }
  void link(int a, int b, float w, int port = 0) {
    if (w != 0 && !g->connect(a, b, w, port))
      throw std::runtime_error("CPPN-Verbindung abgelehnt");
  }
  int test(int input, int sign, float limit) {
    auto key = std::make_tuple(input, sign, limit);
    auto it = tests.find(key);
    if (it != tests.end())
      return it->second;
    const int n = node(NodeType::CUTOFF, float(sign) * limit);
    link(input, n, float(sign));
    return tests[key] = n;
  }
  std::map<int, int> selectors;
  int effect_selector(int query) {
    auto it = selectors.find(query);
    if (it != selectors.end())
      return it->second;
    const int distance = node(NodeType::ABS, -field::receptor_effect_code(query)),
              selected = node(NodeType::SIGN, .25f / field::RECEPTOR_QUERIES);
    link(cppn::input::effect, distance, 1);
    link(distance, selected, -1);
    return selectors[query] = selected;
  }
  int indicator(const Box &b, int query = -1) {
    std::vector<int> t{query < 0 ? test(cppn::input::effect, -1, .5f / field::RECEPTOR_QUERIES)
                                 : effect_selector(query)};
    auto range = [&](int input, float lo, float hi) {
      if (lo > 0)
        t.push_back(test(input, 1, lo - .05f));
      if (hi < 1)
        t.push_back(test(input, -1, hi + .05f));
    };
    range(4, b.u0, b.u1);
    range(5, b.v0, b.v1);
    range(6, b.w0, b.w1);
    if (b.side)
      t.push_back(test(7, b.side, 0));
    const float n = float(t.size()) + 2;
    const int a = node(NodeType::CUTOFF, (n - 1) / n);
    for (int k : t)
      link(k, a, 1 / n);
    link(b.zone, a, 2 / n);
    return a;
  }
  void raise(int a, int k, float d) {
    if (d == 0)
      return;
    link(a, cppn::INPUTS + k, d / 2);
    bool found = false;
    for (const auto &e : g->get_connection_genes())
      if (e.get_source() == cppn::BIAS && e.get_target() == cppn::INPUTS + k) {
        g->edit_connection(e.get_innovation_number(), e.get_weight() + d / 2, true);
        found = true;
      }
    if (!found)
      link(cppn::BIAS, cppn::INPUTS + k, d / 2);
  }
  std::shared_ptr<evolution::Genome> build(const std::vector<Cell> &plan, const Growth &growth) {
    std::array<float, cppn::OUTPUTS> base{};
    base[out::expression] = -1;
    for (int k = 0; k < cppn::OUTPUTS; ++k)
      link(cppn::BIAS, cppn::INPUTS + k, base[k]);
    for (const auto &c : plan) {
      const int a = indicator(c.at);
      const auto v = outputs(c);
      for (int k = 0; k < cppn::OUTPUTS; ++k)
        raise(a, k, v[k] - base[k]);
      for (const auto &r : c.receptors) {
        const int q = indicator(c.at, r.effect);
        const auto [x, y] = hormone_place(r.substance);
        raise(q, out::capacity, r.baseline - (r.effect == field::Output ? 1.f : 0.f));
        raise(q, out::field_width, r.sensitivity / field::HORMONE_SENSITIVITY_SPAN);
        raise(q, out::threshold, half_output(r.half));
        raise(q, out::time_constant, float(r.steepness) / field::HORMONE_STEEPNESS_STEPS);
        raise(q, out::quality1, x);
        raise(q, out::quality2, y);
    raise(q, out::quality_width, -1);
      }
    }
    if (growth.sensitivity != 0) {
      const auto &at = field::GROWTH_RECEPTOR_SITE;
      const int q = indicator({at.zone, at.u, at.u, at.v, at.v, at.w, at.w}, field::GROWTH_RECEPTOR);
      const auto [x, y] = hormone_place(growth.hormone);
      raise(q, out::field_width, growth.sensitivity / field::HORMONE_SENSITIVITY_SPAN);
      raise(q, out::threshold, half_output(growth.half));
      raise(q, out::quality1, x);
      raise(q, out::quality2, y);
      raise(q, out::quality_width, -1);
    }
    const int selected = effect_selector(field::Output);
    link(selected, cppn::INPUTS + out::capacity, .5f);
    for (const auto &e : g->get_connection_genes())
      if (e.get_source() == cppn::BIAS && e.get_target() == cppn::INPUTS + out::capacity)
        g->edit_connection(e.get_innovation_number(), e.get_weight() + .5f, true);
    g->validate();
    return g;
  }
};

std::string fixed(double x, int digits = 2) {
  std::ostringstream s;
  s << std::fixed << std::setprecision(digits) << x;
  return s.str();
}

std::map<std::string, double> knobs;
double knob(const std::string &name, double value) {
  auto it = knobs.find(name);
  return it == knobs.end() ? value : it->second;
}
enum Channel { Mouth = 3, TurnL, TurnR, WallL, WallR, Brake, Gut, Depth, Hunger };
enum Hormone { HungerHormone = 0, GrowthHormone = 1 };
const float MIDDLE_HALF = float(std::sqrt(field::HORMONE_HALF_MIN * field::HORMONE_HALF_MAX));
Growth growth() {
  return {float(knob("wachstum", 1)), float(knob("wachstum_halb", .02)), GrowthHormone};
}
std::vector<Cell> plan(bool crossed) {
  using field::Sense;
  std::vector<Cell> p;
  for (int s : {-1, 1}) {
    const bool left = s < 0;
    Cell eye{left ? "AugeL" : "AugeR",
             {1, .3f, 1, 1.f / 3, 1.f / 3, 0, 1, s},
             Kind::Sensor,
             field::Light};
    eye.copies = 3;
    eye.threshold = -1;
    eye.q1 = float(knob("farbe", -1));
    eye.q2 = 1;
    eye.width = .3f;
    eye.field = .2f;
    eye.sender = eye_code(left);
    p.push_back(eye);
    Cell steer{
        left ? "LenkerL" : "LenkerR", {2, .6f, .7f, 1.f / 3, 2.f / 3, .5f, .5f, s}, Kind::Nerve};
    steer.copies = 4;
    steer.receiver = eye_code(left);
    steer.sigma = float(knob("lenker_sigma", .14)); // Seite im Bindungskern
    steer.sender = channel((left != crossed) ? TurnL : TurnR);
    steer.tau = 1; // langsame Anpassung: kein Rueckschlag, wenn das Futter das Feld verlaesst
    p.push_back(steer);
    Cell inhibit = steer;
    inhibit.name = left ? "HemmerL" : "HemmerR";
    inhibit.at = {2, .6f, .7f, 1.f / 3, 2.f / 3, 1, 1, s};
    inhibit.sign = -1;
    inhibit.sender = channel((left != crossed) ? TurnR : TurnL);
    p.push_back(inhibit);
    // Waende (Boden, Oberflaeche) seitlich: wegdrehen, also ungekreuzt.
    Cell wall{left ? "WandL" : "WandR",
              {1, .6f, 1, 2.f / 3, 2.f / 3, .5f, .5f, s},
              Kind::Sensor,
              field::Proximity};
    wall.copies = 4;
    wall.threshold = 0;
    wall.q2 = float(knob("wand_weite", -.43));
    wall.q1 = float(knob("wand_farbe", 1. / 3)); // Blau: Boden und Wasser, kaum rotes Futter
    wall.width = 0;
    wall.field = .3f;
    wall.sender = channel(left ? WallL : WallR);
    p.push_back(wall);
    Cell avoid{
        left ? "MeiderL" : "MeiderR", {2, .3f, .4f, 1.f / 3, 2.f / 3, .5f, .5f, s}, Kind::Nerve};
    avoid.copies = 4;
    avoid.receiver = channel(left ? WallL : WallR);
    avoid.gain = float(knob("wand", 1));
    avoid.sender = channel((left != crossed) ? TurnR : TurnL);
    avoid.tau = .3f;
    p.push_back(avoid);
    // Gegentakt auch hier: Rueckschlag beim Entfernen dreht zurueck zur Wand (Wandfolgen).
    Cell follow = avoid;
    follow.name = left ? "FolgerL" : "FolgerR";
    follow.at = {2, .3f, .4f, 1.f / 3, 2.f / 3, 1, 1, s};
    follow.sign = -1;
    follow.sender = channel((left != crossed) ? TurnL : TurnR);
    if (knob("folgen", 1) > 0)
      p.push_back(follow);
    // Tastsinn vorn am Kopf (tast=2): Beruehrung und eingesunkener Kopf melden wie die Wand.
    // Versuch: weniger Fische sitzen im Sediment fest, aber in der Arena frisst der Fisch ein
    // Drittel weniger, weil er beim Bodenfutter abdreht. Daher aus.
    Cell touch{left ? "TastL" : "TastR", {1, .9f, 1, 1, 1, 1, 1, s}, Kind::Sensor, field::Touch};
    touch.copies = int(knob("tast", 0));
    touch.threshold = 0;
    touch.field = .3f;
    touch.sender = channel(left ? WallL : WallR);
    if (knob("tast", 0) > 0)
      p.push_back(touch);
    // Futter direkt vor dem Maul hemmt das Wandmeiden: Koerner liegen auf Boden und Plattformen.
    Cell reach{
        left ? "NahWandL" : "NahWandR", {2, .6f, .7f, 1.f / 3, 2.f / 3, 0, 0, s}, Kind::Nerve};
    reach.copies = 2;
    reach.sign = -1;
    reach.tau = .3f;
    reach.receiver = MOUTH_FIELD;
    reach.sigma = .07f;
    reach.gain = float(knob("nahwand", 1));
    reach.sender = channel(left ? WallL : WallR);
    if (knob("nahwand", 1) > 0)
      p.push_back(reach);
    Cell fin{
        left ? "FlosseL" : "FlosseR", {2, .9f, 1, 0, 1, .5f, 1, s}, Kind::Effector, field::Turn};
    // Kurze Zeitkonstante: kleine, haeufige Schlaege statt weniger grosser.
    fin.copies = int(knob("flosse", 4));
    fin.tau = 0;
    fin.threshold = .3f;
    fin.receiver = channel(left ? TurnL : TurnR);
    p.push_back(fin);
  }
  for (int s : {-1, 1}) {
    Cell near{s < 0 ? "NahL" : "NahR",
              {1, .9f, 1, 2.f / 3, 2.f / 3, 0, 0, s},
              Kind::Sensor,
              field::Proximity};
    near.copies = int(knob("nah_kopien", 6));
    near.threshold = float(knob("nah_schwelle", .6));
    near.q2 = -1;
    near.q1 = float(knob("farbe", -1)); // schmal: Futter heller als Boden
    near.width = 0;
    near.field = .3f;
    near.sender = near_code(s < 0);
    p.push_back(near);
    Cell side{
        s < 0 ? "SeiteL" : "SeiteR", {1, .6f, 1, 1, 1, 0, .5f, s}, Kind::Sensor, field::Proximity};
    side.copies = 2;
    side.threshold = 0;
    side.q2 = -.43f;
    side.q1 = float(knob("farbe", -1));
    side.width = 0;
    side.field = .3f;
    side.sender = side_code(s < 0);
    p.push_back(side);
  }
  Cell mouth{"Maulnerv", {1, 0, 0, 2.f / 3, 2.f / 3, 0, 0}, Kind::Nerve};
  mouth.copies = 2;
  mouth.receiver = MOUTH_FIELD;
  mouth.sigma = .07f; // beide Nah im Bindungskern
  mouth.sender = channel(Mouth);
  mouth.tau = .3f;
  p.push_back(mouth);
  Cell jaw{"Kiefer", {0, float(knob("kiefer_u", .3))}, Kind::Effector, field::Aggression};
  jaw.copies = 16;
  // Biss kostet 2 x 0.03 x Antrieb x Schlagdauer: kurze Schlaege (4 Schritte) lohnen, lange nicht.
  jaw.tau = 0;
    jaw.q1 = -1;
  jaw.threshold = float(knob("kiefer_schwelle", .5));
  jaw.receiver = channel(Mouth);
  if (knob("kiefer", 1) > 0)
    p.push_back(jaw);
  else if (knob("kiefer_kurz", 0) > 0) {
    Cell lever{"Kieferstummel", {0, 1, 1, .5f, .5f, 0, 0, 1}, Kind::Effector, field::Aggression};
    lever.copies = 1;
    lever.q2 = -1;
    lever.threshold = 1;
    p.push_back(lever);
  }
  Cell pump{"Pumpe", {1, 0, 1, 0, 0}, Kind::Effector, field::Suction};
  // Zweite Reihe hinten im Kopf: Pumpe 36 statt 24 (v018b-Klassen 64; mehr Platz ist nicht frei).
  // Ohne bessere Futtersuche kostet sie mehr Unterhalt, als sie einbringt: nur als Versuch.
  if (knob("pumpe2", 0) > 0) {
    Cell more{"Pumpe2", {1, 0, .34f, 1, 1}, Kind::Effector, field::Suction};
    more.copies = 16;
    more.q1 = float(knob("darm", -1));
    more.threshold = float(knob("pumpe_schwelle", .5));
    more.receiver = channel(Mouth);
    p.push_back(more);
  }
  pump.copies = 16;
  pump.q1 = float(knob("darm", -1));
  pump.threshold = float(knob("pumpe_schwelle", .5));
  pump.receiver = channel(Mouth);
  p.push_back(pump);
  // Dauerantrieb nur ueber den eigenen Bias (tanh .3 = .29): Tempo kommt aus der Organgroesse.
  // Ganzes hinteres Hinterteil, 72 Plaetze. Kraft 18 (schwanz=14: 63 wie die v018b-Klassen; mehr
  // Unterhalt, aber ohne bessere Futtersuche kein Gewinn).
  Cell tail{"Schwanz", {3, 0, .5f}, Kind::Effector, field::Forward};
  tail.copies = int(knob("schwanz", 4));
  tail.receiver = channel(Brake);
  tail.receptors = {{field::Output, 0, 1, MIDDLE_HALF, HungerHormone}};
  // Schlaengeln (q1 -1..1 = 0..1): kostet im freien Wasser bis zur Haelfte des Schubs, senkt aber
  // den Widerstand im Sediment. Versuch schlaengeln=0: Arena ein Drittel weniger Futter; aus.
  tail.q1 = float(knob("schlaengeln", -1));
  // Futter direkt vor dem Maul bremst: der Fisch bleibt und beisst nach.
  Cell brake{"Bremse", {2, 0, 0, 1.f / 3, 2.f / 3, 0, 0}, Kind::Nerve};
  brake.copies = 1;
  brake.sign = -1;
  brake.tau = 1;
  brake.receiver = MOUTH_FIELD;
  brake.sigma = .07f;
  brake.gain = float(knob("bremse", .01));
  brake.sender = channel(Brake);
  p.push_back(brake);
  // Tiefe: Drucksinn neben einer (untaetigen) Schwimmblase misst y / Hoehe. Steigt der Fisch,
  // dreht er immer zur selben Seite, bis er wieder sinkt (Klinokinese). So findet er den Boden.
  if (knob("tiefe", 0) > 0) {
    Cell bladder{"Blase", {2, 1, 1, 1.f / 3, 1.f / 3, 0, 0, 1}, Kind::Effector, field::Bladder};
    bladder.copies = 1;
    p.push_back(bladder);
    Cell depth{"Tiefe", {1, 0, 0, 1.f / 3, 1.f / 3, 0, 0, 1}, Kind::Sensor, field::InnerPressure};
    depth.copies = 16;
    depth.threshold = float(knob("tiefe_schwelle", .4));
    depth.sender = channel(Depth);
    p.push_back(depth);
    Cell kinesis{"Kinese", {2, 2.f / 3, 2.f / 3, 1, 1, 0, 0}, Kind::Nerve};
    kinesis.copies = int(knob("kinese_kopien", 2));
    kinesis.sign = -1;
    kinesis.tau = float(knob("kinese_tau", .5));
    kinesis.receiver = channel(Depth);
    kinesis.gain = float(knob("tiefe", 0));
    kinesis.sender = channel(TurnL);
    p.push_back(kinesis);
  }
  Cell gut{"Darmdruck",
           {2, 1.f / 3, 1.f / 3, 1.f / 3, 2.f / 3, 0, 0},
           Kind::Sensor,
           field::InnerPressure};
  gut.copies = 2;
  gut.threshold = -.6f;
  gut.sender = channel(Gut);
  p.push_back(gut);
  Cell full{"Satt", {2, 0, 0, 1.f / 3, 2.f / 3, .5f, .5f}, Kind::Nerve};
  full.copies = 2;
  full.sign = -1;
  full.tau = 1;
  full.receiver = channel(Gut);
  full.sender = channel(Hunger);
  p.push_back(full);
  Cell gland{"Hirndruese", {1, .3f, .4f, 2.f / 3, 2.f / 3}, Kind::Effector, field::Gland};
  gland.copies = int(knob("druese", 8));
  gland.threshold = -1;
  gland.tau = 1;
  gland.q1 = hormone_place(HungerHormone).first;
  gland.q2 = hormone_place(HungerHormone).second;
  gland.width = 0;
  gland.receiver = channel(Hunger);
  p.push_back(gland);
  if (knob("wachstum_druese", 8) > 0) {
    Cell growing{"Wachstumsdruese", {1, 0, 0, 1, 1}, Kind::Effector, field::Gland};
    growing.copies = int(knob("wachstum_druese", 8));
    growing.threshold = -1;
    growing.tau = 1;
    growing.q1 = hormone_place(GrowthHormone).first;
    growing.q2 = hormone_place(GrowthHormone).second;
    growing.width = 0;
    p.push_back(growing);
  }
  if (knob("farben", 1) > 0) {
    Cell young{"Jugendfarbe", {2, 0, .4f, 0, 0}, Kind::Effector, field::Pigment};
    young.copies = int(knob("farbkraft", 8));
    young.threshold = -1;
    young.q1 = -1;
    young.width = .3f;
    young.receptors = {{field::Death, 0, 1, float(knob("jugend_bis", .6)),
                        field::MATURITY_SUBSTANCE}};
    p.push_back(young);
    Cell adult = young;
    adult.name = "Erwachsenenfarbe";
    adult.at = {2, 0, .4f, 1, 1};
    adult.q1 = 1.f / 3;
    adult.receptors = {{field::Output, -1, 2, float(knob("erwachsen_ab", .75)),
                        field::MATURITY_SUBSTANCE, field::HORMONE_STEEPNESS_STEPS}};
    p.push_back(adult);
  }
  tail.threshold = -1;
  p.push_back(tail);
  for (int organ : {field::Eggs, field::Sperm}) {
    const float u = organ == field::Eggs ? 1 : .75f;
    const bool eggs = organ == field::Eggs;
    Cell inner{eggs ? "EierInnen" : "SpermaInnen",
               {3, u, u, 1.f / 3, 2.f / 3, 0, eggs ? .5f : 0},
               Kind::Effector,
               organ};
    inner.copies = eggs ? int(knob("eikraft", 12)) : 4; // Staerke je Zelle in Sechzehnteln
    inner.threshold = -1;
    // Pubertaet: der Eierstock arbeitet erst mit der Reife, halb bei Reife pubertaet (0: immer).
    // Das Spermaorgan bleibt an: sein Sekret oeffnet beim Schlupf die Eihuelle.
    if (eggs && knob("pubertaet", .7) > 0)
      inner.receptors = {{field::Output, -1, 2, float(knob("pubertaet", .7)),
                          field::MATURITY_SUBSTANCE, field::HORMONE_STEEPNESS_STEPS}};
    p.push_back(inner);
    Cell outer = inner;
    outer.name = eggs ? "EierAussen" : "SpermaAussen";
    outer.copies = 4;
    outer.at.w0 = outer.at.w1 = 1;
    p.push_back(outer);
  }
  return p;
}

bool verify(const Genome &g, const std::vector<Cell> &p, std::vector<int> &kind_of) {
  const auto &s = *g.blueprint;
  bool ok = true;
  kind_of.assign(s.neurons.size(), -1);
  std::vector<int> cells(p.size()), sites(p.size());
  std::map<std::uint32_t, int> group_size;
  for (const auto &n : s.neurons)
    ++group_size[n.group];
  std::map<std::uint32_t, bool> seen;
  for (std::size_t i = 0; i < s.neurons.size(); ++i) {
    const auto &n = s.neurons[i];
    int match = -1;
    for (std::size_t k = 0; k < p.size(); ++k)
      if (p[k].at.has(n.location)) {
        if (match >= 0) {
          std::cout << "Ueberlappung " << p[match].name << " / " << p[k].name << "\n";
          ok = false;
        }
        match = int(k);
      }
    kind_of[i] = match;
    if (match < 0) {
      std::cout << "Fremde Zelle in Zone " << n.location.zone << "\n";
      ok = false;
      continue;
    }
    const auto &c = p[match];
    ++cells[match];
    if (!seen[n.group]) {
      seen[n.group] = true;
      ++sites[match];
      const int want = c.kind == Kind::Effector ? 1 : c.copies;
      if (group_size[n.group] != want) {
        std::cout << c.name << ": " << group_size[n.group] << " statt " << want << " Kopien\n";
        ok = false;
      }
    }
    const auto role = c.kind == Kind::Sensor  ? field::Role::Sensor
                      : c.kind == Kind::Nerve ? field::Role::Nerve
                                              : field::Role::Effector;
    bool right = n.role == role;
    if (c.kind == Kind::Sensor)
      right = right && n.functions.senses[c.function] == 1;
    if (c.kind == Kind::Effector)
      right = right && n.functions.motors[c.function] == 1;
    if (!right) {
      std::cout << c.name << ": falsche Rolle oder Funktion\n";
      ok = false;
    }
    for (int effect = 0; effect < field::HORMONE_EFFECTS; ++effect) {
      const auto &r = n.hormone_receptors[effect];
      const Cell::Receptor *own = nullptr;
      for (const auto &q : c.receptors)
        if (q.effect == effect)
          own = &q;
      const float baseline = own ? own->baseline : effect == field::Output ? 1.f : 0.f,
                  sensitivity = own ? own->sensitivity : 0.f;
      if (!(std::abs(r.baseline - baseline) < 1e-4) ||
          !(std::abs(r.sensitivity - sensitivity) < 1e-4) ||
          (own && (!(std::abs(r.half - own->half) < 1e-3 * own->half) ||
                   r.steepness != own->steepness))) {
        std::cout << c.name << ": Rezeptor " << effect << " nicht wie geplant (Grund "
                  << r.baseline << ", Empfindlichkeit " << r.sensitivity << ", Halbwert " << r.half
                  << ")\n";
        ok = false;
      }
      if (own && !(r.affinity[own->substance] > .99f)) {
        std::cout << c.name << ": Rezeptor " << effect << " bindet nicht an Stoff " << own->substance
                  << "\n";
        ok = false;
      }
    }
  }
  const auto planned = growth();
  const auto &grow = s.growth_receptor;
  if (!(std::abs(grow.sensitivity - planned.sensitivity) < 1e-4) ||
      (planned.sensitivity != 0 && (!(grow.affinity[planned.hormone] > .99f) ||
                                    !(std::abs(grow.half - planned.half) < 1e-3 * planned.half)))) {
    std::cout << "Wachstumsrezeptor nicht wie geplant\n";
    ok = false;
  }
  const double adult_tissue =
      std::min(MAX_TISSUE, TISSUE_PER_ORGAN_REF * BODY_TISSUE * g.interface->organ_mass /
                               DEFAULT_ORGAN_MASS_REF);
  std::cout << "Wachstumsrezeptor: Hormon " << planned.hormone << ", Empfindlichkeit "
            << fixed(grow.sensitivity) << ", Halbwert " << fixed(grow.half, 3) << "; Endgewebe "
            << fixed(adult_tissue, 0) << ", Reife beim Schlupf etwa "
            << fixed(HATCH_TISSUE / adult_tissue) << "\n";
  for (std::size_t k = 0; k < p.size(); ++k) {
    int want = 0;
    for (std::size_t i = 0; i < field::DEVELOPMENT_SITES; ++i) {
      static const int sizes[4][3] = {{4, 3, 2}, {4, 4, 3}, {4, 4, 3}, {5, 4, 3}};
      std::size_t index = i;
      int zone = 0;
      for (; zone < 4; ++zone) {
        const auto count = std::size_t(2 * sizes[zone][0] * sizes[zone][1] * sizes[zone][2]);
        if (index < count)
          break;
        index -= count;
      }
      const auto &n = sizes[zone];
      cppn::Point q{};
      q.zone = zone;
      q.side = index % 2 ? 1 : -1;
      index /= 2;
      q.w = float(index % n[2]) / float(n[2] - 1);
      index /= n[2];
      q.v = float(index % n[1]) / float(n[1] - 1);
      index /= n[1];
      q.u = float(index) / float(n[0] - 1);
      want += p[k].at.has(q);
    }
    std::cout << std::setw(13) << std::left << p[k].name << sites[k] << "/" << want << " Plaetze, "
              << cells[k] << " Zellen\n";
    if (sites[k] != want)
      ok = false;
  }
  std::cout << s.neurons.size() << " Zellen, " << s.edges.size() << " Synapsen\n";
  std::map<std::string, std::map<int, int>> pressure;
  for (const auto &r : g.interface->sensory)
    if (r.pressure_target != -2 && (r.channel == 7 || r.channel == 8 || r.channel == 9) &&
        kind_of[r.neuron] >= 0)
      ++pressure[p[std::size_t(kind_of[r.neuron])].name][r.pressure_kind];
  if (knob("lage", 0) > 0) {
    for (std::size_t i = 0; i < s.neurons.size(); ++i)
      if (kind_of[i] >= 0 &&
          (p[std::size_t(kind_of[i])].name == "Tiefe" ||
           p[std::size_t(kind_of[i])].name == "Blase") &&
          s.neurons[i].id % 16 == 0)
        std::cout << "  " << p[std::size_t(kind_of[i])].name << " u " << s.neurons[i].location.u
                  << " v " << s.neurons[i].location.v << " w " << s.neurons[i].location.w << ": "
                  << fixed(s.neurons[i].x) << " " << fixed(s.neurons[i].y) << " "
                  << fixed(s.neurons[i].z) << "\n";
    std::cout << "  Darm:";
    for (int k = 0; k < 33; k += 4)
      std::cout << " (" << fixed(g.interface->gut_path[k][0]) << ","
                << fixed(g.interface->gut_path[k][1]) << ")";
    std::cout << "\n";
  }
  for (const auto &[name, kinds] : pressure) {
    std::cout << "Drucksinn " << name << ":";
    for (const auto &[k, n] : kinds)
      std::cout << " Art " << k << " x" << n;
    std::cout << "\n";
  }
  return ok;
}
void wiring(const Genome &g, const std::vector<Cell> &p, const std::vector<int> &kind_of) {
  std::map<std::pair<int, int>, std::pair<int, double>> m;
  for (const auto &e : g.blueprint->edges) {
    auto &x = m[{kind_of[e.source], kind_of[e.target]}];
    ++x.first;
    x.second += e.weight;
  }
  for (const auto &[k, v] : m)
    std::cout << "  " << p[k.first].name << " -> " << p[k.second].name << ": " << v.first << " (w "
              << std::setprecision(2) << v.second / v.first << ")\n";
}

Ecosystem tank(unsigned seed) {
  Ecosystem w(seed);
  w.resize(615, 410);
  w.workers = 1;
  w.safety = false;
  w.evo.assist_min_population = w.evo.assist_species_minimum = 0;
  w.set_parameter("energy_supply", 0);
  w.food_burst.strength = 0;
  no_mutation(w);
  w.disease.rate = w.disease.spread = w.disease.carrion = w.disease.food = 0;
  w.field.clear_food();
  return w;
}
struct Lab {
  Ecosystem w = tank(7);
  std::uint64_t id = 0;
  Body &body() { return individual(w, id).body; }
};
// Der Fisch lebt schon eine Weile: 200 Schritte festgehalten, damit die Mittelwerte der
// Eingaenge eingeschwungen sind.
std::unique_ptr<Lab> lab(const Genome &g, double x = 300, double y = 205, double angle = 0) {
  auto l = std::make_unique<Lab>();
  l->id = adult(l->w, g, x, y).id;
  l->body().tissue = l->body().peak_tissue = knob("gewebe", 40);
  for (int t = 0; t < 200; ++t) {
    auto &b = l->body();
    b.x = x;
    b.y = y;
    b.angle = angle;
    auto &m = StateAccess::motor(b);
    m.vx = m.vy = m.speed = m.angular_velocity = 0;
    b.energy = 260;
    l->w.tick(false);
  }
  auto &b = l->body();
  b.x = x;
  b.y = y;
  b.angle = angle;
  auto &m = StateAccess::motor(b);
  m.vx = m.vy = m.speed = m.angular_velocity = 0;
  return l;
}
void food_at(Lab &l, double bearing, double distance, double energy = 40) {
  const auto &b = l.body();
  const double a = b.angle + bearing * PI / 180;
  check(place_trial_food(l.w, b.x + distance * std::cos(a), b.y + distance * std::sin(a), energy),
        "Futter platzieren");
}
std::vector<double> signals(const Body &b, const std::vector<int> &kind_of, std::size_t kinds) {
  std::vector<double> peak(kinds, -1);
  const auto &net = *b.brain();
  for (std::size_t i = 0; i < kind_of.size(); ++i)
    if (kind_of[i] >= 0)
      peak[std::size_t(kind_of[i])] =
          std::max(peak[std::size_t(kind_of[i])], double(net.signal(i)));
  return peak;
}
int index_of(const std::vector<Cell> &p, const std::string &name) {
  for (std::size_t k = 0; k < p.size(); ++k)
    if (p[k].name == name)
      return int(k);
  throw std::runtime_error("Zelltyp fehlt: " + name);
}
void test_eyes(const Genome &g, const std::vector<Cell> &p, const std::vector<int> &kind_of) {
  const int L = index_of(p, "AugeL"), R = index_of(p, "AugeR");
  std::cout << "Augen (Winkel L/R):";
  for (double bearing : {-60., -30., -10., 0., 10., 30., 60.}) {
    auto l = lab(g);
    food_at(*l, bearing, 30);
    l->w.tick(false);
    auto s = signals(l->body(), kind_of, p.size());
    std::cout << "  " << bearing << ": " << fixed(s[L]) << "/" << fixed(s[R]);
  }
  std::cout << "\n";
}
void test_scenes(const Genome &g, const std::vector<Cell> &p, const std::vector<int> &kind_of) {
  struct Scene {
    const char *name;
    double y, angle, food, bearing = 0;
  };
  for (const Scene &c :
       {Scene{"Wasser", 205, 0, 0}, Scene{"Boden 8", 395, 90, 0}, Scene{"Boden 20", 383, 90, 0},
        Scene{"Boden schraeg", 392, 45, 0}, Scene{"Oben 8", 20, -90, 0},
        Scene{"Oben schraeg", 20, -45, 0}, Scene{"Futter 8", 205, 0, 8},
        Scene{"Futter 30 seitl.", 205, 0, 30, -40}, Scene{"Futter 30", 205, 0, 30}}) {
    auto l = lab(g, 300, c.y, c.angle * PI / 180);
    if (c.food > 0)
      food_at(*l, c.bearing, c.food);
    l->w.tick(false);
    auto s = signals(l->body(), kind_of, p.size());
    std::cout << std::setw(10) << std::left << c.name;
    for (std::size_t k = 0; k < p.size(); ++k)
      if (p[k].kind == Kind::Sensor)
        std::cout << " " << p[k].name << " " << fixed(s[k]);
    std::cout << "\n";
  }
}
void test_swim(const Genome &g) {
  {
    auto l = lab(g);
    const auto &b = l->body();
    const auto &ph = l->w.physiology();
    std::cout << "Ruhekosten je 100: gesamt " << fixed(100 * b.rest_cost) << ", Grundumsatz "
              << fixed(100 * basal_cost(b.tissue, ph)) << ", Muskeln "
              << fixed(100 * g.interface->muscle_maintenance * ph.basal_metabolism()) << ", Nerven "
              << fixed(100 * b.neural_upkeep() * ph.neural_cost) << "\n";
  }
  std::cout << "Schwimmen (Hoehe: Tempo, Verbrauch):";
  for (double height : {205., 300., 370.}) {
    auto l = lab(g, 100, height);
    const double energy = l->body().energy, x = l->body().x, y = l->body().y;
    for (int t = 0; t < 100; ++t)
      l->w.tick(false);
    const auto &b = l->body();
    std::cout << "  " << height << ": "
              << fixed(std::hypot(l->w.field.delta_x(b.x - x), b.y - y) / 100) << ", "
              << fixed((energy - b.energy) / 100, 3);
  }
  std::cout << "\n";
}
// 1c. Boden: schraeg nach unten schwimmen. Erwartet: nicht haengen bleiben, nahe am Boden bleiben.
bool test_floor(const Genome &g, const std::vector<Cell> &p, const std::vector<int> &kind_of,
                bool trace) {
  bool ok = true;
  for (double heading : {45., 135.}) {
    auto l = lab(g, 300, 330, heading * PI / 180);
    double deepest = 0, near = 0, stuck = 0, x = l->body().x;
    for (int t = 0; t < 600; ++t) {
      l->w.tick(false);
      const auto &b = l->body();
      deepest = std::max(deepest, b.y);
      near += b.y > 340;
      stuck += b.y > 400;
      if (trace && heading < 90 && t % 20 == 0) {
        auto s = signals(b, kind_of, p.size());
        std::cout << "  " << t << " y " << fixed(b.y, 0) << " Kurs "
                  << fixed(std::remainder(b.angle, 2 * PI) * 180 / PI, 0);
        for (auto name : {"WandL", "WandR", "MeiderL", "MeiderR", "FlosseL", "FlosseR"})
          std::cout << " " << name << " " << fixed(s[index_of(p, name)]);
        std::cout << "\n";
      }
    }
    const auto &b = l->body();
    // Haengen heisst: kein Vorankommen. Bodenkontakt beim Absuchen ist erlaubt.
    const bool good = std::abs(l->w.field.delta_x(l->body().x - x)) > 100 || stuck < 30;
    ok = ok && good;
    std::cout << "Boden " << heading << ": tiefster Punkt " << fixed(deepest, 0)
              << ", Anteil unten " << fixed(near / 600) << ", am Boden " << fixed(stuck / 600)
              << ", Weg x " << fixed(std::abs(l->w.field.delta_x(b.x - x)), 0)
              << (good ? "  OK\n" : "  FEHLER\n");
  }
  return ok;
}
const std::vector<int> *trace_kinds = nullptr;
const std::vector<Cell> *trace_plan = nullptr;
void print_signals(const Body &b) {
  if (trace_kinds) {
    const auto sg = signals(b, *trace_kinds, trace_plan->size());
    for (const char *name :
         {"AugeL", "AugeR", "NahL", "NahR", "SeiteL", "SeiteR", "LenkerL", "LenkerR", "HemmerL",
          "HemmerR", "WandL", "WandR", "FlosseL", "FlosseR", "Bremse", "Schwanz", "Kiefer"})
      std::cout << " " << name << " " << fixed(sg[index_of(*trace_plan, name)]);
  }
  std::cout << " Hunger " << fixed(b.hormones().levels()[0], 3) << "\n";
}
void test_descent(const Genome &g) {
  std::cout << "Abstieg (Kurs: Anteil unten, Hoehe min..max):";
  for (double heading : {0., 180.}) {
    auto l = lab(g, 300, 150, heading * PI / 180);
    double low = 0, top = 1e9, bottom = 0;
    for (int t = 0; t < 1200; ++t) {
      l->w.tick(false);
      const auto &b = l->body();
      if (knob("spur", 0) > 0 && heading == knob("spur_kurs", 0) && t % 25 == 0 && trace_kinds) {
        auto sg = signals(b, *trace_kinds, trace_plan->size());
        std::cout << "\n    " << t << " y " << fixed(b.y, 0) << " Kurs "
                  << fixed(std::remainder(b.angle, 2 * PI) * 180 / PI, 0);
        for (auto name : {"Tiefe", "Kinese", "WandL", "WandR", "FlosseL", "FlosseR"})
          std::cout << " " << name << " " << fixed(sg[index_of(*trace_plan, name)]);
      }
      if (t >= 400) {
        low += b.y > 300;
        top = std::min(top, b.y);
        bottom = std::max(bottom, b.y);
      }
    }
    std::cout << "  " << heading << ": " << fixed(low / 800) << ", " << fixed(top, 0) << ".."
              << fixed(bottom, 0);
  }
  std::cout << "\n";
}
bool test_turn(const Genome &g, const std::vector<Cell> &p, const std::vector<int> &kind_of) {
  bool ok = true;
  const int nl = index_of(p, "LenkerL"), nr = index_of(p, "LenkerR"), fl = index_of(p, "FlosseL"),
            fr = index_of(p, "FlosseR");
  for (double bearing : {-40., 40.}) {
    auto l = lab(g);
    food_at(*l, bearing, 30);
    double before = l->body().angle, turned = 0, impulse[2]{};
    std::vector<double> peak(p.size());
    for (int t = 0; t < 30; ++t) {
      l->w.tick(false);
      auto &b = l->body();
      turned += std::remainder(b.angle - before, 2 * PI);
      before = b.angle;
      impulse[0] += StateAccess::motor(b).impulse_left;
      impulse[1] += StateAccess::motor(b).impulse_right;
      auto s = signals(b, kind_of, p.size());
      for (std::size_t k = 0; k < p.size(); ++k)
        peak[k] = std::max(peak[k], s[k]);
    }
    turned *= 180 / PI;
    ok = ok && turned * bearing > 0;
    std::cout << "Drehung " << bearing << ": " << fixed(turned, 1) << " Grad, Lenker "
              << fixed(peak[nl]) << "/" << fixed(peak[nr]) << ", Flosse " << fixed(peak[fl]) << "/"
              << fixed(peak[fr]) << ", Schlag " << fixed(impulse[0]) << "/" << fixed(impulse[1])
              << "\n";
  }
  std::cout << (ok ? "Drehung OK\n" : "Drehung FEHLER\n");
  return ok;
}
bool test_bite(const Genome &g, const std::vector<Cell> &p, const std::vector<int> &kind_of,
               bool trace) {
  bool ok = false;
  {
    auto l = lab(g);
    const auto &b = l->body();
    std::cout << "Maul: Koerper " << fixed(body_radius(b)) << ", Oeffnung "
              << fixed(maximum_mouth_aperture(b)) << ", Schluckflaeche " << fixed(swallow_area(b))
              << ", Darm frei " << fixed(gut_room(b, 0, l->w.physiology()))
              << ", Bissportion "
              << fixed(32 * body_scale(b) * 2 *
                       effective_force(b.bite_strength * body_scale(b) * jaw_leverage(b),
                                       b.force_scale))
              << ", Futterradius " << fixed(food_radius(40.)) << "\n";
  }
  std::cout << "Biss (Energie/Abstand: Darm, Schritte):";
  for (auto [energy, distance] :
       {std::pair{40., 6.}, {40., 12.}, {40., 16.}, {150., 9.}, {150., 14.}, {150., 20.}}) {
    auto l = lab(g);
    food_at(*l, 0, distance, energy);
    std::vector<double> peak(p.size(), -1);
    int t = 0;
    for (; t < 40 && l->body().gut_energy < 1; ++t) {
      l->w.tick(false);
      auto s = signals(l->body(), kind_of, p.size());
      if (trace && distance == 12 && energy == 40 && t % 4 == 0) {
        std::cout << "\n    " << t << " x " << fixed(l->body().x - 300, 1);
        for (auto name : {"NahL", "Maulnerv", "Schwanz", "Kiefer"})
          std::cout << " " << name << " " << fixed(s[index_of(p, name)]);
      }
      for (std::size_t k = 0; k < p.size(); ++k)
        peak[k] = std::max(peak[k], s[k]);
    }
    const auto &b = l->body();
    ok = ok || b.gut_energy > 1;
    std::cout << "  " << energy << "/" << distance << ": " << fixed(b.gut_energy, 1) << ", " << t
              << " (Nah " << fixed(peak[index_of(p, "NahL")]) << ")";
  }
  std::cout << (ok ? "  OK\n" : "  FEHLER\n");
  return ok;
}
bool test_approach(const Genome &g) {
  int reached = 0, total = 0;
  std::cout << "Anflug (Hoehe/Winkel: Schritte):";
  for (double height : {205., 350., 380.})
    for (double bearing : {-60., -30., 0., 30., 60.}) {
      auto l = lab(g, 300, height);
      if (height > 370) // Futter liegt am Boden, 50 voraus
        check(place_trial_food(l->w, 300 + 50 * std::cos(bearing * PI / 360), 404, 100), "Futter");
      else
        food_at(*l, bearing, 50, 100);
      int t = 0;
      for (; t < 200; ++t) {
        l->w.tick(false);
        const auto &b = l->body();
        bool close = false;
        for (const auto &f : l->w.field.feeding().pieces)
          close = close || std::hypot(l->w.field.delta_x(f.x - b.x), f.y - b.y) < 15;
        if (close)
          break;
      }
      ++total;
      reached += t < 200;
      std::cout << " " << height << "/" << bearing << ": " << (t < 200 ? std::to_string(t) : "-");
    }
  std::cout << (reached == total ? "  OK\n" : "  FEHLER\n");
  return reached == total;
}
void test_mouth(const Genome &g, const std::vector<Cell> &p, const std::vector<int> &kind_of) {
  auto l = lab(g);
  auto &b0 = l->body();
  const double radius = food_radius(150.), gap = body_radius(b0) * b0.snout_position + radius + .5;
  food_at(*l, 0, gap, 150);
  double strokes = 0, cost = 0, bite = 0, jaw = 0;
  const double gut = l->body().gut_energy;
  for (int t = 0; t < 100; ++t) {
    auto &b = l->body();
    b.x = 300;
    b.y = 205;
    b.angle = 0;
    auto &m = StateAccess::motor(b);
    m.vx = m.vy = m.speed = m.angular_velocity = 0;
    l->w.tick(false);
    auto &c = l->body();
    if (StateAccess::motor(c).combat_cost > 0) {
      ++strokes;
      cost += StateAccess::motor(c).combat_cost;
      bite += c.bite_signal;
    }
    auto sig = signals(c, kind_of, p.size());
    jaw = std::max(jaw, sig[index_of(p, "Kiefer")]);
    if (knob("spur", 0) > 0 && t % 5 == 0)
      std::cout << "    " << t << " Nah " << fixed(sig[index_of(p, "NahL")]) << " Maulnerv "
                << fixed(sig[index_of(p, "Maulnerv")]) << " Kiefer "
                << fixed(sig[index_of(p, "Kiefer")]) << " Pumpe "
                << fixed(sig[index_of(p, "Pumpe")]) << " Biss " << fixed(c.bite_signal) << " Darm "
                << fixed(c.gut_energy, 1) << "\n";
  }
  double left = 0, pieces = 0;
  for (const auto &f : l->w.field.feeding().pieces)
    left += f.energy, ++pieces;
  const auto &b = l->body();
  std::cout << "Maul fest, 100 Schritte: " << strokes << " Bisse, Staerke "
            << fixed(bite / std::max(1., strokes)) << ", Kiefer max " << fixed(jaw) << ", Kosten "
            << fixed(cost, 1) << ", Darm +" << fixed(b.gut_energy - gut + b.digested, 1)
            << ", Futter uebrig " << fixed(left, 0) << " in " << pieces << " Stuecken\n";
}
void test_meal(const Genome &g) {
  for (double size : {50., 150.}) {
    auto l = lab(g);
    food_at(*l, 0, 9, size);
    const double energy = l->body().energy;
    double combat = 0, muscle = 0, digested = 0;
    for (int t = 0; t < 300; ++t) {
      l->w.tick(false);
      auto &b = l->body();
      combat += StateAccess::motor(b).combat_cost;
      muscle += b.ledger().muscle_cost;
      digested += b.digestion;
    }
    const auto &b = l->body();
    const double intake = b.gut_energy + digested;
    std::cout << "Mahlzeit " << size << ", 300 Schritte: gefressen " << fixed(intake, 0)
              << ", Bisse " << fixed(combat, 0) << ", Muskeln " << fixed(muscle, 0) << ", Bilanz "
              << fixed(intake - combat - muscle, 0) << ", Energie " << fixed(b.energy - energy, 0)
              << "\n";
  }
}
bool test_floor_food(const Genome &g, const std::vector<Cell> &p, const std::vector<int> &kind_of,
                     bool trace) {
  bool ok = false;
  std::cout << "Bodenfutter (Hoehe: Darm):";
  for (double height : {380., 392.}) {
    auto l = lab(g, 300, height);
    check(place_trial_food(l->w, 330, 400, 100), "Futter platzieren");
    for (int t = 0; t < 150 && l->body().gut_energy < 1; ++t) {
      l->w.tick(false);
      const auto &f = l->w.field.feeding().pieces;
      if (trace && t % 5 == 0 && !f.empty()) {
        const auto &b = l->body();
        auto s = signals(b, kind_of, p.size());
        std::cout << "\n    " << t << " Fisch (" << fixed(b.x, 0) << "," << fixed(b.y, 0)
                  << ") Kurs " << fixed(std::remainder(b.angle, 2 * PI) * 180 / PI, 0)
                  << " Futter (" << fixed(f[0].x, 0) << "," << fixed(f[0].y, 0) << ") r "
                  << fixed(food_radius(f[0])) << " Kiefer " << fixed(s[index_of(p, "Kiefer")])
                  << " Biss " << fixed(b.bite_signal) << " Sog " << fixed(b.eat_signal);
      }
    }
    const auto &b = l->body();
    ok = ok || b.gut_energy > 1;
    std::cout << "  " << height << ": " << fixed(b.gut_energy, 1);
  }
  std::cout << (ok ? "  OK\n" : "  FEHLER\n");
  return ok;
}
void test_suction(const Genome &g) {
  Ecosystem w(3);
  w.resize(615, 410);
  w.workers = 1;
  w.safety = false;
  w.evo.assist_min_population = w.evo.assist_species_minimum = 0;
  no_mutation(w);
  w.disease.rate = w.disease.spread = w.disease.carrion = w.disease.food = 0;
  w.field.place_initial_food();
  for (int t = 0; t < 3000; ++t)
    w.tick(false);
  std::vector<std::tuple<std::string, double, double, double>> spots;
  for (double x : {100., 300., 500.})
    spots.push_back({"Wasser", x, 290, 0});
  for (double x : {100., 300., 500.})
    spots.push_back({"Boden", x, 404, PI / 2});
  int algae = 0;
  for (const auto &q : w.field.vegetation().plants)
    if (q.kind == 4 && q.energy > 0 && algae < 3) {
      ++algae;
      spots.push_back({"Alge", q.x - 6, q.y, 0});
    }
  std::cout << "Saugen (je 100 Schritte: verwertbar als Alge/Pumpkosten):";
  for (const auto &[name, x, y, angle] : spots) {
    auto copy = w.fork();
    auto &f = adult(copy, g, x, y);
    const auto id = f.id;
    f.body.tissue = f.body.peak_tissue = knob("gewebe", 40);
    double gained = 0, pump = 0;
    for (int t = 0; t < 300; ++t) {
      auto &b = individual(copy, id).body;
      b.x = x;
      b.y = y;
      b.angle = angle;
      b.energy = 200;
      auto &m = StateAccess::motor(b);
      m.vx = m.vy = m.speed = m.angular_velocity = 0;
      const double before = b.gut_energy;
      copy.tick(false);
      auto &c = individual(copy, id).body;
      if (t >= 100) {
        gained += (c.gut_energy + c.digestion - before) * digestibility(c, 4);
        pump += c.ledger().muscle_cost;
      }
    }
    std::cout << " " << name << " " << fixed(gained / 2, 1) << "/" << fixed(pump / 2, 1);
  }
  std::cout << "\n";
}
bool test_hatch(const Genome &g) {
  auto w = tank(7);
  const double energy = std::min(
      w.evo.egg_capacity, w.evo.egg_organ_capacity * g.interface->motor_counts[organ_port::eggs]);
  std::cout << "Ei: " << fixed(energy, 0) << " (Minimum "
            << fixed(minimum_egg_energy(g, w.physiology()), 0) << ")\n";
  const auto id = egg(w, g, energy);
  double last_energy = energy, shell = 1, tissue = 0;
  int cause = -1;
  for (int t = 0; t < 3000; ++t) {
    w.tick(false);
    auto it = std::find_if(w.fish.begin(), w.fish.end(), [&](auto &p) { return p.id == id; });
    if (it == w.fish.end() || !it->body.alive) {
      std::cout << "Schlupf: Ei tot nach " << t << " Schritten, Ursache " << cause << ", Energie "
                << fixed(last_energy) << ", Schale " << fixed(shell) << ", Gewebe " << fixed(tissue)
                << "  FEHLER\n";
      return false;
    }
    const auto &b = it->body;
    last_energy = b.energy;
    shell = b.embryo.shell;
    tissue = b.tissue;
    cause = b.fatal_cause;
    if (b.hatched) {
      std::cout << "Schlupf: nach " << t << " Schritten, Ei " << fixed(energy, 0) << ", Rest "
                << fixed(b.energy, 0) << "  OK\n";
      for (int k = 0; k < knob("spur_schlupf", 0); ++k) {
        w.tick(false);
        auto f = std::find_if(w.fish.begin(), w.fish.end(), [&](auto &p) { return p.id == id; });
        if (f == w.fish.end() || !f->body.alive)
          break;
        std::cout << "    " << k << " v " << fixed(StateAccess::motor(f->body).speed);
        if (trace_kinds) {
          const auto &net = *f->body.brain();
          const int lenker = index_of(*trace_plan, "LenkerL");
          for (std::size_t i = 0; i < trace_kinds->size(); ++i)
            if ((*trace_kinds)[i] == lenker) {
              std::cout << " Lenker0 bias " << fixed(net.blueprint().neurons[i].bias) << " Mittel "
                        << fixed(net.synaptic_mean(i));
              break;
            }
        }
        print_signals(f->body);
      }
      return true;
    }
  }
  std::cout << "Schlupf: nach 3000 Schritten noch im Ei, Schale " << fixed(shell) << "  FEHLER\n";
  return false;
}
struct Life {
  int steps = 0;
  double energy = 0, tissue = 0;
  double eaten = 0, path = 0, rest = 0, tail = 0, fins = 0, pump = 0, bites = 0, low = 0,
         strokes = 0, hits = 0, encounters = 0, seen = 0;
};
Life arena_life(const Genome &g, unsigned seed, int steps, bool trace, const std::vector<Cell> &p,
                const std::vector<int> &kind_of) {
  auto l = std::make_unique<Lab>();
  if (knob("zufuhr", 0) > 0) {
    // Standardbecken mit Futterzufuhr: 3000 Schritte ohne Fisch einschwingen.
    l->w = Ecosystem(seed);
    l->w.resize(615, 410);
    l->w.workers = 1;
    l->w.safety = false;
    l->w.evo.assist_min_population = l->w.evo.assist_species_minimum = 0;
    no_mutation(l->w);
    l->w.disease.rate = l->w.disease.spread = l->w.disease.carrion = l->w.disease.food = 0;
    l->w.field.place_initial_food();
    for (int t = 0; t < 3000; ++t)
      l->w.tick(false);
    l->id = adult(l->w, g, 300, 205).id;
  } else {
    l = lab(g, 300, 205);
    Rng r(seed);
    for (int k = 0; k < 12; ++k)
      place_trial_food(l->w, r.uniform(0, 615), r.uniform(250, 400), r.uniform(25, 200));
  }
  const auto &ph = l->w.physiology();
  Life life;
  std::unique_ptr<std::ofstream> spur;
  if (trace && knob("spurdatei", 0) > 0)
    spur = std::make_unique<std::ofstream>("arena_spur.txt");
  int bitten = 0;
  bool was_close = false;
  for (; life.steps < steps; ++life.steps) {
    const double x = l->body().x, y = l->body().y, gut = l->body().gut_energy;
    l->w.tick(false);
    auto it =
        std::find_if(l->w.fish.begin(), l->w.fish.end(), [&](auto &f) { return f.id == l->id; });
    if (it == l->w.fish.end() || !it->body.alive)
      break;
    const auto &b = it->body;
    const auto &m = StateAccess::motor(b);
    life.path += std::hypot(l->w.field.delta_x(b.x - x), b.y - y);
    life.eaten += b.digestion;
    life.rest += b.rest_cost;
    life.tail += ph.swimming_cost * m.impulse_forward;
    life.fins += ph.turn_cost * (m.impulse_left + m.impulse_right);
    life.pump += b.ledger().muscle_cost - ph.swimming_cost * m.impulse_forward -
                 ph.turn_cost * (m.impulse_left + m.impulse_right);
    life.bites += m.combat_cost;
    life.low += b.y > 250;
    {
      // Begegnung: ein Stueck kommt naeher als 15 (Rand zu Rand ~ Maulweite).
      bool close = false, visible = false;
      for (const auto &f : l->w.field.feeding().pieces) {
        const double dx = l->w.field.delta_x(f.x - b.x), dy = f.y - b.y, d = std::hypot(dx, dy),
                     bearing = std::remainder(std::atan2(dy, dx) - b.angle, 2 * PI);
        close = close || d < 15;
        visible = visible || (d < 60 && std::abs(bearing) < 1.6);
      }
      life.encounters += close && !was_close;
      if (trace && life.encounters <= 2) {
        const Food *best = nullptr;
        double bd = 1e9;
        for (const auto &f : l->w.field.feeding().pieces) {
          const double d = std::hypot(l->w.field.delta_x(f.x - b.x), f.y - b.y);
          if (d < bd)
            bd = d, best = &f;
        }
        if (best && bd < 25) {
          auto sg = signals(b, kind_of, p.size());
          const double bearing = std::remainder(
              std::atan2(best->y - b.y, l->w.field.delta_x(best->x - b.x)) - b.angle, 2 * PI);
          std::cout << "    " << life.steps << " d " << fixed(bd, 1) << " w "
                    << fixed(bearing * 180 / PI, 0) << " r " << fixed(food_radius(*best), 1)
                    << " E " << fixed(best->energy, 0) << " v " << fixed(m.speed) << " NahL/R "
                    << fixed(sg[index_of(p, "NahL")]) << "/" << fixed(sg[index_of(p, "NahR")])
                    << " Kiefer " << fixed(sg[index_of(p, "Kiefer")]) << " Biss "
                    << fixed(m.combat_cost) << " Darm " << fixed(b.gut_energy, 1);
          print_signals(b);
        }
      }
      life.seen += visible;
      was_close = close;
    }
    if (m.combat_cost > 0) {
      ++life.strokes;
      bitten = 6;
    }
    if (b.gut_energy > gut + 1e-6 && bitten > 0)
      ++life.hits, bitten = 0;
    --bitten;
    if (spur) {
      *spur << "F " << life.steps << " " << b.x << " " << b.y << " " << b.gut_energy << " "
            << (m.combat_cost > 0) << "\n";
      if (life.steps % 25 == 0)
        for (const auto &f : l->w.field.feeding().pieces)
          *spur << "P " << life.steps << " " << f.x << " " << f.y << " " << food_radius(f) << "\n";
    }
    if (trace && life.steps % 100 == 0)
      std::cout << "  " << life.steps << ": (" << fixed(b.x, 0) << "," << fixed(b.y, 0) << ") Kurs "
                << fixed(std::remainder(b.angle, 2 * PI) * 180 / PI, 0) << " Darm "
                << fixed(b.gut_energy, 1) << " Energie " << fixed(b.energy, 0) << "\n";
  }
  if (life.steps == steps) {
    life.eaten += l->body().gut_energy;
    life.energy = l->body().energy;
    life.tissue = l->body().tissue;
  }
  return life;
}
bool test_arena(const Genome &g, int steps, bool trace, const std::vector<Cell> &p,
                const std::vector<int> &kind_of) {
  Life sum;
  int survivors = 0;
  const int runs = 6;
  for (int k = 0; k < runs; ++k) {
    auto life = arena_life(g, unsigned(5 + k), steps, trace && k == 0, p, kind_of);
    survivors += life.steps == steps;
    sum.steps += life.steps;
    sum.eaten += life.eaten;
    sum.path += life.path;
    sum.rest += life.rest;
    sum.tail += life.tail;
    sum.fins += life.fins;
    sum.pump += life.pump;
    sum.bites += life.bites;
    sum.low += life.low;
    sum.strokes += life.strokes;
    sum.hits += life.hits;
    sum.encounters += life.encounters;
    sum.energy += life.energy;
    sum.tissue += life.tissue;
    sum.seen += life.seen;
  }
  const double n = sum.steps;
  std::cout << "Arena (" << runs << " Becken): lebt " << survivors << " (Energie "
            << fixed(sum.energy / std::max(1, survivors), 0) << ", Gewebe "
            << fixed(sum.tissue / std::max(1, survivors), 0) << "), Lebensdauer "
            << sum.steps / runs << ", gefressen " << fixed(sum.eaten / runs, 0) << ", Tempo "
            << fixed(sum.path / n) << "; Kosten je 100 Schritte: Ruhe "
            << fixed(100 * sum.rest / n, 1) << ", Schwanz " << fixed(100 * sum.tail / n, 1)
            << ", Flossen " << fixed(100 * sum.fins / n, 1) << ", Pumpe+Rest "
            << fixed(100 * sum.pump / n, 1) << ", Bisse " << fixed(100 * sum.bites / n, 1)
            << "\n  unten " << fixed(sum.low / n) << ", Bisse " << fixed(sum.strokes / runs, 0)
            << ", davon Treffer " << fixed(sum.hits / std::max(1., sum.strokes)) << ", Begegnungen "
            << fixed(sum.encounters / runs, 1) << ", Futter in Sicht " << fixed(sum.seen / n)
            << "\n";
  return survivors > runs / 2;
}
void test_breed(const Genome &g, int steps) {
  Ecosystem w(unsigned(knob("saat", 11)));
  const bool large = knob("gross", 0) > 0;
  if (large)
    w.starter_world();
  else
    w.resize(615, 410);
  w.workers = large ? 4 : 1;
  w.safety = false;
  w.evo.assist_min_population = w.evo.assist_species_minimum = 0;
  no_mutation(w);
  w.disease.rate = w.disease.spread = w.disease.carrion = w.disease.food = 0;
  w.field.place_initial_food();
  for (int t = 0; t < 3000; ++t)
    w.tick(false);
  const double energy = std::min(
      w.evo.egg_capacity, w.evo.egg_organ_capacity * g.interface->motor_counts[organ_port::eggs]);
  Rng r(5);
  std::set<std::uint64_t> founders;
  const double width = w.field.geometry().width, height = w.field.geometry().height;
  const int count = int(knob("eier", 6));
  for (int k = 0; k < count; ++k)
    for (int attempt = 0; attempt < 50; ++attempt)
      if (const auto at = w.field.food_cloud(k % std::max(1, w.field.source_count()));
          w.spawn(g, std::clamp(at.x + r.uniform(-40, 40), 20., width - 20),
                  std::clamp(at.y + r.uniform(-40, 40), 20., height - 20), 1, 77, 1, energy)) {
        auto &p = w.fish.back();
        founders.insert(p.id);
        p.fertilised = p.clonal = false;
        p.maternal_species = p.species;
        p.species = 0;
        p.maternal_natural = true;
        break;
      }
  std::cout << "Zucht: " << count << " Eier zu " << fixed(energy, 0) << " (Minimum "
            << fixed(minimum_egg_energy(g, w.physiology()), 0) << ")\n";
  std::map<std::uint64_t, int> cause;
  std::map<int, int> deaths;
  double intake = 0, fish_steps = 0, sight = 0, nearest = 0;
  int hatched_natural = 0, laid = 0, nutrient = 0;
  std::set<std::uint64_t> seen, hatched;
  for (int t = 1; t <= steps; ++t) {
    w.tick(true);
    std::set<std::uint64_t> alive;
    for (const auto &p : w.fish) {
      const int known = std::max(p.body.fatal_cause, p.death_cause);
      cause[p.id] = known >= 0 ? known : p.body.energy < 2 ? 90 : p.body.health < .2 ? 91 : -1;
      if (!p.body.alive)
        continue;
      alive.insert(p.id);
      const bool natural = !founders.count(p.id);
      if (seen.insert(p.id).second && natural) {
        ++laid;
        nutrient += p.nutrient_egg;
      }
      if (p.body.hatched) {
        intake += p.body.digestion;
        ++fish_steps;
        double d = 1e9;
        const Food *best = nullptr;
        bool visible = false;
        for (const auto &f : w.field.feeding().pieces) {
          if (f.origin != 0)
            continue;
          const double dx = w.field.delta_x(f.x - p.body.x), dy = f.y - p.body.y,
                       r = std::hypot(dx, dy);
          if (r < d)
            d = r, best = &f;
          visible =
              visible ||
              (r < 60 && std::abs(std::remainder(std::atan2(dy, dx) - p.body.angle, 2 * PI)) < 1.6);
        }
        if (knob("spur_zucht", 0) > 0 && p.id == *founders.begin() && best &&
            (knob("spur_zucht", 0) > 1 ? t >= knob("spur_von", 0) && t <= knob("spur_bis", 1e9)
                                       : d < 30 && t % 5 == 0)) {
          const auto &m = StateAccess::motor(p.body);
          std::cout << "    " << t << " d " << fixed(d, 1) << " w "
                    << fixed(std::remainder(std::atan2(best->y - p.body.y,
                                                       w.field.delta_x(best->x - p.body.x)) -
                                                p.body.angle,
                                            2 * PI) *
                                 180 / PI,
                             0)
                    << " r " << fixed(best->radius, 1) << " E " << fixed(best->energy, 0) << " vy "
                    << fixed(best->vy, 2) << " Boden " << best->bottom_steps << " y "
                    << fixed(p.body.y, 0) << " v " << fixed(m.speed) << " Biss "
                    << fixed(m.combat_cost, 3) << " Darm " << fixed(p.body.gut_energy, 1)
                    << " Gewebe " << fixed(p.body.tissue, 1);
          print_signals(p.body);
        }
        nearest += std::min(d, 1000.);
        sight += visible;
        if (hatched.insert(p.id).second && natural)
          ++hatched_natural;
      }
    }
    for (auto it = cause.begin(); it != cause.end();)
      if (!alive.count(it->first)) {
        ++deaths[hatched.count(it->first) ? it->second : 100];
        it = cause.erase(it);
      } else
        ++it;
    if (t % 500)
      continue;
    int fish = 0, eggs = 0;
    unsigned generation = 0;
    double tissue = 0, reserve = 0, yolk = 0, speed = 0, height = 0;
    for (const auto &p : w.fish) {
      if (!p.body.alive)
        continue;
      if (!p.body.hatched) {
        ++eggs;
        continue;
      }
      ++fish;
      generation = std::max(generation, p.g);
      speed += StateAccess::motor(p.body).speed;
      height += p.body.y;
      tissue += p.body.tissue;
      reserve += p.body.energy;
      yolk += p.body.reproduction().egg_yolk;
    }
    const double n = std::max(1, fish);
    std::cout << std::setw(6) << t << ": Fische " << fish << ", Eier " << eggs << ", gelegt "
              << laid << " (Naehreier " << nutrient << "), geschluepft " << hatched_natural
              << ", Generation " << generation << ", Gewebe " << fixed(tissue / n, 0)
              << ", Reserve " << fixed(reserve / n, 0) << ", Dotter " << fixed(yolk / n, 0)
              << ", Aufnahme/100 " << fixed(100 * intake / std::max(1., fish_steps), 1)
              << ", Sicht " << fixed(sight / std::max(1., fish_steps)) << ", naechstes "
              << fixed(nearest / std::max(1., fish_steps), 0) << ", Tempo " << fixed(speed / n)
              << ", Hoehe " << fixed(height / n, 0) << ", Futter " << w.field.food_count() << "/"
              << fixed(w.field.food_energy(), 0) << ", Tode";
    for (auto [c, k] : deaths)
      std::cout << " "
                << (c == 100  ? std::string("Ei")
                    : c == 90 ? std::string("Hunger")
                    : c == 91 ? std::string("Gesundheit")
                              : std::to_string(c))
                << ":" << k;
    std::cout << "\n";
    if (knob("einzeln", 0) > 0)
      for (const auto &p : w.fish)
        if (p.body.alive && p.body.hatched) {
          std::cout << "    Fisch " << p.id << ": Alter " << p.body.age - p.body.hatch_age
                    << ", Gewebe " << fixed(p.body.tissue, 0) << ", Reserve "
                    << fixed(p.body.energy, 0) << ", Gesundheit " << fixed(p.body.health)
                    << ", Tempo " << fixed(StateAccess::motor(p.body).speed) << ", x "
                    << fixed(p.body.x, 0) << ", y " << fixed(p.body.y, 0) << ", Schub "
                    << fixed(StateAccess::motor(p.body).thrust, 3) << ", Sediment "
                    << fixed(p.body.sediment_coverage) << ", Gras "
                    << w.field.in_grass(p.body.x, p.body.y, body_radius(p.body)) << ", Kurs "
                    << fixed(std::remainder(p.body.angle, 2 * PI) * 180 / PI, 0) << ", Drehung "
                    << fixed(StateAccess::motor(p.body).turn, 3);
          print_signals(p.body);
        }
    intake = fish_steps = sight = nearest = 0;
  }
}
constexpr double FEED_REACH = 12;
void test_phases(const Genome &g, const std::vector<Cell> &p, const std::vector<int> &kind_of) {
  Ecosystem w(unsigned(knob("saat", 11)));
  w.resize(615, 410);
  w.workers = 1;
  w.safety = false;
  w.evo.assist_min_population = w.evo.assist_species_minimum = 0;
  no_mutation(w);
  w.disease.rate = w.disease.spread = w.disease.carrion = w.disease.food = 0;
  w.field.place_initial_food();
  for (int t = 0; t < 3000; ++t)
    w.tick(false);
  const double energy = std::min(
      w.evo.egg_capacity, w.evo.egg_organ_capacity * g.interface->motor_counts[organ_port::eggs]);
  const auto at = w.field.food_cloud(0);
  check(w.spawn(g, at.x, at.y, 1, 77, 1, energy), "Ei setzen");
  const auto id = w.fish.back().id;
  std::map<int, int> cells;
  for (std::size_t i = 0; i < kind_of.size(); ++i)
    if (kind_of[i] >= 0)
      ++cells[kind_of[i]];
  const int steps = int(knob("dauer", 6000));
  for (int t = 1; t <= steps; ++t) {
    w.tick(false);
    auto it = std::find_if(w.fish.begin(), w.fish.end(), [&](auto &f) { return f.id == id; });
    if (it == w.fish.end() || !it->body.alive) {
      std::cout << "Lebensabschnitte: tot nach " << t << " Schritten\n";
      return;
    }
    const auto &b = it->body;
    if (b.hatched && t % int(knob("fuetter_takt", 25)) == 0)
      place_trial_food(w, b.x + FEED_REACH * std::cos(b.angle),
                       b.y + FEED_REACH * std::sin(b.angle), knob("fuetter_energie", 30));
    if (t % int(knob("takt", 250)) || !b.hatched || !b.brain())
      continue;
    const auto &net = *b.brain();
    const auto &levels = b.hormones().levels();
    std::cout << std::setw(6) << t << ": Alter " << b.age - b.hatch_age << ", Gewebe "
              << fixed(b.tissue, 1) << "/" << fixed(tissue_capacity(b), 0) << ", Reife "
              << fixed(net.maturity()) << ", Wachstum " << fixed(growth_permission(b)) << ", H0 "
              << fixed(levels[HungerHormone]) << ", H1 " << fixed(levels[GrowthHormone])
              << ", Reserve " << fixed(b.energy, 0) << ", Farbe " << fixed(b.color[0]) << "/"
              << fixed(b.color[1]) << "/" << fixed(b.color[2]);
    for (const char *name : {"Jugendfarbe", "Erwachsenenfarbe", "EierInnen", "SpermaInnen"}) {
      int kind = -1;
      for (std::size_t k = 0; k < p.size(); ++k)
        if (p[k].name == name)
          kind = int(k);
      if (kind < 0)
        continue;
      int dead = 0;
      double output = 0;
      for (std::size_t i = 0; i < kind_of.size(); ++i)
        if (kind_of[i] == kind) {
          dead += net.dead(i);
          output += .5 * (1 + net.blueprint().neurons[i].hormone_receptors[field::Output].response(
                                  levels, net.maturity()));
        }
      std::cout << ", " << name << " tot " << dead << "/" << cells[kind] << " Ausgabe "
                << fixed(output / std::max(1, cells[kind]));
    }
    std::cout << "\n";
  }
}
} // namespace

int main(int argc, char **argv) {
  try {
    for (int i = 1; i < argc; ++i) {
      const std::string a = argv[i];
      const auto eq = a.find('=');
      if (eq != std::string::npos)
        knobs[a.substr(0, eq)] = std::stod(a.substr(eq + 1));
    }
    Genome::begin_run(42);
    const bool crossed = knob("gekreuzt", 1) > 0;
    const auto p = plan(crossed);
    Builder builder;
    Genome g;
    g.cppn = builder.build(p, growth());
    g.development_seed = 1;
    g.variation_seed = 2;
    g.name = "Handfisch";
    g.compile();
    std::vector<int> kind_of;
    const bool ok = verify(g, p, kind_of);
    std::cout << (ok ? "Bauplan stimmt" : "BAUPLAN FEHLERHAFT") << ", lebensfaehig " << g.viable()
              << "\n";
    wiring(g, p, kind_of);
    if (argc > 1 && std::string(argv[1]).find('=') == std::string::npos) {
      std::ofstream file(argv[1]);
      g.write(file);
    }
    if (!ok)
      return 1;
    if (knob("nur_bauen", 0) > 0)
      return 0;
    if (knob("nur_saugen", 0) > 0) {
      test_suction(g);
      return 0;
    }
    trace_kinds = &kind_of;
    trace_plan = &p;
    if (knob("nur_szenen", 0) > 0) {
      test_scenes(g, p, kind_of);
      return 0;
    }
    if (knob("nur_abstieg", 0) > 0) {
      test_swim(g);
      test_descent(g);
      test_floor(g, p, kind_of, knob("spur_boden", 0) > 0);
      return 0;
    }
    if (knob("nur_schlupf", 0) > 0) {
      test_hatch(g);
      return 0;
    }
    if (knob("nur_zucht", 0) > 0) {
      test_breed(g, int(knob("dauer", 8000)));
      return 0;
    }
    if (knob("nur_phasen", 0) > 0) {
      test_phases(g, p, kind_of);
      return 0;
    }
    if (knob("nur_arena", 0) > 0) {
      test_arena(g, int(knob("dauer", 3000)), knob("spur", 0) > 0, p, kind_of);
      return 0;
    }
    test_eyes(g, p, kind_of);
    test_scenes(g, p, kind_of);
    test_swim(g);
    test_descent(g);
    test_floor(g, p, kind_of, knob("spur", 0) > 0);
    test_turn(g, p, kind_of);
    test_bite(g, p, kind_of, knob("spur", 0) > 0);
    test_approach(g);
    test_mouth(g, p, kind_of);
    test_meal(g);
    test_floor_food(g, p, kind_of, knob("spur", 0) > 0);
    test_hatch(g);
    test_arena(g, 3000, knob("spur", 0) > 0, p, kind_of);
  } catch (const std::exception &e) {
    std::cerr << e.what() << "\n";
    return 1;
  }
}
