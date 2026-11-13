#include "laboratory.hh"
#include "body_plan.hh"
#include "view_cache.hh"
#include "world_view.hh"
#include <iostream>
#include <numeric>

namespace fishsim {
void LaboratoryControl::set_mouth(bool closing, std::optional<double> drive) {
  auto_mouth = false;
  const auto antagonist = drive ? std::make_optional(0.) : std::nullopt;
  jaw = closing ? drive : antagonist;
  suction = closing ? antagonist : drive;
}
void LaboratoryControl::release_gametes(bool eggs, const Body &b, std::uint64_t tick) {
  const auto &stroke = b.motor().strokes[eggs ? StrokeEgg : StrokeSperm];
  // Recruitment may have changed since this twitch began. Wait for its actual remainder,
  // then hand control back after the next release impulse.
  const auto until = tick + std::uint64_t(std::max(1., std::ceil(stroke.recovery)));
  (eggs ? egg_until : sperm_until) = until;
}
LaboratoryTarget laboratory_target(const Ecosystem &w, const Body &b, bool leaves) {
  LaboratoryTarget result;
  result.distance = std::numeric_limits<double>::infinity();
  const double mx = w.field.wrap_x(b.x + mouth_offset(b) * std::cos(b.angle)),
               my = b.y + mouth_offset(b) * std::sin(b.angle);
  const auto consider = [&](double x, double y, double distance) {
    if (distance < result.distance) {
      result = {x, y, distance,
                std::remainder(std::atan2(y - my, w.field.delta_x(x - mx)) - b.angle, 2 * PI),
                true};
    }
  };
  if (leaves) {
    for (const auto &p : w.field.vegetation().plants)
      if (p.energy > 0 && p.kind == food_kind::plant && !plant_bite_is_hard(p.organ_kind))
        consider(p.x, p.y, std::max(0., stroke_distance(p, w.field.delta_x(p.x - mx), p.y - my)));
  } else {
    for (const auto &p : w.field.feeding().pieces)
      if (p.energy > 0)
        consider(p.x, p.y,
                 std::max(0., std::hypot(w.field.delta_x(p.x - mx), p.y - my) - food_radius(p)));
  }
  return result;
}
void apply_laboratory_control(Individual &p, const Ecosystem &w, const LaboratoryControl &c) {
  auto &b = p.body;
  if (!b.alive || !b.hatched || !b.brain())
    return;
  const auto &layout = b.active_interface(p.genome);
  const auto target = laboratory_target(w, b, c.leaves);
  auto forward = c.forward, turn = c.turn, jaw = c.jaw, suction = c.suction;
  if (c.auto_turn)
    turn = target.found ? std::clamp(target.bearing / (PI / 4), -1., 1.) : 0.;
  if (c.auto_forward)
    forward =
        target.found ? std::clamp(target.distance / std::max(1., body_radius(b)), 0., 1.) : 0.;
  if (c.auto_mouth) {
    const int opening = std::max(1, layout.stroke_timing[StrokeSuction].whole()),
              closing = std::max(1, layout.stroke_timing[StrokeBite].whole());
    const bool near = target.found && target.distance <= mouth_reach(b) + body_radius(b),
               shut = int(w.ticks % (opening + closing)) >= opening;
    jaw = near && shut ? 1. : 0.;
    suction = near && !shut ? 1. : 0.;
  }
  const int left_steps = std::max(1, layout.stroke_timing[StrokeTailLeft].whole()),
            right_steps = std::max(1, layout.stroke_timing[StrokeTailRight].whole());
  const int tail_side = int(w.ticks % (left_steps + right_steps)) < left_steps ? 0 : 1;
  std::map<std::uint32_t, float> values;
  for (const auto &e : layout.effectors) {
    const int side = e.lever < 0 ? 0 : 1;
    if (e.port == organ_port::forward && forward)
      values[e.neuron] = side == tail_side ? *forward : 0;
    if ((e.port == organ_port::turn || e.port == organ_port::pelvic) && turn) {
      const int fin = e.port == organ_port::turn ? 0 : 1;
      const double torque =
          (side ? -1 : 1) * ((1 - e.protraction) * layout.fin_turn[BACK_STROKES[fin][side]] -
                             e.protraction * layout.fin_turn[FRONT_STROKES[fin][side]]);
      values[e.neuron] = torque * *turn > 0 ? std::abs(*turn) : 0;
    }
    if (e.port == organ_port::jaw && jaw)
      values[e.neuron] = *jaw;
    if (e.port == organ_port::suction && suction)
      values[e.neuron] = *suction;
    if (e.port == organ_port::eggs && e.outside > .5 && w.ticks < c.egg_until)
      values[e.neuron] = 1;
    if (e.port == organ_port::sperm && e.outside > .5 && w.ticks < c.sperm_until)
      values[e.neuron] = 1;
  }
  b.set_actuation_probe([values = std::move(values)](std::uint32_t neuron, float natural) {
    const auto it = values.find(neuron);
    return it == values.end() ? natural : it->second;
  });
  b.hold_energy(c.energy);
}
LaboratoryRecording::LaboratoryRecording(const std::string &name)
    : recorder(std::cout, name), channel(name) {
}
void LaboratoryRecording::begin(const Ecosystem &w, int founders) {
  for (std::size_t i = 0; i < w.fish.size(); ++i)
    lines[w.fish[i].id] = int(i % std::max(1, founders));
  observe(w);
}
void LaboratoryRecording::observe(const Ecosystem &w) {
  std::set<std::uint64_t> current;
  for (const auto &p : w.fish) {
    current.insert(p.id);
    if (!alive.count(p.id) && !p.nutrient_egg) {
      if (!lines.count(p.id))
        lines[p.id] = lines.count(p.parent) ? lines.at(p.parent) : -1;
      std::cout << "{\"event\":\"labor-line\",\"world\":\"" << channel << "\",\"id\":" << p.id
                << ",\"line\":" << lines[p.id] << "}\n";
    }
  }
  for (auto id : alive)
    if (!current.count(id)) {
      int cause = -1;
      for (const auto &death : w.recent_mortality)
        if (death[death_record_column::id] == id)
          cause = int(death[death_record_column::cause]);
      recorder.death(id, w.ticks, cause);
    }
  recorder.observe(w);
  alive = std::move(current);
}
void write_laboratory_population(std::ostream &out, const Ecosystem &w) {
  out << '[';
  bool first = true;
  for (const auto &p : w.fish) {
    const auto &b = p.body;
    if (!first)
      out << ',';
    first = false;
    const auto &diet = p.observations().raw_diet;
    out << "{\"id\":" << p.id << ",\"parent\":" << p.parent << ",\"generation\":" << p.g
        << ",\"hatched\":" << (b.hatched ? "true" : "false") << ",\"x\":" << b.x << ",\"y\":" << b.y
        << ",\"angle\":" << b.angle << ",\"radius\":" << body_radius(b)
        << ",\"energy\":" << b.energy << ",\"capacity\":" << reserve_capacity(b)
        << ",\"gut\":" << gut_filling(b) << ",\"yolk\":" << b.reproduction().egg_yolk
        << ",\"pain\":" << b.gut_irritation << ",\"health\":" << b.health
        << ",\"supplied\":" << b.supplied_energy() << ",\"withdrawn\":" << b.withdrawn_energy()
        << ",\"intake\":" << std::accumulate(diet.begin(), diet.end(), 0.) << ",\"age\":" << b.age
        << ",\"color\":[" << b.color[0] << ',' << b.color[1] << ',' << b.color[2] << "]}";
  }
  out << ']';
}
void write_laboratory_scene(std::ostream &out, const Ecosystem &w) {
  JsonViewCache cache(false);
  SessionView status;
  status.paused = true;
  auto cadence = cache.begin_frame(true, true, 0, w.environment, false, true);
  WorldViewWriter view(out, w, status, cache);
  view.write(cadence, w.parameters(), {});
  cache.write_assets(out);
  out << '}';
}
}
