import {HORMONE_EFFECT, TIME_CONSTANT} from '../../schema.js';
import {substanceColor} from '../../hormones.js';
import {clamp, PERCENT} from '../../units.js';
import {LONGEST_TIME_CONSTANT, timeConstantOf, timeConstantSteps} from '../../tuning.js';
import {chosenCenter, endpointCenters, findCenter} from '../model/document.js';
import {escapeText, fixed, glyph, namedTrack, TRACK, trackShare} from './markup.js';
import {routedLinks} from '../model/regions.js';
import {t, tList} from '../../strings.js';
import {heading, ICON, label} from './kit.js';
import {substanceName} from './substances.js';
import {centerTitle, tone} from './names.js';
import {isModulator, isPacemaker} from '../model/organs.js';
import {EFFECT_ICON, TEACH_ICON} from './icons.js';
import {EPISODE_LAYOUT, episodeSvg, lessonScene} from './episode.js';
import {centerMarker} from './scene.js';

// How a nerve center learns, as the engine's rule runs it (colony-core/field/substrate.cc), drawn
// as a learning episode (episode.js): the rule as this cell has it on top, then its four parts,
// each with its own control and with what a substance can do to it, played:
// - the teaching signal: the modulators reaching the cell and a substance whose rise teaches;
// - the learning rate (its plasticity), and a substance changing it, up to twice or down to none;
// - the way it learns without a teacher (its mode: cancelling, neutral, competing), and a
//   substance changing its competition;
// - the trace: how long it lasts (the cell's time constant) and what it credits, its own firing
//   or its pacemaker's beat, a substance shifting that.
// The tracks run from LEFT to RIGHT of a graphic WIDTH wide and HEIGHT high, at Y.
const TRACKS = Object.freeze({width : 300, height : 50, range : [ 26, 274 ], y : 20});
export const learnRatePatch = fx => ({qwidth : trackShare(fx * TRACKS.width, TRACKS.range)});
export const learnModePatch = fx => ({mode : 2 * trackShare(fx * TRACKS.width, TRACKS.range) - 1});
// A substance's track sets the response with plenty of it, from -1 to 1 along the track.
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
// What reaches the cell: how many plain inputs, its modulators and pacemakers.
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
// The substance a receptor of the cell binds, when it is active.
const boundSubstance = (state, center, effect) => {
  const receptor = center.receptors?.[effect];
  return receptor?.active ? state.document.substances.find(s => s.index === receptor.substance)
                          : null;
};
// The response a receptor gives with plenty of its substance.
const fullResponse = receptor => clamp(receptor.baseline + receptor.sensitivity, -1);

