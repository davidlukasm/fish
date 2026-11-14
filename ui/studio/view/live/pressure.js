// A sac's pressure cells in a live inspector: the nerve cell, and under it over the steps of the
// organ's trial how full the sac is (the fine line) and what the cells report to the brain. The
// threshold is the dashed line, with its grip at the left and the cells' spread at the right.
// The cells answer as the engine's bounded senses do: nothing below their threshold, the more
// the further above it.
import {activationLevel, activationQuality, planOfUnit, unitOfPlan} from '../../../tuning.js';
import {updateCellDistribution, updateCenter} from '../../model/document.js';
import {boundedAnswer} from '../sense_curves.js';
import {clamp, drag, el, path, txt} from './kit.js';

const BOX = Object.freeze(
    {left : 44, right : 290, top : 88, base : 185, height : 209, cells : 7, stride : 5});
const SPAN = activationLevel(1) - activationLevel(0);
// `filling`: the sac's fullness step by step; `reads`: whether the cells read it at all (in the
// egg the sperm cells' store stays empty); `words`: signal, full, empty, steps; `trace`: the
// class of the fullness line. Returns what the clock moves.
export function pressurePicture(svg, picture,
                                {studio, center, filling, reads, words, trace, draft, settle}) {
  const {live} = picture(svg, BOX.height), {left, right, top, base, cells, stride} = BOX,
        steps = filling.length - 1;
  const x = step => left + (right - left) * step / steps, y = v => base - (base - top) * clamp(v),
        levelAt = py => clamp((base - py) / (base - top));
  const gate = activationLevel(unitOfPlan(center.threshold)),
        spread = SPAN * center.distribution.spread_physiology,
        low = Math.max(activationLevel(0), gate - spread),
        high = Math.min(activationLevel(1), gate + spread),
        gates = Array.from({length : cells}, (_, cell) => low + (high - low) * (cell + .5) / cells);
  const sent = filling.map(
      level => reads ? gates.reduce((sum, at) => sum + boundedAnswer(level, at), 0) / cells : 0);
  const curve = samples =>
      path(samples.flatMap((sample, step) => step % stride ? [] : [ [ x(step), y(sample) ] ]));
  txt(live, left, top - 8, words.signal);
  el('rect',
     {x : left, y : top, width : right - left, height : base - top, class : 'aid-live-ground'},
     live);
  const cell = el('g', {class : 'k0 on'}, live), [ cx, cy ] = [ 150, 46 ];
  el('path', {d : 'M150 46 C154 19 179 42 184 10', class : 'aid-live-nerve-bundle'}, cell);
  el('path', {
    d : `M${cx - 13} ${cy + 5} q7 3 13 -5 q6 -13 18 -16 M${cx} ${cy} l-11 12 m5 -1 l-2 6 M${cx} ${
        cy} l4 15`,
    class : 'aid-live-nerve-fibre'
  },
     cell);
  el('circle', {cx, cy, r : 5.5, class : 'aid-live-soma on'}, cell);
  const pulse = el('circle', {cx : cx + 6, cy : cy - 10, r : 0, class : 'aid-live-pulse'}, cell);
  const plot = el('g', {class : 'k0 on'}, live);
  el('path',
     {d : curve(sent) + ` L${right} ${base} H${left} Z`, class : 'aid-bladder-response-fill'},
     plot);
  el('path', {d : curve(sent), class : 'aid-bladder-response on'}, plot);
  el('path', {d : `M${left} ${y(gate)} H${right}`, class : 'aid-live-keyline on'}, plot);
  el('path', {d : curve(filling), class : trace}, live);
  el('path', {d : `M${left} ${top} V${base} H${right}`, class : 'aid-live-axis'}, live);
  txt(live, left - 20, top + 9, words.full, {'text-anchor' : 'end'});
  txt(live, left - 20, base, words.empty, {'text-anchor' : 'end'});
  txt(live, left, base + 15, words.steps);
  for (const step of [steps / 3, 2 * steps / 3])
    txt(live, x(step), base + 15, Math.round(step), {'text-anchor' : 'middle'});
  txt(live, right, base + 15, steps, {'text-anchor' : 'end'});
  drag(svg,
       el('rect', {
         x : left - 17,
         y : y(gate) - 4,
         width : 15,
         height : 8,
         rx : 2,
         class : 'aid-live-keygrip on'
       },
          plot),
       p => draft(updateCenter(studio.state.document, center.id,
                               {threshold : planOfUnit(activationQuality(levelAt(p.y)))})),
       'gate', 'grip', settle);
  const spreadY = Math.min(y(high), y(gate) - 4);
  el('path', {d : `M${right - 8} ${spreadY} V${y(gate)}`, class : 'aid-live-spread'}, live);
  drag(svg, el('circle', {cx : right - 8, cy : spreadY, r : 4}, live),
       p => draft(updateCellDistribution(studio.state.document, center.id, 'spread_physiology',
                                         clamp((levelAt(p.y) - gate) / SPAN))),
       'spread', 'grip', settle);
  const now = el('path', {class : 'aid-live-now'}, live);
  return step => {
    now.setAttribute('d', `M${x(step).toFixed(1)} ${top} V${base}`);
    pulse.setAttribute('r', (4 * (sent[Math.floor(step)] ?? 0)).toFixed(1));
  };
}
