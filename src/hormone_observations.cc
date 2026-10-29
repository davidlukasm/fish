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
  for (int k = 0; k < 4; ++k) {
    level[k] += v.level[k];
    square[k] += v.square[k];
    secretion[k] += v.secretion[k];
    binding[k] += v.binding[k];
    net[k] += v.net[k];
  }
  for (int c = 0; c < 4; ++c)
    for (int side = 0; side < 2; ++side) {
      contexts[c].count[side] += v.contexts[c].count[side];
      for (int k = 0; k < 4; ++k)
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
    for (int side = 0; side < 2; ++side) {
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
  scalar(in, work, 0, 1e24);
  scalar(in, learning_change, 0, 1e24);
  scalar(in, surprise, 0, 1e24);
  for (auto *a : {&level, &square, &secretion, &binding, &net})
    for (double &v : *a)
      scalar(in, v, a == &net ? -1e24 : 0, 1e24);
  for (auto &c : contexts)
    for (int side = 0; side < 2; ++side) {
      value(in, c.count[side]);
      for (double &v : c.level[side])
        scalar(in, v, 0, 1e24);
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
  if (organs >= (1u << HORMONE_ORGANS) || arms > 255 || learning_arms > 255)
    throw std::runtime_error("invalid hormone profile mask");
  for (auto &a : effects)
    for (double &v : a)
      state::scalar(in, v, -1e6, 1e6);
  for (double &v : learning)
    state::scalar(in, v, 0, 1e6);
  for (double &v : turn_magnitude)
    state::scalar(in, v, -1e6, 1e6);
}
void HormoneProfile::accept(const HormoneInvestigation &v) {
  samples.push_back(v);
  ++investigations;
  for (int arm = 0; arm < 8; ++arm) {
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
  while (samples.size() > 32)
    samples.pop_front();
}
namespace {
struct Function {
  int first, last;
  const char *positive, *negative;
};
constexpr Function functions[] = {{0, 0, "propulsivum", "frenans"},
                                  {3, 3, "rotatorium", "rotatorium inhibens"},
                                  {4, 4, "orale", "orale inhibens"},
                                  {5, 5, "mordax", "mordax inhibens"},
                                  {6, 6, "defensivum", "defensivum inhibens"},
                                  {7, 7, "ovipositivum", "ovipositivum inhibens"},
                                  {8, 8, "nebuliferum", "nebuliferum inhibens"},
                                  {9, 11, "chromaticum", "chromaticum"},
                                  {12, 14, "vesicale", "vesicale"},
                                  {15, 22, "glandulare", "glandulare"}};
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
    if (rounds.size() < 4 || rounds.count(i->round))
      rounds.insert(i->round);
  if (rounds.size() < 3)
    return;
  std::map<std::uint64_t, const HormoneInvestigation *> individuals;
  for (const auto &s : samples)
    if (rounds.count(s.round))
      individuals[s.individual] = &s;
  if (individuals.size() < 8)
    return;
  for (int channel = 0; channel < 4; ++channel) {
    std::string winner;
    double strongest = 0;
    bool varied = false;
    for (const auto &f : functions) {
      unsigned valid = 0, positive = 0, negative = 0, mixed = 0;
      std::vector<double> strengths[2];
      for (auto [id, sample] : individuals) {
        (void)id;
        std::array<double, 2> arms{};
        std::array<bool, 2> present{};
        for (int sign = 0; sign < 2; ++sign) {
          const int a = channel * 2 + sign;
          if (!(sample->arms & (1u << a)))
            continue;
          for (int o = f.first; o <= f.last; ++o)
            if (sample->organs & (1u << o)) {
              present[sign] = true;
              const double effect = o == 3 ? sample->turn_magnitude[a] : sample->effects[a][o];
              if (std::abs(effect) > std::abs(arms[sign]))
                arms[sign] = effect;
            }
        }
        if (!present[0] && !present[1])
          continue;
        ++valid;
        const bool a = present[0] && std::abs(arms[0]) >= .005,
                   b = present[1] && std::abs(arms[1]) >= .005;
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
      if (valid < 8)
        continue;
      for (int direction = 0; direction < 2; ++direction)
        if (4 * (direction ? negative : positive) >= 3 * valid) {
          const double strength = median(strengths[direction]);
          if (strength > strongest) {
            strongest = strength;
            winner = direction ? f.negative : f.positive;
          }
        }
      varied |= (4 * positive >= valid && 4 * negative >= valid) || 2 * mixed >= valid;
    }
    if (winner.empty() && varied)
      winner = "varians";
    if (winner.empty()) {
      unsigned valid = 0, relevant = 0;
      for (auto [id, sample] : individuals) {
        (void)id;
        bool any = false;
        double maximum = 0;
        for (int a = channel * 2; a < channel * 2 + 2; ++a)
          if (sample->learning_arms & (1u << a)) {
            any = true;
            maximum = std::max(maximum, sample->learning[a]);
          }
        valid += any;
        relevant += any && maximum >= .00001;
      }
      if (valid >= 8 && 4 * relevant >= 3 * valid)
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
    if (n.suffix.empty() || n.candidate_rounds >= 3) {
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
        for (int a = 0; a < 8; ++a) {
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
      while (n.history.size() > 8)
        n.history.pop_front();
    }
  }
}
std::string hormone_description(const std::string &suffix) {
  static const std::map<std::string, std::string> labels = {
      {"propulsivum", "antriebsfördernd"},
      {"frenans", "antriebsdämpfend"},
      {"rotatorium", "drehungsfördernd"},
      {"rotatorium inhibens", "drehungsdämpfend"},
      {"orale", "maulaktivierend"},
      {"mordax", "bissfördernd"},
      {"defensivum", "abwehrfördernd"},
      {"ovipositivum", "eiablagefördernd"},
      {"nebuliferum", "spermienabgabefördernd"},
      {"orale inhibens", "mauldämpfend"},
      {"mordax inhibens", "bissdämpfend"},
      {"defensivum inhibens", "abwehrdämpfend"},
      {"ovipositivum inhibens", "eiablagedämpfend"},
      {"nebuliferum inhibens", "spermienabgabedämpfend"},
      {"chromaticum", "pigmentwirksam"},
      {"vesicale", "schwimmblasenwirksam"},
      {"glandulare", "drüsenwirksam"},
      {"plasticum", "plastizitätswirksam"},
      {"varians", "wechselnde Wirkung"}};
  auto i = labels.find(suffix);
  return i == labels.end() ? "" : i->second;
}
void HormoneName::Change::write(std::ostream &out) const {
  out << tick << ' ' << std::quoted(suffix) << ' ' << individuals << ' ' << start << ' ' << end
      << ' ';
  for (int a = 0; a < 8; ++a) {
    for (std::size_t o = 0; o < HORMONE_ORGANS; ++o)
      out << effects[a][o] << ' ' << counts[a][o] << ' ';
    out << learning[a] << ' ' << learning_counts[a] << ' ';
  }
  out << '\n';
}
void HormoneName::Change::read(std::istream &in) {
  state::value(in, tick);
  if (!(in >> std::quoted(suffix)) || suffix.size() > 64)
    throw std::runtime_error("invalid hormone history");
  state::value(in, individuals);
  state::value(in, start);
  state::value(in, end);
  for (int a = 0; a < 8; ++a) {
    for (std::size_t o = 0; o < HORMONE_ORGANS; ++o) {
      state::scalar(in, effects[a][o], -1e24, 1e24);
      state::value(in, counts[a][o]);
    }
    state::scalar(in, learning[a], 0, 1e24);
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
  for (int a = 0; a < 8; ++a) {
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
    if (n.stem.size() > 128 || n.suffix.size() > 64 || n.candidate.size() > 64)
      throw std::runtime_error("invalid hormone name length");
    value(in, n.origin);
    value(in, n.paternal_origin);
    value(in, n.changed);
    value(in, n.candidate_rounds);
    n.history.clear();
    for (auto count = state::count(in, 8); count; --count) {
      HormoneName::Change h;
      h.read(in);
      n.history.push_back(h);
    }
  }
  samples.clear();
  for (auto count = state::count(in, 32); count; --count) {
    HormoneInvestigation s;
    s.read(in);
    samples.push_back(s);
  }
  for (int a = 0; a < 8; ++a) {
    for (std::size_t o = 0; o < HORMONE_ORGANS; ++o) {
      scalar(in, lifetime_effects[a][o], -1e24, 1e24);
      value(in, lifetime_effect_count[a][o]);
    }
    scalar(in, lifetime_learning[a], 0, 1e24);
    value(in, lifetime_learning_count[a]);
  }
}
}
