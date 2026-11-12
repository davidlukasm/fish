import {TIME_CONSTANT} from '../../schema.js';
import {t} from '../../strings.js';
import {clamp} from '../../units.js';
import {LONGEST_TIME_CONSTANT, timeConstantOf, timeConstantSteps} from '../../tuning.js';
import {escapeText, fixed} from './markup.js';
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
  knob : 8,
  beats : 3,
  crest : 1.25,
  tail : .25
});
const FILTER_EPSILON = .001;
const signOf = center => center.sign < 0 ? -1 : 1;
const filtered = center => Math.abs(clamp(center.q2) - .5) > FILTER_EPSILON;
const responseX = (step, total) => RESPONSE.left + (RESPONSE.right - RESPONSE.left) * step / total;
const responseY = value => RESPONSE.zero - RESPONSE.scale * value;
const responsePoint = (step, value, total) =>
    fixed(responseX(step, total)) + ' ' + fixed(responseY(value));
const spanOf = context => context.adaptationSpan ?? 10;
const totalOf = context =>
    (context.pace > 0 ? RESPONSE.beats : RESPONSE.span * spanOf(context)) * LONGEST_TIME_CONSTANT;
const periodOf = center => Math.max(TIME_CONSTANT.pace_min_steps, timeConstantSteps(center.tau));
const rhythmOf = context => (context.pace ?? 0) * .5 * (1 + (context.rhythmEffect ?? 0));
const excitationAt = (center, context, step, on) =>
    context.excitation + rhythmOf(context) * Math.sin(2 * Math.PI * (step - on) / periodOf(center));

function probeOf(center, context) {
  const total = totalOf(context), on = Math.ceil(RESPONSE.on * total);
  const adaptation = spanOf(context) * timeConstantSteps(center.tau);
  const step = context.pace > 0   ? on + RESPONSE.crest * periodOf(center)
               : filtered(center) ? on + adaptation
                                  : (RESPONSE.on + RESPONSE.off) * total / 2;
  const samples = Math.floor(step) - on + 1;
  const off = Math.ceil(RESPONSE.off * total), held = Math.min(samples, off - on),
        mean = RESPONSE.input * (1 - (1 - 1 / adaptation) ** held) * (1 - 1 / adaptation) **
               Math.max(0, samples - held);
  return {step, mean, total, on, input : step < off ? RESPONSE.input : 0};
}
function tailProbe(center, context) {
  const total = totalOf(context), on = Math.ceil(RESPONSE.on * total),
        off = Math.ceil(RESPONSE.off * total),
        adaptation = spanOf(context) * timeConstantSteps(center.tau),
        step =
            Math.min(Math.floor(total * (1 - 3 * RESPONSE.knob / (RESPONSE.right - RESPONSE.left))),
                     off + Math.ceil(RESPONSE.tail * adaptation)),
        retention = 1 - 1 / adaptation,
        mean = RESPONSE.input * (1 - retention ** (off - on)) * retention ** (step - off + 1);
  return {total, step, mean};
}
export function responseHandle(center, context, handle = '') {
  if (handle === 'rectify')
    return {
      fx : (RESPONSE.right - RESPONSE.knob) / RESPONSE.width,
      fy : responseY(-signOf(center) * (1 - center.q1) * context.output) / RESPONSE.height
    };
  if (handle === 'filter') {
    const {step, mean, total} = tailProbe(center, context);
    return {
      fx : responseX(step, total) / RESPONSE.width,
      fy : responseY(signOf(center) * nerveResponse({...center, q1 : 0}, 0, mean, context)) /
               RESPONSE.height
    };
  }
  const {step, mean, total, on, input} = probeOf(center, context);
  return {
    fx : responseX(step, total) / RESPONSE.width,
    fy : responseY(
             signOf(center) *
             nerveResponse(center, input, mean,
                           {...context, excitation : excitationAt(center, context, step, on)})) /
             RESPONSE.height
  };
}

export function responsePatch(center, fx, fy, context, handle = '') {
  if (!(context.scale > 0) || !(context.output > 0))
    return null;
  const value =
      signOf(center) * (RESPONSE.zero - fy * RESPONSE.height) / RESPONSE.scale / context.output;
  if (handle === 'rectify')
    return {q1 : clamp(1 + value)};
  if (handle === 'filter') {
    const {mean} = tailProbe(center, context);
    return mean > 0 ? {
      q2 : clamp((1 + (Math.atanh(clamp(value, -.999999, .999999)) +
                       context.scale * center.threshold - context.excitation) /
                          mean) /
                 2)
    }
                    : null;
  }
  const total = totalOf(context), on = Math.ceil(RESPONSE.on * total);
  const step = (fx * RESPONSE.width - RESPONSE.left) / (RESPONSE.right - RESPONSE.left) * total;
  const tau =
      context.pace > 0
          ? timeConstantOf(Math.max(TIME_CONSTANT.pace_min_steps, (step - on) / RESPONSE.crest))
      : filtered(center)
          ? timeConstantOf(Math.max(TIME_CONSTANT.min_steps, (step - on) / spanOf(context)))
          : center.tau;
  const probe = probeOf({...center, tau}, context), {mean, input} = probe;
  const q = clamp(center.q2), level = Math.min(1, 2 * q), memory = Math.max(0, 2 * q - 1);
  const drive = (1 - memory) * input + (memory + level - 1) * mean;
  let target = value;
  if (target < 0) {
    if (center.q1 >= 1)
      target = 0;
    else
      target /= 1 - clamp(center.q1);
  }
  const threshold = clamp((excitationAt({...center, tau}, context, probe.step, on) + drive -
                           Math.atanh(clamp(target, -.999999, .999999))) /
                              context.scale,
                          -1);
  return {tau, threshold};
}

