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
import {t} from '../../strings.js';
import {STUDIO_ICON} from '../../organ_icons.js';
import {RHYTHM_TAU} from '../model/region_cells.js';
import {regionPlan} from '../model/regions.js';
import {escapeText, fixed} from './markup.js';
import {label} from './kit.js';

export const REGION_PICTURE = Object.freeze({width : 360, height : 260, left : 40, right : 320});
const P = REGION_PICTURE, WIDTH = P.right - P.left, SEARCH_BASE = 194, SEARCH_HEIGHT = 100;
const SCENT_BASE = 202, SCENT_HEIGHT = 114, VALUE_BASE = 218, VALUE_HEIGHT = 108;
const TAU_SPAN = 4, FACING = .9, FAN_RADIUS = 120, FAN_HOME = {
  x : 180,
  y : 160
};
const period = tau => Math.max(TIME_CONSTANT.pace_min_steps, timeConstantSteps(tau));
const x = fraction => P.left + WIDTH * fraction;
const point = (x, y) => ({fx : x / P.width, fy : y / P.height});
const words = key => label('regions.graphics.' + key);
const steps = n => t('studio.regions.graphics.steps', {n : Math.round(n)});
const cycleSteps = n => t('studio.inspector.beatSteps', {n : Math.round(n)});
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
const icon = (key, x, y, size = 24) => `<g class="region-symbol" transform="translate(${
    x - size / 2} ${y - size / 2}) scale(${size / 24})"><path d="${STUDIO_ICON[key]}"/></g>`;
const axis = (left, right, y) => path(`M${left} ${y}H${right}`, 'axis');
const fanPoint = angle => (
    {x : FAN_HOME.x + FAN_RADIUS * Math.sin(angle), y : FAN_HOME.y - FAN_RADIUS * Math.cos(angle)});
const scentValue = smoothing => Math.tanh(smoothing > 0 ? 1 - Math.exp(-1) : 1);

export function regionHandle(organ, key) {
  const r = organ.region;
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
  if (key === 'resolution') {
    const p = fanPoint(-FACING + 2 * FACING / r.resolution);
    return point(p.x, p.y);
  }
  if (key === 'contrast')
    return point(285, 224 + 10 * r.contrast);
  if (key === 'beat' || key === 'pump')
    return point(
        x(r[key] ? 1.25 * period(RHYTHM_TAU[r[key] - 1]) / (2 * LONGEST_TIME_CONSTANT) : 0),
        (key === 'pump' ? 112 : 220) - (r[key] ? 24 * Math.tanh(.65) : 0));
  return null;
}

