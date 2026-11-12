import {clamp} from '../../units.js';
import {escapeText, fixed} from './markup.js';
import {label} from './kit.js';

const VARIATION =
    Object.freeze({width : 150, height : 98, cx : 48, cy : 48, span : 70, radius : 9});
export const variationPatch = fx =>
    clamp((fx * VARIATION.width - VARIATION.cx - VARIATION.radius) / VARIATION.span);
// `at` places the picture inside a larger one.
export function variationGraphic(value, target, family, at = null) {
  const V = VARIATION, word = key => label('cellPicture.' + key);
  const glyphs = [ -1, -.5, 0, .5, 1 ]
                     .map((q, i) => {
                       const x = V.cx + V.span * value * Math.abs(q), y = V.cy + 26 * q;
                       const varied = clamp(2 * value * q, -1);
                       let inside;
                       if (family === 'spread_contacts')
                         inside = '<path d="M-7 0H7 M0 -7V7 M-5 -5L5 5" stroke-width="' +
                                  fixed(1.8 + varied * 1.2) + '"/>';
                       else if (family === 'spread_receptors')
                         inside = '<circle r="' + fixed(4 + varied * 2) + '"/>';
                       else if (family === 'spread_development')
                         inside = '<circle r="5" fill="currentColor" fill-opacity="' +
                                  fixed((1 + varied) / 2) + '"/>';
                       else
                         inside = '<path d="M-6 2L-2 2 0 ' + fixed(-4 - varied * 3) + ' 3 2H7"/>';
                       return '<path class="aid-variation-branch" d="M10 ' + V.cy + 'Q' + V.cx +
                              ' ' + V.cy + ' ' + fixed(x) + ' ' + fixed(y) +
                              '"/><g transform="translate(' + fixed(x) + ' ' + fixed(y) +
                              ')"><circle class="aid-tissue-cell" r="' + V.radius + '"/>' + inside +
                              '</g>';
                     })
                     .join('');
  // Inside a larger picture the style overrides the full width the stylesheet gives a lone one;
  // the empty frame keeps the picture's box, which the drag measures, at its full size.
  const place = at ? ' x="' + at.x + '" y="' + at.y + '" style="width:' + V.width +
                         'px;height:' + V.height + 'px"'
                   : '';
  return '<svg class="aid-variation" data-variation="' + escapeText(target) +
         '" data-variation-family="' + family + '"' + place + ' viewBox="0 0 ' + V.width + ' ' +
         V.height + '" role="img" aria-label="' + word(family) + '"><title>' +
         word('variationDrag') + '</title><rect width="' + V.width + '" height="' + V.height +
         '" fill="none"/>' + glyphs +
         '<circle class="aid-graphic-handle" data-variation-handle cx="' +
         fixed(V.cx + V.span * value + V.radius) + '" cy="' + (V.cy - 26) + '" r="6"/>' +
         '</svg>';
}
// How new cells differ, in one picture: one fan of example cells per kind of difference, side by
// side; each fan keeps its own handle and geometry.
export function cellVariation(center) {
  const V = VARIATION, kinds = Object.entries(center.distribution);
  const rows = Math.ceil(kinds.length / 2);
  return '<details class="aid-cell-variation"><summary>' + label('cellPicture.variation') +
         '</summary><svg class="aid-variation-sheet" viewBox="0 0 ' + 2 * V.width + ' ' +
         rows * V.height + '" role="img" aria-label="' + label('cellPicture.variation') + '">' +
         kinds
             .map(([ key, value ], k) =>
                      variationGraphic(value, center.id, key,
                                       {x : (k % 2) * V.width, y : Math.floor(k / 2) * V.height}))
             .join('') +
         '</svg></details>';
}
