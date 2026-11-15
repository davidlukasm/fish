// The skin's pain cells' live inspector: what the cells report of a wound while it closes.
// Read in the engine (physiology.hh, harm_body; body_plan.cc, the skin cells' wedge of weights and
// the damage stimulus; physiology.cc, healing; feeding.cc and physiology_parameters.cc, bite_wound;
// embryo.cc): every harm takes from the fish's health; a bite is booked on the sector it comes
// from, split between the two nearest sector centres. Pain cells weigh the sectors like the other
// skin cells. A fed fish heals each step and the booked wounds shrink with it.
// The wound is the fish panel's probe (probes.js), where it lies and how deep it is; the bite
// falls at the start of the course. The fish, the skin the cells feel and the grip for its width
// are the fish panel's too (body.js, feltSkin; anatomy_handles.js); here is only what it cannot
// show: the course over time. The cells' place is the plan's report (anatomy.felt).
// Not in the pictures: harm without a place (hunger, illness, age), which lies evenly on all
// sectors; that a hungry fish does not heal.
import {SKIN_RESPONSE} from '../../../schema.js';
import {t} from '../../../strings.js';
import {contactHalfAngle} from '../../../tuning.js';
import {findOrgan} from '../../model/document.js';
import {addPicture, liveKind} from './kit.js';
import {BOUNDED, closingWound, keysOf, senseCourse, STEPS} from './sense.js';
import {placeOf, turnTo, wedge} from './skin.js';

const word = (key, values) => t('studio.live.pain.' + key, values);
const ROUND_MS = 12000, BITE_STEP = 12;
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
  const ache = addPicture(root);
  const own = {chosen : 0};
  // The fish panel's wound, if it is this organ's.
  const wound = () => {
    const probe = studio.state.senseProbe;
    return probe?.kind === 'wound' && probe.organ === organId ? probe : null;
  };
  let step = 0;
  const organ = () => findOrgan(studio.state.document, organId);
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  // What the cells meet of the wound: the sectors it is booked on, as the cells weigh them
  // (16 x weight, at most all of it).
  function share() {
    const cell = organ()?.centers[0], probe = wound();
    if (!cell || !probe)
      return 0;
    const weights = wedge(placeOf(studio, cell), contactHalfAngle(cell.field ?? 0));
    let met = 0;
    for (const [sector, part] of woundShares(probe.bearing, weights.length))
      met += weights.length * weights[sector] * part;
    return met;
  }
  const course = senseCourse(ache, {
    name : 'ache',
    own,
    tires : true,
    most : 1,
    input : () => closingWound(wound()?.strength ?? 0, BITE_STEP, SKIN_RESPONSE.heal_rate),
    mark : {at : SKIN_RESPONSE.bite_wound, word : word('bite')},
    scale : BOUNDED,
    words : {course : word('course'), used : word('used'), steps : word('steps')},
    keys : () => keysOf([ {id : '', centers : organ().centers} ], BOUNDED),
    share,
    doc : () => studio.state.document,
    draft,
    settle,
    redraw : () => show()
  });
  function show() {
    if (!organ()?.centers[0])
      return;
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
