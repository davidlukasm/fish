// Icons as inline SVG, in the Aquarium and the Atelier alike: a path drawn in a square box of
// GLYPH.box units (or of `box`). A line icon is an outline GLYPH.line thick in the text colour
// (FILL.ink), unless asked otherwise, and may be filled too; any other icon takes its paint from
// its style or from `paint`. Without a size, the icon's style sizes it; `place`
// positions it inside a drawing and `more` adds further marks.
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
