import {ATELIER_LIMITS} from '../../schema.js';
import {STUDIO_ICON} from '../../organ_icons.js';
import {escapeText} from './markup.js';
import {t} from '../../strings.js';

// What the inspector's and the library's views share: their words, organ icons and headings.
export const label = key => t('studio.' + key);
// An organ's icon at a size (frame units): in the palette, as the organ's metric, in a circuit,
// in lists and in the slots and parts.
export const ICON = Object.freeze({palette : 25, metric : 50, circuit : 18, list : 16, part : 22});
export const icon = (kind, size = ICON.palette) =>
    '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="' + escapeText(STUDIO_ICON[kind] ?? STUDIO_ICON.brain) +
    '" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/></svg>';
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
