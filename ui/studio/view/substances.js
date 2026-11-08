import {neuralContextControls, neuralContextOf, cellDevelopment} from './development.js';
import {HORMONE_EFFECT, HORMONES} from '../../schema.js';
import {substanceColor} from '../../hormones.js';
import {clamp} from '../../units.js';
import {isRegion, ROLE} from '../model/organs.js';
import {
  boundEffects,
  birthAffinity,
  chosenCenter,
  DEATH_RESPONSE,
  effectDirection,
  findCenter,
  organOf,
  growsWith,
  lifePhase,
  NOTICEABLE_AFFINITY,
  organTypes,
  producers,
  receivers,
  receptorEnds,
  receptorAffinity,
  receptorResponse,
  SUBSTANCE_NAME_LENGTH,
  substanceRead,
  teachersOf,
  typeOfCenter,
  wheelAffinity,
  wheelPlace,
  wheelSigma,
  shownSubstance
} from '../model/document.js';
import {escapeText, fixed, glyph, pointMarks, trackShare, widthTrack} from './markup.js';
import {formatNumber, formatSigned, joinParts, percent, t, tList} from '../../strings.js';
import {heading, icon, ICON, label} from './kit.js';
import {DIRECTION_ICON, EFFECT_ICON, GROWTH_ICON} from './icons.js';
import {EFFECT_ORDER, EFFECT_PANEL, effectPanel, effectScene} from './effects.js';
import {centerTitle, organTitle} from './names.js';
import {typeChips} from './types.js';
import {builtAsDrawn} from './stimulus.js';

const centerWheel = (state, center, choices, reads) =>
    substanceWheel(state, {x : center.q1, y : center.q2, width : center.qwidth, active : true}, {
      choices,
      reads,
      attribute : 'data-wheel-substance',
      extra : ' data-center-id="' + escapeText(center.id) + '"',
      pad : center.id
    });
export function glandProfile(state, center) {
  const substances = state.document.substances;
  if (!substances.length)
    return '<button class="aid-secondary" data-add-substance>' +
           t('studio.marks.add', {name : label('sections.newSubstance')}) + '</button>';
  return heading(label('inspector.glandOutput')) +
         centerWheel(state, center, substances.map(sub => sub.index),
                     state.capabilities?.hormones) +
         '<div class="aid-gland-flow"><span>' +
         t('studio.marks.more', {name : label('inspector.glandSecretes')}) + '</span><span>' +
         t('studio.marks.less', {name : label('inspector.glandBinds')}) + '</span></div>';
}
const CHIP_DOT = Object.freeze({half : 8, radius : 6});
export function hormonePad(state, organ, center) {
  const wheel = state.capabilities;
  const all = Array.from({length : wheel?.bloodSubstances ?? 0}, (_, i) => i);
  const chosen = typeOfCenter(organ, center.id) ?? organTypes(organ)[0];
  const chips = wheel ? typeChips(organ, chosen, type => {
    const index = substanceRead(wheel, type.centers[0]);
    return {
      icon : '<svg viewBox="' + -CHIP_DOT.half + ' ' + -CHIP_DOT.half + ' ' + 2 * CHIP_DOT.half +
                 ' ' + 2 * CHIP_DOT.half + '"><circle r="' + CHIP_DOT.radius + '" fill="' +
                 substanceColor(index) + '"/></svg>',
      name : substanceName(state, index)
    };
  }, {add : label('inspector.addBloodType'), remove : label('inspector.removeBloodType')}) : '';
  return chips + centerWheel(state, center, all);
}
export function chemistry(state, organ, center) {
  const wheel = state.capabilities, doc = state.document;
  if (!wheel || !center || isRegion(organ) && state.selected?.kind !== 'center')
    return '';
  const chip = index => '<span class="aid-substance-chip"><span class="aid-substance-swatch" ' +
                        'style="--substance:' + substanceColor(index) + '"></span>' +
                        escapeText(substanceName(state, index)) + '</span>';
  const row = (title, items, none) =>
      '<dt>' + label(title) + '</dt><dd>' + (items.length ? items.join('') : label(none)) + '</dd>';
  let rows = '';
  if (organ.type === 'gland')
    rows += row('inspector.releasesSubstances',
                doc.substances
                    .filter(sub => wheelAffinity(wheel, center.q1, center.q2, center.qwidth,
                                                 sub.index) >= NOTICEABLE_AFFINITY)
                    .map(sub => chip(sub.index)),
                'inspector.releasesNothing');
  rows += row(
      'inspector.answersTo',
      doc.substances.flatMap(
          sub => boundEffects(center, sub.index, wheel)
                     .map(effect => chip(sub.index) + '<small class="aid-bound-effect">' +
                                    effectWords(effect,
                                                effectDirection(effect, center.receptors[effect])) +
                                    '</small>')),
      'inspector.answersToNothing');
  rows += row(
      'development.birthReceptor',
      doc.substances.filter(sub => birthAffinity(center, sub.index, wheel) >= NOTICEABLE_AFFINITY)
          .map(sub => chip(sub.index)),
      'inspector.answersToNothing');
  if (center.role === 'nerve')
    rows += row('inspector.learnsFrom',
                teachersOf(doc, center, wheel)
                    .map(({substance, glands}) =>
                             chip(substance.index) +
                             (glands.length ? ''
                                            : '<small class="aid-bound-effect">' +
                                                  label('inspector.noGland') + '</small>')),
                'inspector.learnsNothing');
  const open = (tool, text) => '<button class="aid-secondary" data-open-tool="' + tool +
                               '" data-center-id="' + escapeText(center.id) + '">' + label(text) +
                               '</button>';
  return '<section class="aid-eye-section aid-chemistry"><h4>' + label('inspector.chemistry') +
         '</h4><dl>' + rows + '</dl><div class="aid-button-group">' +
         open('hormone', 'inspector.editHormones') +
         (center.role === 'nerve' ? open('learn', 'inspector.editLearning') : '') +
         '</div></section>';
}
function bound(receptor, c) {
  let x = c / receptor.half;
  for (let k = 0; k < receptor.steepness; ++k)
    x *= x;
  return x / (1 + x);
}
const EFFECT_SCALE = Object.freeze({
  [HORMONE_EFFECT.excitation] : {low : -1, high : 1, value : r => r, response : v => v},
  [HORMONE_EFFECT.teaching] : {low : -1, high : 1, value : r => r, response : v => v},
  [HORMONE_EFFECT.learning] : {low : 0, high : 2, value : r => 1 + r, response : v => v - 1},
  [HORMONE_EFFECT.death] : {low : -1, high : 1, value : r => r, response : v => v}
});
const SHARE_SCALE =
    Object.freeze({low : 0, high : 1, value : r => (1 + r) / 2, response : v => 2 * v - 1});
