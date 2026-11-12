import {ATELIER_LIMITS} from '../../schema.js';
import {STUDIO_ICON} from '../../organ_icons.js';
import {escapeText, fixed, glyph} from './markup.js';
import {HALF_VIEW} from '../model/retina.js';
import {percent, t} from '../../strings.js';

export const label = key => t('studio.' + key);
export const ICON = Object.freeze({
  palette : 25,
  metric : 50,
  circuit : 18,
  list : 16,
  slot : 18,
  part : 22,
  tool : 22,
  workflow : 20,
  mark : 20,
  muscle : 26,
  trash : 30
});
export const icon = (kind, size = ICON.palette) =>
    glyph(STUDIO_ICON[kind] ?? STUDIO_ICON.brain, size, {line : true});
export const SLOT_IN = 'M4 12h12M12 7l5 5-5 5M20 5v14';
const SLOT_OUT = 'M4 5v14M8 12h12M16 7l5 5-5 5';
export function slotShape(slot) {
  const shown = slot.filled[0]?.type ?? slot.fits[0] ?? null;
  return shown ? STUDIO_ICON[shown] ?? STUDIO_ICON.brain : slot.dir === 'in' ? SLOT_IN : SLOT_OUT;
}
export const slotFill = slot => slot.filled.length ? 'filled' : slot.required ? 'missing' : 'free';
export const heading = text => '<h3>' + escapeText(text) + '</h3>';
// A map node of the visual field as the slice of the field it covers: ahead is up, the side to the
// right, the whole field outlined and the node's slice filled.
const BAND_GLYPH = Object.freeze({size : 24, x : 6, y : 14, radius : 13});
export function bandGlyph([ from, to ]) {
  const B = BAND_GLYPH, at = (degreesFrom, r = B.radius) => {
    const a = degreesFrom * Math.PI / 180;
    return fixed(B.x + r * Math.sin(a)) + ' ' + fixed(B.y - r * Math.cos(a));
  };
  const slice = (a, b, cls) => '<path class="' + cls + '" d="M' + B.x + ' ' + B.y + ' L' + at(a) +
                               ' A' + B.radius + ' ' + B.radius + ' 0 ' + (b - a > 180 ? 1 : 0) +
                               ' 1 ' + at(b) + 'Z"/>';
  return '<svg class="aid-band-glyph" viewBox="0 0 ' + B.size + ' ' + B.size + '" width="' +
         B.size + '" height="' + B.size + '" aria-hidden="true">' + slice(0, HALF_VIEW, 'field') +
         slice(from, to, 'band') + '</svg>';
}
// Switches drawn as what they switch, off and on; the name is the tooltip.
export const SWITCH_SYMBOL = Object.freeze({
  // A chain, whole while the two sides or a map and its organs go together.
  chain : {
    off : 'M9 8H7a4 4 0 0 0 0 8h2M15 8h2a4 4 0 0 1 0 8h-2',
    on : 'M9 8H7a4 4 0 0 0 0 8h2M15 8h2a4 4 0 0 1 0 8h-2M8 12h8'
  },
  // A region's cells inside its hull, linked among themselves while it may grow extra contacts.
  inner : {
    off : 'M3 12a9 7 0 1 0 18 0a9 7 0 1 0-18 0M9 10h.01M15 10h.01M9 14h.01M15 14h.01',
    on : 'M3 12a9 7 0 1 0 18 0a9 7 0 1 0-18 0M9 10h6v4H9zM9 10l6 4M15 10l-6 4'
  },
  // A receptor in the membrane, holding its substance while it answers.
  receptor : {
    off : 'M3 19h18M12 19v-7M12 12L8 8M12 12l4-4',
    on : 'M3 19h18M12 19v-7M12 12L8 8M12 12l4-4M12 7m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0'
  }
});
export const iconSwitch = (symbol, on, title, input) =>
    '<label class="aid-icon-switch" title="' + escapeText(title) + '"><input type="checkbox" ' +
    input + (on ? ' checked' : '') + '/>' +
    glyph(SWITCH_SYMBOL[symbol][on ? 'on' : 'off'], ICON.part, {line : true}) + '</label>';
const CELL_GROUP =
    Object.freeze({width : 300, height : 110, left : 24, top : 36, dx : 42, dy : 22, columns : 4});
export const cellPatch = (fx, fy) => {
  const C = CELL_GROUP,
        column = Math.max(0, Math.min(C.columns - 1, Math.round((fx * C.width - C.left) / C.dx)));
  const row = Math.max(0, Math.min(Math.ceil(ATELIER_LIMITS.max_copies / C.columns) - 1,
                                   Math.round((fy * C.height - C.top) / C.dy)));
  return {copies : Math.min(ATELIER_LIMITS.max_copies, row * C.columns + column + 1)};
};
const CELL_WORDS = Object.freeze({sensor : 'senseCells', nerve : 'nerveCells', motor : 'strength'});
export const cellWords = center =>
    t('studio.inspector.' + CELL_WORDS[center.role],
      {n : center.copies, share : percent(center.copies / ATELIER_LIMITS.max_copies)});
export function cellGroup(center, words) {
  const C = CELL_GROUP;
  const cells = Array
                    .from({length : ATELIER_LIMITS.max_copies},
                          (_, i) => {
                            const x = C.left + i % C.columns * C.dx,
                                  y = C.top + Math.floor(i / C.columns) * C.dy;
                            return '<circle class="aid-cell-copy' +
                                   (i < center.copies ? ' filled' : '') + '" data-copy-cell="' +
                                   escapeText(center.id) + '" data-copy-count="' + (i + 1) +
                                   '" cx="' + x + '" cy="' + y + '" r="8"/>';
                          })
                    .join('');
  const i = center.copies - 1;
  return '<svg class="aid-cell-group" viewBox="0 0 ' + C.width + ' ' + C.height +
         '" data-cell-group="' + escapeText(center.id) + '"><title>' + escapeText(words) +
         '</title>' + cells + '<circle class="aid-graphic-handle" data-cell-handle cx="' +
         (C.left + i % C.columns * C.dx) + '" cy="' + (C.top + Math.floor(i / C.columns) * C.dy) +
         '" r="10"/></svg>';
}
export const regionTerm = key => label('regions.' + key + '.term');
// Digits for an engine value read out in a details list.
export const VALUE_DIGITS = 3;
