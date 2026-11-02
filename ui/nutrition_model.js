// What a fish or species ate and where it lived, as plain shares: diet amounts per food source
// (rooted and drifting plants apart) and time shares per habitat.
import {columnNames, FOOD_KIND, HABITAT, RATE_WINDOW} from './schema.js';
export const nutrition_modelState = {};

// Display slots of the food sources: the food kinds in order, with plants split into rooted
// plants and drifting pieces right after them.
const slotOf = kind => kind + (kind > FOOD_KIND.plant ? 1 : 0);
export const FOOD_SLOT = Object.freeze({
  ...Object.fromEntries(Object.entries(FOOD_KIND).map(([ name, kind ]) => [name, slotOf(kind)])),
  drift : FOOD_KIND.plant + 1
});
export const FOOD_KINDS = Object.keys(FOOD_KIND).length;
// The engine counts rates per RATE_WINDOW.steps; nutrition shows per RATE_WINDOW.display_steps.
export const displayRate = rate => rate * RATE_WINDOW.display_steps / RATE_WINDOW.steps;
// The food kind a display slot shows.
export function foodKindOf(slot) { return slot > FOOD_SLOT.plant ? slot - 1 : slot; }

export function ecologyFor(t) {
  const n = t?.ecology_steps || 0, a = t?.ecology || [];
  return {
    samples : n,
    raw_diet : t?.raw_diet || [],
    digested : t?.digested || 0,
    drift_grass : t?.drift_grass || 0,
    ...Object.fromEntries(
        columnNames(HABITAT).map(name => [name, (a[HABITAT[name]] || 0) / Math.max(1, n)]))
  };
}

export function foodDisplayIndex(source, drift = false) {
  return source === FOOD_KIND.plant && drift ? FOOD_SLOT.drift : slotOf(source);
}

export function foodAmounts(diet = [], eco = {}) {
  const plant = FOOD_KIND.plant,
        a = Array.from({length : FOOD_KINDS}, (_, i) => Math.max(0, diet[i] || 0)),
        drift = Math.min(a[plant], Math.max(0, eco.drift_grass || 0));
  return [...a.slice(0, plant), a[plant] - drift, drift, ...a.slice(plant + 1) ];
}