const GROWTH_SCALE =
    Object.freeze({low : 0, high : 1, value : r => Math.max(0, r), response : v => v});
function receptorCurve(state, receptor, effect) {
  const maturity = receptor.substance === HORMONES.levels && effect !== GROWTH;
  const [halfMin, halfMax] = state.capabilities?.halfRange ?? [ receptor.half, receptor.half ];
  const scale = effect === GROWTH ? GROWTH_SCALE : EFFECT_SCALE[effect] ?? SHARE_SCALE;
  const context = neuralContextOf(state), wheel = state.capabilities;
  const concentration = (c, r = receptor) => {
    if (!wheel)
      return c;
    let sum = 0;
    for (let i = 0; i < (effect === GROWTH ? HORMONES.levels : wheel.regulators); ++i) {
      const level = i === r.substance       ? c
                    : i === HORMONES.levels ? context.maturity
                                            : context.hormones[i];
      sum += receptorAffinity(wheel, r, i) * level;
    }
    return sum;
  };
  const occupancy = (c, r = receptor) => bound(r, concentration(c, r));
  const response = (c, r = receptor) =>
      !r.active           ? (effect === HORMONE_EFFECT.output ? 1 : 0)
      : effect === GROWTH ? clamp(r.sensitivity * occupancy(c, r))
                          : clamp(r.baseline + r.sensitivity * occupancy(c, r), -1);
  const atFraction = f => maturity ? f : halfMin * Math.pow(halfMax / halfMin, f);
  const fraction = c => maturity ? c : Math.log(c / halfMin) / Math.log(halfMax / halfMin);
  const x = f => CURVE.left + (CURVE.right - CURVE.left) * f;
  const y = v =>
      CURVE.bottom - (CURVE.bottom - CURVE.top) * (v - scale.low) / (scale.high - scale.low);
  return {
    maturity,
    halfMin,
    halfMax,
    scale,
    concentration,
    occupancy,
    response,
    atFraction,
    fraction,
    x,
    y
  };
}
const STEEP_PROBE = 2;
function curveHandles(state, receptor, effect, target) {
  const k = receptorCurve(state, receptor, effect);
  const at = c => [k.x(clamp(k.fraction(c))), k.y(k.scale.value(k.response(c)))];
  const handles = [
    ...(effect === GROWTH
            ? []
            : [ [ 'baseline', [ k.x(0), k.y(k.scale.value(k.response(k.atFraction(0)))) ] ] ]),
    [ 'sensitivity', [ k.x(1), k.y(k.scale.value(k.response(k.atFraction(1)))) ] ],
    [ 'half', at(receptor.half) ],
    ...((state.capabilities?.steepnessSteps ?? 0) > 0
            ? [ [ 'steepness', at(receptor.half * STEEP_PROBE) ] ]
            : [])
  ];
  return handles
      .map(([ key, [ hx, hy ] ]) =>
               '<circle class="aid-spectrum-handle curve-' + key + '" data-curve-handle="' + key +
               '" cx="' + fixed(hx) + '" cy="' + fixed(hy) + '" r="' + CURVE.handle + '"><title>' +
               escapeText(label('inspector.curve.' + key)) + '</title></circle>')
      .join('');
}
export function receptorCurvePatch(state, receptor, effect, handle, fx, fy) {
  const k = receptorCurve(state, receptor, effect), span = state.capabilities?.sensitivitySpan ?? 1;
  const px = fx * CURVE.width, py = fy * CURVE.height;
  const v = k.scale.low +
            clamp((CURVE.bottom - py) / (CURVE.bottom - CURVE.top)) * (k.scale.high - k.scale.low);
  const r = clamp(k.scale.response(v), effect === GROWTH ? 0 : -1);
  const clampSpan = value => Math.max(-span, Math.min(span, value));
  if (handle === 'baseline')
    return {baseline : clamp(r - receptor.sensitivity * k.occupancy(k.atFraction(0)), -1)};
  if (handle === 'sensitivity') {
    const full = k.occupancy(k.atFraction(1)), base = effect === GROWTH ? 0 : receptor.baseline;
    return full > 0 ? {sensitivity : clampSpan((r - base) / full)} : null;
  }
  const f = clamp((px - CURVE.left) / (CURVE.right - CURVE.left));
  if (handle === 'half')
    return {half : Math.max(k.halfMin, Math.min(k.halfMax, k.atFraction(f)))};
  const base = effect === GROWTH ? 0 : receptor.baseline;
  const share = receptor.sensitivity ? (r - base) / receptor.sensitivity : 0;
  if (!(share > 0 && share < 1))
    return null;
  const n = Math.log(share / (1 - share)) /
            Math.log(k.concentration(receptor.half * STEEP_PROBE) / receptor.half);
  return {
    steepness : Math.max(
        0, Math.min(state.capabilities?.steepnessSteps ?? 0, Math.round(Math.log2(Math.max(1, n)))))
  };
}
const DOSE = Object.freeze({
  gauge : {width : 10, gap : 4, knob : 6},
  band : {top : 4, height : 12, handle : 7, gap : 6},
  pips : {step : 8, r : 2.6, after : 14},
  ends : {height : 16, baseline : 11}
});
function doseGeometry(state, receptor, effect) {
  const k = receptorCurve(state, receptor, effect), D = DOSE, G = D.gauge;
  const side = G.width + 2 * G.gap, top = D.band.top + D.band.height + D.band.gap;
  const width = 2 * EFFECT_PANEL.width + 2 * side, bottom = top + EFFECT_PANEL.height;
  const height = bottom + D.ends.height;
  const cellX = i => side + i * EFFECT_PANEL.width;
  const gaugeX = i => i ? width - G.gap - G.width : G.gap;
  const level = v => top + EFFECT_PANEL.height * (k.scale.high - v) / (k.scale.high - k.scale.low);
  const bandX = f => side + 2 * EFFECT_PANEL.width * f;
  return {k, side, top, bottom, width, height, cellX, gaugeX, level, bandX};
}
function doseStrip(state, receptor, effect, target) {
  const D = DOSE, B = D.band, G = D.gauge;
  const {k, top, bottom, width, height, cellX, gaugeX, level, bandX} =
      doseGeometry(state, receptor, effect);
  const colour = receptor.active ? substanceColor(receptor.substance) : 'currentColor';
  const halfAt = clamp(k.fraction(receptor.half));
  const responses = [ k.atFraction(0), k.atFraction(1) ].map(c => k.response(c));
  const cells =
      responses
          .map((r, i) => '<svg x="' + cellX(i) + '" y="' + top + '" width="' + EFFECT_PANEL.width +
                         '" height="' + EFFECT_PANEL.height + '" class="aid-dose-cell">' +
                         effectPanel(effect, r, colour, receptor.active ? i : 0, responses[0]) +
                         '</svg>')
          .join('') +
      '<line class="aid-effect-divide" x1="' + cellX(1) + '" y1="' + top + '" x2="' + cellX(1) +
      '" y2="' + bottom + '"/>' +
      [ 'baseline', 'sensitivity' ]
          .map((key, i) => '<text class="aid-dose-end" x="' + (cellX(i) + EFFECT_PANEL.width / 2) +
                           '" y="' + (bottom + D.ends.baseline) + '" text-anchor="middle">' +
                           escapeText(label('inspector.curve.' + key)) + '</text>')
          .join('');
  const gauge = (i, handle) => {
    const x = gaugeX(i), y = level(k.scale.value(responses[i]));
    const zero = level(k.scale.value(0));
    return '<rect class="aid-dose-gauge" x="' + x + '" y="' + top + '" width="' + G.width +
           '" height="' + EFFECT_PANEL.height + '" rx="' + G.width / 2 + '"/>' +
           '<rect class="aid-dose-level" x="' + x + '" y="' + fixed(Math.min(y, zero)) +
           '" width="' + G.width + '" height="' + fixed(Math.abs(zero - y)) + '"/>' +
           '<path class="aid-dose-zero" d="M' + x + ' ' + fixed(zero) + ' h' + G.width + '"/>' +
           (effect === HORMONE_EFFECT.death
                ? '<path class="aid-dose-threshold" d="M' + x + ' ' + fixed(level(DEATH_RESPONSE)) +
                      ' h' + G.width + '"/>'
                : '') +
           (handle === 'sensitivity' && !receptor.active
                ? ''
                : '<circle class="aid-graphic-handle" data-dose-handle="' + handle + '" cx="' +
                      (x + G.width / 2) + '" cy="' + fixed(y) + '" r="' + G.knob + '"><title>' +
                      escapeText(label('inspector.curve.' + handle)) + '</title></circle>');
  };
  const steps = state.capabilities?.steepnessSteps ?? 0, middle = B.top + B.height / 2;
  const pips =
      Array
          .from({length : steps + 1},
                (_, s) => '<circle class="aid-dose-pip' +
                          (s === receptor.steepness ? ' active' : '') + '" data-dose-steepness="' +
                          s + '" cx="' +
                          fixed(bandX(1) - D.pips.after - (steps - s) * D.pips.step) + '" cy="' +
                          middle + '" r="' + D.pips.r + '"><title>' +
                          escapeText(label('inspector.curve.steepness')) + '</title></circle>')
          .join('');
  return '<svg viewBox="0 0 ' + width + ' ' + height + '" class="aid-dose"' +
         (target ? ' data-dose="' + escapeText(target) + '"' : '') +
         ' style="--substance:' + colour +
         '"><defs><linearGradient id="aid-dose-amount"><stop offset="0" ' +
         'stop-color="currentColor" stop-opacity="0"/><stop offset="1" stop-color="currentColor" ' +
         'stop-opacity=".8"/></linearGradient></defs><rect class="aid-dose-band" x="' + bandX(0) +
         '" y="' + B.top + '" width="' + fixed(bandX(1) - bandX(0)) + '" height="' + B.height +
         '" rx="' + B.height / 2 + '" fill="url(#aid-dose-amount)"/>' + cells +
         gauge(0, 'baseline') + gauge(1, 'sensitivity') +
         (receptor.active
              ? pips + '<circle class="aid-graphic-handle" data-dose-handle="half" ' +
                    'cx="' + fixed(bandX(halfAt)) + '" cy="' + middle + '" r="' + B.handle +
                    '"><title>' + escapeText(label('inspector.curve.half')) + '</title></circle>'
              : '') +
         '</svg>';
}
export function dosePatch(state, receptor, effect, handle, fx, fy) {
  const {k, top, width, height, bandX} = doseGeometry(state, receptor, effect);
  const px = fx * width, py = fy * height;
  if (handle === 'half') {
    const f = clamp((px - bandX(0)) / (bandX(1) - bandX(0)));
    return {half : Math.max(k.halfMin, Math.min(k.halfMax, k.atFraction(f)))};
  }
  const v = k.scale.high - clamp((py - top) / EFFECT_PANEL.height) * (k.scale.high - k.scale.low);
  const r = clamp(k.scale.response(v), -1);
  const span = state.capabilities?.sensitivitySpan ?? 1;
  if (handle === 'baseline')
    return {baseline : clamp(r - receptor.sensitivity * k.occupancy(k.atFraction(0)), -1)};
  const full = receptor.active ? k.occupancy(k.atFraction(1)) : 0;
  return full > 0 ? {sensitivity : Math.max(-span, Math.min(span, (r - receptor.baseline) / full))}
                  : null;
}
export const GROWTH = 'growth';
const CURVE = Object.freeze({
  width : 260,
  height : 150,
  left : 36,
  right : 250,
  top : 14,
  bottom : 112,
  points : 80,
  handle : 6
});
const CURVE_MARKS = Object.freeze({gap : 4, below : 14, title : 10});
const curveText = (value, x, y, anchor = 'start') => '<text x="' + x + '" y="' + y +
                                                     '" text-anchor="' + anchor + '">' +
                                                     escapeText(value) + '</text>';
