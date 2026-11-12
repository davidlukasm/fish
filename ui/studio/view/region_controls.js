import {TIME_CONSTANT} from '../../schema.js';
import {clamp} from '../../units.js';
import {
  learningTimeOf,
  learningTimeSteps,
  LONGEST_LEARNING_TIME,
  LONGEST_TIME_CONSTANT,
  timeConstantOf,
  timeConstantSteps
} from '../../tuning.js';
import {formatNumber, joinParts, t} from '../../strings.js';
import {RHYTHM_TAU} from '../model/region_cells.js';
import {regionPlan} from '../model/regions.js';
import {escapeText, fixed} from './markup.js';
import {label} from './kit.js';
import {tectumPictures} from './tectum_map.js';

export const REGION_PICTURE = Object.freeze({width : 360, height : 260, left : 40, right : 320});
const P = REGION_PICTURE, WIDTH = P.right - P.left, SEARCH_BASE = 194, SEARCH_HEIGHT = 100;
const SCENT_BASE = 202, SCENT_HEIGHT = 114, VALUE_BASE = 218, VALUE_HEIGHT = 94;
const SPINE_BASE = 76, SPINE_HEIGHT = 55, FIN_BASE = 218;
const CLOCK_SPAN = 2 * LONGEST_TIME_CONSTANT, CLOCK_CREST = 1.25;
const OPPONENT = Object.freeze({left : 120, width : 100, y : 127});
const TAU_SPAN = 4;
const period = tau => Math.max(TIME_CONSTANT.pace_min_steps, timeConstantSteps(tau));
const x = fraction => P.left + WIDTH * fraction;
const point = (x, y) => ({fx : x / P.width, fy : y / P.height});
const words = (key, vars) => t('studio.regions.graphics.' + key, vars);
const steps = n => t('studio.regions.graphics.steps', {n : Math.round(n)});
const cycleSteps = n => t('studio.regions.graphics.clockPeriod', {n : Math.round(n)});
const path = (d, cls = '') => `<path class="region-line ${cls}" d="${d}"/>`;
const curve = (sample, start = P.left, end = P.right, count = 160, cls = '') => path(
    Array
        .from({length : count + 1},
              (_, i) => {
                const p = sample(i / count);
                return `${i ? 'L' : 'M'}${fixed(start + (end - start) * i / count)} ${fixed(p)}`;
              })
        .join(' '),
    cls);
const text = (x, y, value, anchor = 'start') =>
    `<text x="${fixed(x)}" y="${fixed(y)}" text-anchor="${anchor}">${escapeText(value)}</text>`;
const axis = (left, right, y) => path(`M${left} ${y}H${right}`, 'axis');
const adaptationSpan = state => state.capabilities?.neural?.adaptationSpan ?? 10;
const timing = (state, tau) => steps(timeConstantSteps(tau) * adaptationSpan(state));
const timedAxis = (state, y, span = 1, left = P.left, right = P.right) =>
    axis(left, right, y) + text(left, y + 18, '0') +
    text(right, y + 18, steps(span * LONGEST_TIME_CONSTANT * adaptationSpan(state)), 'end');
const colourText = (cls, x, y, value, anchor = 'start') =>
    `<g class="region-caption ${cls}">${text(x, y, value, anchor)}</g>`;
const scentValue = smoothing => Math.tanh(smoothing > 0 ? 1 - Math.exp(-1) : 1);

