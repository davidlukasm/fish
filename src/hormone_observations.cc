#include "hormone_observations.hh"
#include "state_validation.hh"
#include <cmath>
#include <algorithm>
#include <map>
#include <set>
#include <iomanip>
namespace fishsim {
void HormoneMoments::add(const HormoneMoments &v) {
  steps += v.steps;
  learning_cells += v.learning_cells;
  work += v.work;
  learning_change += v.learning_change;
  surprise += v.surprise;
  for (std::size_t k = 0; k < level.size(); ++k) {
    level[k] += v.level[k];
    square[k] += v.square[k];
    secretion[k] += v.secretion[k];
    binding[k] += v.binding[k];
    net[k] += v.net[k];
  }
  for (std::size_t c = 0; c < contexts.size(); ++c)
    for (std::size_t side = 0; side < CONTEXT_STATES; ++side) {
      contexts[c].count[side] += v.contexts[c].count[side];
      for (std::size_t k = 0; k < level.size(); ++k)
        contexts[c].level[side][k] += v.contexts[c].level[side][k];
    }
}
void HormoneMoments::write(std::ostream &out) const {
  out << steps << ' ' << learning_cells << ' ' << work << ' ' << learning_change << ' ' << surprise
      << ' ';
  for (const auto *a : {&level, &square, &secretion, &binding, &net})
    for (double v : *a)
      out << v << ' ';
  for (const auto &c : contexts)
    for (std::size_t side = 0; side < CONTEXT_STATES; ++side) {
      out << c.count[side] << ' ';
      for (double v : c.level[side])
        out << v << ' ';
    }
  out << '\n';
}
void HormoneMoments::read(std::istream &in) {
  using state::scalar;
  using state::value;
  value(in, steps);
  value(in, learning_cells);
  scalar(in, work, 0, PLAUSIBLE_SUM);
  scalar(in, learning_change, 0, PLAUSIBLE_SUM);
  scalar(in, surprise, 0, PLAUSIBLE_SUM);
  for (auto *a : {&level, &square, &secretion, &binding, &net})
    for (double &v : *a)
      scalar(in, v, a == &net ? -PLAUSIBLE_SUM : 0, PLAUSIBLE_SUM);
  for (auto &c : contexts)
    for (std::size_t side = 0; side < CONTEXT_STATES; ++side) {
      value(in, c.count[side]);
      for (double &v : c.level[side])
        scalar(in, v, 0, PLAUSIBLE_SUM);
    }
}
void HormoneInvestigation::write(std::ostream &out) const {
  out << individual << ' ' << species << ' ' << tick << ' ' << round << ' ' << organs << ' ' << arms
      << ' ' << learning_arms << ' ';
  for (const auto &a : effects)
    for (double v : a)
      out << v << ' ';
  for (const auto *a : {&learning, &turn_magnitude})
    for (double v : *a)
      out << v << ' ';
  out << '\n';
}
void HormoneInvestigation::read(std::istream &in) {
  using state::value;
  value(in, individual);
  value(in, species);
  value(in, tick);
  value(in, round);
  value(in, organs);
  value(in, arms);
  value(in, learning_arms);
  if (organs >= (1u << HORMONE_ORGANS) || arms >= (1u << HORMONE_ARMS) ||
      learning_arms >= (1u << HORMONE_ARMS))
    throw std::runtime_error("invalid hormone profile mask");
  for (auto &a : effects)
    for (double &v : a)
      state::scalar(in, v, -PLAUSIBLE_LOCAL, PLAUSIBLE_LOCAL);
  for (double &v : learning)
    state::scalar(in, v, 0, PLAUSIBLE_LOCAL);
  for (double &v : turn_magnitude)
    state::scalar(in, v, -PLAUSIBLE_LOCAL, PLAUSIBLE_LOCAL);
}
void HormoneProfile::accept(const HormoneInvestigation &v) {
  samples.push_back(v);
  ++investigations;
  for (std::size_t arm = 0; arm < HORMONE_ARMS; ++arm) {
    if (v.arms & (1u << arm))
      for (std::size_t o = 0; o < HORMONE_ORGANS; ++o)
        if (v.organs & (1u << o)) {
          lifetime_effects[arm][o] += v.effects[arm][o];
          ++lifetime_effect_count[arm][o];
        }
    if (v.learning_arms & (1u << arm)) {
      lifetime_learning[arm] += v.learning[arm];
      ++lifetime_learning_count[arm];
    }
  }
  while (samples.size() > SAMPLE_MEMORY)
    samples.pop_front();
}
namespace {
struct Function {
  int first, last;
  const char *positive, *negative;
};
namespace D = organ_drive;
constexpr Function functions[] = {{D::forward, D::forward, "propulsivum", "frenans"},
                                  {D::turn, D::turn, "rotatorium", "rotatorium inhibens"},
                                  {D::suction, D::suction, "orale", "orale inhibens"},
                                  {D::jaw, D::jaw, "mordax", "mordax inhibens"},
                                  {D::defense, D::defense, "defensivum", "defensivum inhibens"},
                                  {D::eggs, D::eggs, "ovipositivum", "ovipositivum inhibens"},
                                  {D::sperm, D::sperm, "nebuliferum", "nebuliferum inhibens"},
                                  {D::pigment, D::bladder_fill - 1, "chromaticum", "chromaticum"},
                                  {D::bladder_fill, D::bladder, "vesicale", "vesicale"},
                                  {D::secretion, D::count - 1, "glandulare", "glandulare"}};
// A hormone is named from the last NAME_ROUNDS investigation rounds (at least MIN_ROUNDS) with
// MIN_INDIVIDUALS individuals. An effect counts from MIN_EFFECT, learning from MIN_LEARNING; a
// direction wins with AGREEMENT of the valid individuals, a hormone varies with VARIED_SHARE
// in each direction or MIXED_SHARE mixed; a new name holds after NAME_CONFIRMATION rounds.
constexpr std::size_t NAME_ROUNDS = 4, MIN_ROUNDS = 3, MIN_INDIVIDUALS = 8;
constexpr unsigned NAME_CONFIRMATION = 3;
constexpr double MIN_EFFECT = .005, MIN_LEARNING = .00001, AGREEMENT = .75, VARIED_SHARE = .25,
                 MIXED_SHARE = .5;
double median(std::vector<double> v) {
  if (v.empty())
    return 0;
  std::sort(v.begin(), v.end());
  return (v[(v.size() - 1) / 2] + v[v.size() / 2]) / 2;
}
}
void HormoneProfile::finish_round(std::uint64_t round, std::uint64_t tick) {
  completed_round = round;
  pending_round = 0;
  std::set<std::uint64_t> rounds;
  for (auto i = samples.rbegin(); i != samples.rend(); ++i)
    if (rounds.size() < NAME_ROUNDS || rounds.count(i->round))
      rounds.insert(i->round);
  if (rounds.size() < MIN_ROUNDS)
    return;
  std::map<std::uint64_t, const HormoneInvestigation *> individuals;
  for (const auto &s : samples)
    if (rounds.count(s.round))
      individuals[s.individual] = &s;
  if (individuals.size() < MIN_INDIVIDUALS)
    return;
  for (std::size_t channel = 0; channel < names.size(); ++channel) {
    std::string winner;
    double strongest = 0;
    bool varied = false;
    for (const auto &f : functions) {
      unsigned valid = 0, positive = 0, negative = 0, mixed = 0;
      std::vector<double> strengths[HORMONE_SIGNS];
      for (auto [id, sample] : individuals) {
        (void)id;
        std::array<double, HORMONE_SIGNS> arms{};
        std::array<bool, HORMONE_SIGNS> present{};
        for (std::size_t sign = 0; sign < HORMONE_SIGNS; ++sign) {
          const std::size_t a = channel * HORMONE_SIGNS + sign;
          if (!(sample->arms & (1u << a)))
            continue;
          for (int o = f.first; o <= f.last; ++o)
            if (sample->organs & (1u << o)) {
              present[sign] = true;
              const double effect =
                  o == int(D::turn) ? sample->turn_magnitude[a] : sample->effects[a][o];
              if (std::abs(effect) > std::abs(arms[sign]))
                arms[sign] = effect;
            }
        }
        if (!present[0] && !present[1])
          continue;
        ++valid;
        const bool a = present[0] && std::abs(arms[0]) >= MIN_EFFECT,
                   b = present[1] && std::abs(arms[1]) >= MIN_EFFECT;
        if (!a && !b)
          continue;
        if (a && b && arms[0] * arms[1] < 0) {
          ++mixed;
          continue;
        }
        const int direction = (a ? arms[0] : arms[1]) > 0 ? 0 : 1;
        if (direction == 0)
          ++positive;
        else
          ++negative;
        if (a)
          strengths[direction].push_back(std::abs(arms[0]));
        if (b)
          strengths[direction].push_back(std::abs(arms[1]));
      }
      if (valid < MIN_INDIVIDUALS)
        continue;
      for (int direction = 0; direction < 2; ++direction)
        if ((direction ? negative : positive) >= AGREEMENT * valid) {
          const double strength = median(strengths[direction]);
          if (strength > strongest) {
            strongest = strength;
            winner = direction ? f.negative : f.positive;
          }
        }
      varied |= (positive >= VARIED_SHARE * valid && negative >= VARIED_SHARE * valid) ||
                mixed >= MIXED_SHARE * valid;
    }
    if (winner.empty() && varied)
      winner = "varians";
    if (winner.empty()) {
      unsigned valid = 0, relevant = 0;
      for (auto [id, sample] : individuals) {
        (void)id;
        bool any = false;
        double maximum = 0;
        for (std::size_t a = channel * HORMONE_SIGNS; a < (channel + 1) * HORMONE_SIGNS; ++a)
          if (sample->learning_arms & (1u << a)) {
            any = true;
            maximum = std::max(maximum, sample->learning[a]);
          }
        valid += any;
        relevant += any && maximum >= MIN_LEARNING;
      }
      if (valid >= MIN_INDIVIDUALS && relevant >= AGREEMENT * valid)
        winner = "plasticum";
    }
    auto &n = names[channel];
    if (winner.empty() || winner == n.suffix) {
      n.candidate.clear();
      n.candidate_rounds = 0;
      continue;
    }
    if (winner == n.candidate)
      ++n.candidate_rounds;
    else {
      n.candidate = winner;
      n.candidate_rounds = 1;
    }
    if (n.suffix.empty() || n.candidate_rounds >= NAME_CONFIRMATION) {
      n.suffix = winner;
      n.changed = tick;
      n.candidate.clear();
      n.candidate_rounds = 0;
      HormoneName::Change change;
      change.tick = tick;
      change.suffix = winner;
      change.individuals = individuals.size();
      for (auto [id, s] : individuals) {
        (void)id;
        if (!change.start || s->tick < change.start)
          change.start = s->tick;
        change.end = std::max(change.end, s->tick);
        for (std::size_t a = 0; a < HORMONE_ARMS; ++a) {
          for (std::size_t o = 0; o < HORMONE_ORGANS; ++o)
            if ((s->arms & (1u << a)) && (s->organs & (1u << o))) {
              change.effects[a][o] += s->effects[a][o];
              ++change.counts[a][o];
            }
          if (s->learning_arms & (1u << a)) {
            change.learning[a] += s->learning[a];
            ++change.learning_counts[a];
          }
        }
      }
      n.history.push_back(change);
      while (n.history.size() > NAME_HISTORY)
        n.history.pop_front();
    }
  }
}
void HormoneName::Change::write(std::ostream &out) const {
  out << tick << ' ' << std::quoted(suffix) << ' ' << individuals << ' ' << start << ' ' << end
      << ' ';
  for (std::size_t a = 0; a < HORMONE_ARMS; ++a) {
    for (std::size_t o = 0; o < HORMONE_ORGANS; ++o)
      out << effects[a][o] << ' ' << counts[a][o] << ' ';
    out << learning[a] << ' ' << learning_counts[a] << ' ';
  }
  out << '\n';
}
void HormoneName::Change::read(std::istream &in) {
  state::value(in, tick);
  if (!(in >> std::quoted(suffix)) || suffix.size() > text_limit::name)
    throw std::runtime_error("invalid hormone history");
  state::value(in, individuals);
  state::value(in, start);
  state::value(in, end);
  for (std::size_t a = 0; a < HORMONE_ARMS; ++a) {
    for (std::size_t o = 0; o < HORMONE_ORGANS; ++o) {
      state::scalar(in, effects[a][o], -PLAUSIBLE_SUM, PLAUSIBLE_SUM);
      state::value(in, counts[a][o]);
    }
    state::scalar(in, learning[a], 0, PLAUSIBLE_SUM);
    state::value(in, learning_counts[a]);
  }
}
void HormoneProfile::write(std::ostream &out) const {
  lifetime.write(out);
  window.write(out);
  out << completed_round << ' ' << cursor << ' ' << investigations << ' ' << pending_round << '\n';
  for (const auto &n : names) {
    out << std::quoted(n.stem) << ' ' << std::quoted(n.suffix) << ' ' << std::quoted(n.candidate)
        << ' ' << n.origin << ' ' << n.paternal_origin << ' ' << n.changed << ' '
        << n.candidate_rounds << ' ' << n.history.size() << '\n';
    for (const auto &h : n.history)
      h.write(out);
  }
  out << samples.size() << '\n';
  for (const auto &s : samples)
    s.write(out);
  for (std::size_t a = 0; a < HORMONE_ARMS; ++a) {
    for (std::size_t o = 0; o < HORMONE_ORGANS; ++o)
      out << lifetime_effects[a][o] << ' ' << lifetime_effect_count[a][o] << ' ';
    out << lifetime_learning[a] << ' ' << lifetime_learning_count[a] << '\n';
  }
}
void HormoneProfile::read(std::istream &in) {
  using state::scalar;
  using state::value;
  lifetime.read(in);
  window.read(in);
  value(in, completed_round);
  value(in, cursor);
  value(in, investigations);
  value(in, pending_round);
  for (auto &n : names) {
    if (!(in >> std::quoted(n.stem) >> std::quoted(n.suffix) >> std::quoted(n.candidate)))
      throw std::runtime_error("invalid hormone name");
    if (n.stem.size() > text_limit::phrase || n.suffix.size() > text_limit::name ||
        n.candidate.size() > text_limit::name)
      throw std::runtime_error("invalid hormone name length");
    value(in, n.origin);
    value(in, n.paternal_origin);
    value(in, n.changed);
    value(in, n.candidate_rounds);
    n.history.clear();
    for (auto count = state::count(in, NAME_HISTORY); count; --count) {
      HormoneName::Change h;
      h.read(in);
      n.history.push_back(h);
    }
  }
  samples.clear();
  for (auto count = state::count(in, SAMPLE_MEMORY); count; --count) {
    HormoneInvestigation s;
    s.read(in);
    samples.push_back(s);
  }
  for (std::size_t a = 0; a < HORMONE_ARMS; ++a) {
    for (std::size_t o = 0; o < HORMONE_ORGANS; ++o) {
      scalar(in, lifetime_effects[a][o], -PLAUSIBLE_SUM, PLAUSIBLE_SUM);
      value(in, lifetime_effect_count[a][o]);
    }
    scalar(in, lifetime_learning[a], 0, PLAUSIBLE_SUM);
    value(in, lifetime_learning_count[a]);
  }
}
}