const curveAxes = () => '<path class="aid-chart-axis" d="M' + CURVE.left + ' ' + CURVE.top + ' V' +
                        CURVE.bottom + ' H' + CURVE.right + '"/>';
function curveMarks({high, low, from, to, along, up}) {
  const C = CURVE, M = CURVE_MARKS, under = C.bottom + M.below;
  return curveText(high, C.left - M.gap, C.top + M.gap, 'end') +
         curveText(low, C.left - M.gap, C.bottom, 'end') + curveText(from, C.left, under) +
         curveText(to, C.right, under, 'end') +
         curveText(along, (C.left + C.right) / 2, under, 'middle') +
         curveText(up, C.left + M.gap, C.top + M.title);
}
const PHASE_POINTER = Object.freeze({half : 8, height : 14});
const CURVE_DIGITS = 3;
function effectCurve(state, receptor, effect, target = null) {
  const {maturity, halfMin, scale, response, atFraction, x, y} =
      receptorCurve(state, receptor, effect);
  const points = Array
                     .from({length : CURVE.points + 1},
                           (_, i) => fixed(x(i / CURVE.points)) + ',' +
                                     fixed(y(scale.value(response(atFraction(i / CURVE.points))))))
                     .join(' ');
  let marks = '';
  if (scale.low < 0 && scale.high > 0)
    marks += '<path class="aid-chart-zero" d="M' + CURVE.left + ' ' + fixed(y(0)) + ' H' +
             CURVE.right + '"/>';
  if (effect === HORMONE_EFFECT.death)
    marks += '<rect class="aid-death-zone" x="' + CURVE.left + '" y="' + CURVE.top + '" width="' +
             (CURVE.right - CURVE.left) + '" height="' + fixed(y(DEATH_RESPONSE) - CURVE.top) +
             '"/>';
  const unit = effect === GROWTH ? label('inspector.growth') : label('effects.' + effect);
  return '<svg viewBox="0 0 ' + CURVE.width + ' ' + CURVE.height + '" class="aid-response-chart"' +
         (target ? ' data-receptor-curve="' + escapeText(target) + '"' : '') + '>' + marks +
         curveAxes() + '<polyline class="aid-response-line" points="' + points + '"/>' +
         curveMarks({
           high : formatNumber(scale.high, CURVE_DIGITS),
           low : formatNumber(scale.low, CURVE_DIGITS),
           from : formatNumber(maturity ? 0 : halfMin, CURVE_DIGITS),
           to : formatNumber(1),
           along : maturity ? label('inspector.maturity') : label('inspector.concentration'),
           up : unit
         }) +
         (target ? curveHandles(state, receptor, effect, target) : '') + '</svg>';
}
const PHASE_OPEN = .05;
export function phasePatch(handle, fx) {
  const m = clamp((fx * CURVE.width - CURVE.left) / (CURVE.right - CURVE.left));
  return handle === 'start' ? {start : m < PHASE_OPEN ? null : m}
                            : {end : m > 1 - PHASE_OPEN ? null : Math.max(PHASE_OPEN, m)};
}
const MEASURE_STEP = .01;
export const measureReading = level => percent(level);
const MEASURE_SHOWN = .005, MEASURE_ROWS = 6;
export function measurement(state, index) {
  const waiting = builtAsDrawn(state) ? '' : ' disabled';
  let html = '<details class="aid-measure"><summary>' + label('development.compiledProbe') +
             '</summary><p class="aid-hint">' + label('development.probeMeaning') +
             '</p><span class="aid-measure-title">' + label('hormoneCard.probe') +
             '</span><div class="aid-measure-dose">' +
             '<label class="aid-dial"><span>' + label('inspector.measureLevel') +
             '</span><input type="range" data-measure-level min="0" max="1" step="' + MEASURE_STEP +
             '" value="' + fixed(state.measureLevel) + '"' + waiting + '/><output>' +
             measureReading(state.measureLevel) + '</output></label>' +
             '<button class="aid-secondary" data-measure' + waiting + '>' +
             label('inspector.measure') + '</button></div>';
  const m = state.measurement;
  if (!m || m.substance !== index)
    return html + '</details>';
  const names = tList('hormones.organNames');
  const rows = m.organs.map((value, o) => ({name : names[o], value}))
                   .filter(r => Math.abs(r.value) > MEASURE_SHOWN)
                   .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
                   .slice(0, MEASURE_ROWS);
  if (Math.abs(m.growth) > MEASURE_SHOWN)
    rows.unshift({name : label('inspector.growth'), value : m.growth});
  const dead = m.dead.reduce((sum, n) => sum + n, 0);
  html +=
      heading(label('inspector.measured')) +
      rows.map(r => '<div class="aid-measure-row"><span>' + escapeText(r.name) +
                    '</span><span class="aid-measure-bar ' + (r.value > 0 ? 'up' : 'down') +
                    '" style="--share:' + fixed(Math.min(1, Math.abs(r.value))) + '"></span>' +
                    '<output>' + formatSigned(r.value, 2, true) + '</output></div>')
          .join('') +
      (dead ? '<div class="aid-measure-row"><span>' + label('inspector.cellsDie') +
                  '</span><output>' + dead + '</output></div>'
            : '') +
      (!rows.length && !dead ? '<div class="aid-empty-centre">' + label('inspector.none') + '</div>'
                             : '');
  return html + '</details>';
}
function lifePhaseEditor(state, focus) {
  const phase = lifePhase(focus), output = focus.receptors[HORMONE_EFFECT.output];
  const context = neuralContextOf(state);
  const level = m => (1 + receptorResponse(state.capabilities, output, context.hormones, m, 1)) / 2;
  const x = m => CURVE.left + (CURVE.right - CURVE.left) * m,
        y = v => CURVE.bottom - (CURVE.bottom - CURVE.top) * v;
  const points = Array.from({length : CURVE.points + 1}, (_, i) => i / CURVE.points)
                     .map(m => fixed(x(m)) + ',' + fixed(y(level(m))))
                     .join(' ');
  const death = focus.receptors[HORMONE_EFFECT.death];
  const dead = Array
                   .from({length : CURVE.points},
                         (_, i) => {
                           const m = (i + .5) / CURVE.points;
                           return receptorResponse(state.capabilities, death, context.hormones, m) >
                                          DEATH_RESPONSE
                                      ? '<rect class="aid-death-zone" x="' +
                                            fixed(x(i / CURVE.points)) + '" y="' + CURVE.top +
                                            '" width="' +
                                            fixed((CURVE.right - CURVE.left) / CURVE.points + .1) +
                                            '" height="' + (CURVE.bottom - CURVE.top) + '"/>'
                                      : '';
                         })
                   .join('');
  const mark = (handle, value, open, title) => {
    const at = fixed(x(value ?? open)), line = ' x1="' + at + '" y1="' + CURVE.top + '" x2="' + at +
                                               '" y2="' + CURVE.bottom + '"';
    return '<g class="aid-phase-mark' + (value === null ? ' open' : '') + '" data-phase-handle="' +
           handle + '"><title>' + label(title) + '</title><line class="aid-phase-grip"' + line +
           '/><line' + line + '/><path d="M' + at + ' ' + CURVE.bottom + ' l' +
           -PHASE_POINTER.half + ' ' + -PHASE_POINTER.height + ' h' + 2 * PHASE_POINTER.half +
           ' Z"/></g>';
  };
  return '<section class="aid-life-phase">' + heading(label('inspector.lifePhase')) +
         '<p class="aid-hint">' + label('development.phaseHandles') + '</p>' +
         '<svg viewBox="0 0 ' + CURVE.width + ' ' + CURVE.height +
         '" class="aid-response-chart" data-phase="' + escapeText(focus.id) + '">' + dead +
         curveAxes() + '<polyline class="aid-response-line" points="' + points + '"/>' +
         curveMarks({
           high : percent(1),
           low : formatNumber(0),
           from : formatNumber(0),
           to : formatNumber(1),
           along : label('inspector.maturity'),
           up : label('inspector.cellSignal')
         }) +
         mark('start', phase.start, 0, 'inspector.phaseStart') +
         mark('end', phase.end, 1, 'inspector.phaseEnd') + '</svg>' +
         '<div class="aid-range-hints"><span>' + label('inspector.phaseStart') + '</span><span>' +
         label('inspector.phaseEnd') + '</span></div></section>';
}
export const WHEEL = Object.freeze({
  size : 150,
  height : 176,
  centre : 75,
  radius : 51,
  point : 11,
  ring : 15,
  track : [ 34, 116 ],
  track_y : 162
});
const wheelX = x => WHEEL.centre + x * WHEEL.radius, wheelY = y => WHEEL.centre - y * WHEEL.radius;
export const wheelPatch = (fx, fy) => ({
  q1 : clamp((fx * WHEEL.size - WHEEL.centre) / WHEEL.radius, -1),
  q2 : clamp((WHEEL.centre - fy * WHEEL.height) / WHEEL.radius, -1)
});
export const wheelMarks = center => pointMarks({x : wheelX(center.q1), y : wheelY(center.q2)});
export const wheelTrackWidth = fx => trackShare(fx * WHEEL.size, WHEEL.track);
function substanceMark(state, index) {
  return index === HORMONES.levels       ? label('inspector.maturityMark')
         : index === HORMONES.levels + 1 ? label('inspector.reserveMark')
                                         : Array.from(substanceName(state, index))[0];
}
export function substanceName(state, index) {
  const named = state.document.substances.find(sub => sub.index === index)?.name;
  return named ||
         (index === HORMONES.levels       ? label('inspector.maturity')
          : index === HORMONES.levels + 1 ? label('inspector.reserve')
                                          : tList('studio.inspector.substanceLetters')[index]);
}
function substanceWheel(state, profile, {
  choices = [],
  attribute = '',
  extra = '',
  pad = null,
  selected = null,
  reads = Infinity,
  widthTarget = null
}) {
  const wheel = state.capabilities;
  if (!wheel)
    return '';
  const px = x => fixed(wheelX(x)), py = y => fixed(wheelY(y));
  const clickable = new Set(choices);
  const named = new Set(state.document.substances.map(sub => sub.index));
  const points = Array.from({length : wheel.bloodSubstances}, (_, index) => {
    if (index >= reads)
      return '';
    const [x, y] = wheelPlace(wheel, index), name = substanceName(state, index);
    if (index < HORMONES.levels && !named.has(index) && !clickable.has(index))
      return '<g class="aid-wheel-point empty" data-define-substance="' + index +
             '" style="--substance:' + substanceColor(index) + '"><circle cx="' + px(x) + '" cy="' +
             py(y) + '" r="' + WHEEL.point + '"/><text x="' + px(x) + '" y="' + py(y) +
             '" dy=".35em" text-anchor="middle">' + label('inspector.undefinedMark') +
             '</text><title>' + label('inspector.defineSubstance') + '</title></g>';
    const bound = profile.active && index < reads
                      ? wheelAffinity(wheel, profile.x, profile.y, profile.width, index)
                      : 0;
    const open = clickable.has(index);
    return '<g class="aid-wheel-point' + (open ? '' : ' fixed') +
           (index >= HORMONES.levels ? ' body' : '') + (selected === index ? ' active' : '') + '"' +
           (open ? ' ' + attribute + '="' + index + '"' + extra : '') +
           ' style="--substance:' + substanceColor(index) + ';--bound:' + fixed(bound) +
           '"><circle cx="' + px(x) + '" cy="' + py(y) + '" r="' + WHEEL.point + '"/><text x="' +
           px(x) + '" y="' + py(y) + '" dy=".35em" text-anchor="middle">' +
           escapeText(substanceMark(state, index)) + '</text><title>' +
           escapeText(joinParts([ name, percent(bound) ])) + '</title></g>';
  });
  const halo = profile.active ? '<circle class="aid-wheel-halo" cx="' + px(profile.x) + '" cy="' +
                                    py(profile.y) + '" r="' +
                                    fixed(wheelSigma(wheel, profile.width) * WHEEL.radius) + '"/>'
                              : '';
  // The profile's point as a ring around it, under the substances, so their marks stay readable.
  const marker = pad ? '<circle class="aid-vector-point" cx="' + px(profile.x) + '" cy="' +
                           py(profile.y) + '" r="' + WHEEL.ring + '"/>'
                     : '';
  const attributes = pad           ? 'data-graphic-handle="width"'
                     : widthTarget ? 'data-wheel-width="' + escapeText(widthTarget) + '"'
                                   : '';
  const track = profile.active && attributes
                    ? widthTrack(WHEEL.track, WHEEL.track_y, profile.width, attributes,
                                 label('inspector.receptorWidth'))
                    : '';
  return '<svg class="aid-substance-wheel"' +
         (pad ? ' data-vector-pad="' + escapeText(pad) + '" data-wheel tabindex="0"' : '') +
         ' viewBox="0 0 ' + WHEEL.size + ' ' + (track ? WHEEL.height : WHEEL.size) +
         '" role="img" aria-label="' + label('inspector.hormoneProfile') + '"><circle cx="' +
         WHEEL.centre + '" cy="' + WHEEL.centre + '" r="' + WHEEL.radius +
         '" class="aid-wheel-ring"/>' + halo + marker + points.join('') + track + '</svg>';
}
function receptorProfile(state, receptor) {
  const [x, y] = state.capabilities ? wheelPlace(state.capabilities, receptor.substance) : [ 0, 0 ];
  return {x, y, width : receptor.width, active : receptor.active};
}
function growthEditor(state) {
  const {document : doc} = state, growth = doc.growth;
  if (!growth.active || !doc.substances.some(sub => sub.index === growth.substance))
    return '';
  return '<section class="aid-growth">' +
         heading(
             t('studio.hormoneCard.growthWith', {name : substanceName(state, growth.substance)})) +
         effectCurve(state, growth, GROWTH, GROWTH) + '<div class="aid-parameter-grid">' +
         [ 'sensitivity', 'half', 'width', 'steepness', 'spread_receptors' ]
             .map(key => '<label>' + label('development.' + key) +
                         '<input type="number" data-body-growth="' + key + '" value="' +
                         growth[key] + '" step="' + (key === 'steepness' ? 1 : .001) + '" min="' +
                         (key === 'half' ? state.capabilities.halfRange[0] : 0) + '" max="' +
                         (key === 'sensitivity' ? state.capabilities.sensitivitySpan
                          : key === 'steepness' ? state.capabilities.steepnessSteps
                                                : 1) +
                         '"></label>')
             .join('') +
         '</div><p class="aid-hint">' + label('development.bodyGrowth') + '</p></section>';
}
function organsOf(doc, centers) {
  const seen = new Set();
  return centers.map(c => findCenter(doc, c.id)?.organ).filter(organ => {
    if (!organ || seen.has(organ.id))
      return false;
    seen.add(organ.id);
    if (organ.pair)
      seen.add(organ.pair);
    return true;
  });
}
const receptorEditor = (state, center, effects, effect) =>
    '<div class="aid-effect-chips">' +
    effects
        .map(value => '<button data-effect="' + value + '" class="' +
                      (effect === value ? 'active' : '') + '">' +
                      glyph(EFFECT_ICON[value], ICON.mark, {line : true}) +
                      escapeText(label('effects.' + value)) + '</button>')
        .join('') +
    '</div>' + receptorBody(state, center, effect);
