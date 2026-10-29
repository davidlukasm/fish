#include "session_io.hh"
#include "world_view.hh"
#include "ecology.hh"
#include "ecology_internal.hh"
#include "opencl.hh"
#include <iomanip>
#include <numeric>
namespace fishsim {
WorldViewWriter::WorldViewWriter(std::ostream &out, const Ecosystem &world,
                                 const SessionView &status, JsonViewCache &cache)
    : out(out), world(world), f(world.field), status(status), cache(cache) {
}
void WorldViewWriter::write(ViewSchedule cadence, const std::vector<ParameterInfo> &table,
                            const ExperimentView &comparison) {
  header();
  population(cadence);
  geometry();
  particles(cadence);
  statistics(table);
  profiles(cadence);
  environment(cadence);
  experiment(comparison);
}
void WorldViewWriter::header() {
  int eggs = 0;
  std::uint64_t eaten = 0;
  for (const auto &p : world.fish) {
    eggs += !p.body.hatched && !p.nutrient_egg;
    eaten += p.body.eaten;
  }
  out << std::setprecision(7)
      << "{\"model\":\"tank-ecology-47\",\"observation_window\":" << status.completed
      << ",\"binary_scene\":" << (status.binary ? "true" : "false")
      << ",\"brain_detail\":" << (status.brain_detail ? "true" : "false")
      << ",\"brain_mode\":" << (status.brain_mode ? "true" : "false")
      << ",\"render_epoch\":" << json_quoted(status.epoch) << ",\"revision\":" << status.revision
      << ",\"view_context\":" << status.context << ",\"command_request\":" << status.command_request
      << ",\"step\":" << world.ticks << ",\"observation_interval\":" << world.observation_interval
      << ",\"width\":" << f.geometry().width << ",\"height\":" << f.geometry().height
      << ",\"phase\":\"life\",\"paused\":" << (status.paused ? "true" : "false")
      << ",\"evolving\":" << (status.evolving ? "true" : "false")
      << ",\"historical\":" << (status.historical ? "true" : "false")
      << ",\"protected\":" << (status.protected_life ? "true" : "false")
      << ",\"done\":" << (status.done ? "true" : "false")
      << ",\"population_size\":" << world.population_size()
      << ",\"alive\":" << world.population_size() << ",\"eggs\":" << eggs
      << ",\"hatched\":" << world.adult_population() << ",\"dead\":" << world.metrics().deaths
      << ",\"births\":" << world.metrics().births << ",\"rescues\":" << world.metrics().rescues
      << ",\"imports\":" << world.metrics().imports
      << ",\"developing_eggs\":" << developing_eggs(world)
      << ",\"planning_brains\":" << planning_brains(world)
      << ",\"development_query_budget\":" << world.evo.development_queries
      << ",\"viable_population\":" << world.viable_population()
      << ",\"breeder_count\":" << world.support().breeders.size()
      << ",\"self_fertilisations\":" << world.support().self_fertilisations
      << ",\"assistance_food\":" << world.support().assistance_food
      << ",\"fish_bites\":" << world.metrics().fish_bites
      << ",\"predation_deaths\":" << world.metrics().predation_deaths
      << ",\"safety\":" << (world.safety ? "true" : "false")
      << ",\"population_limit\":" << world.population_limit << ",\"flow\":" << f.flow
      << ",\"gravity\":" << f.gravity << ",\"delay_ms\":" << status.delay
      << ",\"turbo\":" << (status.turbo ? "true" : "false")
      << ",\"density\":" << f.feeding().density << ",\"eaten\":" << eaten
      << ",\"notice\":" << json_quoted(status.notice) << ",\"selected\":" << status.selected
      << ",\"selected_alive\":" << (status.chosen ? "true" : "false")
      << ",\"selected_nutrition\":" << (status.chosen ? status.chosen->body.nutrition : 0)
      << ",\"count\":" << status.count << ",\"group\":" << json_quoted(status.group)
      << ",\"compute\":";
  write_compute_status(out);
  out << ",\"pins\":[";
  bool first = true;
  for (auto id : status.pins) {
    if (!first)
      out << ',';
    first = false;
    out << id;
  }
  out << ']';
}
void WorldViewWriter::experiment(const ExperimentView &experiment) {
  out << ",\"experiment\":";
  if (experiment.reference) {
    out << "{\"kind\":" << json_quoted(experiment.kind) << ",\"fish_id\":" << experiment.fish
        << ",\"affected_neurons\":" << experiment.affected_neurons
        << ",\"start_step\":" << experiment.start
        << ",\"reference_adults\":" << experiment.reference->adult_population()
        << ",\"variant_adults\":" << world.adult_population()
        << ",\"reference_food\":" << experiment.reference->metrics().window_nutrition
        << ",\"variant_food\":" << world.metrics().window_nutrition
        << ",\"reference_energy\":" << experiment.reference->total_energy()
        << ",\"variant_energy\":" << world.total_energy() << ",\"fish\":[";
    bool first_reference = true;
    for (const auto &p : experiment.reference->fish) {
      if (!first_reference)
        out << ',';
      first_reference = false;
      out << '[' << p.body.x << ',' << p.body.y << ',' << p.body.angle << ',' << p.body.color[0]
          << ',' << p.body.color[1] << ',' << p.body.color[2] << ']';
    }
    out << "]}";
  } else
    out << "null";
}
}
