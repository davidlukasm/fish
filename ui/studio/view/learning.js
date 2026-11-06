import {HORMONE_EFFECT} from '../../schema.js';
import {substanceColor} from '../../hormones.js';
import {PERCENT} from '../../units.js';
import {boundEffects, chosenCenter, endpointCenters, findCenter} from '../model/document.js';
import {escapeText, fixed, glyph, namedTrack, TRACK, trackShare} from './markup.js';
import {routedLinks} from '../model/regions.js';
import {t, tList} from '../../strings.js';
import {heading, ICON, label} from './kit.js';
import {receptorBody, substanceName} from './substances.js';
import {centerTitle} from './names.js';
import {isModulator} from '../model/organs.js';
import {EFFECT_ICON} from './icons.js';

// How a nerve center learns, as the engine's rule runs (colony-core/field/substrate.cc): the
// weights of what it hears (its inputs) change by how much its teaching signal surprises it
// (the change of what its excitation receptor and its modulating inputs bring, against what it
// expected), times its learning rate (its plasticity, quality width, scaled by a hormone on its
// learning receptor), in its way (its mode: cancelling below zero, neutral, competing above);
// its eligibility trace credits what it did a while ago. Each part has its own control: the
// teaching signal its teachers, the rate a track, the way a track, the trace and the hormones
// acting on each part a row that opens its receptor.
// The tracks run from LEFT to RIGHT of a graphic WIDTH wide and HEIGHT high, at Y.
const TRACKS = Object.freeze({width : 300, height : 46, range : [ 26, 274 ], y : 16});
export const learnRatePatch = fx => ({qwidth : trackShare(fx * TRACKS.width, TRACKS.range)});
export const learnModePatch = fx => ({mode : 2 * trackShare(fx * TRACKS.width, TRACKS.range) - 1});
function learnTrack(kind, center, share, title, ends, middle = '') {
  const T = TRACKS;
  return '<svg class="aid-learn-track" viewBox="0 0 ' + T.width + ' ' + T.height + '" data-' +
         kind + '="' + escapeText(center.id) + '" role="img" aria-label="' + escapeText(title) +
         '">' + namedTrack(T.range, T.y, share, 'data-graphic-handle="' + kind + '"', title, ends) +
         middle + '</svg>';
}