function receptorBody(state, center, effect) {
  const receptor = center.receptors[effect], target = center.id + ':' + effect;
  return '<label class="aid-checkbox"><input type="checkbox" data-receptor-active="' +
         escapeText(center.id) + '" data-receptor-effect="' + effect + '" ' +
         (receptor.active ? 'checked' : '') + '/>' + label('inspector.receptorActive') +
         '</label>' + substanceWheel(state, receptorProfile(state, receptor), {
           choices : Array.from({length : HORMONES.levels + 1}, (_, i) => i),
           attribute : 'data-receptor-substance',
           reads : state.capabilities?.regulators,
           extra : ' data-center-id="' + escapeText(center.id) + '" data-receptor-effect="' +
                       effect + '"',
           selected : receptor.substance,
           widthTarget : target
         }) +
         doseStrip(state, receptor, effect, target) + '<details><summary>' +
         label('development.receptorValues') + '</summary><div class="aid-parameter-grid">' +
         [ 'baseline', 'sensitivity', 'half', 'width', 'steepness', 'spread_receptors' ]
             .map(key => {
               const min = key === 'baseline'      ? -1
                           : key === 'sensitivity' ? -state.capabilities.sensitivitySpan
                           : key === 'half'        ? state.capabilities.halfRange[0]
                                                   : 0;
               const max = key === 'sensitivity' ? state.capabilities.sensitivitySpan
                           : key === 'steepness' ? state.capabilities.steepnessSteps
                                                 : 1;
               return '<label>' + label('development.' + key) +
                      '<input type="number" data-receptor-field="' + escapeText(center.id) +
                      '" data-receptor-effect="' + effect + '" data-receptor-key="' + key +
                      '" min="' + min + '" max="' + max + '" step="' +
                      (key === 'steepness' ? 1 : .0001) + '" value="' + receptor[key] +
                      '"></label>';
             })
             .join('') +
         '</div></details>';
}
function substanceInspector(state) {
  const {document : doc, capabilities : wheel} = state;
  const substance = shownSubstance(doc, state.focusSubstance);
  if (!substance || !wheel)
    return '<header class="aid-inspector-head">' + heading(label('hormoneCard.title')) +
           '</header>';
  const index = substance.index, grows = growsWith(doc, index, wheel);
  const fallback = substanceName(state, index);
  const list = organs =>
      organs
          .map(o => '<button data-select-organ="' + escapeText(o.id) + '">' +
                    icon(o.type, ICON.list) + escapeText(organTitle(o, state.sites)) + '</button>')
          .join('');
  const acts = organsOf(doc, receivers(doc, index, wheel)).map(o => {
    const effects = new Set(o.centers.flatMap(c => boundEffects(c, index, wheel)));
    const birth = o.centers.some(c => birthAffinity(c, index, wheel) >= NOTICEABLE_AFFINITY);
    return '<button data-select-organ="' + escapeText(o.id) + '">' + icon(o.type, ICON.list) +
           escapeText(organTitle(o, state.sites)) +
           (birth ? '<small class="aid-bound-effect">' + label('development.birthReceptor') +
                        '</small>'
                  : '') +
           [...effects ]
               .map(e => {
                 const binding = o.centers.find(c => boundEffects(c, index, wheel).includes(e));
                 return boundEffect(e, effectDirection(e, binding.receptors[e]));
               })
               .join('') +
           '</button>';
  });
  const row = (key, body) => body ? '<div class="aid-card-row"><span>' +
                                        label('hormoneCard.' + key) + '</span><div>' + body +
                                        '</div></div>'
                                  : '';
  return '<header class="aid-inspector-head" style="--substance:' + substanceColor(index) +
         '"><span class="aid-substance-swatch"></span><input class="aid-inline-name ' +
         'aid-inline-title" data-substance-name="' + index + '" value="' +
         escapeText(substance.name) + '" placeholder="' + escapeText(fallback) + '" maxlength="' +
         SUBSTANCE_NAME_LENGTH + '" aria-label="' + label('inspector.substanceName') +
         '"></header><button class="aid-growth-mark' + (grows ? ' on' : '') + '" ' +
         (grows ? 'data-growth-off' : 'data-growth-substance="' + index + '"') + ' aria-pressed="' +
         grows + '">' + glyph(GROWTH_ICON, ICON.mark, {line : true}) + '<span>' +
         label(grows ? 'hormoneCard.growsOn' : 'hormoneCard.growsOff') + '</span></button>' +
         (grows ? growthEditor(state) : '') +
         row('sources', list(organsOf(doc, producers(doc, index, wheel)))) +
         row('acts', acts.join('')) + effectGuide(state, index) + measurement(state, index) +
         '<button class="aid-danger" data-remove-substance="' + index + '">' +
         label('inspector.removeSubstance') + '</button>';
}
// What a substance does to a cell, as the receptor turns it (`direction`, 0 for either way).
const effectWords = (effect, direction) =>
    direction ? tList('studio.' + (direction > 0 ? 'effectsRise' : 'effectsFall'))[effect]
              : label('effects.' + effect);
