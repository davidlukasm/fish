import {FISH} from './schema.js';
import {textArea} from './strings.js';
export const species_modelState = {};

export function nameReason(key) {
  return key ? textArea('species_model').reasons?.[key] ?? key : '';
}

export function speciesCensus(f) {
  const all = (f.species || []).filter(Boolean), living = all.filter(s => s.adults > 0);
  return {
    all,
    living,
    extinct : all.filter(s => s.extinct_at && !s.alive && !s.gametes),
    genera : new Set(living.map(s => s.genus || s.id)).size
  };
}
export function newestSpecimens(group) {
  const adults = group.filter(p => p[FISH.hatched]);
  if (!adults.length)
    return [];
  const depth = Math.max(...adults.map(p => p[FISH.depth] || 0));
  return adults.filter(p => (p[FISH.depth] || 0) === depth)
      .sort((a, b) => (b[FISH.born] || 0) - (a[FISH.born] || 0) || b[FISH.id] - a[FISH.id])
      .slice(0, 2);
}
