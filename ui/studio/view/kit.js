import {ATELIER_LIMITS} from '../../schema.js';
import {STUDIO_ICON} from '../../organ_icons.js';
import {escapeText, glyph, plainTrack, trackShare} from './markup.js';
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
const CELL_TRACK = Object.freeze({width : 300, height : 28, words : 150, end : 290, line : 15});
const cellShare = copies => (copies - 1) / (ATELIER_LIMITS.max_copies - 1);
export const cellPatch = fx => ({
  copies : 1 + Math.round(trackShare(fx * CELL_TRACK.width, [ CELL_TRACK.words, CELL_TRACK.end ]) *
                          (ATELIER_LIMITS.max_copies - 1))
});
const CELL_WORDS = Object.freeze({sensor : 'senseCells', nerve : 'nerveCells', motor : 'strength'});
export const cellWords = center =>
    t('studio.inspector.' + CELL_WORDS[center.role],
      {n : center.copies, share : percent(center.copies / ATELIER_LIMITS.max_copies)});
export function cellTrack(center, words) {
  const C = CELL_TRACK;
  return '<svg class="aid-cell-track" viewBox="0 0 ' + C.width + ' ' + C.height +
         '" data-cell-track="' + escapeText(center.id) + '"><text x="0" y="' + C.line + '">' +
         escapeText(words) + '</text>' +
         plainTrack([ C.words, C.end ], C.height / 2, cellShare(center.copies), 'data-cell-handle',
                    words) +
         '</svg>';
}
export const regionTerm = key => label('regions.' + key + '.term');
// Digits for an engine value read out in a details list.
export const VALUE_DIGITS = 3;
export const numberField = (name, value, {min, max, step, attributes = ''}) =>
    '<label>' + escapeText(name) + '<input type="number" min="' + min + '" max="' + max +
    '" step="' + step + '" value="' + value + '" ' + attributes + '></label>';
