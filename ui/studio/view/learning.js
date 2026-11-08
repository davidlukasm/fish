import {HORMONE_EFFECT, TIME_CONSTANT} from '../../schema.js';
import {substanceColor} from '../../hormones.js';
import {clamp} from '../../units.js';
import {LONGEST_LEARNING_TIME, learningTimeOf, learningTimeSteps} from '../../tuning.js';
import {
  allCenters,
  chosenCenter,
  endpointCenters,
  findCenter,
  isLearner,
  LEARNING_EFFECTS,
  pairEndpoint,
  receptorResponse,
  receptorEnds
} from '../model/document.js';
import {escapeText, fixed, glyph, namedTrack, TRACK, trackShare} from './markup.js';
import {routedLinks} from '../model/regions.js';
import {joinParts, t, tList} from '../../strings.js';
import {heading, ICON, label, regionTerm} from './kit.js';
import {substanceName} from './substances.js';
import {centerTitle, tone} from './names.js';
import {isModulator, isPacemaker, isRegion, modeLean, nerveClass} from '../model/organs.js';
import {EFFECT_ICON} from './icons.js';
import {cellDevelopment, previewControls, previewContextOf} from './development.js';
import {effectScene} from './effects.js';
import {centerMarker} from './scene.js';
import {contactPlan} from './contact_plan.js';

const TRACKS = Object.freeze({width : 300, height : 50, range : [ 26, 274 ], y : 20});
export const learnRatePatch = fx => ({qwidth : trackShare(fx * TRACKS.width, TRACKS.range)});
export const learnModePatch = fx => ({mode : 2 * trackShare(fx * TRACKS.width, TRACKS.range) - 1});
export const learnResponseOf = fx => 2 * trackShare(fx * TRACKS.width, TRACKS.range) - 1;
function learnTrack(kind, center, share, title, ends, {middle = '', extra = ''} = {}) {
  const T = TRACKS;
  return '<svg class="aid-learn-track" viewBox="0 0 ' + T.width + ' ' + T.height + '" data-' +
         kind + '="' + escapeText(center.id) + '"' + extra + ' role="img" aria-label="' +
         escapeText(title) + '">' +
         namedTrack(T.range, T.y, share, 'data-graphic-handle="' + kind + '"', title, ends) +
         (middle ? '<text class="aid-learn-middle" x="' + T.width / 2 + '" y="' +
                       (T.y - TRACK.gap * 4) + '" text-anchor="middle">' + escapeText(middle) +
                       '</text>'
                 : '') +
         '</svg>';
}
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
  return receptor?.active
             ? {index : receptor.substance, name : substanceName(state, receptor.substance)}
             : null;
};
const fullResponse = receptor => receptorEnds(receptor).with;

const MODE_NAME = Object.freeze({[-1] : 'cancelling', 0 : 'neutral', 1 : 'competing'});
export const modeName = mode => MODE_NAME[modeLean(mode)];
function learningRule(state, center) {
  if (!state.capabilities)
    return '';
  const constants = state.capabilities.neural, context = previewContextOf(state),
        cl = nerveClass(center);
  const response = effect => receptorResponse(state.capabilities, center.receptors[effect],
                                              context.hormones, context.maturity);
  const eta = constants.learningFloor + (2 - constants.learningFloor) * center.qwidth *
                                            (1 + response(HORMONE_EFFECT.learning)) / 2;
  const decayHalf = use => {
    const d = Math.log(2) / constants.baselineSteps +
              (1 - use) / (4 * learningTimeSteps(center.learning_tau));
    const retention = 1 - d + d * d * (.5 - d / 6);
    return Math.ceil(Math.log(.5) / Math.log(retention));
  };
  const row = (key, value) =>
      '<div><dt>' + label('learnRule.' + key) + '</dt><dd>' + value + '</dd></div>';
  return '<div class="aid-local-learning"><span>' + label('learnRule.presynaptic') +
         '</span><span>' + label('learnRule.postsynaptic') + '</span><strong>→ ' +
         label('learnRule.traceLength') + '</strong></div>' +
         '<p class="aid-hint">' + label('learnRule.localPrediction') +
         '</p><dl class="aid-parameter-readout">' + row('effectiveRate', fixed(eta, 4)) +
         row('mode', label('inspector.' + modeName(cl.mode)) + ' · ' + fixed(cl.mode, 3)) +
         row('probation',
             Math.ceil(constants.contactTrial * learningTimeSteps(center.learning_tau)) + ' ' +
                 label('learnRule.steps')) +
         row('prune', fixed(constants.prune, 3)) +
         row('decayUnused', decayHalf(0) + ' ' + label('learnRule.steps')) +
         row('decayUsed', decayHalf(1) + ' ' + label('learnRule.steps')) + '</dl>' +
         '<p class="aid-hint">' + label('learnRule.unavoidableDecay') + '</p>';
}
const TRACE = Object.freeze(
    {width : 300, height : 70, left : 22, right : 280, top : 8, bottom : 46, samples : 48});
