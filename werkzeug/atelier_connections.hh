#pragma once
#include "atelier_compiler.hh"
#include "field/mix.hh"
#include <numeric>
#include <functional>

namespace atelier {
struct Wiring {
  std::vector<std::vector<bool>> wanted, allowed;
  std::vector<float> spread;
  explicit Wiring(const Plan &p) {
    const auto n = p.groups.size();
    wanted.assign(n, std::vector<bool>(n));
    allowed = wanted;
    spread.resize(n);
    for (const auto &c : p.connections) {
      wanted[c.from][c.to] = allowed[c.from][c.to] = true;
      spread[c.to] = std::max(spread[c.to], c.spread);
    }
    for (std::size_t a = 0; a < n; ++a)
      for (std::size_t b = 0; b < n; ++b)
        allowed[a][b] = allowed[a][b] || spread[b] > 0 ||
                        (p.groups[b].open && p.groups[a].organ == p.groups[b].organ);
  }
};
// Fit the same addresses used by development. Geometry is computed once from planned cells;
// candidate evaluation uses expected contacts, input competition and semantic wire bundles.
struct AddressFit {
  int evaluations = 0, attempts = 0;
  double milliseconds = 0, expectedMissing = 0, leakage = 0;
};
using CompileProgress = std::function<void(const char *, const AddressFit &)>;
inline AddressFit plan_addresses(Plan &p, const CompileProgress &progress = {},
                                 double budget_ms = 4000) {
  const auto started = std::chrono::steady_clock::now();
  const int n = int(p.groups.size());
  const Wiring w(p);
  std::map<std::vector<int>, int> signatures;
  std::vector<int> classes(n, -1);
  int k = 0;
  for (int a = 0; a < n; ++a) {
    if (p.groups[a].role == 2)
      continue;
    std::vector<int> targets;
    for (int b = 0; b < n; ++b)
      if (w.wanted[a][b])
        targets.push_back(b);
    auto [it, fresh] = signatures.emplace(targets, k);
    if (fresh)
      ++k;
    classes[a] = it->second;
  }
  auto tissue = planned_substrate(p.groups);
  std::vector<int> owner(tissue.neurons.size(), -1), counts(n);
  std::map<unsigned, std::pair<int, int>> sites;
  for (int i = 0; i < int(tissue.neurons.size()); ++i) {
    auto &cell = tissue.neurons[i];
    for (int j = 0; j < n; ++j)
      if (p.groups[j].contains(cell.location)) {
        owner[i] = j;
        ++counts[j];
        break;
      }
    auto [it, fresh] = sites.emplace(cell.group, std::make_pair(i, 0));
    ++it->second.second;
    cell.sender = cell.receiver = {0, 0};
  }
  std::vector<std::vector<double>> mass(n, std::vector<double>(n));
  for (const auto &[unused, a] : sites)
    for (const auto &[unused2, b] : sites) {
      const int ga = owner[a.first], gb = owner[b.first];
      if (ga < 0 || gb < 0)
        continue;
      const int pairs = a.second * b.second - (a.first == b.first ? a.second : 0);
      const double value =
          pairs * field::contact_parameters(tissue.neurons[a.first], tissue.neurons[b.first],
                                            tissue.body_length)
                      .probability;
      mass[ga][gb] += value;
    }
  struct Pair {
    int source, target;
    double mass;
    bool wanted, allowed;
  };
  std::vector<Pair> pairs;
  std::vector<std::vector<int>> pair_index(n, std::vector<int>(n, -1));
  for (int a = 0; a < n; ++a)
    for (int b = 0; b < n; ++b)
      if (classes[a] >= 0 && mass[a][b] > 0) {
        pair_index[a][b] = int(pairs.size());
        pairs.push_back({classes[a], b, mass[a][b], w.wanted[a][b], w.allowed[a][b]});
      }
  std::map<int, std::vector<int>> bundles;
  for (const auto &wire : p.connections) {
    auto &bundle = bundles[wire.bundle];
    if (pair_index[wire.from][wire.to] >= 0)
      bundle.push_back(pair_index[wire.from][wire.to]);
  }
  std::vector<double> slots(n);
  for (int b = 0; b < n; ++b)
    slots[b] = counts[b] *
               (p.groups[b].role == 2 ? 32 : std::lround(4 * std::pow(128, p.groups[b].field)));
  // Keep forbidden senders beyond the compact field, with ten percent margin.
  const double clearance = field::CONTACT_SUPPORT * 1.1;
  const int size = 2 * k + 3 * n;
  std::vector<double> best(size), values(pairs.size()), slopes(pairs.size()), q(pairs.size()),
      derivative(pairs.size());
  double best_loss = std::numeric_limits<double>::infinity(), last_notice = -1000;
  AddressFit stats;
  auto elapsed = [&] {
    return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - started)
        .count();
  };
  for (int restart = 0; restart < 64 && (restart == 0 || elapsed() < budget_ms); ++restart) {
    ++stats.attempts;
    std::vector<double> x(size), gradient(size), m(size), v(size);
    std::vector<int> order(k);
    std::iota(order.begin(), order.end(), 0);
    if (restart)
      std::sort(order.begin(), order.end(), [&](int a, int b) {
        return field::splitmix(std::uint64_t(a) + restart * 7919) <
               field::splitmix(std::uint64_t(b) + restart * 7919);
      });
    const int columns = std::max(2, int(std::ceil(std::sqrt(double(k)))));
    for (int c = 0; c < k; ++c) {
      x[2 * order[c]] = -.8 + 1.6 * (c % columns) / (columns - 1);
      x[2 * order[c] + 1] = -.8 + 1.6 * (c / columns) / (columns - 1);
    }
    for (int b = 0; b < n; ++b) {
      std::set<int> senders;
      for (int a = 0; a < n; ++a)
        if (w.wanted[a][b] && classes[a] >= 0)
          senders.insert(classes[a]);
      for (int c : senders) {
        x[2 * k + 3 * b] += x[2 * c] / senders.size();
        x[2 * k + 3 * b + 1] += x[2 * c + 1] / senders.size();
      }
      x[2 * k + 3 * b + 2] = std::log(std::max(.12, .03 + w.spread[b] * 1.97));
    }
    // Local repair restarts begin near the best arrangement as well as independent layouts.
    if (restart && restart % 2 == 0) {
      x = best;
      for (int i = 0; i < size; ++i)
        x[i] += .08 * (2 * field::unit_center(field::splitmix(i + restart * 7919)) - 1);
    }
    for (int i = 0; i < size; ++i) {
      if (i >= 2 * k && (i - 2 * k) % 3 == 2)
        x[i] = std::clamp(x[i], std::log(.03 + w.spread[(i - 2 * k) / 3] * 1.97), std::log(2.));
      else
        x[i] = std::clamp(x[i], -.95, .95);
    }
    for (int iteration = 1; iteration <= 1600; ++iteration) {
      std::fill(gradient.begin(), gradient.end(), 0);
      std::fill(derivative.begin(), derivative.end(), 0);
      std::vector<double> demand(n), demand_gradient(n);
      double loss = 0, leakage = 0, missing = 0;
      for (int i = 0; i < int(pairs.size()); ++i) {
        const auto &pair = pairs[i];
        const int c = 2 * pair.source, r = 2 * k + 3 * pair.target;
        const double sigma = std::exp(x[r + 2]), dx = x[c] - x[r], dy = x[c + 1] - x[r + 1];
        q[i] = (dx * dx + dy * dy) / (2 * sigma * sigma);
        values[i] = pair.mass * field::contact_affinity(q[i]);
        slopes[i] = pair.mass * field::contact_affinity_slope(q[i]);
        demand[pair.target] += values[i];
        if (pair.wanted) {
          // Keep a useful drive even when many copies make a weak wire likely to occur.
          loss += .25 * q[i];
          derivative[i] += .25;
        } else if (!pair.allowed) {
          const double deficit = std::max(0., clearance - q[i]);
          loss += deficit * deficit;
          derivative[i] -= 2 * deficit;
          leakage += values[i];
        }
      }
      for (const auto &[unused, bundle] : bundles) {
        if (bundle.empty()) {
          missing += 1;
          continue;
        }
        double expected = 0;
        for (int i : bundle) {
          const int b = pairs[i].target;
          const double thinning = demand[b] > slots[b] ? slots[b] / demand[b] : 1;
          expected += values[i] * thinning;
        }
        missing += std::exp(-expected);
        // -log(P(at least one contact)), with a Poisson approximation for slot competition.
        const double safe = std::max(1e-12, expected);
        loss -= 4 * std::log(-std::expm1(-safe));
        const double d = -4 / std::expm1(std::min(700., safe));
        for (int i : bundle) {
          const int b = pairs[i].target;
          const double thinning = demand[b] > slots[b] ? slots[b] / demand[b] : 1;
          derivative[i] += d * thinning * slopes[i];
          if (demand[b] > slots[b])
            demand_gradient[b] -= d * values[i] * thinning / demand[b];
        }
      }
      for (int i = 0; i < int(pairs.size()); ++i) {
        const auto &pair = pairs[i];
        const int c = 2 * pair.source, r = 2 * k + 3 * pair.target;
        const double s2 = std::exp(2 * x[r + 2]), dx = x[c] - x[r], dy = x[c + 1] - x[r + 1];
        const double d = derivative[i] + demand_gradient[pair.target] * slopes[i];
        gradient[c] += d * dx / s2;
        gradient[c + 1] += d * dy / s2;
        gradient[r] -= d * dx / s2;
        gradient[r + 1] -= d * dy / s2;
        gradient[r + 2] -= 2 * d * q[i];
      }
      stats.evaluations += int(pairs.size());
      if (loss < best_loss) {
        best_loss = loss;
        best = x;
        stats.expectedMissing = missing;
        stats.leakage = leakage;
      }
      if (iteration % 32 == 0) {
        stats.milliseconds = elapsed();
        if (progress && stats.milliseconds - last_notice >= 150) {
          progress("search", stats);
          last_notice = stats.milliseconds;
        }
        if (stats.milliseconds >= budget_ms ||
            (stats.expectedMissing < .001 && stats.leakage < .002))
          break;
      }
      const double b1 = 1 - std::pow(.9, iteration), b2 = 1 - std::pow(.999, iteration);
      for (int i = 0; i < size; ++i) {
        m[i] = .9 * m[i] + .1 * gradient[i];
        v[i] = .999 * v[i] + .001 * gradient[i] * gradient[i];
        x[i] -= .025 * (m[i] / b1) / (std::sqrt(v[i] / b2) + 1e-8);
        if (i >= 2 * k && (i - 2 * k) % 3 == 2) {
          const int b = (i - 2 * k) / 3;
          x[i] = std::clamp(x[i], std::log(.03 + w.spread[b] * 1.97), std::log(2.));
        } else
          x[i] = std::clamp(x[i], -.95, .95);
      }
    }
    if (stats.expectedMissing < .001 && stats.leakage < .002)
      break;
  }
  for (int a = 0; a < n; ++a) {
    auto &g = p.groups[a];
    const int c = classes[a], r = 2 * k + 3 * a;
    g.sender1 = c < 0 ? 1 : float(best[2 * c]);
    g.sender2 = c < 0 ? 1 : float(best[2 * c + 1]);
    g.receiver1 = g.role == 0 ? -1 : float(best[r]);
    g.receiver2 = g.role == 0 ? -1 : float(best[r + 1]);
    g.sigma =
        g.role == 0 ? .03f : std::max(float(std::exp(best[r + 2])), .03f + w.spread[a] * 1.97f);
  }
  stats.milliseconds = elapsed();
  return stats;
}

