#pragma once
#include "energy_ledger.hh"
#include "hormone_state.hh"
#include "physiology_parameters.hh"
#include "reproduction_state.hh"
#include "motor_state.hh"
#include "perception_state.hh"
#include "simulation_types.hh"
#include "field/maturation.hh"
#include <optional>
#include <functional>
#include <limits>
namespace test {
struct StateAccess;
}
namespace fishsim {
struct Genome;
struct Field;
struct BrainInterface;
struct VisualObject;
struct EffectorActivity;
struct Point;
struct FleshBite;
class PopulationCheckpoint;
// Scalar physiology is also the immutable input of asynchronous statistics.
struct MouthState {
  double phase = -1, duration = 8;
  std::uint32_t cycle = 0;
  bool biting = false, closing = false;
  double opening = 0, budget = 0, credit = 0, flow = 0, swallowed = 0, filtered = 0;
};
struct EmbryoState {
  double target_tissue = 0, shell = 1, secretion = 0, pending = 0, pressure = 0;
  std::array<double, 16> touch{}, flow{};
};
struct BodyState {
  EmbryoState embryo;
  MouthState mouth;

  std::uint64_t identity = 0; // Derived from Individual::id, never from position.

  double x = 0;
  double y = 0;
  double angle = 0;
  int eaten = 0, hunger = 0, age = 0, disease = 0;
  double energy = ENERGY_START;
  double organ_mass = 0, suction_strength = 10, bite_strength = 0;
  double force_scale = default_max_bite_force, resting_defense = 0, sediment_coverage = 0;
  double bite_signal = 0, egg_shell_radius = 0;
  double tissue = 0;
  double peak_tissue = 0;
  double birth_tissue = 0;
  double health = 1;
  std::array<double, 16> damage_sectors{};

  double bladder_capacity = 0;
  double jaw_length = .5, gut_length = .5, blunt_teeth = .5, undulation = .5;
  double organ_mass_ref = 1.56;
  double snout_position = 1, rest_cost = .06;
  double gut_energy = 0, gut_digestible = 0, gut_fill = 0;
  double digestion = 0, digested = 0, feces_pending = 0;
  int feeding_action = 0, feeding_action_age = 0;
  double bladder_fill = 0, buoyancy_force = 0;
  std::array<double, 16> spine_density{};
  double active_muscle_maintenance = 0;

  int fatal_cause = -1; // Cause recorded by the first fatal physiological event.

  bool alive = true;
  bool immortal = false;

  bool hatched = true;
  bool anchored = false;

  double eat_signal = 0;

  std::array<double, 3> color{.3, .7, .6};
  int eggs_eaten = 0;
  int hatch_age = -1;
  double nutrient_flow = 0, nutrition = 0;
  int nutrition_steps = 0;

protected:
  HormoneState hormones_;
  EnergyLedger ledger_;
  ReproductionState reproduction_;
  MotorState motor_;
  std::optional<field::Maturation> development_;
};
struct Body : BodyState {
private:
  std::shared_ptr<const BrainInterface> organ_source_, active_anatomy_;
  std::size_t known_deaths_ = SIZE_MAX;
  double active_neural_maintenance_ = -1;

public:
  double defense() const { return std::max(resting_defense, motor_.defense); }
  const HormoneState &hormones() const { return hormones_; }
  const EnergyLedger &ledger() const { return ledger_; }
  const ReproductionState &reproduction() const { return reproduction_; }
  const MotorState &motor() const { return motor_; }
  const PerceptionState &perception() const { return perception_; }
  const std::optional<field::Network> &brain() const { return brain_; }
  const std::optional<field::Maturation> &development() const { return development_; }

  using VisualContribution = PerceptionState::VisualContribution;
  using VisualSample = PerceptionState::VisualSample;
  using ImageBand = PerceptionState::ImageBand;
  Body observation() const {
    Body result;
    static_cast<BodyState &>(result) = *this;
    return result;
  }
  void prepare(const Genome &);
  const BrainInterface &active_interface(const Genome &) const;
  void refresh_organs(const Genome &);
  double neural_upkeep() const;
  double local_defense(double bearing) const;
  void orient_to(double radians);
  void activate_brain(const Genome &);
  void reset_brain();
  void evaluate_brain(const std::vector<float> &, bool learning = false);
  void mute_neuron(std::size_t);
  void stimulate_neuron(std::size_t, float);
  void stimulate_neurons(const std::vector<std::size_t> &, float);
  void set_probe(SensoryProbe);
  void reset_probe();
  void advance_probe();
  void clear_probe(const Genome &, const Field &, const PhysiologyParameters & = {});
  void refresh_senses(const Genome &, const Field &, const PhysiologyParameters & = {});
  void disable_sense(int);
  // Trial-local, post-hatch intervention; normal organ capacities and payments still apply.
  void set_actuation_probe(std::function<float(std::uint32_t, float)> probe) {
    actuation_probe_ = std::move(probe);
  }

private:
  void act(const Genome &, const PhysiologyParameters &, bool protected_life);
  bool prepare_step(const Genome &, const PhysiologyParameters &, bool);
  void advance_age() {
    if (age < std::numeric_limits<int>::max())
      ++age;
  }
  void finish_step();
  friend void advance_body(Body &, const Genome &, const struct Field *,
                           const PhysiologyParameters &, bool);
  std::function<float(std::uint32_t, float)> actuation_probe_;
  PerceptionState perception_;
  std::optional<field::Network> brain_;

  friend class Ecosystem;
  friend struct Field;
  friend class PopulationCheckpoint;
  friend struct test::StateAccess;
  friend void cppn_action(Body &, const Genome &, const PhysiologyParameters &, bool);
  friend void sense_generated(Body &, const Genome &, const Field &,
                              const std::vector<VisualObject> *, bool,
                              const PhysiologyParameters &);
  friend std::vector<float> retinal_vision(const Body &, const BrainInterface &, const Field &,
                                           const std::vector<VisualObject> &, Body *, int, bool,
                                           const std::array<VisualEye, 2> *);
  friend void anatomical_action(Body &, const BrainInterface &, const PhysiologyParameters &, bool);
  friend void record_touch(Body &, double, double, double);
  friend void move_body(Body &, const Field *, const PhysiologyParameters &, bool);
  friend void limit_swimming(Body &, const Field &, const PhysiologyParameters &);
  friend void mature_body(Body &);
  friend void advance_embryo(Body &, const Genome &, const PhysiologyParameters &, bool);
  friend void maintain_body(Body &, bool);
  friend void injure(Body &, double, bool, Point);
  friend void settle_energy(Body &, bool);
};
}
