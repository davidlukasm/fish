#include "hormone_analysis.hh"
#include "body_plan.hh"
#include "ecology.hh"
#include "state_validation.hh"
#include <algorithm>
#include <cmath>
#include <map>
#include <set>
#include <istream>
#include <ostream>
namespace fishsim {
std::uint64_t HormoneAnalysis::requested() const {
  return !active() && !rounds.empty() && !rounds.front().individuals.empty()
             ? rounds.front().individuals.front()
             : 0;
}
void HormoneAnalysis::capture(const Individual &p, std::uint64_t tick) {
  if (p.id != requested() || !p.body.brain() || !p.genome.interface)
    return;
  genome_ = p.genome;
  snapshot_ = *p.body.brain();
  snapshot_->observe_connections(false);
  inputs_ = p.body.perception().sensor_buffer;
  levels_ = p.body.hormones().levels();
  hormone_enabled_ = !p.body.perception().disabled_senses[10];
  result_ = {};
  result_.individual = p.id;
  result_.species = p.species;
  result_.tick = tick;
  result_.round = rounds.front().number;
  arm_ = step_ = 0;
  baseline_ready_ = false;
  baseline_update_.clear();
  prepare_variant();
}
void HormoneAnalysis::prepare_variant() {
  auto levels = levels_;
  change_ = 0;
  if (arm_) {
    const int k = (arm_ - 1) / 2;
    levels[k] = std::clamp(levels[k] + (arm_ % 2 ? .01 : -.01), 0., 1.);
    change_ = levels[k] - levels_[k];
  }
  variant_ = *snapshot_;
  variant_->set_plasticity(false);
  variant_inputs_ = inputs_;
  for (std::size_t i = 0; i < genome_.interface->sensory.size(); ++i) {
    const auto &r = genome_.interface->sensory[i];
    if (hormone_enabled_ && r.dominant_sense() == 10) {
      double stimulus = 0;
      for (int k = 0; k < 4; ++k)
        stimulus += r.hormones[k] * levels[k];
      variant_inputs_[i] = float(r.senses[10] * stimulus / (stimulus + r.response_threshold));
    }
  }
  step_ = 0;
  sum_ = {};
  preview_done_ = false;
}
void HormoneAnalysis::fund(std::uint64_t regular, std::uint64_t maximum) {
  regular_work += regular;
  const double limit = active() ? 297. * snapshot_->work_bound() : double(maximum);
  credit = std::min(limit, credit + .01 * regular);
}
std::optional<HormoneInvestigation> HormoneAnalysis::advance() {
  if (!active())
    return {};
  std::uint64_t packet = 0;
  while (active() && packet < 65536) {
    if (arm_ && change_ == 0) {
      if (++arm_ == 9)
        break;
      prepare_variant();
      continue;
    }
    const auto bound = snapshot_->work_bound();
    if (credit < bound)
      return {};
    std::uint64_t spent = 0;
    if (!preview_done_) {
      auto levels = levels_;
      if (arm_)
        levels[(arm_ - 1) / 2] += change_;
      const auto preview = snapshot_->actor_preview(variant_inputs_, levels);
      spent = preview.work;
      if (!arm_) {
        baseline_update_ = preview.increments;
        baseline_ready_ = preview.ready;
      } else if (baseline_ready_ && preview.ready) {
        if (preview.increments.size() != baseline_update_.size())
          throw std::logic_error("hormone analysis topology changed");
        double square = 0;
        for (std::size_t i = 0; i < baseline_update_.size(); ++i) {
          const double d = double(preview.increments[i]) - baseline_update_[i];
          square += d * d;
        }
        result_.learning[arm_ - 1] =
            baseline_update_.empty()
                ? 0
                : .01 / std::abs(change_) * std::sqrt(square / baseline_update_.size());
        result_.learning_arms |= 1u << (arm_ - 1);
      }
      preview_done_ = true;
    } else {
      auto levels = levels_;
      if (arm_)
        levels[(arm_ - 1) / 2] += change_;
      variant_->step(variant_inputs_, levels, result_.individual);
      spent = variant_->learning_summary().work;
      if (++step_ > 16) {
        const auto drive = continuous_organs(variant_->state(), *genome_.interface);
        result_.organs = drive.present;
        for (std::size_t o = 0; o < HORMONE_ORGANS; ++o)
          sum_[o] += drive.values[o] / 16;
      }
      if (step_ == 32) {
        if (!arm_)
          baseline_ = sum_;
        else {
          for (std::size_t o = 0; o < HORMONE_ORGANS; ++o)
            result_.effects[arm_ - 1][o] = .01 * (sum_[o] - baseline_[o]) / change_;
          result_.turn_magnitude[arm_ - 1] =
              .01 * (std::abs(sum_[3]) - std::abs(baseline_[3])) / change_;
          result_.arms |= 1u << (arm_ - 1);
        }
        ++arm_;
        if (arm_ < 9)
          prepare_variant();
      }
    }
    credit -= spent;
    work += spent;
    packet += spent;
    if (arm_ == 9)
      break;
  }
  if (arm_ < 9)
    return {};
  auto result = result_;
  snapshot_.reset();
  variant_.reset();
  genome_ = {};
  inputs_.clear();
  variant_inputs_.clear();
  baseline_update_.clear();
  return result;
}
void HormoneAnalysis::write(std::ostream &out) const {
  out << "HORMONE_ANALYSIS_018B " << credit << ' ' << work << ' ' << regular_work << ' '
      << rounds.size() << '\n';
  for (const auto &r : rounds) {
    out << r.species << ' ' << r.number << ' ' << r.individuals.size();
    for (auto id : r.individuals)
      out << ' ' << id;
    out << '\n';
  }
  out << active() << '\n';
  if (!active())
    return;
  genome_.write(out);
  snapshot_->write_runtime(out);
  variant_->write_runtime(out);
  result_.write(out);
  out << arm_ << ' ' << step_ << ' ' << preview_done_ << ' ' << baseline_ready_ << ' '
      << hormone_enabled_ << ' ' << change_;
  for (auto v : levels_)
    out << ' ' << v;
  out << '\n';
  for (const auto *v : {&inputs_, &variant_inputs_, &baseline_update_}) {
    out << v->size();
    for (auto x : *v)
      out << ' ' << x;
    out << '\n';
  }
  for (const auto *v : {&baseline_, &sum_}) {
    for (auto x : *v)
      out << x << ' ';
    out << '\n';
  }
}
void HormoneAnalysis::read(std::istream &in) {
  using state::scalar;
  using state::value;
  *this = {};
  std::string tag;
  value(in, tag);
  if (tag != "HORMONE_ANALYSIS_018B")
    throw std::runtime_error("invalid hormone analysis");
  scalar(in, credit, 0, 1e12);
  value(in, work);
  value(in, regular_work);
  for (auto n = state::count(in, 4096); n; --n) {
    Round r;
    value(in, r.species);
    value(in, r.number);
    for (auto count = state::count(in, 3); count; --count) {
      std::uint64_t id;
      value(in, id);
      r.individuals.push_back(id);
    }
    rounds.push_back(std::move(r));
  }
  bool saved;
  value(in, saved);
  if (!saved)
    return;
  if (rounds.empty() || rounds.front().individuals.empty())
    throw std::runtime_error("orphan hormone snapshot");
  genome_ = Genome::read(in);
  snapshot_.emplace(genome_.blueprint);
  variant_.emplace(genome_.blueprint);
  snapshot_->read_runtime(in);
  variant_->read_runtime(in);
  result_.read(in);
  value(in, arm_);
  value(in, step_);
  value(in, preview_done_);
  value(in, baseline_ready_);
  value(in, hormone_enabled_);
  scalar(in, change_, -.011, .011);
  for (auto &v : levels_)
    scalar(in, v, 0, 1);
  if (arm_ < 0 || arm_ > 8 || step_ < 0 || step_ > 31 ||
      result_.individual != rounds.front().individuals.front() ||
      result_.species != rounds.front().species || result_.round != rounds.front().number)
    throw std::runtime_error("invalid hormone analysis progress");
  for (auto *v : {&inputs_, &variant_inputs_, &baseline_update_}) {
    v->resize(state::count(in, 65536));
    for (auto &x : *v) {
      double d;
      scalar(in, d, -24, 24);
      x = float(d);
    }
  }
  if (inputs_.size() != genome_.interface->sensory.size() ||
      inputs_.size() != variant_inputs_.size())
    throw std::runtime_error("invalid hormone analysis inputs");
  for (auto *v : {&baseline_, &sum_})
    for (auto &x : *v)
      scalar(in, x, -1e6, 1e6);
}
void Ecosystem::prepare_hormone_analysis() {
  if ((!ticks || ticks % 4096) && (hormone_analysis_.active() || hormone_analysis_.rounds.empty()))
    return;
  std::map<std::uint64_t, std::vector<std::uint64_t>> living;
  for (const auto &p : fish)
    if (p.body.alive && p.body.hatched && p.body.brain())
      living[p.species].push_back(p.id);
  auto finish = [&](const HormoneAnalysis::Round &r) {
    if (auto *s = taxonomy_.find(r.species)) {
      const auto old = s->hormones.names;
      s->hormones.finish_round(r.number, ticks);
      taxonomy_.name_hormones(*s);
      for (int k = 0; k < 4; ++k)
        if (old[k].suffix != s->hormones.names[k].suffix)
          taxonomy_.milestones.push_back(
              {ticks, s->id, "hormone-" + std::to_string(k),
               s->hormones.names[k].stem + " " + s->hormones.names[k].suffix, ""});
    }
  };
  if (!hormone_analysis_.active()) {
    while (!hormone_analysis_.rounds.empty()) {
      auto &r = hormone_analysis_.rounds.front();
      auto &ids = living[r.species];
      while (!r.individuals.empty() &&
             std::find(ids.begin(), ids.end(), r.individuals.front()) == ids.end())
        r.individuals.pop_front();
      if (!r.individuals.empty())
        break;
      finish(r);
      hormone_analysis_.rounds.pop_front();
    }
  }
  if (!ticks || ticks % 4096)
    return;
  for (auto &s : taxonomy_.species) {
    auto it = living.find(s.id);
    if (it == living.end()) {
      if (!s.hormones.pending_round)
        s.hormones.samples.clear();
      continue;
    }
    if (!s.confirmed || s.hormones.pending_round)
      continue;
    auto &ids = it->second;
    std::sort(ids.begin(), ids.end());
    HormoneAnalysis::Round r;
    r.species = s.id;
    r.number = ticks / 4096;
    auto first = std::upper_bound(ids.begin(), ids.end(), s.hormones.cursor);
    std::size_t start = std::size_t(first - ids.begin()) % ids.size();
    for (std::size_t j = 0; j < std::min<std::size_t>(3, ids.size()); ++j)
      r.individuals.push_back(ids[(start + j) % ids.size()]);
    s.hormones.cursor = r.individuals.back();
    s.hormones.pending_round = r.number;
    hormone_analysis_.rounds.push_back(std::move(r));
  }
}
void Ecosystem::advance_hormone_analysis() {
  std::uint64_t work = 0, maximum = 0;
  for (const auto &p : fish)
    if (p.observations().neural_sampled && p.body.brain()) {
      work += p.body.brain()->learning_summary().work;
      maximum = std::max(maximum, 297 * p.body.brain()->work_bound());
    }
  hormone_analysis_.fund(work, maximum);
  if (auto result = hormone_analysis_.advance()) {
    if (auto *s = taxonomy_.find(result->species))
      s->hormones.accept(*result);
    auto r = std::move(hormone_analysis_.rounds.front());
    hormone_analysis_.rounds.pop_front();
    r.individuals.pop_front();
    // An empty round is finalized at the next observation barrier.
    hormone_analysis_.rounds.push_back(std::move(r));
  }
}
}
