import {clamp} from '../../units.js';
import {TIME_CONSTANT} from '../../schema.js';
import {LONGEST_TIME_CONSTANT, timeConstantOf, timeConstantSteps} from '../../tuning.js';
import {idSafe, placedGlyph, rounded} from './markup.js';
import {linePaint} from '../../glyph.js';

const DRIVE = Object.freeze({
  width : 360,
  height : 124,
  left : 12,
  right : 348,
  top : 10,
  plot : 92,
  handle : 7,
  samples : 90,
  beats : 2,
  tick : 4,
  label : 11,
  inset : 4,
  rise : 3
});
const MIDDLE = DRIVE.top + DRIVE.plot / 2, HALF = DRIVE.plot / 2;
const CREST_QUARTERS = 4;
const axisSteps = rhythm => rhythm ? LONGEST_TIME_CONSTANT * DRIVE.beats : 2;
const period = tau => Math.max(TIME_CONSTANT.pace_min_steps, timeConstantSteps(tau));
const stepAt = (fx, rhythm) =>
    (fx * DRIVE.width - DRIVE.left) / (DRIVE.right - DRIVE.left) * axisSteps(rhythm);
const y = level => MIDDLE - HALF * level;
export function drivePatch(handle, fx, fy, {scale, excitation = 0, output = 1}) {
  if (handle === 'adapt')
    return {
      tau : timeConstantOf(Math.max(
          TIME_CONSTANT.min_steps, (adaptStepAt(fx) - ADAPT.held[0] * adaptAxis) / ADAPTATION_SPAN))
    };
  if (handle === 'rest') {
    if (!(output > 0) || !(scale > 0))
      return {};
    const level = clamp((MIDDLE - fy * DRIVE.height) / HALF / output, -1 + Number.EPSILON,
                        1 - Number.EPSILON);
    return {threshold : clamp((excitation - Math.atanh(level)) / scale, -1)};
  }
  if (handle === 'gate')
    return {
      threshold :
          clamp(((fx * DRIVE.width - DRIVE.left) / (DRIVE.right - DRIVE.left) * 2 - 1) / scale, -1)
    };
  if (handle === 'beat')
    return {
      tau : timeConstantOf(Math.max(TIME_CONSTANT.min_steps, CREST_QUARTERS * stepAt(fx, true)))
    };
  return {};
}
export function motorResponse(center, input, {scale, excitation = 0, output = 1}) {
  const drive =
      Math.sign(input) * Math.max(0, Math.abs(input) - Math.max(0, scale * center.threshold));
  return Math.tanh((1 + excitation) * drive) * output;
}
export function driveElement(center, label, stepsLabel, {
  scale,
  rhythm = false,
  meaning = null,
  excitation = 0,
  output = 1,
  pace = 0,
  rhythmEffect = 0
}) {
  const D = DRIVE, rest = Math.tanh(-scale * center.threshold + excitation) * output,
        total = axisSteps(rhythm);
  const x = step => D.left + (D.right - D.left) * step / total;
  const tc = rhythm ? period(center.tau) : timeConstantSteps(center.tau);
  const level =
      rhythm ? step => Math.tanh(-scale * center.threshold + excitation +
                                 pace * .5 * (1 + rhythmEffect) *
                                     Math.sin(2 * Math.PI * step / tc)) *output
             : step => {
                 return motorResponse(center, 2 * step / total - 1, {scale, excitation, output});
               };
  const points = Array.from({length : D.samples + 1}, (_, k) => {
    const step = total * k / D.samples;
    return rounded(x(step)) + ' ' + rounded(y(level(step)));
  });
  const knee =
      rhythm ? tc / CREST_QUARTERS : total * (1 + Math.max(0, scale * center.threshold)) / 2;
  const idle = meaning?.idle ? `<rect class="aid-drive-idle" x="${D.left}" y="${MIDDLE}" width="${
                                   D.right - D.left}" height="${HALF}"/>`
                             : '';
  const names = meaning
                    ? `<text x="${D.right - D.inset}" y="${D.top + D.label}" text-anchor="end">${
                          meaning.above}</text><text x="${D.right - D.inset}" y="${
                          D.top + D.plot - D.rise}" text-anchor="end">${meaning.below}</text>`
                    : '';
  return `<svg class="aid-sensitivity aid-drive" viewBox="0 0 ${D.width} ${D.height}" data-drive="${
      idSafe(center.id)}" role="img" aria-label="${label}">${idle}${
      names}<line class="aid-sensitivity-axis" x1="${D.left}" y1="${MIDDLE}" x2="${D.right}" y2="${
      MIDDLE}"/><line class="aid-sensitivity-half" x1="${D.left}" y1="${
      rounded(y(rhythm ? rest : 0))}" x2="${D.right}" y2="${
      rounded(y(rhythm ? rest : 0))}"/><path class="aid-sensitivity-curve" d="M${
      points.join(' L')}"/><circle class="aid-spectrum-handle" data-drive-handle="${
      rhythm
          ? 'rest'
          : 'gate'}" cx="${rhythm ? D.right - D.handle : rounded(x(Math.min(total, knee)))}" cy="${
      rounded(y(rhythm ? rest : 0))}" r="${D.handle}"/>${
      rhythm ? `<circle class="aid-spectrum-handle" data-drive-handle="beat" cx="${
                   rounded(x(knee))}" cy="${rounded(y(level(knee)))}" r="${D.handle}"/>`
             : ''}<text x="${D.right}" y="${D.height - D.tick}" text-anchor="end">${
      rhythm ? stepsLabel(Math.round(tc)) : stepsLabel()}</text></svg>`;
}

const ADAPTATION_SPAN = 10;
const ICON_LINE = 1.6;
const ADAPT = Object.freeze({held : [ .1, .55 ], input : .9, samples : 160, icon : 14, below : 9});
const adaptAxis = ADAPTATION_SPAN * LONGEST_TIME_CONSTANT / (ADAPT.held[1] - ADAPT.held[0]);
const adaptStepAt = fx => (fx * DRIVE.width - DRIVE.left) / (DRIVE.right - DRIVE.left) * adaptAxis;
export const CHANGE_ICON = 'M2 18h7l2-13 2 13h9';
export const LEVEL_ICON = 'M2 18h5V6h11v12h4';
export function adaptElement(center, label, stepsLabel,
                             {scale, excitation = 0, output = 1, adaptationSpan = 10}) {
  const D = DRIVE, A = ADAPT, bias = -scale * center.threshold + excitation;
  const rate = 1 / (adaptationSpan * timeConstantSteps(center.tau));
  const x = step => D.left + (D.right - D.left) * step / adaptAxis;
  const [on, off] = A.held.map(f => f * adaptAxis);
  let mean = 0;
  const answer = [], stride = Math.max(1, Math.round(adaptAxis / A.samples));
  for (let step = 0; step <= Math.ceil(adaptAxis); ++step) {
    const input = step >= on && step < off ? A.input : 0;
    mean += (input - mean) * rate;
    if (step % stride === 0 || step === Math.ceil(adaptAxis))
      answer.push([ step, Math.tanh(bias + input - mean) * output ]);
  }
  const knee = on + ADAPTATION_SPAN * timeConstantSteps(center.tau);
  const atKnee =
      answer.reduce((best, p) => Math.abs(p[0] - knee) < Math.abs(best[0] - knee) ? p : best);
  const ends =
      [ on + ADAPTATION_SPAN * TIME_CONSTANT.min_steps, on + adaptAxis * (A.held[1] - A.held[0]) ];
  const icons = [ CHANGE_ICON, LEVEL_ICON ]
                    .map((path, k) => placedGlyph(path, A.icon,
                                                  {x : x(ends[k]), y : D.top + D.plot + A.below},
                                                  {paint : linePaint({width : ICON_LINE})}))
                    .join('');
  return `<svg class="aid-sensitivity aid-drive" viewBox="0 0 ${D.width} ${D.height}" data-drive="${
      idSafe(center.id)}" role="img" aria-label="${label}"><rect class="aid-drive-command" x="${
      rounded(x(on))}" y="${D.top}" width="${rounded(x(off) - x(on))}" height="${
      D.plot}"/><line class="aid-sensitivity-axis" x1="${D.left}" y1="${MIDDLE}" x2="${
      D.right}" y2="${MIDDLE}"/><line class="aid-sensitivity-half" x1="${D.left}" y1="${
      rounded(y(Math.tanh(bias)))}" x2="${D.right}" y2="${
      rounded(y(Math.tanh(bias)))}"/><path class="aid-sensitivity-curve" d="M${
      answer.map(([ step, v ]) => rounded(x(step)) + ' ' + rounded(y(v))).join(' L')}"/>${
      icons}<circle class="aid-spectrum-handle" data-drive-handle="rest" cx="${
      rounded(x(on / 2))}" cy="${rounded(y(Math.tanh(bias)))}" r="${
      D.handle}"/><circle class="aid-spectrum-handle" data-drive-handle="adapt" cx="${
      rounded(x(knee))}" cy="${rounded(y(atKnee[1]))}" r="${D.handle}"/><text x="${D.right}" y="${
      D.height - D.tick}" text-anchor="end">${
      stepsLabel(Math.round(ADAPTATION_SPAN * timeConstantSteps(center.tau)))}</text></svg>`;
}
