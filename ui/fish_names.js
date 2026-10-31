import {t} from './strings.js';
// Names the user gave to single fish, kept by the viewer next to the run. Every view (fish
// list, inspector, object panel, phone) reads them here.
export const fish_namesState = {};

export function fishName(id) { return fish_namesState.names?.[String(id)] || ''; }
// How a fish is called wherever it appears: the name it was given, otherwise its number; a name
// replaces the number instead of standing beside it.
export function fishLabel(id) { return fishName(id) || t('fish_names.label', {id}); }
export function fishTitle(id) { return fishName(id) || t('fish_names.title', {id}); }
export function fishNamesLoaded() { return fish_namesState.names !== undefined; }
export async function refreshFishNames() {
  fish_namesState.names ??= {};
  try {
    const r = await fetch('/names');
    if (r.ok)
      fish_namesState.names = (await r.json()).fish || {};
  } catch {
  }
}
