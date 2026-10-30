#include "interactive_session.hh"
#include "session_io.hh"
#include "plants.hh"
#include "checkpoint.hh"
#include "view_stream.hh"
#include "command_input.hh"
#include "json_numbers.hh"
#include "interactive.hh"
#include "opencl.hh"
#include "ecology.hh"
#include "founders.hh"
#include "body_plan.hh"
#include "physiology.hh"
#include "observations.hh"
#include "ecology_internal.hh"
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <set>
#include <sstream>
#include <thread>
#include <poll.h>
#include <unistd.h>
namespace fishsim {
int InteractiveSession::run() {
  connect_scenes();
  world.observation_interval = 1200;
  world.workers = o.threads;
  if (o.resume.empty()) {
    std::cout << "{\"event\":\"startup\",\"phase\":\"genome\",\"requested\":" << o.pop << "}\n"
              << std::flush;
    auto apply = [&]() {
      for (const auto &[name, v] : o.parameters)
        if (!world.set_parameter(name, v))
          throw std::runtime_error("Unbekannter Parameter: " + name);
    };
    apply();
    int replaced_founders = 0;
    auto progress = [&](int ready, int attempts) {
      std::cout << "{\"event\":\"startup\",\"phase\":\"population\",\"created\":" << ready
                << ",\"requested\":" << o.pop << ",\"attempts\":" << attempts
                << ",\"replaced_founders\":" << replaced_founders << "}\n"
                << std::flush;
    };
    if (o.choose_population) {
      if (!o.empty_world)
        world.starter_world();
      world.field.configure_seed_food(o.food);
      world.refresh_food_allowance();
      world.field.place_initial_food();
      paused = true;
    } else if (!o.start_genomes.empty()) {
      if (o.start_genomes.size() > std::size_t(o.pop))
        throw std::runtime_error("Mindestens ein Startfisch je gewählter Linie erforderlich.");
      std::vector<Genome> chosen;
      for (const auto &path : o.start_genomes) {
        auto g = Genome::load(path);
        if (!viable_entrant(g))
          throw std::runtime_error("Gewählte Startlinie hat keinen lebensfähigen Körper.");
        chosen.push_back(g);
        world.add_pool_founder(g);
      }
      if (!o.empty_world)
        world.starter_world();
      world.seed(chosen, o.pop, o.food, progress, {}, apply, true);
    } else {
      std::ifstream source(o.input);
      if (!source)
        throw std::runtime_error("Genomdatei fehlt");
      auto founder = Genome::read(source, false);
      founder.development_options = default_development_options;
      founder.compile();
      if (!o.empty_world)
        world.starter_world();
      world.seed(founder, o.pop, o.food, progress, apply);
    }
  } else {
    std::cout << "{\"event\":\"startup\",\"phase\":\"resume\"}\n" << std::flush;
    std::ifstream in(o.resume);
    auto restored = read_checkpoint(in, o.threads);
    session_founder = std::move(restored.founder);
    world = std::move(restored.world);
    selected = restored.selected;
    evolving = restored.evolving;
    protected_life = restored.protected_life;
    completed = restored.completed;
    last_observation = restored.last_observation;
    seen_notifications = restored.seen;
    for (const auto &[name, v] : o.parameters)
      if (!world.set_parameter(name, v))
        throw std::runtime_error("Unbekannter Parameter: " + name);
  }
  std::filesystem::create_directories(o.session + "/spool");
  if (o.resume.empty())
    session_founder = world.support().founder;
  if (o.resume.empty() && !world.fish.empty())
    selected = world.fish.front().id;
  choose();
  // Only transport assets are interned; simulation and checkpoint precision stay intact.
  if (o.resume.empty()) {
    snapshot(false);
    autosave();
  }
  emit();
  auto last_frame = Clock::now(), last_tick = last_frame, last_save = last_frame;
  double credit = 0;
  refresh = false;
  CommandInput input_commands;
  while (!cancelled) {
    if (Clock::now() - last_save >= std::chrono::seconds(30)) {
      autosave();
      last_save = Clock::now();
    }
    pollfd fd{0, POLLIN, 0};
    while (poll(&fd, 1, 0) > 0 && (fd.revents & POLLIN)) {
      char bytes[4096];
      auto n = ::read(0, bytes, sizeof bytes);
      if (n <= 0)
        break;
      input_commands.append(std::string_view(bytes, std::size_t(n)));
    }

    for (const auto &command : input_commands.take())
      dispatch(command);
    if (cancelled)
      break;
    serve_scenes();
    auto tick_now = Clock::now();
    double elapsed = std::chrono::duration<double>(tick_now - last_tick).count();
    last_tick = tick_now;
    if (paused)
      credit = 0;
    else
      credit = std::min(32., credit + elapsed * (delay ? 1000. / delay : 10000));
    int batch = single ? 1 : int(credit);
    if (!single)
      credit -= batch;
    single = false;
    auto batch_start = Clock::now();
    int executed = 0;
    for (int k = 0; k < batch; ++k) {
      auto start = Clock::now();
      world.watched_id = selected;
      world.profile_steps = true;
      world.tick(evolving, protected_life);
      for (auto &p : world.fish)
        p.body.advance_probe();
      curate();
      if (reference)
        reference->tick(false, protected_life);
      tick_ms = .95 * tick_ms +
                .05 * std::chrono::duration<double, std::milli>(Clock::now() - start).count();
      choose();
      if (!live && evolving &&
          world.ticks >= last_observation + std::max(1, world.observation_interval)) {
        ++completed;
        last_observation = world.ticks;
        snapshot(false);
        world.reset_window();
        seen_notifications = world.taxonomy().milestones.size();
      } else if (!live && world.taxonomy().milestones.size() > seen_notifications) {
        snapshot(false);
        seen_notifications = world.taxonomy().milestones.size();
      }
      ++executed;
      if (Clock::now() - batch_start >= std::chrono::milliseconds(35))
        break;
    }
    credit = std::min(32., credit + batch - executed);

    auto now = Clock::now();
    if (refresh ||
        (!paused &&
         std::chrono::duration_cast<std::chrono::milliseconds>(now - last_frame).count() >=
             (o.render_stream || turbo ? 1000 : 50))) {
      if (emit()) {
        refresh = false;
        last_frame = now;
      }
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(paused ? 10 : 1));
  }
  autosave(true);
  emit(true);
  return 0;
}
void InteractiveSession::choose() {
  world.bind_body_identities();
  if (selected &&
      std::none_of(world.fish.begin(), world.fish.end(),
                   [&](const Individual &p) { return p.id == selected; }) &&
      std::none_of(world.corpses.begin(), world.corpses.end(),
                   [&](const Corpse &c) { return c.blood_id == selected; }))
    selected = 0;
}
}
