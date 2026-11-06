#include <set>
#include "ecology.hh"
#include "interactive.hh"
#include "parallel.hh"
#include "opencl.hh"
#include "json_numbers.hh"
#include "observations.hh"
#include "ecology_internal.hh"
#include "physiology.hh"
#include "body_plan.hh"
#include <iostream>
#include <iomanip>
#include <limits>
#include <fstream>
#include <map>
#include <csignal>
#include <stdexcept>
using namespace fishsim;
namespace {
constexpr int FIRST_FREE_DESCRIPTOR = 3, MAX_DESCRIPTOR = 1048576;
constexpr std::uint64_t PREVIEW_AGE = 100;
void stop(int) {
  cancelled = true;
}
int number(const std::string &value, int min, int max) {
  std::size_t used;
  int n = std::stoi(value, &used);
  if (used != value.size() || n < min || n > max)
    throw std::runtime_error("Ungültiger Zahlenwert");
  return n;
}
std::uint64_t parse_seed(const std::string &value) {
  std::size_t used;
  if (value.empty() || value.find_first_not_of("0123456789") != std::string::npos)
    throw std::runtime_error("Ungültiger Seed");
  auto seed = std::stoull(value, &used);
  if (used != value.size() || seed > UINT32_MAX)
    throw std::runtime_error("Ungültiger Seed");
  return seed;
}
}
int main(int argc, char **argv) {
  try {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    std::cout.imbue(std::locale(std::locale::classic(), new JsonNumbers));
    if (argc == 2 && std::string(argv[1]) == "--version") {
      std::cout << "Fish v" << FISH_RELEASE << "\n";
      return 0;
    }
    InteractiveOptions o{"run/best.genome",
                         "run/history/manual",
                         "",
                         run_limit::default_fish,
                         run_limit::default_food,
                         available_workers(),
                         std::random_device{}(),
                         {}};
    bool live = false, benchmark = false;
    std::string compute = "cpu";
    int benchmark_steps = run_limit::benchmark_steps;
    for (int i = 1; i < argc; ++i) {
      std::string flag = argv[i];
      if (flag == "--help") {
        std::cout << "Fish: ./start.sh\n--interactive --session ORDNER --resume-state "
                     "DATEI\n--seed N --fish N --threads N --param NAME=WERT\n--compute "
                     "cpu|opencl-optics --benchmark-opencl --benchmark-steps N\n"
                     "--output DATEI --food N --empty-world\n--start-genome DATEI (mehrfach)\n";
        return 0;
      }
      if (flag == "--defaults-json") {
        Ecosystem defaults(0);
        std::cout << std::setprecision(std::numeric_limits<double>::max_digits10) << '{';
        bool first = true;
        for (const auto &p : defaults.parameters()) {
          if (!first)
            std::cout << ',';
          first = false;
          std::cout << '"' << p.name << "\":{\"value\":" << p.value << ",\"min\":" << p.lo
                    << ",\"max\":" << p.hi << ",\"initial\":" << (p.initial ? "true" : "false")
                    << '}';
        }
        std::cout << "}\n";
        return 0;
      }
      if (flag == "--available-threads") {
        std::cout << available_workers() << '\n';
        return 0;
      }
      if (flag == "--check-opencl-loader")
        return opencl_loader_available() ? 0 : 1;
      if (flag == "--benchmark-opencl") {
        benchmark = true;
        continue;
      }
      if (flag == "--choose-population") {
        o.choose_population = true;
        continue;
      }
      if (flag == "--empty-world") {
        o.empty_world = true;
        continue;
      }
      if (flag == "--interactive") {
        live = true;
        continue;
      }
      if (flag == "--view-stream") {
        o.view_stream = true;
        continue;
      }
      if (flag == "--render-stream") {
        o.render_stream = true;
        o.view_stream = true;
        continue;
      }
      if (i + 1 >= argc)
        throw std::runtime_error("Wert fehlt: " + flag);
      std::string value = argv[++i];
      if (flag == "--benchmark-steps")
        benchmark_steps = number(value, 1, run_limit::max_benchmark_steps);
      else if (flag == "--metadata-fd")
        o.metadata_fd = number(value, FIRST_FREE_DESCRIPTOR, MAX_DESCRIPTOR);
      else if (flag == "--render-socket")
        o.render_socket = value;
      else if (flag == "--compute")
        compute = value;
      else if (flag == "--start-genome")
        o.start_genomes.push_back(value);
      else if (flag == "--preview-genome") {
        Genome::begin_run(0);
        Individual p;
        p.genome = Genome::load(value);
        p.body.tissue = BODY_TISSUE;
        p.body.birth_tissue = BODY_TISSUE;
        p.body.prepare(p.genome);
        if (!viable_entrant(p.genome))
          throw std::runtime_error("Startlinie hat keinen lebensfähigen Körper.");
        p.body.hatched = true;
        p.body.color = pigment_color(
            visible_absorption(*p.genome.interface, p.body.motor().pigment, PhysiologyParameters{}),
            PhysiologyParameters{}.pigment_half);
        p.body.age = PREVIEW_AGE;
        p.body.hatch_age = 0;
        write_individual(std::cout, p);
        std::cout << '\n';
        return 0;
      } else if (flag == "--output")
        o.output = value;
      else if (flag == "--session")
        o.session = value;
      else if (flag == "--resume-state")
        o.resume = value;
      else if (flag == "--fish")
        o.pop = number(value, 1, population_limits::max_fish);
      else if (flag == "--food")
        o.food = number(value, 0, run_limit::max_food);
      else if (flag == "--threads")
        o.threads = number(value, 1, MAX_WORKERS);
      else if (flag == "--seed") {
        o.seed = parse_seed(value);
      } else if (flag == "--max-neurons")
        default_development_options.max_nodes = number(value, 1, field::MAX_NODES);
      else if (flag == "--max-connections")
        default_development_options.max_edges = number(value, 1, field::MAX_EDGES);
      else if (flag == "--neural-budget")
        default_neural_budget = number(value, 1, MAX_NEURAL_BUDGET);
      else if (flag == "--param") {
        auto eq = value.find('=');
        if (eq == std::string::npos)
          throw std::runtime_error("NAME=WERT erwartet");
        std::size_t used;
        double n = std::stod(value.substr(eq + 1), &used);
        if (used != value.size() - eq - 1 || !std::isfinite(n))
          throw std::runtime_error("Ungültiger Parameter");
        o.parameters.push_back({value.substr(0, eq), n});
      } else
        throw std::runtime_error("Unbekannte Option: " + flag);
    }
    configure_compute(benchmark && compute == "cpu" ? "opencl-optics" : compute);
    if (benchmark)
      return benchmark_opencl(std::cout, o.threads, o.pop, benchmark_steps);
    default_development_options.validate();
    Genome::begin_run(o.seed);
    std::signal(SIGINT, stop);
    std::signal(SIGTERM, stop);
    if (!live)
      throw std::runtime_error("Start mit ./start.sh oder --interactive");
    return interactive(o);
  } catch (const std::exception &e) {
    std::cerr << "Fish: " << e.what() << '\n';
    return 1;
  }
}
