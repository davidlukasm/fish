import {ATELIER_LIMITS} from '../../schema.js';
import {STUDIO_ICON} from '../../organ_icons.js';
import {escapeText, glyph} from './markup.js';
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
