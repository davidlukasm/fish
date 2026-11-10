import {HORMONE_EFFECT, HORMONES, TIME_CONSTANT} from '../../schema.js';
import {learningTimeSteps, timeConstantSteps} from '../../tuning.js';
import {receptorResponse, wiredCrossing} from '../model/document.js';
import {escapeText, fixed} from './markup.js';
import {clamp} from '../../units.js';
import {formatNumber} from '../../strings.js';
import {substanceMark, substanceName} from './substances.js';
import {label, numberField} from './kit.js';
import {substanceColor} from '../../hormones.js';

export const DEFAULT_PREVIEW_CONTEXT =
    Object.freeze({maturity : 0, hormones : Object.freeze(Array(HORMONES.levels).fill(0))});
export const previewContextOf = state => state.previewContext ?? DEFAULT_PREVIEW_CONTEXT;
export const DEFAULT_PREVIEW_INPUT = 1;
export const previewInputOf = state => state.previewInput ?? DEFAULT_PREVIEW_INPUT;
const word = key => label('development.' + key);
const PREVIEW_DIGITS = 2;
const input = (name, value, min, max, step, attributes) =>
    numberField(name, value, {min, max, step, attributes});
// The example situation as bars to drag: body maturity, each substance and the example input.
const PREVIEW_BARS = Object.freeze(
    {width : 300, height : 96, top : 12, bottom : 70, gauge : 12, knob : 7, mark : 88});
