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
#include <cstring>
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
void individual_life_support(const Genome &g) {
  auto w = small_world(1820);
  auto id = adult(w, g, 200, 200, 2).id;
  w.remember_fish(id, true);
  w.immortal_fish(id, true);
  auto &p = w.fish.front();
  check(p.assisted && p.g == 0 && p.body.immortal, "individual aid is persistent provenance");
  p.body.energy = 0;
  harm_body(p.body, 10, 7);
  injure(p.body, 10);
  check(!w.infect(p.body, 0), "immortal animal cannot acquire disease");
  w.tick(false);
  check(w.fish.size() == 1 && w.fish.front().body.alive && w.fish.front().body.health == 1,
        "individual protection survives hunger, disease and injury without global protection");
  auto live = w.fork();
  check(live.fish.front().body.immortal && live.fish.front().remembered &&
            live.fish.front().assisted,
        "individual protection survives checkpoint round trip");
  w.immortal_fish(id, false);
  check(w.fish.front().assisted, "disabling protection does not erase assistance history");
  w.fish.front().body.stimulate_neuron(0, .25f);
  harm_body(w.fish.front().body, 10, 7);
  w.tick(false);
  check(w.fish.empty() && w.remembered_dead.size() == 1 && w.metrics().deaths == 1,
        "named death archives full individual and counts death once");
  std::ostringstream brain;
  w.remembered_dead.front().body.brain()->write_runtime(brain);
  const int age = w.remembered_dead.front().body.age;
  const auto bytes = saved(w);
  auto restored = w.fork();
  check(saved(restored) == bytes, "dead named individual round trips without loss");
  Ecosystem cold(0);
  std::istringstream disk(bytes);
  cold.read(disk);
  cold.revive_fish(id);
  std::ostringstream cold_brain;
  cold.fish.front().body.brain()->write_runtime(cold_brain);
  check(cold_brain.str() == brain.str(),
        "cold reload retains learned runtime without cached plans");
  auto limited = w.fork();
  limited.population_limit = 0;
  bool full = false;
  try {
    limited.revive_fish(id);
  } catch (const Refusal &) {
    full = true;
  }
  check(full && limited.remembered_dead.size() == 1 && limited.revivals == 0,
        "failed revival preserves the archived animal");
  restored.prune_species();
  restored.revive_fish(id);
  check(restored.fish.size() == 1 && restored.remembered_dead.empty() && restored.revivals == 1,
        "revival moves one remembered identity into the live population");
  const auto &back = restored.fish.front();
  std::ostringstream after;
  back.body.brain()->write_runtime(after);
  check(back.id == id && back.body.age == age && brain.str() == after.str(),
        "revival retains identity, age and learned neural runtime");
  check(back.body.immortal && back.assisted && back.body.health == 1 && back.body.energy > 0 &&
            back.body.disease == 0 && restored.metrics().deaths == 1,
        "revival repairs body, enables protection and preserves historical deaths");
  const auto once = saved(restored);
  restored.revive_fish(id);
  check(saved(restored) == once, "retrying revival cannot duplicate or heal a live fish");
  auto persisted = restored.fork();
  check(persisted.revivals == 1 && persisted.fish.front().body.immortal,
        "revival counter and protection survive restart");
  restored.tick(false);
  check(restored.fish.front().body.alive, "revived fish advances normally");
  restored.immortal_fish(id, false);
  harm_body(restored.fish.front().body, 10, 1);
  restored.tick(false);
  restored.remember_fish(id, false);
  check(restored.remembered_dead.empty(), "removing a name releases archived runtime");
  bool refused = false;
  try {
    restored.revive_fish(id);
  } catch (const Refusal &) {
    refused = true;
  }
  check(refused, "unavailable historical animal is not recreated from a genome");

  auto prey_world = small_world(1821);
  adult(prey_world, g);
  adult(prey_world, g, 300, 200);
  auto &predator = prey_world.fish[0].body;
  auto &prey = prey_world.fish[1].body;
  predator.bite_signal = 1;
  predator.bite_strength = default_max_bite_force;
  prey.immortal = true;
  const double tissue = prey.tissue;
  check(sever_flesh(predator, prey, 1).energy == 0 && prey.tissue == tissue,
        "protected prey supplies no flesh");
  prey.immortal = false;
  predator.immortal = true;
  check(sever_flesh(predator, prey, 1).energy > 0,
        "protected predator can still eat unprotected prey");

  auto eggs = small_world(1822);
  check(eggs.spawn(g, 200, 200), "protected egg fixture");
  const auto egg_id = eggs.fish.front().id;
  eggs.immortal_fish(egg_id, true);
  eggs.fish.front().body.energy = 0;
  eggs.tick(false);
  check(eggs.fish.size() == 1 && eggs.fish.front().body.alive,
        "individual protection includes an egg with exhausted energy");
}

