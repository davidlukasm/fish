import {HORMONE_EFFECT, HORMONES, TIME_CONSTANT} from '../../schema.js';
import {substanceColor} from '../../hormones.js';
import {clamp, PERCENT} from '../../units.js';
import {LONGEST_LEARNING_TIME, learningTimeOf, learningTimeSteps} from '../../tuning.js';
import {
  allCenters,
  chosenCenter,
  endpointCenters,
  substanceBound,
  findCenter,
  isLearner,
  LEARNING_EFFECTS,
  pairEndpoint,
  receptorResponse,
  receptorEnds
} from '../model/document.js';
import {escapeText, fixed, glyph} from './markup.js';
import {routedLinks} from '../model/regions.js';
import {formatNumber, formatSigned, joinParts, t} from '../../strings.js';
import {bandGlyph, heading, icon, ICON, label, VALUE_DIGITS} from './kit.js';
import {effectCurve, substanceName} from './substances.js';
import {centerTitle, organTitle, tone} from './names.js';
import {isModulator, isPacemaker, modeLean, nerveClass} from '../model/organs.js';
import {EFFECT_ICON} from './icons.js';
import {cellDevelopment, previewControls, previewContextOf} from './development.js';
import {effectScene} from './effects.js';
import {EPISODE_LAYOUT, episodeSvg} from './episode.js';
import {centerMarker} from './scene.js';
import {contactPlan} from './contact_plan.js';

// The learning gain keeps one digit more because it is small.
const RATE_DIGITS = VALUE_DIGITS + 1;
function sendersOf(state, center) {
  const doc = state.document, organ = findCenter(doc, center.id)?.organ;
  const hears = new Set([ center.id, organ?.id ]);
  const senders = routedLinks(doc, state.sites)
                      .filter(link => hears.has(link.to))
                      .map(link => endpointCenters(doc, link.from)[0])
                      .filter(Boolean);
  const modulators = senders.filter(c => c.role === 'nerve' && isModulator(c));
  const pacers = senders.filter(c => c.role === 'nerve' && isPacemaker(c));
  return {modulators, pacers};
}
const boundSubstance = (state, center, effect) => {
  const receptor = center.receptors?.[effect];
  return substanceBound(effect, receptor)
             ? {index : receptor.substance, name : substanceName(state, receptor.substance)}
             : null;
};

