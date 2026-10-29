#pragma once
#include "interactive.hh"
#include "ecology.hh"
#include "checkpoint.hh"
#include "view_cache.hh"
#include "metadata_output.hh"
#include "render_stream.hh"
#include "render_assets.hh"
#include "command_input.hh"
#include <chrono>
#include <map>
#include <set>
#include <sstream>
namespace fishsim {
struct FounderPool;
using Clock = std::chrono::steady_clock;
class InteractiveSession {
  InteractiveOptions o;
  const std::string render_epoch;
  Ecosystem world;
  Genome session_founder = Genome::run_founder();
  std::optional<Genome> live_founder;
  std::optional<Ecosystem> live, reference;
  std::uint64_t experiment_fish = 0, experiment_start = 0;
  int experiment_count = 0;
  std::string experiment_kind;
  bool turbo = false, evolving = true, paused = false, protected_life = false, brain_detail = false,
       brain_mode = false, single = false;
  bool live_mode = true, live_protect = false;
  std::optional<Field::EditSnapshot> geometry_undo;
  std::uint64_t selected = 0;
  std::uint64_t active_request = 0;
  std::uint64_t last_observation = 0, seen_notifications = 0;
  int delay = 30, completed = 0, count = 0, neuron_focus = -1;
  double tick_ms = 0;
  std::string group = "best", notice;
  std::set<std::uint64_t> pins;
  std::map<std::string, std::pair<double, std::uint64_t>> record_candidates;
  std::map<std::uint64_t, std::uint64_t> recent_success;
  std::shared_ptr<const field::Substrate> sent_plan;
  // wiring revision of the shown brain (+1, 0 without a brain) when its layout was last sent
  std::uint64_t sent_wiring = 0;
  Clock::time_point wiring_sent{};
  std::uint64_t stimulus_revision = 0;
  std::uint64_t sent_fish = 0, layout_revision = 0, metadata_layout_revision = 0;
  bool sent_detail = false;
  JsonViewCache view_cache;
  MetadataOutput metadata_output;
  std::uint64_t state_request = 0, view_context = 0;
  std::string inspection_cache_key, inspection_cache;
  std::uint64_t hormone_fish = 0, hormone_context = 0;
  Clock::time_point hormone_sent{};
  int retinal_focus = -1;
  RenderStream scene_stream;
  RenderAssets scene_assets;
  CheckpointWriter writer;
  bool refresh = false, reset_metadata = false;
  void prepare_pool(FounderPool &pool);
  void choose();
  std::string serialize(const Ecosystem &saved, bool mode, bool protect);
  void snapshot(bool manual, std::uint64_t request = 0);
  void curate();
  Individual *prepare_inspection();
  bool emit(bool done = false);
  void emit_scene(std::istringstream &);
  void write_eye_view(std::ostream &, const Individual *);
  void write_brain_vision(std::ostream &, const Individual *);
  void write_brain_probe(std::ostream &, const Individual *);
  void write_brain_senses(std::ostream &, const Individual *);
  void write_brain_learning(std::ostream &, const Individual *);
  void write_brain_activity(std::ostream &, const Individual *);
  void write_brain_layout(std::ostream &, const Individual *);
  void write_brain_summary(std::ostream &, const Individual *);
  void write_brain_receptors(std::ostream &, const Individual *);
  void write_brain_neurons(std::ostream &, const Individual *);
  void write_brain(std::ostream &, const Individual *, bool force_layout = false);
  void autosave(bool final = false);
  void insertion_message(int added, int requested, int removed);
  void dispatch(const CommandLine &);
  void execute(const std::string &op, std::istringstream &line, bool &environment_effect,
               std::string &reply);
  void execute_lifecycle(const std::string &op, std::istringstream &line, bool &environment_effect,
                         std::string &reply);
  void edit_environment_sources(const std::string &op, std::istringstream &line,
                                std::string &reply);
  void edit_environment_brush(const std::string &op, std::istringstream &line, std::string &reply);
  void undo_geometry(std::string &reply);
  void inspect_selected_brain(const std::string &op, std::istringstream &line, std::string &reply);
  void apply_sensory_probe(Body &, std::istringstream &);
  void start_genome_experiment(const std::string &op, std::istringstream &line, std::string &reply);
  void edit_food(const std::string &, std::istringstream &, std::string &);
  void execute_neural(const std::string &op, std::istringstream &line, bool &environment_effect,
                      std::string &reply);
  void execute_geometry(const std::string &op, std::istringstream &line, bool &environment_effect,
                        std::string &reply);
  void execute_population(const std::string &op, std::istringstream &line, bool &environment_effect,
                          std::string &reply);
  void execute_settings(const std::string &op, std::istringstream &line, bool &environment_effect,
                        std::string &reply);
  void execute_genomes(const std::string &op, std::istringstream &line, bool &environment_effect,
                       std::string &reply);

public:
  explicit InteractiveSession(const InteractiveOptions &);
  int run();
};
}
