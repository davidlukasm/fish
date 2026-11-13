#pragma once
#include <cstdlib>
#include <map>
#include "cppn/cppn.hh"
#include "functions.hh"
#include "hormones.hh"
#include "dynamics.hh"
#include "cppn/program.hh"
#include <array>
#include <algorithm>
#include <functional>
#include <cstdint>
#include <limits>
#include <optional>
#include <iosfwd>
#include <cmath>
namespace field {
constexpr int ANATOMICAL_OUTPUTS = cppn::OUTPUTS;
// The body's growth receptor is read on the midline (side 0, where no cell lies) in the middle of
// the head zone, where glands and the blood sense sit.
inline constexpr cppn::Point GROWTH_RECEPTOR_SITE{1, .5f, .5f, .5f, 0, 0};
constexpr std::size_t DEVELOPMENT_QUERY_LIMIT = 300000;
struct CellParameters {
  float threshold = .5f, capacity = 1, quality1 = 0, quality2 = 0, quality_width = .25f,
        field_width = .3f, time_constant = .5f, learning_time = .5f, plasticity = .5f;
};
inline double time_constant_steps(const CellParameters &p) {
  return TIME_CONSTANT_MIN *
         std::pow(TIME_CONSTANT_SPAN, std::clamp(double(p.time_constant), 0., 1.));
}
// Steps a sense cell takes to get used to a lasting stimulus: from at once to hardly ever.
inline double adaptation_steps(const CellParameters &p) {
  return ADAPTATION_MIN * std::pow(ADAPTATION_SPAN, std::clamp(double(p.time_constant), 0., 1.));
}
// Steps a gland's substance stays in the blood once the gland falls silent: from at once to hardly
// ever, over the same span as getting used to a stimulus. Glands do not read their field width
// otherwise.
inline double residence_steps(const CellParameters &p) {
  return ADAPTATION_MIN * std::pow(ADAPTATION_SPAN, std::clamp(double(p.field_width), 0., 1.));
}
inline double learning_time_steps(const CellParameters &p) {
  return LEARNING_TIME_MIN *
         std::pow(LEARNING_TIME_SPAN, std::clamp(double(p.learning_time), 0., 1.));
}
inline constexpr int CONTACT_FIELDS = 4;
inline constexpr float SYNAPSE_UNIT = .1f, MAX_CONTACT_LIMIT = 1;
struct ReceptionField {
  std::array<float, 2> address{};
  float width = 0, expression = 0;
  bool operator==(const ReceptionField &o) const {
    return address == o.address && width == o.width && expression == o.expression;
  }
  bool operator!=(const ReceptionField &o) const { return !(*this == o); }
};
struct Neuron {
  std::uint64_t id;
  float x, y, bias;
  Role role;
  std::uint32_t group = 0;
  std::uint16_t slots = 0;
  bool functional = false;
  float z = 0;
  cppn::Point location{};
  float expression = 1, search_width = .5f, crossing = 0, range = .5f;
  int variant = 0;
  std::array<float, 5> identity{};
  std::array<float, 2> sender{}, receiver{};
  float electrical_limit = .5f, teaching_limit = .5f;
  HormoneReceptor development_receptor{{}, 1, 0, .05f, 0};
  std::array<ReceptionField, CONTACT_FIELDS - 1> reception{};
  float strength = 1;
  Functions functions{};
  CellParameters parameters{};
  std::array<HormoneReceptor, HORMONE_EFFECTS> hormone_receptors{};
};
inline double connection_length(const Neuron &a, const Neuron &b) {
  return std::sqrt(
      double((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) + (a.z - b.z) * (a.z - b.z)));
}
inline bool hormone_effect_present(Role role, int effect) {
  return effect == Output || effect == Death || role == Role::Nerve ||
         (role == Role::Effector && effect == Excitation);
}
inline bool hormone_effect_present(const Neuron &n, int effect) {
  return hormone_effect_present(n.role, effect) ||
         (effect == Excitation && n.role == Role::Sensor && n.functions.senses[Light] > 0);
}
using NeuronIndex = std::uint16_t;
// A synapse acts with one step of delay.
struct Edge {
  NeuronIndex source, target;
  float weight;
};
constexpr int IDENTITY_SIZE = 5;
int connection_kind(const Neuron &, const Neuron &);
struct Partner {
  std::uint32_t source;
  float p;
};
struct CellClass {
  float sign = 1, mode = 0, pace = 0, modulator = 0;
};
inline CellClass cell_class(const Neuron &n) {
  CellClass c;
  if (n.role != Role::Nerve)
    return c;
  float r = 0;
  for (float v : n.identity)
    r = std::max(r, std::abs(v));
  if (r == 0)
    return c;
  float q[4];
  for (int j = 0; j < 4; ++j)
    q[j] = std::clamp((n.identity[j + 1] / r + 1) * .5f, 0.f, 1.f);
  c.sign = q[0] >= .5f ? 1.f : -1.f;
  c.mode = 2 * q[1] - 1;
  c.pace = smooth(q[2], .7f, .9f);
  c.modulator = smooth(q[3], .7f, .9f);
  return c;
}
enum class ContactEffect { Electrical, Teaching };
inline bool teaching_source(const Neuron &source) {
  return source.role == Role::Nerve && cell_class(source).modulator > .5f;
}
inline ContactEffect contact_effect(const Neuron &source, const Neuron &target) {
  return target.role == Role::Nerve && teaching_source(source) ? ContactEffect::Teaching
                                                               : ContactEffect::Electrical;
}
inline float contact_limit(const Neuron &source, const Neuron &target) {
  const float strength = contact_effect(source, target) == ContactEffect::Teaching
                             ? target.teaching_limit
                             : target.electrical_limit;
  return cell_class(source).sign * strength;
}
constexpr std::size_t MAX_NODES = std::numeric_limits<std::uint16_t>::max(), MAX_EDGES = 1 << 26;
constexpr float MAX_BIAS_SCALE = 2;
constexpr double CELL_COPIES = 16;
constexpr int CELL_COPY_LIMIT = 16;
constexpr std::size_t DEVELOPMENT_OVERHEAD_PASSES = 32;
constexpr std::size_t DEVELOPMENT_WORK_LIMIT =
    DEVELOPMENT_QUERY_LIMIT + DEVELOPMENT_SITES * DEVELOPMENT_SITES + MAX_NODES * MAX_NODES +
    DEVELOPMENT_OVERHEAD_PASSES * (MAX_NODES + MAX_EDGES);

std::optional<Neuron> site_cell(const cppn::Point &, const std::array<float, cppn::OUTPUTS> &,
                                std::uint64_t id, float bias_scale);
struct ZoneSpan {
  double front, extent;
};
std::array<ZoneSpan, cppn::input::zones> zone_spans(const std::vector<Neuron> &);
void lay_out_cells(std::vector<Neuron> &);
struct CellTraits;
std::vector<Neuron> cell_copies(const std::vector<Neuron> &groups, std::size_t limit,
                                std::vector<std::vector<NeuronIndex>> &copies, bool &limited,
                                const std::vector<CellTraits> *traits = nullptr,
                                std::uint64_t seed = 0, float bias_scale = 0);
struct Options {
  float bias_scale = .3f;
  bool reference_development = false;
  std::size_t max_nodes = 8192, max_edges = 65536;
  void validate() const;
};
struct NetworkTopology;
class Substrate {
  cppn::CPPN *combined;
  std::shared_ptr<cppn::Program> program;
  struct GridState;
  struct GridDevelopment;
  std::shared_ptr<GridState> grid_state;
  struct FinishState;
  std::shared_ptr<FinishState> finish_state;
  std::size_t pair_checks_ = 0, overhead_work_ = 0, query_work_ = 0;
  bool advance_grid(std::size_t, bool record_work);
  bool finish_development(std::size_t &budget);

public:
  mutable std::shared_ptr<const NetworkTopology> network_layout;
  Options options;
  std::vector<Neuron> neurons;
  std::vector<Edge> edges;
  std::size_t queries = 0;
  double built_length = 0;
  std::size_t recurrent_edges = 0;
  bool resource_limited = false;
  std::string diagnostic;
  std::uint64_t development_seed = 0, variation_seed = 0;
  std::vector<std::uint32_t> partner_offset;
  std::vector<Partner> partners;
  std::function<void(Substrate &)> geometry_builder;
  bool geometry_ready = false;
  double body_length = 2;
  std::array<std::array<double, PLAN_POINTS>, body_plan_part::count> body_plans{};
  std::array<double, body_metric::count> body_geometry{};
  std::array<std::array<double, 2>, 7> burial_points{};
  std::array<std::array<double, 2>, 2> eye_positions{};
  HormoneReceptor growth_receptor{};
  explicit Substrate(cppn::CPPN &, Options = {});
  explicit Substrate(std::vector<Neuron> planned, Options = {});
  bool advance_development(std::size_t query_budget, bool record_work = true);
  std::size_t development_work() const { return query_work_ + pair_checks_ + overhead_work_; }
  void abort_development(const std::string &reason);
  bool pending_preparation() const;
  bool pending_finalization() const;
  bool connections_pending() const;
  std::size_t remaining_queries(std::size_t estimate) const;
};
struct WiringAmount {
  std::size_t contacts = 0;
  double length = 0;
};
// A sense cell's spontaneous activity: it fires now and then on its own and pulls its nearest
// neighbours of the same sense along, so waves run over the organ. Before hatching this is all a
// sense cell can teach the brain with, and the brain grows its contacts on it; after hatching it
// fades over the cell's own time (`tau`), as the world takes its place.
struct WaveCell {
  NeuronIndex neuron;
  std::array<std::uint32_t, wave_dynamics::neighbors> neighbors{};
  unsigned count = 0;
  float position = 0, transverse = 0, excitability = 0;
  double activity_decay = 0, recovery_decay = 0, tau = 1;
};
class Network {
  std::shared_ptr<const Substrate> tissue;
  std::shared_ptr<const NetworkTopology> topology;
  struct Row {
    std::uint32_t offset = 0;
    std::uint16_t capacity = 0, count = 0, extent = 0;
  };
  std::vector<Row> rows_;
  std::vector<float> state_, next_, signal_, pulse_, organ_output_;
  std::vector<float> wave_activity_, wave_recovery_, wave_next_;
  std::vector<WaveCell> waves_;
  std::vector<float> synaptic_mean_, usual_, deviation_, own_mean_, action_mean_, teach_mean_,
      contrast_, cell_surprise_, progress_;
  std::vector<std::uint32_t> age_;
  std::vector<unsigned char> muted_, dead_, born_;
  std::vector<NeuronIndex> active_, active_nerves_, active_effectors_, active_sensors_;
  std::vector<std::size_t> ready_;
  std::vector<std::uint16_t> index_, owner_, trial_steps_left_;
  std::vector<float> weight_, trace_, predict_, usage_, consolidation_;
  std::map<std::size_t, std::vector<std::uint32_t>> free_rows_;
  std::vector<std::uint32_t> proposal_queue_;
  std::size_t proposal_cursor_ = 0;
  struct Stimulus {
    std::size_t neuron;
    unsigned remaining;
  };
  std::vector<Stimulus> stimuli_;
  std::size_t dead_count_ = 0;
  std::uint64_t neural_ticks_ = 0, wave_rng_ = 0, turnover_rng_ = 0, revision_ = 0,
                tissue_revision_ = 0, organ_revision_ = 0, development_ticks_ = 0,
                learning_seed = 0;
  double hatch_steps_ = std::numeric_limits<double>::infinity();
  bool wave_seeded_ = false, developing_ = false, diagnostic_ = false, observe = false,
       plasticity_enabled = true;
  double maturity_ = 0, reserve_ = 0, fatigue_ = 0, growth_credit_ = 0;
  double build_budget_ = std::numeric_limits<double>::infinity(), build_scale_ = 1;
  Hormones active_hormones_{};
  std::array<std::vector<float>, HORMONE_EFFECTS> hormone_effect_;
  std::vector<float> observed_contributions;
  WiringAmount wiring_, formed_;
  bool inactive(std::size_t i) const { return !born_[i] || muted_[i] || dead_[i]; }
  void materialize() const;
  void prepare_state();
  void activate(std::size_t);
  void die(std::size_t);
  void refresh_active();
  void apply_hormones(const Hormones &);
  double contact_length(NeuronIndex, NeuronIndex) const;
  void erase_contact(std::size_t);
  bool insert_contact(NeuronIndex, NeuronIndex);
  void advance(const std::vector<float> &, const Hormones &, std::uint64_t);
  void advance_waves(std::uint64_t);
  void form_synapse(NeuronIndex);
  double turnover_unit();
  void read_runtime_state(std::istream &);

public:
  enum class CellLife { Precursor, Active, Dead };
  struct LearningSummary {
    double change = 0, surprise = 0, decay = 0;
    std::uint64_t work = 0, cells = 0;
  };
  struct ActorPreview {
    std::vector<float> increments;
    std::uint64_t work = 0;
    bool ready = false;
  };
  struct Synapse {
    std::uint32_t slot;
    NeuronIndex source, target;
    float weight, limit, consolidation;
  };
  struct WaveState {
    NeuronIndex neuron;
    float position, transverse, activity, recovery;
  };

private:
  LearningSummary learning_summary_;

public:
  explicit Network(std::shared_ptr<const Substrate>, bool developing = false);
  explicit Network(const Substrate &s) : Network(std::make_shared<const Substrate>(s)) {}
  double grow(const Hormones &, double maturity, double reserve, double fatigue,
              double available_energy, double cost_scale = 1);
  void construction_budget(double available, double scale) {
    build_budget_ = std::max(0., available);
    build_scale_ = scale;
  }
  CellLife life(std::size_t i) const {
    return dead_.at(i) ? CellLife::Dead : born_.at(i) ? CellLife::Active : CellLife::Precursor;
  }
  float development_progress(std::size_t i) const { return progress_.at(i); }
  std::size_t active_count() const { return active_.size(); }
  std::uint64_t cell_revision() const { return tissue_revision_; }
  std::uint64_t organ_revision() const { return organ_revision_; }
  std::size_t reserved_slots() const;
  void reset();
  void reset_learning();
  void mute(std::size_t, bool value = true);
  bool muted(std::size_t i) const { return inactive(i); }
  bool dead(std::size_t i) const { return dead_.at(i) != 0; }
  std::size_t dead_count() const { return dead_count_; }
  const std::vector<unsigned char> &dead_cells() const { return dead_; }
  float synaptic_mean(std::size_t i) const { return synaptic_mean_.at(i); }
  static constexpr unsigned max_stimulus_steps = 10000;
  void stimulate(std::size_t, float, unsigned steps = 1);
  void stimulate(const std::vector<std::size_t> &, float, unsigned steps = 1);
  void clear_stimuli();
  void step(const std::vector<float> &values) { advance(values, active_hormones_, learning_seed); }
  void step(const std::vector<float> &values, const Hormones &h, std::uint64_t individual) {
    advance(values, h, individual);
  }
  const Substrate &blueprint() const { return *tissue; }
  const std::vector<float> &state() const { return state_; }
  const std::vector<float> &organ_output() const { return organ_output_; }
  float signal(std::size_t i) const { return signal_.at(i); }
  std::vector<Synapse> synapses() const;
  std::uint64_t wiring_revision() const { return revision_; }
  std::size_t slot_count() const { return index_.size(); }
  std::size_t synapse_count() const { return wiring_.contacts; }
  const WiringAmount &wiring() const { return wiring_; }
  const WiringAmount &formed_wiring() const { return formed_; }
  std::uint64_t learning_steps() const { return neural_ticks_; }
  std::vector<WaveState> wave_state() const;
  std::size_t learning_neurons() const;
  std::size_t learned_connections() const;
  double learned_change() const;
  std::size_t runtime_bytes() const;
  void write_runtime(std::ostream &) const;
  void read_runtime(std::istream &);
  const LearningSummary &learning_summary() const { return learning_summary_; }
  float surprise(std::size_t i) const { return cell_surprise_.at(i); }
  float learning_contrast(std::size_t i) const { return contrast_.at(i); }
  float contribution(std::size_t k) const {
    return k < observed_contributions.size() ? observed_contributions[k] : 0;
  }
  bool has_contributions() const { return !observed_contributions.empty(); }
  void observe_connections(bool on) {
    observe = on;
    if (!on)
      observed_contributions.clear();
  }
  void refresh_observation();
  void set_body_levels(double maturity, double reserve, double fatigue);
  // Steps since hatching; negative inside the egg. Sense cells' spontaneous waves run in the egg
  // and fade over each cell's time after it.
  void set_hatch_steps(double steps) { hatch_steps_ = steps; }
  double maturity() const { return maturity_; }
  void set_plasticity(bool on);
  bool plasticity() const { return plasticity_enabled; }
  Network frozen_probe() const;
  Network ablated_probe() const;
  ActorPreview actor_preview(const std::vector<float> &, const Hormones &) const;
  std::uint64_t work_bound() const;
};
const char *role_name(Role);
}
