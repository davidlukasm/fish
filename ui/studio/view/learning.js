import {HORMONE_EFFECT} from '../../schema.js';
import {substanceColor} from '../../hormones.js';
import {PERCENT} from '../../units.js';
import {boundEffects, chosenCenter, endpointCenters, findCenter} from '../model/document.js';
import {escapeText, fixed, padPoint, padValues, pointMarks} from './markup.js';
import {routedLinks} from '../model/regions.js';
import {joinParts, t, tList} from '../../strings.js';
import {heading, label} from './kit.js';
import {receptorEditor, substanceName} from './substances.js';
import {centerTitle} from './names.js';
import {isModulator} from '../model/organs.js';

// How a nerve center learns: its learning pad, the rule its teachers drive, its inspector.
// Every nerve cell learns with its plasticity (quality width); its mode chooses cancelling (< 0),
// neutral or competitive (> 0) learning (colony-core/field/substrate.hh, cell_class). The pad
// sets both: across the mode, up the plasticity.
export const LEARNING_PAD = Object.freeze({width : 220, height : 120, inset : 12, marker : 7});
export function learningPatch(fx, fy) {
  const {across, up} = padValues(LEARNING_PAD, fx, fy);
  return {mode : across, qwidth : up};
}
export const learningMarks = center =>
    pointMarks(padPoint(LEARNING_PAD, center.mode, center.qwidth));
