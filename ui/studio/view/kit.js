import {ATELIER_LIMITS} from '../../schema.js';
import {STUDIO_ICON} from '../../organ_icons.js';
import {escapeText, glyph, plainTrack, trackShare} from './markup.js';
import {percent, t} from '../../strings.js';

// What the inspector's and the library's views share: their words, organ icons and headings.
export const label = key => t('studio.' + key);
// Glyph sizes (frame units): an organ's icon in the palette, as the organ's metric, in a circuit,
// in lists and in the slots and parts; a tool in the tool bar and in the workflow; a substance
// card's mark, a muscle to choose and the trash.
export const ICON = Object.freeze({
  palette : 25,
  metric : 50,
  circuit : 18,
  list : 16,
  part : 22,
  tool : 22,
  workflow : 20,
  mark : 20,
  muscle : 26,
  trash : 30
});
export const icon = (kind, size = ICON.palette) =>
    glyph(STUDIO_ICON[kind] ?? STUDIO_ICON.brain, size, {line : true});
export const heading = text => '<h3>' + escapeText(text) + '</h3>';
// How many cells a node makes, or how strong an effector's cell is, on one line: its word and
// number at the left, a track to the right of WORDS (WIDTH wide, HEIGHT high).
const CELL_TRACK = Object.freeze({width : 300, height : 28, words : 150, end : 290, line : 15});
export const cellShare = copies => (copies - 1) / (ATELIER_LIMITS.max_copies - 1);
export const cellPatch = fx => ({
  copies : 1 + Math.round(trackShare(fx * CELL_TRACK.width, [ CELL_TRACK.words, CELL_TRACK.end ]) *
                          (ATELIER_LIMITS.max_copies - 1))
});
// A node's cells in words: a sense or nerve node's number, an effector's strength.
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
// A brain region's technical term, shorter than its German name.
export const regionTerm = key => label('regions.' + key + '.term');
