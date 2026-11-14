// What a muscle's settings do, in two pictures of their own below the picture of what it moves,
// each named by what the muscle does: thrust, suction, bite, raised spines, pumped water or the
// gut's drive.
// Force: one bar per node, as tall as the node's cells pull together; the reserve nodes (outlined)
// join only a strong command, the others pull whenever the muscle works. Below, the command from
// faint to strong with the gate: a weaker command leaves the muscle still. The gut wall's cells
// are the exception: its drive is the mean of its cells' (body_plan.cc, continuous_organs), so more
// of them cost more but drive it no harder.
// Endurance: the force the muscle holds over steps of all-out effort for its fibre mix, between
// the lasting (red) and the fast (white) extreme, and what its rest and its work cost.
import {ATELIER_LIMITS, MUSCLE_FIBRE} from '../../schema.js';
import {clamp} from '../../units.js';
import {enduranceCurve, fibreCost, fibreForce, fibreHex, fibreUpkeep} from '../../fibre.js';
import {isFibrous, muscleFibre, sprintNodes} from '../model/document.js';
import {kindNodes} from '../model/organs.js';
import {gateHandle, handleWord} from './sense_marks.js';
import {escapeText, fixed} from './markup.js';
import {percent, t} from '../../strings.js';

const word = (key, values) => t('studio.muscle.' + key, values);
// What the muscle does, by its code (effectors.js gives the gills and the gut wall their own).
const effect = code => word('effect.' + code);
const PULL = Object.freeze({
  width : 300,
  height : 156,
  left : 40,
  right : 284,
  top : 18,
  base : 96,
  gap : 4,
  title : 12,
  groups : 110,
  track : 138,
  words : 130,
  handle : 5.5,
  // A few free places beyond the last node keep the bars a size one can grab, however many places
  // the muscle could fill.
  room : 2,
  least : 4
});
const ENDURE = Object.freeze({
  width : 300,
  height : 132,
  left : 40,
  right : 284,
  top : 14,
  base : 84,
  steps : 160,
  title : 12,
  axis : 98,
  costs : [ 112, 124 ],
  // The cost bars start clear of their words.
  bar : 124,
  thick : 6,
  handle : 5.5
});
const text = (cls, x, y, content, anchor = 'start') =>
    '<text class="' + cls + '" x="' + fixed(x) + '" y="' + fixed(y) + '" text-anchor="' + anchor +
    '">' + escapeText(content) + '</text>';
const upright = (x, y, content) =>
    '<text class="aid-handle-word" transform="translate(' + fixed(x) + ' ' + fixed(y) +
    ') rotate(-90)" text-anchor="middle">' + escapeText(content) + '</text>';
const grip = (name, p, title, frame, extra = '') =>
    '<circle class="aid-graphic-handle" data-effector-handle="' + name + '" data-frame="' +
    frame.width + ',' + frame.height + '"' + extra + ' cx="' + fixed(p.x) + '" cy="' + fixed(p.y) +
    '" r="' + PULL.handle + '"><title>' + escapeText(title) + '</title></circle>';
const svg = (frame, organ, code, side, attributes, label, body) =>
    '<svg class="aid-effector-graphic aid-muscle-picture" viewBox="0 0 ' + frame.width + ' ' +
    frame.height + '" data-effector-graphic="' + escapeText(organ.id) + '" data-effector-code="' +
    code + '" data-effector-side="' + side + '"' + attributes + ' role="img" aria-label="' +
    escapeText(label) + '">' + body + '</svg>';

