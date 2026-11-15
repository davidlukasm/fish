// The lateral line's live inspector: how its cells get used to a current that lasts.
// Read in the engine (body_plan.cc, the skin cells' wedge of weights and the flow stimulus;
// embryo.cc; brain_interface.hh, intensity_sense): the body's rim has 16 sectors; the cells weigh
// them by a wedge round their own place, 22.5 to 180 degrees wide, the weights summing to one.
// Their stimulus is, summed over the sectors by weight, the water's speed against the fish there
// as far as it comes against the cells' own place. It has no upper bound, and the cells get used
// to it. In the egg they feel the fluid the embryo's own twitches move.
// The current is the fish panel's probe (probes.js), its direction and its speed; it reaches
// every sector as far as that faces it (werkzeug/atelier.cc, the flow scene). The fish, the water
// round it, the cells' places and the grip for the field's width are the fish panel's too
// (body.js, feltFlow; anatomy_handles.js); here is only what it cannot show: the course over
// time. The weights are the plan's report (anatomy.lateral).
// Not in the picture: sediment; the fish's own speed and turning apart from the water's.
import {t} from '../../../strings.js';
import {degrees, radians} from '../../../units.js';
import {findOrgan, groupReport} from '../../model/document.js';
import {addPicture, liveKind} from './kit.js';
import {INTENSITY, keysOf, senseCourse, steady, STEPS} from './sense.js';
import {sectorAngle} from './skin.js';

const word = (key, values) => t('studio.live.lateral.' + key, values);
const ROUND_MS = 12000;

liveKind('lateral', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-lateral aid-live-sense-flow';
  const flow = addPicture(root);
  const own = {chosen : 0};
  let step = 0;
  const current = () => studio.state.senseProbe?.kind === 'flow' ? studio.state.senseProbe : null;
  const organ = () => findOrgan(studio.state.document, organId);
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  // What the cells meet of the current: each sector as far as it faces the water, by the cells'
  // weight, and as far as the water comes against the cells' own place (where their weights
  // point).
  function share() {
    const cell = organ()?.centers[0], probe = current();
    const weights =
        cell &&
        groupReport(studio.state.document, studio.state.anatomy, 'lateral', cell.id)?.weights;
    if (!weights || !probe)
      return 0;
    const count = weights.length, at = k => radians(sectorAngle(k, count));
    const place = degrees(Math.atan2(weights.reduce((sum, v, k) => sum + v * Math.sin(at(k)), 0),
                                     weights.reduce((sum, v, k) => sum + v * Math.cos(at(k)), 0)));
    const met = weights.reduce(
        (sum, v, k) => sum + v * Math.max(0, Math.cos(at(k) - radians(probe.bearing))), 0);
    return met * Math.max(0, Math.cos(radians(probe.bearing - place)));
  }
  const course = senseCourse(flow, {
    name : 'flow',
    own,
    tires : true,
    most : 1,
    scale : INTENSITY,
    input : () => steady(current()?.strength ?? 0),
    words : {course : word('course'), used : word('used'), steps : word('steps')},
    keys : () => keysOf([ {id : '', centers : organ().centers} ], INTENSITY),
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
