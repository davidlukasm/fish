import {ROUTE} from './schema.js';
import {t} from './strings.js';
export const fish_namesState = {};

export function fishName(id) { return fish_namesState.names?.[String(id)] || ''; }
export function fishLabel(id) { return fishName(id) || t('fish_names.label', {id}); }
export function fishTitle(id) { return fishName(id) || t('fish_names.title', {id}); }
export function fishNamesLoaded() { return fish_namesState.names !== undefined; }
export function fishFavorite(id) { return !!fish_namesState.favorites?.has(id); }
export async function refreshFishNames() {
  fish_namesState.names ??= {};
  try {
    const r = await fetch(ROUTE.names);
    if (r.ok) {
      const people = await r.json();
      fish_namesState.names = people.fish || {};
      fish_namesState.favorites = new Set(people.favorites || []);
    }
  } catch {
  }
}