void remembered_checkpoint_snapshot() {
  auto w = small_world(1823);
  const auto g = Genome::load("genomes/cppn-start.genome");
  const auto id = adult(w, g).id;
  w.remember_fish(id, true);
  harm_body(w.fish.front().body, 10, 7);
  w.tick(false);
  check(w.fish.empty() && w.remembered_dead.size() == 1, "remembered checkpoint fixture");
  const auto captured = capture_checkpoint(w, g, id, true, false, 0, 0, 0);
  const auto before = serialize_checkpoint(captured);
  w.remembered_dead.front().genome.cppn->history()->next_generation();
  w.remembered_dead.front().genome.cppn->history()->observe_node(100000);
  check(serialize_checkpoint(captured) == before,
        "live evolution cannot change the saved genome of a remembered dead fish");
  std::istringstream input(before);
  auto restored = read_checkpoint(input, 1);
  restored.world.revive_fish(id);
  check(restored.world.fish.size() == 1 && restored.world.fish.front().id == id &&
            restored.world.remembered_dead.empty(),
        "an immutable background snapshot retains the remembered fish for revival");
}

void development_finalization_budget(const Genome &g) {
  auto w = small_world(1852);
  w.evo.development_queries = w.evo.development_query_limit = 1048576;
  w.evo.development_finalizations = 1;
  for (int i = 0; i < 6; ++i)
    check(w.spawn(g, 80 + 70 * i, 100, 1), "concurrent egg fixture");
  for (std::size_t step = 1; step <= w.fish.size(); ++step) {
    auto resumed = w.fork();
    check(saved(w) == saved(resumed), "waiting finalizations retain their development progress");
    StateAccess::develop(w);
    StateAccess::develop(resumed);
    for (auto *world : {&w, &resumed})
      for (auto &p : world->fish)
        if (p.genome.blueprint && !p.body.brain())
          p.body.prepare(p.genome);
    check(saved(w) == saved(resumed), "waiting finalizations resume in the same step");
    const auto ready = std::count_if(w.fish.begin(), w.fish.end(),
                                     [](const auto &p) { return bool(p.genome.blueprint); });
    check(std::size_t(ready) == step,
          "one finalization per step even when query budget covers every egg");
  }
}

void packed_brain_state(const Genome &g) {
  field::Network brain(g.blueprint);
  auto bytes = [](const field::Network &value) {
    std::ostringstream out;
    value.write_runtime(out);
    return out.str();
  };
  const auto dormant = bytes(brain);
  check(dormant.size() < 12 * brain.slot_count(),
        "unused neural reserves are compact without reducing their capacity");
  const auto boundary = dormant.find('\n') + 1;
  check(boundary > 0 && boundary + 5 < dormant.size(), "packed brain fixture has binary blocks");
  auto rejected = [&](const std::string &data) {
    std::istringstream input(data);
    bool failed = false;
    try {
      brain.read_runtime(input);
    } catch (const std::runtime_error &) {
      failed = true;
    }
    check(failed && bytes(brain) == dormant,
          "an invalid packed brain is rejected without changing the live network");
  };
  for (auto cut : {std::size_t(0), boundary, boundary + 1, boundary + 3, dormant.size() - 1})
    rejected(dormant.substr(0, cut));
  auto invalid = dormant;
  invalid[boundary] = 2;
  rejected(invalid);
  invalid = dormant;
  invalid[boundary + 1] = invalid[boundary + 2] = 0;
  invalid[boundary + 3] = char(0xc0);
  invalid[boundary + 4] = char(0x7f);
  rejected(invalid); // NaN in either a literal or repeated block.
  std::vector<float> values(g.interface->sensory.size());
  for (int step = 0; step < 40; ++step) {
    for (std::size_t i = 0; i < values.size(); ++i)
      values[i] = float((step * 3 + i * 7) % 31) / 31;
    brain.step(values, {.1, .2, .3, .4}, 1851);
  }
  const auto learned = bytes(brain);
  field::Network restored(g.blueprint);
  std::istringstream input(learned);
  restored.read_runtime(input);
  check(bytes(restored) == learned, "packed neural state round trips exactly");
  for (int step = 0; step < 12; ++step) {
    brain.step(values, {.2, .3, .4, .1}, 1851);
    restored.step(values, {.2, .3, .4, .1}, 1851);
  }
  check(bytes(restored) == bytes(brain), "learning resumes exactly after packed storage");

  cppn::CPPN query(g.cppn);
  auto plan = std::make_shared<field::Substrate>(query);
  plan->neurons = {sensor(1, 0, 0), motor(2, 0, 0, 0, field::Forward)};
  plan->neurons[1].slots = 129;
  const std::uint32_t negative_zero_bits = 0x80000000u;
  float negative_zero;
  std::memcpy(&negative_zero, &negative_zero_bits, 4);
  plan->edges = {{0, 1, negative_zero}};
  field::Network partial(plan), partial_copy(plan);
  const auto partial_bytes = bytes(partial);
  std::istringstream partial_input(partial_bytes);
  partial_copy.read_runtime(partial_input);
  check(bytes(partial_copy) == partial_bytes && partial_copy.slot_count() == partial.slot_count(),
        "empty learning arrays and partial final blocks round trip");
  const auto connections = partial_copy.synapses();
  std::uint32_t restored_bits = 0;
  check(connections.size() == 1, "zero-strength connection retains its occupied slot");
  std::memcpy(&restored_bits, &connections.front().formed, 4);
  check(restored_bits == negative_zero_bits,
        "packing preserves float bits even when positive and negative zero compare equal");
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

    individual_life_support(g);
    remembered_checkpoint_snapshot();
    packed_brain_state(g);
    development_finalization_budget(g);
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
