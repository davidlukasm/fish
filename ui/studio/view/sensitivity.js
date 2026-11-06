import {formatNumber} from '../../strings.js';
import {clamp, PERCENT} from '../../units.js';
import {idSafe, rounded} from './markup.js';
import {PICTURE} from './stimuli.js';

// How strongly a sensory cell answers, over the stimulus: for intensity senses (light, scents,
// flow, food, injury, blood) on a log axis from the engine's dimmest stimulus to full strength,
// for bounded ones (touch, pressure) from nothing to full. The handle sits at the stimulus of
// half the answer: the threshold. On the log axis moving it shifts the curve, as a threshold
// scales the stimulus the answer depends on. The axis has TICKS; under the handle the sense's
// stimulus is drawn as strong as the threshold, LARGE times a picture's size, under the axis'
// ends the weakest and the strongest, END times (each named in its title), GAP below the ticks.
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
// The axis: a log one from `dimmest` to 1, or a linear one from 0 to 1 when there is none.
const axisFraction = (stimulus, dimmest) =>
    dimmest ? 1 - Math.log(stimulus) / Math.log(dimmest) : stimulus;
const axisX = (stimulus, dimmest) =>
    SENSITIVITY.left + (SENSITIVITY.right - SENSITIVITY.left) * axisFraction(stimulus, dimmest);
const stimulusAt = (f, dimmest) => dimmest ? Math.exp(Math.log(dimmest) * (1 - f)) : f;
// The stimulus at a share of the way along the axis.
export const stimulusOfShare = stimulusAt;
// How strong a stimulus looks: its place along the axis, from 0 to 1.
export const stimulusShare = (stimulus, dimmest) => clamp(axisFraction(stimulus, dimmest));
// A stimulus's share of full strength as text.
export const stimulusText = (stimulus, dimmest) =>
    formatNumber(PERCENT * stimulus, dimmest ? 2 : 0) + ' %';
// The stimulus at a fraction of the element's width.
export function sensitivityStimulus(fx, dimmest) {
  const S = SENSITIVITY, x = Math.max(S.left, Math.min(S.right, fx * S.width));
  return stimulusAt((x - S.left) / (S.right - S.left), dimmest);
}
// answer: the engine's curve ({response, half}); dimmest: the log axis' start, or null for a
// linear one; picture(share, point, title, size): the sense's stimulus drawn; shift: the factor a
// log threshold is moved by while dragging, before the engine answers; half: where the handle is
// dragged to on a linear axis. held: the stimulus the adaptation below is held at, marked on the
// curve.
export function sensitivityElement(answer, dimmest, target, label, picture, shift = 1,
                                   dragged = null, held = null) {
  if (!answer?.response?.length || !(answer.half > 0))
    return '';
  const S = SENSITIVITY, count = answer.response.length;
  const points = answer.response.map((r, k) => {
    const stimulus = stimulusAt(k / (count - 1), dimmest) * (dimmest ? shift : 1);
    return rounded(axisX(stimulus, dimmest)) + ' ' + rounded(BASELINE - S.plot * r);
  });
  const half = dragged ?? answer.half * (dimmest ? shift : 1);
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
             points.join(' L')}"/>${heldMark(answer, dimmest, shift, held)}${pictures}` +
         `<circle class="aid-spectrum-handle" data-sensitivity-handle="half" cx="${x}" cy="${
             y}" r="${S.handle}"/></svg>`;
}
// The held stimulus on the curve: where the adaptation below starts.
function heldMark(answer, dimmest, shift, held) {
  if (!(held > 0))
    return '';
  const count = answer.response.length;
  // The curve's samples run over the axis; the held stimulus lies between two of them.
  const at = k => stimulusAt(k / (count - 1), dimmest) * (dimmest ? shift : 1);
  let k = 1;
  while (k < count - 1 && at(k) < held)
    ++k;
  const share = clamp((held - at(k - 1)) / ((at(k) - at(k - 1)) || 1));
  const r = answer.response[k - 1] + (answer.response[k] - answer.response[k - 1]) * share;
  const x = rounded(axisX(held, dimmest)), y = rounded(BASELINE - SENSITIVITY.plot * r);
  return `<line class="aid-held-line" x1="${x}" y1="${y}" x2="${x}" y2="${
      BASELINE}"/><circle class="aid-held-mark" cx="${x}" cy="${y}" r="${HELD_MARK}"/>`;
}
const HELD_MARK = 4.5;

// How a sensory cell gets used to a held stimulus: its answer step by step over a few of its time
// constants, the stimulus drawn HELD times along the first SPAN of the time axis as it stays. The
// handle sits at one time constant; moving it stretches the curve in time.
const ADAPTATION = Object.freeze({
  width : 360,
  height : 140,
  left : 12,
  right : 348,
  top : 10,
  plot : 66,
  held : 4,
  span : .6,
  size : 1.8
});
const ADAPT_BASE = ADAPTATION.top + ADAPTATION.plot;
// The time constant in steps at a fraction of the element's width, for a curve of `count` steps.
export function adaptationSteps(fx, count) {
  const A = ADAPTATION, x = Math.max(A.left, Math.min(A.right, fx * A.width));
  return Math.max(1, (x - A.left) / (A.right - A.left) * count);
}
// held(point, size): the held stimulus drawn around a point, size times a picture's size.
export function adaptationElement(adapt, target, label, stepsLabel, held, stretch = 1) {
  if (!adapt?.response?.length || !(adapt.steps > 0))
    return '';
  const A = ADAPTATION, count = adapt.response.length - 1;
  const ax = step => A.left + (A.right - A.left) * Math.min(1, step / count);
  const points = adapt.response.map((r, k) => rounded(ax(k * stretch)) + ' ' +
                                              rounded(ADAPT_BASE - A.plot * r));
  const steps = adapt.steps * stretch;
  const at = adapt.response[Math.min(count, Math.round(adapt.steps))];
  const attributes =
      Object.entries(target).map(([ key, value ]) => ` data-${key}="${idSafe(value)}"`).join('');
  const pictures =
      Array
          .from({length : A.held},
                (_, k) => held({
                  x : A.left + PICTURE.size * A.size / 2 +
                          (A.right - A.left - PICTURE.size * A.size) * A.span * k / (A.held - 1),
                  y : PICTURE_Y
                },
                               A.size))
          .join('');
  return `<svg class="aid-sensitivity aid-adaptation" viewBox="0 0 ${A.width} ${A.height}"${
      attributes} role="img" aria-label="${label}"><line class="aid-sensitivity-axis" x1="${
      A.left}" y1="${ADAPT_BASE}" x2="${A.right}" y2="${
      ADAPT_BASE}"/><line class="aid-sensitivity-half" x1="${rounded(ax(steps))}" y1="${
      A.top}" x2="${rounded(ax(steps))}" y2="${
      ADAPT_BASE}"/><path class="aid-sensitivity-curve" d="M${
      points.join(' L')}"/><circle class="aid-held-mark" cx="${A.left}" cy="${
      rounded(ADAPT_BASE - A.plot * adapt.response[0])}" r="${HELD_MARK}"/>${
      pictures}<circle class="aid-spectrum-handle" data-adaptation-handle="tau" cx="${
      rounded(ax(
          steps))}" cy="${rounded(ADAPT_BASE - A.plot * at)}" r="${SENSITIVITY.handle}"/><text x="${
      A.right}" y="${A.height - SENSITIVITY.tick}" text-anchor="end">${stepsLabel}</text></svg>`;
}