const traceSteps = center => learningTimeSteps(center.learning_tau);
const MODE_NAME = Object.freeze({[-1] : 'cancelling', 0 : 'neutral', 1 : 'competing'});
export const modeName = mode => MODE_NAME[modeLean(mode)];
const RULE = Object.freeze({
  change : 7,
  compete : 3,
  cancel : 2.4,
  expect : 1.6,
  glow : .55,
  credit : .5,
  unused : .8,
  apart : 2.6,
  delay : TIME_CONSTANT.learning_min_steps
});
const remnantOf = center => Math.exp(-RULE.delay / traceSteps(center));
// Two rounds of the cell's learning: what fires with it grows, a still input fades and, when
// the cell competes, gives way; a teacher's surprise grows what its trace still holds.
function learningPicture(center, teachers, colours, values) {
  const L = EPISODE_LAYOUT, R = RULE, words = key => label('learnRule.' + key);
  const rate = center.qwidth, mode = center.mode, pacer = teachers.pacers.length > 0;
  const remnant = remnantOf(center), teaches = colours.length > 0;
  const inputs = [
    {y : L.cy - L.r * R.apart, deed : 'own'}, ...(pacer ? [ {y : L.cy, deed : 'beat'} ] : []),
    {y : L.cy + L.r * R.apart, deed : null}
  ];
  const competing = R.compete * rate * Math.max(0, mode);
  const cancelling = R.cancel * rate * Math.max(0, -mode);
  let expect = 0;
  const rounds = [ 0, 1 ].map(k => {
    const surprise = teaches ? 1 - expect : 0;
    const reward = R.change * rate * surprise * remnant;
    const own = reward * 2 * R.credit, beat = pacer ? reward * 2 * (1 - R.credit) : 0;
    const giveWay = modeLean(mode) > 0 ? -(own + beat) : 0;
    const before = expect;
    if (teaches)
      expect = before + (1 - before) * Math.min(1, R.expect * rate);
    const trace = [ 2 * R.credit * R.glow, ...(pacer ? [ 2 * (1 - R.credit) * R.glow ] : []), 0 ];
    return {
      trace,
      remnant,
      teach : teaches ? colours[k % colours.length] : null,
      grow : [ competing - cancelling, ...(pacer ? [ -competing ] : []), -competing - R.unused ],
      gain : [ own, ...(pacer ? [ beat ] : []), giveWay ],
      expect : [ before, expect ]
    };
  });
  const lean = label('inspector.' + modeName(mode));
  const caption = !(rate > 0)            ? words('off')
                  : teaches              ? joinParts([
                      t('studio.learnRule.gain', {n : Math.round(rate * PERCENT)}),
                      modeLean(mode) !== 0 ? lean : ''
                    ])
                  : modeLean(mode) !== 0 ? t('studio.learnRule.untaughtMode', {mode : lean})
                                         : words('untaught');
  // What the picture shows and the rule's values stand in its tooltip.
  return episodeSvg({
    title : label('inspector.learning'),
    tooltip : joinParts([ caption, values ]),
    inputs,
    output : true,
    rounds
  });
}
function learningValues(state, center) {
  if (!state.capabilities)
    return '';
  const constants = state.capabilities.neural, context = previewContextOf(state),
        cl = nerveClass(center);
  const response = effect => receptorResponse(state.capabilities, center.receptors[effect],
                                              context.hormones, context.maturity);
  const eta = constants.learningFloor + (constants.learningGainMax - constants.learningFloor) *
                                            center.qwidth *
                                            (1 + response(HORMONE_EFFECT.learning)) / 2;
  const decayHalf = use => {
    const d = Math.log(2) / constants.baselineSteps +
              (1 - use) / (constants.unusedDecaySpan * learningTimeSteps(center.learning_tau));
    const retention = 1 - d + d * d * (.5 - d / 6);
    return Math.ceil(Math.log(.5) / Math.log(retention));
  };
  const row = (key, value) => label('learnRule.' + key) + ' ' + value;
  return [
    row('effectiveRate', formatNumber(eta, RATE_DIGITS)),
    row('mode',
        label('inspector.' + modeName(cl.mode)) + ' ' + formatSigned(cl.mode, VALUE_DIGITS)),
    row('probation', Math.ceil(constants.contactTrial * learningTimeSteps(center.learning_tau)) +
                         ' ' + label('learnRule.steps')),
    row('prune', formatNumber(constants.prune, VALUE_DIGITS)),
    row('decayUnused', decayHalf(0) + ' ' + label('learnRule.steps')),
    row('decayUsed', decayHalf(1) + ' ' + label('learnRule.steps'))
  ].join(' · ');
}
const TRACE = Object.freeze(
    {width : 300, height : 138, left : 22, right : 280, top : 20, bottom : 110, samples : 64});
