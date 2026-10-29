#include "state_population.hh"
#include "state_validation.hh"
#include "physiology.hh"
#include <ostream>
#include <map>
namespace fishsim {
void write_population_state(std::ostream &out, const std::vector<Individual> &fish,
                            const std::vector<const Genome *> &genes) {
  auto gene_id = [&](const Genome &g) {
    for (std::size_t i = 0; i < genes.size(); ++i)
      if (g.cppn && state::same_development(*genes[i], g))
        return i;
    throw std::logic_error("population genome missing from checkpoint table");
  };
  std::map<const field::Substrate *, std::size_t> plan_ids;
  out << fish.size() << '\n';
  for (const auto &p : fish) {
    out << gene_id(p.genome) << ' ' << p.id << ' ' << p.parent << ' ' << p.father << ' ' << p.born
        << ' ' << p.last_spawn << ' ' << p.depth << ' ' << p.offspring << ' ' << p.origin << ' '
        << p.observations().window_food << ' ' << p.observations().window_steps << ' '
        << p.observations().window_turn << ' ' << p.observations().window_pauses << ' '
        << p.fertilised << ' ' << p.clonal << ' ' << p.observations().visited << ' ' << p.novelty
        << ' ' << p.observations().window_travel << ' ' << p.last_sperm << ' '
        << p.observations().window_eggs << ' ' << p.observations().window_corpses << ' '
        << p.species << ' ' << p.maternal_species << ' ' << p.paternal_species << ' '
        << p.maternal_depth << ' ' << p.paternal_depth << ' ' << p.maternal_natural << ' '
        << p.paternal_natural << ' ' << p.observations().window_mouth << ' ' << p.g << ' '
        << p.maternal_g << ' ' << p.nutrient_egg << ' ' << p.feeding_generations << '\n';
    std::size_t plan_id = 0;
    if (p.genome.growing) {
      auto added = plan_ids.emplace(p.genome.growing.get(), plan_ids.size() + 1);
      plan_id = added.first->second;
    }
    out << "DEVELOPMENT " << (!p.nutrient_egg && !p.genome.blueprint) << ' '
        << p.genome.pending_queries() << ' ' << plan_id << '\n';
    out << p.observations().hormone_release_pending << ' '
        << p.observations().hormone_nutrition_sample << '\n';
    p.observations().hormones.write(out);
    p.observations().window_hormones.write(out);
    const auto &b = p.body;
    out << b.x << ' ' << b.y << ' ' << b.angle << ' ' << b.motor().speed << ' ' << b.motor().turn
        << ' ' << b.motor().travel << ' ' << b.eaten << ' ' << b.hunger << ' ' << b.age << ' '
        << b.energy << ' ' << b.alive << ' ' << b.hatched << ' ' << b.hatch_age << ' '
        << b.reproduction().egg_role << ' ' << b.reproduction().spawn_signal << ' '
        << b.reproduction().readiness << ' ' << b.reproduction().contact << ' '
        << b.ledger().movement_cost << ' ' << b.ledger().brain_cost << ' '
        << b.ledger().development_cost << ' ' << b.ledger().construction_paid << ' '
        << b.ledger().queries_paid << ' ' << b.anchored << ' ' << b.reproduction().sperm_signal
        << ' ' << b.eat_signal << ' ' << b.reproduction().egg_readiness << ' '
        << b.reproduction().sperm_readiness << ' ' << b.eggs_eaten << ' ' << b.color[0] << ' '
        << b.color[1] << ' ' << b.color[2] << '\n';
    out << b.fatal_cause << ' ' << b.tissue << ' ' << b.health << ' ' << b.motor().vx << ' '
        << b.motor().vy << ' ' << b.motor().thrust << ' ' << b.motor().torque << ' '
        << b.motor().aggression << ' ' << b.motor().defense << ' ' << b.motor().combat_cost << ' '
        << b.motor().contact_x << ' ' << b.motor().contact_y << ' ' << b.motor().impact << ' '
        << b.nutrient_flow << '\n';
    out << "TISSUE_PEAK " << std::max(b.peak_tissue, b.tissue) << ' ' << b.birth_tissue
        << "\nMOUTH " << b.bite_signal << ' ' << b.egg_shell_radius << ' ' << b.force_scale << ' '
        << b.resting_defense << ' ' << b.sediment_coverage << '\n';
    out << "EMBRYO " << b.embryo.target_tissue << ' ' << b.embryo.shell << ' ' << b.embryo.secretion
        << ' ' << b.embryo.pending << ' ' << b.embryo.pressure;
    for (double v : b.embryo.touch)
      out << ' ' << v;
    for (double v : b.embryo.flow)
      out << ' ' << v;
    out << '\n';
    out << "MOUTH_CYCLE " << b.mouth.phase << ' ' << b.mouth.duration << ' ' << b.mouth.cycle << ' '
        << b.mouth.biting << ' ' << b.mouth.closing << ' ' << b.mouth.opening << ' '
        << b.mouth.budget << ' ' << b.mouth.credit << ' ' << b.mouth.flow << ' '
        << b.mouth.swallowed << ' ' << b.mouth.filtered << '\n';
    out << "MEASUREMENTS " << b.nutrition << ' ' << b.nutrition_steps << ' '
        << p.observations().window_nutrition << ' ' << p.observations().window_prey_nutrition << ' '
        << p.observations().window_spawn << ' ' << p.observations().window_sperm;
    for (double d : p.observations().window_traits)
      out << ' ' << d;
    for (double d : p.observations().raw_diet)
      out << ' ' << d;
    for (double d : p.observations().diet)
      out << ' ' << d;
    out << ' ' << p.observations().habitat_steps << ' ' << p.observations().bottom_steps << ' '
        << p.observations().top_steps;
    for (double x : p.observations().window_diet)
      out << ' ' << x;
    out << ' ' << p.observations().window_bottom << ' ' << p.observations().window_top << ' '
        << p.observations().window_pulses << ' ' << p.observations().window_glides << '\n';
    out << "SWIMMING " << b.motor().water_vx << ' ' << b.motor().water_vy << ' '
        << b.motor().relative_speed << ' ' << b.motor().impulse_left << ' '
        << b.motor().impulse_right << ' ' << b.motor().tail << ' ' << b.motor().impulse_forward
        << ' ' << b.motor().motor_factor;
    for (double tension : b.motor().fin_tension)
      out << ' ' << tension;
    out << ' ' << b.motor().swimming_pending << ' ' << b.motor().angular_velocity << '\n';
    out << "GAMETES " << b.reproduction().egg_yolk << ' ' << b.reproduction().egg_laying << ' '
        << b.reproduction().sperm_store;
    for (const auto *colors :
         {&b.reproduction().egg_color, &b.reproduction().sperm_color,
          &b.reproduction().egg_signal_color, &b.reproduction().sperm_signal_color})
      for (double c : *colors)
        out << ' ' << c;
    out << '\n';
    out << "MOTORS ";
    for (const auto &stroke : b.motor().strokes)
      out << stroke.mean << ' ' << stroke.power << ' ' << stroke.recovery << ' ';
    for (double x : b.motor().pigment)
      out << x << ' ';
    out << b.reproduction().egg_transfer << ' ' << b.reproduction().sperm_transfer << ' '
        << b.reproduction().sperm_laying << ' ' << b.motor().mouth_pose << '\n';
    out << "ORGAN_STATE " << b.gut_energy << ' ' << b.gut_digestible << ' ' << b.digestion << ' '
        << b.rest_cost << ' ' << b.digested << ' ' << b.feces_pending << ' ' << b.organ_mass_ref
        << ' ' << b.feeding_action << ' ' << b.feeding_action_age << ' ' << b.gut_fill << ' '
        << b.bladder_fill << ' ' << b.buoyancy_force << ' ' << b.reproduction().egg_release << ' '
        << b.reproduction().sperm_release;
    out << ' ';
    for (double v : b.damage_sectors)
      out << v << ' ';
    b.hormones().write(out);
    for (double v : b.perception().touch_ring)
      out << ' ' << v;
    for (double v : b.perception().impact_ring)
      out << ' ' << v;
    out << '\n';
    out << "SENSE_SWITCHES ";
    for (bool disabled : b.perception().disabled_senses)
      out << disabled << ' ';
    out << '\n';
    out << "HABITAT " << p.observations().window_surface << ' ' << p.observations().window_grass
        << ' ' << p.observations().window_turbidity << ' ' << p.observations().window_current
        << '\n';
    out << "ECOLOGY " << p.observations().ecology_steps << ' ' << p.observations().drift_nutrition;
    for (double v : p.observations().habitat_totals)
      out << ' ' << v;
    out << '\n';
    out << "DISEASE " << b.disease << '\n';
    out << b.perception().sensor_buffer.size() << ' ';
    for (float v : b.perception().sensor_buffer)
      out << v << ' ';
    out << '\n';
    out << "ADAPTED " << b.perception().adapted.size() << ' ';
    for (float v : b.perception().adapted)
      out << v << ' ';
    out << '\n';
    out << (b.development() ? b.development()->completed_work() : 0) << '\n';
    if (b.brain())
      b.brain()->write_runtime(out);
  }
}
}
