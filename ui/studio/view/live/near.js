// The near sense's live inspector, below its answers by direction: how the report falls with the
// distance.
// Read in the engine (src/retina.cc:28-33, 728-735; src/cppn_brain.cc:404-418):
//   a near cell's signal for a thing before it is 2^(-distance / reach), times the thing's
//   brightness up to one; the answer is bounded and the cell does not get used to it; from
//   hatching on it reports at once.
// NOT read: the cell's rhythm in the egg.
// The fish from above, looking to the left. Before its cell the rings: each one reach further,
// each half as bright as the one before. The curve is the report for a bright thing straight
// before a cell. The thing is the fish panel's test object at its distance, the dot under it
// what the organ's cells report of it in the engine (the strongest of them); the reach is set on
// the fish. The grip on the dashed ring sets the threshold: there the cell answers half. ASSUMED
// for the picture: a bright thing straight before the cell.
import {unitOfPlan} from '../../../tuning.js';
import {findOrgan, updateField} from '../../model/document.js';
import {organCells} from '../vision.js';
import {clamp, drag, el, liveKind, path, picture, txt} from './kit.js';
import {answer, BOUNDED, IRRITANT} from './sense.js';
import {fishAbove} from './skin.js';

const NEAR = Object.freeze({
  height : 206,
  cx : 214,
  cy : 70,
  left : 26,
  reaches : 5,
  arc : 38,
  half : 46,
  tall : 54,
  CT : 128,
  CB : 178,
  least : .02,
  most : .9
});
const radians = d => d * Math.PI / 180;

liveKind('near', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-near';
  const svgOf = () => {
    const svg = el('svg', {class : 'aid-live-picture'});
    root.appendChild(svg);
    return svg;
  };
  const rings = svgOf();
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  function drawRings(organ, profile, reach) {
    const {svg, live} =
        picture(rings, NEAR.height, fixed => fishAbove(fixed, NEAR.cx + 30, NEAR.cy, 1.3)),
                {cx, cy, CT, CB} = NEAR, far = NEAR.reaches * reach,
                unit = (cx - 10 - NEAR.left) / far, X = d => cx - 10 - unit * d,
                gate = BOUNDED.gate(profile), signal = d => Math.pow(2, -d / reach);
    const arc = (d, angle) => {
      const r = unit * d + 10, a = Math.asin(Math.min(Math.sin(radians(angle)), NEAR.tall / r));
      return `M${cx - r * Math.cos(a)} ${cy - r * Math.sin(a)} A${r} ${r} 0 0 0 ${
          cx - r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
    };
    // The rings: one reach apart, each half as bright.
    for (let k = 1; k <= NEAR.reaches; k++)
      el('path', {
        d : arc(k * reach, NEAR.arc),
        class : 'aid-live-near-ring k0',
        'stroke-width' : 1 + 5 * Math.pow(.5, k - 1),
        opacity : .25 + .75 * Math.pow(.5, k - 1)
      },
         live);
    // The report over the distance.
    const Y = v => CB - (CB - CT) * v, pts = [];
    for (let k = 0; k <= 80; k++)
      pts.push([ X(far * k / 80), Y(answer(signal(far * k / 80), gate, 0)) ]);
    el('path', {
      d : path(pts) + ` L${X(far)} ${CB} L${X(0)} ${CB} Z`,
      class : 'aid-live-petal k0',
      opacity : .55
    },
       live);
    el('path', {d : `M${X(far)} ${CB} H${X(0)}`, class : 'aid-live-rim'}, live);
    txt(live, X(0), CB + 13, 0, {'text-anchor' : 'middle', class : 'aid-live-small'});
    txt(live, X(far), CB + 13, Math.round(far),
        {'text-anchor' : 'middle', class : 'aid-live-small'});
    // The fish panel's test object at its distance, the line down to its report, and what the
    // cell reports of it.
    const probe = studio.state.sightProbe;
    if (probe && probe.distance <= far) {
      // What the cells really report of it, the strongest of them: nothing where the thing
      // lies outside their fan.
      const report = Math.max(0, ...organCells(studio.state, organ).map(cell => cell.answer)),
            tx = X(probe.distance);
      el('path', {d : `M${tx} ${cy + 9} V${Y(report)}`, class : 'aid-live-hatch'}, live);
      el('circle', {cx : tx, cy : Y(report), r : 3, class : 'aid-live-posture'}, live);
      el('circle', {cx : tx, cy, r : 7, class : 'aid-live-near-thing'}, live);
      if (report > .01)
        el('path', {
          d : IRRITANT,
          class : 'aid-live-irritant',
          transform : `translate(${cx + 4} ${cy - 22}) scale(${(.5 + 1.3 * report).toFixed(2)})`
        },
           live);
    }
    // The ring at which the cell answers half: where the signal is 2 x gate / (1 + gate). Its grip
    // sets the threshold.
    const half = Math.min(far, reach * Math.log2((1 + gate) / (2 * gate)));
    el('path', {d : arc(half, NEAR.half), class : 'aid-live-near-half'}, live);
    const r = unit * half + 10,
          a = Math.asin(Math.min(Math.sin(radians(NEAR.half)), NEAR.tall / r));
    drag(svg,
         el('circle', {cx : cx - r * Math.cos(a), cy : cy + r * Math.sin(a), r : 4.5}, live), p => {
           const x = signal(clamp((Math.hypot(p.x - cx, p.y - cy) - 10) / unit, 0, far));
           draft(updateField(studio.state.document, organId, {
             profile : {
               id : profile.id,
               threshold : BOUNDED.threshold(clamp(x / (2 - x), NEAR.least, NEAR.most))
             }
           },
                             studio.state.sites));
         }, 'neargate', 'grip', settle);
  }
  function show() {
    const organ = findOrgan(studio.state.document, organId), profile = organ?.field?.profiles[0],
          [ least, most ] = studio.state.capabilities?.nearDepth ?? [];
    if (!profile || !organ.centers.length || !(least > 0))
      return;
    drawRings(organ, profile, least * (most / least) ** unitOfPlan(profile.q2));
  }
  return {root, show, tick() {}};
});