function learningPad(center) {
  const pad = LEARNING_PAD, across = pad.width - 2 * pad.inset, up = pad.height - 2 * pad.inset;
  const {x, y} = padPoint(pad, center.mode, center.qwidth);
  return '<svg class="aid-learning-pad" data-learning-pad="' + escapeText(center.id) +
         '" viewBox="0 0 ' + pad.width + ' ' + pad.height + '" tabindex="0" role="img" ' +
         'aria-label="' + label('inspector.learningMode') + '"><rect class="aid-pad-cancel" x="' +
         pad.inset + '" y="' + pad.inset + '" width="' + across / 2 + '" height="' + up +
         '"/><rect class="aid-pad-compete" x="' + (pad.inset + across / 2) + '" y="' + pad.inset +
         '" width="' + across / 2 + '" height="' + up + '"/><path d="M' + (pad.inset + across / 2) +
         ' ' + pad.inset + ' V' + (pad.height - pad.inset) +
         '"/><circle class="aid-vector-point" cx="' + fixed(x) + '" cy="' + fixed(y) + '" r="' +
         pad.marker + '"/></svg>' +
         '<div class="aid-range-hints"><span>' + label('inspector.cancelling') + '</span><span>' +
         label('inspector.neutral') + '</span><span>' + label('inspector.competing') +
         '</span></div>';
}
// How a nerve center learns, as the engine's rule runs (colony-core/field/substrate.cc): the
// weights of what it hears (its inputs) change by how much its teaching signal surprises it
// (the change of what its excitation receptor and its modulating inputs bring, against what it
// expected), times its gain (its plasticity, scaled by a hormone on its learning receptor), in
// its way (cancelling, neutral or competing); its eligibility trace credits its own activity or
// its pacemaker's play. RULE lays the drawing out: the cell, the input and output arrows, the
// teaching arrow from above and the lines below.
const RULE = Object.freeze({
  width : 300,
  height : 178,
  cx : 150,
  cy : 92,
  r : 22,
  side : 20,
  top : 26,
  gap : 8,
  line : 15,
  head : 7,
  barb : .6
});
// A learning mode leans to one side beyond a third of its range either way.
const MODE_THIRD = 1 / 3;
const LEARNING_EFFECTS = Object.freeze([
  HORMONE_EFFECT.excitation, HORMONE_EFFECT.learning, HORMONE_EFFECT.eligibility,
  HORMONE_EFFECT.competition
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
function learningRule(state, center) {
  const R = RULE, {inputs, modulators, hormones} = teachersOfCenter(state, center);
  const words = (key, values) => escapeText(t('studio.learnRule.' + key, values));
  const arrow = (x1, y1, x2, y2) => {
    const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    return '<path class="aid-rule-arrow" d="M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2 + ' M' +
           fixed(x2 - R.head * (ux + uy * R.barb)) + ' ' + fixed(y2 - R.head * (uy - ux * R.barb)) +
           ' L' + x2 + ' ' + y2 + ' L' + fixed(x2 - R.head * (ux - uy * R.barb)) + ' ' +
           fixed(y2 - R.head * (uy + ux * R.barb)) + '"/>';
  };
  const mode = center.mode > MODE_THIRD    ? 'competing'
               : center.mode < -MODE_THIRD ? 'cancelling'
                                           : 'neutral';
  const teaches =
      modulators.length || hormones.some(h => h.effects.includes(HORMONE_EFFECT.excitation));
  const svg =
      '<svg class="aid-learning-rule" viewBox="0 0 ' + R.width + ' ' + R.height +
      '" role="img" aria-label="' + label('inspector.learning') + '">' +
      arrow(R.side, R.cy, R.cx - R.r - R.gap, R.cy) +
      arrow(R.cx + R.r + R.gap, R.cy, R.width - R.side, R.cy) + '<g class="' +
      (teaches ? 'aid-rule-teach' : 'aid-rule-teach none') + '">' +
      arrow(R.cx, R.top, R.cx, R.cy - R.r - R.gap) + '<text x="' + R.cx + '" y="' +
      (R.top - R.gap) + '" text-anchor="middle">' + words('teaching') + '</text></g>' +
      '<circle class="aid-rule-cell" cx="' + R.cx + '" cy="' + R.cy + '" r="' + R.r + '"/>' +
      '<text x="' + R.side + '" y="' + (R.cy - R.gap) + '">' + words('inputs', {n : inputs}) +
      '</text><text x="' + (R.width - R.side) + '" y="' + (R.cy - R.gap) + '" text-anchor="end">' +
      words('output') + '</text><text x="' + R.cx + '" y="' + (R.cy + R.r + R.line + R.gap) +
      '" text-anchor="middle">' + escapeText(joinParts([
        words('gain', {n : Math.round(center.qwidth * PERCENT)}), label('inspector.' + mode)
      ])) +
      '</text></svg>';
  const teacherRows =
      modulators
          .map(c => '<button data-select-center="' + escapeText(c.id) + '">' +
                    escapeText(centerTitle(c)) + '<small class="aid-bound-effect">' +
                    words('modulator') + '</small></button>')
          .join('') +
      hormones
          .map(({substance, effects}) =>
                   '<button data-select-substance="' + substance.index + '" style="--substance:' +
                   substanceColor(substance.index) + '"><span class="aid-substance-swatch">' +
                   '</span>' + escapeText(substance.name || substanceName(state, substance.index)) +
                   effects
                       .map(e => '<small class="aid-bound-effect">' +
                                 escapeText(tList('studio.learnRule.parts')[e]) + '</small>')
                       .join('') +
                   '</button>')
          .join('');
  return '<section class="aid-learning">' + heading(label('inspector.learning')) + svg +
         '<div class="aid-teachers">' + heading(words('teachers')) +
         (teacherRows ? '<div class="aid-teacher-list">' + teacherRows + '</div>'
                      : '<div class="aid-empty-centre">' + words('noTeacher') + '</div>') +
         '</div></section>';
}
export function learningInspector(state) {
  const selected = state.selected, doc = state.document;
  const chosen = chosenCenter(doc, selected);
  let html = '<header class="aid-inspector-head"><span>' + label('sections.brain') + '</span>' +
             heading(label('tools.learn')) + '</header>';
  if (!chosen || chosen.role !== 'nerve')
    return html + '<div class="aid-empty-centre">' + label('inspector.selectLearning') + '</div>';
  html += heading(centerTitle(chosen)) + learningRule(state, chosen) +
          heading(label('inspector.learningMap')) + learningPad(chosen);
  const effect = LEARNING_EFFECTS.includes(state.effect) ? state.effect : HORMONE_EFFECT.learning;
  const receptor = chosen.receptors?.[effect];
  if (!receptor)
    return html;
  return html + heading(t('studio.learnRule.byHormone')) +
         receptorEditor(state, chosen, LEARNING_EFFECTS, effect,
                        value => tList('studio.learnRule.parts')[value]);
}