const traceAxis = LONGEST_LEARNING_TIME;
const traceLog = Math.log1p(traceAxis / TIME_CONSTANT.learning_min_steps);
const traceAt = share => TIME_CONSTANT.learning_min_steps * Math.expm1(clamp(share) * traceLog);
export const learnTracePatch = fx => {
  const T = TRACE, steps = traceAt((fx * T.width - T.left) / (T.right - T.left));
  return {learning_tau : learningTimeOf(Math.max(TIME_CONSTANT.learning_min_steps, steps))};
};
function learningGain(state, center) {
  const N = state.capabilities.neural, context = previewContextOf(state);
  const hormone = receptorResponse(state.capabilities, center.receptors[HORMONE_EFFECT.learning],
                                   context.hormones, context.maturity);
  const span = (N.learningGainMax - N.learningFloor) * (1 + hormone) / 2;
  return {
    floor : N.learningFloor,
    span,
    max : N.learningGainMax,
    value : N.learningFloor + center.qwidth * span
  };
}
export function learnMemoryPatch(state, center, handle, fx, fy) {
  if (handle === 'trace')
    return learnTracePatch(fx);
  const T = TRACE, gain = learningGain(state, center);
  if (!(gain.span > 0))
    return null;
  const value = clamp((T.bottom - fy * T.height) / (T.bottom - T.top)) * gain.max;
  return {qwidth : clamp((value - gain.floor) / gain.span)};
}
function traceGraphic(state, center) {
  const T = TRACE, lasts = traceSteps(center), gain = learningGain(state, center);
  const x = steps =>
      T.left + (T.right - T.left) * Math.log1p(steps / TIME_CONSTANT.learning_min_steps) / traceLog;
  const y = level => T.bottom - (T.bottom - T.top) * level / gain.max;
  const points = Array.from({length : T.samples + 1}, (_, k) => {
    const steps = traceAt(k / T.samples);
    return fixed(x(steps)) + ' ' + fixed(y(gain.value * Math.exp(-steps / lasts)));
  });
  const grip = (key, x, y, title) => '<circle class="aid-graphic-handle" data-learning-handle="' +
                                     key + '" cx="' + fixed(x) + '" cy="' + fixed(y) +
                                     '" r="7"><title>' + escapeText(title) + '</title></circle>';
  return '<svg class="aid-learn-trace" viewBox="0 0 ' + T.width + ' ' + T.height +
         '" data-learning-memory="' + escapeText(center.id) + '" role="img" aria-label="' +
         label('cellPicture.learningMemory') + '"><title>' +
         escapeText(label('cellPicture.learningMemory') + ' · ' +
                    t('studio.learnRule.lasts', {n : Math.round(lasts)})) +
         '</title><path class="aid-learn-glow" d="M' + T.left + ' ' + T.bottom + ' L' +
         points.join(' L') + ' L' + T.right + ' ' + T.bottom + ' Z"/>' +
         '<path class="aid-learn-fade" d="M' + points.join(' L') + '"/>' +
         '<path class="aid-chart-axis" d="M' + T.left + ' ' + T.top + 'V' + T.bottom + 'H' +
         T.right + '"/>' +
         (gain.span > 0 ? grip('rate', T.left, y(gain.value), label('cellPicture.learningStrength'))
                        : '') +
         grip('trace', x(lasts), y(gain.value / Math.E), label('learnRule.traceLength')) + '</svg>';
}
function modeChoices(center) {
  return '<div class="aid-learning-modes">' +
         [ -1, 0, 1 ]
             .map(mode => {
               const name = label('cellPicture.mode.' + (mode + 1));
               return '<button data-response-cell="' + escapeText(center.id) +
                      '" data-response-property="mode" ' +
                      'data-response-value="' + mode + '" aria-pressed="' +
                      (modeLean(center.mode) === mode) + '" title="' + name + '">' +
                      '<svg viewBox="0 0 88 54" aria-hidden="true"><circle class="aid-tissue-cell" cx="66" cy="26" r="12"/>' +
                      '<path class="aid-contact-fibre" d="M10 12L55 22" stroke-width="' +
                      (mode < 0   ? 1
                       : mode > 0 ? 6
                                  : 3) +
                      '"/><path class="aid-contact-fibre" d="M10 40L55 30" stroke-width="' +
                      (mode > 0 ? 1 : 3) +
                      '"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg></button>';
             })
             .join('') +
         '</div>';
}
function substancePart(state, center, effect) {
  const receptor = center.receptors?.[effect];
  if (!receptor)
    return '';
  const doc = state.document, bound = boundSubstance(state, center, effect);
  const colour = bound ? substanceColor(bound.index) : null;
  const title = label('effects.' + effect);
  const choice = (value, text, on, swatch = '') =>
      '<button class="' + (on ? 'active' : '') + '" data-learn-substance="' + value +
      '" data-center-id="' + escapeText(center.id) + '" data-learn-effect="' + effect + '"' +
      (swatch ? ' style="--substance:' + swatch + '"' : '') + ' title="' + escapeText(text) +
      '"><span class="aid-substance-swatch' + (swatch ? '' : ' none') + '"></span></button>';
  const choices =
      '<div class="aid-learn-substances" role="group" aria-label="' + escapeText(title) + '">' +
      choice('off', label('learnRule.none'), !bound) +
      [...doc.substances, {index : HORMONES.levels, name : label('inspector.maturity')} ]
          .map(sub => choice(String(sub.index), sub.name || substanceName(state, sub.index),
                             bound?.index === sub.index, substanceColor(sub.index)))
          .join('') +
      (doc.substances.length ? ''
                             : '<button data-add-substance title="' +
                                   label('sections.newSubstance') + '">+</button>') +
      '</div>';
  return '<details class="aid-learn-substance' + (bound ? ' bound' : '') + '"' +
         (colour ? ' style="--substance:' + colour + '"' : '') + '><summary title="' +
         escapeText(title) + '">' + glyph(EFFECT_ICON[effect], ICON.mark, {line : true}) +
         '</summary>' +
         effectScene(effect, colour ?? 'currentColor', bound ? receptorEnds(receptor) : undefined) +
         choices + (bound ? effectCurve(state, receptor, effect, center.id + ':' + effect) : '') +
         '</details>';
}
function teacherList(state, center, modulators) {
  const taught = boundSubstance(state, center, HORMONE_EFFECT.teaching);
  const items =
      modulators
          .map(c => '<button data-select-center="' + escapeText(c.id) + '" title="' +
                    label('learnRule.modulator') + '">' + nodeMark(c) + escapeText(centerTitle(c)) +
                    '</button>')
          .join('') +
      (taught ? '<span class="aid-teacher-chip" style="--teacher:' + substanceColor(taught.index) +
                    '" title="' + label('learnRule.substance') +
                    '"><span class="aid-teacher-dot"></span>' +
                    escapeText(taught.name || substanceName(state, taught.index)) + '</span>'
              : '');
  return items ? '<div class="aid-teacher-list">' + items + '</div>' : '';
}
const NODE_MARK = Object.freeze({marker : 6, box : 8});
// Every learning cell, grouped by its organ: the organ's symbol, then one mark per cell; a cell
// with a teacher wears the teacher's colour as a ring. Names and teachers stand in the tooltip.
function learnersOverview(state) {
  const doc = state.document, shown = new Set(), groups = new Map();
  for (const c of allCenters(doc)) {
    if (!isLearner(c) || shown.has(c.id))
      continue;
    shown.add(pairEndpoint(doc, c.id));
    const organ = findCenter(doc, c.id)?.organ;
    if (!groups.has(organ))
      groups.set(organ, []);
    groups.get(organ).push(c);
  }
  if (!groups.size)
    return '';
  const learner = c => {
    const {modulators} = sendersOf(state, c);
    const taught = boundSubstance(state, c, HORMONE_EFFECT.teaching);
    const teachers = [
      ...modulators.map(m => centerTitle(m)),
      ...(taught ? [ substanceName(state, taught.index) ] : [])
    ];
    const ring = taught ? substanceColor(taught.index) : modulators.length ? tone('brain') : null;
    return '<button class="aid-learner' + (ring ? ' taught' : '') + '" data-select-center="' +
           escapeText(c.id) + '"' + (ring ? ' style="--teacher:' + ring + '"' : '') + ' title="' +
           escapeText(joinParts([ centerTitle(c), ...teachers ])) + '">' + nodeMark(c) +
           '</button>';
  };
  return '<section class="aid-learn-part" title="' + label('learnRule.overview') + '">' +
         [...groups ]
             .map(([ organ, cells ]) => '<div class="aid-learner-group" title="' +
                                        escapeText(organ ? organTitle(organ) : '') + '">' +
                                        (organ ? icon(organ.type, ICON.list) : '') +
                                        cells.map(learner).join('') + '</div>')
             .join('') +
         '</section>';
}
const nodeMark = c => {
  const B = NODE_MARK.box;
  return '<svg class="aid-node-mark" viewBox="' + -B + ' ' + -B + ' ' + 2 * B + ' ' + 2 * B +
         '" aria-hidden="true">' + centerMarker(c, NODE_MARK.marker) + '</svg>';
};
function nodeChoice(state, chosen) {
  const organ = findCenter(state.document, chosen.id)?.organ;
  const nodes =
      organ && organ.type !== 'brain' ? organ.centers.filter(c => c.role === 'nerve') : [];
  if (nodes.length < 2)
    return '';
  return '<div class="aid-learn-nodes" role="group" aria-label="' + label('learnRule.nodes') +
         '">' +
         nodes
             .map(c => '<button class="' + (c.id === chosen.id ? 'active' : '') +
                       '" data-select-center="' + escapeText(c.id) + '" title="' +
                       escapeText(centerTitle(c)) + '">' +
                       (c.band ? bandGlyph(c.band) : nodeMark(c) + escapeText(centerTitle(c))) +
                       '</button>')
             .join('') +
         '</div>';
}
export function learningInspector(state) {
  const selected = state.selected, doc = state.document;
  const chosen = chosenCenter(doc, selected, state.visionProfile);
  let html = '<header class="aid-inspector-head"><span>' + label('sections.brain') + '</span>' +
             heading(label('tools.learn')) + '</header>';
  if (!chosen || chosen.role !== 'nerve')
    return html + previewControls(state) + learnersOverview(state);
  html += nodeChoice(state, chosen);
  const teachers = sendersOf(state, chosen);
  const taught = boundSubstance(state, chosen, HORMONE_EFFECT.teaching);
  const colours = [
    ...(teachers.modulators.length ? [ tone('brain') ] : []),
    ...(taught ? [ substanceColor(taught.index) ] : [])
  ];
  return html + heading(centerTitle(chosen)) + previewControls(state) +
         learningPicture(chosen, teachers, colours, learningValues(state, chosen)) +
         teacherList(state, chosen, teachers.modulators) + traceGraphic(state, chosen) +
         modeChoices(chosen) + '<div class="aid-learn-effects">' +
         LEARNING_EFFECTS.map(effect => substancePart(state, chosen, effect)).join('') + '</div>' +
         cellDevelopment(state, chosen) + contactPlan(state, [ chosen ]);
}
