import {zoomOf} from './frame.js';

// What the scene shows besides the fish and its organs: the wires, the single nodes of the
// organs, and the marks of what the hormones do to them. Each switch is set to AUTO (as the tool
// in use and the view's zoom suggest, LAYER_DEFAULTS), on or off, and kept so (STORE, in this
// browser). Zoomed out below NODES_ZOOM the organs stand as wholes, their wires running organ to
// organ; while moving things, below MOVE_WIRES_ZOOM the wires stand back too, where wiring,
// testing a stimulus and the others keep them; the hormones' marks show with the hormone and the
// learning tool.
export const LAYER_KEYS = Object.freeze([ 'wires', 'nodes', 'hormones' ]);
export const AUTO = 'auto';
const LAYER_MODES = Object.freeze([ AUTO, true, false ]);
export const NODES_ZOOM = 1.35;
const MOVE_WIRES_ZOOM = 1;
const HORMONE_TOOLS = Object.freeze([ 'hormone', 'learn' ]);
const STORE = 'aid.atelier.layer-modes';
const LAYER_DEFAULTS = Object.freeze({
  wires : (tool, zoom) => tool !== 'select' || zoom >= MOVE_WIRES_ZOOM,
  nodes : (tool, zoom) => zoom >= NODES_ZOOM,
  hormones : tool => HORMONE_TOOLS.includes(tool)
});
export const layerMode = (state, key) =>
    LAYER_MODES.includes(state.layers?.[key]) ? state.layers[key] : AUTO;
export function layerShown(state, key) {
  const mode = layerMode(state, key);
  return mode === AUTO ? LAYER_DEFAULTS[key](state.tool, zoomOf(state)) : mode;
}
// The viewer's switches as kept, and kept anew.
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
    // Without storage the switches last until the page is left.
  }
}
// A switch clicked: from auto to on, to off, back to auto.
export function switchLayer(state, key) {
  const mode = layerMode(state, key);
  return {
    ...state.layers,
    [key] : LAYER_MODES[(LAYER_MODES.indexOf(mode) + 1) % LAYER_MODES.length]
  };
}
