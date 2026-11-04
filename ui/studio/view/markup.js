// Text and numbers as SVG and HTML markup takes them.
export const escapeText = value =>
    String(value ?? '')
        .replace(
            /[&<>"']/g,
            char =>
                ({'&' : '&amp;', '<' : '&lt;', '>' : '&gt;', '"' : '&quot;', "'" : '&#39;'}[char]));
export const fixed = value => Number(value).toFixed(2);
