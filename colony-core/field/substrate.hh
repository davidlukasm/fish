#pragma once
#include <cstdlib>
#include "cppn/cppn.hh"
#include "functions.hh"
#include "hormones.hh"
#include "cppn/program.hh"
#include <array>
#include <algorithm>
#include <functional>
#include <cstdint>
#include <iosfwd>
#include <cmath>
namespace field {
constexpr int ANATOMICAL_OUTPUTS = cppn::OUTPUTS;
constexpr std::size_t DEVELOPMENT_QUERY_LIMIT = 300000;
constexpr std::size_t DEVELOPMENT_SITES = 360;
constexpr std::size_t DEVELOPMENT_WORK_LIMIT =
    DEVELOPMENT_QUERY_LIMIT + DEVELOPMENT_SITES * DEVELOPMENT_SITES;
// Cell parameters from the cell query (cppn/output_schema.hh), meaning by role:
// threshold     sensor: response threshold; nerve, effector: bias (resting activity)
// capacity      sensory and nerve group: number of cells; effector: organ size
// quality1/2    sensor: hue / opponency, scent identity; hormone queries: identity coordinates;
//               organ: colour, gland kind
// quality_width sensor: tuning width; organ: colour width
// field_width   sensor: receptive field width
// time_constant nerve: tau = 4 x 12^t steps (trace tau / 2, pacemaker period max(8, tau));
//               smell/lateral receptor: adaptation; effector: organ recovery over tau steps
// dendrites     nerve: input slots 4 x 128^d
// plasticity    nerve: learning gain (0: does not learn)
struct CellParameters {
  float threshold = .5f, capacity = 1, quality1 = 0, quality2 = 0, quality_width = .25f,
        field_width = .3f, time_constant = .5f, dendrites = .5f, plasticity = .5f;
};
inline double time_constant_steps(const CellParameters &p) {
  return 4 * std::pow(12., std::clamp(double(p.time_constant), 0., 1.));
}
// Cells share their fixed zonal site and inherited parameters. IDs retain the site and copy index.
struct Neuron {
  std::uint64_t id;
  float x, y, bias;
  Role role;
  std::uint32_t group = 0;
  std::uint16_t slots = 0; // slots: input places (nerve cells and effectors)
  bool functional = false;
  float z = 0;
  cppn::Point location{};
  float expression = 1, search_width = .5f, crossing = 0, range = .5f;
  int variant = 0;
  std::array<float, 5> identity{};
  std::array<float, 2> sender{}, receiver{};
  float strength = 1;
  Functions functions{};
  CellParameters parameters{};
  std::array<HormoneReceptor, HORMONE_EFFECTS> hormone_receptors{};
  float role_margin = 1, role_gain = 1;
};
inline float expression_strength(float band, float threshold) {
  return std::clamp((band - threshold) / std::max(.25f * threshold, 1e-9f), 0.f, 1.f);
}
using NeuronIndex = std::uint16_t;
// A synapse acts with one step of delay.
struct Edge {
  NeuronIndex source, target;
  float weight;
};
// Permitted connections: 0 sense -> nerve, 1 nerve ->
// nerve, 2 nerve -> effector; -1: no connection possible (senses only send, effectors only
// receive).
constexpr int CONNECTION_KINDS = 3, IDENTITY_SIZE = 5;
int connection_kind(const Neuron &, const Neuron &);
// A possible partner group of a group (kept from development for the formation of new synapses):
// its binding probability p and binding strength.
struct Partner {
  std::uint32_t source;
  float p, strength;
};
// Classes of nerve cells from their identity values 1..4: transmitter sign (Dale), plasticity
// mode (competition > 0, cancellation < 0), intrinsic rhythm (pacemaker) and modulatory output
// (teaches its targets instead of driving them).
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
struct Options {
  float bias_scale = .3f;
  bool reference_development = false, stop_at_resource_limit = false;
  std::size_t max_nodes = 8192, max_edges = 65536;
  int workers = 1;
  void validate() const;
};
struct NetworkTopology;
class Substrate {
  cppn::CPPN *combined;
  std::shared_ptr<const cppn::Program> program;
  struct GridState;
  struct GridDevelopment;
  std::shared_ptr<GridState> grid_state;
  std::size_t pair_checks_ = 0;
  bool advance_grid(std::size_t, bool record_work);
  void limit_development(const char *reason);
  void finish_development();
  void prepare_network();

public:
  mutable std::shared_ptr<const NetworkTopology> network_layout;
  Options options;
  std::vector<Neuron> neurons;
  std::vector<Edge> edges;
  std::size_t queries = 0;
  std::size_t built_neurons = 0, built_edges = 0;
  double built_length = 0;
  std::size_t recurrent_edges = 0;
  bool resource_limited = false;
  std::string diagnostic;
  // From the genome: development seeds (structural draws, individual variation).
  std::uint64_t development_seed = 0, variation_seed = 0;
  // possible partner groups per target group (offsets into partners; groups as Neuron::group)
  std::vector<std::uint32_t> partner_offset;
  std::vector<Partner> partners;
  std::function<void(Substrate &)> geometry_builder;
  bool geometry_ready = false;
  double body_length = 2;
  std::array<std::array<double, 5>, 4> body_plans{};
  std::array<double, 12> body_geometry{};
  std::array<std::array<double, 2>, 7> burial_points{};
  std::array<std::array<double, 2>, 2> eye_positions{};
  explicit Substrate(cppn::CPPN &, Options = {});
  bool advance_development(std::size_t query_budget, bool record_work = true);
  std::size_t development_work() const { return queries + pair_checks_; }
  void abort_development(const std::string &reason);
  bool pending_finalization() const;
  bool connections_pending() const;
  bool anatomy_complete() const;
  bool cell_parameters_complete() const;
  std::size_t remaining_queries(std::size_t estimate) const;
};
// The brain at work: activity, learning, rebuilding, development state. Synapses live in slots:
// the cells that learn (nerve cells, effectors) are laid out in slices of 8 cells (one per vector
// lane) with as many slots as their largest cell can hold (its input places). Every network owns
// the source and the strength at formation of each slot: synapses vanish and form during life.
class Network {
  std::shared_ptr<const Substrate> tissue;
  std::shared_ptr<const NetworkTopology> topology;
  void materialize() const;
  std::size_t cells() const { return state_.size(); }
  // activity of every cell; the signals of the last step (activity of the step before, sensory
  // input) with a zero signal at the end; a one-step stimulus pulse per sensory cell
  std::vector<float> state_, next_, signal_, pulse_;
  std::vector<unsigned char> muted_, dead_;
  std::size_t dead_count_ = 0;
  std::vector<float> synaptic_mean_, adaptation_rate_;
  void remove_dead_connections();
  bool inactive(std::size_t i) const { return muted_[i] || dead_[i]; }
  // per slot: source (the zero signal when free), strength at formation, learned change,
  // eligibility trace and prediction value (valuation)
  std::vector<std::uint16_t> index_;
  std::vector<float> gene_, learned_, trace_, predict_;
  // usual level of every signal and its current deviation (zero signal at the end)
  std::vector<float> usual_, deviation_, gathered_;
  // per learning lane (nerve cells): usual action, usual teaching signal, usual own reaction, the
  // last surprise (valuation) and post deviation, readiness, the pending weight step and the
  // resource; per effector lane: usual activity and resource; per cell: the surprise of its last
  // learning step (teaches its synapses onto effectors)
  std::vector<float> lane_action_, lane_teach_, lane_own_, lane_value_, lane_contrast_, lane_ready_,
      lane_step_, lane_pending_, lane_innate_, effector_own_, effector_innate_, cell_surprise_;
  // occupied slots per lane (learning lanes, then effector lanes)
  std::vector<std::uint16_t> lane_count_;
  std::uint64_t revision_ = 0, turnover_rng_ = 0;
  double maturity_ = 0;
  Hormones active_hormones_{};
  std::array<std::vector<float>, HORMONE_EFFECTS> hormone_effect_;
  std::vector<float> observed_contributions;
  bool observe = false, plasticity_enabled = true;
  std::uint64_t learning_seed = 0, learning_ticks = 0;
  void prepare_state();
  void advance(const std::vector<float> &, const Hormones *, std::uint64_t);
  void learn_effectors(float rm);
  template <class Would> bool form_synapse(std::size_t lane, bool effector, const Would &would);
  double turnover_unit();
  // the learned weights with the pending step of the last learning step applied (the kernel
  // applies it in the next step's forward pass); computed on demand for readers
  mutable std::vector<float> settled_;
  mutable bool settled_ready_ = false;
  const std::vector<float> &settled() const;

public:
  struct LearningSummary {
    double change = 0, surprise = 0;
    std::uint64_t work = 0, cells = 0;
  };

private:
  LearningSummary learning_summary_;

public:
  struct ActorPreview {
    std::vector<float> increments;
    std::uint64_t work = 0;
    bool ready = false;
  };
  // a synapse in its slot: source, target, current strength and strength at formation
  struct Synapse {
    std::uint32_t slot;
    NeuronIndex source, target;
    float weight, formed;
  };
  ActorPreview actor_preview(const std::vector<float> &, const Hormones &) const;
  std::uint64_t work_bound() const;
  const LearningSummary &learning_summary() const { return learning_summary_; }
  // the surprise of the cell's last learning step and its post deviation (0 for other cells)
  float surprise(std::size_t cell) const;
  float learning_contrast(std::size_t cell) const;
  explicit Network(std::shared_ptr<const Substrate>);
  explicit Network(const Substrate &s) : Network(std::make_shared<const Substrate>(s)) {}
  void reset();
  void reset_learning();
  void mute(std::size_t neuron, bool value = true);
  void refresh_observation();
  void stimulate(std::size_t neuron, float amount);
  void stimulate(const std::vector<std::size_t> &neurons, float amount);
  bool muted(std::size_t neuron) const { return inactive(neuron); }
  bool dead(std::size_t neuron) const { return dead_.at(neuron) != 0; }
  std::size_t dead_count() const { return dead_count_; }
  const std::vector<unsigned char> &dead_cells() const { return dead_; }
  float synaptic_mean(std::size_t i) const { return synaptic_mean_.at(i); }
  // Diagnostic step with retained hormones (no learning), or explicit concentrations (learning).
  void step(const std::vector<float> &sensor_values);
  void step(const std::vector<float> &sensor_values, const Hormones &modulators,
            std::uint64_t individual);
  const Substrate &blueprint() const { return *tissue; }
  const std::vector<float> &state() const { return state_; }
  float signal(std::size_t i) const { return signal_.at(i); }
  // the current synapses; the revision changes whenever one vanishes or forms
  std::vector<Synapse> synapses() const;
  std::uint64_t wiring_revision() const { return revision_; }
  std::size_t slot_count() const;
  std::size_t synapse_count() const;
  std::uint64_t learning_steps() const { return learning_ticks; }
  std::size_t learning_neurons() const;
  std::size_t learned_connections() const;
  double learned_change() const;
  std::size_t runtime_bytes() const;
  void write_runtime(std::ostream &) const;
  void read_runtime(std::istream &);
  // signal x strength of the synapse in a slot in the last observed step
  float contribution(std::size_t slot) const;
  bool has_contributions() const { return !observed_contributions.empty(); }
  void observe_connections(bool value) {
    observe = value;
    if (!value && !observed_contributions.empty())
      std::vector<float>().swap(observed_contributions);
  }
  void set_maturity(double m) { maturity_ = std::clamp(m, 0., 1.); }
  double maturity() const { return maturity_; }
  void set_plasticity(bool on) { plasticity_enabled = on; }
  bool plasticity() const { return plasticity_enabled; }

private:
  void read_runtime_state(std::istream &);
};
const char *role_name(Role);
}
