import {STUDIO_ICON} from '../../organ_icons.js';

// The Atelier's tool symbols (24-unit paths).
export const TOOL_ICON = Object.freeze({
  undo : 'M10 5 L5 10 L10 15 M5 10 H14 C20 10 21 20 14 20',
  redo : 'M14 5 L19 10 L14 15 M19 10 H10 C4 10 3 20 10 20',
  select : 'M5 3l14 9-7 1-4 8z',
  wire : 'M5 7h5l4 10h5M7 7a2 2 0 1 0-4 0 2 2 0 0 0 4 0zM21 17a2 2 0 1 0-4 0 2 2 0 0 0 4 0z',
  hormone : STUDIO_ICON.gland,
  learn : 'M2 9l10-5 10 5-10 5zM6 11v5c0 1.6 2.7 3 6 3s6-1.4 6-3v-5M21 9.5V15',
  stimulate : STUDIO_ICON.pain,
  erase : 'M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M11 10v7M14 10v7',
  pan : 'M7 13V7M11 12V4M15 12V6M19 13V9M7 13c-2-3-5-1-3 2l4 6h10c2-2 3-5 3-8'
});
// The hormones' effects as symbols (24-unit paths, by HORMONE_EFFECT): excite a plus, further
// learning the learning cap, sharpen competition two arrows against each other, set a trace a
// rising trail, drive a rhythm a beat, damp the output a minus, kill cells a cross.
export const EFFECT_ICON = Object.freeze([
  'M12 5v14M5 12h14', 'M2 9l10-5 10 5-10 5zM6 11v5c0 1.6 2.7 3 6 3s6-1.4 6-3v-5',
  'M3 7l7 5-7 5M21 7l-7 5 7 5', 'M4 19h.01M8 16h.01M12 13h.01M16 10h.01M20 6l-2 1 1 2',
  'M2 12h4l2-5 3 10 3-10 2 5h6', 'M5 12h14', 'M6 6l12 12M18 6L6 18'
]);
// Maturity: working from it on a shoot rising, dying from it on one falling.
export const PHASE_ICON =
    Object.freeze({start : 'M4 19h16M12 15V5M8 9l4-4 4 4', end : 'M4 19h16M12 5v10M8 11l4 4 4-4'});
