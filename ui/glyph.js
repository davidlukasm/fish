export const GLYPH = Object.freeze({box : 24, line : 1.6});
export const FILL = Object.freeze({none : 'none', ink : 'currentColor'});
export const linePaint = ({width = GLYPH.line, fill = FILL.none, ink = FILL.ink} = {}) =>
    ' fill="' + fill + '" stroke="' + ink + '" stroke-width="' + width +
    '" stroke-linecap="round" stroke-linejoin="round"';
export const glyph =
    (path, {size = null, box = GLYPH.box, paint = '', place = '', more = ''} = {}) =>
        '<svg' + place + (size === null ? '' : ' width="' + size + '" height="' + size + '"') +
        ' viewBox="0 0 ' + box + ' ' + box + '" aria-hidden="true"><path d="' + path + '"' + paint +
        '/>' + more + '</svg>';
