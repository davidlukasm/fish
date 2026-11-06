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
  command : [ .08, .22 ],
  swing : .3,
  samples : 90,
  spans : 3,
  beats : 2,
  tick : 4,
  label : 11,
  inset : 4,
  rise : 3
});
const MIDDLE = DRIVE.top + DRIVE.plot / 2, HALF = DRIVE.plot / 2;
const CREST_QUARTERS = 4;
const axisSteps = rhythm => rhythm ? LONGEST_TIME_CONSTANT * DRIVE.beats
                                   : LONGEST_TIME_CONSTANT * DRIVE.spans / (1 - DRIVE.command[1]);
const period = tau => Math.max(TIME_CONSTANT.pace_min_steps, timeConstantSteps(tau));
const stepAt = (fx, rhythm) =>
    (fx * DRIVE.width - DRIVE.left) / (DRIVE.right - DRIVE.left) * axisSteps(rhythm);
const y = level => MIDDLE - HALF * level;
export const restLevel = (center, scale) => Math.tanh(-scale * center.threshold);
export function drivePatch(handle, fx, fy, scale) {
  if (handle === 'adapt')
    return {
      tau : timeConstantOf(Math.max(
          TIME_CONSTANT.min_steps, (adaptStepAt(fx) - ADAPT.held[0] * adaptAxis) / ADAPTATION_SPAN))
    };
  if (handle === 'rest') {
    const most = Math.tanh(scale);
    const level = Math.max(-most, Math.min(most, (MIDDLE - fy * DRIVE.height) / HALF));
    return {threshold : clamp(-Math.atanh(level) / scale, -1)};
  }
  if (handle === 'beat')
    return {
      tau : timeConstantOf(Math.max(TIME_CONSTANT.min_steps, CREST_QUARTERS * stepAt(fx, true)))
    };
  return {
    tau : timeConstantOf(
        Math.max(TIME_CONSTANT.min_steps, stepAt(fx, false) - DRIVE.command[1] * axisSteps(false)))
  };
}
export function driveElement(center, label, stepsLabel, {scale, rhythm = false, meaning = null}) {
  const D = DRIVE, rest = restLevel(center, scale), total = axisSteps(rhythm),
        band = Math.tanh(scale);
  const x = step => D.left + (D.right - D.left) * step / total;
  const tc = rhythm ? period(center.tau) : timeConstantSteps(center.tau);
  const [from, to] = D.command.map(f => f * total);
  const swing = Math.min(D.swing, 1 - Math.abs(rest));
  const level = rhythm ? step => rest + swing * Math.sin(2 * Math.PI * step / tc)
                       : step => step < from  ? rest
                                 : step <= to ? 1
                                              : rest + (1 - rest) * Math.exp(-(step - to) / tc);
  const points = Array.from({length : D.samples + 1}, (_, k) => {
    const step = total * k / D.samples;
    return rounded(x(step)) + ' ' + rounded(y(level(step)));
  });
  const knee = rhythm ? tc / CREST_QUARTERS : to + tc;
  const command = rhythm ? ''
                         : `<rect class="aid-drive-command" x="${rounded(x(from))}" y="${
                               D.top}" width="${rounded(x(to) - x(from))}" height="${D.plot}"/>`;
  const idle = meaning?.idle ? `<rect class="aid-drive-idle" x="${D.left}" y="${MIDDLE}" width="${
                                   D.right - D.left}" height="${HALF}"/>`
                             : '';
  const names =
      meaning ? `<text x="${D.left + D.inset}" y="${D.top + D.label}">${meaning.above}</text>` +
                    `<text x="${D.left + D.inset}" y="${D.top + D.plot - D.rise}">${
                        meaning.below}</text>`
              : '';
  return `<svg class="aid-sensitivity aid-drive" viewBox="0 0 ${D.width} ${D.height}" data-drive="${
      idSafe(center.id)}" role="img" aria-label="${label}">${idle}${
      command}<rect class="aid-drive-band" x="${D.left}" y="${rounded(y(band))}" width="${
      D.right - D.left}" height="${rounded(y(-band) - y(band))}"/>${
      names}<line class="aid-sensitivity-axis" x1="${D.left}" y1="${MIDDLE}" x2="${D.right}" y2="${
      MIDDLE}"/><line class="aid-sensitivity-half" x1="${D.left}" y1="${rounded(y(rest))}" x2="${
      D.right}" y2="${rounded(y(rest))}"/><path class="aid-sensitivity-curve" d="M${
      points.join(' L')}"/><circle class="aid-spectrum-handle" data-drive-handle="rest" cx="${
      rhythm ? D.right - D.handle : rounded(x(from / 2))}" cy="${rounded(y(rest))}" r="${
      D.handle}"/><circle class="aid-spectrum-handle" data-drive-handle="${
      rhythm ? 'beat' : 'tau'}" cx="${rounded(x(knee))}" cy="${rounded(y(level(knee)))}" r="${
      D.handle}"/><text x="${D.right}" y="${D.height - D.tick}" text-anchor="end">${
      stepsLabel(Math.round(tc))}</text></svg>`;
}

const ADAPTATION_SPAN = 10;
const ICON_LINE = 1.6;
const ADAPT = Object.freeze({held : [ .1, .55 ], input : .9, samples : 160, icon : 14, below : 9});
const adaptAxis = ADAPTATION_SPAN * LONGEST_TIME_CONSTANT / (ADAPT.held[1] - ADAPT.held[0]);
const adaptStepAt = fx => (fx * DRIVE.width - DRIVE.left) / (DRIVE.right - DRIVE.left) * adaptAxis;
export const CHANGE_ICON = 'M2 18h7l2-13 2 13h9';
export const LEVEL_ICON = 'M2 18h5V6h11v12h4';
export function adaptElement(center, label, stepsLabel, {scale}) {
  const D = DRIVE, A = ADAPT, bias = -scale * center.threshold;
  const rate = 1 / (ADAPTATION_SPAN * timeConstantSteps(center.tau));
  const x = step => D.left + (D.right - D.left) * step / adaptAxis;
  const [on, off] = A.held.map(f => f * adaptAxis);
  let mean = 0;
  const answer = [];
  for (let k = 0; k <= A.samples; ++k) {
    const step = adaptAxis * k / A.samples, input = step >= on && step < off ? A.input : 0;
    answer.push([ step, Math.tanh(bias + input - mean) ]);
    mean += (input - mean) * rate * adaptAxis / A.samples;
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
