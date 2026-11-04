import {formatNumber} from '../../strings.js';
import {PERCENT} from '../../units.js';

// How strongly a light cell answers its best colour, over the brightness of that light from the
// engine's dimmest test light to full light on a log axis. The handle sits at the brightness of
// half the answer: the threshold. Moving it shifts the curve along the axis, as a threshold
// scales the light the answer depends on.
const SENSITIVITY = Object.freeze({
  width : 360,
  height : 104,
  left : 12,
  right : 348,
  top : 10,
  plot : 66,
  handle : 7,
  ticks : 5
});
const BASELINE = SENSITIVITY.top + SENSITIVITY.plot;
const n = value => Number(value.toFixed(1));
const safe = value => String(value).replace(/[^a-zA-Z0-9_-]/g, '');
const axisX = (brightness, dimmest) =>
    SENSITIVITY.left +
    (SENSITIVITY.right - SENSITIVITY.left) * (1 - Math.log(brightness) / Math.log(dimmest));
// The brightness at a fraction of the element's width.
export function sensitivityBrightness(fx, dimmest) {
  const S = SENSITIVITY, x = Math.max(S.left, Math.min(S.right, fx * S.width));
  return Math.exp(Math.log(dimmest) * (1 - (x - S.left) / (S.right - S.left)));
}
// light: the engine's curves of the cell; shift: the factor its threshold is moved by while
// dragging, before the engine answers.
export function sensitivityElement(light, dimmest, target, label, shift = 1) {
  if (!light?.response?.length || !(light.half > 0) || !(dimmest > 0))
    return '';
  const S = SENSITIVITY, count = light.response.length;
  const points = light.response.map((r, k) => {
    const brightness = Math.exp(Math.log(dimmest) * (1 - k / (count - 1))) * shift;
    return n(axisX(brightness, dimmest)) + ' ' + n(BASELINE - S.plot * r);
  });
  const half = light.half * shift, x = n(axisX(half, dimmest)), y = n(BASELINE - S.plot / 2);
  const attributes =
      Object.entries(target).map(([ key, value ]) => ` data-${key}="${safe(value)}"`).join('');
  let ticks = '';
  for (let k = 0; k < S.ticks; ++k) {
    const brightness = Math.exp(Math.log(dimmest) * (1 - k / (S.ticks - 1)));
    const tx = n(axisX(brightness, dimmest));
    ticks += `<line class="aid-sensitivity-tick" x1="${tx}" y1="${BASELINE}" x2="${tx}" y2="${
        BASELINE + 4}"/><text x="${tx}" y="${S.height - 4}" text-anchor="middle">${
        formatNumber(PERCENT * brightness, 2)} %</text>`;
  }
  return `<svg class="aid-sensitivity" viewBox="0 0 ${S.width} ${S.height}"${
             attributes} role="img" aria-label="${
             label}"><clipPath id="aid-sensitivity-clip"><rect x="${S.left}" y="0" width="${
             S.right - S.left}" height="${S.height}"/></clipPath>` +
         `<line class="aid-sensitivity-axis" x1="${S.left}" y1="${BASELINE}" x2="${S.right}" y2="${
             BASELINE}"/>${ticks}<line class="aid-sensitivity-half" x1="${S.left}" y1="${y}" x2="${
             x}" y2="${
             y}"/><path class="aid-sensitivity-curve" clip-path="url(#aid-sensitivity-clip)" d="M${
             points.join(
                 ' L')}"/><circle class="aid-spectrum-handle" data-sensitivity-handle="half" cx="${
             x}" cy="${y}" r="${S.handle}"/></svg>`;
}