function pullPicture(state, organ, code, side, most, attributes) {
  const P = PULL, nodes = kindNodes(organ), reserve = sprintNodes(organ);
  const axis = effect(code);
  const places = clamp(nodes.length + P.room, P.least, Math.max(most, P.least));
  const slot = (P.right - P.left) / places, regular = nodes.length - reserve;
  const height = copies => (P.base - P.top) * copies / ATELIER_LIMITS.max_copies;
  const bars = nodes
                   .map((center, k) => {
                     const x = P.left + k * slot + P.gap / 2, h = height(center.copies);
                     return '<rect class="aid-pull-bar' + (k >= regular ? ' reserve' : '') +
                            '" x="' + fixed(x) + '" y="' + fixed(P.base - h) + '" width="' +
                            fixed(slot - P.gap) + '" height="' + fixed(h) + '"/>';
                   })
                   .join('');
  const free = nodes.length < most
                   ? '<rect class="aid-pull-free" x="' +
                         fixed(P.left + nodes.length * slot + P.gap / 2) + '" y="' + P.top +
                         '" width="' + fixed(slot - P.gap) + '" height="' + (P.base - P.top) + '"/>'
                   : '';
  const first = nodes[0], top = {x : P.left + slot / 2, y : P.base - height(first.copies)};
  const split = {x : P.left + regular * slot, y : P.base};
  const groupWord = (from, to, key) =>
      to > from
          ? text('aid-handle-word', P.left + (from + to) / 2 * slot, P.groups, word(key), 'middle')
          : '';
  const count = {x : P.left + nodes.length * slot, y : (P.top + P.base) / 2};
  const center = organ.centers[0];
  const gate = center?.role === 'motor'
                   ? '<path class="aid-gate-track" d="M' + P.left + ' ' + P.track + ' H' + P.right +
                         '"/>' + text('aid-handle-word', P.left, P.words, word('faint')) +
                         text('aid-handle-word', P.right, P.words, word('strong'), 'end') +
                         gateHandle({x : P.right, y : P.track}, {x : P.left, y : P.track}, state,
                                    center, t('studio.inspector.motorGate'))
                   : '';
  return svg(P, organ, code, side, attributes, axis,
             '<path class="aid-sense-axis" d="M' + P.left + ' ' + P.top + ' V' + P.base + ' H' +
                 P.right + '"/>' + upright(P.title, (P.top + P.base) / 2, axis) + free + bars +
                 groupWord(0, regular, 'always') + groupWord(regular, nodes.length, 'strongOnly') +
                 grip('strength', top, word('strengthHandle'), P) +
                 handleWord(top, word('strengthWord', {n : first.copies}), 'above') +
                 (organ.type === 'muscle'
                      ? grip('sprint', split, word('sprintHandle'), P,
                             ' data-left="' + P.left + '" data-slot="' + fixed(slot) + '"')
                      : '') +
                 grip('nodes', count, word('nodesHandle'), P,
                      ' data-left="' + P.left + '" data-slot="' + fixed(slot) + '"') +
                 gate);
}
// The force a mix holds over all-out effort, relative to the strongest fast stroke.
function endurancePicture(organ, code, side, attributes) {
  const E = ENDURE, fast = muscleFibre(organ), full = MUSCLE_FIBRE.force_fast;
  const x = k => E.left + (E.right - E.left) * k / (E.steps - 1),
        y = f => E.base - (E.base - E.top) * f / full;
  const line = (f, cls) =>
      '<path class="' + cls + '" stroke="' + fibreHex(f) + '" d="M' +
      enduranceCurve(f, E.steps).map((v, k) => fixed(x(k)) + ' ' + fixed(y(v))).join(' L') + '"/>';
  const start = {x : E.left, y : y(fibreForce(fast))};
  const cost = (k, key, value, most) =>
      text('aid-handle-word', E.left, E.costs[k], word('fibre.' + key)) +
      '<rect class="aid-cost-bar" x="' + E.bar + '" y="' + (E.costs[k] - E.thick) + '" width="' +
      fixed((E.right - E.bar) * value / most) + '" height="' + E.thick + '"/>';
  return svg(
      E, organ, code, side, attributes, word('fibre.time', {n : E.steps}),
      '<path class="aid-sense-axis" d="M' + E.left + ' ' + E.top + ' V' + E.base + ' H' + E.right +
          '"/>' + upright(E.title, (E.top + E.base) / 2, effect(code)) +
          line(0, 'aid-endure-edge') + line(1, 'aid-endure-edge') + line(fast, 'aid-endure-line') +
          text('aid-handle-word', E.right, E.axis, word('fibre.time', {n : E.steps}), 'end') +
          grip('fibre', start, word('fibre.handle'), E) +
          handleWord(start, word('fibre.word', {share : percent(fast)}), 'right') +
          cost(0, 'rest', fibreUpkeep(fast), MUSCLE_FIBRE.upkeep_slow) +
          cost(1, 'work', fibreCost(fast), MUSCLE_FIBRE.cost_fast));
}
export const musclePictures = (state, organ, code, side, most, attributes) =>
    pullPicture(state, organ, code, side, most, attributes) +
    (isFibrous(organ) ? endurancePicture(organ, code, side, '') : '');

// The change a handle makes, from the pointer `p` in its picture's units.
export function musclePatch(name, p, marks, most, organ) {
  if (name === 'strength')
    return {
      copies : Math.max(1, Math.round(clamp((PULL.base - p.y) / (PULL.base - PULL.top)) *
                                      ATELIER_LIMITS.max_copies))
    };
  const slots = () => (p.x - Number(marks.left)) / Number(marks.slot);
  if (name === 'nodes')
    return {nodes : clamp(Math.round(slots()), 1, most)};
  if (name === 'sprint') {
    const count = kindNodes(organ).length;
    return {sprint : count ? 1 - clamp(Math.round(slots()), 0, count) / count : 0};
  }
  if (name === 'fibre') {
    const force = MUSCLE_FIBRE.force_fast * clamp((ENDURE.base - p.y) / (ENDURE.base - ENDURE.top));
    return {
      fibre : clamp(Math.log(Math.max(force, MUSCLE_FIBRE.force_slow) / MUSCLE_FIBRE.force_slow) /
                    Math.log(MUSCLE_FIBRE.force_fast / MUSCLE_FIBRE.force_slow))
    };
  }
  return null;
}