const effectSentence = (effect, direction) =>
    t('studio.hormoneCard.sentence', {effect : effectWords(effect, direction)});
export function boundEffect(effect, direction) {
  return '<span class="aid-bound-effect" title="' + escapeText(effectSentence(effect, direction)) +
         '">' + glyph(EFFECT_ICON[effect], ICON.mark, {line : true}) +
         (direction
              ? '<span class="aid-direction">' +
                    glyph(DIRECTION_ICON[direction > 0 ? 'rises' : 'falls'], ICON.mark) + '</span>'
              : '') +
         '</span>';
}
function effectGuide(state, index) {
  const {document : doc, capabilities : wheel} = state, colour = substanceColor(index);
  const receiving = receivers(doc, index, wheel), words = key => tList('studio.hormoneCard.' + key);
  return '<section class="aid-effect-guide">' + heading(label('hormoneCard.effectsTitle')) +
         EFFECT_ORDER
             .map(effect => {
               const bound = receiving.filter(c => boundEffects(c, index, wheel).includes(effect));
               const n = bound.length;
               const ends = n ? receptorEnds(bound[0].receptors[effect]) : undefined;
               const direction = n ? effectDirection(effect, bound[0].receptors[effect]) : 0;
               return '<div class="aid-effect-card' + (n ? '' : ' off') +
                      '" style="--substance:' + colour + '" title="' +
                      escapeText(words('tileTitles')[effect] + ' ' + words('where')[effect]) +
                      '">' + effectScene(effect, colour, ends) + '<div><strong>' +
                      boundEffect(effect, direction) +
                      escapeText(effectSentence(effect, direction)) +
                      (n ? '<span class="aid-effect-count" title="' +
                               escapeText(t('studio.hormoneCard.here', {n})) + '">' + n + '</span>'
                         : '') +
                      '</strong></div></div>';
             })
             .join('') +
         '</section>';
}
function hormoneDetails(state) {
  const {document : doc, selected} = state;
  const focus = chosenCenter(doc, selected, state.visionProfile);
  if (!focus)
    return substanceInspector(state);
  const html = '<header class="aid-inspector-head"><span>' + label('sections.receptors') +
               '</span>' + heading(centerTitle(focus)) + '</header>';
  const own = state.capabilities?.roleEffects?.[ROLE[focus.role]] ?? [];
  const effects = EFFECT_ORDER.filter(e => own.includes(e));
  const effect = effects.includes(state.effect) ? state.effect : effects[0];
  if (!focus.receptors?.[effect])
    return html;
  const organ = organOf(doc, focus.id), seen = new Set();
  const choices = (organ?.centers ?? []).filter(c => {
    const key = c.node ?? c.profile ?? c.key;
    if (seen.has(key))
      return false;
    seen.add(key);
    return true;
  });
  const choose = choices.length > 1
                     ? '<div class="aid-center-tabs">' +
                           choices
                               .map(c => '<button data-select-center="' + escapeText(c.id) +
                                         '" class="' + (c.id === focus.id ? 'active' : '') + '">' +
                                         escapeText(centerTitle(c)) + '</button>')
                               .join('') +
                           '</div>'
                     : '';
  return html + choose + cellDevelopment(state, focus) + lifePhaseEditor(state, focus) +
         '<div class="aid-receptor-editor">' + heading(label('inspector.cellEffects')) +
         receptorEditor(state, focus, effects, effect) + '</div>';
}

export function hormoneInspector(state) {
  return neuralContextControls(state) + hormoneDetails(state);
}
