import {t} from './strings.js';

export const transportState = {};
export let lightCache;

export function applyFramePatch(value, patch) {
  if (patch[0] === 0)
    return patch[1];
  if (patch[0] === 1) {
    const result = value.slice(0, patch[1]);
    result.length = patch[1];
    for (const [index, change] of patch[2])
      result[index] = applyFramePatch(result[index], change);
    return result;
  }
  if (patch[0] === 2) {
    const result = {...value};
    for (const key of patch[2])
      delete result[key];
    for (const [key, change] of Object.entries(patch[1]))
      result[key] = applyFramePatch(result[key], change);
    return result;
  }
  if (patch[0] === 3) {
    const known = new Map(value.map(row => [row[patch[1]], row]));
    const order = patch[2] || value.map(row => row[patch[1]]);
    for (const [id, change] of patch[3])
      known.set(id, applyFramePatch(known.get(id), change));
    return order.map(id => known.get(id));
  }
  if (patch[0] === 6) {
    const result = value.slice();
    let next = 0;
    for (let i = 0; i < result.length; ++i)
      if (parseInt(patch[1][i >> 2], 16) & (1 << (i % 4)))
        result[i] = patch[2][next++];
    return result;
  }
  throw Error(t('transport.unbekannteDarstellungsaenderung'));
}

export function resetScene() {
  transportState.rawScene = null;
  transportState.sceneKey = '';
}

export function decodeScene(data) {
  if (data.frame_patches) {
    if (!transportState.rawScene || data.base_scene !== transportState.sceneKey)
      throw Error(t('transport.darstellungWirdNeuGeladen'));
    for (const patch of data.frame_patches)
      transportState.rawScene = applyFramePatch(transportState.rawScene, patch);
  } else
    transportState.rawScene = data.frame;
  transportState.sceneKey = data.scene_key || '';
  return transportState.rawScene;
}

const initializers = {
  "rawScene" : () => { transportState.rawScene = null; },
  "sceneKey" : () => { transportState.sceneKey = ''; },
  "lightCache" : () => { lightCache = new WeakMap(); }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
