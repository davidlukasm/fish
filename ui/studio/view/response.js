import {TIME_CONSTANT} from '../../schema.js';
import {clamp} from '../../units.js';
import {LONGEST_TIME_CONSTANT, timeConstantOf, timeConstantSteps} from '../../tuning.js';
import {tList} from '../../strings.js';
import {escapeText, fixed, glyph} from './markup.js';
import {label} from './kit.js';
import {nerveResponse} from './drive.js';
import {driveContext} from './preview.js';

export const RESPONSE = Object.freeze({
  width : 360,
  height : 220,
  left : 18,
  right : 342,
  inputBase : 47,
  inputScale : 25,
  zero : 141,
  scale : 55,
  on : .08,
  off : .65,
  input : .9,
  span : 3,
  knob : 8
});
const MODES = Object.freeze(
    [ 'M2 18h5l2-13 3 13h10', 'M2 18h5V6h11v12h4', 'M2 18h5c4 0 2-12 8-12 4 0 1 12 7 12' ]);
const FILTER_EPSILON = .001;
const signOf = center => center.sign < 0 ? -1 : 1;
const filtered = center => Math.abs(clamp(center.q2) - .5) > FILTER_EPSILON;
const responseX = (step, total) => RESPONSE.left + (RESPONSE.right - RESPONSE.left) * step / total;
const responseY = value => RESPONSE.zero - RESPONSE.scale * value;
const responsePoint = (step, value, total) =>
    fixed(responseX(step, total)) + ' ' + fixed(responseY(value));
const spanOf = context => context.adaptationSpan ?? 10;
const totalOf = context => RESPONSE.span * spanOf(context) * LONGEST_TIME_CONSTANT;

function probeOf(center, context) {
  const total = totalOf(context), on = Math.ceil(RESPONSE.on * total);
  const adaptation = spanOf(context) * timeConstantSteps(center.tau);
  const step = filtered(center) ? on + adaptation : (RESPONSE.on + RESPONSE.off) * total / 2;
  const samples = Math.floor(step) - on + 1;
  const mean = RESPONSE.input * (1 - (1 - 1 / adaptation) ** samples);
  return {step, mean, total};
}

export function responseHandle(center, context) {
  const {step, mean, total} = probeOf(center, context);
  return {
    fx : responseX(step, total) / RESPONSE.width,
    fy : responseY(signOf(center) * nerveResponse(center, RESPONSE.input, mean, context)) /
             RESPONSE.height
  };
}

export function responsePatch(center, fx, fy, context) {
  if (!(context.scale > 0) || !(context.output > 0))
    return null;
  const total = totalOf(context), on = Math.ceil(RESPONSE.on * total);
  const step = (fx * RESPONSE.width - RESPONSE.left) / (RESPONSE.right - RESPONSE.left) * total;
  const tau = filtered(center)
                  ? timeConstantOf(Math.max(TIME_CONSTANT.min_steps, (step - on) / spanOf(context)))
                  : center.tau;
  const {mean} = probeOf({...center, tau}, context);
  const q = clamp(center.q2), level = Math.min(1, 2 * q), memory = Math.max(0, 2 * q - 1);
  const drive = (1 - memory) * RESPONSE.input + (memory + level - 1) * mean;
  let target =
      signOf(center) * (RESPONSE.zero - fy * RESPONSE.height) / RESPONSE.scale / context.output;
  if (target < 0) {
    if (center.q1 >= 1)
      target = 0;
    else
      target /= 1 - clamp(center.q1);
  }
  const threshold = clamp(
      (context.excitation + drive - Math.atanh(clamp(target, -.999999, .999999))) / context.scale,
      -1);
  return {tau, threshold};
}

export function responseTrace(center, context) {
  const total = totalOf(context), on = Math.ceil(RESPONSE.on * total),
        off = Math.ceil(RESPONSE.off * total);
  const rate = 1 / (spanOf(context) * timeConstantSteps(center.tau));
  const rhythm = context.pace * .5 * (1 + context.rhythmEffect);
  let mean = 0;
  const points = [];
  for (let step = 0; step <= Math.ceil(total); ++step) {
    const input = step >= on && step < off ? RESPONSE.input : 0;
    mean += (input - mean) * rate;
    const answer = excitation =>
        signOf(center) * nerveResponse(center, input, mean, {...context, excitation});
    points.push({
      step,
      value : answer(context.excitation),
      low : answer(context.excitation - rhythm),
      high : answer(context.excitation + rhythm)
    });
  }
  return {total, on, off, points, rhythm};
}