export function regionHandle(organ, key) {
  const r = organ.region;
  if (key === 'spine')
    return point(x(CLOCK_CREST * period(r.cycle) / CLOCK_SPAN),
                 SPINE_BASE - SPINE_HEIGHT * Math.tanh(.5));
  if (key === 'finCycle')
    return point(x(CLOCK_CREST * period(r.finCycle) / CLOCK_SPAN),
                 FIN_BASE - SPINE_HEIGHT * Math.tanh(.5));
  if (key === 'alternation')
    return point(OPPONENT.left + OPPONENT.width * r.alternation, OPPONENT.y);
  if (key === 'search')
    return point(x(timeConstantSteps(r.searchTime) / LONGEST_TIME_CONSTANT),
                 SEARCH_BASE - SEARCH_HEIGHT * r.searchDrive);
  if (key === 'scent')
    return point(x(r.smoothing > 0
                       ? timeConstantSteps(r.smoothing) / (TAU_SPAN * LONGEST_TIME_CONSTANT)
                       : 0),
                 SCENT_BASE - SCENT_HEIGHT * r.contrast * scentValue(r.smoothing));
  if (key === 'association')
    return point(x(learningTimeSteps(r.association) / LONGEST_LEARNING_TIME),
                 VALUE_BASE - VALUE_HEIGHT * r.teaching / Math.E);
  if (key === 'maturity')
    return point(x(r.maturity), 65);
  if (key === 'reserve')
    return point(40 + 120 * r.reserve, 222);
  if (key === 'rest')
    return point(210 + 110 * timeConstantSteps(r.rest) / LONGEST_TIME_CONSTANT, 222 - 64 / Math.E);
  if (key === 'beat' || key === 'pump')
    return point(
        x(r[key] ? 1.25 * period(RHYTHM_TAU[r[key] - 1]) / (2 * LONGEST_TIME_CONSTANT) : 0),
        (key === 'pump' ? 112 : 220) - (r[key] ? 24 * Math.tanh(.65) : 0));
  return null;
}

