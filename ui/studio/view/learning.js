import {HORMONE_EFFECT, TIME_CONSTANT} from '../../schema.js';
import {substanceColor} from '../../hormones.js';
import {clamp, PERCENT} from '../../units.js';
import {LONGEST_TIME_CONSTANT, timeConstantOf, timeConstantSteps} from '../../tuning.js';
import {
  allCenters,
  chosenCenter,
  endpointCenters,
  findCenter,
  isLearner,
  LEARNING_EFFECTS,
  pairEndpoint,
  receptorEnds
} from '../model/document.js';
import {escapeText, fixed, glyph, namedTrack, TRACK, trackShare} from './markup.js';
import {routedLinks} from '../model/regions.js';
import {t, tList} from '../../strings.js';
import {heading, ICON, label} from './kit.js';
import {substanceName} from './substances.js';
import {centerTitle, tone} from './names.js';
import {isModulator, isPacemaker, modeLean} from '../model/organs.js';
import {EFFECT_ICON} from './icons.js';
import {EPISODE_LAYOUT, episodeSvg} from './episode.js';
import {effectScene} from './effects.js';
import {centerMarker} from './scene.js';

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
  return receptor?.active ? state.document.substances.find(s => s.index === receptor.substance)
                          : null;
};
const fullResponse = receptor => receptorEnds(receptor).with;

const RULE = Object.freeze({
  change : 7,
  compete : 3,
  cancel : 2.4,
  expect : 1.6,
  glow : .55,
  credit : .5,
  delay : TIME_CONSTANT.min_steps
});
const traceSteps = center => timeConstantSteps(center.tau) / 2;
const remnantOf = center => Math.exp(-RULE.delay / traceSteps(center));
const MODE_NAME = Object.freeze({[-1] : 'cancelling', 0 : 'neutral', 1 : 'competing'});
export const modeName = mode => MODE_NAME[modeLean(mode)];
function learningRule(state, center, teachers, colours) {
  const L = EPISODE_LAYOUT.big, R = RULE, words = key => label('learnRule.' + key);
  const rate = center.qwidth, mode = center.mode, pacer = teachers.pacers.length > 0;
  const remnant = remnantOf(center), teaches = colours.length > 0;
  const inputs = [
    {y : L.cy - L.r * 2.6, deed : 'own', label : words('firing')},
    ...(pacer ? [ {y : L.cy, deed : 'beat', label : words('inBeat')} ] : []),
    {y : L.cy + L.r * 2.6, deed : null, label : words('still')}
  ];
  const competing = R.compete * rate * Math.max(0, mode);
  const cancelling = R.cancel * rate * Math.max(0, -mode);
  let expect = 0;
  const rounds = [ 0, 1 ].map(k => {
    const surprise = teaches ? 1 - expect : 0;
    const reward = R.change * rate * surprise * remnant;
    const own = reward * 2 * R.credit, beat = pacer ? reward * 2 * (1 - R.credit) : 0;
    const giveWay = mode >= 0 ? -(own + beat) : 0;
    const before = expect;
    if (teaches)
      expect = before + (1 - before) * Math.min(1, R.expect * rate);
    const trace = [ 2 * R.credit * R.glow, ...(pacer ? [ 2 * (1 - R.credit) * R.glow ] : []), 0 ];
    return {
      trace,
      remnant,
      teach : teaches ? colours[k % colours.length] : null,
      grow : [ competing - cancelling, ...(pacer ? [ -competing ] : []), -competing ],
      gain : [ own, ...(pacer ? [ beat ] : []), giveWay ],
      expect : [ before, expect ]
    };
  });
  const lean = label('inspector.' + modeName(mode));
  const caption = !(rate > 0) ? words('off')
                  : teaches   ? t('studio.learnRule.gain', {n : Math.round(rate * PERCENT)}) +
                                  (modeLean(mode) !== 0 ? ' · ' + lean : '')
                  : modeLean(mode) !== 0 ? t('studio.learnRule.untaughtMode', {mode : lean})
                                         : words('untaught');
  return episodeSvg(L, {
    title : label('inspector.learning'),
    inputs,
    teacher : 'arrow',
    output : true,
    rounds,
    caption,
    labels : {
      teach : words('teaching'),
      expect : words('expect'),
      beat : words('beat'),
      output : words('output')
    }
  });
}
const TRACE = Object.freeze(
    {width : 300, height : 70, left : 22, right : 280, top : 8, bottom : 46, samples : 48});
const traceAxis = LONGEST_TIME_CONSTANT;
export const learnTracePatch = fx => {
  const T = TRACE, steps = clamp((fx * T.width - T.left) / (T.right - T.left)) * traceAxis;
  return {tau : timeConstantOf(Math.max(TIME_CONSTANT.min_steps, 2 * steps))};
};
function traceGraphic(center) {
  const T = TRACE, lasts = traceSteps(center);
  const x = steps => T.left + (T.right - T.left) * steps / traceAxis;
  const y = level => T.bottom - (T.bottom - T.top) * level;
  const points = Array.from({length : T.samples + 1}, (_, k) => {
    const steps = traceAxis * k / T.samples;
    return fixed(x(steps)) + ' ' + fixed(y(Math.exp(-steps / lasts)));
  });
  const title = label('learnRule.traceLength');
  return '<svg class="aid-learn-trace" viewBox="0 0 ' + T.width + ' ' + T.height +
         '" data-learn-trace="' + escapeText(center.id) + '" role="img" aria-label="' +
         escapeText(title) + '"><path class="aid-learn-glow" d="M' + T.left + ' ' + T.bottom +
         ' L' + points.join(' L') + ' L' + T.right + ' ' + T.bottom + ' Z"/><path ' +
         'class="aid-learn-fade" d="M' + points.join(' L') +
         '"/><line class="aid-chart-axis" x1="' + T.left + '" y1="' + T.bottom + '" x2="' +
         T.right + '" y2="' + T.bottom +
         '"/><circle class="aid-graphic-handle" data-graphic-handle="learn-trace" cx="' +
         fixed(x(lasts)) + '" cy="' + fixed(y(Math.exp(-1))) + '" r="' + TRACK.handle +
         '"><title>' + escapeText(title) + '</title></circle><text x="' + T.left + '" y="' +
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
      doc.substances
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
               return '<button data-select-center="' + escapeText(c.id) + '">' + nodeMark(c) +
                      '<span>' + escapeText(centerTitle(c)) +
                      '</span><span class="aid-learner-teachers">' +
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
  const chosen = chosenCenter(doc, selected);
  let html = '<header class="aid-inspector-head"><span>' + label('sections.brain') + '</span>' +
             heading(label('tools.learn')) + '</header>';
  if (!chosen || chosen.role !== 'nerve')
    return html + learnersOverview(state) + '<div class="aid-empty-centre">' +
           label('inspector.selectLearning') + '</div>';
  html += nodeChoice(state, chosen);
  const teachers = sendersOf(state, chosen);
  const taught = boundSubstance(state, chosen, HORMONE_EFFECT.teaching);
  const colours = [
    ...(teachers.modulators.length ? [ tone('brain') ] : []),
    ...(taught ? [ substanceColor(taught.index) ] : [])
  ];
  const section = (key, body) =>
      '<section class="aid-learn-part">' + heading(label('learnRule.' + key)) + body + '</section>';
  return html + heading(centerTitle(chosen)) + learningRule(state, chosen, teachers, colours) +
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
                     substancePart(state, chosen, HORMONE_EFFECT.competition));
}
