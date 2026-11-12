#pragma once
#include "ecology.hh"
#include "perception.hh"
#include "physiology.hh"
#include "plants.hh"
#include <array>
#include <limits>
#include <map>
#include <ostream>

namespace fishsim {
class LifeRecorder {
  struct Previous {
    std::array<double, DIET_COUNT> diet{};
    bool hatched = false, full = false, ripe = false, ate = false;
  };
  std::map<std::uint64_t, Previous> previous;
  std::ostream &out;
  std::string channel;
  static constexpr double FILL_MARK = .5;

  static double leaf_distance(const Ecosystem &w, const Body &b) {
    const double mx = w.field.wrap_x(b.x + mouth_offset(b) * std::cos(b.angle)),
                 my = b.y + mouth_offset(b) * std::sin(b.angle);
    double best = std::numeric_limits<double>::infinity();
    for (const auto &part : w.field.vegetation().plants)
      if (part.kind == food_kind::plant && !plant_bite_is_hard(part.organ_kind) && part.energy > 0)
        best = std::min(
            best, std::max(0., stroke_distance(part, w.field.delta_x(part.x - mx), part.y - my)));
    return best;
  }
  void number(double value) {
    if (std::isfinite(value))
      out << value;
    else
      out << "null";
  }
  void begin(const char *kind, std::uint64_t step, std::uint64_t id) {
    out << "{\"event\":\"life\",\"world\":\"" << channel << "\",\"kind\":\"" << kind
        << "\",\"t\":" << step << ",\"id\":" << id;
  }
  void sample(const Ecosystem &w, const Individual &p, double leaf, bool regular) {
    const auto &b = p.body;
    begin("point", w.ticks, p.id);
    out << ",\"regular\":" << (regular ? "true" : "false") << ",\"x\":" << b.x << ",\"y\":" << b.y
        << ",\"angle\":" << b.angle << ",\"radius\":" << body_radius(b)
        << ",\"energy\":" << b.energy << ",\"reserveCapacity\":" << reserve_capacity(b)
        << ",\"gut\":" << gut_filling(b) << ",\"maturity\":" << body_maturity(b) << ",\"leaf\":";
    number(leaf);
    out << ",\"near\":" << (leaf <= mouth_reach(b) + body_radius(b) ? "true" : "false")
        << ",\"speed\":" << b.motor().relative_speed << ",\"yolk\":" << b.reproduction().egg_yolk
        << ",\"pain\":" << b.gut_irritation << ",\"health\":" << b.health
        << ",\"supplied\":" << b.supplied_energy() << ",\"withdrawn\":" << b.withdrawn_energy()
        << ",\"cost\":" << b.ledger().movement_cost + b.ledger().brain_cost
        << ",\"digestion\":" << b.digestion << "}\n";
  }

public:
  static constexpr int EVERY = 5;
  explicit LifeRecorder(std::ostream &out, std::string channel = {})
      : out(out), channel(std::move(channel)) {}
  void setup(const Ecosystem &w, int scenes_every) {
    out << "{\"event\":\"recording\",\"every\":" << EVERY << ",\"fillMark\":" << FILL_MARK
        << ",\"scenesEvery\":" << scenes_every << ",\"width\":" << w.field.geometry().width
        << ",\"height\":" << w.field.geometry().height << "}\n";
  }
  void observe(const Ecosystem &w, bool last = false) {
    const bool regular = w.ticks % EVERY == 0;
    for (const auto &p : w.fish) {
      const auto &b = p.body;
      if (!b.alive)
        continue;
      auto [found, fresh] = previous.try_emplace(p.id);
      auto &before = found->second;
      if (fresh) {
        if (p.origin == fish_origin::natural && p.parent) {
          begin("laid", w.ticks, p.parent);
          out << ",\"child\":" << p.id << ",\"nutrient\":" << (p.nutrient_egg ? "true" : "false")
              << "}\n";
        }
        if (!p.nutrient_egg) {
          begin("start", w.ticks, p.id);
          out << ",\"parent\":" << p.parent << ",\"father\":" << p.father
              << ",\"generation\":" << p.g << ",\"age\":" << b.age << "}\n";
        }
      }
      if (p.nutrient_egg || !b.hatched)
        continue;
      std::array<double, DIET_COUNT> intake{};
      double eaten = 0;
      for (std::size_t k = 0; k < intake.size(); ++k) {
        eaten += intake[k] = std::max(0., p.observations().raw_diet[k] - before.diet[k]);
        before.diet[k] = p.observations().raw_diet[k];
      }
      const bool closing = b.motor().motor_pulses[field::Aggression],
                 full = gut_filling(b) >= FILL_MARK, ripe = body_maturity(b) >= 1,
                 first_meal = eaten > 0 && !before.ate;
      const bool transition = !before.hatched || full != before.full || ripe != before.ripe;
      const bool point = regular || last || transition || first_meal || closing;
      const double leaf = point ? leaf_distance(w, b) : std::numeric_limits<double>::infinity();
      if (!before.hatched) {
        begin("hatch", w.ticks, p.id);
        out << ",\"leaf\":";
        number(leaf);
        out << "}\n";
      }
      if (eaten > 0) {
        begin("intake", w.ticks, p.id);
        out << ",\"first\":" << (first_meal ? "true" : "false") << ",\"diet\":[";
        for (std::size_t k = 0; k < intake.size(); ++k)
          out << (k ? "," : "") << intake[k];
        out << "]}\n";
      }
      if (closing) {
        begin("close", w.ticks, p.id);
        out << ",\"empty\":"
            << (leaf > mouth_reach(b) + body_radius(b) && eaten == 0 ? "true" : "false") << "}\n";
      }
      if (before.hatched && full != before.full) {
        begin(full ? "full" : "emptying", w.ticks, p.id);
        out << "}\n";
      }
      if (ripe && !before.ripe) {
        begin("ripe", w.ticks, p.id);
        out << "}\n";
      }
      if (point)
        sample(w, p, leaf, regular);
      before.hatched = true;
      before.full = full;
      before.ripe = ripe;
      before.ate |= eaten > 0;
    }
  }
  void death(std::uint64_t id, std::uint64_t step, int cause) {
    begin("death", step, id);
    out << ",\"cause\":" << cause << "}\n";
    previous.erase(id);
  }
};
}
