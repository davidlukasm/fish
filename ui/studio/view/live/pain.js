// The skin's pain cells' live inspector: the fish with its wound, what the cells report of it
// while it closes.
// Read in the engine (physiology.hh, harm_body; body_plan.cc, the skin cells' wedge of weights and
// the damage stimulus; physiology.cc, healing; feeding.cc and physiology_parameters.cc, bite_wound;
// embryo.cc): every harm takes from the fish's health; a bite is booked on the sector it comes
// from, split between the two nearest sector centres. Pain cells weigh the sectors like the other
// skin cells. A fed fish heals each step and the booked wounds shrink with it.
// The wound is the fish panel's probe (probes.js), where it lies and how deep it is; the bite
// falls at the start of the course. The cells' place is the plan's report (anatomy.felt).
// Not in the pictures: harm without a place (hunger, illness, age), which lies evenly on all
// sectors; that a hungry fish does not heal.
import {SKIN_RESPONSE} from '../../../schema.js';
import {t} from '../../../strings.js';
import {degrees, radians} from '../../../units.js';
import {contactFieldOf, contactHalfAngle} from '../../../tuning.js';
import {findOrgan, updateCenter} from '../../model/document.js';
import {addPicture, drag, el, liveKind, picture} from './kit.js';
import {BOUNDED, keysOf, senseCourse, STEPS} from './sense.js';
import {fishAbove, placeOf, sectorAngle, turnTo, wedge} from './skin.js';

const word = (key, values) => t('studio.live.pain.' + key, values);
const ROUND_MS = 12000, BITE_STEP = 12;
const WOUND =
    Object.freeze({height : 132, cx : 150, cy : 66, s : 2.5, rx : 70, ry : 27, bite : 13});
// Match harm_body's linear split, including across the seam behind the fish.
function woundShares(bearing, count) {
  const position = (turnTo(bearing) + 180) * count / 360 - .5, lower = Math.floor(position),
        upperShare = position - lower;
  return new Map(
      [ [ (lower + count) % count, 1 - upperShare ], [ (lower + 1) % count, upperShare ] ]);
}

liveKind('pain', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-pain aid-live-sense-ache';
  const heading = words => {
    const h = document.createElement('h4');
    h.textContent = words;
    root.appendChild(h);
  };
  const fish = addPicture(root);
  heading(word('cells'));
  const ache = addPicture(root);
  const own = {chosen : 0, input : {rise : BITE_STEP, height : 0, stop : 0}};
  let step = 0, share = 0, clock = null;
  const organ = () => findOrgan(studio.state.document, organId);
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  const again = () => show();
  const course = senseCourse(ache, {
    name : 'ache',
    own,
    tires : true,
    most : 1,
    heals : SKIN_RESPONSE.heal_rate,
    given : true,
    mark : {at : SKIN_RESPONSE.bite_wound, word : word('bite')},
    scale : BOUNDED,
    words : {course : word('course'), used : word('used'), steps : word('steps')},
    keys : () => keysOf([ {id : '', centers : organ().centers} ], BOUNDED),
    share : () => share,
    doc : () => studio.state.document,
    draft,
    settle,
    redraw : again
  });
  // The fish from above, its right side down. The pain cells in the skin, at each sector as big
  // as the group weighs it; the grip at the field's edge sets its width. The bite out of the rim
  // is as big as the wound is at the clock's step and closes as the fish heals; the ring round
  // the bitten cell is as thick as its stimulus and as bright as its report.
  function drawFish(cell, probe) {
    const {svg, live} =
        picture(fish, WOUND.height, fixed => fishAbove(fixed, WOUND.cx, WOUND.cy, WOUND.s)),
                {cx, cy, rx, ry} = WOUND, place = placeOf(studio, cell),
                half = contactHalfAngle(cell.field ?? 0), weights = wedge(place, half),
                most = Math.max(...weights), count = weights.length;
    const at = (angle, inset = 0) => [cx - 5 - (rx - inset) * Math.cos(radians(angle)),
                                      cy + (ry - inset * .6) * Math.sin(radians(angle))],
          angleOf = p => degrees(Math.atan2((p.y - cy) / ry, (cx - 5 - p.x) / rx));
    const affected = probe ? woundShares(probe.bearing, count) : new Map();
    share = 0;
    const glows = [];
    weights.forEach((v, k) => {
      if (v <= 0)
        return;
      const [x, y] = at(sectorAngle(k, count), 7), r = 1.5 + 4 * v / most;
      el('circle', {cx : x, cy : y, r, class : 'aid-live-petal k0', opacity : .45 + .55 * v / most},
         live);
      const part = count * v * (affected.get(k) ?? 0);
      share += part;
      if (part > 0)
        glows.push(
            {e : el('circle', {cx : x, cy : y, r : r + 3, class : 'aid-live-water'}, live), part});
    });
    const [gx, gy] = at(place + Math.min(half, 179), 7);
    drag(svg, el('circle', {cx : gx, cy : gy, r : 4.5}, live),
         p => draft(updateCenter(studio.state.document, cell.id,
                                 {field : contactFieldOf(Math.abs(turnTo(angleOf(p) - place)))})),
         'painfield', 'grip', settle);
    clock = null;
    if (!probe)
      return;
    const [wx, wy] = at(probe.bearing, -2), bite = el('path', {
                                              d : `M${- WOUND.bite} 0 a${WOUND.bite} ${
                                                  WOUND.bite * .8} 0 0 0 ${2 * WOUND.bite} 0`,
                                              class : 'aid-live-bite'
                                            },
                                                      live);
    clock = at => {
      const open = course.offeredAt(at), sent = course.sentAt(at);
      bite.setAttribute('transform', `translate(${wx} ${wy}) rotate(${probe.bearing - 90}) scale(${
                                         (open > 0 ? .35 + 2.6 * open : 0).toFixed(3)})`);
      for (const glow of glows) {
        glow.e.setAttribute('stroke-width',
                            (open > 0 ? .8 + 3 * Math.min(1, glow.part * open) : 0).toFixed(1));
        glow.e.setAttribute('opacity', (.25 + .75 * sent).toFixed(2));
      }
    };
  }
  function show() {
    const cell = organ()?.centers[0];
    if (!cell)
      return;
    const active = studio.state.senseProbe,
          probe = active?.kind === 'wound' && active.organ === organId ? active : null;
    own.input.height = probe?.strength ?? 0;
    drawFish(cell, probe);
    course.draw();
    tick(0);
  }
  function tick(dt) {
    step = (step + dt * STEPS / ROUND_MS) % STEPS;
    course.moment(step);
    course.pulse(dt, step);
    clock?.(step);
  }
  return {root, show, tick};
});
