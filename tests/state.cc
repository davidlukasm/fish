#include "command_arguments.hh"
#include "session_io.hh"
#include "checkpoint.hh"
#include "json_numbers.hh"
#include "test_support.hh"
#include "view_stream.hh"
#include "command_input.hh"
#include "movement.hh"
#include "world_view.hh"
#include "view_cache.hh"
#include "eye_geometry.hh"
#include <type_traits>
#include <utility>
using namespace test;

void subsystem_boundaries(const Genome &g) {
  auto first = small_world(1814), second = small_world(1815);
  const auto second_bytes = saved(second);
  const auto parameters = first.parameters();
  const auto old = first.physiology().basal_metabolism;
  check(first.set_parameter("basal_metabolism", 2), "physiology setting accepted");
  check(second.physiology().basal_metabolism == old && saved(second) == second_bytes,
        "physiology changes remain inside their owning world");
  auto prior = std::find_if(parameters.begin(), parameters.end(),
                            [](const auto &p) { return p.name == "basal_metabolism"; });
  check(prior != parameters.end() && prior->value == old,
        "parameter snapshots do not alias writable world settings");
  const auto snapshot = first.field.capture_edit();
  const auto plants = snapshot.plant_energies();
  check(near(plants[0], first.field.algae_energy()) && near(plants[1], first.field.grass_energy()),
        "geometry snapshots retain separate material budgets");
  const auto before = saved(first);
  first.field.restore_edit(snapshot);
  check(saved(first) == before,
        "restoring an unchanged geometry snapshot preserves the checkpoint");
  auto &b = adult(first, g).body;
  SensoryProbe probe;
  probe.kind = 1;
  probe.remaining = 2;
  b.set_probe(probe);
  b.advance_probe();
  b.advance_probe();
  b.advance_probe();
  check(b.perception().probe.remaining == 0,
        "inspection lifetime expires without becoming negative");
  b.orient_to(5 * PI);
  check(near(std::abs(b.angle), PI), "inspection orientation uses periodic body coordinates");
}

void observation_snapshot(const Genome &g) {
  auto w = small_world(1816);
  adult(w, g);
  for (int k = 0; k < 5; ++k)
    w.tick(false);
  auto output = [](const Ecosystem &world) {
    std::ostringstream out;
    JsonViewCache cache(false);
    SessionView status;
    status.binary = true;
    status.selected = world.fish.front().id;
    status.chosen = &world.fish.front();
    auto cadence =
        cache.begin_frame(false, false, status.selected, world.environment, false, false);
    WorldViewWriter writer(out, world, status, cache);
    writer.write(cadence, world.parameters(), {});
    cache.write_assets(out);
    out << '}';
    return out.str();
  };
  auto snapshot = w.observation();
  check(!snapshot.fish.front().body.brain(), "statistics snapshot omits neural runtime");
  const auto before = output(snapshot);
  check(output(w) == before, "lightweight statistics preserve every displayed value");
  for (int k = 0; k < 12; ++k)
    w.tick(false);
  check(output(snapshot) == before, "statistics snapshot stays immutable while the world advances");
  auto geometry = *g.interface;
  geometry.anatomy[34] = 20;
  geometry.anatomy[37] = 10;
  prepare_body_geometry(geometry);
  auto base = geometry.body_geometry;
  geometry.anatomy[34] = 90;
  geometry.anatomy[37] = 80;
  prepare_body_geometry(geometry);
  check(geometry.body_geometry[1] == base[1] && geometry.body_geometry[5] > base[5] &&
            geometry.body_geometry[6] > base[6],
        "shared body geometry grows the spine independently of the head");
}

void independent_mutation_settings(const Genome &g) {
  auto stable = small_world(1808);
  stable.evo.mutation = .03;
  RandomGenomeSearch search(1, stable.evo.rates);
  auto other = small_world(1809);
  other.evo.rates = MutationRates{};
  check(other.set_parameter("mutation", .15), "second world changes its mutation settings");
  const auto other_state = saved(other);
  auto restored = other.fork();
  check(saved(restored) == other_state, "second world retains its independent saved settings");
  check(stable.import({g}, 200, 200, 1, false, nullptr, true) == 1 &&
            stable.fish.back().genome.same_genes(g),
        "creating, configuring and loading another world cannot enable disabled mutations");
  Rng random(1810);
  check(search.mutants(g, random, 4, .15).empty(),
        "a founder search retains the mutation settings captured when it started");
}