// The rule as the cell has it, in two rounds: TEACH_DELAY steps after its deed the teaching
// signal comes, when it has a teacher (modulators teach in their colour, a substance in its own);
// what is left of the trace then follows the trace's time (half the time constant). Lines change
// by CHANGE at full rate, surprise and trace; competition and cancelling by COMPETE and CANCEL
// times the rate and the mode's lean; the expectation rises by EXPECT times rate times surprise;
// a trace glows GLOW at the default credit (half own firing, half beat).
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
// A learning mode leans to one side beyond a third of its range either way.
const MODE_THIRD = 1 / 3;
const modeName = mode => mode > MODE_THIRD    ? 'competing'
                         : mode < -MODE_THIRD ? 'cancelling'
                                              : 'neutral';
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
    // A neutral or competing cell keeps its strength, so the still line gives way.
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
                  : teaches
                      ? t('studio.learnRule.gain', {n : Math.round(rate * PERCENT)}) + ' · ' + lean
                  : Math.abs(mode) > MODE_THIRD ? t('studio.learnRule.untaughtMode', {mode : lean})
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
// The trace: a glow fading as the engine's trace does (half the time constant), over the steps
// up to the longest trace twice (SPAN of the longest time constant); its handle at the trace's
// time sets it. TRACE lays it out: the plot's left, right, top and bottom, SAMPLES points.
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
// A substance acting on one part of learning: what it does played (in its colour once bound),
// which substance it is (or none) and, once bound, a track of what plenty of it does, its ends
// and middle named as that part has them.
const LESSON = Object.freeze({
  [HORMONE_EFFECT.excitation] : 'teaching',
  [HORMONE_EFFECT.learning] : 'learning',
  [HORMONE_EFFECT.competition] : 'competition',
  [HORMONE_EFFECT.eligibility] : 'eligibility'
});
const PART_ICON = Object.freeze({
  [HORMONE_EFFECT.excitation] : TEACH_ICON,
  [HORMONE_EFFECT.learning] : EFFECT_ICON[HORMONE_EFFECT.learning],
  [HORMONE_EFFECT.competition] : EFFECT_ICON[HORMONE_EFFECT.competition],
  [HORMONE_EFFECT.eligibility] : EFFECT_ICON[HORMONE_EFFECT.eligibility]
});
function substancePart(state, center, effect) {
  const receptor = center.receptors?.[effect];
  if (!receptor)
    return '';
  const doc = state.document, bound = boundSubstance(state, center, effect);
  const colour = bound ? substanceColor(bound.index) : null;
  const words = key => tList('studio.learnRule.' + key)[effect];
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
         glyph(PART_ICON[effect], ICON.mark, {line : true}) + '<span>' + escapeText(words('by')) +
         '</span></h5>' + lessonScene(LESSON[effect], colour ?? 'currentColor') + choices +
         strength + '</div>';
}
// The cell's teachers: its modulators with their markers, each a button choosing it, and the
// substance teaching it with its colour.
function teacherList(state, center, modulators) {
  const taught = boundSubstance(state, center, HORMONE_EFFECT.excitation);
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
// A node's marker in its button, MARKER wide in a box of BOX.
const NODE_MARK = Object.freeze({marker : 6, box : 8});
const nodeMark = c => {
  const B = NODE_MARK.box;
  return '<svg class="aid-node-mark" viewBox="' + -B + ' ' + -B + ' ' + 2 * B + ' ' + 2 * B +
         '" aria-hidden="true">' + centerMarker(c, NODE_MARK.marker) + '</svg>';
};
// The nerve nodes of the chosen node's organ (a brain region's), each a button choosing it: any
// of them can learn.
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
    return html + '<div class="aid-empty-centre">' + label('inspector.selectLearning') + '</div>';
  html += nodeChoice(state, chosen);
  const teachers = sendersOf(state, chosen);
  const taught = boundSubstance(state, chosen, HORMONE_EFFECT.excitation);
  const colours = [
    ...(teachers.modulators.length ? [ tone('brain') ] : []),
    ...(taught ? [ substanceColor(taught.index) ] : [])
  ];
  const section = (key, body) =>
      '<section class="aid-learn-part">' + heading(label('learnRule.' + key)) + body + '</section>';
  return html + heading(centerTitle(chosen)) + learningRule(state, chosen, teachers, colours) +
         section('teaching', teacherList(state, chosen, teachers.modulators) +
                                 substancePart(state, chosen, HORMONE_EFFECT.excitation)) +
         section('rate', learnTrack('learn-rate', chosen, chosen.qwidth, label('learnRule.rate'),
                                    [ label('learnRule.slow'), label('learnRule.fast') ]) +
                             substancePart(state, chosen, HORMONE_EFFECT.learning)) +
         section('mode',
                 learnTrack('learn-mode', chosen, (chosen.mode + 1) / 2, label('learnRule.mode'),
                            [ label('inspector.cancelling'), label('inspector.competing') ],
                            {middle : label('inspector.neutral')}) +
                     substancePart(state, chosen, HORMONE_EFFECT.competition)) +
         section('trace',
                 traceGraphic(chosen) + substancePart(state, chosen, HORMONE_EFFECT.eligibility));
}
