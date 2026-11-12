#include "interactive_session.hh"
#include "wording.hh"
#include "body_plan.hh"
#include "physiology.hh"
#include <iostream>

namespace fishsim {
void InteractiveSession::execute_laboratory(const std::string &op, std::istringstream &line, bool &,
                                            std::string &) {
  if (!o.laboratory)
    throw Refusal("invalidArgument", {{"command", op}});
  if (op == "lab-compare") {
    if (laboratory_fork.valid())
      throw Refusal("invalidArgument", {{"command", op}});
    paused = true;
    reference.reset();
    laboratory_baseline.reset();
    experiment_start = world.ticks;
    laboratory_preparing = true;
    auto frozen = capture_checkpoint(world, session_founder, 0, evolving, false, 0, 0, 0);
    laboratory_fork = std::async(std::launch::async,
                                 [saved = std::move(frozen)]() { return saved.world.fork(); });
    return;
  }
  if (op == "lab-end-compare") {
    laboratory_preparing = false;
    reference.reset();
    laboratory_baseline.reset();
    return;
  }
  if (op == "lab-stop-at") {
    line >> laboratory_stop_at;
    return;
  }
  std::uint64_t id;
  line >> id;
  auto found = std::find_if(world.fish.begin(), world.fish.end(),
                            [&](const Individual &p) { return p.id == id; });
  if (found == world.fish.end())
    throw Refusal("animalGone");
  auto &p = *found;
  if (op == "lab-clear") {
    const auto it = laboratory_controls.find(id);
    if (it != laboratory_controls.end())
      for (int sense : it->second.muted)
        p.body.enable_sense(sense);
    laboratory_controls.erase(id);
    p.body.set_actuation_probe({});
    p.body.hold_energy({});
    return;
  }
  std::string axis, extra;
  double value;
  if (!(line >> axis >> value) || !std::isfinite(value) || (line >> extra) ||
      (value != -2 && (value < (axis == "turn" ? -1 : 0) || value > 1)))
    throw Refusal("invalidArgument", {{"command", op}});
  auto c = laboratory_controls[id];
  const auto v = value == -2 ? std::optional<double>{} : std::make_optional(value);
  if (axis == "forward") {
    c.forward = v;
    c.auto_forward = false;
  } else if (axis == "turn") {
    c.turn = v;
    c.auto_turn = false;
  } else if (axis == "jaw")
    c.jaw = v;
  else if (axis == "suction")
    c.suction = v;
  else if (axis == "energy")
    c.energy = v ? std::make_optional(reserve_capacity(p.body) * *v) : std::nullopt;
  else if (axis == "auto-forward")
    c.auto_forward = value == 1;
  else if (axis == "auto-turn")
    c.auto_turn = value == 1;
  else if (axis == "auto-mouth")
    c.auto_mouth = value == 1;
  else if (axis == "leaves")
    c.leaves = value == 1;
  else if (axis == "vision" || axis == "odor" || axis == "touch" || axis == "flow") {
    const int sense = axis == "vision"  ? field::Light
                      : axis == "odor"  ? field::Odor
                      : axis == "touch" ? field::Touch
                                        : field::Flow;
    if (value == 0) {
      c.muted.insert(sense);
      p.body.disable_sense(sense);
    } else {
      c.muted.erase(sense);
      p.body.enable_sense(sense);
    }
  } else if (axis == "egg" || axis == "sperm") {
    const auto &layout = p.body.active_interface(p.genome);
    const int stroke = axis == "egg" ? StrokeEgg : StrokeSperm;
    if (layout.stroke_capacity[stroke] <= 0)
      throw Refusal("invalidArgument", {{"command", op}});
    // Hold the release muscle for one full recovery; no stock is created by this command.
    const auto until = world.ticks + std::max(1, layout.stroke_timing[stroke].recovery);
    (axis == "egg" ? c.egg_until : c.sperm_until) = until;
  } else
    throw Refusal("invalidArgument", {{"command", op}});
  laboratory_controls[id] = c;
  apply_laboratory_control(p, world, c);
}
void InteractiveSession::prepare_laboratory() {
  if (laboratory_fork.valid() &&
      laboratory_fork.wait_for(std::chrono::seconds(0)) == std::future_status::ready) {
    try {
      auto result = laboratory_fork.get();
      if (laboratory_preparing) {
        reference = std::move(result);
        reference->workers = world.workers;
        for (auto &p : reference->fish)
          for (int sense : {field::Light, field::Odor, field::Touch, field::Flow})
            p.body.enable_sense(sense);
        std::cout << "{\"event\":\"labor-reset\",\"world\":\"control\"}\n";
        laboratory_baseline = std::make_unique<LaboratoryRecording>("control");
        laboratory_baseline->begin(*reference, int(o.start_genomes.size()));
      }
    } catch (const std::exception &e) {
      std::cerr << "Laborvergleich: " << e.what() << '\n';
      std::cout << "{\"event\":\"labor-error\",\"message\":\"comparison\"}\n";
    }
    laboratory_preparing = false;
    refresh = true;
  }
  for (auto &p : world.fish) {
    const auto it = laboratory_controls.find(p.id);
    if (it != laboratory_controls.end())
      apply_laboratory_control(p, world, it->second);
  }
}
void InteractiveSession::observe_laboratory() {
  if (laboratory_recording)
    laboratory_recording->observe(world);
  if (reference && laboratory_baseline)
    laboratory_baseline->observe(*reference);
  if ((laboratory_stop_at && world.ticks >= laboratory_stop_at) || world.fish.empty()) {
    paused = true;
    refresh = true;
  }
}
bool InteractiveSession::emit_laboratory() {
  std::cout << "{\"event\":\"labor\",\"step\":" << world.ticks
            << ",\"paused\":" << (paused ? "true" : "false")
            << ",\"preparing\":" << (laboratory_preparing ? "true" : "false")
            << ",\"comparison\":" << (reference ? "true" : "false")
            << ",\"comparisonStart\":" << experiment_start
            << ",\"width\":" << world.field.geometry().width
            << ",\"height\":" << world.field.geometry().height << ",\"tickMs\":" << tick_ms
            << ",\"fish\":";
  write_laboratory_population(std::cout, world);
  if (reference) {
    std::cout << ",\"control\":";
    write_laboratory_population(std::cout, *reference);
  }
  std::cout << ",\"controls\":[";
  bool first = true;
  for (const auto &[id, c] : laboratory_controls) {
    if (!first)
      std::cout << ',';
    first = false;
    std::cout << "{\"id\":" << id;
    for (const auto &[name, value] :
         std::map<std::string, std::optional<double>>{{"forward", c.forward},
                                                      {"turn", c.turn},
                                                      {"jaw", c.jaw},
                                                      {"suction", c.suction},
                                                      {"energy", c.energy}}) {
      std::cout << ",\"" << name << "\":";
      if (value)
        std::cout << *value;
      else
        std::cout << "null";
    }
    std::cout << ",\"autoForward\":" << c.auto_forward << ",\"autoTurn\":" << c.auto_turn
              << ",\"autoMouth\":" << c.auto_mouth << ",\"leaves\":" << c.leaves
              << ",\"visionMuted\":" << c.muted.count(field::Light)
              << ",\"odorMuted\":" << c.muted.count(field::Odor) << '}';
  }
  std::cout << ']';
  const auto now = Clock::now();
  if (paused || now - laboratory_scene_sent >= std::chrono::seconds(1)) {
    std::cout << ",\"scene\":";
    write_laboratory_scene(std::cout, world);
    laboratory_scene_sent = now;
  }
  std::cout << "}\n" << std::flush;
  return true;
}
}
