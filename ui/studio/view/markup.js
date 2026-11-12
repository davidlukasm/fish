import {clamp} from '../../units.js';
import {glyph as drawGlyph, linePaint} from '../../glyph.js';

export const escapeText = value =>
    String(value ?? '')
        .replace(
            /[&<>"']/g,
            char =>
                ({'&' : '&amp;', '<' : '&lt;', '>' : '&gt;', '"' : '&quot;', "'" : '&#39;'}[char]));
export const fixed = value => Number(value).toFixed(2);
export const rounded = value => Number(fixed(value));
export const idSafe = value => String(value).replace(/[^a-zA-Z0-9_-]/g, '');
export const pointText = p => fixed(p.x) + ' ' + fixed(p.y);
export const dataAttribute = key => 'data-' + key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());

const GLYPH_LINE = 1.9;
export const glyph = (path, size, {line = false, box, paint = ''} = {}) => drawGlyph(
    escapeText(path), {size, box, paint : line ? linePaint({width : GLYPH_LINE}) : paint});
export const placedGlyph = (path, size, {x = 0, y = 0} = {},
                            {box, paint = '', line = false} = {}) => drawGlyph(escapeText(path), {
  size,
  box,
  paint : line ? linePaint({width : GLYPH_LINE}) : paint,
  place : ' x="' + fixed(x - size / 2) + '" y="' + fixed(y - size / 2) + '"'
});

// An upright bar to drag: its gauge, the level from base to the knob, and a mark below.
export const barShare = (bars, fy) =>
    clamp((bars.bottom - fy * bars.height) / (bars.bottom - bars.top));
export function dragBar(bars, x, {base, at, level, handle, title, mark}) {
  const B = bars, left = fixed(x - B.gauge / 2);
  return '<rect class="aid-dose-gauge" x="' + left + '" y="' + B.top + '" width="' + B.gauge +
         '" height="' + (B.bottom - B.top) + '" rx="' + B.gauge / 2 + '"/><rect ' + level + ' x="' +
         left + '" y="' + fixed(Math.min(base, at)) + '" width="' + B.gauge + '" height="' +
         fixed(Math.abs(base - at)) + '"/><circle class="aid-graphic-handle" ' + handle + ' cx="' +
         fixed(x) + '" cy="' + fixed(at) + '" r="' + B.knob + '"><title>' + escapeText(title) +
         '</title></circle><text x="' + fixed(x) + '" y="' + B.mark + '" text-anchor="middle">' +
         escapeText(mark) + '</text>';
}

export const pointMarks = p => ({'.aid-vector-point,.aid-wheel-halo' : {cx : p.x, cy : p.y}});
