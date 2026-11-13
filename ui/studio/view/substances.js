import {variationGraphic} from './cell_tissue.js';
import {receptorVariationExamples} from '../model/variation.js';
import {previewControls, previewContextOf, cellDevelopment} from './development.js';
import {BLOOD_SUBSTANCE, HORMONE_EFFECT, HORMONES} from '../../schema.js';
import {substanceColor} from '../../hormones.js';
import {clamp} from '../../units.js';
import {isRegion} from '../model/organs.js';
import {regionNodeMap} from './region_graph.js';
import {
  boundEffects,
  bloodLevel,
  effectsFor,
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
  regulatorySubstances,
  receptorEnds,
  receptorAffinity,
  SUBSTANCE_NAME_LENGTH,
  substanceRead,
  teachersOf,
  typeOfCenter,
  wheelAffinity,
  wheelPlace,
  wheelSigma,
  shownSubstance,
  mainHormone
} from '../model/document.js';
import {escapeText, fixed, glyph, placedGlyph, pointMarks} from './markup.js';
import {formatNumber, joinParts, namedText, percent, t, tList} from '../../strings.js';
import {bandGlyph, heading, icon, ICON, iconSwitch, label, SWITCH_SYMBOL} from './kit.js';
import {BIRTH_ICON, DIRECTION_ICON, EFFECT_ICON, GROWTH_ICON, TOOL_ICON} from './icons.js';
import {EFFECT_ORDER, effectScene} from './effects.js';
import {centerTitle, organTitle} from './names.js';
import {typeChips} from './types.js';
import {senseSensitivity} from './sense_marks.js';
import {boundedRow, sensePicture} from './sense_curves.js';
import {glandPictures, pouredShares} from './gland_effect.js';
import {lifeResponses} from '../model/cell_life.js';

const centerWheel = (state, center, choices, reads) =>
    substanceWheel(state, {x : center.q1, y : center.q2, width : center.qwidth, active : true}, {
      choices,
      reads,
      attribute : 'data-wheel-substance',
      extra : ' data-center-id="' + escapeText(center.id) + '"',
      pad : center.id,
      role : center.role === 'motor' ? 'gland' : 'sense'
    });