export function responseTrace(center, context) {
  const total = totalOf(context), on = Math.ceil(RESPONSE.on * total),
        off = Math.ceil(RESPONSE.off * total);
  const rate = 1 / (spanOf(context) * timeConstantSteps(center.tau));
  const rhythm = rhythmOf(context);
  let mean = 0;
  const points = [];
  for (let step = 0; step <= Math.ceil(total); ++step) {
    const input = step >= on && step < off ? RESPONSE.input : 0;
    mean += (input - mean) * rate;
    const answer = excitation =>
        signOf(center) * nerveResponse(center, input, mean, {...context, excitation});
    points.push({
      step,
      value : answer(excitationAt(center, context, step, on)),
      low : answer(context.excitation - rhythm),
      high : answer(context.excitation + rhythm)
    });
  }
  return {total, on, off, points, rhythm};
}

export function responseSvg(state, center) {
  const D = RESPONSE, context = driveContext(state, center);
  const {total, on, off, points, rhythm} = responseTrace(center, context);
  const stride =
      Math.max(1, Math.floor(Math.min(total / 240, rhythm ? periodOf(center) / 24 : Infinity)));
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
  const controls =
      [ 'filter', 'rectify' ]
          .map(kind => {
            const p = responseHandle(center, context, kind), x = p.fx * D.width,
                  y = p.fy * D.height;
            const title = label('regions.response.' + kind);
            const guide = kind === 'filter' ? 'M' + fixed(x) + ' ' + D.zero + 'V' + fixed(y)
                                            : 'M' + fixed(x - D.knob * 2) + ' ' + fixed(y) + 'H' +
                                                  fixed(x + D.knob);
            return '<path class="aid-response-control-guide" d="' + guide + '"/>' +
                   '<circle class="aid-graphic-handle aid-response-' + kind +
                   '" data-response-handle="' + kind + '" tabindex="0" role="button" aria-label="' +
                   escapeText(title) + '" cx="' + fixed(x) + '" cy="' + fixed(y) + '" r="' +
                   D.knob + '"><title>' + escapeText(title) + '</title></circle>';
          })
          .join('');
  const inputY = D.inputBase - D.inputScale * D.input;
  const word = (x, y, key, anchor = 'start') =>
      '<text class="aid-response-word" x="' + fixed(x) + '" y="' + y + '" text-anchor="' + anchor +
      '">' + escapeText(label('regions.response.' + key)) + '</text>';
  return '<svg class="aid-response" data-response="' + escapeText(center.id) + '" viewBox="0 0 ' +
         D.width + ' ' + D.height + '" role="group" aria-label="' +
         label('inspector.stimulusResponse') + '"><title>' + label('regions.response.reference') +
         '</title><rect class="aid-response-held" x="' + fixed(responseX(on, total)) + '" y="' +
         D.inputBase + '" width="' + fixed(responseX(off - on, total) - D.left) + '" height="' +
         (D.zero + D.scale - D.inputBase) + '"/>' + word(30, 12, 'input') +
         word(responseX((on + off) / 2, total), 20, 'held', 'middle') +
         word(responseX(off, total) + 6, 37, 'ended') + word(35, 80, 'nextCell') +
         '<path class="aid-response-input" d="M' + D.left + ' ' + D.inputBase + 'H' +
         fixed(responseX(on, total)) + 'V' + inputY + 'H' + fixed(responseX(off, total)) + 'V' +
         D.inputBase + 'H' + D.right + '"/><path class="aid-response-time" d="M' +
         fixed(responseX(on, total)) + ' ' + D.inputBase + 'V' + (D.zero + D.scale) + 'M' +
         fixed(responseX(off, total)) + ' ' + D.inputBase + 'V' + (D.zero + D.scale) +
         '"/><path class="aid-sensitivity-axis" d="M' + D.left + ' ' + D.zero + 'H' + D.right +
         '"/>' + band + '<path class="aid-sensitivity-curve" d="M' + drawn.map(point).join(' L') +
         '"/><circle class="aid-graphic-handle" data-response-handle="" tabindex="0" role="button"' +
         ' aria-label="' + label('regions.response.drag') + '" cx="' + fixed(handle.fx * D.width) +
         '" cy="' + fixed(handle.fy * D.height) + '" r="' + D.knob +
         '" style="cursor:' + (filtered(center) || context.pace > 0 ? 'move' : 'ns-resize') +
         '"><title>' + label('regions.response.drag') + '</title></circle>' + controls +
         '<g class="aid-response-symbol"><title>' + label('regions.response.input') +
         '</title><path d="M8 9h14M17 5l5 4-5 4"/></g>' +
         '<g class="aid-response-polarity" data-response-cell="' + escapeText(center.id) +
         '" data-response-property="sign" data-response-value="' + -signOf(center) +
         '" tabindex="0" role="button" aria-label="' +
         label(center.sign < 0 ? 'inspector.inhibiting' : 'inspector.exciting') +
         '" transform="translate(16 76)"><title>' +
         label(center.sign < 0 ? 'inspector.inhibiting' : 'inspector.exciting') +
         '</title><circle r="12"/><path d="' +
         (center.sign < 0 ? 'M-6 0H6M6-6V6' : 'M-6 0H6M1-5L6 0L1 5') + '"/></g>' +
         '<text class="aid-response-word" x="' + D.right + '" y="214" text-anchor="end">' +
         escapeText(t('studio.regions.graphics.steps', {n : Math.round(total)})) + '</text></svg>';
}