const traceAxis = LONGEST_LEARNING_TIME;
const traceSteps = center => learningTimeSteps(center.learning_tau);
export const learnTracePatch = fx => {
  const T = TRACE, steps = clamp((fx * T.width - T.left) / (T.right - T.left)) * traceAxis;
  return {learning_tau : learningTimeOf(Math.max(TIME_CONSTANT.learning_min_steps, steps))};
};
function traceGraphic(center) {
  const T = TRACE, lasts = traceSteps(center);
  const x = steps => T.left + (T.right - T.left) * steps / traceAxis;
  const y = level => T.bottom - (T.bottom - T.top) * level;
  const points = Array.from({length : T.samples + 1}, (_, k) => {
    const steps = traceAxis * k / T.samples;
    return fixed(x(steps)) + ' ' + fixed(y(Math.exp(-steps / lasts)));
  });
  const title = label('learnRule.traceLength'), knobY = fixed(y(Math.exp(-1)));
  // The knob runs on a rail from the shortest to the longest trace a cell can keep.
  const rail =
      [ TIME_CONSTANT.learning_min_steps, LONGEST_LEARNING_TIME ].map(steps => fixed(x(steps)));
  return '<svg class="aid-learn-trace" viewBox="0 0 ' + T.width + ' ' + T.height +
         '" data-learn-trace="' + escapeText(center.id) + '" role="img" aria-label="' +
         escapeText(title) + '"><path class="aid-learn-glow" d="M' + T.left + ' ' + T.bottom +
         ' L' + points.join(' L') + ' L' + T.right + ' ' + T.bottom + ' Z"/><path ' +
         'class="aid-learn-fade" d="M' + points.join(' L') +
         '"/><line class="aid-chart-axis" x1="' + T.left + '" y1="' + T.bottom + '" x2="' +
         T.right + '" y2="' + T.bottom + '"/><line class="aid-learn-rail" x1="' + rail[0] +
         '" y1="' + knobY + '" x2="' + rail[1] + '" y2="' + knobY +
         '"/><circle class="aid-graphic-handle" data-graphic-handle="learn-trace" cx="' +
         fixed(x(lasts)) + '" cy="' + knobY + '" r="' + TRACK.handle + '"><title>' +
         escapeText(title) + '</title></circle><text x="' + T.left + '" y="' +
         (T.bottom + TRACK.name) + '">' + escapeText(label('learnRule.short')) +
         '</text><text x="' + T.right + '" y="' + (T.bottom + TRACK.name) + '" text-anchor="end">' +
         escapeText(t('studio.learnRule.lasts', {n : Math.round(lasts)})) + '</text></svg>';
}
function substancePart(state, center, effect) {
  const receptor = center.receptors?.[effect];
  if (!receptor)
    return '';
  const doc = state.document, bound = boundSubstance(state, center, effect);
  const colour = bound ? substanceColor(bound.index) : null;
  const words = key => tList('studio.learnRule.' + key)[LEARNING_EFFECTS.indexOf(effect)];
  const choice = (value, text, on, swatch = '') =>
      '<button class="' + (on ? 'active' : '') + '" data-learn-substance="' + value +
      '" data-center-id="' + escapeText(center.id) + '" data-learn-effect="' + effect + '"' +
      (swatch ? ' style="--substance:' + swatch + '"' : '') + '>' +
      (swatch ? '<span class="aid-substance-swatch"></span>' : '') + escapeText(text) + '</button>';
  const choices =
      '<div class="aid-learn-substances" role="group" aria-label="' + escapeText(words('by')) +
      '">' + choice('off', label('learnRule.none'), !bound) +
      [
        ...doc.substances,
        {index : state.capabilities?.hormones ?? 6, name : label('inspector.maturity')}
      ]
          .map(sub => choice(String(sub.index), sub.name || substanceName(state, sub.index),
                             bound?.index === sub.index, substanceColor(sub.index)))
          .join('') +
      (doc.substances.length
           ? ''
           : '<button data-add-substance>+ ' + label('sections.newSubstance') + '</button>') +
      '</div>';
  const strength =
      bound ? learnTrack('learn-receptor', center, (1 + fullResponse(receptor)) / 2,
                         words('strength'), [ words('low'), words('high') ],
                         {middle : words('middle'), extra : ' data-learn-effect="' + effect + '"'})
            : '';
  return '<div class="aid-learn-substance' + (bound ? ' bound' : '') + '"' +
         (colour ? ' style="--substance:' + colour + '"' : '') + '><h5>' +
         glyph(EFFECT_ICON[effect], ICON.mark, {line : true}) + '<span>' + escapeText(words('by')) +
         '</span></h5>' +
         effectScene(effect, colour ?? 'currentColor', bound ? receptorEnds(receptor) : undefined) +
         choices + strength + '</div>';
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
  return items ? '<div class="aid-teacher-list">' + items + '</div>'
               : '<p class="aid-hint">' + label('learnRule.noTeacher') + '</p>';
}
const NODE_MARK = Object.freeze({marker : 6, box : 8});
function learnersOverview(state) {
  const doc = state.document, shown = new Set();
  const learners = allCenters(doc).filter(c => {
    if (!isLearner(c) || shown.has(c.id))
      return false;
    shown.add(pairEndpoint(doc, c.id));
    return true;
  });
  if (!learners.length)
    return '';
  return '<section class="aid-learn-part">' + heading(label('learnRule.overview')) +
         '<div class="aid-learners">' +
         learners
             .map(c => {
               const {modulators} = sendersOf(state, c);
               const taught = boundSubstance(state, c, HORMONE_EFFECT.teaching);
               const teachers =
                   modulators
                       .map(m => '<span class="aid-teacher-chip">' + nodeMark(m) +
                                 escapeText(centerTitle(m)) + '</span>')
                       .join('') +
                   (taught ? '<span class="aid-teacher-chip" style="--teacher:' +
                                 substanceColor(taught.index) +
                                 '"><span class="aid-teacher-dot"></span>' +
                                 escapeText(substanceName(state, taught.index)) + '</span>'
                           : '');
               const organ = findCenter(doc, c.id)?.organ;
               const name =
                   joinParts([ centerTitle(c), isRegion(organ) ? regionTerm(organ.type) : null ]);
               return '<button data-select-center="' + escapeText(c.id) + '">' + nodeMark(c) +
                      '<span>' + escapeText(name) + '</span><span class="aid-learner-teachers">' +
                      (teachers || '<small>' + label('learnRule.untaughtShort') + '</small>') +
                      '</span></button>';
             })
             .join('') +
         '</div></section>';
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
                       '" data-select-center="' + escapeText(c.id) + '">' + nodeMark(c) +
                       escapeText(centerTitle(c)) + '</button>')
             .join('') +
         '</div>';
}
export function learningInspector(state) {
  const selected = state.selected, doc = state.document;
  const chosen = chosenCenter(doc, selected, state.visionProfile);
  let html = '<header class="aid-inspector-head"><span>' + label('sections.brain') + '</span>' +
             heading(label('tools.learn')) + '</header>';
  if (!chosen || chosen.role !== 'nerve')
    return html + previewControls(state) + learnersOverview(state) +
           '<div class="aid-empty-centre">' + label('inspector.selectLearning') + '</div>';
  html += nodeChoice(state, chosen);
  const teachers = sendersOf(state, chosen);
  const section = (key, body) =>
      '<section class="aid-learn-part">' + heading(label('learnRule.' + key)) + body + '</section>';
  return html + heading(centerTitle(chosen)) + previewControls(state) +
         learningRule(state, chosen) +
         section('teacher', teacherList(state, chosen, teachers.modulators) +
                                substancePart(state, chosen, HORMONE_EFFECT.teaching)) +
         section('traceLength',
                 traceGraphic(chosen) + substancePart(state, chosen, HORMONE_EFFECT.eligibility)) +
         section('rate', learnTrack('learn-rate', chosen, chosen.qwidth, label('learnRule.rate'),
                                    [ label('learnRule.slow'), label('learnRule.fast') ]) +
                             substancePart(state, chosen, HORMONE_EFFECT.learning)) +
         section('mode',
                 learnTrack('learn-mode', chosen, (chosen.mode + 1) / 2, label('learnRule.mode'),
                            [ label('inspector.cancelling'), label('inspector.competing') ],
                            {middle : label('inspector.neutral')}) +
                     substancePart(state, chosen, HORMONE_EFFECT.competition)) +
         cellDevelopment(state, chosen) + contactPlan(state, [ chosen ]);
}