// A chip names its substance as the wheel does: its mark in its colour, the full name beside it.
const substanceChip = (state, index) => {
  const mark = substanceMark(state, index), name = substanceName(state, index);
  return '<i class="aid-substance-mark" style="--substance:' + substanceColor(index) + '">' +
         escapeText(mark) + '</i>' + (name !== mark ? escapeText(name) : '');
};
// The gland: its wheel says which substances it pours, the pictures below what it does to the
// blood.
export function glandProfile(state, organ, center) {
  const substances = state.document.substances, wheel = state.capabilities;
  // Each node of the gland pours its own substances; a chip chooses the node, by what it pours
  // most.
  const chosen = typeOfCenter(organ, center.id) ?? organTypes(organ)[0];
  const chips = wheel ? typeChips(organ, chosen, type => {
    const index = mainHormone(wheel, type.centers[0]);
    return {icon : substanceChip(state, index), name : substanceName(state, index)};
  }, {add : label('inspector.addGlandType'), remove : label('inspector.removeGlandType')}) : '';
  const add = substances.length ? ''
                                : '<button class="aid-add" data-add-substance>' +
                                      label('sections.newSubstance') + '</button>';
  // Nothing of the gland reaches past the wheel's points, so its picture shows the wheel close
  // up.
  return chips + '<div class="aid-wheel-close" data-sense-block="' + escapeText(organ.id) + '">' +
         centerWheel(state, center, Array.from({length : wheel?.hormones ?? 0}, (_, i) => i),
                     state.capabilities?.hormones) +
         '</div>' + add + glandPictures(state, organ, center, index => substanceName(state, index));
}
// The blood sense: its wheel says which substance the cells read, the curve below how high a
// level they report (bounded, half at their threshold; blood is no sense that gets used to what
// it feels, brain_interface.hh).
export function hormonePad(state, organ, center, held = null) {
  const wheel = state.capabilities;
  const all = Array.from({length : wheel?.bloodSubstances ?? 0}, (_, i) => i);
  const chosen = typeOfCenter(organ, center.id) ?? organTypes(organ)[0];
  const chips = wheel ? typeChips(organ, chosen, type => {
    const index = substanceRead(wheel, type.centers[0]);
    return {icon : substanceChip(state, index), name : substanceName(state, index)};
  }, {add : label('inspector.addBloodType'), remove : label('inspector.removeBloodType')}) : '';
  const sensitive = held ?? senseSensitivity(state, center) ?? 0;
  const words = key => t('studio.bloodSense.' + key);
  return '<div data-sense-block="' + escapeText(organ.id) + '">' + chips +
         centerWheel(state, center, all, Infinity) +
         sensePicture(center, words('title'), [ boundedRow(sensitive, {
                        report : words('report'),
                        from : words('none'),
                        to : words('full'),
                        half : t('studio.bloodSense.half', {p : percent(1 - sensitive)}),
                        handle : words('handle')
                      }) ]) +
         '</div>';
}
// What the cell's substances do, only where it binds or learns from one: the substance chips with
// what they change, and buttons to the hormone and learning tools. Release and birth stand in the
// gland's and the life picture already.
export function chemistry(state, organ, center) {
  const wheel = state.capabilities, doc = state.document;
  if (!wheel || !center || isRegion(organ) && state.selected?.kind !== 'center')
    return '';
  const chip = index => '<span class="aid-substance-chip"><span class="aid-substance-swatch" ' +
                        'style="--substance:' + substanceColor(index) + '"></span>' +
                        escapeText(substanceName(state, index)) + '</span>';
  const row = (title, items) =>
      items.length ? '<dt>' + label(title) + '</dt><dd>' + items.join('') + '</dd>' : '';
  let rows = row(
      'inspector.answersTo',
      regulatorySubstances(doc, wheel)
          .flatMap(
              sub => boundEffects(center, sub.index, wheel)
                         .map(effect => chip(sub.index) + '<small class="aid-bound-effect">' +
                                        effectWords(effect, effectDirection(
                                                                effect, center.receptors[effect])) +
                                        '</small>')));
  if (center.role === 'nerve')
    rows +=
        row('inspector.learnsFrom',
            teachersOf(doc, center, wheel)
                .map(({substance, glands}) => chip(substance.index) +
                                              (glands.length || substance.index >= HORMONES.levels
                                                   ? ''
                                                   : '<small class="aid-bound-effect">' +
                                                         label('inspector.noGland') + '</small>')));
  const open = (tool, text) => '<button class="aid-secondary aid-tool-link" data-open-tool="' +
                               tool + '" data-center-id="' + escapeText(center.id) + '">' +
                               glyph(TOOL_ICON[tool], ICON.tool, {line : true}) + label(text) +
                               '</button>';
  return '<section class="aid-eye-section aid-chemistry">' + (rows ? '<dl>' + rows + '</dl>' : '') +
         '<div class="aid-button-group">' + open('hormone', 'inspector.editHormones') +
         (center.role === 'nerve' ? open('learn', 'inspector.editLearning') : '') +
         '</div></section>';
}
function bound(receptor, c) {
  const x = (c / receptor.half) ** (2 ** receptor.steepness);
  return x / (1 + x);
}
const EFFECT_SCALE = Object.freeze({
  [HORMONE_EFFECT.consolidation] : {low : -1, high : 1, value : r => r, response : v => v},
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
  const bounded = receptor.substance >= HORMONES.levels && effect !== GROWTH;
  const [halfMin, halfMax] = state.capabilities?.halfRange ?? [ receptor.half, receptor.half ];
  const scale = effect === GROWTH  ? GROWTH_SCALE
                : effect === BIRTH ? EFFECT_SCALE[HORMONE_EFFECT.excitation]
                                   : EFFECT_SCALE[effect] ?? SHARE_SCALE;
  const context = previewContextOf(state), wheel = state.capabilities;
  const concentration = (c, r = receptor) => {
    if (!wheel)
      return c;
    let sum = 0;
    for (let i = 0; i < (effect === GROWTH ? HORMONES.levels : wheel.regulators); ++i) {
      const level = i === r.substance ? c : bloodLevel(context, i);
      sum += receptorAffinity(wheel, r, i) * level;
    }
    return sum;
  };
  const occupancy = (c, r = receptor) => bound(r, concentration(c, r));
  const response = (c, r = receptor) =>
      !r.active           ? (effect === HORMONE_EFFECT.output || effect === BIRTH ? 1 : 0)
      : effect === GROWTH ? clamp(r.sensitivity * occupancy(c, r))
                          : clamp(r.baseline + r.sensitivity * occupancy(c, r), -1);
  const atFraction = f => bounded ? f : halfMin * Math.pow(halfMax / halfMin, f);
  const fraction = c => bounded ? c : Math.log(c / halfMin) / Math.log(halfMax / halfMin);
  const x = f => CURVE.left + (CURVE.right - CURVE.left) * f;
  const y = v =>
      CURVE.bottom - (CURVE.bottom - CURVE.top) * (v - scale.low) / (scale.high - scale.low);
  return {
    bounded,
    axis : bounded ? substanceName(state, receptor.substance) : label('axes.concentrationLog'),
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
// Where the answer turns and how sharply only show while it changes at all; a flat answer has
// only its two ends to drag.
const FLAT_ANSWER = .02;
function curveHandles(state, receptor, effect, target) {
  const k = receptorCurve(state, receptor, effect);
  const at = c => [k.x(clamp(k.fraction(c))), k.y(k.scale.value(k.response(c)))];
  const least = k.response(k.atFraction(0)), most = k.response(k.atFraction(1));
  const turns = Math.abs(most - least) > FLAT_ANSWER;
  const handles = [
    ...(effect === GROWTH ? [] : [ [ 'baseline', [ k.x(0), k.y(k.scale.value(least)) ] ] ]),
    [ 'sensitivity', [ k.x(1), k.y(k.scale.value(most)) ] ],
    ...(turns ? [ [ 'half', at(receptor.half) ] ] : []),
    ...(turns && (state.capabilities?.steepnessSpan ?? 0) > 0
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
    steepness :
        Math.max(0, Math.min(state.capabilities?.steepnessSpan ?? 0, Math.log2(Math.max(1, n))))
  };
}
export const GROWTH = 'growth';
export const BIRTH = 'birth';
const CURVE = Object.freeze({
  width : 260,
  height : 150,
  left : 36,
  right : 250,
  top : 26,
  bottom : 112,
  points : 80,
  handle : 6
});
const curveAxes = () => '<path class="aid-chart-axis" d="M' + CURVE.left + ' ' + CURVE.top + ' V' +
                        CURVE.bottom + ' H' + CURVE.right + '"/>';
const CURVE_KEY =
    Object.freeze({gap : 4, strip : 6, steps : 12, title : 12, ticks : 22, along : 36});
function curveKey(colour, bounded) {
  const K = CURVE_KEY, step = (CURVE.right - CURVE.left) / K.steps;
  return bounded
             ? ''
             : Array
                   .from({length : K.steps},
                         (_, k) => '<rect class="aid-curve-amount" x="' +
                                   fixed(CURVE.left + k * step) + '" y="' + (CURVE.bottom + K.gap) +
                                   '" width="' + fixed(step) + '" height="' + K.strip + '" fill="' +
                                   colour + '" fill-opacity="' + fixed((k + 1) / K.steps) + '"/>')
                   .join('');
}
const PHASE_POINTER = Object.freeze({half : 8, height : 14});
const CURVE_DIGITS = 3;
const curveNumber = value => formatNumber(
    value, Math.max(CURVE_DIGITS, value ? -Math.floor(Math.log10(Math.abs(value))) : 0));
function curveLabels({axis, scale, atFraction, x, y}, effect) {
  const unit = effect === GROWTH  ? label('axes.growth')
               : effect === BIRTH ? label('axes.birth')
                                  : tList('studio.axes.effects')[effect];
  const text = (value, x, y, anchor = 'start') => '<text class="aid-curve-label" x="' + fixed(x) +
                                                  '" y="' + fixed(y) + '" text-anchor="' + anchor +
                                                  '">' + escapeText(value) + '</text>';
  const levels = [ scale.low, ...(scale.low < 0 && scale.high > 0 ? [ 0 ] : []), scale.high ];
  return text(unit, CURVE.left, CURVE_KEY.title) +
         levels
             .map(v =>
                      text(curveNumber(v), CURVE.left - CURVE_KEY.gap, y(v) + CURVE_KEY.gap, 'end'))
             .join('') +
         [ 0, .5, 1 ]
             .map((f, i) => text(curveNumber(atFraction(f)), x(f), CURVE.bottom + CURVE_KEY.ticks,
                                 [ 'start', 'middle', 'end' ][i]))
             .join('') +
         text(axis, x(.5), CURVE.bottom + CURVE_KEY.along, 'middle');
}
export function effectCurve(state, receptor, effect, target = null) {
  const curve = receptorCurve(state, receptor, effect);
  const {bounded, axis, scale, response, atFraction, x, y} = curve;
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
  const unit = effect === GROWTH  ? label('inspector.growth')
               : effect === BIRTH ? label('development.birth')
                                  : label('effects.' + effect);
  const along = bounded ? axis : label('inspector.concentration');
  return '<svg viewBox="0 0 ' + CURVE.width + ' ' + CURVE.height + '" class="aid-response-chart"' +
         (target ? ' data-receptor-curve="' + escapeText(target) + '"' : '') + '><title>' +
         escapeText(joinParts([
           unit,
           namedText(along, t('studio.axes.range',
                              {from : curveNumber(atFraction(0)), to : curveNumber(atFraction(1))}))
         ])) +
         '</title>' + marks + curveAxes() + curveKey(substanceColor(receptor.substance), bounded) +
         curveLabels(curve, effect) + '<polyline class="aid-response-line" points="' + points +
         '"/>' + (target ? curveHandles(state, receptor, effect, target) : '') + '</svg>';
}
const PHASE_OPEN = .05;
export function phasePatch(handle, fx) {
  const m = clamp((fx * CURVE.width - CURVE.left) / (CURVE.right - CURVE.left));
  return handle === 'start' ? {start : m < PHASE_OPEN ? null : m}
                            : {end : m > 1 - PHASE_OPEN ? null : Math.max(PHASE_OPEN, m)};
}
const LIFE_ROW = Object.freeze({
  height : 230,
  y : 144,
  left : 4,
  width : 85,
  sample : 10,
  gap : 3,
  radius : 7,
  axis : 126,
  title : 10,
  above : 4
});
// Along the bottom the cell's life runs from the young fish to the grown one.
const AGE_KEY = Object.freeze({young : 9, grown : 16, y : 124});
const ageKey = () =>
    placedGlyph(GROWTH_ICON, AGE_KEY.young, {x : CURVE.left, y : AGE_KEY.y}, {line : true}) +
    placedGlyph(GROWTH_ICON, AGE_KEY.grown, {x : CURVE.right, y : AGE_KEY.y}, {line : true});
export const LIFE_EFFECTS = Object.freeze([ BIRTH, HORMONE_EFFECT.output, HORMONE_EFFECT.death ]);
const lifeKind = effect => effect === BIRTH                   ? 'birth'
                           : effect === HORMONE_EFFECT.output ? 'output'
                                                              : 'death';
const lifeReceptor = (focus, effect) => effect === BIRTH ? focus.growth : focus.receptors[effect];
export function lifePhaseEditor(state, focus, chosen = BIRTH) {
  const phase = lifePhase(focus);
  const context = previewContextOf(state);
  const profile =
      lifeResponses(state.capabilities, focus, context,
                    Array.from({length : CURVE.points + 1}, (_, i) => i / CURVE.points));
  const x = m => CURVE.left + (CURVE.right - CURVE.left) * m,
        y = v => CURVE.bottom - (CURVE.bottom - CURVE.top) * v;
  const points = profile.map(p => fixed(x(p.maturity)) + ',' + fixed(y(p.output))).join(' ');
  const birth = profile.map(p => fixed(x(p.maturity)) + ',' + fixed(y(p.birth))).join(' ');
  const dead = profile.slice(0, -1)
                   .map((p, i) => {
                     return p.dead
                                ? '<rect class="aid-death-zone" x="' + fixed(x(i / CURVE.points)) +
                                      '" y="' + CURVE.top + '" width="' +
                                      fixed((CURVE.right - CURVE.left) / CURVE.points + .1) +
                                      '" height="' + (CURVE.bottom - CURVE.top) + '"/>'
                                : '';
                   })
                   .join('');
  const mark = (handle, value, open, title) => {
    const at = fixed(x(value ?? open)), line = ' x1="' + at + '" y1="' + CURVE.top + '" x2="' + at +
                                               '" y2="' + CURVE.bottom + '"';
    const anchor = (value ?? open) < .5 ? 'start' : 'end';
    return '<g class="aid-phase-mark' + (value === null ? ' open' : '') + '" data-phase-handle="' +
           handle + '"><title>' + label(title) + '</title><line class="aid-phase-grip"' + line +
           '/><line' + line + '/><path d="M' + at + ' ' + CURVE.bottom + ' l' +
           -PHASE_POINTER.half + ' ' + -PHASE_POINTER.height + ' h' + 2 * PHASE_POINTER.half +
           ' Z"/><text class="aid-life-word" x="' + at + '" y="' +
           (CURVE.top - LIFE_ROW.above - (handle === 'end' ? 12 : 0)) + '" text-anchor="' + anchor +
           '">' + escapeText(label('development.mark.' + handle + (value === null ? 'Open' : ''))) +
           '</text></g>';
  };
  const pick = effect => ' data-development-effect="' + effect + '"' +
                         (effect === chosen ? ' aria-pressed="true"' : '');
  const name = effect => label('development.' + lifeKind(effect));
  const line = (effect, className, values) =>
      '<g class="aid-life-line"' + pick(effect) + '><title>' + name(effect) +
      '</title><polyline class="aid-life-hit" points="' + values + '"/><polyline class="' +
      className + '" points="' + values + '"/></g>';
  // A key entry: the badge of the substance the answer's receptor reads, its line and its name.
  const sample = (effect, from) => {
    const to = from + LIFE_ROW.sample, y = LIFE_ROW.y;
    return effect === HORMONE_EFFECT.death
               ? '<rect class="aid-death-zone" x="' + from + '" y="' + (y - LIFE_ROW.sample / 2) +
                     '" width="' + LIFE_ROW.sample + '" height="' + LIFE_ROW.sample + '"/>'
               : '<polyline class="' + (effect === BIRTH ? 'aid-life-birth' : 'aid-response-line') +
                     '" points="' + from + ',' + y + ' ' + to + ',' + y + '"/>';
  };
  const badge = (effect, k) => {
    const receptor = lifeReceptor(focus, effect), on = receptor?.active;
    // The badge leads its entry, so each name ends in open space before the next badge.
    const at = LIFE_ROW.left + k * LIFE_ROW.width + LIFE_ROW.radius,
          from = at + LIFE_ROW.radius + LIFE_ROW.gap;
    // A substance no gland makes yet stays an outline, as on the wheel.
    const empty = on && !substanceDefined(state, receptor.substance);
    return '<g class="aid-life-badge ' + lifeKind(effect) + (effect === chosen ? ' chosen' : '') +
           (empty ? ' empty' : '') + '"' + pick(effect) +
           (on ? ' style="--substance:' + substanceColor(receptor.substance) + '"' : '') +
           '><title>' + escapeText(joinParts([
             name(effect),
             (on ? substanceName(state, receptor.substance) : label('inspector.answersToNothing'))
           ])) +
           '</title>' + sample(effect, from) + '<text class="aid-life-name" x="' +
           (from + LIFE_ROW.sample + LIFE_ROW.gap) + '" y="' + LIFE_ROW.y + '" dy=".35em">' +
           escapeText(label('development.key.' + lifeKind(effect))) + '</text><circle cx="' +
           fixed(at) + '" cy="' + LIFE_ROW.y + '" r="' + LIFE_ROW.radius + '"/>' +
           (on ? '<text x="' + fixed(at) + '" y="' + LIFE_ROW.y +
                     '" dy=".35em" text-anchor="middle">' +
                     escapeText(substanceMark(state, receptor.substance)) + '</text>'
               : '') +
           '</g>';
  };
  // The axes: maturity along the bottom between the young and the grown fish, the answer upwards.
  const words = '<text class="aid-life-word" x="' + fixed((CURVE.left + CURVE.right) / 2) +
                '" y="' + LIFE_ROW.axis + '" text-anchor="middle">' +
                escapeText(label('inspector.maturity')) + '</text><text class="aid-life-word" ' +
                'transform="translate(' + LIFE_ROW.title + ' ' +
                fixed((CURVE.top + CURVE.bottom) / 2) + ') rotate(-90)" text-anchor="middle">' +
                escapeText(label('development.answer')) + '</text>';
  const stages =
      [ 0, CURVE.points / 2, CURVE.points ]
          .map((at, k) => {
            const p = profile[at], px = 42 + k * 88, py = 195;
            const signal =
                p.dead ? '<path class="aid-effect-cross" d="M-7-7L7 7M7-7L-7 7"/>'
                       : '<path class="aid-effect-line ghost" d="M9 0h25" stroke-width="7"/>' +
                             '<path class="aid-effect-line" d="M9 0h25" stroke-width="' +
                             fixed(7 * p.output) +
                             '"/><circle class="aid-effect-cell" r="9" fill-opacity="' +
                             fixed(p.output) + '"/>';
            return '<g transform="translate(' + px + ' ' + py + ')">' + signal +
                   '<text class="aid-life-word" y="26" text-anchor="middle">' +
                   escapeText(label('development.stage.' + k)) + '</text></g>';
          })
          .join('');
  return '<svg viewBox="0 0 ' + CURVE.width + ' ' + LIFE_ROW.height +
         '" class="aid-response-chart aid-life-picture" data-phase="' + escapeText(focus.id) +
         '" role="img" aria-label="' + label('inspector.lifePhase') + '"><title>' +
         escapeText(label('development.phaseHandles')) + '</title>' +
         '<g class="aid-life-line"' + pick(HORMONE_EFFECT.death) + '><title>' +
         name(HORMONE_EFFECT.death) + '</title>' + dead + '</g>' + curveAxes() + ageKey() + words +
         line(HORMONE_EFFECT.output, 'aid-response-line', points) +
         line(BIRTH, 'aid-life-birth', birth) +
         mark('start', phase.start, 0, 'inspector.phaseStart') +
         mark('end', phase.end, 1, 'inspector.phaseEnd') + LIFE_EFFECTS.map(badge).join('') +
         '<text class="aid-life-word" x="130" y="172" text-anchor="middle">' +
         escapeText(label('development.builtSignal')) + '</text>' + stages + '</svg>';
}
// The wheel is wide enough for the body's three signals, a sixteenth of a turn apart in their
// quarter, to stand apart.
export const WHEEL =
    Object.freeze({size : 240, height : 240, centre : 120, radius : 62, point : 10, ring : 14});
const wheelX = x => WHEEL.centre + x * WHEEL.radius, wheelY = y => WHEEL.centre - y * WHEEL.radius;
export const wheelPatch = (fx, fy) => ({
  q1 : clamp((fx * WHEEL.size - WHEEL.centre) / WHEEL.radius, -1),
  q2 : clamp((WHEEL.centre - fy * WHEEL.height) / WHEEL.radius, -1)
});
export const wheelMarks = center => pointMarks({x : wheelX(center.q1), y : wheelY(center.q2)});
export function wheelWidthPatch(wheel, profile, fx, fy) {
  const distance =
      Math.hypot(fx * WHEEL.size - wheelX(profile.x), fy * WHEEL.height - wheelY(profile.y));
  const [low, high] = wheel.sigmaRange;
  return clamp((distance / WHEEL.radius - low) / (high - low));
}
const substanceDefined = (state, index) =>
    index >= HORMONES.levels || state.document.substances.some(sub => sub.index === index);
export function substanceMark(state, index) {
  return index === BLOOD_SUBSTANCE.maturity  ? label('inspector.maturityMark')
         : index === BLOOD_SUBSTANCE.reserve ? label('inspector.reserveMark')
         : index === BLOOD_SUBSTANCE.fatigue ? label('inspector.fatigueMark')
                                             : Array.from(substanceName(state, index))[0];
}
export function substanceName(state, index) {
  const named = state.document.substances.find(sub => sub.index === index)?.name;
  return named ||
         (index === BLOOD_SUBSTANCE.maturity  ? label('inspector.maturity')
          : index === BLOOD_SUBSTANCE.reserve ? label('inspector.reserve')
          : index === BLOOD_SUBSTANCE.fatigue ? label('inspector.fatigue')
                                              : tList('studio.inspector.substanceLetters')[index]);
}
function substanceWheel(state, profile, {
  choices = [],
  attribute = '',
  extra = '',
  pad = null,
  selected = null,
  reads = Infinity,
  widthTarget = null,
  role = 'receptor'
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
    const unnamed = index < HORMONES.levels && !named.has(index);
    const bound = profile.active && index < reads
                      ? wheelAffinity(wheel, profile.x, profile.y, profile.width, index)
                      : 0;
    const open = clickable.has(index);
    return '<g class="aid-wheel-point' + (open ? '' : ' fixed') + (unnamed ? ' empty' : '') +
           (index >= HORMONES.levels ? ' body' : '') + (selected === index ? ' active' : '') + '"' +
           (open ? ' ' + attribute + '="' + index + '"' + extra : '') +
           ' style="--substance:' + substanceColor(index) + ';--bound:' + fixed(bound) +
           '"><circle cx="' + px(x) + '" cy="' + py(y) + '" r="' + WHEEL.point + '"/><text x="' +
           px(x) + '" y="' + py(y) + '" dy=".35em" text-anchor="middle">' +
           escapeText(substanceMark(state, index)) + '</text><title>' +
           escapeText(unnamed ? label('inspector.defineSubstance')
                              : joinParts([ name, percent(bound) ])) +
           '</title></g>';
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
  const norm = Math.hypot(profile.x, profile.y);
  const direction = norm > .001 ? {x : -profile.x / norm, y : -profile.y / norm} : {x : -1, y : 0};
  const radius = wheelSigma(wheel, profile.width) * WHEEL.radius;
  const handle = profile.active && attributes
                     ? '<circle class="aid-graphic-handle" ' + attributes + ' cx="' +
                           fixed(wheelX(profile.x) + direction.x * radius) + '" cy="' +
                           fixed(wheelY(profile.y) - direction.y * radius) + '" r="5"><title>' +
                           label('inspector.receptorWidth') + '</title></circle>'
                     : '';
  // The chosen substance's mark is written again above the width handle, which may cover it.
  const [mx, my] =
      Number.isInteger(selected) && selected < reads ? wheelPlace(wheel, selected) : [];
  const mark = handle && Number.isFinite(mx)
                   ? '<g class="aid-wheel-point' +
                         (selected < HORMONES.levels && !named.has(selected) ? ' empty' : '') +
                         '" style="--substance:' + substanceColor(selected) + '"><text x="' +
                         px(mx) + '" y="' + py(my) + '" dy=".35em" text-anchor="middle">' +
                         escapeText(substanceMark(state, selected)) + '</text></g>'
                   : '';
  // A gland's output is split among the substances it pours; a receptor or sense answers each
  // substance by its own fit.
  const poured = role === 'gland' && profile.active ? pouredShares(wheel, profile) : null;
  const names =
      Array
          .from({length : Math.min(reads, wheel.bloodSubstances)},
                (_, index) => {
                  if (index < HORMONES.levels && !named.has(index))
                    return '';
                  const affinity =
                      !profile.active ? 0
                      : poured        ? poured[index] ?? 0
                               : wheelAffinity(wheel, profile.x, profile.y, profile.width, index);
                  return '<span class="aid-wheel-name"><i style="--substance:' +
                         substanceColor(index) + '">' + escapeText(substanceMark(state, index)) +
                         '</i><span>' + escapeText(substanceName(state, index)) + '</span><small>' +
                         percent(affinity) + '</small></span>';
                })
          .join('');
  // The list says what the shares are: what a receptor binds, a sense reads, a gland gives off.
  const legend = '<p class="aid-wheel-names-title">' + escapeText(label('wheel.' + role)) +
                 '</p><div class="aid-wheel-names">' + names + '</div>';
  return '<div class="aid-wheel-figure" data-wheel-figure><div class="aid-wheel-map"><svg class="aid-substance-wheel"' +
         (pad ? ' data-vector-pad="' + escapeText(pad) + '" data-wheel tabindex="0"' : '') +
         ' viewBox="0 0 ' + WHEEL.size + ' ' + WHEEL.height + '" role="img" aria-label="' +
         label('inspector.hormoneProfile') + '"><circle cx="' + WHEEL.centre + '" cy="' +
         WHEEL.centre + '" r="' + WHEEL.radius + '" class="aid-wheel-ring"/>' + halo + marker +
         points.join('') + handle + mark + '</svg></div>' + legend + '</div>';
}
function receptorProfile(state, receptor) {
  const [x, y] = state.capabilities ? wheelPlace(state.capabilities, receptor.substance) : [ 0, 0 ];
  return {x, y, width : receptor.width, active : receptor.active};
}
function growthEditor(state) {
  const growth = state.document.growth;
  if (!growth.active)
    return '';
  return '<section class="aid-growth" title="' + escapeText(label('development.bodyGrowth')) +
         '"><div class="aid-wheel-close">' + receptorWheel(state, growth, GROWTH) + '</div>' +
         effectCurve(state, growth, GROWTH, GROWTH) +
         variationGraphic(growth.spread_receptors, GROWTH, 'spread_receptors',
                          receptorVariationExamples(growth, state.capabilities)) +
         '</section>';
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
                      (effect === value ? 'active' : '') + '" title="' +
                      escapeText(label('effects.' + value)) + '">' +
                      glyph(EFFECT_ICON[value], ICON.mark, {line : true}) + '<span>' +
                      escapeText(tList('studio.axes.effects')[value]) + '</span></button>')
        .join('') +
    '</div>' + receptorBody(state, center, effect);
function receptorWheel(state, receptor, target) {
  const birth = target.endsWith(':' + BIRTH), body = target === GROWTH;
  const cut = target.lastIndexOf(':'), id = target.slice(0, cut), effect = target.slice(cut + 1);
  return substanceWheel(state, receptorProfile(state, receptor), {
    choices : Array.from({length : body ? HORMONES.levels : state.capabilities.regulators},
                         (_, index) => index),
    attribute : body    ? 'data-growth-substance'
                : birth ? 'data-birth-substance'
                        : 'data-receptor-substance',
    reads : body ? HORMONES.levels : state.capabilities?.regulators,
    extra : body ? ''
                 : ' data-center-id="' + escapeText(id) + '" data-receptor-effect="' + effect + '"',
    selected : receptor.substance,
    widthTarget : target
  });
}
export function receptorBody(state, center, effect) {
  const birth = effect === BIRTH, receptor = birth ? center.growth : center.receptors[effect];
  if (!receptor)
    return '';
  const target = center.id + ':' + effect;
  const active = birth ? 'data-cell-growth-active="' + escapeText(center.id) + '"'
                       : 'data-receptor-active="' + escapeText(center.id) +
                             '" data-receptor-effect="' + effect + '"';
  const toggle = iconSwitch('receptor', receptor.active, label('inspector.receptorActive'), active);
  // A receptor that does not answer has nothing else to set until it is switched on.
  if (!receptor.active)
    return toggle;
  return toggle + '<div class="aid-receptor-picture"><div class="aid-wheel-close">' +
         receptorWheel(state, receptor, target) + '</div>' +
         (birth ? ''
                : effectScene(effect, substanceColor(receptor.substance), receptorEnds(receptor),
                              {capabilities : state.capabilities, center})) +
         variationGraphic(receptor.spread_receptors, target, 'spread_receptors',
                          receptorVariationExamples(receptor, state.capabilities)) +
         '</div>' + effectCurve(state, receptor, effect, target);
}
// How long the substance lasts in the blood, as a clock whose tooltip gives the steps.
const CLOCK_ICON = 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18';
export function hormoneTime(state, index) {
  const value = state.anatomy?.hormoneTimes?.[index];
  return '<span class="aid-hormone-time" data-hormone-time="' + index + '" title="' +
         escapeText(namedText(label('hormoneCard.timeConstant'),
                              (Number.isFinite(value)
                                   ? t('studio.hormoneCard.timeValue', {n : formatNumber(value, 1)})
                                   : formatNumber(NaN)))) +
         '">' + glyph(CLOCK_ICON, ICON.mark, {line : true}) + '<span>' +
         escapeText(namedText(label('hormoneCard.decay'),
                              Number.isFinite(value)
                                  ? t('units.steps', {n : formatNumber(value, 1)})
                                  : formatNumber(NaN))) +
         '</span></span>';
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
           (birth ? '<span class="aid-bound-effect" title="' + label('development.birthReceptor') +
                        '">' + glyph(BIRTH_ICON, ICON.mark, {line : true}) + '</span>'
                  : '') +
           [...effects ]
               .map(e => {
                 const binding = o.centers.find(c => boundEffects(c, index, wheel).includes(e));
                 return boundEffect(e, effectDirection(e, binding.receptors[e]));
               })
               .join('') +
           '</button>';
  });
  // Where the substance comes from and what it acts on, each row led by its symbol.
  const row = (key, body) =>
      body ? '<div class="aid-card-row" title="' + label('hormoneCard.' + key) + '"><span>' +
                 glyph(CARD_ROW_ICON[key], ICON.mark, {line : true}) +
                 '</span><div><span class="aid-card-name">' + label('hormoneCard.' + key) +
                 '</span>' + body + '</div></div>'
           : '';
  return '<header class="aid-inspector-head" style="--substance:' + substanceColor(index) +
         '"><span class="aid-substance-swatch"></span><input class="aid-inline-name ' +
         'aid-inline-title" data-substance-name="' + index + '" value="' +
         escapeText(substance.name) + '" placeholder="' + escapeText(fallback) + '" maxlength="' +
         SUBSTANCE_NAME_LENGTH + '" aria-label="' + label('inspector.substanceName') +
         '"></header><div class="aid-card-marks"><button class="aid-growth-mark' +
         (grows ? ' on' : '') + '" ' +
         (grows ? 'data-growth-off' : 'data-growth-substance="' + index + '"') + ' aria-pressed="' +
         grows + '" title="' + label(grows ? 'hormoneCard.growsOn' : 'hormoneCard.growsOff') +
         '">' + glyph(GROWTH_ICON, ICON.mark, {line : true}) + '</button>' +
         hormoneTime(state, index) + '</div>' + (grows ? growthEditor(state) : '') +
         row('sources', list(organsOf(doc, producers(doc, index, wheel)))) +
         row('acts', acts.join('')) + effectGuide(state, index) +
         '<button class="aid-danger" data-remove-substance="' + index + '">' +
         label('inspector.removeSubstance') + '</button>';
}
const CARD_ROW_ICON =
    Object.freeze({sources : TOOL_ICON.hormone, acts : SWITCH_SYMBOL.receptor.on});
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
  return '<section class="aid-effect-guide">' +
         EFFECT_ORDER
             .map(effect => {
               const bound = receiving.filter(c => boundEffects(c, index, wheel).includes(effect));
               const n = bound.length;
               const ends = n ? receptorEnds(bound[0].receptors[effect]) : undefined;
               const direction = n ? effectDirection(effect, bound[0].receptors[effect]) : 0;
               return '<div class="aid-effect-card' + (n ? '' : ' off') +
                      '" style="--substance:' + colour + '" title="' +
                      escapeText(effectSentence(effect, direction) + ' ' +
                                 words('tileTitles')[effect] + ' ' + words('where')[effect]) +
                      '">' +
                      effectScene(effect, colour, ends,
                                  {capabilities : state.capabilities, center : bound[0]}) +
                      '<div><strong>' + boundEffect(effect, direction) +
                      escapeText(tList('studio.axes.effects')[effect]) +
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
  const own = effectsFor(focus, state.capabilities);
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
  const choose = choices.length > 1 && isRegion(organ) && !choices.some(c => c.band)
                     ? regionNodeMap(state, organ, focus.id)
                 : choices.length > 1
                     ? '<div class="aid-center-tabs">' +
                           choices
                               .map(c => '<button data-select-center="' + escapeText(c.id) +
                                         '" class="' + (c.id === focus.id ? 'active' : '') +
                                         '" title="' + escapeText(centerTitle(c)) + '">' +
                                         (c.band ? bandGlyph(c.band) : escapeText(centerTitle(c))) +
                                         '</button>')
                               .join('') +
                           '</div>'
                     : '';
  return html + choose + cellDevelopment(state, focus) +
         '<div class="aid-receptor-editor" title="' + label('inspector.cellEffects') + '">' +
         receptorEditor(state, focus, effects, effect) + '</div>';
}

export function hormoneInspector(state) { return previewControls(state) + hormoneDetails(state); }
