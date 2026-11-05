import {clamp} from '../../units.js';
import {TIME_CONSTANT} from '../../schema.js';
import {LONGEST_TIME_CONSTANT, timeConstantOf, timeConstantSteps} from '../../tuning.js';
import {idSafe, rounded} from './markup.js';

// How an effector or nerve center idles and recovers, on the engine's activity from -1 to 1. At
// rest, without input, a cell is as active as the tanh of its bias, its threshold times -scale
// (the engine's bias scale), so its rest lies within the band the scale allows. A command lifts
// it to full and it returns to rest over its time constant (cell time constants run from
// TIME_CONSTANT.min_steps over TIME_CONSTANT.span times that). One handle on the rest line sets
// the threshold, one on the return the time constant. A pacemaker instead swings around its rest,
// less near full activity, with a period of its time constant, at least
// TIME_CONSTANT.pace_min_steps; the handle on its first crest sets the period. Below zero a
// muscle does nothing, a bladder empties and a gland binds; above it they work (`meaning` names
// the halves). The time axis spans SPANS of the longest time constant, or BEATS for a pacemaker.
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
  label : 11
});
const MIDDLE = DRIVE.top + DRIVE.plot / 2, HALF = DRIVE.plot / 2;
// A rhythm's first crest lies a quarter of its period after its start.
const CREST_QUARTERS = 4;
const axisSteps = rhythm => rhythm ? LONGEST_TIME_CONSTANT * DRIVE.beats
                                   : LONGEST_TIME_CONSTANT * DRIVE.spans / (1 - DRIVE.command[1]);
const period = tau => Math.max(TIME_CONSTANT.pace_min_steps, timeConstantSteps(tau));
const stepAt = (fx, rhythm) =>
    (fx * DRIVE.width - DRIVE.left) / (DRIVE.right - DRIVE.left) * axisSteps(rhythm);
const y = level => MIDDLE - HALF * level;
// A center's activity at rest, as the engine's bias makes it.
export const restLevel = (center, scale) => Math.tanh(-scale * center.threshold);
// A pointer at (fx, fy), fractions of the element, as a change of the center.
export function drivePatch(handle, fx, fy, scale) {
  if (handle === 'rest') {
    const most = Math.tanh(scale);
    const level = Math.max(-most, Math.min(most, (MIDDLE - fy * DRIVE.height) / HALF));
    return {threshold : clamp(-Math.atanh(level) / scale, -1)};
  }
  // The first crest lies a quarter period after the start.
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
  // Where an effector does nothing, and what its halves mean.
  const idle = meaning?.idle ? `<rect class="aid-drive-idle" x="${D.left}" y="${MIDDLE}" width="${
                                   D.right - D.left}" height="${HALF}"/>`
                             : '';
  const names =
      meaning ? `<text x="${D.left + 4}" y="${D.top + D.label}">${meaning.above}</text>` +
                    `<text x="${D.left + 4}" y="${D.top + D.plot - 3}">${meaning.below}</text>`
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
