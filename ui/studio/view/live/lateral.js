// The lateral line's live inspector: a rose round the fish, what its cells report of a current
// over time.
// Read in the engine (body_plan.cc, the skin cells' wedge of weights and the flow stimulus;
// embryo.cc; brain_interface.hh, intensity_sense): the body's rim has 16 sectors; the cells weigh
// them by a wedge round their own place, 22.5 to 180 degrees wide, the weights summing to one.
// Their stimulus is, summed over the sectors by weight, the water's speed against the fish there
// as far as it comes against the cells' own place. It has no upper bound, and the cells get used
// to it. In the egg they feel the fluid the embryo's own twitches move.
// The current is the fish panel's probe (probes.js); it reaches every sector as far as that faces
// it (werkzeug/atelier.cc, the flow scene). The weights are the plan's report (anatomy.lateral).
// Not in the pictures: sediment; the fish's own speed and turning apart from the water's.
import {t} from '../../../strings.js';
import {contactFieldOf, contactHalfAngle} from '../../../tuning.js';
import {findOrgan, groupReport, updateCenter} from '../../model/document.js';
import {clamp, drag, el, liveKind, path, picture} from './kit.js';
import {INTENSITY, keysOf, senseCourse, STEPS} from './sense.js';
import {fishAbove} from './skin.js';

const word = (key, values) => t('studio.live.lateral.' + key, values);
const ROUND_MS = 12000;
const ROSE =
    Object.freeze({height : 180, cx : 150, cy : 90, body : 30, petal : 22, water : 64, fish : .68});
const radians = d => d * Math.PI / 180, degrees = r => r * 180 / Math.PI;
const turnTo = a => ((a + 540) % 360) - 180;
// A sector's angle from the snout, to the fish's right, in degrees (simulation_types.hh,
// sector_angle).
const sectorAngle = (k, count) => -180 + (k + .5) * 360 / count;
// A place round the fish, which is drawn snout to the left with its right side down.
const roseAt =
    (angle, r) => [ROSE.cx - r * Math.cos(radians(angle)), ROSE.cy + r * Math.sin(radians(angle))];

liveKind('lateral', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-lateral aid-live-sense-flow';
  const heading = words => {
    const h = document.createElement('h4');
    h.textContent = words;
    root.appendChild(h);
    return h;
  };
  const svgOf = () => {
    const svg = el('svg', {class : 'aid-live-picture'});
    root.appendChild(svg);
    return svg;
  };
  const rose = svgOf();
  heading(word('cells'));
  const flow = svgOf();
  // What is tried on the cells over time: not part of the fish.
  const own = {chosen : 0, input : {rise : 80, height : .8, stop : 560}};
  let step = 0, share = 0;
  const organ = () => findOrgan(studio.state.document, organId);
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  const again = () => show();
  const course = senseCourse(flow, {
    name : 'flow',
    own,
    tires : true,
    after : 120,
    most : 1,
    scale : INTENSITY,
    words : {course : word('course'), used : word('used'), steps : word('steps')},
    keys : () => keysOf([ {id : '', centers : organ().centers} ], INTENSITY),
    share : () => share,
    doc : () => studio.state.document,
    draft,
    settle,
    redraw : again
  });
  // The rose: each sector of the rim as a petal, as long as the cells weigh it; the grip at its
  // edge sets the field's width. Round it the water of the fish panel's current: an arrow at
  // every sector it reaches, bright where the cells take it.
  function drawRose(cell, weights) {
    const {svg, live} =
        picture(rose, ROSE.height, fixed => fishAbove(fixed, ROSE.cx - 3, ROSE.cy, ROSE.fish)),
                count = weights.length, most = Math.max(...weights, Number.EPSILON),
                arc = 360 / count;
    // The cells' own place: where their weights point.
    const place = degrees(Math.atan2(
        weights.reduce((sum, v, k) => sum + v * Math.sin(radians(sectorAngle(k, count))), 0),
        weights.reduce((sum, v, k) => sum + v * Math.cos(radians(sectorAngle(k, count))), 0)));
    const probe = studio.state.senseProbe?.kind === 'flow' ? studio.state.senseProbe : null,
          against = probe ? Math.max(0, Math.cos(radians(probe.bearing - place))) : 0;
    el('circle', {cx : ROSE.cx, cy : ROSE.cy, r : ROSE.body, class : 'aid-live-rim'}, live);
    let met = 0;
    weights.forEach((v, k) => {
      const a = sectorAngle(k, count), out = ROSE.body + ROSE.petal * v / most;
      if (v > 0)
        el('path', {
          d : path([
                roseAt(a - arc / 2 + 2, ROSE.body), roseAt(a - arc / 2 + 2, out),
                roseAt(a, out + 1.5), roseAt(a + arc / 2 - 2, out),
                roseAt(a + arc / 2 - 2, ROSE.body)
              ]) + 'Z',
          class : 'aid-live-petal k0',
          opacity : .35 + .65 * v / most
        },
           live);
      if (!probe)
        return;
      const reach = Math.max(0, Math.cos(radians(a - probe.bearing)));
      met += v * reach;
      if (reach < .06)
        return;
      // The water runs from where the current comes towards the fish.
      const [x, y] = roseAt(a, ROSE.water), ux = Math.cos(radians(probe.bearing)),
                uy = -Math.sin(radians(probe.bearing)), long = 4 + 9 * reach;
      el('path', {
        d : `M${x - ux * long} ${y - uy * long} L${x + ux * long} ${y + uy * long} m${
            - 4.5 * ux + 3 * uy} ${- 4.5 * uy - 3 * ux} L${x + ux * long} ${y + uy * long} l${
            - 4.5 * ux - 3 * uy} ${- 4.5 * uy + 3 * ux}`,
        class : 'aid-live-water',
        opacity : .3 + .7 * (v > 0 ? against : 0)
      },
         live);
    });
    share = met * against;
    const [px, py] = roseAt(place, ROSE.body),
               [ gx, gy ] =
                   roseAt(place + Math.min(contactHalfAngle(cell.field ?? 0), 179), ROSE.body + 7);
    el('rect', {
      x : px - 3.5,
      y : py - 3.5,
      width : 7,
      height : 7,
      rx : 2,
      class : 'aid-live-keygrip k0 on',
      'pointer-events' : 'none'
    },
       live);
    drag(svg, el('circle', {cx : gx, cy : gy, r : 4.5}, live), p => {
      const angle = degrees(Math.atan2(p.y - ROSE.cy, ROSE.cx - p.x));
      draft(updateCenter(studio.state.document, cell.id,
                         {field : contactFieldOf(Math.abs(turnTo(angle - place)))}));
    }, 'lateralfield', 'grip', settle);
  }
  function show() {
    const line = organ(), cell = line?.centers[0];
    if (!cell)
      return;
    const weights =
        groupReport(studio.state.document, studio.state.anatomy, 'lateral', cell.id)?.weights;
    if (weights)
      drawRose(cell, weights);
    course.draw();
    tick(0);
  }
  function tick(dt) {
    step = (step + dt * STEPS / ROUND_MS) % STEPS;
    course.moment(step);
    course.pulse(dt, step);
  }
  return {root, show, tick};
});
