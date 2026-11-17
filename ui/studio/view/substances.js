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
// gland's and the life picture already. `tools`: the tools the buttons lead to.
export function chemistry(state, organ, center, tools = [ 'hormone', 'learn' ]) {
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
         '<div class="aid-button-group">' +
         (tools.includes('hormone') ? open('hormone', 'inspector.editHormones') : '') +
         (tools.includes('learn') && center.role === 'nerve' ? open('learn', 'inspector.editLearning')
                                                             : '') +
         '</div></section>';
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
export const GROWTH = 'growth';
export const BIRTH = 'birth';
const CURVE_DIGITS = 3;
const curveNumber = value => formatNumber(
    value, Math.max(CURVE_DIGITS, value ? -Math.floor(Math.log10(Math.abs(value))) : 0));
// A receptor's answer as the engine computes it (anatomy.groups[].responses): over its substance
// from none to the span the hormone pictures share, the rest of the blood as the life band sets
// it, with the point where the life band's blood puts it (anatomy.groups[].effects). The square
// grips move the plan's values by how far they are dragged (receptorGripPatch); the curve that
// follows is the engine's again.
const RECEPTOR = Object.freeze({
  width : 260,
  height : 150,
  left : 36,
  right : 250,
  top : 26,
  bottom : 112,
  grip : 9,
  flat : .02,
  steepDrag : 60
});
function engineAnswer(state, centerId, effect) {
  const doc = state.document, body = effect === GROWTH;
  const found = body ? null : findCenter(doc, centerId);
  const report = state.outlinePreview ?? state.anatomy;
  const group = found ? report?.groups?.[centerIndex(doc, centerId)] : null;
  // The birth receptor's answer, clamped to 0…1, is how fast the cell forms; the body's growth
  // receptor allows growth from 0 to 1 (anatomy.growthResponse).
  const birth = effect === BIRTH;
  const receptor = body    ? doc.growth
                   : birth ? found?.center.growth
                           : found?.center.receptors?.[effect];
  const span =
      receptor && receptor.substance < HORMONES.levels ? levelSpan(state, receptor.substance) : 1;
  const scale = body || birth || effect === HORMONE_EFFECT.death
                    ? GROWTH_SCALE
                    : EFFECT_SCALE[effect] ?? SHARE_SCALE;
  const curve = (body    ? report?.growthResponse
                 : birth ? group?.birthResponse
                         : group?.responses?.[effect]) ??
                null;
  const at = receptor && curve
                 ? clamp(bloodLevel(previewContextOf(state), receptor.substance) / span) *
                       (curve.length - 1)
                 : NaN;
  const R = RECEPTOR;
  return {
    receptor,
    curve,
    now : body || birth ? curve?.[Math.round(at)] : group?.effects?.[effect],
    span,
    scale,
    x : level => R.left + (R.right - R.left) * clamp(level / span),
    y : response => R.bottom - (R.bottom - R.top) * (scale.value(response) - scale.low) /
                                   (scale.high - scale.low)
  };
}
// Where along the curve it has gone `share` of the way from its start to its end.
function crossing(curve, share) {
  const start = curve[0], end = curve[curve.length - 1], aim = start + (end - start) * share;
  for (let i = 1; i < curve.length; ++i) {
    const a = curve[i - 1], b = curve[i];
    if ((a - aim) * (b - aim) <= 0 && a !== b)
      return (i - 1 + (aim - a) / (b - a)) / (curve.length - 1);
  }
  return null;
}
function engineGrips(state, answer, effect) {
  const {curve, span, x, y} = answer, R = RECEPTOR;
  const first = curve[0], last = curve[curve.length - 1], turns = Math.abs(last - first) > R.flat;
  const along = f => [x(f * span), y(curve[Math.round(f * (curve.length - 1))])];
  const half = turns ? crossing(curve, .5) : null, steep = turns ? crossing(curve, .25) : null;
  return [
    ...(effect === GROWTH ? [] : [ [ 'baseline', [ x(0), y(first) ] ] ]),
    [ 'sensitivity', [ x(span), y(last) ] ],
    ...(half === null ? [] : [ [ 'half', [ x(half * span), y((first + last) / 2) ] ] ]),
    ...(steep === null || !((state.capabilities?.steepnessSpan ?? 0) > 0)
            ? []
            : [ [ 'steepness', [ x(steep * span), y(first + (last - first) / 4) ] ] ])
  ].map(([ key, [ gx, gy ] ]) => '<rect class="aid-receptor-grip curve-' + key +
                                 '" data-curve-handle="' + key + '" data-grip-x="' + fixed(gx) +
                                 '" data-grip-y="' + fixed(gy) + '" x="' + fixed(gx - R.grip / 2) +
                                 '" y="' + fixed(gy - R.grip / 2) + '" width="' + R.grip +
                                 '" height="' + R.grip + '" rx="2"><title>' +
                                 escapeText(label('inspector.curve.' + key)) + '</title></rect>');
}
// A grip moved from (x0, y0) to (x, y) in the picture's units: the receptor values it sets.
export function receptorGripPatch(state, centerId, effect, handle, start, to) {
  const answer = engineAnswer(state, centerId, effect), receptor = answer.receptor, R = RECEPTOR;
  if (!receptor)
    return null;
  const {scale} = answer;
  const shift = (start.y - to.y) / (R.bottom - R.top) * (scale.high - scale.low);
  const delta = scale.response(scale.low + shift) - scale.response(scale.low);
  const span = state.capabilities?.sensitivitySpan ?? 1;
  if (handle === 'baseline')
    return {baseline : clamp(start.receptor.baseline + delta, -1)};
  // The grip moves the value by how far it is dragged; the curve that follows is the engine's.
  if (handle === 'sensitivity')
    return {sensitivity : Math.max(-span, Math.min(span, start.receptor.sensitivity + delta))};
  if (handle === 'half') {
    const [low, high] = state.capabilities?.halfRange ?? [ 0, Infinity ];
    const from = Math.max(1, start.x - R.left), now = Math.max(1, to.x - R.left);
    return {half : Math.max(low, Math.min(high, start.receptor.half * now / from))};
  }
  if (handle === 'steepness')
    return {
      steepness : Math.max(0, Math.min(state.capabilities?.steepnessSpan ?? 0,
                                       start.receptor.steepness + (start.y - to.y) / R.steepDrag))
    };
  return null;
}
export function effectCurve(state, receptor, effect, target = null) {
  const centerId = target && effect !== GROWTH ? target.slice(0, target.lastIndexOf(':')) : null;
  const answer = target ? engineAnswer(state, centerId, effect) : null, R = RECEPTOR;
  const words = tList('studio.axes.effects');
  const name = effect === GROWTH  ? label('inspector.growth')
               : effect === BIRTH ? label('development.birth')
                                  : words[effect];
  const text = (value, x, y, anchor = 'start') => '<text class="aid-curve-label" x="' + fixed(x) +
                                                  '" y="' + fixed(y) + '" text-anchor="' + anchor +
                                                  '">' + escapeText(value) + '</text>';
  const scale = answer?.scale ??
                (effect === BIRTH || effect === GROWTH ? GROWTH_SCALE : EFFECT_SCALE[effect]) ??
                SHARE_SCALE;
  const y = answer?.y ?? (() => R.bottom);
  const levels = [ scale.low, ...(scale.low < 0 && scale.high > 0 ? [ 0 ] : []), scale.high ];
  let body =
      '<path class="aid-chart-axis" d="M' + R.left + ' ' + R.top + ' V' + R.bottom + ' H' +
      R.right + '"/>' + text(name, R.left, 12) +
      levels.map(v => text(curveNumber(v), R.left - 4, y(scale.response(v)) + 4, 'end')).join('');
  if (scale.low < 0 && scale.high > 0)
    body +=
        '<path class="aid-chart-zero" d="M' + R.left + ' ' + fixed(y(0)) + ' H' + R.right + '"/>';
  // The axis stands before the engine has answered; the curve comes with the answer.
  const span = answer?.span ?? 1;
  body += text('0', R.left, R.bottom + 16) + text(percent(span), R.right, R.bottom + 16, 'end') +
          text(substanceName(state, receptor.substance), (R.left + R.right) / 2, R.bottom + 30,
               'middle');
  if (answer?.curve) {
    const {curve, x, now} = answer;
    body +=
        '<polyline class="aid-response-line" points="' +
        curve.map((r, i) => fixed(x(span * i / (curve.length - 1))) + ',' + fixed(y(r))).join(' ') +
        '"/>' +
        (Number.isFinite(now)
             ? '<circle class="aid-hormone-point" cx="' +
                   fixed(x(bloodLevel(previewContextOf(state), receptor.substance))) + '" cy="' +
                   fixed(y(now)) + '" r="3.5"/>'
             : '') +
        (target ? engineGrips(state, answer, effect).join('') : '');
  }
  return '<svg viewBox="0 0 ' + R.width + ' ' + R.height + '" class="aid-response-chart"' +
         (target ? ' data-receptor-curve="' + escapeText(target) + '"' : '') + '>' + body +
         '</svg>';
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
  // The answer first, because it is what the receptor does; then which substances it reads and
  // what the answer does to the cell.
  return toggle + effectCurve(state, receptor, effect, target) +
         '<div class="aid-receptor-picture"><div class="aid-wheel-close">' +
         receptorWheel(state, receptor, target) + '</div>' +
         effectScene(effect, substanceColor(receptor.substance), receptorEnds(receptor),
                     {capabilities : state.capabilities, center}) +
         variationGraphic(receptor.spread_receptors, target, 'spread_receptors',
                          receptorVariationExamples(receptor, state.capabilities)) +
         '</div>';
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
         escapeText(label('hormoneCard.glandOn')) + '</text></svg>';
}
// The cells that answer the substance, one row per organ and effect: an arrow along the effect's
// scale from the cell's answer without the substance to its answer at the span's end (the engine's
// curve, anatomy.groups[].responses), and a dot where the life band's blood puts it now. The
// curve itself, with its grips, is at the cell.
const ANSWER = Object.freeze({width : 120, height : 18, left : 6, right : 114, y : 9, head : 4});
function bloodCurves(state, index, context) {
  const {document : doc, capabilities : wheel} = state, A = ANSWER;
  const span = levelSpan(state, index), present = bloodLevel(context, index);
  const seen = new Map();
  const rows = receivers(doc, index, wheel).flatMap(cell => {
    const organ = findOrgan(doc, cell.organId), name = organTitle(organ, state.sites);
    const group = (state.outlinePreview ?? state.anatomy)?.groups?.[centerIndex(doc, cell.id)];
    const births = birthAffinity(cell, index, wheel) >= NOTICEABLE_AFFINITY ? [ BIRTH ] : [];
    return [...boundEffects(cell, index, wheel), ...births ].flatMap(effect => {
      const birth = effect === BIRTH, receptor = birth ? cell.growth : cell.receptors[effect];
      const curve = receptor?.substance !== index ? null
                    : birth                       ? group?.birthResponse
                                                  : group?.responses?.[effect];
      // Cells that answer the same way share one row; their organs stand side by side in it.
      const key = effect + ':' + (curve ?? []).map(v => v.toFixed(3)).join(',');
      const row = seen.get(key);
      if (row) {
        if (!row.targets.has(name))
          row.targets.set(name, cell.id);
        return [];
      }
      const fresh = {effect, targets : new Map([[ name, cell.id ]]), curve};
      seen.set(key, fresh);
      return [ fresh ];
    });
  });
  if (!rows.length)
    return '';
  const words = tList('studio.axes.effects');
  return '<section class="aid-hormone-receivers" style="--substance:' + substanceColor(index) +
         '"><h4>' + label('hormoneCard.acts') + '</h4>' +
         rows.map(({effect, targets, curve}) => {
               const birth = effect === BIRTH;
               const scale = birth || effect === HORMONE_EFFECT.death
                                 ? GROWTH_SCALE
                                 : EFFECT_SCALE[effect] ?? SHARE_SCALE;
               const x = r => A.left + (A.right - A.left) * (scale.value(r) - scale.low) /
                                           (scale.high - scale.low);
               let answer = '';
               if (curve) {
                 const from = x(curve[0]), to = x(curve[curve.length - 1]);
                 const now = curve[Math.round(clamp(present / span) * (curve.length - 1))];
                 const tip = Math.sign(to - from) * A.head;
                 answer = '<svg class="aid-hormone-answer" viewBox="0 0 ' + A.width + ' ' +
                          A.height + '" aria-hidden="true"><path class="aid-chart-axis" d="M' +
                          A.left + ' ' + A.y + ' H' + A.right + '"/>' +
                          (scale.low < 0 ? '<path class="aid-chart-zero" d="M' + fixed(x(0)) + ' ' +
                                               (A.y - 5) + ' V' + (A.y + 5) + '"/>'
                                         : '') +
                          '<path class="aid-hormone-arrow" d="M' + fixed(from) + ' ' + A.y + ' H' +
                          fixed(to) +
                          (tip ? ' M' + fixed(to - tip) + ' ' + (A.y - A.head) + ' L' + fixed(to) +
                                     ' ' + A.y + ' L' + fixed(to - tip) + ' ' + (A.y + A.head)
                               : '') +
                          '"/><circle class="aid-hormone-point" cx="' + fixed(x(now)) + '" cy="' +
                          A.y + '" r="3"/></svg>';
               }
               const names = [...targets].map(([name, id]) =>
                   '<button type="button" data-select-center="' + escapeText(id) +
                   '" data-select-effect="' + effect + '">' + escapeText(name) + '</button>');
               return '<div class="aid-hormone-row"><span class="aid-hormone-targets">' +
                      names.join('<span aria-hidden="true"> · </span>') + '</span>' +
                      (birth ? glyph(BIRTH_ICON, ICON.mark, {line : true})
                             : boundEffect(effect, 0)) +
                      '<small>' +
                      escapeText(birth ? label('hormoneCard.birthTile') : words[effect]) +
                      '</small>' + answer + '</div>';
             })
             .join('') +
         '</section>';
}
// The glands that pour the substance, one row per organ (left and right as one): its share of
// what all glands pour at full drive (anatomy.hormoneSources), as the bar's length.
function substanceSources(state, index) {
  const {document : doc} = state, cells = allCenters(doc), byName = new Map();
  for (const row of state.anatomy?.hormoneSources ?? []) {
    const center = cells[row[0]], amount = row[1 + index];
    if (center?.organType !== 'gland' || !(amount > 0))
      continue;
    const name = organTitle(findOrgan(doc, center.organId), state.sites);
    const known = byName.get(name) ?? {id : center.organId, amount : 0};
    byName.set(name, {...known, amount : known.amount + amount});
  }
  const total = [...byName.values() ].reduce((sum, n) => sum + n.amount, 0);
  if (!(total > 0))
    return '';
  return '<section class="aid-hormone-sources" style="--substance:' + substanceColor(index) +
         '"><h4>' + label('hormoneCard.sources') + '</h4>' +
         [...byName ]
             .map(([ name, {id, amount} ]) =>
                      '<a class="aid-hormone-source" href="#aid-body-map" data-source-gland="' +
                      escapeText(id) + '"><span>' + escapeText(name) +
                      '</span><i style="--share:' + fixed(amount / total) + '"></i></a>')
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
