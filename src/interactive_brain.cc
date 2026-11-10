#include "interactive_session.hh"
#include "receptor_tuning.hh"
#include "session_io.hh"
#include "plants.hh"
#include "checkpoint.hh"
#include "view_stream.hh"
#include "command_input.hh"
#include "json_numbers.hh"
#include "interactive.hh"
#include "opencl.hh"
#include "ecology.hh"
#include "body_plan.hh"
#include "physiology.hh"
#include "observations.hh"
#include "hormone_view.hh"
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
static_assert(hormones::levels == field::HORMONES &&
              hormone_effect::count == field::HORMONE_EFFECTS &&
              hormone_effect::excitation == field::Excitation &&
              hormone_effect::teaching == field::Teaching &&
              hormone_effect::output == field::Output && hormone_effect::death == field::Death);
namespace {
constexpr auto HORMONE_RESEND = std::chrono::milliseconds(200);
constexpr auto WIRING_RESEND = std::chrono::seconds(2);
}
void InteractiveSession::write_brain_neurons(std::ostream &out, const Individual *chosen) {
  const auto &b = chosen->body;
  const auto &g = chosen->genome;
  bool first = true;
  if (g.blueprint)
    for (std::size_t i = 0; brain_detail && i < g.blueprint->neurons.size(); ++i) {
      if (!first)
        out << ',';
      first = false;
      const auto &n = g.blueprint->neurons[i];
      namespace N = neuron_column;
      int port = -1;
      if (n.role == field::Role::Effector) {
        float weight = -1;
        for (const auto &e : g.interface->effectors)
          if (e.neuron == i && e.strength > weight) {
            weight = e.strength;
            port = e.port;
          }
      }
      auto senses = n.functions.senses;
      if (n.functions.senses[field::InnerPressure] > 0)
        for (const auto &r : b.active_interface(g).sensory)
          if (r.neuron == i) {
            std::copy(r.senses.begin(), r.senses.end(), senses.begin());
            break;
          }
      const bool stroking =
          n.role == field::Role::Effector &&
          std::any_of(g.interface->effectors.begin(), g.interface->effectors.end(),
                      [&](const auto &e) {
                        return e.neuron == i &&
                               (e.port == organ_port::pigment || e.port == organ_port::gland ||
                                std::find(STROKE_PORTS.begin(), STROKE_PORTS.end(), e.port) !=
                                    STROKE_PORTS.end());
                      });
      const double tau = n.role == field::Role::Nerve || n.role == field::Role::Sensor || stroking
                             ? field::time_constant_steps(n.parameters)
                             : 0.;
      std::array<double, neuron_parameter_column::count> parameters{};
      {
        namespace P = neuron_parameter_column;
        const auto &q = n.parameters;
        parameters[P::threshold] = q.threshold;
        parameters[P::capacity] = q.capacity;
        parameters[P::quality1] = q.quality1;
        parameters[P::quality2] = q.quality2;
        parameters[P::quality_width] = q.quality_width;
        parameters[P::field_width] = q.field_width;
        parameters[P::time_constant] = q.time_constant;
        parameters[P::learning_time] = q.learning_time;
        parameters[P::plasticity] = q.plasticity;
      }
      std::array<double, neuron_site_column::count> site{};
      site[neuron_site_column::u] = n.location.u;
      site[neuron_site_column::v] = n.location.v;
      site[neuron_site_column::w] = n.location.w;
      site[neuron_site_column::side] = n.location.side;
      std::array<double, field::HORMONE_EFFECTS> hormone_response{};
      for (int k = 0; k < field::HORMONE_EFFECTS; ++k)
        hormone_response[k] =
            n.hormone_receptors[k].response(b.hormones().levels(), body_maturity(b));
      const auto activity =
          b.brain() ? (n.functions.sensory() > 0 ? b.brain()->signal(i) : b.brain()->state()[i])
                    : 0;
      Record(out, N::count)(N::x, n.x)(N::y, n.y)(N::role, int(n.role))(N::activity, activity)(
          N::functional, n.functional ? 1 : 0)(N::index, i)(N::id, n.id)(
          N::ready, b.brain() && b.brain()->life(i) == field::Network::CellLife::Active)(N::z, n.z)(
          N::port, port)(N::muted, b.brain() && b.brain()->muted(i) ? 1 : 0)(
          N::strength, n.strength)(N::internal, n.functions.internal)
          .list(N::senses, senses)
          .list(N::motors, n.functions.motors)(N::bias, n.bias)(N::time_constant, tau)
          .list(N::identity, n.identity)(N::state, 0)(N::signal, 0)
          .list(N::parameters, parameters)(N::usable, n.functions.usable)(N::zone, n.location.zone)
          .list(N::sender, n.sender)
          .list(N::receiver, n.receiver)
          .list(N::hormone_response, hormone_response)
          .list(N::site, site)(N::dead, b.brain() && b.brain()->dead(i) ? 1 : 0)(
              N::synaptic_mean, b.brain() ? b.brain()->synaptic_mean(i) : 0)(
              N::expression, n.expression)(N::search_width, n.search_width)(
              N::crossing, n.crossing)(N::range, n.range)(N::life,
                                                          b.brain() ? int(b.brain()->life(i)) : 0)(
              N::development, b.brain() ? b.brain()->development_progress(i) : 0)(
              N::command, b.brain() ? b.brain()->organ_output()[i] : 0)
          .finish();
    }
}
void InteractiveSession::write_brain_receptors(std::ostream &out, const Individual *chosen) {
  const auto &b = chosen->body;
  const auto &g = chosen->genome;
  if (brain_detail && g.interface)
    for (std::size_t i = 0; i < g.interface->sensory.size(); ++i) {
      if (i)
        out << ',';
      const auto &r = b.active_interface(g).sensory[i];
      write_receptor(out, r, g.blueprint->neurons[r.neuron],
                     i < b.perception().sensor_buffer.size() ? b.perception().sensor_buffer[i] : 0);
    }
}
void InteractiveSession::write_brain_summary(std::ostream &out, const Individual *chosen) {
  const auto &b = chosen->body;
  const auto &g = chosen->genome;
  out << "{\"id\":" << chosen->id << ",\"hatch_reserve\":";
  auto reserve = chosen->developing()
                     ? predicted_hatch_reserve(b, g, world.physiology().neural_cost)
                     : std::nullopt;
  if (reserve)
    out << *reserve;
  else
    out << "null";
  out << ",\"embryo\":{\"shell\":" << b.embryo.shell << ",\"pressure\":" << b.embryo.pressure
      << ",\"exposure\":" << ([&] {
           double progress = 0;
           if (!g.interface || g.interface->sensory.empty())
             return b.hatched ? 1. : 0.;
           for (const auto &r : g.interface->sensory)
             progress += birth_exposure(b, r.time_steps);
           return progress / g.interface->sensory.size();
         })()
      << ",\"reserve\":" << hatch_search_reserve(b) << ",\"secretion\":" << b.embryo.secretion
      << "}";
  out << ",\"bite_signal\":" << b.bite_signal << ",\"mouth_aperture\":" << mouth_aperture(b)
      << ",\"maximum_mouth_aperture\":" << maximum_mouth_aperture(b)
      << ",\"mouth_phase\":" << b.mouth.phase << ",\"mouth_opening\":" << b.mouth.opening
      << ",\"pump_flow\":" << b.mouth.flow << ",\"transport_budget\":" << b.mouth.budget
      << ",\"transport_credit\":" << b.mouth.credit
      << ",\"mouth_reach\":" << mouth_reach(b) * world.physiology().suction_range
      << ",\"bite_strength\":" << b.bite_strength << ",\"jaw_length\":" << b.jaw_length
      << ",\"gut_length\":" << b.gut_length << ",\"blunt_teeth\":" << b.blunt_teeth
      << ",\"undulation\":" << b.undulation << ",\"suction_strength\":" << b.suction_strength
      << ",\"soft_bite_force\":" << bite_force(b) << ",\"hard_bite_force\":" << bite_force(b, true)
      << ",\"scrape_force\":" << scrape_force(b) << ",\"end_tissue\":" << tissue_capacity(b)
      << ",\"gut_energy\":" << b.gut_energy << ",\"gut_digestible\":" << b.gut_digestible
      << ",\"digestion\":" << b.digestion << ",\"digested\":" << b.digested
      << ",\"digestion_net\":" << (1 - PhysiologyParameters::digestion_cost) * b.digestion
      << ",\"gut_transit\":" << gut_transit(b, world.physiology());
  out << ",\"model\":" << json_quoted("cppn") << ",\"hatched\":" << (b.hatched ? "true" : "false")
      << ",\"fertilised\":" << (chosen->fertilised ? "true" : "false")
      << ",\"clonal\":" << (chosen->clonal ? "true" : "false")
      << ",\"egg_role\":" << (b.reproduction().egg_role ? "true" : "false")
      << ",\"father\":" << chosen->father << ",\"spawn_signal\":" << b.reproduction().spawn_signal
      << ",\"sperm_signal\":" << b.reproduction().sperm_signal << ",\"eat_signal\":" << b.eat_signal
      << ",\"egg_readiness\":" << b.reproduction().egg_readiness
      << ",\"sperm_readiness\":" << b.reproduction().sperm_readiness
      << ",\"eggs_eaten\":" << b.eggs_eaten << ",\"health\":" << b.health
      << ",\"tissue\":" << b.tissue << ",\"peak_tissue\":" << std::max(b.peak_tissue, b.tissue)
      << ",\"tissue_floor\":" << tissue_floor(b) << ",\"aggression\":" << b.motor().aggression
      << ",\"active_defense\":" << b.motor().defense << ",\"defense\":" << b.defense()
      << ",\"combat_cost\":" << b.motor().combat_cost << ",\"color\":[" << b.color[0] << ','
      << b.color[1] << ',' << b.color[2] << "],\"readiness\":" << b.reproduction().readiness
      << ",\"novelty\":" << chosen->novelty
      << ",\"viable\":" << (!g.blueprint || g.viable() ? "true" : "false")
      << ",\"diagnostic\":" << json_quoted(g.blueprint ? g.blueprint->diagnostic : "")
      << ",\"hatch_age\":" << b.hatch_age << ",\"maintenance\":"
      << (b.development() ? b.development()->running_cost() * world.physiology().neural_cost : 0)
      << ",\"movement_cost\":" << b.ledger().movement_cost
      << ",\"development_cost\":" << b.ledger().development_cost << ",\"birth_cost\":"
      << (b.development() ? b.development()->birth_cost() * world.physiology().neural_cost : 0)
      << ",\"motor_factor\":" << b.motor().motor_factor << ",\"thrust\":" << b.motor().thrust
      << ",\"turn\":" << b.motor().turn << ",\"contact\":" << b.reproduction().contact
      << ",\"nutrient_flow\":" << b.nutrient_flow
      << ",\"runtime_bytes\":" << (b.brain() ? b.brain()->runtime_bytes() : 0)
      << ",\"innovation_period\":" << (g.cppn ? g.cppn->history()->generation() : 0)
      << ",\"cppn_nodes\":" << (g.cppn ? g.cppn->nodes() : 0)
      << ",\"planning\":" << (!g.blueprint ? "true" : "false")
      << ",\"planning_queries\":" << g.pending_queries()
      << ",\"neuron_count\":" << (g.blueprint ? g.blueprint->neurons.size() : 0)
      << ",\"edge_count\":"
      << (b.brain()     ? b.brain()->synapse_count()
          : g.blueprint ? g.blueprint->edges.size()
                        : 0)
      << ",\"recurrent_edges\":" << (g.blueprint ? g.blueprint->recurrent_edges : 0)
      << ",\"internal_neurons\":"
      << (g.blueprint ? std::count_if(g.blueprint->neurons.begin(), g.blueprint->neurons.end(),
                                      [](const auto &n) { return n.role == field::Role::Nerve; })
                      : 0)
      << ",\"node_budget\":" << g.development_options.max_nodes
      << ",\"edge_budget\":" << g.development_options.max_edges
      << ",\"architecture\":{\"sites\":" << field::DEVELOPMENT_SITES
      << ",\"mutation_step\":" << g.mutation_step << '}';
}
void InteractiveSession::write_brain_layout(std::ostream &out, const Individual *chosen) {
  const auto &g = chosen->genome;
  bool first = true;
  out << ",\"layout\":{\"receptors\":[";
  write_brain_receptors(out, chosen);

  out << "],\"effectors\":[";
  if (g.interface)
    for (std::size_t i = 0; i < g.interface->effectors.size(); ++i) {
      if (i)
        out << ',';
      const auto &e = g.interface->effectors[i];
      namespace E = effector_column;
      Record(out, E::count)(E::neuron, e.neuron)(E::port, e.port)(E::threshold, e.threshold)(
          E::strength, e.strength)(E::lever, e.lever)(E::hue, tuning_hue(e.quality))(E::outside,
                                                                                     e.outside)
          .finish();
    }
  out << "],\"focus\":" << neuron_focus << ",\"motor_counts\":[";
  write_values(out,
               g.interface ? g.interface->motor_counts : decltype(BrainInterface::motor_counts){});
  out << "],\"neurons\":[";
  first = true;
  write_brain_neurons(out, chosen);
  out << "],\"edges\":[";
  first = true;
  if (brain_detail && chosen->body.brain())
    for (const auto &e : chosen->body.brain()->synapses()) {
      if (!first)
        out << ',';
      first = false;
      namespace S = synapse_column;
      Record(out, S::count)(S::source, e.source)(S::target, e.target)(S::strength, e.weight)(S::id,
                                                                                             e.slot)
          .finish();
    }
  else if (brain_detail && g.blueprint)
    for (std::size_t i = 0; i < g.blueprint->edges.size(); ++i) {
      if (!first)
        out << ',';
      first = false;
      const auto &e = g.blueprint->edges[i];
      namespace S = synapse_column;
      Record(out, S::count)(S::source, e.source)(S::target, e.target)(S::strength, 0)(S::id, i)
          .finish();
    }
  out << "]}";
}
void InteractiveSession::write_brain_activity(std::ostream &out, const Individual *chosen) {
  const auto &g = chosen->genome;
  const auto &b = chosen->body;
  const auto &f = world.field;
  std::size_t nearby_eggs = 0;
  for (const auto &egg : world.fish)
    if (egg.body.alive && !egg.body.hatched && !egg.nutrient_egg &&
        (egg.species ? egg.species : egg.maternal_species) == chosen->species &&
        std::hypot(f.delta_x(egg.body.x - b.x), egg.body.y - b.y) <= world.evo.egg_crowding_radius)
      ++nearby_eggs;
  out << ",\"motor_pulses\":[";
  for (int j = 0; j < field::MOTOR_COUNT; ++j) {
    if (j)
      out << ',';
    out << int(b.motor().motor_pulses[j]);
  }
  out << ']';
  out << ",\"stroke_threshold\":" << world.physiology().stroke_threshold << ",\"strokes\":[";
  for (int j = 0; g.interface && j < STROKE_COUNT; ++j) {
    if (j)
      out << ',';
    const auto &stroke = b.motor().strokes[j];
    namespace S = stroke_column;
    Record(out, S::count)(S::mean, stroke.mean)(S::recovery, stroke.recovery)(
        S::power, stroke.power)(S::steps, b.active_interface(g).stroke_timing[j].steps)
        .finish();
  }
  out << "],\"velocity\":[" << b.motor().vx << ',' << b.motor().vy << "],\"water_velocity\":["
      << b.motor().water_vx << ',' << b.motor().water_vy << "],\"contact_vector\":["
      << b.motor().contact_x << ',' << b.motor().contact_y
      << "],\"sperm_laying\":" << (b.reproduction().sperm_laying ? "true" : "false");
  out << ",\"egg_laying\":" << (b.reproduction().egg_laying ? "true" : "false")
      << ",\"egg_nearby\":" << nearby_eggs << ",\"egg_nutrient\":"
      << (b.reproduction().egg_yolk > 0 &&
                  b.reproduction().egg_yolk <
                      world.evo.nutrient_egg_threshold *
                          funding(g, world.physiology().neural_cost, HATCH_TISSUE)
              ? "true"
              : "false");
  out << ",\"gonad_filling\":" << gonad_filling(b) << ",\"gut_fill\":" << b.gut_fill
      << ",\"gut_capacity\":" << gut_capacity(b) << ",\"satiety\":" << gut_filling(b)
      << ",\"damage\":" << (1 - b.health) << ",\"bladder_fill\":" << b.bladder_fill
      << ",\"bladder_capacity\":" << b.bladder_capacity
      << ",\"buoyancy_force\":" << b.buoyancy_force
      << ",\"egg_release\":" << (b.reproduction().egg_release ? "true" : "false")
      << ",\"sperm_release\":" << (b.reproduction().sperm_release ? "true" : "false");
  write_sense_report(out, chosen);
  const auto now = Clock::now();
  if (hormone_fish != chosen->id || hormone_context != view_context ||
      now - hormone_sent >= HORMONE_RESEND) {
    hormone_fish = chosen->id;
    hormone_context = view_context;
    hormone_sent = now;
    out << ",\"hormones\":";
    const auto *species = world.find_species(chosen->species);
    write_hormone_state(out, b.hormones(), species ? &species->hormones : nullptr);
  }
}
void InteractiveSession::write_brain_learning(std::ostream &out, const Individual *chosen) {
  const auto &b = chosen->body;
  const auto &g = chosen->genome;
  out << ",\"learning\":{\"steps\":" << (b.brain() ? b.brain()->learning_steps() : 0)
      << ",\"cells\":" << (b.brain() ? b.brain()->learning_neurons() : 0)
      << ",\"changed\":" << (b.brain() ? b.brain()->learned_connections() : 0) << ",\"weights\":[";
  if (brain_detail && b.brain()) {
    bool first = true;
    for (const auto &e : b.brain()->synapses()) {
      if (!first)
        out << ',';
      first = false;
      out << '[' << e.slot << ',' << e.weight << ']';
    }
  }
  out << "],\"signals\":[";
  if (brain_detail && b.brain() && b.brain()->has_contributions())
    for (std::size_t i = 0; i < b.brain()->slot_count(); ++i) {
      if (i)
        out << ',';
      out << b.brain()->contribution(i);
    }
  out << "],\"surprise\":[";
  if (brain_detail && b.brain() && g.blueprint)
    for (std::size_t i = 0; i < g.blueprint->neurons.size(); ++i) {
      if (i)
        out << ',';
      out << '[' << b.brain()->surprise(i) << ',' << b.brain()->learning_contrast(i) << ']';
    }
  out << "]}";
}
void InteractiveSession::write_brain_senses(std::ostream &out, const Individual *chosen) {
  const auto &b = chosen->body;
  const auto &g = chosen->genome;
  static_assert(sensory_component::neuron == 0 && sensory_component::senses == 1);
  out << ",\"sensory_components\":[";
  if (g.interface)
    for (std::size_t i = 0; i < b.perception().sensory_components.size(); ++i) {
      if (i)
        out << ',';
      out << '[' << g.interface->sensory[i].neuron;
      for (auto v : b.perception().sensory_components[i])
        out << ',' << v;
      out << ']';
    }
  out << "],\"lateral_samples\":[";
  for (int k = 0; k < 4; ++k) {
    if (k)
      out << ',';
    out << '[';
    write_values(out, b.perception().lateral_samples[k]);
    out << ']';
  }
  out << "],\"nose_samples\":[";
  for (int k = 0; k < 2; ++k) {
    if (k)
      out << ',';
    out << '[';
    write_values(out, b.perception().nose_samples[k]);
    out << ']';
  }
  out << ']';
}
constexpr double SENSE_REPORT_STEP = .001;
void InteractiveSession::write_sense_report(std::ostream &out, const Individual *chosen) {
  const auto &g = chosen->genome;
  const auto &brain = chosen->body.brain();
  std::array<int, field::SENSE_COUNT> cells{};
  std::array<std::array<double, 2>, field::SENSE_COUNT> sum{};
  std::array<std::array<int, 2>, field::SENSE_COUNT> count{};
  std::array<double, odor_kind::count> scents{};
  double hubs = 0, pigment = 0;
  int hub_cells = 0, pigment_cells = 0;
  const auto round = [](double v) { return std::round(v / SENSE_REPORT_STEP) * SENSE_REPORT_STEP; };
  const auto mean = [&](double total, int n) { return n ? round(total / n) : 0.; };
  if (brain && g.interface && g.blueprint) {
    for (const auto &r : chosen->body.active_interface(g).sensory) {
      if (brain->life(r.neuron) != field::Network::CellLife::Active)
        continue;
      const int sense = r.dominant_sense(),
                side = g.blueprint->neurons[r.neuron].location.side < 0 ? 0 : 1;
      const double signal = std::abs(brain->signal(r.neuron));
      ++cells[sense];
      sum[sense][side] += signal;
      ++count[sense][side];
      if (sense == field::Odor)
        for (int k = 0; k < odor_kind::count; ++k)
          scents[k] += signal * r.scents[k];
    }
    for (auto &v : scents)
      v = round(v);
    for (std::size_t i = 0; i < g.blueprint->neurons.size(); ++i)
      if (g.blueprint->neurons[i].role == field::Role::Nerve &&
          brain->life(i) == field::Network::CellLife::Active) {
        hubs += std::abs(brain->state()[i]);
        ++hub_cells;
      }
    for (const auto &e : chosen->body.active_interface(g).effectors)
      if (e.port == organ_port::pigment) {
        pigment += std::abs(brain->organ_output()[e.neuron]);
        ++pigment_cells;
      }
  }
  std::array<double, field::SENSE_COUNT> left{}, right{};
  for (int s = 0; s < field::SENSE_COUNT; ++s) {
    left[s] = mean(sum[s][0], count[s][0]);
    right[s] = mean(sum[s][1], count[s][1]);
  }
  out << ",\"sense_report\":{\"cells\":[";
  write_values(out, cells);
  out << "],\"left\":[";
  write_values(out, left);
  out << "],\"right\":[";
  write_values(out, right);
  out << "],\"scents\":[";
  write_values(out, scents);
  out << "],\"hubs\":" << mean(hubs, hub_cells) << ",\"pigment\":" << mean(pigment, pigment_cells)
      << ",\"pigment_cells\":" << pigment_cells << '}';
}
void InteractiveSession::write_brain_probe(std::ostream &out, const Individual *chosen) {
  const auto &b = chosen->body;
  const auto &g = chosen->genome;
  out << ",\"layout_id\":" << json_quoted(render_epoch + ":" + std::to_string(layout_revision))
      << ",\"neuron_state\":[";
  if (brain_detail && g.blueprint)
    for (std::size_t i = 0; i < g.blueprint->neurons.size(); ++i) {
      if (i)
        out << ',';
      const auto &n = g.blueprint->neurons[i];
      namespace S = neuron_state_column;
      Record(out, S::count)(
          S::activity,
          b.brain()
              ? (n.functions.sensory() > 0 ? b.brain()->signal(i) : b.brain()->state()[i])
              : 0)(S::ready, b.brain() && b.brain()->life(i) == field::Network::CellLife::Active)(
          S::muted, b.brain() && b.brain()->muted(i) ? 1 : 0)(
          S::state, b.brain() ? b.brain()->state()[i] : 0)(
          S::signal, b.brain() ? b.brain()->signal(i) : 0)(S::life,
                                                           b.brain() ? int(b.brain()->life(i)) : 0)(
          S::development, b.brain() ? b.brain()->development_progress(i)
                                    : 0)(S::command, b.brain() ? b.brain()->organ_output()[i] : 0)
          .finish();
    }
  out << "],\"stimulus_revision\":" << stimulus_revision
      << ",\"inspection\":" << (brain_mode ? "true" : "false")
      << ",\"probe\":{\"kind\":" << b.perception().probe.kind
      << ",\"sense\":" << b.perception().probe.sense
      << ",\"remaining\":" << b.perception().probe.remaining << ",\"x\":" << b.perception().probe.x
      << ",\"y\":" << b.perception().probe.y << ",\"radius\":" << b.perception().probe.radius
      << ",\"energy\":" << b.perception().probe.energy
      << ",\"value\":" << b.perception().probe.value << ",\"color\":[";
  write_values(out, b.perception().probe.color);
  out << "],\"scents\":[";
  write_values(out, b.perception().probe.scents);
  out << "]},\"sensor_state\":[";
  if (brain_detail && g.interface)
    for (std::size_t i = 0; i < g.interface->sensory.size(); ++i) {
      if (i)
        out << ',';
      out << (i < b.perception().sensor_buffer.size() ? b.perception().sensor_buffer[i] : 0);
    }
}
void InteractiveSession::write_eye_view(std::ostream &out, const Individual *chosen) {
  out << ",\"vision\":";
  if (!chosen || !chosen->body.hatched || !chosen->genome.interface) {
    out << "null";
    return;
  }
  const auto &state = chosen->body.perception();
  out << "{\"id\":" << chosen->id
      << ",\"enabled\":" << (state.disabled_senses[field::Light] ? "false" : "true") << ',';
  write_sight(out, state);
  out << '}';
}
void InteractiveSession::write_brain_vision(std::ostream &out, const Individual *chosen) {
  const auto &b = chosen->body;
  out << "],\"visual_contributions\":[";
  for (std::size_t i = 0; i < b.perception().visual_contributions.size(); ++i) {
    if (i)
      out << ',';
    const auto &h = b.perception().visual_contributions[i];
    namespace V = visual_contribution_column;
    Record(out, V::count)(V::neuron, h.neuron)(V::kind, h.kind)(V::id, h.id)(V::x, h.x)(V::y, h.y)(
        V::radius, h.radius)(V::light, h.light)(V::red, h.color[rgb::red])(
        V::green, h.color[rgb::green])(V::blue, h.color[rgb::blue])
        .finish();
  }
  out << "],\"visual_samples\":[";
  write_visual_samples(out, b.perception());
  out << "]}";
}
void InteractiveSession::write_brain(std::ostream &out, const Individual *chosen,
                                     bool force_layout) {
  out << ",\"brain\":";
  if (!chosen || chosen->nutrient_egg)
    out << "null";
  else {
    const auto &g = chosen->genome;
    const auto now = Clock::now();
    const std::uint64_t wiring =
        chosen->body.brain() ? chosen->body.brain()->wiring_revision() + 1 : 0;
    const bool plan_changed = !layout_revision || sent_fish != chosen->id ||
                              sent_plan != g.blueprint || sent_detail != brain_detail ||
                              (wiring != sent_wiring && now - wiring_sent >= WIRING_RESEND);
    if (plan_changed) {
      sent_fish = chosen->id;
      sent_plan = g.blueprint;
      sent_detail = brain_detail;
      sent_wiring = wiring;
      wiring_sent = now;
      ++layout_revision;
    }
    const bool layout_changed = plan_changed || force_layout;
    write_brain_summary(out, chosen);
    if (layout_changed) {
      write_brain_layout(out, chosen);
    }
    write_brain_activity(out, chosen);
    write_brain_learning(out, chosen);
    write_brain_senses(out, chosen);
    write_brain_probe(out, chosen);
    write_brain_vision(out, chosen);
  }
}
}
