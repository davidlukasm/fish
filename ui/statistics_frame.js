import {CHANNEL_MAX} from './units.js';
import {t} from './strings.js';
import {columnNames, CORPSE, FISH, NEURON, NEURON_STATE, RECEPTOR} from './schema.js';
import {decodeScene, lightCache} from './transport.js';

export function hydrateRender(raw, cache) {
  const savedLight = raw.light && lightCache.get(raw.light);
  const f = {
    ...raw,
    fish : (raw.fish || []).map(p => p.slice()),
    corpses : (raw.corpses || []).map(p => p.slice()),
    light : savedLight || {...raw.light},
    species : (raw.species || []).map(s => ({...s}))
  };
  const get = id => {
    const value = cache.renderAssets[String(id)];
    if (value === undefined)
      throw Error(t('connection.darstellungsdatenFehlen'));
    return value;
  };
  for (const p of f.fish || [])
    if (p[FISH.morphology_asset] && p[FISH.organs] == null) {
      const shape = get(p[FISH.morphology_asset]);
      [FISH.organs, FISH.fins, FISH.forms, FISH.contour, FISH.regions, FISH.body_geometry].forEach(
          (index, i) => p[index] = shape[i]);
    }
  for (const p of f.corpses || [])
    if (Number.isInteger(p[CORPSE.morphology_asset]))
      p[CORPSE.morphology_asset] = get(p[CORPSE.morphology_asset]);
  const l = f.light;
  if (!savedLight && l?.bytes) {
    l.values = Float32Array.from(l.bytes, v => v / CHANNEL_MAX);
    delete l.bytes;
    const key = String(l.clear_asset), base = get(key);
    l.clear_values =
        base.normalized || (base.normalized = Float32Array.from(base, v => v / CHANNEL_MAX));
    if (raw.light)
      lightCache.set(raw.light, l);
  }
  delete f.assets;
  return f;
}

export function hydrateFrame(f, cache) {
  const b = f.brain;
  if (b) {
    const key = [ f.render_epoch, f.view_context, b.id ].join(':');
    if (b.hormones)
      cache.hormones = {key, value : b.hormones};
    else if (cache.hormones?.key === key)
      b.hormones = cache.hormones.value;
  }
  if (!b?.layout_id)
    return f;
  const layout = b.layout || b;
  if (layout.neurons) {
    cache.cachedBrainLayout = {layout_id : b.layout_id};
    for (const key of ['neurons', 'receptors', 'effectors', 'edges', 'focus', 'motor_counts'])
      cache.cachedBrainLayout[key] = layout[key];
  }
  if (cache.cachedBrainLayout?.layout_id !== b.layout_id)
    throw Error(t('connection.gehirnbauplanWirdErneutGeladen'));
  const brain = {...cache.cachedBrainLayout, ...b, visual_image : f.vision?.bands || []};
  delete brain.layout;
  brain.neurons = (brain.neurons || []).map(n => {
    const row = n.slice(), state = b.neuron_state?.[row[NEURON.index]];
    if (state)
      for (const name of columnNames(NEURON_STATE))
        row[NEURON[name]] = state[NEURON_STATE[name]];
    return row;
  });
  brain.receptors = (brain.receptors || []).map((r, i) => {
    const row = r.slice();
    if (b.sensor_state)
      row[RECEPTOR.value] = b.sensor_state[i] || 0;
    return row;
  });
  return {...f, brain};
}

export function decodeState(d, cache, brain = true) {
  if (d.render_assets) {
    Object.assign(cache.renderAssets, d.render_assets);
    if (d.asset_ids) {
      const ids = new Set(d.asset_ids);
      for (const key of Object.keys(cache.renderAssets))
        if (!ids.has(key))
          delete cache.renderAssets[key];
    }
    cache.renderAssetsKey = d.assets_key;
  }
  const f = hydrateRender(decodeScene(d), cache);
  const profiles = cache.speciesProfiles ||= {};
  if (d.species_profiles)
    Object.assign(profiles, d.species_profiles);
  if (d.species_profile_ids) {
    const ids = new Set(d.species_profile_ids.map(String));
    for (const key of Object.keys(profiles))
      if (!ids.has(key))
        delete profiles[key];
  }
  for (const species of f.species || [])
    Object.assign(species, profiles[species.id] || {});
  if ('individual_profile' in d)
    cache.cachedIndividualProfile = d.individual_profile;
  cache.profileKey = d.profile_key || '';
  cache.speciesKey = d.species_key || '';
  f.individual_profile = cache.cachedIndividualProfile;
  if (d.brain_layout && f.brain)
    f.brain = {...f.brain, layout : d.brain_layout};
  return brain ? hydrateFrame(f, cache) : f;
}
