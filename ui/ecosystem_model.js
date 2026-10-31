// The tank as a budget, in plain numbers: where the stored energy sits and what the fish took
// from each source recently, which habitats the living fish use, how many are sick and from
// what, and what the fish died of. Views give the groups their names and colours.
import {FISH} from './schema.js';
export const ecosystem_modelState = {};

// Food sources of the energy budget; `sources` index the diet vectors of the simulation.
export const ENERGY_GROUPS = [
  {key : 'food', sources : [ 0 ]}, {key : 'grass', sources : [ 5 ]},
  {key : 'drift', sources : [ 5 ]}, {key : 'algae', sources : [ 4 ]},
  {key : 'plankton', sources : [ 6 ]}, {key : 'worms', sources : [ 7 ]},
  {key : 'shellfish', sources : [ 8, 9 ]}, {key : 'detritus', sources : [ 10 ]},
  {key : 'animal', sources : [ 1, 2, 3 ]}
];
// Energy held outside the food sources.
export const ENERGY_STORES = [ 'gut', 'sperm' ];
export const HABITATS = [ 'surface', 'grass', 'buried', 'shadow', 'light' ];
export const DISEASE_ROUTES = [ 'spontaneous', 'food', 'carrion', 'contact' ];

export function energyBudget(f) {
  const energy = f.energy_breakdown || {}, diet = f.recent_diet || [], drift = f.recent_drift || 0,
        values = {
          ...energy,
          shellfish : (energy.crabs || 0) + (energy.mussels || 0),
          animal : (energy.fish || 0) + (energy.eggs || 0) + (energy.corpses || 0)
        };
  const uptake = group => group.key === 'drift' ? Math.min(diet[5] || 0, drift)
                          : group.key === 'grass'
                              ? Math.max(0, (diet[5] || 0) - drift)
                              : group.sources.reduce((a, j) => a + (diet[j] || 0), 0);
  return {
    total : Object.values(energy).reduce((a, b) => a + b, 0),
    eaten : diet.reduce((a, b) => a + b, 0),
    window : f.performance?.window_steps || 0,
    values,
    groups : ENERGY_GROUPS.map(g => ({...g, stock : values[g.key] || 0, uptake : uptake(g)}))
  };
}

// Time shares of the living fish per habitat, from their observed ecology.
export function populationHabitat(f) {
  const ids = new Set((f.fish || []).filter(p => p[FISH.hatched]).map(p => p[FISH.id])),
        observed = (f.traits || []).filter(trait => ids.has(trait.id)),
        samples = observed.reduce((n, trait) => n + (trait.ecology_steps || 0), 0);
  return {
    samples,
    shares :
        HABITATS.map((_, i) => observed.reduce((n, trait) => n + (trait.ecology?.[i] || 0), 0) /
                               Math.max(1, samples))
  };
}

export function diseaseSummary(f) {
  return {
    sick : f.disease?.sick || 0,
    hatched : Math.max(0, f.hatched || 0),
    routes : DISEASE_ROUTES.map(key => ({key, count : f.disease?.[key] || 0}))
  };
}

export function deathCauses(f) {
  const counts = f.death_causes || [];
  return {counts, total : counts.reduce((sum, n) => sum + n, 0)};
}
