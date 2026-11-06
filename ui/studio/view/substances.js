import {HORMONE_EFFECT, HORMONES} from '../../schema.js';
import {substanceColor} from '../../hormones.js';
import {clamp} from '../../units.js';
import {isRegion, ROLE} from '../model/organs.js';
import {
  boundEffects,
  chosenCenter,
  findCenter,
  growsWith,
  lifePhase,
  NOTICEABLE_AFFINITY,
  organTypes,
  producers,
  receivers,
  SUBSTANCE_NAME_LENGTH,
  substanceRead,
  teachersOf,
  typeOfCenter,
  wheelAffinity,
  wheelPlace,
  wheelSigma
} from '../model/document.js';
import {escapeText, fixed, glyph, pointMarks, trackShare, widthTrack} from './markup.js';
import {formatNumber, formatSigned, joinParts, percent, t, tList} from '../../strings.js';
import {heading, icon, ICON, label} from './kit.js';
import {EFFECT_ICON} from './icons.js';
import {centerTitle, organTitle} from './names.js';
import {typeChips} from './types.js';
import {builtAsDrawn} from './stimulus.js';

// The blood's substances in the inspector: the substance wheel where glands release and senses
// read them, receptors' response curves and life phases, the hormone inspector and measurements.

// A center's own point on the substance wheel, among the substances it may choose (of which the
// engine reads the first `reads`, all if not given).
const centerWheel = (state, center, choices, reads) =>
    substanceWheel(state, {x : center.q1, y : center.q2, width : center.qwidth, active : true}, {
      choices,
      reads,
      attribute : 'data-wheel-substance',
      extra : ' data-center-id="' + escapeText(center.id) + '"',
      pad : center.id
    });
