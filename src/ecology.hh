#pragma once
#include "world_statistics.hh"
#include "hormone_analysis.hh"
#include "species_registry.hh"
#include "population_support.hh"
#include "ecology_types.hh"
#include "environment.hh"
#include "physiology_parameters.hh"
namespace test {
struct StateAccess;
}
namespace fishsim {
struct VisualObject;
struct Checkpoint;
class Ecosystem {
public:
  const PhysiologyParameters &physiology() const { return physiology_; }
  const WorldStatistics &metrics() const { return metrics_; }
  const SpeciesRegistry &taxonomy() const { return taxonomy_; }
  const PopulationSupport &support() const { return support_; }

  Field field;
  Rng rng;
  struct CombatEffect {
    std::uint64_t id, tick, source, target;
    int kind;
    double x, y, angle, radius, strength;
    std::array<double, 3> color{1, 0, 0};
  };
  std::deque<CombatEffect> combat_effects; // Drawing only; excluded from saves and randomness.
  std::uint64_t next_combat_effect = 1;
  std::vector<Individual> fish;
  std::deque<std::pair<std::uint64_t, Genome>> recent_deaths;
  std::deque<std::array<std::uint64_t, 3>> recent_mortality;
  const Genome *exportable_genome(std::uint64_t) const;
  std::string placement_notice;

  std::vector<Sperm> sperm;
  std::uint64_t next_sperm_id = 1;
  std::vector<Corpse> corpses;
  double energy_limit() const { return field.energy_limit(); }
  FeedingResult feeding(std::size_t, double, double, bool, std::vector<unsigned char> &,
                        double body_displacement = 0);
  double fish_energy() const;
  double external_food_energy() const;
  int fund_from_sources(double);
  std::optional<Food> bite_plant(Body &, std::size_t, double along_stroke = 0, double side = 1);

  EvolutionParameters evo;
  DiseaseParameters disease;

  bool infect(Body &, unsigned source);
  void advance_diseases(bool protected_life = false);
  double disease_contact_chance(const Genome &, const Genome &) const;
  double disease_carrion_chance(double age) const;
  double disease_food_chance(double age) const;
  BurstParameters food_burst{1400, 140, 0}, mutation_burst{2300, 90, .25};
  BurstState food_pulse, mutation_pulse;
  void advance_bursts();
  bool trigger_burst(const std::string &);

  void update_breeding_help(double nutrition, std::uint64_t exposure);
  BreedingFood breeding_food() const;
  double mutation_strength(bool assistance = false);
  void feed_burst();
  void prune_species();
  const GeneticSpecies *find_species(std::uint64_t) const;
  // A name chosen by the user; it replaces the generated one and stops automatic naming.
  void rename_species(std::uint64_t id, const std::string &name);

  std::uint64_t performance_window() const;
  PerformanceSample performance() const;
  void record_performance();

  std::vector<ParameterInfo> parameters() const;
  bool set_parameter(const std::string &name, double value);

  SpeciesProtection species_protection() const;
  double assistance_need() const;
  double assistance_factor() const { return safety ? assistance_need() : 0; }
  int assistance_target() const;
  int assistance_shortfall() const;
  double assistance_food_budget() const;

  int workers = 4;
  bool profile_steps = false;
  std::array<double, 10> step_ms{};
  static constexpr std::array<const char *, 10> step_phase_names{
      {"Entwicklung", "Wasser/Futter", "Sediment", "Pflanzen", "Drift/Index", "OpenCL",
       "Sinne/Gehirne/Bewegung", "Kontakte/Fressen", "Umwelt nachführen",
       "Fortpflanzung/Statistik"}};
  std::uint64_t environment = 0;

  std::vector<WorldEvent> events;
  // Optional experiment: natural laying/mating bias. Assistance novelty is separate.
  double novelty_strength = 0;

  std::size_t neural_budget = default_neural_budget;
  std::uint64_t ticks = 0;
  std::uint64_t next_id = 1;
  std::uint64_t watched_id = 0, watched_death = 0;
  int watched_cause = 0;

