import {zoomOf} from './frame.js';

// What the scene shows besides the fish and its organs: the wires, and the single nodes of the
// organs. Each tool shows them by default as LAYER_DEFAULTS says for the view's zoom; a viewer
// who switches one for a tool keeps that switch for the tool (STORE, in this browser). Zoomed out
// below NODES_ZOOM the organs stand as wholes in every tool, their wires running organ to organ;
// while moving things, below MOVE_WIRES_ZOOM the wires stand back too, where wiring, testing a
// stimulus and the others keep them.
export const LAYER_KEYS = Object.freeze([ 'wires', 'nodes' ]);
export const NODES_ZOOM = 1.35;
const MOVE_WIRES_ZOOM = 1;
const STORE = 'aid.atelier.layers';
const LAYER_DEFAULTS = Object.freeze({
  wires : (tool, zoom) => tool !== 'select' || zoom >= MOVE_WIRES_ZOOM,
  nodes : (tool, zoom) => zoom >= NODES_ZOOM
});
export const layerShown = (state, key) =>
    state.layers?.[state.tool]?.[key] ?? LAYER_DEFAULTS[key](state.tool, zoomOf(state));
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
// A layer switched for the tool in use: the other way than it shows now.
export function switchLayer(state, key) {
  const shown = layerShown(state, key);
  return {...state.layers, [state.tool] : {...state.layers?.[state.tool], [key] : !shown}};
}
