import {clamp} from '../../units.js';

// Text and numbers as SVG and HTML markup takes them.
export const escapeText = value =>
    String(value ?? '')
        .replace(
            /[&<>"']/g,
            char =>
                ({'&' : '&amp;', '<' : '&lt;', '>' : '&gt;', '"' : '&quot;', "'" : '&#39;'}[char]));
export const fixed = value => Number(value).toFixed(2);
// A number rounded as `fixed` writes it, still a number.
export const rounded = value => Number(fixed(value));
// A value as an id or a data attribute may hold it: letters, digits, '_' and '-'.
export const idSafe = value => String(value).replace(/[^a-zA-Z0-9_-]/g, '');
// A point {x, y} as SVG path data writes it.
export const pointText = p => fixed(p.x) + ' ' + fixed(p.y);
// The attribute behind a dataset key, as data-probe-block for probeBlock.
export const dataAttribute = key => 'data-' + key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());

// A glyph is a path drawn in a square box of GLYPH.box units and shown at a size: a line glyph is
// an outline in the text colour, any other glyph takes its paint from its style or `paint`. A
// placed glyph stands centred at a point of a drawing.
export const GLYPH = Object.freeze({box : 24, line : 1.9});
const LINE_PAINT = ' fill="none" stroke="currentColor" stroke-width="' + GLYPH.line +
                   '" stroke-linecap="round" stroke-linejoin="round"';
const glyphSvg = (place, size, path, {line = false, box = GLYPH.box, paint = ''} = {}) =>
    '<svg' + place + ' width="' + size + '" height="' + size + '" viewBox="0 0 ' + box + ' ' + box +
    '" aria-hidden="true"><path d="' + escapeText(path) + '"' + (line ? LINE_PAINT : paint) +
    '/></svg>';
export const glyph = (path, size, options) => glyphSvg('', size, path, options);
export const placedGlyph = (path, size, {x = 0, y = 0} = {}, options) => glyphSvg(
    ' x="' + fixed(x - size / 2) + '" y="' + fixed(y - size / 2) + '"', size, path, options);

// A track along which a handle sets a share of the way from `left` to `right`, at height y; the
// whole track takes the pointer with `attributes`, and without a share it shows no handle. A
// width track runs from narrow (a dot before its start) to wide (a halo after its end); a named
// track names its ends below them.
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
export const namedTrack = ([ left, right ], y, share, attributes, title, [ from, to ]) => track(
    [ left, right ], y, share, attributes, title,
    '<text x="' + left + '" y="' + (y + TRACK.name) + '">' + escapeText(from) + '</text><text x="' +
        right + '" y="' + (y + TRACK.name) + '" text-anchor="end">' + escapeText(to) + '</text>');
// The share of the way along a track at x.
export const trackShare = (x, [ left, right ]) => clamp((x - left) / (right - left));

// A pad's field, inset in its graphic of the pad's width and height: across runs from -1 at its
// left edge to 1 at its right, up from 0 at its bottom to 1 at its top. The values at the
// pointer (fractions of the graphic), the point of a pair of values, and the marks that show it.
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
// A pad's marks at a point: its point and the halo around it.
export const pointMarks = p => ({'.aid-vector-point,.aid-wheel-halo' : {cx : p.x, cy : p.y}});