struct Issue {
  std::string code;
  int from = -1, to = -1;
  double value = 0;
};
struct Assessment {
  std::vector<Issue> issues;
  int additional = 0, missing = 0, extraCells = 0;
  double leakage = 0;
  bool ok() const { return issues.empty(); }
};
// Deviations are fractions of each gene's full trait span. Inactive receptors only constrain
// their baseline and sensitivity; their unused binding profile has no physiological effect.
inline float receptor_deviation(const Receptor &wanted, const field::HormoneReceptor &actual,
                                int effect) {
  float deviation =
      std::max(std::abs(actual.baseline - (wanted.active             ? wanted.baseline
                                           : effect == field::Output ? 1.f
                                                                     : 0.f)) /
                   2,
               std::abs(actual.sensitivity - (wanted.active ? wanted.sensitivity : 0.f)) /
                   (2 * field::HORMONE_SENSITIVITY_SPAN));
  if (!wanted.active || std::abs(wanted.sensitivity) < 1e-6f)
    return deviation;
  const float angle = float(2 * fishsim::PI * wanted.substance / field::BLOOD_SUBSTANCES);
  const auto affinity =
      field::hormone_affinity<field::REGULATORS>(std::cos(angle), std::sin(angle), wanted.width);
  for (int k = 0; k < field::REGULATORS; ++k)
    deviation = std::max(deviation, std::abs(actual.affinity[k] - affinity[k]));
  deviation =
      std::max(deviation, float(std::abs(std::log(actual.half / wanted.half)) /
                                std::log(field::HORMONE_HALF_MAX / field::HORMONE_HALF_MIN)));
  return std::max(deviation, float(std::abs(actual.steepness - wanted.steepness)) /
                                 field::HORMONE_STEEPNESS_STEPS);
}
inline float trait_deviation(const Group &wanted, const field::Neuron &cell,
                             const field::Neuron &expected) {
  const auto &a = cell.parameters, &b = expected.parameters;
  float deviation = std::max(
      {std::abs(a.threshold - b.threshold), std::abs(a.time_constant - b.time_constant),
       std::abs(a.field_width - b.field_width), std::abs(a.quality1 - b.quality1) / 2,
       std::abs(a.quality2 - b.quality2) / 2, std::abs(a.quality_width - b.quality_width),
       std::abs(cell.range - expected.range), std::abs(cell.crossing - expected.crossing) / 2});
  for (std::size_t k = 1; k < cell.identity.size(); ++k)
    deviation = std::max(deviation, std::abs(cell.identity[k] - expected.identity[k]) / 2);
  for (int effect = 0; effect < field::HORMONE_EFFECTS; ++effect)
    if (field::hormone_effect_present(cell.role, effect))
      deviation = std::max(deviation, receptor_deviation(wanted.receptors[effect],
                                                         cell.hormone_receptors[effect], effect));
  return deviation;
}
inline Assessment assess(const Plan &p, const fishsim::Genome &g) {
  Assessment result;
  const auto &t = *g.blueprint;
  const int n = int(p.groups.size());
  const Wiring w(p);
  std::vector<int> group(t.neurons.size(), -1), counts(n);
  std::vector<double> capacities(n);
  std::vector<float> deviations(n);
  std::vector<bool> identities(n);
  std::set<std::uint32_t> checkedGroups;
  for (std::size_t i = 0; i < t.neurons.size(); ++i) {
    const auto &cell = t.neurons[i];
    for (int j = 0; j < n; ++j)
      if (p.groups[j].contains(cell.location)) {
        group[i] = j;
        ++counts[j];
        capacities[j] += cell.strength * cell.parameters.capacity;
        const auto &want = p.groups[j];
        const auto expected =
            field::site_cell(cell.location, outputs(want), cell.id, t.options.bias_scale);
        if (!expected || cell.role != expected->role ||
            cell.functions.senses != expected->functions.senses ||
            cell.functions.motors != expected->functions.motors)
          identities[j] = true;
        if (expected && checkedGroups.insert(cell.group).second)
          deviations[j] = std::max(deviations[j], trait_deviation(want, cell, *expected));
        break;
      }
    if (group[i] < 0)
      ++result.extraCells;
  }
  if (result.extraCells > p.options.extraCells)
    result.issues.push_back({"cells", -1, -1, double(result.extraCells)});
  if (receptor_deviation(p.growth, t.growth_receptor, field::GROWTH_RECEPTOR) >
      p.options.traitTolerance + 1e-4f)
    result.issues.push_back({"growth"});
  for (int j = 0; j < n; ++j) {
    if (identities[j])
      result.issues.push_back({"identity", j, j});
    if (deviations[j] > p.options.traitTolerance + 1e-4f)
      result.issues.push_back({"traits", j, j, deviations[j]});
    int sites = 0;
    for (std::size_t i = 0; i < field::DEVELOPMENT_SITES; ++i)
      sites += p.groups[j].contains(field::development_site(i));
    const int expected = sites * (p.groups[j].role == 2 ? 1 : p.groups[j].copies);
    if (!counts[j])
      result.issues.push_back({"organ", j, j});
    else if (std::abs(counts[j] - expected) > p.options.capacityTolerance * expected + .001)
      result.issues.push_back({"capacity", j, j, double(counts[j]) / expected});
    if (p.groups[j].role == 2) {
      const double capacity = sites * p.groups[j].copies / 16.;
      if (std::abs(capacities[j] - capacity) > p.options.capacityTolerance * capacity + 1e-4)
        result.issues.push_back({"capacity", j, j, capacities[j] / capacity});
    }
  }
  std::vector<std::vector<int>> contacts(n, std::vector<int>(n));
  for (const auto &edge : t.edges) {
    const int a = group[edge.source], b = group[edge.target];
    if (a < 0 || b < 0)
      continue;
    ++contacts[a][b];
  }
  for (int a = 0; a < n; ++a)
    for (int b = 0; b < n; ++b)
      if (contacts[a][b] && !w.wanted[a][b]) {
        result.additional += contacts[a][b];
        if (!w.allowed[a][b])
          result.issues.push_back({"contact", a, b, double(contacts[a][b])});
      }
  std::map<int, std::pair<int, Connection>> bundles;
  for (const auto &c : p.connections) {
    auto &bundle = bundles[c.bundle];
    bundle.first += contacts[c.from][c.to];
    bundle.second = c;
  }
  for (const auto &[id, bundle] : bundles)
    if (!bundle.first) {
      ++result.missing;
      result.issues.push_back({"missing", bundle.second.from, bundle.second.to});
    }
  // Expected excluded candidates, before input-slot competition. The same probabilities also
  // govern later synapse formation, so a fortunate initial draw cannot hide a broad receiver.
  std::map<int, std::pair<int, int>> groups;
  for (std::size_t i = 0; i < t.neurons.size(); ++i) {
    auto [it, fresh] = groups.emplace(t.neurons[i].group, std::make_pair(int(i), 0));
    ++it->second.second;
  }
  double worst = 0;
  int worstFrom = -1, worstTo = -1;
  for (const auto &[unused, a] : groups)
    for (const auto &[unused2, b] : groups) {
      const int ga = group[a.first], gb = group[b.first];
      if (ga < 0 || gb < 0 || w.allowed[ga][gb])
        continue;
      const int pairs = a.second * b.second - (a.first == b.first ? a.second : 0);
      const double leak =
          pairs * field::contact_parameters(t.neurons[a.first], t.neurons[b.first], t.body_length)
                      .probability;
      result.leakage += leak;
      if (leak > worst) {
        worst = leak;
        worstFrom = ga;
        worstTo = gb;
      }
    }
  if (result.leakage > .01)
    result.issues.push_back({"leakage", worstFrom, worstTo, result.leakage});
  if (t.resource_limited)
    result.issues.push_back({"resources"});
  if (g.cppn->nodes() + p.options.reserve > fishsim::MAX_GROWING_NODES)
    result.issues.push_back(
        {"reserve", -1, -1, double(fishsim::MAX_GROWING_NODES - g.cppn->nodes())});
  return result;
}
}
