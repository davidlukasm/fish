import {STUDIO_ICON} from '../../organ_icons.js';

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
export const TEACH_ICON =
    'M12 2v8M8.5 6.5L12 10l3.5-3.5M12 21a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z';
export const EFFECT_ICON = Object.freeze([
  'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M19 19l-2.5-2.5',
  'M4 17a8 8 0 0 1 16 0M12 17l4-6', 'M3 7l7 5-7 5M21 7l-7 5 7 5',
  'M12 4v16M7 20h10M4 7h16M4 7l-2.5 6h5zM20 7l-2.5 6h5z', 'M2 12h4l2-5 3 10 3-10 2 5h6',
  'M4 9h4l5-4v14l-5-4H4zM16.5 9.5a3.5 3.5 0 0 1 0 5M19 7a7 7 0 0 1 0 10', 'M6 6l12 12M18 6L6 18',
  TEACH_ICON
]);
export const DIRECTION_ICON = Object.freeze({rises : 'M12 5l6 8H6z', falls : 'M12 19l6-8H6z'});
export const PHASE_ICON =
    Object.freeze({start : 'M4 19h16M12 15V5M8 9l4-4 4 4', end : 'M4 19h16M12 5v10M8 11l4 4 4-4'});
export const BODY_SIGNAL = '#d7c294';
export const GROWTH_ICON = 'M3 12c3-4 7-5 11-3l5-3v12l-5-3c-4 2-8 1-11-3zM9 11h.01';
