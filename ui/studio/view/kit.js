import {ATELIER_LIMITS} from '../../schema.js';
import {STUDIO_ICON} from '../../organ_icons.js';
import {escapeText, glyph} from './markup.js';
import {t} from '../../strings.js';

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
export function iconCells(count, id) {
  let html = '<div class="aid-cell-chooser" aria-label="' + label('inspector.count') + '">';
  for (let i = 1; i <= ATELIER_LIMITS.max_copies; ++i)
    html += '<button type="button" class="aid-cell-pill' + (i <= count ? ' on' : '') +
            '" data-cell-count="' + i + '" data-center-id="' + escapeText(id) + '" title="' + i +
            '" aria-label="' + i + '"></button>';
  return html + '</div>';
}
// A brain region's technical term, shorter than its German name.
export const regionTerm = key => label('regions.' + key + '.term');
