#pragma once
#include "atelier_connections.hh"

namespace atelier {
inline Receptor import_receptor(const field::HormoneReceptor &r, const cppn::Point &at, int effect,
                                cppn::CPPN &net) {
  Receptor result;
  const float neutral = effect == field::Output ? 1.f : 0.f;
  constexpr float EPSILON = 1e-5f;
  result.baseline = neutral;
  if (std::abs(r.baseline - neutral) < EPSILON && std::abs(r.sensitivity) < EPSILON)
    return result;
  auto query = at;
  query.effect = field::receptor_effect_code(effect);
  const auto values = net.query_view(query);
  result.active = true;
  result.baseline = r.baseline;
  result.sensitivity = r.sensitivity;
  result.half = r.half;
  result.steepness = r.steepness;
  result.width = std::clamp((values[out::quality_width] + 1) * .5f, 0.f, 1.f);
  result.substance =
      int(std::max_element(r.affinity.begin(), r.affinity.end()) - r.affinity.begin());
  return result;
}
inline Plan import_plan(const fishsim::Genome &genome) {
  const auto &tissue = *genome.blueprint;
  cppn::CPPN net(genome.cppn);
  Plan plan;
  plan.development_seed = genome.development_seed;
  plan.variation_seed = genome.variation_seed;
  plan.fixed_contacts = true;
  std::map<std::uint32_t, int> groups;
  std::vector<const field::Neuron *> representatives;
  for (const auto &cell : tissue.neurons) {
    auto [it, fresh] = groups.emplace(cell.group, int(plan.groups.size()));
    if (!fresh)
      continue;
    representatives.push_back(&cell);
    Group g;
    g.name = "site" + std::to_string(cell.group);
    const auto &at = cell.location;
    g.zone = at.zone;
    g.side = int(at.side);
    g.u0 = g.u1 = at.u;
    g.v0 = g.v1 = at.v;
    g.w0 = g.w1 = at.w;
    g.role = int(cell.role);
    for (int k = 0; k < field::SENSE_COUNT; ++k)
      if (cell.functions.senses[k] > 0)
        g.function = k;
    for (int k = 0; k < field::MOTOR_COUNT; ++k)
      if (cell.functions.motors[k] > 0)
        g.function = k;
    const auto &p = cell.parameters;
    g.copies =
        std::clamp(int(std::lround(field::CELL_COPIES * p.capacity)), 1, field::CELL_COPY_LIMIT);
    g.threshold = 2 * p.threshold - 1;
    g.tau = p.time_constant;
    g.field = p.field_width;
    g.q1 = p.quality1;
    g.q2 = p.quality2;
    g.qwidth = p.quality_width;
    if (cell.role == field::Role::Nerve) {
      if (p.plasticity < field::MIN_LEARNING_RATE)
        g.qwidth = 0;
      g.sign = cell.identity[1];
      g.mode = cell.identity[2];
      g.pace = cell.identity[3];
      g.modulator = cell.identity[4];
    }
    g.sender1 = cell.sender[0];
    g.sender2 = cell.sender[1];
    g.receiver1 = cell.receiver[0];
    g.receiver2 = cell.receiver[1];
    g.sigma = float(field::search_radius(cell.search_width));
    g.crossing = cell.crossing;
    g.range = cell.range;
    for (int effect = 0; effect < field::HORMONE_EFFECTS; ++effect)
      g.receptors[effect] = import_receptor(cell.hormone_receptors[effect], at, effect, net);
    plan.groups.push_back(std::move(g));
  }
  // A blueprint describes the contact field, including candidates not drawn by this seed.
  // Each receiver needs input from its field; individual candidate contacts are stochastic.
  for (std::size_t to = 0; to < representatives.size(); ++to)
    for (std::size_t from = 0; from < representatives.size(); ++from)
      if (field::contact_parameters(*representatives[from], *representatives[to],
                                    tissue.body_length)
              .probability > 0)
        plan.connections.push_back({int(from), int(to), int(to), 0});
  plan.growth = import_receptor(tissue.growth_receptor, field::GROWTH_RECEPTOR_SITE,
                                field::GROWTH_RECEPTOR, net);
  return plan;
}
inline void write_import(std::ostream &out, const Plan &plan) {
  out << std::setprecision(std::numeric_limits<float>::max_digits10) << "{\"development\":\""
      << plan.development_seed << "\",\"variation\":\"" << plan.variation_seed << "\",\"growth\":";
  studio_plan::write_receptor(out, plan.growth);
  out << ",\"groups\":[";
  bool first = true;
  for (const auto &g : plan.groups) {
    out << (first ? "" : ",") << "{\"cell\":";
    first = false;
    studio_plan::write_group(out, g);
    out << ",\"address\":[" << g.sender1 << ',' << g.sender2 << ',' << g.receiver1 << ','
        << g.receiver2 << ',' << g.sigma << "],\"receptors\":[";
    for (std::size_t i = 0; i < g.receptors.size(); ++i) {
      out << (i ? "," : "");
      studio_plan::write_receptor(out, g.receptors[i]);
    }
    out << "]}";
  }
  out << "],\"connections\":[";
  first = true;
  for (const auto &c : plan.connections) {
    out << (first ? "" : ",") << '[' << c.from << ',' << c.to << ']';
    first = false;
  }
  out << "]}";
}
}
