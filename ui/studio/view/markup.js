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

export const TRACK = Object.freeze({narrow : 2.5, wide : 9, handle : 6, gap : 2, name : 18});
function track([ left, right ], y, share, attributes, title, ends) {
  const line = cls =>
      '<line' + cls + ' x1="' + left + '" y1="' + y + '" x2="' + right + '" y2="' + y + '"/>';
  const handle = share === null ? ''
                                : '<circle class="aid-graphic-handle" cx="' +
                                      fixed(left + (right - left) * clamp(share)) + '" cy="' + y +
                                      '" r="' + TRACK.handle + '"/>';
  return '<g class="aid-track" ' + (share === null ? '' : attributes) + '>' + line(' class="hit"') +
         line('') + ends + handle + '<title>' + escapeText(title) + '</title></g>';
}
export const widthTrack = ([ left, right ], y, width, attributes, title) =>
    track([ left, right ], y, width, attributes, title,
          '<circle class="narrow" cx="' + (left - TRACK.wide - TRACK.gap) + '" cy="' + y + '" r="' +
              TRACK.narrow + '"/><circle class="wide" cx="' + (right + TRACK.wide + TRACK.gap) +
              '" cy="' + y + '" r="' + TRACK.wide + '"/>');
export const plainTrack = (range, y, share, attributes, title) =>
    track(range, y, share, attributes, title, '');
export const namedTrack = ([ left, right ], y, share, attributes, title, [ from, to ]) => track(
    [ left, right ], y, share, attributes, title,
    '<text x="' + left + '" y="' + (y + TRACK.name) + '">' + escapeText(from) + '</text><text x="' +
        right + '" y="' + (y + TRACK.name) + '" text-anchor="end">' + escapeText(to) + '</text>');
export const trackShare = (x, [ left, right ]) => clamp((x - left) / (right - left));
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

export function padValues(pad, fx, fy) {
  const across = pad.width - 2 * pad.inset, up = pad.height - 2 * pad.inset;
  return {
    across : clamp(((fx * pad.width - pad.inset) / across) * 2 - 1, -1),
    up : clamp(1 - (fy * pad.height - pad.inset) / up)
  };
}
export const padPoint = (pad, across, up) => ({
  x : pad.inset + (across + 1) / 2 * (pad.width - 2 * pad.inset),
  y : pad.inset + (1 - up) * (pad.height - 2 * pad.inset)
});
export const pointMarks = p => ({'.aid-vector-point,.aid-wheel-halo' : {cx : p.x, cy : p.y}});
