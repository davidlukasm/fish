import {formatNumber} from '../../strings.js';
import {PERCENT} from '../../units.js';

// How strongly a sensory cell answers, over the stimulus: for intensity senses (light, scents,
// flow, food, injury, blood) on a log axis from the engine's dimmest stimulus to full strength,
// for bounded ones (touch, pressure) from nothing to full. The handle sits at the stimulus of
// half the answer: the threshold. On the log axis moving it shifts the curve, as a threshold
// scales the stimulus the answer depends on.
const SENSITIVITY = Object.freeze({
  width : 360,
  height : 104,
  left : 12,
  right : 348,
  top : 10,
  plot : 66,
  handle : 7,
  ticks : 5,
  tick : 4
});
const BASELINE = SENSITIVITY.top + SENSITIVITY.plot;
const n = value => Number(value.toFixed(1));
const safe = value => String(value).replace(/[^a-zA-Z0-9_-]/g, '');
// The axis: a log one from `dimmest` to 1, or a linear one from 0 to 1 when there is none.
const axisFraction = (stimulus, dimmest) =>
    dimmest ? 1 - Math.log(stimulus) / Math.log(dimmest) : stimulus;
const axisX = (stimulus, dimmest) =>
    SENSITIVITY.left + (SENSITIVITY.right - SENSITIVITY.left) * axisFraction(stimulus, dimmest);
const stimulusAt = (f, dimmest) => dimmest ? Math.exp(Math.log(dimmest) * (1 - f)) : f;
// The stimulus at a fraction of the element's width.
export function sensitivityStimulus(fx, dimmest) {
  const S = SENSITIVITY, x = Math.max(S.left, Math.min(S.right, fx * S.width));
  return stimulusAt((x - S.left) / (S.right - S.left), dimmest);
}
// answer: the engine's curve ({response, half}); dimmest: the log axis' start, or null for a
// linear one; shift: the factor a log threshold is moved by while dragging, before the engine
// answers; half: where the handle is dragged to on a linear axis.
export function sensitivityElement(answer, dimmest, target, label, shift = 1, dragged = null) {
  if (!answer?.response?.length || !(answer.half > 0))
    return '';
  const S = SENSITIVITY, count = answer.response.length;
  const points = answer.response.map((r, k) => {
    const stimulus = stimulusAt(k / (count - 1), dimmest) * (dimmest ? shift : 1);
    return n(axisX(stimulus, dimmest)) + ' ' + n(BASELINE - S.plot * r);
  });
  const half = dragged ?? answer.half * (dimmest ? shift : 1);
  const x = n(axisX(half, dimmest)), y = n(BASELINE - S.plot / 2);
  const attributes =
      Object.entries(target).map(([ key, value ]) => ` data-${key}="${safe(value)}"`).join('');
  let ticks = '';
  for (let k = 0; k < S.ticks; ++k) {
    const stimulus = stimulusAt(k / (S.ticks - 1), dimmest);
    const tx = n(axisX(stimulus, dimmest));
    ticks += `<line class="aid-sensitivity-tick" x1="${tx}" y1="${BASELINE}" x2="${tx}" y2="${
        BASELINE + S.tick}"/><text x="${tx}" y="${S.height - S.tick}" text-anchor="${
        k === 0 ? 'start'
        : k === S.ticks - 1
            ? 'end'
            : 'middle'}">${formatNumber(PERCENT * stimulus, dimmest ? 2 : 0)} %</text>`;
  }
  const clip = 'aid-sensitivity-clip-' + Object.values(target).map(safe).join('-');
  return `<svg class="aid-sensitivity" viewBox="0 0 ${S.width} ${S.height}"${
             attributes} role="img" aria-label="${label}"><clipPath id="${clip}"><rect x="${
             S.left}" y="0" width="${S.right - S.left}" height="${S.height}"/></clipPath>` +
         `<line class="aid-sensitivity-axis" x1="${S.left}" y1="${BASELINE}" x2="${S.right}" y2="${
             BASELINE}"/>${ticks}<line class="aid-sensitivity-half" x1="${S.left}" y1="${y}" x2="${
             x}" y2="${y}"/><path class="aid-sensitivity-curve" clip-path="url(#${clip})" d="M${
             points.join(
                 ' L')}"/><circle class="aid-spectrum-handle" data-sensitivity-handle="half" cx="${
             x}" cy="${y}" r="${S.handle}"/></svg>`;
}

// How a sensory cell gets used to a held stimulus: its answer step by step over a few of its time
// constants. The handle sits at one time constant; moving it stretches the curve in time.
const ADAPTATION =
    Object.freeze({width : 360, height : 96, left : 12, right : 348, top : 10, plot : 60});
const ADAPT_BASE = ADAPTATION.top + ADAPTATION.plot;
// The time constant in steps at a fraction of the element's width, for a curve of `count` steps.
export function adaptationSteps(fx, count) {
  const A = ADAPTATION, x = Math.max(A.left, Math.min(A.right, fx * A.width));
  return Math.max(1, (x - A.left) / (A.right - A.left) * count);
}
export function adaptationElement(adapt, target, label, stepsLabel, stretch = 1) {
  if (!adapt?.response?.length || !(adapt.steps > 0))
    return '';
  const A = ADAPTATION, count = adapt.response.length - 1;
  const ax = step => A.left + (A.right - A.left) * Math.min(1, step / count);
  const points =
      adapt.response.map((r, k) => n(ax(k * stretch)) + ' ' + n(ADAPT_BASE - A.plot * r));
  const steps = adapt.steps * stretch;
  const at = adapt.response[Math.min(count, Math.round(adapt.steps))];
  const attributes =
      Object.entries(target).map(([ key, value ]) => ` data-${key}="${safe(value)}"`).join('');
  return `<svg class="aid-sensitivity aid-adaptation" viewBox="0 0 ${A.width} ${A.height}"${
      attributes} role="img" aria-label="${label}"><line class="aid-sensitivity-axis" x1="${
      A.left}" y1="${ADAPT_BASE}" x2="${A.right}" y2="${
      ADAPT_BASE}"/><line class="aid-sensitivity-half" x1="${n(ax(steps))}" y1="${A.top}" x2="${
      n(ax(steps))}" y2="${ADAPT_BASE}"/><path class="aid-sensitivity-curve" d="M${
      points.join(' L')}"/><circle class="aid-spectrum-handle" data-adaptation-handle="tau" cx="${
      n(ax(steps))}" cy="${n(ADAPT_BASE - A.plot * at)}" r="${SENSITIVITY.handle}"/><text x="${
      A.right}" y="${A.height - SENSITIVITY.tick}" text-anchor="end">${stepsLabel}</text></svg>`;
}