void transport_fixtures() {
  std::vector<std::string> values = {"0",
                                     "1",
                                     "-1",
                                     "3.2",
                                     "4",
                                     "-1.235",
                                     "-1.24",
                                     "1.234e-6",
                                     "1.24e-6",
                                     "1e-12",
                                     "1e12",
                                     "4503599627370497",
                                     "null",
                                     "true",
                                     "false",
                                     "\"ä\\\"\\\\\\n\"",
                                     "[]",
                                     "[1,2,3]",
                                     "[1,[2,4],{}]",
                                     "{}",
                                     "{\"drop\":1,\"a\":[1,2]}",
                                     "{\"new\":3,\"a\":[1,4,5]}"};
  auto emit = [](const std::string &a, const std::string &b) {
    std::cout << "{\"old\":" << a << ",\"new\":" << b << ",\"patch\":" << view_patch(a, b) << "}\n";
  };
  for (std::size_t i = 0; i < values.size(); ++i) {
    emit(values[i], values[i]);
    emit(values[i], values[(i + 1) % values.size()]);
    emit(values[i], "null");
  }
  std::string row = "[0,0,0,0,";
  auto animal = [&](int id, int shift) {
    std::string text = row + std::to_string(id);
    for (int i = 0; i < 75; ++i)
      text += ',' + std::to_string(i + shift);
    return text + ']';
  };
  emit("{\"fish\":[" + animal(1, 0) + ',' + animal(2, 0) + ',' + animal(3, 0) + "]}",
       "{\"fish\":[" + animal(3, 1) + ',' + animal(2, 0) + ',' + animal(4, 2) + "]}");
}

void command_boundaries() {
  CommandInput input;
  input.append("request 1 pause\nrequest 2 stimulate-group ");
  input.append(std::string(110000, '1') + "\nrequest 3 pause\n");
  auto lines = input.take();
  check(lines.size() == 3 && !lines[1].too_long, "large valid commands preserve adjacent commands");
  input.append("request 4 " + std::string(600000, '1') + "\nrequest 5 pause\n");
  lines = input.take();
  check(lines.size() == 2 && lines[0].too_long && lines[1].text == "request 5 pause",
        "oversized line is rejected without losing the next command");
}

void persistence_boundaries(const Genome &g) {
  auto w = small_world(1812);
  auto &p = adult(w, g);
  const auto snapshot = serialize_checkpoint(capture_checkpoint(w, g, p.id, true, false, 0, 0, 0));
  std::istringstream input(snapshot);
  const auto restored = read_checkpoint(input, 2);
  check(restored.world.workers == 2 && restored.founder.same_genes(g),
        "one loader preserves founder and execution settings");
  check(StateAccess::support(restored.world).founder.same_genes(g),
        "restored world owns its founder");
  StateAccess::support(w).founder = g;
  Genome::begin_run(1813);
  auto branch = w.fork();
  check(StateAccess::support(w).founder.same_genes(g) &&
            StateAccess::support(branch).founder.same_genes(g),
        "another run cannot replace a world's founder");
  check(StateAccess::support(branch).founder.cppn->history() != g.cppn->history(),
        "forked founder history is independent");
  p.body.health = 2;
  try {
    std::ostringstream invalid;
    w.write(invalid);
    throw std::logic_error("invalid live state written");
  } catch (const std::runtime_error &) {
  }
  for (const std::string value : {"", "abc", "1.5", "2147483648", "-2147483649", "\"2\"", "0x2"}) {
    std::istringstream invalid(value);
    try {
      validate_command_arguments("count", invalid);
      throw std::logic_error("invalid command accepted");
    } catch (const std::runtime_error &) {
    }
  }
  for (const std::string value : {"\"2\"", "0x1p0", "nan", "inf", "1e309"}) {
    std::istringstream invalid(value);
    try {
      validate_command_arguments("neural-cost", invalid);
      throw std::logic_error("invalid numeric token accepted");
    } catch (const std::runtime_error &) {
    }
  }
  for (const std::string value : {"0", "2147483647", "-2147483648"}) {
    std::istringstream valid(value);
    validate_command_arguments("count", valid);
  }
  std::ostringstream json;
  json.imbue(std::locale(std::locale::classic(), new JsonNumbers));
  json << std::numeric_limits<double>::quiet_NaN();
  check(json.str() == "null", "non-finite display number remains valid JSON");
}
int main(int argc, char **argv) {
  std::ostringstream escaped;
  escaped << json_quoted(std::string("a\n\r\t\"\\") + char(1) + char(0));
  check(escaped.str() == "\"a\\n\\r\\t\\\"\\\\\\u0001\\u0000\"",
        "JSON strings preserve control bytes, quotes and backslashes");

  try {
    if (argc == 2 && std::string(argv[1]) == "--transport-fixtures") {
      transport_fixtures();
      return 0;
    }
    command_boundaries();
    Genome::begin_run(1800);
    auto g = Genome::load("genomes/cppn-start.genome");

    subsystem_boundaries(g);
    persistence_boundaries(g);

    observation_snapshot(g);

    independent_mutation_settings(g);
    std::cout << "State, commands, snapshots and independent settings: OK\n";
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
