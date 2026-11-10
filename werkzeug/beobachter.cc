#include "ecology.hh"
#include "physiology.hh"
#include "plants.hh"
#include "perception.hh"
#include "field/development_sites.hh"
#include <fstream>
#include <iostream>
#include <map>
#include <set>

// Watches fish in the aquarium: where they swim, what they eat, what their senses and designed
// brain sites do, and which contacts they learn. Output is JSONL: one frame per line, with
// counters for eggs, sperm and fertilisations so far.
using namespace fishsim;
namespace {
// Sites and roles share one key: site * ROLES + role.
constexpr int ROLES = 4, WORKERS = 2;
constexpr double TENTHS = 10, HUNDREDTHS = 100, THOUSANDTHS = 1000, TEN_THOUSANDTHS = 10000;
double rounded(double value, double per_unit) {
  return std::round(value * per_unit) / per_unit;
}
struct Options {
  int every = 5, detail = 50, tracked = 6;
};
int site_of(const cppn::Point &p) {
  for (std::size_t i = 0; i < field::DEVELOPMENT_SITES; ++i) {
    const auto s = field::development_site(i);
    if (s.zone == p.zone && s.u == p.u && s.v == p.v && s.w == p.w && s.side == p.side)
      return int(i);
  }
  return -1;
}
struct Tracked {
  std::vector<int> sites;              // Per neuron.
  std::vector<int> roles;              // Per neuron.
  std::vector<int> order;              // Distinct sites in output order.
  std::map<int, std::size_t> position; // Site to output position.
};
Tracked describe(const field::Network &brain) {
  Tracked t;
  for (const auto &n : brain.blueprint().neurons) {
    t.sites.push_back(site_of(n.location));
    t.roles.push_back(int(n.role));
  }
  for (std::size_t i = 0; i < t.sites.size(); ++i) {
    const int key = t.sites[i] * ROLES + t.roles[i];
    if (!t.position.count(key)) {
      t.position[key] = t.order.size();
      t.order.push_back(key);
    }
  }
  return t;
}
void values(std::ostream &out, const std::vector<double> &v) {
  out << '[';
  for (std::size_t i = 0; i < v.size(); ++i)
    out << (i ? "," : "") << rounded(v[i], THOUSANDTHS);
  out << ']';
}
}

