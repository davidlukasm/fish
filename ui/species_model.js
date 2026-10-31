// The species of the tank as plain data: who lives (has adult fish), who died out, how many
// genera, and which fish best show a species right now (the newest of its deepest generation).
import {textArea} from './strings.js';
export const species_modelState = {};

// Why a species carries its name: the engine sends a key, the texts say it in words.
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
  const adults = group.filter(p => p[8]);
  if (!adults.length)
    return [];
  const depth = Math.max(...adults.map(p => p[12] || 0));
  return adults.filter(p => (p[12] || 0) === depth)
      .sort((a, b) => (b[40] || 0) - (a[40] || 0) || b[4] - a[4])
      .slice(0, 2);
}