export function regionPatch(organ, key, fx, fy) {
  const px = fx * P.width, py = fy * P.height, f = clamp((px - P.left) / WIDTH);
  if (key === 'spine')
    return {
      cycle : timeConstantOf(Math.max(TIME_CONSTANT.pace_min_steps, f * CLOCK_SPAN / CLOCK_CREST))
    };
  if (key === 'finCycle')
    return {
      finCycle :
          timeConstantOf(Math.max(TIME_CONSTANT.pace_min_steps, f * CLOCK_SPAN / CLOCK_CREST))
    };
  if (key === 'alternation')
    return {alternation : clamp((px - OPPONENT.left) / OPPONENT.width)};
  if (key === 'search')
    return {
      searchTime : timeConstantOf(Math.max(TIME_CONSTANT.min_steps, f * LONGEST_TIME_CONSTANT)),
      searchDrive : clamp((SEARCH_BASE - py) / SEARCH_HEIGHT)
    };
  if (key === 'scent') {
    const smoothing = f * TAU_SPAN * LONGEST_TIME_CONSTANT < TIME_CONSTANT.min_steps
                          ? 0
                          : Math.max(.01, timeConstantOf(f * TAU_SPAN * LONGEST_TIME_CONSTANT));
    return {
      smoothing,
      contrast : clamp((SCENT_BASE - py) / (SCENT_HEIGHT * scentValue(smoothing)))
    };
  }
  if (key === 'association')
    return {
      association :
          learningTimeOf(Math.max(TIME_CONSTANT.learning_min_steps, f * LONGEST_LEARNING_TIME)),
      teaching : clamp((VALUE_BASE - py) * Math.E / VALUE_HEIGHT)
    };
  if (key === 'maturity')
    return {maturity : Math.max(.01, f)};
  if (key === 'reserve')
    return {reserve : clamp((px - 40) / 120)};
  if (key === 'rest')
    return {
      rest : timeConstantOf(
          Math.max(TIME_CONSTANT.min_steps, (px - 210) / 110 * LONGEST_TIME_CONSTANT))
    };
  if (key === 'beat' || key === 'pump') {
    const candidates =
        [ 0, ...RHYTHM_TAU.map(tau => 1.25 * period(tau) / (2 * LONGEST_TIME_CONSTANT)) ];
    const level = candidates.reduce(
        (best, p, i) => Math.abs(p - f) < Math.abs(candidates[best] - f) ? i : best, 0);
    return {[key] : level};
  }
  return null;
}
function handle(organ, key, title) {
  const p = regionHandle(organ, key);
  return `<g class="region-handle" data-region-handle="${
      key}" tabindex="0" role="button" aria-label="${escapeText(title)}" transform="translate(${
      fixed(p.fx * P.width)} ${fixed(p.fy * P.height)})"><title>${
      escapeText(
          title)}</title><circle class="hit" r="15"/><circle r="8"/><path d="M-3 0h6M0-3v6"/></g>`;
}
function button(organ, key, value, x, y, graphic, title, selected = organ.region[key] === value) {
  return `<g class="region-button${selected ? ' selected' : ''}" data-region-setting="${
      key}" data-region-value="${value}" data-organ-id="${
      escapeText(organ.id)}" tabindex="0" role="button" aria-pressed="${selected}" aria-label="${
      escapeText(title)}" transform="translate(${x} ${y})"><title>${
      escapeText(
          title)}</title><rect x="-17" y="-17" width="34" height="34" rx="9"/>${graphic}</g>`;
}
function searchPicture(state, organ) {
  const r = organ.region, duration = LONGEST_TIME_CONSTANT;
  const memory = f => Math.exp(-f * duration / timeConstantSteps(r.searchTime));
  const drive = SEARCH_BASE - SEARCH_HEIGHT * r.searchDrive;
  return text(P.left, 20, words('searchAfter')) +
         colourText('other', P.left, 49, words('cueTrace')) +
         colourText('', P.right, 49,
                    words('searchLevel', {n : formatNumber(100 * r.searchDrive, 0)}), 'end') +
         timedAxis(state, SEARCH_BASE) + path(`M${P.left} ${drive}H${P.right}`, 'level') +
         curve(f => SEARCH_BASE - SEARCH_HEIGHT * memory(f), undefined, undefined, 160, 'other') +
         text(P.left, 242, words('memoryTime', {time : timing(state, r.searchTime)})) +
         handle(organ, 'search', joinParts([
                  words('search'), words('searchMemory'), words('searchStrength'),
                  timing(state, r.searchTime), words('searchDrag')
                ]));
}
function scentPicture(state, organ) {
  const r = organ.region, duration = TAU_SPAN * LONGEST_TIME_CONSTANT;
  const response = f =>
      Math.tanh(r.smoothing > 0 ? 1 - Math.exp(-f * duration / timeConstantSteps(r.smoothing)) : 1);
  return text(P.left, 20, words('scent')) + text(P.left, 40, words('sameScent')) +
         colourText('', P.left, 65, words('ownNose')) +
         colourText('other', P.right, 65, words('oppositeNose'), 'end') +
         timedAxis(state, SCENT_BASE, TAU_SPAN) +
         curve(f => SCENT_BASE - SCENT_HEIGHT * response(f)) +
         curve(f => SCENT_BASE - SCENT_HEIGHT * r.contrast * response(f), undefined, undefined, 160,
               'other') +
         text(P.left, 244,
              words('smoothingTime',
                    {time : r.smoothing > 0 ? timing(state, r.smoothing) : words('direct')})) +
         handle(organ, 'scent', joinParts([
                  words('scent'), r.smoothing > 0 ? timing(state, r.smoothing) : words('direct'),
                  words('scentDrag')
                ]));
}
function statePicture(state, organ) {
  const r = organ.region, scale = state.capabilities?.biasScale ?? .3;
  const hill = f => f ** 8 / (f ** 8 + r.maturity ** 8);
  return text(P.left, 18, words('maturityOutput')) + axis(P.left, P.right, 100) +
         text(P.left, 118, '0 %') + text(P.right, 118, '100 %', 'end') +
         curve(f => 100 - 70 * hill(f)) +
         handle(organ, 'maturity', joinParts([ words('maturity'), words('maturityDrag') ])) +
         colourText('other', 40, 147, words('reserveInput')) + axis(40, 160, 222) +
         text(40, 240, '0') + text(160, 240, '1', 'end') +
         curve(f => 222 - 180 * Math.max(0, Math.tanh(scale * (r.reserve - f))), 40, 160, 80,
               'other') +
         handle(organ, 'reserve', joinParts([ words('reserve'), words('reserveDrag') ])) +
         colourText('memory', 210, 147, words('foodTrace')) + timedAxis(state, 222, 1, 210, 320) +
         curve(f => 222 - 64 * Math.exp(-f * LONGEST_TIME_CONSTANT / timeConstantSteps(r.rest)),
               210, 320, 80, 'memory') +
         handle(organ, 'rest',
                joinParts([ words('rest'), timing(state, r.rest), words('restDrag') ]));
}
function valuePicture(organ) {
  const r = organ.region;
  const branches = Array
                       .from({length : 4},
                             (_, i) => {
                               const px = 65 + 76 * i;
                               return button(organ, 'features', i + 1, px, 35,
                                             text(0, 4, formatNumber(i + 1), 'middle'),
                                             t('studio.regions.graphics.features', {n : i + 1}),
                                             i < r.features) +
                                      (i < r.features ? path(`M${px} 54V66L180 86`, 'axis') : '');
                             })
                       .join('');
  return text(P.left, 14, label('regions.settings.features')) + branches +
         text(P.left, 89,
              words('associationTime', {time : steps(learningTimeSteps(r.association))})) +
         colourText('memory', P.left, 110, words('associationTrace')) +
         axis(P.left, P.right, VALUE_BASE) + text(P.left, 236, '0') +
         text(P.right, 236, steps(LONGEST_LEARNING_TIME), 'end') +
         text(P.left, 255, words('teachingLevel', {n : formatNumber(100 * r.teaching, 0)})) +
         curve(f => VALUE_BASE -
                    VALUE_HEIGHT * r.teaching *
                        Math.exp(-f * LONGEST_LEARNING_TIME / learningTimeSteps(r.association)),
               undefined, undefined, 160, 'memory') +
         handle(organ, 'association',
                joinParts([ steps(learningTimeSteps(r.association)), words('associationDrag') ]));
}
function motorPicture(organ) {
  const r = organ.region;
  const tones = [ 0, 1, 2 ]
                    .map((v, i) => button(
                             organ, 'tone', v, 245 + i * 36, 31,
                             v ? Array
                                     .from({length : v}, (_, j) => `<path d="M-7 ${5 - 6 * j}L0 ${
                                                             - 2 - 6 * j}L7 ${5 - 6 * j}"/>`)
                                     .join('')
                               : '<circle r="5"/>',
                             t('studio.regions.graphics.tone', {n : v})))
                    .join('');
  const curves =
      [ 'pump', 'beat' ]
          .map(key => {
            const base = key === 'pump' ? 112 : 220, level = r[key];
            const cycle = level ? period(RHYTHM_TAU[level - 1]) : 0;
            return text(P.left, base - 30, label('regions.settings.' + key)) +
                   text(P.right, base - 30, cycle ? steps(cycle) : words('off'), 'end') +
                   axis(P.left, P.right, base) + text(P.left, base + 18, '0') +
                   text(P.right, base + 18, steps(CLOCK_SPAN), 'end') +
                   curve(f => base -
                              (cycle ? 24 * Math.tanh(.15 + .5 * Math.sin(2 * Math.PI * 2 *
                                                                          LONGEST_TIME_CONSTANT *
                                                                          f / cycle))
                                     : 0),
                         undefined, undefined, 240, key === 'pump' ? 'other' : '') +
                   handle(
                       organ, key, joinParts([
                         label('regions.settings.' + key), cycle ? cycleSteps(cycle) : words('off')
                       ]));
          })
          .join('');
  return tones + text(45, 59, words('competeShort'), 'middle') +
         text(110, 59, words('retreatShort'), 'middle') +
         text(281, 59, label('regions.settings.tone'), 'middle') +
         button(organ, 'compete', 1 - r.compete, 45, 31,
                `<path d="${r.compete ? 'M-10-8L10 8M10-8L-10 8' : 'M-10-8V8M10-8V8'}"/>`,
                label('regions.settings.compete'), !!r.compete) +
         button(organ, 'retreat', 1 - r.retreat, 110, 31, '<path d="M0-10V10M-7 3L0 10L7 3"/>',
                label('regions.settings.retreat'), !!r.retreat) +
         curves;
}
function spinePicture(organ) {
  const r = organ.region;
  const waves = (y, tau, name) =>
      axis(P.left, P.right, y) + '<g data-clock="' + name + '">' +
      [ 0, Math.PI ]
          .map((phase, i) =>
                   curve(f => y - SPINE_HEIGHT *
                                      Math.max(0, Math.tanh(.5 * Math.sin(2 * Math.PI * CLOCK_SPAN *
                                                                              f / period(tau) +
                                                                          phase))),
                         undefined, undefined, 240, i ? 'other' : ''))
          .join('') +
      '</g>';
  const stop = OPPONENT.left + OPPONENT.width * r.alternation;
  return text(P.left, 17, words('tailClock')) + waves(SPINE_BASE, r.cycle, 'tail') +
         text(P.left, 98, cycleSteps(period(r.cycle))) +
         handle(organ, 'spine', joinParts([ words('spine'), words('spineDrag') ])) +
         '<g class="region-opponent" stroke-width="' + fixed(1 + 6 * r.alternation) +
         '"><path d="M75 127H' + fixed(stop) + 'm0-8v16"/></g>' +
         text(P.left, 150, words('oppositeInhibition')) +
         handle(organ, 'alternation', words('oppositeInhibition')) +
         text(P.left, 173, words('finClock')) + waves(FIN_BASE, r.finCycle, 'fin') +
         text(P.left, 242, cycleSteps(period(r.finCycle))) +
         text(P.right, 242, steps(CLOCK_SPAN), 'end') +
         handle(organ, 'finCycle', joinParts([
                  words('finCycle'),
                  label('regions.slots.row') + ' / ' + label('regions.slots.recover'),
                  cycleSteps(period(r.finCycle)), words('finCycleDrag')
                ]));
}
const PICTURES = {
  choice : searchPicture,
  olfaction : scentPicture,
  state : statePicture,
  value : (s, o) => valuePicture(o),
  motor : (s, o) => motorPicture(o),
  spine : (s, o) => spinePicture(o)
};
export function regionPicture(state, organ) {
  const draw = PICTURES[organ.type];
  if (!draw && organ.type !== 'tectum')
    return '';
  const customized =
      !!organ.region.cut?.length || regionPlan(state.document, organ).nodes.some(n => {
        const c = organ.centers.find(c => c.node === n.node);
        return c && (Object.entries(n.set ?? {}).some(([ k, v ]) => c[k] !== v) ||
                     Object.entries(n.effects ?? {})
                         .some(([ e, values ]) => Object.entries(values).some(
                                   ([ k, v ]) => c.receptors[e][k] !== v)));
      });
  const drawing = organ.type === 'tectum'
                      ? tectumPictures(state, organ)
                      : `<svg viewBox="0 0 ${P.width} ${P.height}" data-region-picture="${
                            escapeText(organ.id)}" role="group" aria-label="${
                            label('regions.' + organ.type + '.term')}"><title>${
                            escapeText(words(organ.type + 'Reference') +
                                       (customized ? ' ' + words('customized')
                                                   : ''))}</title>${draw(state, organ)}</svg>`;
  const explanation =
      organ.type !== 'tectum'
          ? '<p class="aid-picture-note">' + escapeText(words(organ.type + 'Reference')) + '</p>'
          : '';
  return `<div class="aid-region-picture">${drawing}${explanation}${
      customized ? '<p class="aid-picture-note">' + escapeText(words('customized')) + '</p>'
                 : ''}</div>`;
}