// The rule drawn and played: two inputs reach the cell, the upper one firing (a pulse runs along
// it), the lower one still; a teaching signal comes from above where the cell has a teacher. When
// the pulse and the teaching signal meet in the cell, the firing input's line grows (neutral and
// competing learning) or shrinks (cancelling), the more the faster the cell learns, and in
// competing learning the still input's line shrinks; without a teacher nothing changes. RULE lays
// it out: the cell, the inputs' starts, the arrows' heads, the lines' WIDTH and the most they
// change (CHANGE times the rate); the play lasts PLAY seconds, the pulse reaching the cell at
// MEET of it, the change done at DONE, held until HOLD.
const RULE = Object.freeze({
  width : 300,
  height : 196,
  cx : 170,
  cy : 104,
  r : 22,
  side : 22,
  inputs : [ 66, 142 ],
  top : 26,
  gap : 8,
  line : 15,
  head : 7,
  barb : .6,
  pulse : 4.5,
  thick : 3,
  change : 6,
  play : 3.2,
  meet : .42,
  done : .58,
  hold : .92
});
// A learning mode leans to one side beyond a third of its range either way.
const MODE_THIRD = 1 / 3;
const LEARNING_EFFECTS = Object.freeze([
  HORMONE_EFFECT.excitation, HORMONE_EFFECT.learning, HORMONE_EFFECT.competition,
  HORMONE_EFFECT.eligibility
]);
function teachersOfCenter(state, center) {
  const doc = state.document, organ = findCenter(doc, center.id)?.organ;
  const hears = new Set([ center.id, organ?.id ]);
  const links = routedLinks(doc, state.sites).filter(link => hears.has(link.to));
  const senders = links.map(link => endpointCenters(doc, link.from)[0]).filter(Boolean);
  const modulators = senders.filter(c => c.role === 'nerve' && isModulator(c));
  const hormones = state.capabilities
                       ? doc.substances
                             .map(sub => ({
                                    substance : sub,
                                    effects : boundEffects(center, sub.index, state.capabilities)
                                                  .filter(e => LEARNING_EFFECTS.includes(e))
                                  }))
                             .filter(entry => entry.effects.length)
                       : [];
  return {inputs : senders.length - modulators.length, modulators, hormones};
}
const arrowPath = (x1, y1, x2, y2) => {
  const R = RULE, dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  return 'M' + fixed(x1) + ' ' + fixed(y1) + ' L' + fixed(x2) + ' ' + fixed(y2) + ' M' +
         fixed(x2 - R.head * (ux + uy * R.barb)) + ' ' + fixed(y2 - R.head * (uy - ux * R.barb)) +
         ' L' + fixed(x2) + ' ' + fixed(y2) + ' L' + fixed(x2 - R.head * (ux - uy * R.barb)) + ' ' +
         fixed(y2 - R.head * (uy + ux * R.barb));
};
// A value held, changed between MEET and DONE, held until HOLD and back, played in a loop.
const played = (attribute, from, to) => {
  const R = RULE;
  return '<animate attributeName="' + attribute + '" values="' +
         [ from, from, to, to, from ].join(';') + '" keyTimes="0;' + R.meet + ';' + R.done + ';' +
         R.hold + ';1" dur="' + R.play + 's" repeatCount="indefinite"/>';
};
// A pulse running along a way until MEET, then gone.
const pulse = (cls, way) => {
  const R = RULE;
  return '<circle class="' + cls + '" r="' + R.pulse + '"><animateMotion path="' + way +
         '" keyPoints="0;1;1" keyTimes="0;' + R.meet + ';1" calcMode="linear" dur="' + R.play +
         's" repeatCount="indefinite"/><animate attributeName="opacity" values="1;1;0;0" ' +
         'keyTimes="0;' + R.meet + ';' + R.done + ';1" dur="' + R.play +
         's" repeatCount="indefinite"/></circle>';
};
function learningRule(state, center, teaches) {
  const R = RULE, words = (key, values) => escapeText(t('studio.learnRule.' + key, values));
  const rate = center.qwidth * R.change * (teaches ? 1 : 0);
  const firing = center.mode >= 0 ? rate : rate * (1 + 2 * center.mode);
  const still = -rate * Math.max(0, center.mode);
  const end = y => ({x : R.cx - R.r - R.gap, y : R.cy + (y - R.cy) * R.gap / R.r});
  const input = (y, change, cls) => {
    const to = end(y);
    return '<path class="aid-rule-input ' + cls + '" d="' + arrowPath(R.side, y, to.x, to.y) +
           '" stroke-width="' + R.thick + '">' +
           played('stroke-width', R.thick, fixed(Math.max(1, R.thick + change))) + '</path>';
  };
  const firingWay = 'M' + R.side + ' ' + R.inputs[0] + ' L' + fixed(end(R.inputs[0]).x) + ' ' +
                    fixed(end(R.inputs[0]).y);
  const teachWay = 'M' + R.cx + ' ' + R.top + ' L' + R.cx + ' ' + (R.cy - R.r - R.gap);
  const mode = center.mode > MODE_THIRD    ? 'competing'
               : center.mode < -MODE_THIRD ? 'cancelling'
                                           : 'neutral';
  return '<svg class="aid-learning-rule" viewBox="0 0 ' + R.width + ' ' + R.height +
         '" role="img" aria-label="' + label('inspector.learning') + '">' +
         input(R.inputs[0], firing, 'firing') + input(R.inputs[1], still, 'still') + '<text x="' +
         R.side + '" y="' + (R.inputs[0] - R.gap) + '">' + words('firing') + '</text><text x="' +
         R.side + '" y="' + (R.inputs[1] + R.line) + '">' + words('still') + '</text>' +
         pulse('aid-rule-pulse', firingWay) + '<path class="aid-rule-arrow" d="' +
         arrowPath(R.cx + R.r + R.gap, R.cy, R.width - R.side, R.cy) + '"/><text x="' +
         (R.width - R.side) + '" y="' + (R.cy - R.gap) + '" text-anchor="end">' + words('output') +
         '</text><g class="aid-rule-teach' + (teaches ? '' : ' none') +
         '"><path class="aid-rule-arrow" d="' + arrowPath(R.cx, R.top, R.cx, R.cy - R.r - R.gap) +
         '"/><text x="' + R.cx + '" y="' + (R.top - R.gap) + '" text-anchor="middle">' +
         words('teaching') + '</text>' + (teaches ? pulse('aid-rule-pulse teach', teachWay) : '') +
         '</g><circle class="aid-rule-cell" cx="' + R.cx + '" cy="' + R.cy + '" r="' + R.r + '"/>' +
         '<text x="' + R.cx + '" y="' + (R.cy + R.r + R.line + R.gap) + '" text-anchor="middle">' +
         escapeText(teaches
                        ? t('studio.learnRule.gain', {n : Math.round(center.qwidth * PERCENT)}) +
                              ' · ' + label('inspector.' + mode)
                        : t('studio.learnRule.untaught')) +
         '</text></svg>';
}
// A hormone acting on one part of learning: its symbol, its name and the substance it binds (or
// none), opening its receptor below it.
function hormoneRow(state, center, effect) {
  const receptor = center.receptors?.[effect];
  if (!receptor)
    return '';
  const open = state.effect === effect, bound = receptor.active;
  const substance =
      bound ? state.document.substances.find(s => s.index === receptor.substance) : null;
  return '<button class="aid-learn-hormone' + (open ? ' open' : '') + '" data-effect="' + effect +
         '"' + (substance ? ' style="--substance:' + substanceColor(substance.index) + '"' : '') +
         '>' + glyph(EFFECT_ICON[effect], ICON.mark, {line : true}) + '<span>' +
         escapeText(
             t('studio.learnRule.byHormoneOf', {part : tList('studio.learnRule.parts')[effect]})) +
         '</span><small>' +
         escapeText(substance ? substance.name || substanceName(state, substance.index)
                              : label('learnRule.none')) +
         '</small></button>' + (open ? receptorBody(state, center, effect) : '');
}
export function learningInspector(state) {
  const selected = state.selected, doc = state.document;
  const chosen = chosenCenter(doc, selected);
  let html = '<header class="aid-inspector-head"><span>' + label('sections.brain') + '</span>' +
             heading(label('tools.learn')) + '</header>';
  if (!chosen || chosen.role !== 'nerve')
    return html + '<div class="aid-empty-centre">' + label('inspector.selectLearning') + '</div>';
  const {modulators, hormones} = teachersOfCenter(state, chosen);
  const teaches =
      modulators.length || hormones.some(h => h.effects.includes(HORMONE_EFFECT.excitation));
  const section = (key, body) =>
      '<section class="aid-learn-part">' + heading(label('learnRule.' + key)) + body + '</section>';
  const teachers = modulators
                       .map(c => '<button data-select-center="' + escapeText(c.id) + '">' +
                                 escapeText(centerTitle(c)) + '<small>' +
                                 label('learnRule.modulator') + '</small></button>')
                       .join('');
  const T = TRACKS;
  return html + heading(centerTitle(chosen)) + learningRule(state, chosen, teaches) +
         section('teaching',
                 (teachers ? '<div class="aid-teacher-list">' + teachers + '</div>' : '') +
                     hormoneRow(state, chosen, HORMONE_EFFECT.excitation)) +
         section('rate', learnTrack('learn-rate', chosen, chosen.qwidth, label('learnRule.rate'),
                                    [ label('learnRule.slow'), label('learnRule.fast') ]) +
                             hormoneRow(state, chosen, HORMONE_EFFECT.learning)) +
         section('mode',
                 learnTrack('learn-mode', chosen, (chosen.mode + 1) / 2, label('learnRule.mode'),
                            [ label('inspector.cancelling'), label('inspector.competing') ],
                            '<text class="aid-learn-middle" x="' + T.width / 2 + '" y="' +
                                (T.y + TRACK.name) + '" text-anchor="middle">' +
                                label('inspector.neutral') + '</text>') +
                     hormoneRow(state, chosen, HORMONE_EFFECT.competition)) +
         section('trace', hormoneRow(state, chosen, HORMONE_EFFECT.eligibility));
}
