#include "interactive_session.hh"
#include "world_view.hh"
#include "perception.hh"
#include <iostream>
namespace fishsim {
Individual *InteractiveSession::prepare_inspection() {
  choose();
  return world.prepare_inspection(selected, brain_detail, brain_mode,
                                  o.render_stream ? retinal_focus : neuron_focus);
}
bool InteractiveSession::emit(bool done) {
  if (metadata_output.enabled()) {
    if (done)
      metadata_output.finish();
    else if (!metadata_output.ready())
      return false;
  }
  auto *chosen = prepare_inspection();
  SessionView status;
  status.epoch = render_epoch;
  status.command_request = state_request;
  status.context = view_context;
  status.completed = completed;
  status.binary = o.render_stream;
  status.brain_detail = brain_detail;
  status.brain_mode = brain_mode;
  status.paused = paused;
  status.evolving = evolving;
  status.historical = live.has_value();
  status.protected_life = protected_life;
  status.done = done;
  status.turbo = turbo;
  status.delay = delay;
  status.tick_ms = tick_ms;
  status.notice = notice;
  status.selected = selected;
  status.chosen = chosen;
  status.count = count;
  status.group = group;
  status.pins = pins;
  status.can_undo = geometry_undo.has_value();
  ExperimentView experiment;
  experiment.reference = reference ? &*reference : nullptr;
  experiment.kind = experiment_kind;
  experiment.fish = experiment_fish;
  experiment.start = experiment_start;
  experiment.affected_neurons = experiment_count;
  if (metadata_output.enabled()) {
    auto snapshot = std::make_shared<Ecosystem>(world.observation());
    auto baseline = reference ? std::make_shared<Ecosystem>(reference->observation()) : nullptr;
    const bool reset = reset_metadata;
    reset_metadata = false;
    // Selected-eye and brain activity travel with the independent scene stream.
    std::string inspection;
    if (!o.render_stream) {
      std::ostringstream data;
      write_eye_view(data, chosen);
      write_brain(data, chosen, metadata_layout_revision != layout_revision);
      metadata_layout_revision = layout_revision;
      inspection = data.str();
    }
    metadata_output.send([this, snapshot, baseline, status = std::move(status),
                          experiment = std::move(experiment), inspection = std::move(inspection),
                          reset, mode = brain_mode]() mutable {
      if (reset)
        view_cache.invalidate();
      const auto &saved = *snapshot;
      status.chosen = nullptr;
      for (const auto &p : saved.fish)
        if (p.id == status.selected) {
          status.chosen = &p;
          break;
        }
      status.revision = view_cache.next_revision();
      experiment.reference = baseline.get();
      auto cadence =
          view_cache.begin_frame(status.paused, status.done, status.selected, saved.environment,
                                 mode, !saved.field.vegetation().drifting_grass.empty());
      std::ostringstream out;
      out.imbue(std::cout.getloc());
      WorldViewWriter view(out, saved, status, view_cache);
      view.write(cadence, saved.parameters(), experiment);
      out << inspection;
      view_cache.write_assets(out);
      out << '}';
      view_cache.finish_frame();
      return MetadataOutput::Frame{out.str(), cadence};
    });
    return true;
  }
  auto cadence = view_cache.begin_frame(paused, done, selected, world.environment, brain_mode,
                                        !world.field.vegetation().drifting_grass.empty());
  status.revision = view_cache.next_revision();
  std::ostringstream out;
  out.imbue(std::cout.getloc());
  auto table = world.parameters();
  WorldViewWriter view(out, world, status, view_cache);
  view.write(cadence, table, experiment);
  write_eye_view(out, chosen);
  write_brain(out, chosen, metadata_layout_revision != layout_revision);
  metadata_layout_revision = layout_revision;
  view_cache.write_assets(out);
  out << '}';
  std::cout << view_cache.encode(out.str(), cadence) << '\n' << std::flush;
  view_cache.finish_frame();
  return true;
}
}
