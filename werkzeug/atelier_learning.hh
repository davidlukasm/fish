#pragma once
#include "atelier_compiler.hh"
#include <iostream>
#include <sstream>

namespace atelier {
struct LearningContext {
  struct Probe {
    int group = -1;
    double delay = 0;
    float pre = 1, post = 1, teaching = 1, prediction = 0;
  };
  field::Hormones levels{};
  double maturity = 1, reserve = 1, fatigue = 0, cell_maturity = 1;
  std::optional<Probe> probe;
};
LearningContext read_learning_context(std::istream &request) {
  std::string line;
  ensure(bool(std::getline(request >> std::ws, line)), "missing learning context");
  std::istringstream in(line);
  LearningContext context;
  const auto reading = [](double value) { return value >= 0 && value <= 1; };
  bool blood = false, learning = false;
  ensure(bool(in >> blood >> learning), "invalid blood or learning flag");
  if (blood) {
    ensure(bool(in >> context.maturity >> context.reserve >> context.fatigue >>
                context.cell_maturity) &&
               reading(context.maturity) && reading(context.reserve) &&
               reading(context.fatigue) && reading(context.cell_maturity),
           "invalid blood context");
    for (auto &value : context.levels)
      ensure(bool(in >> value) && reading(value), "invalid blood level");
  }
  if (learning) {
    auto &probe = context.probe.emplace();
    ensure(bool(in >> probe.group >> probe.delay >> probe.pre >> probe.post >> probe.teaching >>
                probe.prediction) &&
               probe.group >= 0 && std::isfinite(probe.delay) && probe.delay >= 0 &&
               between(probe.pre, -1, 1) && between(probe.post, -1, 1) &&
               between(probe.teaching, -1, 1) && reading(probe.prediction),
           "invalid learning probe");
  }
  ensure((in >> std::ws).eof(), "unexpected learning context values");
  return context;
}
// The reference cell has the group's exact planned receptors before physiological variation.
field::HormoneReceptor planned_receptor(const Receptor &plan, int effect) {
  field::HormoneReceptor receptor;
  if (!plan.active) {
    receptor.baseline = effect == field::Output ? 1 : 0;
    return receptor;
  }
  receptor.baseline = plan.baseline;
  receptor.sensitivity = plan.sensitivity;
  receptor.half = plan.half;
  receptor.steepness = plan.steepness;
  receptor.cell_maturity = plan.substance == field::CELL_MATURITY;
  if (!receptor.cell_maturity) {
    const double angle = field::substance_angle(plan.substance);
    receptor.affinity = field::hormone_affinity<field::BLOOD_SUBSTANCES>(
        float(std::cos(angle)), float(std::sin(angle)), plan.width);
  }
  return receptor;
}
// How each receptor of the group answers its own substance from none to its span (a hormone's
// span is what its glands reach, a body signal's all of it), with the rest of the blood as the
// life band sets it: the curve the hormone tool draws, from the engine's response.
void receptor_curves(const Group &group, const field::Neuron &cell, const LearningContext &context,
                     const std::array<double, field::HORMONES> &spans) {
  constexpr int SAMPLES = 16;
  std::cout << ",\"responses\":[";
  for (int effect = 0; effect < field::HORMONE_EFFECTS; ++effect) {
    if (effect)
      std::cout << ',';
    const auto &plan = group.receptors[effect];
    if (!plan.active || !field::hormone_effect_present(cell, effect)) {
      std::cout << "null";
      continue;
    }
    const auto receptor = planned_receptor(plan, effect);
    std::cout << '[';
    for (int i = 0; i <= SAMPLES; ++i) {
      auto blood = context;
      const int substance = plan.substance;
      const double level =
          (substance < field::HORMONES ? spans[substance] : 1.) * double(i) / SAMPLES;
      if (substance < field::HORMONES)
        blood.levels[substance] = level;
      else if (substance == field::MATURITY_SUBSTANCE)
        blood.maturity = level;
      else if (substance == field::RESERVE_SUBSTANCE)
        blood.reserve = level;
      else if (substance == field::FATIGUE_SUBSTANCE)
        blood.fatigue = level;
      else
        blood.cell_maturity = level;
      std::cout << (i ? "," : "")
                << receptor.response(blood.levels, blood.maturity, blood.reserve, blood.fatigue,
                                     blood.cell_maturity);
    }
    std::cout << ']';
  }
  std::cout << ']';
}
void learning_group_report(const Group &group, const field::Neuron *cell,
                           const LearningContext &context, int index,
                           const std::array<double, field::HORMONES> &spans) {
  if (!cell) {
    std::cout << ",\"effects\":null,\"responses\":null,\"learning\":null";
    return;
  }
  std::array<float, field::HORMONE_EFFECTS> effects{};
  std::cout << ",\"effects\":[";
  for (int effect = 0; effect < field::HORMONE_EFFECTS; ++effect) {
    if (effect)
      std::cout << ',';
    if (!field::hormone_effect_present(*cell, effect)) {
      std::cout << "null";
      continue;
    }
    effects[effect] = planned_receptor(group.receptors[effect], effect)
                          .response(context.levels, context.maturity, context.reserve,
                                    context.fatigue, context.cell_maturity);
    std::cout << effects[effect];
  }
  std::cout << ']';
  receptor_curves(group, *cell, context, spans);
  std::cout << ",\"learning\":";
  if (cell->role != field::Role::Nerve) {
    std::cout << "null";
    return;
  }
  namespace P = field::plasticity;
  const double steps = field::learning_time_steps(cell->parameters);
  const float keep = P::trace_keep(steps),
              fast = P::fast_keep(field::time_constant_steps(cell->parameters)),
              rate = P::learning_rate(cell->parameters.plasticity, effects[field::Learning]);
  const auto forget = [steps](float use) {
    return 1 - P::contact_retention(use, float(steps), 0.f);
  };
  std::cout << "{\"rate\":" << rate << ",\"traceKeep\":" << keep
            << ",\"traceSteps\":" << steps << ",\"traceFast\":" << fast
            << ",\"forgetUsed\":" << forget(1.f) << ",\"forgetUnused\":" << forget(0.f)
            << ",\"mode\":" << field::cell_class(*cell).mode
            << ",\"level\":" << std::clamp(2 * cell->parameters.quality2, 0.f, 1.f)
            << ",\"limits\":{\"electrical\":" << cell->electrical_limit
            << ",\"teaching\":" << cell->teaching_limit << '}';
  if (context.probe && context.probe->group == index) {
    const auto &probe = *context.probe;
    const float initial = P::trace_update(keep, 0.f, fast, probe.pre, probe.post);
    const float at_teaching = float(initial * std::pow(keep, probe.delay));
    const float baseline = effects[field::Teaching];
    const float surprise = std::clamp(baseline + probe.teaching, -1.f, 1.f) - baseline;
    const float expected = surprise * probe.prediction;
    const float denominator = 1 + at_teaching * at_teaching;
    std::cout << ",\"traceAtTeaching\":" << at_teaching
              << ",\"surprise1\":" << surprise << ",\"surprise2\":" << surprise - expected
              << ",\"step1\":" << rate * P::teaching_share(surprise, at_teaching, denominator)
              << ",\"step2\":"
              << rate * P::teaching_share(surprise - expected, at_teaching, denominator);
  }
  std::cout << '}';
}
}