export const PREVIEW_INPUT_LOW = -1;
function previewColumns(state) {
  const context = previewContextOf(state);
  return [
    {key : 'maturity', value : context.maturity, low : 0, index : HORMONES.levels},
    ...context.hormones.map((value, index) => ({key : String(index), value, low : 0, index})),
    {key : 'input', value : previewInputOf(state), low : PREVIEW_INPUT_LOW, index : null}
  ];
}
export function previewPatch(state, key, fy) {
  const B = PREVIEW_BARS, column = previewColumns(state).find(c => c.key === key);
  const share = clamp((B.bottom - fy * B.height) / (B.bottom - B.top));
  return column ? column.low + (1 - column.low) * share : null;
}
export function previewControls(state) {
  const B = PREVIEW_BARS, columns = previewColumns(state), step = B.width / columns.length;
  const y = (value, low) => B.bottom - (B.bottom - B.top) * (value - low) / (1 - low);
  const bars = columns.map((c, k) => {
    const x = step * (k + .5), base = y(Math.max(c.low, 0), c.low), at = y(c.value, c.low);
    const colour = c.index === null ? 'var(--aid-size)' : substanceColor(c.index);
    const name = c.index === null ? word('exampleInput') : substanceName(state, c.index);
    return '<rect class="aid-dose-gauge" x="' + fixed(x - B.gauge / 2) + '" y="' + B.top +
           '" width="' + B.gauge + '" height="' + (B.bottom - B.top) + '" rx="' + B.gauge / 2 +
           '"/><rect class="aid-preview-level" x="' + fixed(x - B.gauge / 2) + '" y="' +
           fixed(Math.min(base, at)) + '" width="' + B.gauge + '" height="' +
           fixed(Math.abs(base - at)) + '" fill="' + colour + '"/>' +
           (c.low < 0 ? '<path class="aid-dose-zero" d="M' + fixed(x - B.gauge / 2) + ' ' +
                            fixed(base) + ' h' + B.gauge + '"/>'
                      : '') +
           '<circle class="aid-graphic-handle" data-preview-handle="' + c.key + '" cx="' +
           fixed(x) + '" cy="' + fixed(at) + '" r="' + B.knob + '"><title>' + escapeText(name) +
           ': ' + formatNumber(c.value, PREVIEW_DIGITS) + '</title></circle><text x="' + fixed(x) +
           '" y="' + B.mark + '" text-anchor="middle">' +
           escapeText(c.index === null ? label('development.inputMark')
                                       : substanceMark(state, c.index)) +
           '</text>';
  });
  return '<details class="aid-preview-context"><summary title="' +
         escapeText(word('previewConditions')) + '">' + word('preview') +
         '</summary><svg class="aid-preview-bars" viewBox="0 0 ' + B.width + ' ' + B.height +
         '" data-preview-bars role="img" aria-label="' + escapeText(word('preview')) + '">' +
         bars.join('') + '</svg></details>';
}
function lifecycleGraphic(state, center) {
  if (!state.capabilities)
    return '';
  const context = previewContextOf(state), width = 300, height = 105, left = 18, right = 285,
        top = 10, bottom = 78;
  const x = maturity => left + (right - left) * maturity,
        y = value => bottom - (bottom - top) * value;
  const response = (receptor, maturity, baseline) =>
      receptorResponse(state.capabilities, receptor, context.hormones, maturity, baseline);
  const curves = [
    [ 'birth', m => Math.max(0, response(center.growth, m, 1)) ],
    [ 'output', m => (1 + response(center.receptors[HORMONE_EFFECT.output], m, 1)) / 2 ],
    [ 'death', m => response(center.receptors[HORMONE_EFFECT.death], m, 0) > .5 ? 1 : 0 ]
  ];
  return '<svg class="aid-lifecycle" viewBox="0 0 ' + width + ' ' + height +
         '" role="img" aria-label="' + word('lifecycle') + '"><title>' +
         escapeText(word('explanation')) + '</title>' +
         curves
             .map(([ key, value ]) => '<path class="aid-life-' + key + '" d="' +
                                      Array
                                          .from({length : 97},
                                                (_, i) => {
                                                  const m = i / 96;
                                                  return (i ? ' L' : 'M') + fixed(x(m)) + ' ' +
                                                         fixed(y(value(m)));
                                                })
                                          .join('') +
                                      '"/>')
             .join('') +
         '<line class="aid-life-current" x1="' + fixed(x(context.maturity)) + '" x2="' +
         fixed(x(context.maturity)) + '" y1="' + top + '" y2="' + bottom + '"/>' +
         '<text x="' + left + '" y="98">0</text><text x="' + right +
         '" y="98" text-anchor="end">1 · ' + word('maturity') + '</text></svg>' +
         '<div class="aid-life-legend">' +
         curves.map(([ key ]) => '<span class="aid-life-' + key + '">' + word(key) + '</span>')
             .join('') +
         '</div>';
}
export function cellDevelopment(state, center) {
  if (!center)
    return '';
  const id = escapeText(center.id), growth = center.growth;
  const halfMin = state.capabilities?.halfRange[0] ?? .0003,
        halfMax = state.capabilities?.halfRange[1] ?? 1,
        sensitivitySpan = state.capabilities?.sensitivitySpan ?? 2,
        steepnessSteps = state.capabilities?.steepnessSteps ?? 3;
  const receptor = (key, min, max, step) =>
      input(word(key), growth[key], min, max, step,
            'data-cell-growth="' + id + '" data-growth-key="' + key + '"');
  const property = (key, value, min, max, step, disabled = false, title = key) => input(
      word(title), value, min, max, step,
      'data-cell-trait="' + id + '" data-trait-key="' + key + '"' + (disabled ? ' disabled' : ''));
  const options = Array
                      .from({length : HORMONES.levels + 1},
                            (_, index) => '<option value="' + index + '"' +
                                          (index === growth.substance ? ' selected' : '') + '>' +
                                          escapeText(substanceName(state, index)) + '</option>')
                      .join('');
  const birth = '<label class="aid-checkbox"><input type="checkbox" data-cell-growth-active="' +
                id + '"' + (growth.active ? ' checked' : '') + '>' + word('receptorActive') +
                '</label><div class="aid-parameter-grid">' + receptor('baseline', -1, 1, .05) +
                '<label>' + word('substance') + '<select data-cell-growth="' + id +
                '" data-growth-key="substance">' + options + '</select></label>' +
                receptor('sensitivity', -sensitivitySpan, sensitivitySpan, .05) +
                receptor('half', halfMin, halfMax, .001) + receptor('width', 0, 1, .01) +
                receptor('steepness', 0, steepnessSteps, 1) +
                receptor('spread_receptors', 0, 1, .01) + '</div>';
  let parameters =
      property('tau', Math.round(timeConstantSteps(center.tau) * 100) / 100,
               TIME_CONSTANT.min_steps, TIME_CONSTANT.min_steps * TIME_CONSTANT.span, .1);
  if (center.role === 'nerve')
    parameters +=
        property('field',
                 Math.round(state.capabilities.neural.slotMin *
                            Math.pow(state.capabilities.neural.slotSpan, center.field)),
                 state.capabilities.neural.slotMin,
                 state.capabilities.neural.slotMin * state.capabilities.neural.slotSpan, 1);
  if (center.role !== 'motor' && state.capabilities) {
    const crossing = wiredCrossing(state.document, center, state.sites);
    parameters +=
        property('range',
                 state.capabilities.reachLeast + (1 - state.capabilities.reachLeast) * center.range,
                 state.capabilities.reachLeast, 1, .01) +
        property('crossing', crossing ?? center.crossing, -1, 1, .01, crossing !== null);
  }
  if (center.role !== 'sensor')
    parameters += property('threshold', center.threshold, -1, 1, .01) +
                  property('electrical_limit', center.electrical_limit, 0, 1, .01);
  if (center.role === 'nerve') {
    parameters +=
        property('learning_tau', Math.round(learningTimeSteps(center.learning_tau) * 100) / 100,
                 TIME_CONSTANT.learning_min_steps,
                 TIME_CONSTANT.learning_min_steps * TIME_CONSTANT.learning_span, .1) +
        property('teaching_limit', center.teaching_limit, 0, 1, .01) +
        property('q1', Math.max(0, center.q1), 0, 1, .01, false, 'rectification') +
        property('q2', Math.max(0, center.q2), 0, 1, .01, false, 'response') +
        property('qwidth', center.qwidth, 0, 1, .01) + property('mode', center.mode, -1, 1, .01) +
        property('sign', center.sign, -1, 1, .01) + property('pace', center.pace, -1, 1, .05) +
        property('modulator', center.modulator, -1, 1, .05);
  }
  const variation =
      [ 'spread_physiology', 'spread_receptors', 'spread_development', 'spread_contacts' ]
          .map(key =>
                   input(word(key), center.distribution[key], 0, 1, .01,
                         'data-cell-distribution="' + id + '" data-distribution-key="' + key + '"'))
          .join('');
  return '<section class="aid-cell-development"><h4>' + word('title') + '</h4>' +
         lifecycleGraphic(state, center) + '<details><summary title="' +
         escapeText(word('birthDefault')) + '">' + word('birthReceptor') + '</summary>' + birth +
         '</details>' +
         '<details><summary>' + word('parameters') + '</summary><div class="aid-parameter-grid">' +
         parameters + '</div></details>' +
         '<details><summary>' + word('variation') + '</summary><div class="aid-parameter-grid">' +
         variation + '</div></details></section>';
}
