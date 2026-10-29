#pragma once
#include "genome.hh"
#include "protocol_schema.hh"
#include "physiology_parameters.hh"
#include <filesystem>
#include <functional>
namespace fishsim {
struct Ecosystem;
bool place_trial_food(Ecosystem &, double x, double y, double energy, int origin = 0);
int anatomy_class(const Genome &);
int starting_founder_count(int population);
struct FounderForaging {
  double score = 0, speed = 0, turn = 0;
  int eaten = 0, samples = 0;
};
FounderForaging
founder_foraging(const Genome &, int disabled_sense, std::atomic<bool> &stop,
                 const std::vector<std::pair<std::string, double>> &parameters = {});
bool same_founder_design(const Genome &, const Genome &);
struct FounderReproduction {
  int funded = 0, hatched = 0, feeding = 0, parents_feeding = 0, steps = 0;
  std::uint64_t seed = 0;
  std::array<double, DIET_COUNT> diet{}, raw_diet{};
  double digested = 0;
  std::uint64_t exposure = 0;
  bool passed() const {
    return funded > 0 && hatched > 0 && feeding > 0 && parents_feeding > 0 && digested > 0;
  }
};
void prepare_founder_habitat(Ecosystem &);
FounderReproduction
founder_reproduction(const Genome &, std::atomic<bool> &stop,
                     const std::vector<std::pair<std::string, double>> &parameters = {},
                     std::uint64_t seed = std::random_device{}());
constexpr std::size_t FOUNDER_PROFILE_SIZE = 3 * 8 + field::SENSE_COUNT + field::MOTOR_COUNT + 8 +
                                             2 * field::CONNECTION_KINDS + 1 + 4 +
                                             2 * (field::SENSE_COUNT + field::MOTOR_COUNT) +
                                             field::HORMONE_EFFECTS * (field::HORMONES + 3) + 1;
bool hatch_capable_anatomy(const BrainInterface &);
bool founder_cell_plan_possible(const field::Substrate &);
bool founder_actuation_possible(const BrainInterface &, const PhysiologyParameters &);
bool hatch_candidate(const Genome &);
void develop_hatch_candidate(Genome &, const std::atomic<bool> &);
struct FounderHatching {
  int attempted = 0, hatched = 0, steps = 0;
  int built = 0, secreted = 0, contracted = 0, dead = 0;
  double min_energy = 0, min_health = 0;
  bool passed() const { return attempted > 0 && hatched > 0; }
};
FounderHatching founder_hatching(const Genome &, std::atomic<bool> &,
                                 const std::vector<std::pair<std::string, double>> &parameters = {},
                                 std::uint64_t seed = 18);
struct PoolFounder {
  Genome genome;
  int category = 0;
  std::string origin, file;
  std::string design = {};
  int senses = 0, selection_group = 2;
  FounderForaging foraging{};
  std::array<double, 2> sense_foraging{-1, -1};
  FounderReproduction reproduction{};
  FounderHatching hatching{};
  std::array<double, FOUNDER_PROFILE_SIZE> structure{};
  bool measured = false;
  void describe();
};
bool assess_founder_foraging(PoolFounder &, std::atomic<bool> &stop,
                             const std::vector<std::pair<std::string, double>> &parameters = {});
class FounderPool {
  std::filesystem::path directory;
  std::uint64_t revision = 0, round = 0;
  int processed = 0;
  Rng random{std::random_device{}()};
  bool search_initialized = false;

public:
  std::uint64_t anatomy_passed = 0, hatching_passed = 0;
  std::vector<PoolFounder> entries;
  bool sense_quotas = true;
  std::vector<std::pair<std::string, double>> sensory_parameters;
  explicit FounderPool(std::filesystem::path path = "genomes/pool") : directory(std::move(path)) {}
  void load(bool develop = false);
  bool offer(PoolFounder);
  void save();
  int ready() const {
    return int(std::count_if(entries.begin(), entries.end(), [](const auto &e) {
      return e.measured && e.hatching.passed() && e.reproduction.passed();
    }));
  }
  int searched() const { return processed; }
  std::uint64_t total_searched() const { return round * 2000 + processed; }
  std::vector<Genome> select(Rng &, int count = 4) const;
  void restore_search();
  void search(int workers, std::atomic<bool> &stop,
              const std::function<void(int, int)> &progress = {}, int target = 0,
              int candidate_budget = 2000);
};
}