// Glands release, and the blood sense reads, the substances near a free point on the wheel.
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
// The blood sense: a chip for each substance it reads (its type), marked by a dot of RADIUS in
// the substance's colour, and the chosen one's point on the wheel.
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
// What substances do to the chosen cell group: what a gland releases, what the group's
// receptors answer to and, for nerve cells, which substances teach them. Each list opens the tool
// that edits it, with this group chosen.
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
  rows += row('inspector.answersTo',
              doc.substances.flatMap(
                  sub => boundEffects(center, sub.index, wheel)
                             .map(effect => chip(sub.index) + '<small class="aid-bound-effect">' +
                                            label('effects.' + effect) + '</small>')),
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
// The engine's binding (colony-core/field/hormones.hh): x^n / (x^n + 1), x = c / K, n =
// 2^steepness.
function bound(receptor, c) {
  let x = c / receptor.half;
  for (let k = 0; k < receptor.steepness; ++k)
    x *= x;
  return x / (1 + x);
}
// The receptor's response R, and what each effect makes of it (colony-core/field/substrate.cc):
// output, competition, trace and rhythm scale by (1 + R) / 2, learning by 1 + R, excitation
// adds R, death strikes above DEATH_RESPONSE. Growth is the bound share without baseline.
const DEATH_RESPONSE = .5;
const EFFECT_SCALE = Object.freeze({
  [HORMONE_EFFECT.excitation] : {low : -1, high : 1, value : r => r, response : v => v},
  [HORMONE_EFFECT.learning] : {low : 0, high : 2, value : r => 1 + r, response : v => v - 1},
  [HORMONE_EFFECT.death] : {low : -1, high : 1, value : r => r, response : v => v}
});
const SHARE_SCALE =
    Object.freeze({low : 0, high : 1, value : r => (1 + r) / 2, response : v => 2 * v - 1});
const GROWTH_SCALE =
    Object.freeze({low : 0, high : 1, value : r => Math.max(0, r), response : v => v});
// A receptor's curve as the engine binds: its scale, its concentration axis (log over the
// engine's half range, or maturity from 0 to 1) and its response at a concentration.
function receptorCurve(state, receptor, effect) {
  const maturity = receptor.substance === HORMONES.levels && effect !== GROWTH;
  const [halfMin, halfMax] = state.capabilities?.halfRange ?? [ receptor.half, receptor.half ];
  const scale = effect === GROWTH ? GROWTH_SCALE : EFFECT_SCALE[effect] ?? SHARE_SCALE;
  const response = (c, r = receptor) => effect === GROWTH
                                            ? Math.min(1, r.sensitivity * bound(r, c))
                                            : clamp(r.baseline + r.sensitivity * bound(r, c), -1);
  const atFraction = f => maturity ? f : halfMin * Math.pow(halfMax / halfMin, f);
  const fraction = c => maturity ? c : Math.log(c / halfMin) / Math.log(halfMax / halfMin);
  const x = f => CURVE.left + (CURVE.right - CURVE.left) * f;
  const y = v =>
      CURVE.bottom - (CURVE.bottom - CURVE.top) * (v - scale.low) / (scale.high - scale.low);
  return {maturity, halfMin, halfMax, scale, response, atFraction, fraction, x, y};
}
// The receptor's handles: its level without the substance (baseline), with plenty of it
// (sensitivity), the concentration of half binding, and the binding's steepness one doubling
// past it.
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
// A pointer at (fx, fy), fractions of the curve graphic, as a change of the receptor.
export function receptorCurvePatch(state, receptor, effect, handle, fx, fy) {
  const k = receptorCurve(state, receptor, effect), span = state.capabilities?.sensitivitySpan ?? 1;
  const px = fx * CURVE.width, py = fy * CURVE.height;
  const v =
      k.scale.low + (CURVE.bottom - py) / (CURVE.bottom - CURVE.top) * (k.scale.high - k.scale.low);
  const r = clamp(k.scale.response(v), -1);
  const clampSpan = value => Math.max(-span, Math.min(span, value));
  if (handle === 'baseline')
    return {baseline : r};
  if (handle === 'sensitivity') {
    const full = bound(receptor, k.atFraction(1)), base = effect === GROWTH ? 0 : receptor.baseline;
    return full > 0 ? {sensitivity : clampSpan((r - base) / full)} : null;
  }
  const f = clamp((px - CURVE.left) / (CURVE.right - CURVE.left));
  if (handle === 'half')
    return {half : Math.max(k.halfMin, Math.min(k.halfMax, k.atFraction(f)))};
  const base = effect === GROWTH ? 0 : receptor.baseline;
  const share = receptor.sensitivity ? (r - base) / receptor.sensitivity : 0;
  if (!(share > 0 && share < 1))
    return null;
  // bound at STEEP_PROBE times the half is p^n / (p^n + 1), n = 2^steepness.
  const n = Math.log(share / (1 - share)) / Math.log(STEEP_PROBE);
  return {
    steepness : Math.max(
        0, Math.min(state.capabilities?.steepnessSteps ?? 0, Math.round(Math.log2(Math.max(1, n)))))
  };
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
// A response chart's axes and their marks: the response's top and bottom (HIGH, LOW) left of
// its axis, the other axis's ends (FROM, TO) and name (ALONG) below it, what rises (UP) at the
// top inside it. Marks stand GAP from the axes, the names BELOW under them, UP TITLE down.
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
// A life phase's marks point onto the axis with a triangle HALF wide each way and HEIGHT high.
const PHASE_POINTER = Object.freeze({half : 8, height : 14});
// A chart's numbers show at most CURVE_DIGITS decimals.
const CURVE_DIGITS = 3;
export function effectCurve(state, receptor, effect, target = null) {
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
// A cell's life phase on the maturity axis: its output over maturity and, past its end, the
// permanent death (lifePhase in model/document.js). Two marks on the axis set where it starts
// working and where it dies; a mark moved within PHASE_OPEN of its end of the axis leaves that
// side open.
const PHASE_OPEN = .05;
export function phasePatch(handle, fx) {
  const m = clamp((fx * CURVE.width - CURVE.left) / (CURVE.right - CURVE.left));
  return handle === 'start' ? {start : m < PHASE_OPEN ? null : m}
                            : {end : m > 1 - PHASE_OPEN ? null : Math.max(PHASE_OPEN, m)};
}
// How much of a substance a measurement doses: a share from none to all, set in MEASURE_STEP. It
// measures the fish built as drawn only, so without one its dose and button wait.
const MEASURE_STEP = .01;
export const measureReading = level => percent(level);
// Measured organ drives that changed by more than MEASURE_SHOWN, at most MEASURE_ROWS of them.
const MEASURE_SHOWN = .005, MEASURE_ROWS = 6;
export function measurement(state, index) {
  const waiting = builtAsDrawn(state) ? '' : ' disabled';
  let html = '<div class="aid-measure"><span class="aid-measure-title">' +
             label('hormoneCard.probe') + '</span><div class="aid-measure-dose">' +
             '<label class="aid-dial"><span>' + label('inspector.measureLevel') +
             '</span><input type="range" data-measure-level min="0" max="1" step="' + MEASURE_STEP +
             '" value="' + fixed(state.measureLevel) + '"' + waiting + '/><output>' +
             measureReading(state.measureLevel) + '</output></label>' +
             '<button class="aid-secondary" data-measure' + waiting + '>' +
             label('inspector.measure') + '</button></div>';
  const m = state.measurement;
  if (!m || m.substance !== index)
    return html + '</div>';
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
  return html + '</div>';
}
function lifePhaseEditor(state, focus) {
  const phase = lifePhase(focus), output = focus.receptors[HORMONE_EFFECT.output];
  // Output share over maturity; an output receptor on a hormone shows its share without hormone.
  const onMaturity = output.substance === HORMONES.levels;
  const level = m => {
    if (phase.end !== null && m > phase.end)
      return 0;
    const c = onMaturity ? m : 0;
    const r =
        output.active ? clamp(output.baseline + output.sensitivity * bound(output, c), -1) : 1;
    return (1 + r) / 2;
  };
  const x = m => CURVE.left + (CURVE.right - CURVE.left) * m,
        y = v => CURVE.bottom - (CURVE.bottom - CURVE.top) * v;
  const points = Array.from({length : CURVE.points + 1}, (_, i) => i / CURVE.points)
                     .map(m => fixed(x(m)) + ',' + fixed(y(level(m))))
                     .join(' ');
  const dead = phase.end === null
                   ? ''
                   : '<rect class="aid-death-zone" x="' + fixed(x(phase.end)) + '" y="' +
                         CURVE.top + '" width="' + fixed(CURVE.right - x(phase.end)) +
                         '" height="' + (CURVE.bottom - CURVE.top) + '"/>';
  // A mark: a line across the chart to grab, a pointer onto the axis.
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
         '<svg viewBox="0 0 ' + CURVE.width + ' ' + CURVE.height +
         '" class="aid-response-chart" data-phase="' + escapeText(focus.id) + '">' + dead +
         curveAxes() + '<polyline class="aid-response-line" points="' + points + '"/>' +
         curveMarks({
           high : percent(1),
           low : formatNumber(0),
           from : formatNumber(0),
           to : formatNumber(1),
           along : label('inspector.maturity'),
           up : label('effects.' + HORMONE_EFFECT.output)
         }) +
         mark('start', phase.start, 0, 'inspector.phaseStart') +
         mark('end', phase.end, 1, 'inspector.phaseEnd') + '</svg>' +
         '<div class="aid-range-hints"><span>' + label('inspector.phaseStart') + '</span><span>' +
         label('inspector.phaseEnd') + '</span></div></section>';
}
// The substance wheel shared by glands, the blood sense and receptors (wheelPlace in
// model/document.js): a profile binds the blood substances near its point with a halo of width
// sigma, and each substance's fill shows how strongly. Substances in `choices` can be clicked to
// set `attribute`; with `pad` (a center id) the profile point can be dragged anywhere. A profile
// reads only the first `reads` substances: growth and glands the hormones, receptors maturity too.
// Under the wheel a track sets the width, from binding one substance to many, so no handle lies on
// the substances' marks.
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
// Where a point (x, y from -1 to 1) lies on the wheel. A pad wheel's profile is active, so it
// always shows its track and is HEIGHT high: the pointer (fractions of the wheel) sets its point.
const wheelX = x => WHEEL.centre + x * WHEEL.radius, wheelY = y => WHEEL.centre - y * WHEEL.radius;
export const wheelPatch = (fx, fy) => ({
  q1 : clamp((fx * WHEEL.size - WHEEL.centre) / WHEEL.radius, -1),
  q2 : clamp((WHEEL.centre - fy * WHEEL.height) / WHEEL.radius, -1)
});
export const wheelMarks = center => pointMarks({x : wheelX(center.q1), y : wheelY(center.q2)});
// The width at a fraction of the wheel's width along its track.
export const wheelTrackWidth = fx => trackShare(fx * WHEEL.size, WHEEL.track);
// The wheel marks a substance with the first letter of its name, maturity and reserve with their
// own marks.
function substanceMark(state, index) {
  return index === HORMONES.levels       ? label('inspector.maturityMark')
         : index === HORMONES.levels + 1 ? label('inspector.reserveMark')
                                         : substanceName(state, index).slice(0, 1);
}
export function substanceName(state, index) {
  const named = state.document.substances.find(sub => sub.index === index)?.name;
  return named ||
         (index === HORMONES.levels       ? label('inspector.maturity')
          : index === HORMONES.levels + 1 ? label('inspector.reserve')
                                          : tList('studio.inspector.substanceLetters')[index]);
}
export function substanceWheel(state, profile, {
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
  // The design's substances and the body's signals the profile can read show as points; a
  // substance the design has not made yet is an empty point in its colour with a question mark,
  // which makes it and opens it in the hormone tool.
  const named = new Set(state.document.substances.map(sub => sub.index));
  const points = Array.from({length : wheel.bloodSubstances}, (_, index) => {
    if (index >= reads)
      return '';
    const [x, y] = wheelPlace(wheel, index), name = substanceName(state, index);
    if (index < HORMONES.levels && !named.has(index))
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
// A receptor's profile on the wheel: its substance's point and its width.
export function receptorProfile(state, receptor) {
  const [x, y] = state.capabilities ? wheelPlace(state.capabilities, receptor.substance) : [ 0, 0 ];
  return {x, y, width : receptor.width, active : receptor.active};
}
// The body's growth: how much the fish may grow at each level of the substance it grows with
// (its card in the library carries the fish mark); nothing while it grows with none.
function growthEditor(state) {
  const {document : doc} = state, growth = doc.growth;
  if (!growth.active || !doc.substances.some(sub => sub.index === growth.substance))
    return '';
  return '<section class="aid-growth">' +
         heading(
             t('studio.hormoneCard.growthWith', {name : substanceName(state, growth.substance)})) +
         effectCurve(state, growth, GROWTH, GROWTH) + '</section>';
}
// The organs of some centers, a pair of organs once.
export function organsOf(doc, centers) {
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
// A center's receptor for one of `effects` (each named by `name`): chips to choose the effect, its
// response curve, whether it is active and the substance it binds.
export function receptorEditor(state, center, effects, effect, name) {
  const receptor = center.receptors[effect], target = center.id + ':' + effect;
  return '<div class="aid-effect-chips">' +
         effects
             .map(value => '<button data-effect="' + value + '" class="' +
                           (effect === value ? 'active' : '') + '">' + escapeText(name(value)) +
                           '</button>')
             .join('') +
         '</div>' + effectCurve(state, receptor, effect, target) +
         '<label class="aid-checkbox"><input type="checkbox" data-receptor-active="' +
         escapeText(center.id) + '" data-receptor-effect="' + effect + '" ' +
         (receptor.active ? 'checked' : '') + '/>' + label('inspector.receptorActive') +
         '</label>' + substanceWheel(state, receptorProfile(state, receptor), {
           choices : [...state.document.substances.map(sub => sub.index), HORMONES.levels ],
           attribute : 'data-receptor-substance',
           reads : state.capabilities?.regulators,
           extra : ' data-center-id="' + escapeText(center.id) + '" data-receptor-effect="' +
                       effect + '"',
           selected : receptor.substance,
           widthTarget : target
         });
}
// The substance chosen in the library: its name, whether the fish grows by it (and how), the
// glands releasing it and what it acts on, its trial dose and the removal; what it does on a
// cell is set on the cell.
const GROW_MARK = 'M3 12c3-4 7-5 11-3l5-3v12l-5-3c-4 2-8 1-11-3zM9 11h.01';
export function substanceInspector(state) {
  const {document : doc, capabilities : wheel} = state;
  const substance = doc.substances.find(s => s.index === state.focusSubstance);
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
    return '<button data-select-organ="' + escapeText(o.id) + '">' + icon(o.type, ICON.list) +
           escapeText(organTitle(o, state.sites)) +
           [...effects ]
               .map(e => '<span class="aid-bound-effect" title="' +
                         escapeText(tList('studio.hormoneCard.effects')[e]) + '">' +
                         glyph(EFFECT_ICON[e], ICON.mark, {line : true}) + '</span>')
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
         grows + '">' + glyph(GROW_MARK, ICON.mark, {line : true}) + '<span>' +
         label(grows ? 'hormoneCard.growsOn' : 'hormoneCard.growsOff') + '</span></button>' +
         (grows ? growthEditor(state) : '') +
         row('sources', list(organsOf(doc, producers(doc, index, wheel)))) +
         row('acts', acts.join('')) + measurement(state, index) +
         '<button class="aid-danger" data-remove-substance="' + index + '">' +
         label('inspector.removeSubstance') + '</button>';
}
export function hormoneInspector(state) {
  const {document : doc, selected} = state;
  const focus = chosenCenter(doc, selected);
  if (!focus)
    return substanceInspector(state);
  let html = '<header class="aid-inspector-head"><span>' + label('sections.receptors') + '</span>' +
             heading(label('tools.hormone')) + '</header>';
  // Only the effects the engine gives this kind of cell.
  const effects = state.capabilities?.roleEffects?.[ROLE[focus.role]] ?? [];
  const effect = effects.includes(state.effect) ? state.effect : effects[0];
  const receptor = focus.receptors?.[effect];
  if (!receptor)
    return html;
  html += lifePhaseEditor(state, focus) + '<div class="aid-receptor-editor">' +
          heading(centerTitle(focus)) +
          receptorEditor(state, focus, effects, effect, i => label('effects.' + i)) + '</div>';
  return html;
}
