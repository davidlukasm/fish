#pragma once
#include "atelier_connections.hh"

namespace atelier {
inline Receptor import_receptor(const field::HormoneReceptor &, const cppn::Point &at, int effect,
                                cppn::CPPN &net) {
  Receptor result;
  const float neutral = effect == field::Output ? 1.f : 0.f;
  constexpr float EPSILON = 1e-5f;
  result.baseline = neutral;
  auto query = at;
  query.effect = field::receptor_effect_code(effect);
  const auto values = net.query_view(query);
  if (std::abs(values[out::capacity] - neutral) < EPSILON &&
      std::abs(values[out::field_width]) < EPSILON && values[out::spread_receptors] <= 0)
    return result;
  result.active = true;
  result.spread_receptors = std::clamp(values[out::spread_receptors], 0.f, 1.f);
  result.baseline = values[out::capacity];
  result.sensitivity = field::HORMONE_SENSITIVITY_SPAN * values[out::field_width];
  result.half =
      float(field::HORMONE_HALF_MIN * std::pow(field::HORMONE_HALF_MAX / field::HORMONE_HALF_MIN,
                                               (values[out::threshold] + 1) * .5f));
  result.steepness = int(std::lround(field::HORMONE_STEEPNESS_STEPS *
                                     std::clamp(values[out::time_constant], 0.f, 1.f)));
  result.width = std::clamp((values[out::quality_width] + 1) * .5f, 0.f, 1.f);
  const auto affinity = field::hormone_affinity<field::REGULATORS>(
      values[out::quality1], values[out::quality2], result.width);
  result.substance = int(std::max_element(affinity.begin(), affinity.end()) - affinity.begin());
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
    std::array<float, cppn::OUTPUTS> values{};
    const auto &raw = net.query_view(at);
    std::copy(raw.begin(), raw.end(), values.begin());
    const auto mean = field::site_cell(at, values, cell.id, genome.development_options.bias_scale);
    const auto &p = mean ? mean->parameters : cell.parameters;
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
      g.sign = values[out::identity1];
      g.mode = values[out::identity2];
      g.pace = values[out::identity3];
      g.modulator = values[out::identity4];
    }
    g.initial_strength = values[out::synapse_strength];
    g.spread_physiology = std::clamp(values[out::spread_physiology], 0.f, 1.f);
    g.spread_receptors = std::clamp(values[out::spread_receptors], 0.f, 1.f);
    g.spread_development = std::clamp(values[out::spread_development], 0.f, 1.f);
    g.spread_contacts = std::clamp(values[out::spread_contacts], 0.f, 1.f);
    auto property_query = at;
    property_query.property = cppn::property::learning;
    g.learning_tau = (net.query_view(property_query)[out::time_constant] + 1) * .5f;
    property_query.property = cppn::property::teaching;
    g.teaching_strength = net.query_view(property_query)[out::synapse_strength];
    for (int f = 1; f < field::CONTACT_FIELDS; ++f) {
      auto query = at;
      query.field = float(f) / (field::CONTACT_FIELDS - 1);
      const auto &v = net.query_view(query);
      auto &r = g.reception[f - 1];
      r.expression = v[out::expression];
      r.address = {v[out::receiver1], v[out::receiver2]};
      r.width = (v[out::search_width] + 1) * .5f;
      g.reception_spread[f - 1] = {std::clamp(v[out::spread_contacts], 0.f, 1.f)};
    }
    g.sender1 = values[out::sender1];
    g.sender2 = values[out::sender2];
    g.receiver1 = values[out::receiver1];
    g.receiver2 = values[out::receiver2];
    g.sigma = float(field::search_radius((values[out::search_width] + 1) * .5f));
    g.crossing = values[out::crossing];
    g.range = (values[out::range] + 1) * .5f;
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
        << g.receiver2 << ',' << g.sigma;
    for (int f = 0; f < field::CONTACT_FIELDS - 1; ++f) {
      const auto &r = g.reception[f];
      out << ',' << r.expression << ',' << r.address[0] << ',' << r.address[1] << ',' << r.width;
      for (float spread : g.reception_spread[f])
        out << ',' << spread;
    }
    out << "],\"receptors\":[";
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