int main(int argc, char **argv) {
  try {
    if (argc < 5)
      throw std::invalid_argument("Aufruf: beobachter GENOM SEED SCHRITTE ANZAHL [every=N] "
                                  "[detail=N] [tracked=N] [Parameter=Wert ...]");
    const auto seed = std::stoull(argv[2]);
    const int steps = std::stoi(argv[3]), count = std::stoi(argv[4]);
    Options o;
    Genome::begin_run(seed);
    const auto g = Genome::load(argv[1]);
    Ecosystem w(seed);
    w.safety = false;
    w.workers = WORKERS;
    for (int i = 5; i < argc; ++i) {
      const std::string option = argv[i];
      const auto split = option.find('=');
      if (split == std::string::npos)
        throw std::invalid_argument("Parameter=Wert erwartet");
      const auto key = option.substr(0, split), value = option.substr(split + 1);
      if (key == "every")
        o.every = std::stoi(value);
      else if (key == "detail")
        o.detail = std::stoi(value);
      else if (key == "tracked")
        o.tracked = std::stoi(value);
      else if (!w.set_parameter(key, std::stod(value)))
        throw std::invalid_argument("Unbekannter Parameter: " + key);
    }
    w.starter_world();
    w.seed({g}, count, run_limit::default_food);
    auto &out = std::cout;
    out << "{\"event\":\"setup\",\"width\":" << w.field.geometry().width
        << ",\"height\":" << w.field.geometry().height << ",\"obstacles\":[";
    bool first = true;
    for (const auto &ob : w.field.geometry().obstacles) {
      out << (first ? "[" : ",[");
      first = false;
      for (std::size_t k = 0; k < ob.vertices.size(); ++k)
        out << (k ? "," : "") << '[' << std::round(ob.vertices[k].x) << ','
            << std::round(ob.vertices[k].y) << ']';
      if (ob.vertices.empty())
        out << '[' << ob.x << ',' << ob.y << ',' << ob.radius << ']';
      out << ']';
    }
    out << "],\"feeders\":[";
    for (std::size_t k = 0; k < w.field.feeding().feeders.size(); ++k) {
      const auto &f = w.field.feeding().feeders[k];
      out << (k ? "," : "") << '[' << f.x << ',' << f.y << ',' << f.radius << ',' << f.rate << ']';
    }
    out << "]}\n";
    std::map<std::uint64_t, Tracked> tracked;
    struct Bites {
      int closings = 0, pumps = 0;
      std::array<int, feeding_effect::count> actions{};
      double cut_force = 0, grind_force = 0;
    };
    std::map<std::uint64_t, Bites> bites;
    std::set<std::uint64_t> dropped;
    for (int tick = 0; tick <= steps; ++tick) {
      const bool last = tick == steps || w.fish.empty();
      if (tick % o.every == 0 || last) {
        const bool detail = tick % o.detail == 0 || last;
        // Keep watching the earliest hatched fish; replace those that died.
        std::set<std::uint64_t> alive;
        for (const auto &p : w.fish)
          if (p.body.alive)
            alive.insert(p.id);
        for (auto it = tracked.begin(); it != tracked.end();)
          it = alive.count(it->first) ? std::next(it) : tracked.erase(it);
        for (const auto &p : w.fish)
          if (int(tracked.size()) < o.tracked && p.body.alive && p.body.hatched && p.body.brain() &&
              !tracked.count(p.id) && !dropped.count(p.id)) {
            tracked[p.id] = describe(*p.body.brain());
            const auto &t = tracked[p.id];
            out << "{\"event\":\"cells\",\"t\":" << tick << ",\"id\":" << p.id
                << ",\"generation\":" << p.g << ",\"order\":[";
            for (std::size_t k = 0; k < t.order.size(); ++k)
              out << (k ? "," : "") << '[' << t.order[k] / ROLES << ',' << t.order[k] % ROLES
                  << ']';
            out << "]}\n";
          }
        const auto &m = w.metrics();
        out << "{\"event\":\"frame\",\"t\":" << tick << ",\"eggs\":" << m.released_eggs
            << ",\"nutrientEggs\":" << m.nutrient_eggs << ",\"sperm\":" << m.released_sperm
            << ",\"fertilisations\":" << m.fertilisations << ",\"clonal\":" << m.clonal_starts
            << ",\"eggsEaten\":" << m.eggs_eaten
            << ",\"hunger\":" << m.death_causes[death_reason::hunger] << ",\"fish\":[";
        first = true;
        for (const auto &p : w.fish) {
          const auto &b = p.body;
          out << (first ? "[" : ",[") << p.id << ',' << p.g << ',' << int(b.hatched) << ','
              << rounded(b.x, TENTHS) << ',' << rounded(b.y, TENTHS) << ','
              << rounded(b.angle, HUNDREDTHS) << ',' << rounded(b.energy, TENTHS) << ','
              << rounded(body_maturity(b), HUNDREDTHS) << ']';
          first = false;
        }
        out << "],\"tracked\":[";
        first = true;
        for (const auto &p : w.fish) {
          const auto found = tracked.find(p.id);
          if (found == tracked.end() || !p.body.brain())
            continue;
          const auto &t = found->second;
          const auto &b = p.body;
          const auto &brain = *b.brain();
          std::vector<double> activity(t.order.size()), cells(t.order.size());
          for (std::size_t i = 0; i < t.sites.size(); ++i) {
            if (brain.muted(i))
              continue;
            const auto k = t.position.at(t.sites[i] * ROLES + t.roles[i]);
            activity[k] += t.roles[i] == int(field::Role::Effector) ? brain.organ_output()[i]
                                                                    : brain.signal(i);
            cells[k] += 1;
          }
          for (std::size_t k = 0; k < activity.size(); ++k)
            activity[k] = cells[k] > 0 ? activity[k] / cells[k] : 0;
          std::vector<double> diet(p.observations().raw_diet.begin(),
                                   p.observations().raw_diet.end());
          std::vector<double> hormones(b.hormones().levels().begin(), b.hormones().levels().end());
          const double mx = w.field.wrap_x(b.x + mouth_offset(b) * std::cos(b.angle)),
                       my = b.y + mouth_offset(b) * std::sin(b.angle);
          double near_feed = w.field.geometry().width, near_worm = near_feed, near_leaf = near_feed,
                 feed_bearing = 0, leaf_bearing = 0;
          for (const auto &f : w.field.feeding().pieces)
            if (f.energy > 0) {
              const double d = std::hypot(w.field.delta_x(f.x - mx), f.y - my);
              if (d < near_feed) {
                near_feed = d;
                feed_bearing = std::remainder(
                    std::atan2(f.y - b.y, w.field.delta_x(f.x - b.x)) - b.angle, 2 * PI);
              }
            }
          for (const auto &h : w.field.food_web().heads)
            if (h.energy > 0)
              near_worm = std::min(near_worm, std::hypot(w.field.delta_x(h.x - mx), h.y - my));
          for (const auto &part : w.field.vegetation().plants)
            if (part.kind == food_kind::plant && !plant_bite_is_hard(part.organ_kind) &&
                part.energy > 0) {
              const double d =
                  std::max(0., stroke_distance(part, w.field.delta_x(part.x - mx), part.y - my));
              if (d < near_leaf) {
                near_leaf = d;
                leaf_bearing = std::remainder(
                    std::atan2(part.y - b.y, w.field.delta_x(part.x - b.x)) - b.angle, 2 * PI);
              }
            }
          std::array<double, 4> raw{};
          if (detail) {
            const auto &binding = b.active_interface(p.genome);
            const auto seen = visual_stimuli(b, p.genome, w.field);
            std::array<int, 2> n{};
            for (std::size_t i = 0; i < binding.sensory.size() && i < seen.size(); ++i)
              if (binding.sensory[i].visual() && !binding.sensory[i].proximity) {
                const int side = binding.sensory[i].lateral >= 0;
                raw[side] += seen[i];
                raw[2 + side] = std::max(raw[2 + side], double(seen[i]));
                ++n[side];
              }
            for (int side = 0; side < 2; ++side)
              raw[side] = n[side] ? raw[side] / n[side] : 0;
          }
          double feed_dy = 0;
          for (const auto &f : w.field.feeding().pieces)
            if (f.energy > 0 &&
                std::abs(std::hypot(w.field.delta_x(f.x - mx), f.y - my) - near_feed) < 1e-9)
              feed_dy = f.y - my;
          out << (first ? "{" : ",{") << "\"id\":" << p.id << ",\"generation\":" << p.g
              << ",\"age\":" << b.age << ",\"sediment\":" << b.sediment_coverage
              << ",\"feedDy\":" << feed_dy << ",\"rawVision\":[" << raw[0] << ',' << raw[1] << ','
              << raw[2] << ',' << raw[3] << "],\"nearFeed\":" << near_feed
              << ",\"nearWorm\":" << near_worm << ",\"nearLeaf\":" << near_leaf
              << ",\"feedBearing\":" << feed_bearing << ",\"leafBearing\":" << leaf_bearing
              << ",\"turn\":" << b.motor().turn << ",\"odor\":";
          {
            const auto odor = w.field.odor_field(b.x, b.y);
            out << '[';
            for (std::size_t k = 0; k < odor.size(); ++k)
              out << (k ? "," : "") << odor[k];
            out << ']';
          }
          out << ",\"plankton\":" << w.field.plankton_density(mx, my) << ",\"x\":" << b.x
              << ",\"y\":" << b.y << ",\"angle\":" << b.angle << ",\"vx\":" << b.motor().vx
              << ",\"vy\":" << b.motor().vy << ",\"energy\":" << b.energy
              << ",\"health\":" << b.health << ",\"tissue\":" << b.tissue
              << ",\"maturity\":" << body_maturity(b) << ",\"gutFill\":" << gut_filling(b)
              << ",\"gutEnergy\":" << b.gut_energy << ",\"forward\":" << b.motor().drive_forward
              << ",\"left\":" << b.motor().drive_left << ",\"right\":" << b.motor().drive_right
              << ",\"eat\":" << b.eat_signal << ",\"bite\":" << b.bite_signal
              << ",\"flow\":" << b.mouth.flow << ",\"eggYolk\":" << b.reproduction().egg_yolk
              << ",\"sperm\":" << b.reproduction().sperm_store
              << ",\"eggRelease\":" << b.reproduction().egg_release
              << ",\"spermRelease\":" << b.reproduction().sperm_release
              << ",\"movementCost\":" << b.ledger().movement_cost
              << ",\"brainCost\":" << b.ledger().brain_cost
              << ",\"closings\":" << bites[p.id].closings << ",\"pumps\":" << bites[p.id].pumps
              << ",\"cutForce\":" << bites[p.id].cut_force
              << ",\"grindForce\":" << bites[p.id].grind_force << ",\"actions\":[";
          for (int k = 0; k < feeding_effect::count; ++k)
            out << (k ? "," : "") << bites[p.id].actions[k];
          bites[p.id] = {};
          out << "],\"contacts\":" << brain.synapse_count() << ",\"diet\":";
          values(out, diet);
          out << ",\"hormones\":";
          values(out, hormones);
          out << ",\"activity\":";
          values(out, activity);
          if (detail) {
            std::map<std::pair<std::size_t, std::size_t>, std::array<double, 3>> links;
            for (const auto &s : brain.synapses()) {
              auto &l = links[{t.position.at(t.sites[s.source] * ROLES + t.roles[s.source]),
                               t.position.at(t.sites[s.target] * ROLES + t.roles[s.target])}];
              l[0] += 1;
              l[1] += s.weight;
              l[2] = std::max(l[2], double(std::abs(s.weight)));
            }
            out << ",\"links\":[";
            bool comma = false;
            for (const auto &[key, l] : links) {
              out << (comma ? "," : "") << '[' << key.first << ',' << key.second << ',' << l[0]
                  << ',' << rounded(l[1], TEN_THOUSANDTHS) << ',' << rounded(l[2], TEN_THOUSANDTHS)
                  << ']';
              comma = true;
            }
            out << ']';
          }
          out << '}';
          first = false;
        }
        out << ']';
        if (detail) {
          out << ",\"feed\":[";
          first = true;
          for (const auto &f : w.field.feeding().pieces)
            if (f.energy > 0) {
              out << (first ? "[" : ",[") << std::round(f.x) << ',' << std::round(f.y) << ','
                  << rounded(f.energy, TENTHS) << ',' << f.origin << ']';
              first = false;
            }
          const auto &plankton = w.field.food_web().plankton;
          out << "],\"plankton\":{\"columns\":" << plankton.columns << ",\"rows\":" << plankton.rows
              << ",\"width\":" << plankton.width << ",\"height\":" << plankton.height
              << ",\"energy\":";
          values(out, plankton.energy);
          out << "},\"worms\":[";
          first = true;
          for (const auto &h : w.field.food_web().heads) {
            out << (first ? "[" : ",[") << std::round(h.x) << ',' << std::round(h.y) << ','
                << rounded(h.energy, TENTHS) << ',' << rounded(h.extension, HUNDREDTHS) << ']';
            first = false;
          }
          out << "],\"crabs\":[";
          first = true;
          for (const auto &c : w.field.food_web().crabs) {
            out << (first ? "[" : ",[") << std::round(c.x) << ',' << std::round(c.y) << ','
                << rounded(c.energy, TENTHS) << ',' << c.state << ']';
            first = false;
          }
          out << "],\"mussels\":[";
          first = true;
          for (const auto &m : w.field.food_web().mussels) {
            out << (first ? "[" : ",[") << std::round(m.x) << ',' << std::round(m.y) << ','
                << rounded(m.energy, TENTHS) << ']';
            first = false;
          }
          out << "],\"plants\":[";
          first = true;
          for (const auto &part : w.field.vegetation().plants)
            if (part.energy > 0) {
              out << (first ? "[" : ",[") << std::round(part.x) << ',' << std::round(part.y) << ','
                  << rounded(part.energy, TENTHS) << ',' << part.kind << ',' << part.organ_kind
                  << ',' << std::round(part.hx) << ',' << std::round(part.hy) << ','
                  << rounded(stroke_width(part), TENTHS) << ']';
              first = false;
            }
          out << "],\"corpses\":[";
          first = true;
          for (const auto &c : w.corpses)
            if (c.energy > 0) {
              out << (first ? "[" : ",[") << std::round(c.x) << ',' << std::round(c.y) << ','
                  << rounded(c.energy, TENTHS) << ']';
              first = false;
            }
          out << ']';
        }
        out << "}\n" << std::flush;
      }
      if (last)
        break;
      w.tick();
      for (const auto &p : w.fish) {
        if (!tracked.count(p.id))
          continue;
        auto &c = bites[p.id];
        const auto &b = p.body;
        if (b.motor().motor_pulses[field::Aggression]) {
          ++c.closings;
          c.cut_force = std::max(c.cut_force, bite_force(b));
          c.grind_force = std::max(c.grind_force, bite_force(b, true));
        }
        if (b.motor().motor_pulses[field::Suction])
          ++c.pumps;
        if (b.feeding_action_age == feeding_effect_steps::full ||
            (b.feeding_action_age == feeding_effect_steps::brief &&
             (b.feeding_action == feeding_effect::filter ||
              b.feeding_action == feeding_effect::scrape)))
          ++c.actions[b.feeding_action];
      }
    }
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
