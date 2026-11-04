import {TIME_CONSTANT} from '../../schema.js';
import {planOfUnit, unitOfPlan} from '../model/retina.js';

// How an effector or nerve center idles and recovers: its activity at rest (from its threshold),
// a command lifting it to full, and the return to rest over its time constant (cell time
// constants run from TIME_CONSTANT.min_steps over TIME_CONSTANT.span times that). One handle on
// the rest line sets the rest activity, one on the return the time constant. A pacemaker instead
// swings around its rest activity with a period of its time constant, at least
// TIME_CONSTANT.pace_min_steps; the handle on its first crest sets the period.
const DRIVE = Object.freeze({
  width : 360,
  height : 104,
  left : 12,
  right : 348,
  top : 10,
  plot : 66,
  handle : 7,
  command : [ .08, .22 ],
  swing : .3,
  samples : 90,
  spans : 3,
  tick : 4
});
const BASE = DRIVE.top + DRIVE.plot;
const n = value => Number(value.toFixed(1));
const safe = value => String(value).replace(/[^a-zA-Z0-9_-]/g, '');
const longest = () => TIME_CONSTANT.min_steps * TIME_CONSTANT.span;
// The time axis spans SPANS of the longest time constant after the command.
const axisSteps = () => longest() * DRIVE.spans / (1 - DRIVE.command[1]);
const steps = tau => TIME_CONSTANT.min_steps * TIME_CONSTANT.span ** Math.max(0, Math.min(1, tau));
const period = tau => Math.max(TIME_CONSTANT.pace_min_steps, steps(tau));
const tauOf = count => Math.max(
    0, Math.min(1, Math.log(count / TIME_CONSTANT.min_steps) / Math.log(TIME_CONSTANT.span)));
// The step at a fraction of the element's width.
const stepAt = fx => (fx * DRIVE.width - DRIVE.left) / (DRIVE.right - DRIVE.left) * axisSteps();
const x = step => DRIVE.left + (DRIVE.right - DRIVE.left) * step / axisSteps();
const y = level => BASE - DRIVE.plot * level;
// Rest activity in [0, 1] from a center's threshold (higher thresholds rest lower).
export const restLevel = center => 1 - unitOfPlan(center.threshold);
// A pointer at (fx, fy), fractions of the element, as a change of the center.
export function drivePatch(handle, fx, fy) {
  if (handle === 'rest')
    return {
      threshold : planOfUnit(1 - Math.max(0, Math.min(1, (BASE - fy * DRIVE.height) / DRIVE.plot)))
    };
  // The first crest lies a quarter period after the start.
  if (handle === 'beat')
    return {tau : tauOf(Math.max(TIME_CONSTANT.min_steps, 4 * stepAt(fx)))};
  return {
    tau : tauOf(Math.max(TIME_CONSTANT.min_steps, stepAt(fx) - DRIVE.command[1] * axisSteps()))
  };
}
export function driveElement(center, label, stepsLabel, rhythm = false) {
  const D = DRIVE, rest = restLevel(center), total = axisSteps();
  const tc = rhythm ? period(center.tau) : steps(center.tau);
  const [from, to] = D.command.map(f => f * total);
  const level =
      rhythm ? step => Math.max(0, Math.min(1, rest + D.swing * Math.sin(2 * Math.PI * step / tc)))
             : step => step < from  ? rest
                       : step <= to ? 1
                                    : rest + (1 - rest) * Math.exp(-(step - to) / tc);
  const points = Array.from({length : D.samples + 1}, (_, k) => {
    const step = total * k / D.samples;
    return n(x(step)) + ' ' + n(y(level(step)));
  });
  const knee = rhythm ? tc / 4 : to + tc;
  const command = rhythm ? ''
                         : `<rect class="aid-drive-command" x="${n(x(from))}" y="${D.top}" width="${
                               n(x(to) - x(from))}" height="${D.plot}"/>`;
  return `<svg class="aid-sensitivity aid-drive" viewBox="0 0 ${D.width} ${D.height}" data-drive="${
      safe(center.id)}" role="img" aria-label="${label}">${
      command}<line class="aid-sensitivity-axis" x1="${D.left}" y1="${BASE}" x2="${D.right}" y2="${
      BASE}"/><line class="aid-sensitivity-half" x1="${D.left}" y1="${n(y(rest))}" x2="${
      D.right}" y2="${n(y(rest))}"/><path class="aid-sensitivity-curve" d="M${
      points.join(' L')}"/><circle class="aid-spectrum-handle" data-drive-handle="rest" cx="${
      n(x(from / 2))}" cy="${n(y(rest))}" r="${
      D.handle}"/><circle class="aid-spectrum-handle" data-drive-handle="${
      rhythm ? 'beat' : 'tau'}" cx="${n(x(knee))}" cy="${n(y(level(knee)))}" r="${
      D.handle}"/><text x="${D.right}" y="${D.height - D.tick}" text-anchor="end">${
      stepsLabel(Math.round(tc))}</text></svg>`;
}
