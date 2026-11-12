import {variationGraphic} from './cell_tissue.js';
import {previewControls, previewContextOf, cellDevelopment} from './development.js';
import {ATELIER_LIMITS, BLOOD_SUBSTANCE, HORMONE_EFFECT, HORMONES} from '../../schema.js';
import {substanceColor} from '../../hormones.js';
import {clamp} from '../../units.js';
import {isRegion} from '../model/organs.js';
import {
  boundEffects,
  effectsFor,
  birthAffinity,
  chosenCenter,
  DEATH_RESPONSE,
  effectDirection,
  findCenter,
  groupReport,
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
import {escapeText, fixed, glyph, placedGlyph, pointMarks} from './markup.js';
import {formatNumber, joinParts, percent, t, tList} from '../../strings.js';
import {heading, icon, ICON, iconSwitch, label} from './kit.js';
import {BIRTH_ICON, DIRECTION_ICON, EFFECT_ICON, GROWTH_ICON, TOOL_ICON} from './icons.js';
import {EFFECT_ORDER, effectScene} from './effects.js';
import {centerTitle, organTitle} from './names.js';
import {typeChips} from './types.js';
import {
  adaptationMarks,
  cellMarks,
  gateHandle,
  motorReadiness,
  senseSensitivity,
  sensitivityHandle
} from './sense_marks.js';
import {organCommand} from './preview.js';

const centerWheel = (state, center, choices, reads, marks = null) =>
    substanceWheel(state, {x : center.q1, y : center.q2, width : center.qwidth, active : true}, {
      choices,
      reads,
      attribute : 'data-wheel-substance',
      extra : ' data-center-id="' + escapeText(center.id) + '"',
      pad : center.id,
      marks
    });
// The gland in its wheel: which substances it pours out (its point), how little input opens it (the
// ring round the point, wider the readier), its cells on that ring and, as drops leaving or
// entering it, what it does with the example input.
const GLAND = Object.freeze({drops : 8, drop : 4, out : 6});
function glandMarks(state, center) {
  const W = WHEEL, G = GLAND, at = {x : wheelX(center.q1), y : wheelY(center.q2)};
  const ring = W.ring * (W.least + (W.most - W.least) * motorReadiness(state, center));
  const round = (count, radius, turn = 0) => Array.from({length : count}, (_, k) => {
    const a = Math.PI / 2 + 2 * Math.PI * (k + turn) / count;
    return {x : at.x + radius * Math.cos(a), y : at.y + radius * Math.sin(a), a};
  });
  const halves = 'studio.inspector.driveHalves.gland.';
  const command = organCommand(state, center), size = G.drop * Math.abs(command);
  // Drops point away from the gland while it pours out and towards it while it binds.
  const drops =
      size > .5 ? '<g class="aid-gland-drops"><title>' +
                      escapeText(t(halves + (command > 0 ? 'above' : 'below'))) + ' ' +
                      percent(Math.abs(command)) + '</title>' +
                      round(G.drops, ring + W.cells + G.out, .5)
                          .map(p => {
                            const dir = Math.sign(command), c = Math.cos(p.a), s = Math.sin(p.a);
                            const tip = {x : p.x + dir * size * c, y : p.y + dir * size * s};
                            const side = k => ({
                              x : p.x - dir * size * c + k * size * .7 * -s,
                              y : p.y - dir * size * s + k * size * .7 * c
                            });
                            return '<path d="M' + fixed(tip.x) + ',' + fixed(tip.y) + ' L' +
                                   fixed(side(1).x) + ',' + fixed(side(1).y) + ' L' +
                                   fixed(side(-1).x) + ',' + fixed(side(-1).y) + 'Z"/>';
                          })
                          .join('') +
                      '</g>'
                : '';
  const up = r => ({x : at.x, y : at.y - r});
  return {
    ring,
    svg : drops + cellMarks(round(ATELIER_LIMITS.max_copies, ring + W.cells), center) +
              gateHandle(up(W.ring * W.least), up(W.ring * W.most), state, center,
                         label('inspector.motorGate'))
  };
}
export function glandProfile(state, organ, center) {
  const substances = state.document.substances;
  const add = substances.length
                  ? ''
                  : '<button class="aid-secondary" data-add-substance>' +
                        t('studio.marks.add', {name : label('sections.newSubstance')}) +
                        '</button>';
  // Nothing of the gland reaches past the wheel's points, so its picture shows the wheel close up.
  return '<div class="aid-wheel-close" data-sense-block="' + escapeText(organ.id) + '">' +
         centerWheel(state, center, substances.map(sub => sub.index), state.capabilities?.hormones,
                     glandMarks(state, center)) +
         '</div>' + add;
}
const CHIP_DOT = Object.freeze({half : 8, radius : 6});
// The blood sense in one wheel: which substance (the point, its width at the handle), how faint a
// level the cells notice (the catching ring, wider the more sensitive), the cells on that ring and,
// where they get used to a lasting level, the adaptation arc round the wheel.
function bloodMarks(state, center, held) {
  const W = WHEEL, at = {x : wheelX(center.q1), y : wheelY(center.q2)};
  const sensitive = held ?? senseSensitivity(state, center) ?? 0;
  const ring = W.ring * (W.least + (W.most - W.least) * sensitive);
  const cells = Array.from({length : ATELIER_LIMITS.max_copies}, (_, k) => {
    const a = Math.PI / 2 + 2 * Math.PI * k / ATELIER_LIMITS.max_copies;
    return {x : at.x + (ring + W.cells) * Math.cos(a), y : at.y + (ring + W.cells) * Math.sin(a)};
  });
  const answer = groupReport(state.document, state.anatomy, 'senses', center.id);
  const up = r => ({x : at.x, y : at.y - r});
  return {
    ring,
    svg : (answer?.adapt?.steps > 0
               ? adaptationMarks({x : W.centre, y : W.centre}, W.radius + W.arc,
                                 Math.atan2(at.y - W.centre, at.x - W.centre), center)
               : '') +
              cellMarks(cells, center) +
              sensitivityHandle(up(W.ring * W.least), up(W.ring * W.most), sensitive,
                                label('inspector.bloodSensitivity'))
  };
}
export function hormonePad(state, organ, center, held = null) {
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
  return '<div data-sense-block="' + escapeText(organ.id) + '">' + chips +
         centerWheel(state, center, all, Infinity, bloodMarks(state, center, held)) + '</div>';
}
// What the cell's substances do, only where it binds or learns from one: the substance chips with
// what they change, and the hormone and learning tools as symbols. Release and birth stand in the
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
      doc.substances.flatMap(
          sub => boundEffects(center, sub.index, wheel)
                     .map(effect => chip(sub.index) + '<small class="aid-bound-effect">' +
                                    effectWords(effect,
                                                effectDirection(effect, center.receptors[effect])) +
                                    '</small>')));
  if (center.role === 'nerve')
    rows += row('inspector.learnsFrom',
                teachersOf(doc, center, wheel)
                    .map(({substance, glands}) =>
                             chip(substance.index) +
                             (glands.length ? ''
                                            : '<small class="aid-bound-effect">' +
                                                  label('inspector.noGland') + '</small>')));
  const open = (tool, text) => '<button class="aid-secondary aid-tool-link" data-open-tool="' +
                               tool + '" data-center-id="' + escapeText(center.id) + '" title="' +
                               label(text) + '">' +
                               glyph(TOOL_ICON[tool], ICON.tool, {line : true}) + '</button>';
  return '<section class="aid-eye-section aid-chemistry">' + (rows ? '<dl>' + rows + '</dl>' : '') +
         '<div class="aid-button-group">' + open('hormone', 'inspector.editHormones') +
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
  const maturity = receptor.substance === HORMONES.levels && effect !== GROWTH;
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
      const level = i === r.substance       ? c
                    : i === HORMONES.levels ? context.maturity
                                            : context.hormones[i];
      sum += receptorAffinity(wheel, r, i) * level;
    }
    return sum;
  };
  const occupancy = (c, r = receptor) => bound(r, concentration(c, r));
  const response = (c, r = receptor) =>
      !r.active           ? (effect === HORMONE_EFFECT.output || effect === BIRTH ? 1 : 0)
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
// Where the answer turns and how sharply only show while it changes at all; a flat answer has only
// its two ends to drag.
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
    ...(turns && (state.capabilities?.steepnessSteps ?? 0) > 0
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
export const GROWTH = 'growth';
export const BIRTH = 'birth';
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
const curveAxes = () => '<path class="aid-chart-axis" d="M' + CURVE.left + ' ' + CURVE.top + ' V' +
                        CURVE.bottom + ' H' + CURVE.right + '"/>';
// What the axes of an answer mean, without words: along the bottom the substance (or the cell's
// age) grows in its own colour, at the top of the upright axis sits the answer's symbol.
const CURVE_KEY = Object.freeze({gap : 4, strip : 6, steps : 12, icon : 16});
function curveKey(colour, path) {
  const K = CURVE_KEY, step = (CURVE.right - CURVE.left) / K.steps;
  return Array
             .from({length : K.steps},
                   (_, k) => '<rect class="aid-curve-amount" x="' + fixed(CURVE.left + k * step) +
                             '" y="' + (CURVE.bottom + K.gap) + '" width="' + fixed(step) +
                             '" height="' + K.strip + '" fill="' + colour + '" fill-opacity="' +
                             fixed((k + 1) / K.steps) + '"/>')
             .join('') +
         placedGlyph(path, K.icon, {x : CURVE.left / 2, y : CURVE.top + K.icon / 2}, {line : true});
}
const PHASE_POINTER = Object.freeze({half : 8, height : 14});
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
  const unit = effect === GROWTH  ? label('inspector.growth')
               : effect === BIRTH ? label('development.birth')
                                  : label('effects.' + effect);
  const along = maturity ? label('inspector.maturity') : label('inspector.concentration');
  return '<svg viewBox="0 0 ' + CURVE.width + ' ' + CURVE.height + '" class="aid-response-chart"' +
         (target ? ' data-receptor-curve="' + escapeText(target) + '"' : '') + '><title>' +
         escapeText(unit + ' · ' + along + ' ' +
                    formatNumber(maturity ? 0 : halfMin, CURVE_DIGITS) + ' … ' + formatNumber(1)) +
         '</title>' + marks + curveAxes() +
         curveKey(substanceColor(receptor.substance), effect === GROWTH  ? GROWTH_ICON
                                                      : effect === BIRTH ? BIRTH_ICON
                                                                         : EFFECT_ICON[effect]) +
         '<polyline class="aid-response-line" points="' + points + '"/>' +
         (target ? curveHandles(state, receptor, effect, target) : '') + '</svg>';
}
const PHASE_OPEN = .05;
export function phasePatch(handle, fx) {
  const m = clamp((fx * CURVE.width - CURVE.left) / (CURVE.right - CURVE.left));
  return handle === 'start' ? {start : m < PHASE_OPEN ? null : m}
                            : {end : m > 1 - PHASE_OPEN ? null : Math.max(PHASE_OPEN, m)};
}
// The cell's life in one picture over its maturity: when it starts to work and when it dies (the
// two marks), how strongly it answers (the solid line), when new cells are born (the dashed line)
// and where it dies (the shaded spans). Below, one badge per answer shows the substance its
// receptor reads; clicking a badge or its line chooses which receptor the pictures below set.
const LIFE_BADGE = Object.freeze({y : 134, radius : 9});
export const LIFE_EFFECTS = Object.freeze([ BIRTH, HORMONE_EFFECT.output, HORMONE_EFFECT.death ]);
const lifeKind = effect => effect === BIRTH                   ? 'birth'
                           : effect === HORMONE_EFFECT.output ? 'output'
                                                              : 'death';
