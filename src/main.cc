#include <set>
#include "ecology.hh"
#include "interactive.hh"
#include "parallel.hh"
#include "opencl.hh"
#include "founder_pool.hh"
#include "json_numbers.hh"
#include "observations.hh"
#include "ecology_internal.hh"
#include "physiology.hh"
#include "body_plan.hh"
#include <iostream>
#include <iomanip>
#include <fstream>
#include <map>
#include <csignal>
#include <stdexcept>
using namespace fishsim;
namespace {
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
int search_founders(const InteractiveOptions &o, const std::string &pool_path, int pool_target,
                    int founder_candidates) {

  std::set<std::string> reported;
  FounderPool pool(pool_path);
  pool.load();
  pool.sensory_parameters = o.parameters;
  for (const auto &[name, value] : o.parameters)
    if (name == "founder_sense_quotas")
      pool.sense_quotas = value >= .5;
  for (int remaining = founder_candidates;
       (founder_candidates == 0 || remaining > 0) && !cancelled &&
       (pool_target == 0 ||
        int(std::count_if(pool.entries.begin(), pool.entries.end(), [](const auto &e) {
          return e.measured && e.hatching.passed() && e.reproduction.passed();
        })) < pool_target);) {
    std::uint64_t before = 0;
    bool first_progress = true;
    pool.search(
        o.threads, cancelled,
        [&](int checked, int size) {
          if (first_progress) {
            before = pool.total_searched();
            first_progress = false;
          }
          std::cout << "{\"candidates\":" << checked << ",\"founders\":" << size
                    << ",\"total_candidates\":" << pool.total_searched()
                    << ",\"anatomy\":" << pool.anatomy_passed
                    << ",\"hatching\":" << pool.hatching_passed << ",\"admitted\":[";
          bool first = true;
          for (const auto &f : pool.entries)
            if (f.measured && reported.insert(f.file).second) {
              if (!first)
                std::cout << ',';
              first = false;
              std::cout << "{\"class\":" << f.category
                        << ",\"hatch_attempts\":" << f.hatching.attempted
                        << ",\"hatches\":" << f.hatching.hatched
                        << ",\"built\":" << f.hatching.built
                        << ",\"secreted\":" << f.hatching.secreted
                        << ",\"contracted\":" << f.hatching.contracted
                        << ",\"min_energy\":" << f.hatching.min_energy
                        << ",\"min_health\":" << f.hatching.min_health
                        << ",\"trial_steps\":" << f.hatching.steps << '}';
            }
          std::cout << "]}\n" << std::flush;
        },
        pool_target, founder_candidates == 0 ? 2000 : std::min(remaining, 2000));
    const auto used = pool.total_searched() - before;
    if (!used)
      break;
    if (founder_candidates != 0)
      remaining -= int(used);
  }
  for (const auto &f : pool.entries)
    std::cout << "class " << f.category << " hatches " << f.hatching.hatched << ' ' << f.file
              << '\n';
  return cancelled ? 130 : 0;
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
    InteractiveOptions o{"genomes/cppn-start.genome",
                         "run/best.genome",
                         "run/history/manual",
                         "",
                         200,
                         1200,
                         available_workers(),
                         std::random_device{}(),
                         {}};
    bool live = false, make = false, pool_search = false, benchmark = false;
    std::string compute = "cpu";
    int founder_candidates = 2000, pool_target = 0, benchmark_steps = 100;
    std::string pool_path = "genomes/pool";
    for (int i = 1; i < argc; ++i) {
      std::string flag = argv[i];
      if (flag == "--help") {
        std::cout << "Fish: ./start.sh\n--interactive --session ORDNER --resume-state "
                     "DATEI\n--seed N --fish N --threads N --param NAME=WERT --brain "
                     "NAME=WERT\n--compute "
                     "cpu|opencl-optics --benchmark-opencl --benchmark-steps N\n--input DATEI "
                     "--output DATEI --food N --empty-world\n--make-genome: aktuelles Genom nach "
                     "--output schreiben\n--search-founders --founder-pool ORDNER --founder-target "
                     "N --founder-candidates N\n";
        return 0;
      }
      if (flag == "--defaults-json") {
        Ecosystem defaults(0);
        std::cout << std::setprecision(17) << '{';
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
      if (flag == "--search-founders") {
        pool_search = true;
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
      if (flag == "--make-genome") {
        make = true;
        continue;
      }
      if (i + 1 >= argc)
        throw std::runtime_error("Wert fehlt: " + flag);
      std::string value = argv[++i];
      if (flag == "--founder-candidates")
        founder_candidates = number(value, 0, 10000000);
      else if (flag == "--benchmark-steps")
        benchmark_steps = number(value, 1, 1000000);
      else if (flag == "--metadata-fd")
        o.metadata_fd = number(value, 3, 1048576);
      else if (flag == "--render-socket")
        o.render_socket = value;
      else if (flag == "--compute")
        compute = value;
      else if (flag == "--founder-pool")
        o.founder_pool = pool_path = value;
      else if (flag == "--founder-target")
        pool_target = number(value, 0, 100000);
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
        p.body.color = pigment_color(p.genome.interface->resting_absorption,
                                     PhysiologyParameters{}.pigment_half);
        p.body.age = 100;
        p.body.hatch_age = 0;
        write_individual(std::cout, p);
        std::cout << '\n';
        return 0;
      } else if (flag == "--input") {
        o.input = value;
        o.pool_start = false;
      } else if (flag == "--output")
        o.output = value;
      else if (flag == "--session")
        o.session = value;
      else if (flag == "--resume-state")
        o.resume = value;
      else if (flag == "--fish")
        o.pop = number(value, 1, 2000);
      else if (flag == "--food")
        o.food = number(value, 0, 20000);
      else if (flag == "--threads")
        o.threads = number(value, 1, 64);
      else if (flag == "--seed") {
        o.seed = parse_seed(value);
      } else if (flag == "--max-neurons")
        default_development_options.max_nodes = number(value, 1, 65536);
      else if (flag == "--max-connections")
        default_development_options.max_edges = number(value, 1, 10000000);
      else if (flag == "--neural-budget")
        default_neural_budget = number(value, 1, 256000000);
      else if (flag == "--brain") {
        auto eq = value.find('=');
        if (eq == std::string::npos)
          throw std::runtime_error("NAME=WERT erwartet");
        auto name = value.substr(0, eq);
        std::size_t used;
        double v = std::stod(value.substr(eq + 1), &used);
        if (used != value.size() - eq - 1 || !std::isfinite(v))
          throw std::runtime_error("Ungültiger Gehirnparameter");
        auto &o = default_development_options;
        if (name == "depth" && v == int(v))
          o.depth = int(v);
        else if (name == "role_transition")
          o.role_transition = float(v);
        else
          throw std::runtime_error("Unbekannter Gehirnparameter: " + name);
        o.validate();
      } else if (flag == "--param") {
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
    default_development_options.workers = o.threads;
    default_development_options.validate();
    Genome::begin_run(o.seed);
    std::signal(SIGINT, stop);
    std::signal(SIGTERM, stop);
    if (pool_search)
      return search_founders(o, pool_path, pool_target, founder_candidates);
    if (make) {
      Rng random(o.seed);
      Genome g;
      for (int attempt = 0; attempt < 64; ++attempt) {
        g = Genome::fresh(random);
        if (g.viable())
          break;
      }
      if (!g.viable())
        throw std::runtime_error("Kein lebensfähiger Bauplan erzeugt");
      g.save(o.output);
      std::cout << o.output << '\n';
      return 0;
    }
    if (!live)
      throw std::runtime_error("Start mit ./start.sh oder --interactive");
    return interactive(o);
  } catch (const std::exception &e) {
    std::cerr << "Fish: " << e.what() << '\n';
    return 1;
  }
}