  int observation_interval = 1200, population_limit = 512;
  bool safety = true;
  explicit Ecosystem(std::uint64_t seed) : field(seed + 7919, 0), rng(seed) {
    field.initialize_aquarium(3690, 1640);
    refresh_food_allowance();
    field.sync_environment();
    field.sync_food_web();
    refresh_food_allowance();
  }
  Ecosystem observation() const;
  void bind_body_identities() {
    for (auto &p : fish)
      p.body.identity = p.id;
  }
  void starter_world();
  void seed(const Genome &, int count, int food, const std::function<void(int, int)> &progress = {},
            const std::function<void()> &configure = {});
  void seed(const std::vector<Genome> &, int count, int food,
            const std::function<void(int, int)> &progress = {},
            const std::function<void(int)> &replaced = {},
            const std::function<void()> &configure = {}, bool exact = false);
  bool spawn(const Genome &, double x, double y, int origin = 0, std::uint64_t parent = 0,
             int depth = 0, double energy = ENERGY_START, bool replace_food = false,
             int *removed_food = nullptr, bool food_funded = false,
             std::uint64_t maternal_species = 0);
  void tick(bool reproduce = true, bool protected_life = false,
            const Water *replay_water = nullptr);
  void transfer_gametes(Individual &);
  std::optional<Individual> fill_natural_egg(Individual &, std::size_t occupied);
  void fill_sperm(Individual &);
  bool release_sperm(Individual &, bool manual = false);
  void use_founder(const Genome &g) { support_.founder = g; }
  void replace_pool_founders(std::vector<Genome> founders) {
    support_.pool_founders = std::move(founders);
  }
  void add_pool_founder(const Genome &g) { support_.pool_founders.push_back(g); }
  void set_neural_cost(double value);
  void set_breeding_help(bool enabled) { support_.breeding_help.enabled = enabled; }
  void record_import() { ++metrics_.imports; }
  void remember();
  void remember_breeder(const Individual &);
  void assist_population();
  Individual *prepare_inspection(std::uint64_t, bool detail, bool mode, int neuron = -1);
  void observe_behavior();
  void reset_window();
  void resize(double, double);
  bool obstacle(double, double, double);
  bool polygon(const std::vector<Point> &);
  bool wall(double, double, double, double, double);
  bool move_obstacle(double, double, double, double, double);
  void erase_obstacle(double, double);
  int import(const std::vector<Genome> &, double, double, int, bool replace_food = false,
             int *removed_food = nullptr, bool mutate = false);
  void write(std::ostream &) const;
  Ecosystem fork() const;
  void read(std::istream &, const Ecosystem *blueprint_cache = nullptr);
  int viable_population() const;
  std::uint64_t classify(const Genome &, std::uint64_t maternal_species = 0);
  void record_hatch(Individual &);
  void environment_changed();
  void record_parent_profile_delta(GeneticSpecies &);
  void observe_ecology();
  int population_size() const;
  int adult_population() const;
  double total_energy() const;
  void refresh_food_allowance();
  void enforce_energy_limit();
  void drift_corpses();
  void drift_sperm();
  void seed_sperm(Sperm &);
  double local_sperm(const Sperm &, double, double) const;
  void refresh_sperm_field();
  void sync_sperm_geometry();
  void collide_food(Body &, double old_x, double old_y);
  void collide_fish(const std::vector<std::array<double, 2>> &old, bool protected_life = false);
  void collect_corpses();

private:
  struct Observation {};
  Ecosystem(const Ecosystem &, Observation);
  class FeedingSession;
  int insert_group(SupportGroup &, Point anchor);
  void restore_population();
  void record_death(Individual &, bool, bool);
  void develop_population();
  void index_organisms();
  void prepare_hormone_analysis();
  void advance_hormone_analysis();
  void act_population(const std::vector<std::vector<VisualObject>> &, bool, bool,
                      const std::vector<unsigned char> &, std::vector<std::array<double, 2>> &);
  bool resolve_population(const std::vector<std::array<double, 2>> &,
                          const std::vector<unsigned char> &, bool);
  void combat_effect(int, std::uint64_t, std::uint64_t, double, double, double, double, double);
  void validate_checkpoint_entities() const;
  void write_environment_cache_state(std::ostream &) const;
  void read_state(std::istream &, const Ecosystem *);
  std::vector<std::size_t> mating_order(const Individual &, int pass);
  void reproduction(bool fertile = true);
  void begin_clonal_development();

private:
  HormoneAnalysis hormone_analysis_;
  PhysiologyParameters physiology_;
  WorldStatistics metrics_;
  SpeciesRegistry taxonomy_;
  PopulationSupport support_;
  friend struct test::StateAccess;
  friend class ParameterAccess;
  friend struct Checkpoint;
  friend Checkpoint capture_checkpoint(const Ecosystem &, const Genome &, std::uint64_t, bool, bool,
                                       int, std::uint64_t, std::uint64_t);
};
}
