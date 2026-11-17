import {regionNodeMap} from './region_graph.js';
import {HORMONE_EFFECT} from '../../schema.js';
import {substanceColor} from '../../hormones.js';
import {
  allCenters,
  chosenCenter,
  endpointCenters,
  substanceBound,
  findCenter,
  isLearner,
  LEARNING_EFFECTS,
  pairEndpoint
} from '../model/document.js';
import {escapeText} from './markup.js';
import {routedLinks} from '../model/regions.js';
import {joinParts} from '../../strings.js';
import {bandGlyph, heading, icon, ICON, label} from './kit.js';
import {chemistry, substanceName} from './substances.js';
import {centerTitle, organTitle, tone} from './names.js';
import {isTeachingSource, isPacemaker, isRegion, modeLean} from '../model/organs.js';
import {cellDevelopment} from './development.js';
import {centerMarker} from './scene.js';
import {contactPlan} from './contact_plan.js';
import {livePlace} from './live/kit.js';
import './live/learn.js';

function sendersOf(state, center) {
  const doc = state.document, organ = findCenter(doc, center.id)?.organ;
  const hears = new Set([ center.id, organ?.id ]);
  const senders = routedLinks(doc, state.sites)
                      .filter(link => hears.has(link.to))
                      .map(link => endpointCenters(doc, link.from)[0])
                      .filter(Boolean);
  const modulators = senders.filter(isTeachingSource);
  const pacers = senders.filter(c => c.role === 'nerve' && isPacemaker(c));
  return {modulators, pacers};
}
const boundSubstance = (state, center, effect) => {
  const receptor = center.receptors?.[effect];
  return substanceBound(effect, receptor)
             ? {index : receptor.substance, name : substanceName(state, receptor.substance)}
             : null;
};

const MODE_NAME = Object.freeze({[-1] : 'cancelling', 0 : 'neutral', 1 : 'competing'});
export const modeName = mode => MODE_NAME[modeLean(mode)];
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
  if (isRegion(organ) && !nodes.some(c => c.band))
    return regionNodeMap(state, organ, chosen.id);
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
    return html + learnersOverview(state) + '<div class="aid-empty-centre">' +
           label('inspector.selectLearning') + '</div>';
  html += nodeChoice(state, chosen);
  const teachers = sendersOf(state, chosen);
  return html + heading(centerTitle(chosen)) + livePlace('learn', chosen) +
         teacherList(state, chosen, teachers.modulators) +
         // Which substances change this cell's learning is set at its receptors, in the hormone
         // tool; here stands what it answers to and the way there, to the first learning
         // receptor that reads a substance, else to the learning factor.
         chemistry(state, findCenter(doc, chosen.id)?.organ, chosen, [ 'hormone' ],
                   LEARNING_EFFECTS.find(effect => boundSubstance(state, chosen, effect)) ??
                       HORMONE_EFFECT.learning) +
         cellDevelopment(state, chosen) + contactPlan(state, [ chosen ]);
}
