import {variationGraphic} from './cell_tissue.js';
import {receptorVariationExamples} from '../model/variation.js';
import {previewContextOf, cellDevelopment} from './development.js';
import {BLOOD_SUBSTANCE, HORMONE_EFFECT, HORMONES} from '../../schema.js';
import {substanceColor} from '../../hormones.js';
import {clamp} from '../../units.js';
import {isRegion} from '../model/organs.js';
import {regionNodeMap} from './region_graph.js';
import {
  allCenters,
  centerIndex,
  boundEffects,
  bloodLevel,
  effectsFor,
  birthAffinity,
  chosenCenter,
  DEATH_RESPONSE,
  effectDirection,
  effectLevel,
  findCenter,
  findOrgan,
  organOf,
  growsWith,
  NOTICEABLE_AFFINITY,
  receivers,
  regulatorySubstances,
  receptorEnds,
  receptorAffinity,
  receptorResponse,
  SUBSTANCE_NAME_LENGTH,
  teachersOf,
  wheelAffinity,
  wheelPlace,
  wheelSigma,
  shownSubstance
} from '../model/document.js';
import {escapeText, fixed, glyph} from './markup.js';
import {formatNumber, joinParts, namedText, percent, t, tList} from '../../strings.js';
import {bandGlyph, heading, icon, ICON, iconSwitch, label} from './kit.js';
import {BIRTH_ICON, DIRECTION_ICON, EFFECT_ICON, GROWTH_ICON, TOOL_ICON} from './icons.js';
import {EFFECT_ORDER, effectScene} from './effects.js';
import {centerTitle, organTitle} from './names.js';
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
function steepProbe(k, receptor) {
  const left = k.atFraction(0), right = k.atFraction(1);
  const low = k.concentration(left), high = k.concentration(right);
  if (!(high > low))
    return null;
  for (const ratio of [STEEP_PROBE, 1 / STEEP_PROBE]) {
    const share = (receptor.half * ratio - low) / (high - low);
    if (share > 0 && share < 1)
      return left + share * (right - left);
  }
  const middle = k.atFraction(.5);
  return k.concentration(middle) === receptor.half ? null : middle;
}
// Where the answer turns and how sharply only show while it changes at all; a flat answer has
// only its two ends to drag.
const FLAT_ANSWER = .02;
function curveHandles(state, receptor, effect, target) {
  const k = receptorCurve(state, receptor, effect);
  const probe = steepProbe(k, receptor);
  const at = c => [k.x(clamp(k.fraction(c))), k.y(k.scale.value(k.response(c)))];
  const least = k.response(k.atFraction(0)), most = k.response(k.atFraction(1));
  const turns = Math.abs(most - least) > FLAT_ANSWER;
  const handles = [
    ...(effect === GROWTH ? [] : [ [ 'baseline', [ k.x(0), k.y(k.scale.value(least)) ] ] ]),
    [ 'sensitivity', [ k.x(1), k.y(k.scale.value(most)) ] ],
    ...(turns ? [ [ 'half', at(receptor.half) ] ] : []),
    ...(turns && probe !== null && (state.capabilities?.steepnessSpan ?? 0) > 0
            ? [ [ 'steepness', at(probe) ] ]
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
  const probe = steepProbe(k, receptor);
  if (probe === null)
    return null;
  const n = Math.log(share / (1 - share)) / Math.log(k.concentration(probe) / receptor.half);
  if (!Number.isFinite(n))
    return null;
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
// The wheel is wide enough for the body's three signals, a sixteenth of a turn apart in their
// quarter, to stand apart.
export const WHEEL =
    Object.freeze({size : 240, height : 240, centre : 120, radius : 62, point : 10, ring : 14});
const wheelX = x => WHEEL.centre + x * WHEEL.radius, wheelY = y => WHEEL.centre - y * WHEEL.radius;
export function wheelWidthPatch(wheel, profile, fx, fy) {
  const distance =
      Math.hypot(fx * WHEEL.size - wheelX(profile.x), fy * WHEEL.height - wheelY(profile.y));
  const [low, high] = wheel.sigmaRange;
  return clamp((distance / WHEEL.radius - low) / (high - low));
}
export function substanceMark(state, index) {
  return index === BLOOD_SUBSTANCE.maturity        ? label('inspector.maturityMark')
         : index === BLOOD_SUBSTANCE.reserve       ? label('inspector.reserveMark')
         : index === BLOOD_SUBSTANCE.fatigue       ? label('inspector.fatigueMark')
         : index === BLOOD_SUBSTANCE.cell_maturity ? label('inspector.cellMaturityMark')
                                                   : Array.from(substanceName(state, index))[0];
}
export function substanceName(state, index) {
  const named = state.document.substances.find(sub => sub.index === index)?.name;
  return named || (index === BLOOD_SUBSTANCE.maturity  ? label('inspector.maturity')
                   : index === BLOOD_SUBSTANCE.reserve ? label('inspector.reserve')
                   : index === BLOOD_SUBSTANCE.fatigue ? label('inspector.fatigue')
                   : index === BLOOD_SUBSTANCE.cell_maturity
                       ? label('inspector.cellMaturity')
                       : tList('studio.inspector.substanceLetters')[index]);
}
export function substanceWheel(state, profile, {
  choices = [],
  attribute = '',
  extra = '',
  selected = null,
  reads = Infinity,
  widthTarget = null,
  legend = true
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
  const attributes = widthTarget ? 'data-wheel-width="' + escapeText(widthTarget) + '"' : '';
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
  const names =
      Array
          .from({length : Math.min(reads, wheel.bloodSubstances)},
                (_, index) => {
                  if (index < HORMONES.levels && !named.has(index))
                    return '';
                  const affinity = profile.active ? wheelAffinity(wheel, profile.x, profile.y,
                                                                  profile.width, index)
                                                  : 0;
                  return '<span class="aid-wheel-name"><i style="--substance:' +
                         substanceColor(index) + '">' + escapeText(substanceMark(state, index)) +
                         '</i><span>' + escapeText(substanceName(state, index)) + '</span><small>' +
                         percent(affinity) + '</small></span>';
                })
          .join('');
  // The list says what the shares are: what a receptor binds, a sense reads, a gland gives off.
  const list = legend ? '<p class="aid-wheel-names-title">' + escapeText(label('wheel.receptor')) +
                            '</p><div class="aid-wheel-names">' + names + '</div>'
                      : '';
  return '<div class="aid-wheel-figure" data-wheel-figure><div class="aid-wheel-map"><svg class="aid-substance-wheel"' +
         ' viewBox="0 0 ' + WHEEL.size + ' ' + WHEEL.height + '" role="img" aria-label="' +
         label('inspector.hormoneProfile') + '"><circle cx="' + WHEEL.centre + '" cy="' +
         WHEEL.centre + '" r="' + WHEEL.radius + '" class="aid-wheel-ring"/>' + halo +
         points.join('') + handle + mark + '</svg></div>' + list + '</div>';
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
  const body = target === GROWTH;
  const cut = target.lastIndexOf(':'), id = target.slice(0, cut), effect = target.slice(cut + 1);
  return substanceWheel(state, receptorProfile(state, receptor), {
    choices : Array.from({length : body ? HORMONES.levels : state.capabilities.regulators},
                         (_, index) => index),
    attribute : body ? 'data-growth-substance' : 'data-receptor-substance',
    reads : body ? HORMONES.levels : state.capabilities?.regulators,
    extra : body ? ''
                 : ' data-center-id="' + escapeText(id) + '" data-receptor-effect="' + effect + '"',
    selected : receptor.substance,
    widthTarget : target
  });
}
export function receptorBody(state, center, effect) {
  const receptor = center.receptors[effect];
  if (!receptor)
    return '';
  const target = center.id + ':' + effect;
  const active =
      'data-receptor-active="' + escapeText(center.id) + '" data-receptor-effect="' + effect + '"';
  const toggle = iconSwitch('receptor', receptor.active, label('inspector.receptorActive'), active);
  // A receptor that does not answer has nothing else to set until it is switched on.
  if (!receptor.active)
    return toggle;
  return toggle + '<div class="aid-receptor-picture"><div class="aid-wheel-close">' +
         receptorWheel(state, receptor, target) + '</div>' +
         effectScene(effect, substanceColor(receptor.substance), receptorEnds(receptor),
                     {capabilities : state.capabilities, center}) +
         variationGraphic(receptor.spread_receptors, target, 'spread_receptors',
                          receptorVariationExamples(receptor, state.capabilities)) +
         '</div>' + effectCurve(state, receptor, effect, target);
}
// How fast the substance rises and how long it stays in the blood, as a clock whose tooltip gives
// both in steps.
const CLOCK_ICON = 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18';
export function hormoneTime(state, index) {
  const rise = state.anatomy?.hormoneTimes?.[index],
        stay = state.anatomy?.hormoneResidence?.[index];
  const known = Number.isFinite(rise) && Number.isFinite(stay);
  const steps = v => t('units.steps', {n : formatNumber(v, v < 10 ? 1 : 0)});
  return '<span class="aid-hormone-time" data-hormone-time="' + index + '" title="' +
         escapeText(namedText(label('hormoneCard.timeConstant'),
                              known
                                  ? t('studio.hormoneCard.timeValue',
                                      {rise : formatNumber(rise, 1), stay : formatNumber(stay, 0)})
                                  : formatNumber(NaN))) +
         '">' + glyph(CLOCK_ICON, ICON.mark, {line : true}) + '<span>' +
         escapeText(known ? namedText(label('hormoneCard.rise'), steps(rise)) + ' · ' +
                                namedText(label('hormoneCard.stays'), steps(stay))
                          : formatNumber(NaN)) +
         '</span></span>';
}
const BLOOD_CURVE = Object.freeze(
    {width : 280, height : 45, left : 10, right : 270, top : 4, bottom : 41, samples : 36});
const BLOOD_AXIS = Object.freeze({height : 31, y : 16, knob : 7});
function bloodAxis(index, now, span = 1) {
  const C = BLOOD_CURVE, A = BLOOD_AXIS;
  const title = escapeText(label('hormoneCard.previewBlood'));
  return '<svg class="aid-hormone-axis" viewBox="0 0 ' + C.width + ' ' + A.height +
         '" data-preview-bars aria-label="' + title + '"><path class="aid-chart-axis" d="M' +
         C.left + ' ' + A.y + 'H' + C.right + '"/><path class="aid-hormone-level-mark" d="M' +
         fixed(now) + ' ' + A.y + 'V' + A.height + '"/><circle class="aid-graphic-handle" ' +
         'data-preview-handle="' + index + '" data-level-span="' + span + '" data-level-left="' +
         C.left + '" data-level-right="' + C.right + '" cx="' + fixed(now) + '" cy="' + A.y +
         '" r="' + A.knob + '"><title>' + title + '</title></circle><text x="' + C.left + '" y="' +
         (A.height - 1) + '">0</text><text x="' + C.right + '" y="' + (A.height - 1) +
         '" text-anchor="end">' + escapeText(percent(span)) + '</text></svg>';
}
// The substance's level when its glands pour at full drive and then stop, as the engine estimates
// it (anatomy.hormoneCourse: up with the glands' cell time, down with their residence). The level
// the life band sets stands as a line.
// The span of a substance's level the hormone pictures share: a little beyond what its glands
// reach (anatomy.hormoneCourse[].span), all of it for a body signal or without a report.
const levelSpan = (state, index) => state.anatomy?.hormoneCourse?.[index]?.span ?? 1;
const COURSE =
    Object.freeze({width : 280, height : 64, left : 10, right : 270, top : 6, bottom : 50});
function levelCourse(state, index, now) {
  const course = state.anatomy?.hormoneCourse?.[index], C = COURSE;
  if (!course?.rise?.length || !course?.fall?.length)
    return '';
  // The height is what the glands reach: a few per cent are common, so the picture is scaled to
  // the peak and says it.
  const peak = Math.max(...course.rise, ...course.fall), top = levelSpan(state, index);
  const total = course.on + course.off, x = step => C.left + (C.right - C.left) * step / total,
        y = level => C.bottom - (C.bottom - C.top) * Math.min(1, level / top);
  const points = (levels, start, span) =>
      levels.map((v, i) => fixed(x(start + span * i / (levels.length - 1))) + ',' + fixed(y(v)));
  const line =
      [...points(course.rise, 0, course.on), ...points(course.fall, course.on, course.off) ];
  return '<h4>' + label('hormoneCard.level') +
         '</h4><svg class="aid-hormone-course" style="--substance:' + substanceColor(index) +
         '" viewBox="0 0 ' + C.width + ' ' + (C.height + 4) + '" aria-label="' +
         escapeText(label('hormoneCard.course')) + '">' +
         '<path class="aid-chart-axis" d="M' + C.left + ' ' + C.top + ' V' + C.bottom + ' H' +
         C.right + '"/><path class="aid-hormone-on" d="M' + C.left + ' ' + (C.bottom + 6) + ' H' +
         fixed(x(course.on)) + '"/><polygon class="aid-hormone-course-area" points="' +
         fixed(C.left) + ',' + C.bottom + ' ' + line.join(' ') + ' ' + fixed(C.right) + ',' +
         C.bottom + '"/><polyline class="aid-hormone-response" points="' + line.join(' ') +
         '"/><path class="aid-hormone-level-mark" d="M' + C.left + ' ' + fixed(y(now)) + ' H' +
         C.right + '"/><text x="' + (C.left + 4) + '" y="' + fixed(y(peak) - 3) + '">' +
         escapeText(percent(peak)) + '</text><text x="' + C.left + '" y="' + (C.height + 2) + '">' +
         escapeText(label('hormoneCard.glandOn')) + '</text><text x="' + fixed(x(total)) + '" y="' +
         (C.height + 2) + '" text-anchor="end">' +
         escapeText(t('units.steps', {n : formatNumber(total)})) + '</text></svg>';
}
// The cells that answer the substance, one row per organ and effect: the engine's response of
// the cell's receptor from none of the substance to full (anatomy.groups[].responses), and where
// the blood of the life band puts it (anatomy.groups[].effects).
function bloodCurves(state, index, context) {
  const {document : doc, capabilities : wheel} = state, C = BLOOD_CURVE;
  const span = levelSpan(state, index);
  const x = level => C.left + (C.right - C.left) * Math.min(1, level / span);
  const present = bloodLevel(context, index), now = x(present);
  const seen = new Set();
  const rows = receivers(doc, index, wheel).flatMap(cell => {
    const organ = findOrgan(doc, cell.organId), name = organTitle(organ, state.sites);
    const group = state.anatomy?.groups?.[centerIndex(doc, cell.id)];
    return boundEffects(cell, index, wheel).flatMap(effect => {
      const curve = cell.receptors[effect]?.substance === index ? group?.responses?.[effect] : null;
      const key = name + ':' + effect + ':' + (curve ?? []).join(',');
      if (seen.has(key))
        return [];
      seen.add(key);
      return [ {id : cell.id, effect, name, curve, value : group?.effects?.[effect]} ];
    });
  });
  if (!rows.length)
    return growsWith(doc, index, wheel) ? '<section class="aid-hormone-receivers">' +
                                              bloodAxis(index, now, span) + '</section>'
                                        : '';
  const words = tList('studio.axes.effects');
  return '<section class="aid-hormone-receivers" style="--substance:' + substanceColor(index) +
         '"><h4>' + label('hormoneCard.acts') + '</h4>' + bloodAxis(index, now, span) +
         rows.map(({id, effect, name, curve, value}) => {
               const scale = effect === HORMONE_EFFECT.death ? GROWTH_SCALE
                                                             : EFFECT_SCALE[effect] ?? SHARE_SCALE;
               const y = response => C.bottom - (C.bottom - C.top) *
                                                    (scale.value(response) - scale.low) /
                                                    (scale.high - scale.low);
               const drawn =
                   curve ? '<polyline class="aid-hormone-response" points="' +
                               curve
                                   .map((r, i) => fixed(x(span * i / (curve.length - 1))) + ',' +
                                                  fixed(y(r)))
                                   .join(' ') +
                               '"/>' +
                               (Number.isFinite(value)
                                    ? '<circle class="aid-hormone-point" cx="' + fixed(now) +
                                          '" cy="' + fixed(y(value)) + '" r="3"/>'
                                    : '')
                         : '';
               return '<button data-select-center="' + escapeText(id) + '" data-select-effect="' +
                      effect + '"><span class="aid-hormone-receiver-heading"><span>' +
                      escapeText(name) + '</span>' + boundEffect(effect, 0) + '<small>' +
                      escapeText(words[effect]) + '</small></span><svg viewBox="0 0 ' + C.width +
                      ' ' + C.height + '" aria-hidden="true"><path class="aid-chart-axis" d="M' +
                      C.left + ' ' + C.top + ' V' + C.bottom + ' H' + C.right + '"/>' + drawn +
                      '<path class="aid-hormone-level-mark" d="M' + fixed(now) + ' ' + C.top +
                      ' V' + C.bottom + '"/></svg></button>';
             })
             .join('') +
         '</section>';
}
// The glands that pour the substance, one row per organ: how much of the level it raises when all
// pour at full drive (its share of anatomy.hormoneSources times the peak of anatomy.hormoneCourse).
function substanceSources(state, index) {
  const {document : doc} = state, cells = allCenters(doc), byOrgan = new Map();
  for (const row of state.anatomy?.hormoneSources ?? []) {
    const center = cells[row[0]], amount = row[1 + index];
    if (center?.organType === 'gland' && amount > 0)
      byOrgan.set(center.organId, amount + (byOrgan.get(center.organId) ?? 0));
  }
  const total = [...byOrgan.values() ].reduce((sum, n) => sum + n, 0);
  if (!(total > 0))
    return '';
  const course = state.anatomy?.hormoneCourse?.[index];
  const peak = course?.rise?.length ? Math.max(...course.rise) : NaN;
  return '<section class="aid-hormone-sources" style="--substance:' + substanceColor(index) +
         '"><h4>' + label('hormoneCard.sources') + '</h4>' +
         [...byOrgan ]
             .map(([ id, amount ]) => {
               const share = amount / total;
               return '<a class="aid-hormone-source" href="#aid-body-map" data-source-gland="' +
                      escapeText(id) + '"><span>' +
                      escapeText(organTitle(findOrgan(doc, id), state.sites)) +
                      '</span><i style="--share:' + fixed(share) + '"></i><output>' +
                      escapeText(Number.isFinite(peak) ? percent(share * peak) : percent(share)) +
                      '</output></a>';
             })
             .join('') +
         '</section>';
}
function substanceInspector(state, currentAnatomy) {
  const {document : doc, capabilities : wheel} = state;
  const substance = shownSubstance(doc, state.focusSubstance, wheel);
  if (!substance)
    return '<header class="aid-inspector-head">' + heading(label('hormoneCard.title')) +
           '</header><button class="aid-secondary" data-add-substance>' +
           label('sections.newSubstance') + '</button>';
  const index = substance.index, grows = growsWith(doc, index, wheel);
  const fallback = substanceName(state, index);
  const context = previewContextOf(state);
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
         '</div>' + (currentAnatomy ? substanceSources(state, index) : '') +
         levelCourse(state, index, bloodLevel(context, index)) +
         bloodCurves(state, index, context) + (grows ? growthEditor(state) : '') +
         (substance.id ? '<button class="aid-danger" data-remove-substance="' + index + '">' +
                             label('inspector.removeSubstance') + '</button>'
                       : '');
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
function hormoneDetails(state, focus) {
  const {document : doc} = state;
  const html = '<header class="aid-inspector-head"><span>' + label('sections.receptors') +
               '</span>' + heading(centerTitle(focus)) + '</header>';
  const own = effectsFor(focus, state.capabilities);
  const effects = EFFECT_ORDER.filter(e => own.includes(e));
  const effect =
      state.effect === BIRTH || effects.includes(state.effect) ? state.effect : effects[0];
  if (effect !== BIRTH && !focus.receptors?.[effect])
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
  if (effect === BIRTH)
    return html + choose + effectCurve(state, focus.growth, BIRTH, focus.id + ':' + BIRTH) +
           cellDevelopment(state, focus);
  return html + choose + cellDevelopment(state, focus) +
         '<div class="aid-receptor-editor" title="' + label('inspector.cellEffects') + '">' +
         receptorEditor(state, focus, effects, effect) + '</div>';
}

export function hormoneInspector(state, currentAnatomy) {
  const focus = chosenCenter(state.document, state.selected, state.visionProfile);
  const back = '<button class="aid-secondary" data-hormone-overview>' + label('hormoneCard.title') +
               '</button>';
  return focus && state.capabilities ? back + hormoneDetails(state, focus)
                                     : substanceInspector(state, currentAnatomy);
}
