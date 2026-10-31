#include "hormone_view.hh"
#include "session_io.hh"
#include <ostream>
#include <algorithm>
#include <set>
#include <map>
namespace fishsim {
namespace {
template <class Range> void array(std::ostream &out, const Range &values, double divisor = 1) {
  out << '[';
  bool first = true;
  for (auto value : values) {
    if (!first)
      out << ',';
    first = false;
    out << value / divisor;
  }
  out << ']';
}
void names(std::ostream &out, const HormoneProfile *profile) {
  out << '[';
  for (int k = 0; k < 4; ++k) {
    if (k)
      out << ',';
    const HormoneName name = profile ? profile->names[k] : HormoneName{};
    out << "{\"stem\":"
        << json_quoted(name.stem.empty() ? ("H" + std::to_string(k + 1)) : name.stem)
        << ",\"suffix\":" << json_quoted(name.suffix) << ",\"origin\":" << name.origin
        << ",\"father\":" << name.paternal_origin << ",\"changed\":" << name.changed
        << ",\"history\":[";
    bool first = true;
    for (const auto &change : name.history) {
      if (!first)
        out << ',';
      first = false;
      out << '[' << change.tick << ',' << json_quoted(change.suffix)
          << ",{\"samples\":" << change.individuals << ",\"start\":" << change.start
          << ",\"end\":" << change.end << ",\"effects\":[";
      for (int a = 0; a < 8; ++a) {
        if (a)
          out << ',';
        out << '[';
        for (std::size_t o = 0; o < HORMONE_ORGANS; ++o) {
          if (o)
            out << ',';
          if (change.counts[a][o])
            out << change.effects[a][o] / change.counts[a][o];
          else
            out << "null";
        }
        out << ']';
      }
      out << "],\"learning\":[";
      for (int a = 0; a < 8; ++a) {
        if (a)
          out << ',';
        if (change.learning_counts[a])
          out << change.learning[a] / change.learning_counts[a];
        else
          out << "null";
      }
      out << "]}]";
    }
    out << "]}";
  }
  out << ']';
}
void moments(std::ostream &out, const HormoneMoments &v) {
  const double n = std::max<std::uint64_t>(1, v.steps);
  out << "{\"steps\":" << v.steps << ",\"levels\":";
  array(out, v.level, n);
  out << ",\"square\":";
  array(out, v.square, n);
  out << ",\"secretion\":";
  array(out, v.secretion, n);
  out << ",\"binding\":";
  array(out, v.binding, n);
  out << ",\"net\":";
  array(out, v.net, n);
  out << ",\"work\":" << v.work / n << ",\"learning\":" << v.learning_change / n
      << ",\"surprise\":" << v.surprise / std::max<std::uint64_t>(1, v.learning_cells)
      << ",\"contexts\":[";
  for (std::size_t c = 0; c < v.contexts.size(); ++c) {
    if (c)
      out << ',';
    const auto &context = v.contexts[c];
    out << "{\"count\":";
    array(out, context.count);
    out << ",\"levels\":[";
    for (int side = 0; side < 2; ++side) {
      if (side)
        out << ',';
      array(out, context.level[side], std::max<std::uint64_t>(1, context.count[side]));
    }
    out << "]}";
  }
  out << "]}";
}
}
void write_hormone_state(std::ostream &out, const HormoneState &state,
                         const HormoneProfile *profile) {
  out << "{\"names\":";
  names(out, profile);
  out << ",\"levels\":";
  array(out, state.levels());
  out << ",\"secretion\":";
  array(out, state.secretion());
  out << ",\"binding\":";
  array(out, state.binding());
  out << ",\"net\":";
  array(out, state.integrated());
  out << ",\"work\":" << state.work() << '}';
}
void write_hormone_profile(std::ostream &out, const HormoneProfile &p,
                           const HormoneMoments &current) {
  out << "{\"names\":";
  names(out, &p);
  out << ",\"current\":";
  moments(out, current);
  out << ",\"window\":";
  moments(out, p.window);
  out << ",\"lifetime\":";
  moments(out, p.lifetime);
  std::set<std::uint64_t> rounds;
  for (auto i = p.samples.rbegin(); i != p.samples.rend(); ++i)
    if (i->round <= p.completed_round && (rounds.size() < 4 || rounds.count(i->round)))
      rounds.insert(i->round);
  std::map<std::uint64_t, const HormoneInvestigation *> individuals;
  for (const auto &s : p.samples)
    if (rounds.count(s.round))
      individuals[s.individual] = &s;
  std::uint64_t start = 0, end = 0;
  for (auto [id, s] : individuals) {
    (void)id;
    if (!start || s->tick < start)
      start = s->tick;
    end = std::max(end, s->tick);
  }
  out << ",\"samples\":" << individuals.size() << ",\"total\":" << p.investigations
      << ",\"rounds\":" << rounds.size() << ",\"start\":" << start << ",\"end\":" << end
      << ",\"effects\":[";
  for (int arm = 0; arm < 8; ++arm) {
    if (arm)
      out << ',';
    out << '[';
    for (std::size_t organ = 0; organ < HORMONE_ORGANS; ++organ) {
      if (organ)
        out << ',';
      double sum = 0;
      unsigned count = 0;
      for (auto [id, s] : individuals)
        if ((s->arms & (1u << arm)) && (s->organs & (1u << organ))) {
          (void)id;
          sum += s->effects[arm][organ];
          ++count;
        }
      if (count)
        out << sum / count;
      else
        out << "null";
    }
    out << ']';
  }
  out << "],\"learning\":[";
  for (int arm = 0; arm < 8; ++arm) {
    if (arm)
      out << ',';
    double sum = 0;
    unsigned count = 0;
    for (auto [id, s] : individuals)
      if (s->learning_arms & (1u << arm)) {
        (void)id;
        sum += s->learning[arm];
        ++count;
      }
    if (count)
      out << sum / count;
    else if (p.lifetime_learning_count[arm])
      out << p.lifetime_learning[arm] / p.lifetime_learning_count[arm];
    else
      out << "null";
  }
  out << "],\"lifetime_effects\":[";
  for (int arm = 0; arm < 8; ++arm) {
    if (arm)
      out << ',';
    out << '[';
    for (std::size_t o = 0; o < HORMONE_ORGANS; ++o) {
      if (o)
        out << ',';
      if (p.lifetime_effect_count[arm][o])
        out << p.lifetime_effects[arm][o] / p.lifetime_effect_count[arm][o];
      else
        out << "null";
    }
    out << ']';
  }
  out << "]}";
}
}
