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
struct AddressFit {
  int evaluations = 0, attempts = 0;
  double milliseconds = 0, expectedMissing = 0, leakage = 0;
};
using CompileProgress = std::function<void(const char *, const AddressFit &)>;
namespace fit {
// Periodic checks keep progress responsive without reading the clock for every pair.
// Fixed restarts make short fits repeatable.
inline constexpr double budget_ms = 4000, notice_ms = 150;
inline constexpr int restarts = 64, iterations = 1600, check_period = 32, repair_period = 2;
inline constexpr std::uint64_t restart_salt = 7919;
inline constexpr double initial_extent = .8, address_extent = .95, initial_radius = .12,
                        repair_jitter = .08, clearance_margin = 1.1;
// Bundles protect complete paths; affinity favours mutation-tolerant binding cores.
inline constexpr double bundle_weight = 4, binding_weight = .25, missing_goal = .001,
                        leakage_goal = .002;
inline constexpr double first_decay = .9, second_decay = .999, step = .025, moment_epsilon = 1e-8,
                        probability_floor = 1e-12, exponent_limit = 700;
}
class AddressFitter {
  Plan &p;
  int n, k = 0, size = 0;
  Wiring w;
  struct Pair {
    int source, target;
    double mass;
    bool wanted, allowed;
  };
  std::vector<int> classes, field_count, winning;
  static int reception(int target, int f) { return target * field::CONTACT_FIELDS + f; }
  int receiver(int target, int f) const { return 2 * k + 3 * reception(target, f); }
  std::vector<Pair> pairs;
  std::map<int, std::vector<int>> bundles;
  std::vector<double> slots, lower, upper, x, best, gradient, m, v, values, slopes, q, derivative,
      demand, demand_gradient, variance, squared, thinning;
  double best_loss = std::numeric_limits<double>::infinity();
  AddressFit stats;
  void prepare() {
    std::map<std::vector<int>, int> signatures;
    classes.assign(n, -1);
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
    std::vector<std::vector<int>> pair_index(n, std::vector<int>(n, -1));
    for (int a = 0; a < n; ++a)
      for (int b = 0; b < n; ++b)
        if (classes[a] >= 0 && mass[a][b] > 0) {
          pair_index[a][b] = int(pairs.size());
          pairs.push_back({classes[a], b, mass[a][b], w.wanted[a][b], w.allowed[a][b]});
        }
    for (const auto &wire : p.connections) {
      auto &bundle = bundles[wire.bundle];
      if (pair_index[wire.from][wire.to] >= 0)
        bundle.push_back(pair_index[wire.from][wire.to]);
    }
    slots.resize(n);
    for (int b = 0; b < n; ++b)
      slots[b] = counts[b] * field::input_slots(field::Role(p.groups[b].role), p.groups[b].field);

    field_count.assign(n, 1);
    for (int b = 0; b < n; ++b) {
      std::set<int> senders;
      for (int a = 0; a < n; ++a)
        if (w.wanted[a][b] && classes[a] >= 0)
          senders.insert(classes[a]);
      field_count[b] = std::clamp(int(senders.size()), 1, field::CONTACT_FIELDS);
    }
    size = 2 * k + 3 * field::CONTACT_FIELDS * n;
    for (auto buffer : {&x, &best, &gradient, &m, &v})
      buffer->resize(size);
    lower.assign(size, -fit::address_extent);
    upper.assign(size, fit::address_extent);
    for (int b = 0; b < n; ++b)
      for (int f = 0; f < field::CONTACT_FIELDS; ++f) {
        lower[receiver(b, f) + 2] = std::log(field::spread_radius(w.spread[b]));
        upper[receiver(b, f) + 2] = std::log(field::MAX_SEARCH);
      }
    for (auto buffer : {&values, &slopes, &q, &derivative})
      buffer->resize(pairs.size());
    for (auto buffer : {&demand, &demand_gradient, &thinning})
      buffer->resize(n);
    variance.resize(n * field::CONTACT_FIELDS);
    squared.resize(variance.size());
    winning.resize(pairs.size());
  }
  void clamp() {
    for (int i = 0; i < size; ++i)
      x[i] = std::clamp(x[i], lower[i], upper[i]);
  }
  void initialize(int restart) {
    std::fill(x.begin(), x.end(), 0);
    std::fill(m.begin(), m.end(), 0);
    std::fill(v.begin(), v.end(), 0);
    std::vector<int> order(k);
    std::iota(order.begin(), order.end(), 0);
    if (restart)
      std::sort(order.begin(), order.end(), [&](int a, int b) {
        return field::splitmix(std::uint64_t(a) + restart * fit::restart_salt) <
               field::splitmix(std::uint64_t(b) + restart * fit::restart_salt);
      });
    const int columns = std::max(2, int(std::ceil(std::sqrt(double(k)))));
    for (int c = 0; c < k; ++c) {
      x[2 * order[c]] =
          -fit::initial_extent + 2 * fit::initial_extent * (c % columns) / (columns - 1);
      x[2 * order[c] + 1] =
          -fit::initial_extent + 2 * fit::initial_extent * (c / columns) / (columns - 1);
    }
    for (int b = 0; b < n; ++b) {
      std::set<int> senders;
      for (int a = 0; a < n; ++a)
        if (w.wanted[a][b] && classes[a] >= 0)
          senders.insert(classes[a]);
      for (int f = 0; f < field_count[b]; ++f) {
        int index = 0, count = 0;
        const int r = receiver(b, f);
        for (int c : senders) {
          if (index++ % field_count[b] != f)
            continue;
          x[r] += x[2 * c];
          x[r + 1] += x[2 * c + 1];
          ++count;
        }
        if (count) {
          x[r] /= count;
          x[r + 1] /= count;
        }
        x[r + 2] = std::max(std::log(fit::initial_radius), lower[r + 2]);
      }
    }

    if (restart && restart % fit::repair_period == 0) {
      x = best;
      for (int i = 0; i < size; ++i)
        x[i] += fit::repair_jitter *
                (2 * field::unit_center(field::splitmix(i + restart * fit::restart_salt)) - 1);
    }
    clamp();
  }
  void evaluate() {
    std::fill(gradient.begin(), gradient.end(), 0);
    std::fill(derivative.begin(), derivative.end(), 0);
    std::fill(demand.begin(), demand.end(), 0);
    std::fill(demand_gradient.begin(), demand_gradient.end(), 0);
    for (int b = 0; b < n; ++b)
      for (int f = 0; f < field_count[b]; ++f) {
        const auto r = reception(b, f);
        const double sigma = std::exp(x[receiver(b, f) + 2]);
        variance[r] = 2 * sigma * sigma;
        squared[r] = sigma * sigma;
      }
    double loss = 0, leakage = 0, missing = 0;
    for (int i = 0; i < int(pairs.size()); ++i) {
      const auto &pair = pairs[i];
      const int c = 2 * pair.source;
      q[i] = std::numeric_limits<double>::infinity();
      for (int f = 0; f < field_count[pair.target]; ++f) {
        const int r = receiver(pair.target, f);
        const double dx = x[c] - x[r], dy = x[c + 1] - x[r + 1];
        const double candidate = (dx * dx + dy * dy) / variance[reception(pair.target, f)];
        if (candidate < q[i]) {
          q[i] = candidate;
          winning[i] = f;
        }
      }
      values[i] = pair.mass * field::contact_affinity(q[i]);
      slopes[i] = pair.mass * field::contact_affinity_slope(q[i]);
      demand[pair.target] += values[i];
      if (pair.wanted) {
        // Keep a useful drive even when many copies make a weak wire likely to occur.
        loss += fit::binding_weight * q[i];
        derivative[i] += fit::binding_weight;
      } else if (!pair.allowed) {
        const double deficit = std::max(0., field::CONTACT_SUPPORT * fit::clearance_margin - q[i]);
        loss += deficit * deficit;
        derivative[i] -= 2 * deficit;
        leakage += values[i];
      }
    }
    for (int b = 0; b < n; ++b)
      thinning[b] = demand[b] > slots[b] ? slots[b] / demand[b] : 1;
    for (const auto &[unused, bundle] : bundles) {
      if (bundle.empty()) {
        missing += 1;
        continue;
      }
      double expected = 0;
      for (int i : bundle) {
        const int b = pairs[i].target;
        expected += values[i] * thinning[b];
      }
      missing += std::exp(-expected);
      const double safe = std::max(fit::probability_floor, expected);
      loss -= fit::bundle_weight * std::log(-std::expm1(-safe));
      const double d = -fit::bundle_weight / std::expm1(std::min(fit::exponent_limit, safe));
      for (int i : bundle) {
        const int b = pairs[i].target;
        derivative[i] += d * thinning[b] * slopes[i];
        if (demand[b] > slots[b])
          demand_gradient[b] -= d * values[i] * thinning[b] / demand[b];
      }
    }
    for (int i = 0; i < int(pairs.size()); ++i) {
      const auto &pair = pairs[i];
      const int c = 2 * pair.source, r = receiver(pair.target, winning[i]),
                rf = reception(pair.target, winning[i]);
      const double dx = x[c] - x[r], dy = x[c + 1] - x[r + 1];
      const double d = derivative[i] + demand_gradient[pair.target] * slopes[i];
      gradient[c] += d * dx / squared[rf];
      gradient[c + 1] += d * dy / squared[rf];
      gradient[r] -= d * dx / squared[rf];
      gradient[r + 1] -= d * dy / squared[rf];
      gradient[r + 2] -= 2 * d * q[i];
    }
    stats.evaluations += int(pairs.size());
    if (loss < best_loss) {
      best_loss = loss;
      best = x;
      stats.expectedMissing = missing;
      stats.leakage = leakage;
    }
  }
  void descend(int iteration) {
    const double b1 = 1 - std::pow(fit::first_decay, iteration),
                 b2 = 1 - std::pow(fit::second_decay, iteration);
    for (int i = 0; i < size; ++i) {
      m[i] = fit::first_decay * m[i] + (1 - fit::first_decay) * gradient[i];
      v[i] = fit::second_decay * v[i] + (1 - fit::second_decay) * gradient[i] * gradient[i];
      x[i] -= fit::step * (m[i] / b1) / (std::sqrt(v[i] / b2) + fit::moment_epsilon);
    }
    clamp();
  }
  bool sufficient() const {
    return stats.expectedMissing < fit::missing_goal && stats.leakage < fit::leakage_goal;
  }
  void apply() {
    for (int a = 0; a < n; ++a) {
      auto &g = p.groups[a];
      const int c = classes[a], r = receiver(a, 0);
      g.sender1 = c < 0 ? 1 : float(best[2 * c]);
      g.sender2 = c < 0 ? 1 : float(best[2 * c + 1]);
      g.receiver1 = g.role == 0 ? -1 : float(best[r]);
      g.receiver2 = g.role == 0 ? -1 : float(best[r + 1]);
      for (int f = 1; f < field::CONTACT_FIELDS; ++f) {
        auto &extra = g.reception[f - 1];
        const int r = receiver(a, f);
        extra.expression = g.role != 0 && f < field_count[a] ? 1.f : -1.f;
        extra.address = {float(best[r]), float(best[r + 1])};
        extra.width = float(field::search_width(
            std::clamp(std::exp(best[r + 2]), field::MIN_SEARCH, field::MAX_SEARCH)));
      }
      g.sigma = g.role == 0
                    ? float(field::MIN_SEARCH)
                    : float(std::max(std::exp(best[r + 2]), field::spread_radius(w.spread[a])));
    }
  }

public:
  explicit AddressFitter(Plan &plan) : p(plan), n(int(plan.groups.size())), w(plan) { prepare(); }
  AddressFit run(const CompileProgress &progress, double budget_ms,
                 std::chrono::steady_clock::time_point started) {
    auto elapsed = [&] {
      return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - started)
          .count();
    };
    double last_notice = -fit::notice_ms;
    for (int restart = 0; restart < fit::restarts && (restart == 0 || elapsed() < budget_ms);
         ++restart) {
      ++stats.attempts;
      initialize(restart);
      for (int iteration = 1; iteration <= fit::iterations; ++iteration) {
        evaluate();
        if (iteration % fit::check_period == 0) {
          stats.milliseconds = elapsed();
          if (progress && stats.milliseconds - last_notice >= fit::notice_ms) {
            progress("search", stats);
            last_notice = stats.milliseconds;
          }
          if (stats.milliseconds >= budget_ms || sufficient())
            break;
        }
        descend(iteration);
      }
      if (sufficient())
        break;
    }
    apply();
    stats.milliseconds = elapsed();
    return stats;
  }
};
inline AddressFit plan_addresses(Plan &p, const CompileProgress &progress = {},
                                 double budget_ms = fit::budget_ms) {
  const auto started = std::chrono::steady_clock::now();
  return AddressFitter(p).run(progress, budget_ms, started);
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
  const auto outside = [](float value, float lower, float upper) {
    return std::max({0.f, lower - value, value - upper});
  };
  const float baseline = wanted.active ? wanted.baseline : effect == field::Output ? 1.f : 0.f;
  const float sensitivity = wanted.active ? wanted.sensitivity : 0.f;
  float deviation = std::max(
      outside(actual.baseline, baseline - 2 * wanted.spread_receptors,
              baseline + 2 * wanted.spread_receptors) /
          2,
      outside(actual.sensitivity,
              sensitivity - 2 * field::HORMONE_SENSITIVITY_SPAN * wanted.spread_receptors,
              sensitivity + 2 * field::HORMONE_SENSITIVITY_SPAN * wanted.spread_receptors) /
          (2 * field::HORMONE_SENSITIVITY_SPAN));
  if (!wanted.active || std::abs(wanted.sensitivity) < 1e-6f)
    return deviation;
  const double angle = 2 * fishsim::PI * wanted.substance / field::BLOOD_SUBSTANCES;
  const auto interval = [](double mean, double width) {
    return std::array<double, 2>{std::clamp(mean - width, -1., 1.),
                                 std::clamp(mean + width, -1., 1.)};
  };
  const auto x = interval(std::cos(angle), 2 * wanted.spread_receptors),
             y = interval(std::sin(angle), 2 * wanted.spread_receptors);
  const double sigma_min = field::HORMONE_SIGMA_MIN +
                           (field::HORMONE_SIGMA_MAX - field::HORMONE_SIGMA_MIN) *
                               std::clamp(wanted.width - wanted.spread_receptors, 0.f, 1.f),
               sigma_max = field::HORMONE_SIGMA_MIN +
                           (field::HORMONE_SIGMA_MAX - field::HORMONE_SIGMA_MIN) *
                               std::clamp(wanted.width + wanted.spread_receptors, 0.f, 1.f);
  for (int k = 0; k < field::REGULATORS; ++k) {
    const double a = 2 * fishsim::PI * k / field::BLOOD_SUBSTANCES;
    const double px = std::cos(a), py = std::sin(a);
    const double near_x = outside(float(px), float(x[0]), float(x[1])),
                 near_y = outside(float(py), float(y[0]), float(y[1])),
                 far_x = std::max(std::abs(px - x[0]), std::abs(px - x[1])),
                 far_y = std::max(std::abs(py - y[0]), std::abs(py - y[1]));
    deviation = std::max(
        deviation,
        outside(
            actual.affinity[k],
            float(std::exp(-(far_x * far_x + far_y * far_y) / (2 * sigma_min * sigma_min))),
            float(std::exp(-(near_x * near_x + near_y * near_y) / (2 * sigma_max * sigma_max)))));
  }
  const float half_difference = float(std::log(actual.half / wanted.half) /
                                      std::log(field::HORMONE_HALF_MAX / field::HORMONE_HALF_MIN));
  deviation = std::max(deviation,
                       outside(half_difference, -wanted.spread_receptors, wanted.spread_receptors));
  const auto steepness = [&](float delta) {
    return float(std::lround(
        field::HORMONE_STEEPNESS_STEPS *
        std::clamp(float(wanted.steepness) / field::HORMONE_STEEPNESS_STEPS + delta, 0.f, 1.f)));
  };
  return std::max(deviation,
                  outside(float(actual.steepness), steepness(-2 * wanted.spread_receptors),
                          steepness(2 * wanted.spread_receptors)) /
                      field::HORMONE_STEEPNESS_STEPS);
}
inline float trait_deviation(const Group &wanted, const field::Neuron &cell,
                             const field::Neuron &expected) {
  const auto &a = cell.parameters, &b = expected.parameters;
  float deviation = std::max(
      {std::max(0.f, std::abs(a.threshold - b.threshold) - wanted.spread_physiology),
       std::max(0.f, std::abs(a.time_constant - b.time_constant) - wanted.spread_physiology),
       std::max(0.f, std::abs(a.field_width - b.field_width) - wanted.spread_physiology),
       std::max(0.f, std::abs(a.quality1 - b.quality1) / 2 - wanted.spread_physiology),
       std::max(0.f, std::abs(a.quality2 - b.quality2) / 2 - wanted.spread_physiology),
       std::max(0.f, std::abs(a.quality_width - b.quality_width) - wanted.spread_physiology),
       std::max(0.f, std::abs(cell.range - expected.range) - wanted.spread_contacts),
       std::max(0.f, std::abs(cell.crossing - expected.crossing) / 2 - wanted.spread_contacts)});
  for (std::size_t k = 1; k < cell.identity.size(); ++k)
    deviation =
        std::max(deviation, std::max(0.f, std::abs(cell.identity[k] - expected.identity[k]) / 2 -
                                              wanted.spread_development));
  for (int effect = 0; effect < field::HORMONE_EFFECTS; ++effect)
    if (field::hormone_effect_present(cell, effect))
      deviation = std::max(deviation, receptor_deviation(wanted.receptors[effect],
                                                         cell.hormone_receptors[effect], effect));
  return deviation;
}
inline Assessment assess(const Plan &p, const fishsim::Genome &g) {
  Assessment result;
  const auto &t = *g.blueprint;
  const int n = int(p.groups.size());
  const Wiring w(p);
  std::vector<int> group(t.neurons.size(), -1), counts(n), representatives(n, -1);
  std::vector<double> capacities(n);
  std::vector<float> deviations(n);
  std::vector<bool> identities(n);
  std::set<std::uint32_t> checkedGroups;
  for (std::size_t i = 0; i < t.neurons.size(); ++i) {
    const auto &cell = t.neurons[i];
    for (int j = 0; j < n; ++j)
      if (p.groups[j].contains(cell.location)) {
        group[i] = j;
        representatives[j] = int(i);
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
    else if (std::abs(counts[j] - expected) >
             p.options.capacityTolerance * expected +
                 sites * field::CELL_COPIES * p.groups[j].spread_development + .001)
      result.issues.push_back({"capacity", j, j, double(counts[j]) / expected});
    if (p.groups[j].role == 2) {
      const double capacity = sites * p.groups[j].copies / 16.;
      if (std::abs(capacities[j] - capacity) >
          p.options.capacityTolerance * capacity + sites * p.groups[j].spread_development + 1e-4)
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
  std::set<int> possibleBundles;
  for (const auto &c : p.connections) {
    auto &bundle = bundles[c.bundle];
    bundle.first += contacts[c.from][c.to];
    if (representatives[c.from] >= 0 && representatives[c.to] >= 0 &&
        (c.from != c.to || counts[c.from] > 1) &&
        field::contact_parameters(t.neurons[representatives[c.from]],
                                  t.neurons[representatives[c.to]], t.body_length)
                .probability > 0)
      possibleBundles.insert(c.bundle);
    bundle.second = c;
  }
  for (const auto &[id, bundle] : bundles)
    if (!bundle.first) {
      ++result.missing;
      if (!possibleBundles.count(id))
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
