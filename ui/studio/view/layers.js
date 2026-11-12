import {zoomOf} from './frame.js';

export const LAYER_KEYS = Object.freeze([ 'wires', 'nodes', 'hormones' ]);
export const AUTO = 'auto';
const LAYER_MODES = Object.freeze([ AUTO, true, false ]);
const REVEAL = Object.freeze(
    {regions : [ 1.1, 2.2 ], cells : [ 1.8, 3.8 ], fields : [ 1.6, 2.4 ], seats : [ 3.8, 5 ]});
const fade = (zoom, [ from, to ]) => {
  const x = Math.max(0, Math.min(1, (zoom - from) / (to - from)));
  return x * x * (3 - 2 * x);
};
export const detailMix = state => Object.fromEntries(
    Object.entries(REVEAL).map(([ name, interval ]) => [name, fade(zoomOf(state), interval)]));
export function nodeOpacity(state, chosen = false) {
  const mode = layerMode(state, 'nodes');
  return mode === true    ? 1
         : mode === false ? (chosen ? detailMix(state).cells : 0)
                          : detailMix(state).cells;
}
const HORMONE_TOOLS = Object.freeze([ 'hormone', 'learn' ]);
const STORE = 'aid.atelier.layer-modes';
const LAYER_DEFAULTS = Object.freeze({
  wires : () => true,
  nodes : (tool, zoom) => zoom > REVEAL.cells[0],
  hormones : tool => HORMONE_TOOLS.includes(tool)
});
export const layerMode = (state, key) =>
    LAYER_MODES.includes(state.layers?.[key]) ? state.layers[key] : AUTO;
export function layerShown(state, key) {
  const mode = layerMode(state, key);
  return mode === AUTO ? LAYER_DEFAULTS[key](state.tool, zoomOf(state)) : mode;
}
export function storedLayers() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE) ?? '{}');
    return stored && typeof stored === 'object' ? stored : {};
  } catch {
    return {};
  }
}
export function keepLayers(layers) {
  try {
    localStorage.setItem(STORE, JSON.stringify(layers));
  } catch {
  }
}
export function switchLayer(state, key) {
  const mode = layerMode(state, key);
  return {
    ...state.layers,
    [key] : LAYER_MODES[(LAYER_MODES.indexOf(mode) + 1) % LAYER_MODES.length]
  };
}
