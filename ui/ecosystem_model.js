// The tank as a budget, in plain numbers: where the stored energy sits and what the fish took
// from each source recently, which habitats the living fish use, how many are sick and from
// what, and what the fish died of. Views give the groups their names and colours.
import {
  FISH,
  FOOD_KIND as K,
  HABITAT,
  INVERTEBRATE,
  INVERTEBRATE_KIND,
  MUSSEL_STATE,
  columnNames
} from './schema.js';
export const ecosystem_modelState = {};

// Food sources of the energy budget; `sources` index the diet vectors of the simulation.
const ENERGY_GROUPS = [
  {key : 'food', sources : [ K.feed ]}, {key : 'grass', sources : [ K.plant ]},
  {key : 'drift', sources : [ K.plant ]}, {key : 'algae', sources : [ K.algae ]},
  {key : 'plankton', sources : [ K.plankton ]}, {key : 'worms', sources : [ K.worm ]},
  {key : 'shellfish', sources : [ K.crab, K.mussel ]}, {key : 'detritus', sources : [ K.benthic ]},
  {key : 'animal', sources : [ K.fish, K.egg, K.carrion ]}
];
// Energy held outside the food sources.
export const ENERGY_STORES = [ 'gut', 'sperm' ];
export const HABITATS = columnNames(HABITAT);
const DISEASE_ROUTES = [ 'spontaneous', 'food', 'carrion', 'contact' ];

// Who lives in the tank now, counted: hatched fish, eggs, carcasses, loose food pieces, crabs and
// living mussels. Worms, plankton and plants are energy stores, shown in the budget.
export const INHABITANTS = [ 'fish', 'eggs', 'corpses', 'food', 'crabs', 'mussels' ];
export function inhabitants(f) {
  const animals = f.invertebrates || [],
        count = test => animals.reduce((n, p) => n + (test(p) ? 1 : 0), 0),
        hatched = (f.fish || []).reduce((n, p) => n + (p[FISH.hatched] ? 1 : 0), 0);
  return {
    fish : hatched,
    eggs : (f.fish || []).length - hatched,
    corpses : (f.corpses || []).length,
    food : (f.food || []).length,
    crabs : count(p => p[INVERTEBRATE.kind] === INVERTEBRATE_KIND.crab),
    mussels : count(p => p[INVERTEBRATE.kind] === INVERTEBRATE_KIND.mussel &&
                         p[INVERTEBRATE.state] === MUSSEL_STATE.living)
  };
}

export function energyBudget(f) {
  const energy = f.energy_breakdown || {}, diet = f.recent_diet || [], drift = f.recent_drift || 0,
        values = {
          ...energy,
          shellfish : (energy.crabs || 0) + (energy.mussels || 0),
          animal : (energy.fish || 0) + (energy.eggs || 0) + (energy.corpses || 0)
        };
  const plants = diet[K.plant] || 0,
        uptake = group => group.key === 'drift' ? Math.min(plants, drift)
                          : group.key === 'grass'
                              ? Math.max(0, plants - drift)
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
    shares : HABITATS.map(
        name => observed.reduce((n, trait) => n + (trait.ecology?.[HABITAT[name]] || 0), 0) /
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
