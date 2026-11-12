import {formatNumber} from '../../strings.js';
import {clamp, PERCENT} from '../../units.js';
import {idSafe, rounded} from './markup.js';
import {PICTURE} from './stimuli.js';

const SENSITIVITY = Object.freeze({
  width : 360,
  height : 140,
  left : 12,
  right : 348,
  top : 10,
  plot : 66,
  handle : 7,
  ticks : 5,
  tick : 4,
  gap : 4,
  large : 2.6,
  end : 1.6
});
const BASELINE = SENSITIVITY.top + SENSITIVITY.plot;
const PICTURE_Y =
    BASELINE + SENSITIVITY.tick + SENSITIVITY.gap + PICTURE.size * SENSITIVITY.large / 2;
const axisFraction = (stimulus, dimmest) =>
    dimmest ? 1 - Math.log(stimulus) / Math.log(dimmest) : stimulus;
const axisX = (stimulus, dimmest) =>
    SENSITIVITY.left + (SENSITIVITY.right - SENSITIVITY.left) * axisFraction(stimulus, dimmest);
const stimulusAt = (f, dimmest) => dimmest ? Math.exp(Math.log(dimmest) * (1 - f)) : f;
export const stimulusOfShare = stimulusAt;
export const stimulusShare = (stimulus, dimmest) => clamp(axisFraction(stimulus, dimmest));
const stimulusText = (stimulus, dimmest) =>
    formatNumber(PERCENT * stimulus, dimmest ? 2 : 0) + ' %';
export function sensitivityStimulus(fx, dimmest) {
  const S = SENSITIVITY, x = Math.max(S.left, Math.min(S.right, fx * S.width));
  return stimulusAt((x - S.left) / (S.right - S.left), dimmest);
}
export function sensitivityElement(answer, dimmest, target, label, picture, shift = 1) {
  if (!answer?.response?.length || !(answer.half > 0))
    return '';
  const S = SENSITIVITY, count = answer.response.length;
  const points = answer.response.map((r, k) => {
    const stimulus = stimulusAt(k / (count - 1), dimmest) * (dimmest ? shift : 1);
    return rounded(axisX(stimulus, dimmest)) + ' ' + rounded(BASELINE - S.plot * r);
  });
  const half = answer.half * (dimmest ? shift : 1);
  const x = rounded(axisX(half, dimmest)), y = rounded(BASELINE - S.plot / 2);
  const attributes =
      Object.entries(target).map(([ key, value ]) => ` data-${key}="${idSafe(value)}"`).join('');
  let ticks = '';
  for (let k = 0; k < S.ticks; ++k) {
    const tx = rounded(axisX(stimulusAt(k / (S.ticks - 1), dimmest), dimmest));
    ticks += `<line class="aid-sensitivity-tick" x1="${tx}" y1="${BASELINE}" x2="${tx}" y2="${
        BASELINE + S.tick}"/>`;
  }
  const end = (share, x) => `<g class="aid-sensitivity-end">${
      picture(share, {x, y : PICTURE_Y}, stimulusText(stimulusAt(share, dimmest), dimmest),
              S.end)}</g>`;
  const pictures = end(0, S.left + PICTURE.size * S.end / 2) +
                   end(1, S.right - PICTURE.size * S.end / 2) +
                   picture(stimulusShare(half, dimmest), {x : Number(x), y : PICTURE_Y},
                           stimulusText(half, dimmest), S.large);
  const clip = 'aid-sensitivity-clip-' + Object.values(target).map(idSafe).join('-');
  return `<svg class="aid-sensitivity" viewBox="0 0 ${S.width} ${S.height}"${
             attributes} role="img" aria-label="${label}"><clipPath id="${clip}"><rect x="${
             S.left}" y="0" width="${S.right - S.left}" height="${S.height}"/></clipPath>` +
         `<line class="aid-sensitivity-axis" x1="${S.left}" y1="${BASELINE}" x2="${S.right}" y2="${
             BASELINE}"/>${ticks}<line class="aid-sensitivity-half" x1="${S.left}" y1="${y}" x2="${
             x}" y2="${y}"/><path class="aid-sensitivity-curve" clip-path="url(#${clip})" d="M${
             points.join(' L')}"/>${pictures}` +
         `<circle class="aid-spectrum-handle" data-sensitivity-handle="half" cx="${x}" cy="${
             y}" r="${S.handle}"/></svg>`;
}
