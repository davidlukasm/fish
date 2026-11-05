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

// A track along which a handle sets a width, from narrow (a dot before its start) to wide (a
// halo after its end), at height y between `left` and `right`; the whole track takes the pointer
// with `attributes`, and the share of the way along it is the width.
export const WIDTH_TRACK = Object.freeze({narrow : 2.5, wide : 9, handle : 6, gap : 2});
export function widthTrack([ left, right ], y, width, attributes, title) {
  const T = WIDTH_TRACK;
  const line = cls =>
      '<line' + cls + ' x1="' + left + '" y1="' + y + '" x2="' + right + '" y2="' + y + '"/>';
  return '<g class="aid-width-track" ' + attributes + '>' + line(' class="hit"') + line('') +
         '<circle class="narrow" cx="' + (left - T.wide - T.gap) + '" cy="' + y + '" r="' +
         T.narrow + '"/><circle class="wide" cx="' + (right + T.wide + T.gap) + '" cy="' + y +
         '" r="' + T.wide + '"/><circle class="aid-graphic-handle" cx="' +
         fixed(left + (right - left) * width) + '" cy="' + y + '" r="' + T.handle + '"/><title>' +
         escapeText(title) + '</title></g>';
}
export const trackShare = (x, [ left, right ]) =>
    Math.max(0, Math.min(1, (x - left) / (right - left)));
