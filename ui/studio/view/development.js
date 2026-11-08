import {HORMONE_EFFECT, HORMONES, TIME_CONSTANT} from '../../schema.js';
import {learningTimeSteps, timeConstantSteps} from '../../tuning.js';
import {receptorResponse, wiredCrossing} from '../model/document.js';
import {escapeText, fixed} from './markup.js';
import {label} from './kit.js';
import {percent} from '../../strings.js';

export const DEFAULT_PREVIEW_CONTEXT =
    Object.freeze({maturity : 0, hormones : Object.freeze(Array(HORMONES.levels).fill(0))});
export const previewContextOf = state => state.previewContext ?? DEFAULT_PREVIEW_CONTEXT;
const word = key => label('development.' + key);
const substanceTitle = (state, index) =>
    index === HORMONES.levels ? word('maturity')
                              : state.document.substances.find(s => s.index === index)?.name ||
                                    word('hormone') + ' ' + (index + 1);
const input = (name, value, min, max, step, attributes) =>
    '<label>' + escapeText(name) + '<input type="number" min="' + min + '" max="' + max +
    '" step="' + step + '" value="' + value + '" ' + attributes + '></label>';
export function previewControls(state) {
  const context = previewContextOf(state);
  const control = (key, name, value, min, max, step) =>
      input(name, value, min, max, step, 'data-preview-context="' + key + '"');
  return '<details class="aid-preview-context"><summary>' + word('preview') +
         '</summary><p class="aid-hint">' + word('previewConditions') +
         '</p><div class="aid-parameter-grid">' +
         control('maturity', word('maturity'), context.maturity, 0, 1, .01) +
         context.hormones
             .map((level, index) =>
                      control(String(index), substanceTitle(state, index), level, 0, 1, .01))
             .join('') +
         input(word('exampleInput'), state.previewInput ?? 1, -1, 1, .01, 'data-preview-input') +
         '</div></details>';
}
export function lifecycleGraphic(state, center) {
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
         '" role="img" aria-label="' + word('lifecycle') + '">' +
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
  const property = (key, value, min, max, step, disabled = false) => input(
      word(key), value, min, max, step,
      'data-cell-trait="' + id + '" data-trait-key="' + key + '"' + (disabled ? ' disabled' : ''));
  const options = Array
                      .from({length : HORMONES.levels + 1},
                            (_, index) => '<option value="' + index + '"' +
                                          (index === growth.substance ? ' selected' : '') + '>' +
                                          escapeText(substanceTitle(state, index)) + '</option>')
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
         lifecycleGraphic(state, center) + '<p class="aid-hint">' + word('explanation') + '</p>' +
         '<details><summary>' + word('birthReceptor') + '</summary>' + birth +
         '<p class="aid-hint">' + word('birthDefault') + '</p></details>' +
         '<details><summary>' + word('parameters') + '</summary><div class="aid-parameter-grid">' +
         parameters + '</div></details>' +
         '<details><summary>' + word('variation') + '</summary><div class="aid-parameter-grid">' +
         variation + '</div></details></section>';
}
