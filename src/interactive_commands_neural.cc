#include "wording.hh"
#include "perception.hh"
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
void InteractiveSession::apply_sensory_probe(Body &b, std::istringstream &line) {
  SensoryProbe p;
  if (!(line >> p.kind >> p.x >> p.y >> p.energy >> p.radius >> p.sense >> p.value))
    throw Refusal("invalidSenseStimulus");
  for (auto &c : p.color)
    if (!(line >> c))
      throw Refusal("lightColorMissing");
  for (auto &c : p.scents)
    if (!(line >> c))
      throw Refusal("scentMixMissing");
  p.x = world.field.wrap_x(p.x);
  p.remaining = 12;
  b.set_probe(p);
}
void InteractiveSession::inspect_selected_brain(const std::string &op, std::istringstream &line,
                                                std::string &) {
  if (op == "stimulate" || op == "stimulate-group" || op == "probe" || op == "brain-turn") {
    if (!brain_mode)
      throw Refusal("zoomIntoFish");
    auto it = std::find_if(world.fish.begin(), world.fish.end(),
                           [&](const Individual &p) { return p.id == selected; });
    if (it == world.fish.end() || !it->body.hatched || !it->body.brain())
      throw Refusal("noHatchedFishSelected");
    auto &b = it->body;
    if (op == "brain-turn") {
      double angle;
      if (!(line >> angle) || !std::isfinite(angle) || std::abs(angle) > 360)
        throw Refusal("invalidGaze");
      b.orient_to(angle * PI / 180);
      b.refresh_senses(it->genome, world.field, world.physiology());
    } else if (op == "stimulate") {
      int id;
      double value;
      if (!(line >> id >> value) || id < 0 || !std::isfinite(value) || value < 0 || value > 1)
        throw Refusal("invalidCellStimulus");
      b.stimulate_neuron(std::size_t(id), float(value));
      ++stimulus_revision;
    } else if (op == "stimulate-group") {
      std::size_t count;
      float value;
      if (!(line >> count >> value) || count == 0 || count > b.brain()->state().size())
        throw Refusal("invalidOrganStimulus");
      std::vector<std::size_t> ids(count);
      for (auto &id : ids)
        if (!(line >> id))
          throw Refusal("cellIdMissing");
      b.stimulate_neurons(ids, value);
      ++stimulus_revision;
    } else {
      apply_sensory_probe(b, line);
      b.refresh_senses(it->genome, world.field, world.physiology());
    }
  }
}
void InteractiveSession::execute_neural(const std::string &op, std::istringstream &line, bool &,
                                        std::string &reply) {
  if (op == "neuron") {
    int n;
    if (line >> n) {
      auto p = std::find_if(world.fish.begin(), world.fish.end(),
                            [&](const Individual &p) { return p.id == selected; });
      if (p == world.fish.end() || !p->genome.blueprint || n < 0 ||
          std::size_t(n) >= p->genome.blueprint->neurons.size())
        throw Refusal("neuronNotInBrain");
      neuron_focus = n;
    }
  } else if (op == "brain-all")
    neuron_focus = -1;
  else if (op == "reset-brain") {
    std::uint64_t id;
    if (line >> id)
      for (auto &p : world.fish)
        if (p.id == id && p.body.brain()) {
          p.body.reset_brain();
        }
  } else if (op == "brain-mode") {
    int n;
    if (!(line >> n) || (n != 0 && n != 1))
      throw Refusal("invalidBrainMode");
    brain_mode = n != 0;
    if (brain_mode) {
      turbo = false;
      brain_detail = true;
    } else
      for (auto &p : world.fish)
        p.body.reset_probe();
  } else if (op == "probe-clear") {
    for (auto &p : world.fish)
      p.body.clear_probe(p.genome, world.field, world.physiology());
  } else if (op == "stimulate" || op == "stimulate-group" || op == "probe" || op == "brain-turn") {
    inspect_selected_brain(op, line, reply);
  } else if (op == "brain") {
    int n;
    if (line >> n)
      brain_detail = n != 0 || brain_mode;
  } else if (op == "select") {
    std::uint64_t n;
    if (line >> n) {
      if (n &&
          std::none_of(world.fish.begin(), world.fish.end(),
                       [&](const Individual &p) { return p.id == n; }) &&
          std::none_of(world.corpses.begin(), world.corpses.end(),
                       [&](const Corpse &c) { return c.blood_id == n; }))
        throw Refusal("animalLeftTank");
      for (auto &p : world.fish)
        p.body.reset_probe();
      selected = n;
      neuron_focus = -1;
      world.watched_death = 0;
      for (const auto &c : world.corpses)
        if (n && c.blood_id == n) {
          world.watched_death = n;
          world.watched_cause = c.death_cause;
        }
    }
  } else if (op == "release-sperm") {
    std::uint64_t id = 0;
    if (!(line >> id) || !id)
      throw Refusal("chooseFish");
    auto it = std::find_if(world.fish.begin(), world.fish.end(),
                           [&](const Individual &p) { return p.id == id; });
    if (it == world.fish.end() || !it->body.alive || !it->body.hatched)
      throw Refusal("fishGone");
    if (!world.release_sperm(*it, true))
      throw Refusal("noRelease");
    world.refresh_sperm_field();
    reply = wording("cloudReleased");
  } else if (op == "pin") {
    std::uint64_t n;
    if (line >> n) {
      if (pins.count(n))
        pins.erase(n);
      else
        pins.insert(n);
    }
  }
}
}