export function responseChoices(center) {
  const names = tList('studio.regions.values.response');
  const button = (property, value, active, path, title) =>
      '<button data-response-cell="' + escapeText(center.id) + '" data-response-property="' +
      property + '" data-response-value="' + value + '" aria-pressed="' + active + '" title="' +
      escapeText(title) + '" aria-label="' + escapeText(title) + '">' + glyph(path, 24) +
      '</button>';
  return '<div class="aid-response-choices">' +
         MODES
             .map((path, i) =>
                      button('q2', i / 2, Math.abs(center.q2 - i / 2) < .001, path, names[i]))
             .join('') +
         '<span></span>' +
         button('q1', center.q1 >= .5 ? 0 : 1, center.q1 >= .5,
                center.q1 >= .5 ? 'M2 12h20M3 12l4-8 5 8h9' : 'M2 12h20M3 12l4-8 9 16 5-8',
                label('regions.response.positive')) +
         button('sign', -signOf(center), center.sign < 0,
                center.sign < 0 ? 'M3 12h16M19 5v14' : 'M3 12h16M13 5l7 7-7 7',
                label(center.sign < 0 ? 'inspector.inhibiting' : 'inspector.exciting')) +
         '</div>';
}

export function responseSvg(state, center) {
  const D = RESPONSE, context = driveContext(state, center);
  const {total, on, off, points, rhythm} = responseTrace(center, context);
  const stride = Math.max(1, Math.floor(total / 240));
  const drawn = points.filter(p => p.step % stride === 0 ||
                                   [ on - 1, on, off - 1, off, Math.ceil(total) ].includes(p.step));
  const point = p => responsePoint(p.step, p.value, total);
  const band =
      rhythm > .001
          ? '<path class="aid-response-band" d="M' +
                drawn.map(p => responsePoint(p.step, p.low, total)).join(' L') + ' L' +
                [...drawn ].reverse().map(p => responsePoint(p.step, p.high, total)).join(' L') +
                'Z"><title>' + label('regions.response.rhythm') + '</title></path>'
          : '';
  const handle = responseHandle(center, context);
  const inputY = D.inputBase - D.inputScale * D.input;
  return '<svg class="aid-response" data-response="' + escapeText(center.id) + '" viewBox="0 0 ' +
         D.width + ' ' + D.height + '" role="group" aria-label="' +
         label('inspector.stimulusResponse') + '"><title>' + label('regions.response.reference') +
         '</title><path class="aid-response-input" d="M' + D.left + ' ' + D.inputBase + 'H' +
         fixed(responseX(on, total)) + 'V' + inputY + 'H' + fixed(responseX(off, total)) + 'V' +
         D.inputBase + 'H' + D.right + '"/><path class="aid-response-time" d="M' +
         fixed(responseX(on, total)) + ' ' + D.inputBase + 'V' + (D.zero + D.scale) + 'M' +
         fixed(responseX(off, total)) + ' ' + D.inputBase + 'V' + (D.zero + D.scale) +
         '"/><path class="aid-sensitivity-axis" d="M' + D.left + ' ' + D.zero + 'H' + D.right +
         '"/>' + band + '<path class="aid-sensitivity-curve" d="M' + drawn.map(point).join(' L') +
         '"/><circle class="aid-graphic-handle" data-response-handle="" tabindex="0" role="button"' +
         ' aria-label="' + label('regions.response.drag') + '" cx="' + fixed(handle.fx * D.width) +
         '" cy="' + fixed(handle.fy * D.height) + '" r="' + D.knob +
         '" style="cursor:' + (filtered(center) ? 'move' : 'ns-resize') + '"><title>' +
         label('regions.response.drag') + '</title></circle>' +
         '<g class="aid-response-symbol"><title>' + label('regions.response.input') +
         '</title><path d="M8 9h14M17 5l5 4-5 4"/></g>' +
         '<g class="aid-response-symbol"><title>' + label('regions.response.output') +
         '</title><path d="M8 72h14M17 68l5 4-5 4"/></g>' +
         '<g class="aid-response-symbol" transform="translate(330 208)"><title>' +
         Math.round(total) + ' · ' + label('learnRule.steps') +
         '</title><circle r="7"/><path d="M0-4v4l3 2"/></g></svg>';
}