export function regionPatch(organ, key, fx, fy) {
  const px = fx * P.width, py = fy * P.height, f = clamp((px - P.left) / WIDTH);
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
  if (key === 'resolution') {
    const angle = Math.atan2(px - FAN_HOME.x, FAN_HOME.y - py);
    return {resolution : Math.round(2 * FACING / Math.max(.01, angle + FACING))};
  }
  if (key === 'contrast')
    return {contrast : Math.round(clamp((py - 224) / 10, 0, 2))};
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
  return icon('choice', 25, 28) + text(48, 32, words('search')) +
         axis(P.left, P.right, SEARCH_BASE) +
         curve(f => SEARCH_BASE - SEARCH_HEIGHT * memory(f), undefined, undefined, 160, 'other') +
         text(P.left, 65, words('searchMemory')) +
         text(P.right, 222, words('searchStrength'), 'end') +
         handle(organ, 'search', words('searchDrag')) +
         text(P.right, 242,
              steps(timeConstantSteps(r.searchTime) *
                    (state.capabilities?.neural?.adaptationSpan ?? 10)),
              'end');
}
function scentPicture(state, organ) {
  const r = organ.region, duration = TAU_SPAN * LONGEST_TIME_CONSTANT;
  const response = f =>
      Math.tanh(r.smoothing > 0 ? 1 - Math.exp(-f * duration / timeConstantSteps(r.smoothing)) : 1);
  return icon('nose', 32, 32) + text(55, 36, words('scent')) +
         path('M40 58H110M40 58V78M250 58H320M320 58V78', 'axis') +
         path('M110 58L250 78M250 58L110 78', 'other') + axis(P.left, P.right, SCENT_BASE) +
         curve(f => SCENT_BASE - SCENT_HEIGHT * response(f)) +
         curve(f => SCENT_BASE - SCENT_HEIGHT * r.contrast * response(f), undefined, undefined, 160,
               'other') +
         handle(organ, 'scent', words('scentDrag')) +
         text(P.right, 242,
              r.smoothing > 0 ? steps(timeConstantSteps(r.smoothing) *
                                      (state.capabilities?.neural?.adaptationSpan ?? 10))
                              : words('direct'),
              'end');
}
function statePicture(state, organ) {
  const r = organ.region, scale = state.capabilities?.biasScale ?? .3;
  const hill = f => f ** 8 / (f ** 8 + r.maturity ** 8);
  return icon('eggs', 20, 60) + axis(P.left, P.right, 100) + curve(f => 100 - 70 * hill(f)) +
         handle(organ, 'maturity', words('maturityDrag')) +
         text(P.right, 124, words('maturity'), 'end') + icon('blood', 25, 157) +
         text(45, 161, words('reserve')) + axis(40, 160, 222) +
         curve(f => 222 - 180 * Math.max(0, Math.tanh(scale * (r.reserve - f))), 40, 160, 80,
               'other') +
         handle(organ, 'reserve', words('reserveDrag')) + icon('gut', 212, 157) +
         text(232, 161, words('rest')) + axis(210, 320, 222) +
         curve(f => 222 - 64 * Math.exp(-f * LONGEST_TIME_CONSTANT / timeConstantSteps(r.rest)),
               210, 320, 80, 'memory') +
         handle(organ, 'rest', words('restDrag')) +
         text(P.right, 248,
              steps(timeConstantSteps(r.rest) * (state.capabilities?.neural?.adaptationSpan ?? 10)),
              'end');
}
function valuePicture(organ) {
  const r = organ.region;
  const branches = Array
                       .from({length : 4},
                             (_, i) => {
                               const px = 65 + 76 * i;
                               return button(organ, 'features', i + 1, px, 35,
                                             `<circle r="6"/><path d="M-11 0h5M6 0h5"/>`,
                                             t('studio.regions.graphics.features', {n : i + 1}),
                                             i < r.features) +
                                      (i < r.features ? path(`M${px} 54V66L180 86`, 'axis') : '');
                             })
                       .join('');
  return branches + icon('value', 180, 88) + axis(P.left, P.right, VALUE_BASE) +
         curve(f => VALUE_BASE -
                    VALUE_HEIGHT * r.teaching *
                        Math.exp(-f * LONGEST_LEARNING_TIME / learningTimeSteps(r.association)),
               undefined, undefined, 160, 'memory') +
         handle(organ, 'association', words('associationDrag')) +
         text(P.right, 247, steps(learningTimeSteps(r.association)), 'end');
}
function motorPicture(organ) {
  const r = organ.region;
  const fish = '<g transform="translate(180 170) scale(.35) translate(-180 -104)">' +
               path('M180 52C148 75 154 115 180 142C206 115 212 75 180 52ZM180 142L168 156H192Z') +
               '</g>';
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
            return icon(key === 'pump' ? 'mouth' : 'tail', 21, base) + axis(P.left, P.right, base) +
                   curve(f => base -
                              (cycle ? 24 * Math.tanh(.15 + .5 * Math.sin(2 * Math.PI * 2 *
                                                                          LONGEST_TIME_CONSTANT *
                                                                          f / cycle))
                                     : 0),
                         undefined, undefined, 240, key === 'pump' ? 'other' : '') +
                   handle(organ, key, label('regions.settings.' + key)) +
                   text(P.right, base + 28, cycle ? cycleSteps(cycle) : words('off'), 'end');
          })
          .join('');
  return fish + tones +
         button(organ, 'compete', 1 - r.compete, 45, 31,
                `<path d="${r.compete ? 'M-10-8L10 8M10-8L-10 8' : 'M-10-8V8M10-8V8'}"/>`,
                label('regions.settings.compete'), !!r.compete) +
         button(organ, 'retreat', 1 - r.retreat, 110, 31, '<path d="M0-10V10M-7 3L0 10L7 3"/>',
                label('regions.settings.retreat'), !!r.retreat) +
         curves;
}
function tectumPicture(state, organ) {
  const r = organ.region, plan = regionPlan(state.document, organ);
  const bands = plan.most.resolution;
  let fan = '';
  for (let i = 0; i < bands; ++i) {
    const a = fanPoint(-FACING + 2 * FACING * i / bands);
    const b = fanPoint(-FACING + 2 * FACING * (i + 1) / bands);
    fan += `<path class="region-fan" fill="#81cdae" d="M${FAN_HOME.x} ${FAN_HOME.y}L${fixed(a.x)} ${
        fixed(a.y)}A${FAN_RADIUS} ${FAN_RADIUS} 0 0 1 ${fixed(b.x)} ${fixed(b.y)}Z"/>`;
    if (r.colours) {
      const colours = [ '#edbe77', '#81cdae', '#bca8db' ];
      for (let k = 0; k < Math.min(8, plan.view.types); ++k) {
        const radius = FAN_RADIUS - 8 * (k + 1);
        const angleA = -FACING + 2 * FACING * i / bands;
        const angleB = -FACING + 2 * FACING * (i + 1) / bands;
        fan += `<path fill="none" stroke="${colours[k % colours.length]}" stroke-width="3" d="M${
            fixed(FAN_HOME.x +
                  radius * Math.sin(angleA))} ${fixed(FAN_HOME.y - radius * Math.cos(angleA))}A${
            radius} ${radius} 0 0 1 ${fixed(FAN_HOME.x + radius * Math.sin(angleB))} ${
            fixed(FAN_HOME.y - radius * Math.cos(angleB))}"/>`;
      }
    }
  }
  const colours =
      '<g><circle cx="-7" r="4" fill="#edbe77"/><circle r="4" fill="#81cdae"/><circle cx="7" r="4" fill="#bca8db"/></g>';
  return fan + icon('eye', FAN_HOME.x, FAN_HOME.y + 12) +
         handle(organ, 'resolution', words('resolutionDrag')) +
         button(organ, 'colours', 1 - r.colours, 318, 32, colours,
                label('regions.settings.colours'), !!r.colours) +
         path('M70 198H250V224H100V204M130 198V215M180 198V215M230 198V215', 'memory') +
         Array
             .from({length : [ 0, 2, 5 ][r.contrast]},
                   (_, i) =>
                       `<circle class="region-interneuron" cx="${100 + i * 25}" cy="224" r="6"/>`)
             .join('') +
         path('M250 224H285V' + (224 + 10 * r.contrast), 'memory') +
         handle(organ, 'contrast', words('contrastDrag'));
}
const PICTURES = {
  choice : searchPicture,
  olfaction : scentPicture,
  state : statePicture,
  value : (s, o) => valuePicture(o),
  motor : (s, o) => motorPicture(o),
  tectum : tectumPicture
};
export function regionPicture(state, organ) {
  const draw = PICTURES[organ.type];
  if (!draw)
    return '';
  const customized = regionPlan(state.document, organ).nodes.some(n => {
    const c = organ.centers.find(c => c.node === n.node);
    return c && (Object.entries(n.set ?? {}).some(([ k, v ]) => c[k] !== v) ||
                 Object.entries(n.effects ?? {})
                     .some(([ e, values ]) =>
                               Object.entries(values).some(([ k, v ]) => c.receptors[e][k] !== v)));
  });
  return `<div class="aid-region-picture"><svg viewBox="0 0 ${P.width} ${
      P.height}" data-region-picture="${escapeText(organ.id)}" role="group" aria-label="${
      label('regions.' + organ.type + '.term')}">${draw(state, organ)}</svg><p class="aid-hint">${
      words(organ.type + 'Reference')}${customized ? ' ' + words('customized') : ''}</p></div>`;
}