const lifeReceptor = (focus, effect) => effect === BIRTH ? focus.growth : focus.receptors[effect];
export function lifePhaseEditor(state, focus, chosen = BIRTH) {
  const phase = lifePhase(focus), output = focus.receptors[HORMONE_EFFECT.output];
  const context = previewContextOf(state);
  const level = m => (1 + receptorResponse(state.capabilities, output, context.hormones, m, 1)) / 2;
  const x = m => CURVE.left + (CURVE.right - CURVE.left) * m,
        y = v => CURVE.bottom - (CURVE.bottom - CURVE.top) * v;
  const points = Array.from({length : CURVE.points + 1}, (_, i) => i / CURVE.points)
                     .map(m => fixed(x(m)) + ',' + fixed(y(level(m))))
                     .join(' ');
  const birth = Array.from({length : CURVE.points + 1}, (_, i) => i / CURVE.points)
                    .map(m => fixed(x(m)) + ',' +
                              fixed(y(Math.max(0, receptorResponse(state.capabilities, focus.growth,
                                                                   context.hormones, m, 1)))))
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
  const pick = effect => ' data-development-effect="' + effect + '"' +
                         (effect === chosen ? ' aria-pressed="true"' : '');
  const name = effect => label('development.' + lifeKind(effect));
  const line = (effect, className, values) =>
      '<g class="aid-life-line"' + pick(effect) + '><title>' + name(effect) +
      '</title><polyline class="aid-life-hit" points="' + values + '"/><polyline class="' +
      className + '" points="' + values + '"/></g>';
  const badge = (effect, k) => {
    const receptor = lifeReceptor(focus, effect), on = receptor?.active;
    const at = x((k + .5) / LIFE_EFFECTS.length);
    return '<g class="aid-life-badge ' + lifeKind(effect) + (effect === chosen ? ' chosen' : '') +
           '"' + pick(effect) + '><title>' +
           escapeText(name(effect) + ' · ' +
                      (on ? substanceName(state, receptor.substance)
                          : label('inspector.answersToNothing'))) +
           '</title><circle cx="' + fixed(at) + '" cy="' + LIFE_BADGE.y + '" r="' +
           LIFE_BADGE.radius + '"' +
           (on ? ' style="fill:' + substanceColor(receptor.substance) + '"' : '') + '/>' +
           (on ? '<text x="' + fixed(at) + '" y="' + LIFE_BADGE.y +
                     '" dy=".35em" text-anchor="middle">' +
                     escapeText(substanceMark(state, receptor.substance)) + '</text>'
               : '') +
           '</g>';
  };
  return '<svg viewBox="0 0 ' + CURVE.width + ' ' + CURVE.height +
         '" class="aid-response-chart aid-life-picture" data-phase="' + escapeText(focus.id) +
         '" role="img" aria-label="' + label('inspector.lifePhase') + '"><title>' +
         escapeText(label('development.phaseHandles')) + '</title>' +
         '<g class="aid-life-line"' + pick(HORMONE_EFFECT.death) + '><title>' +
         name(HORMONE_EFFECT.death) + '</title>' + dead + '</g>' + curveAxes() +
         line(HORMONE_EFFECT.output, 'aid-response-line', points) +
         line(BIRTH, 'aid-life-birth', birth) +
         mark('start', phase.start, 0, 'inspector.phaseStart') +
         mark('end', phase.end, 1, 'inspector.phaseEnd') + LIFE_EFFECTS.map(badge).join('') +
         '</svg>';
}
export const WHEEL = Object.freeze({
  size : 240,
  height : 240,
  centre : 120,
  radius : 51,
  point : 11,
  ring : 15,
  // The blood sense's catching ring spans this share of the ring from least to most sensitive;
  // its cells sit just outside it, the adaptation arc well outside the wheel.
  least : .5,
  most : 1.6,
  cells : 5,
  arc : 40
});
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
  marks = null
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
                           py(profile.y) + '" r="' + fixed(marks?.ring ?? WHEEL.ring) + '"/>'
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
  return '<svg class="aid-substance-wheel"' +
         (pad ? ' data-vector-pad="' + escapeText(pad) + '" data-wheel tabindex="0"' : '') +
         (marks ? ' data-sense-field="' + escapeText(pad) + '"' : '') + ' viewBox="0 0 ' +
         WHEEL.size + ' ' + WHEEL.height + '" role="img" aria-label="' +
         label('inspector.hormoneProfile') + '"><circle cx="' + WHEEL.centre + '" cy="' +
         WHEEL.centre + '" r="' + WHEEL.radius + '" class="aid-wheel-ring"/>' + halo + marker +
         points.join('') + (marks?.svg ?? '') + handle + '</svg>';
}
function receptorProfile(state, receptor) {
  const [x, y] = state.capabilities ? wheelPlace(state.capabilities, receptor.substance) : [ 0, 0 ];
  return {x, y, width : receptor.width, active : receptor.active};
}
function growthEditor(state) {
  const growth = state.document.growth;
  if (!growth.active)
    return '';
  return '<section class="aid-growth">' + heading(label('development.bodyGrowth')) +
         receptorWheel(state, growth, GROWTH) + effectCurve(state, growth, GROWTH, GROWTH) +
         variationGraphic(growth.spread_receptors, GROWTH, 'spread_receptors') + '</section>';
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
function receptorWheel(state, receptor, target) {
  const birth = target.endsWith(':' + BIRTH), body = target === GROWTH;
  const cut = target.lastIndexOf(':'), id = target.slice(0, cut), effect = target.slice(cut + 1);
  return substanceWheel(state, receptorProfile(state, receptor), {
    choices :
        [...state.document.substances.map(sub => sub.index), ...(body ? [] : [ HORMONES.levels ]) ],
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
  return iconSwitch('receptor', receptor.active, label('inspector.receptorActive'), active) +
         '<div class="aid-receptor-picture"><div class="aid-wheel-close">' +
         receptorWheel(state, receptor, target) + '</div>' +
         (birth ? ''
                : effectScene(effect, substanceColor(receptor.substance), receptorEnds(receptor))) +
         variationGraphic(receptor.spread_receptors, target, 'spread_receptors') + '</div>' +
         effectCurve(state, receptor, effect, receptor.active ? target : null);
}
// How long the substance lasts in the blood, as a clock whose tooltip gives the steps.
const CLOCK_ICON = 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18';
export function hormoneTime(state, index) {
  const value = state.anatomy?.hormoneTimes?.[index];
  return '<span class="aid-hormone-time" data-hormone-time="' + index + '" title="' +
         escapeText(label('hormoneCard.timeConstant') + ': ' +
                    (Number.isFinite(value)
                         ? t('studio.hormoneCard.timeValue', {n : formatNumber(value, 1)})
                         : formatNumber(NaN))) +
         '">' + glyph(CLOCK_ICON, ICON.mark, {line : true}) + '</span>';
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
                      '">' + effectScene(effect, colour, ends) + '<div><strong>' +
                      boundEffect(effect, direction) +
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
  const choose = choices.length > 1
                     ? '<div class="aid-center-tabs">' +
                           choices
                               .map(c => '<button data-select-center="' + escapeText(c.id) +
                                         '" class="' + (c.id === focus.id ? 'active' : '') + '">' +
                                         escapeText(centerTitle(c)) + '</button>')
                               .join('') +
                           '</div>'
                     : '';
  return html + choose + cellDevelopment(state, focus) + '<div class="aid-receptor-editor">' +
         heading(label('inspector.cellEffects')) + receptorEditor(state, focus, effects, effect) +
         '</div>';
}

export function hormoneInspector(state) { return previewControls(state) + hormoneDetails(state); }
