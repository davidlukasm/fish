// The sense of balance's live inspector: the fish, turned, with a rose of postures.
// Read in the engine (body_plan.hh, hair_direction; body_plan.cc, the balance stimulus;
// brain_interface.hh): hair cells inside the body; their hair points from the snout (quality -1)
// over the flank (0) to the tail (1), the other side mirrors it. The stimulus is how far the hair
// points down, whatever the fish does. The answer is bounded and the cells do not get used to it,
// so a posture holds its report for as long as it lasts: no time axis.
// The posture is the stimulus: the fish panel's gravity probe (probes.js; the direction of
// "down" round the fish), and what the cells report of it is the engine's (anatomy.senseProbe).
// The rose round the fish is what the fish panel cannot show: the report for every posture, the
// engine's, as a course over the postures round the fish (sense.js, lastCourses). The report
// rights the fish only through the motor region's "feel" input (organs.js, motor slots;
// motor_region.js, flee to turn and escape); that connection is made and shown in the
// inspector's list of ports (circuit.js, portsSection).
import {t} from '../../../strings.js';
import {degrees, radians} from '../../../units.js';
import {findOrgan, groupReport, updateCenter} from '../../model/document.js';
import {sideOf} from '../../model/layout.js';
import {
  addPicture,
  clamp,
  drag,
  el,
  GRIP,
  liveKind,
  path,
  picture,
  reportBubble,
  squareGrip,
  txt
} from './kit.js';
import {BOUNDED, IRRITANT, lastCourses} from './sense.js';
import {fishLeft, turnTo} from './skin.js';

const word = (key, values) => t('studio.live.balance.' + key, values);
const TILT = Object.freeze({
  height : 256,
  cx : 150,
  cy : 128,
  hair : 40,
  ring : 86,
  petal : 20,
  least : .03,
  most : .95,
  fish : 1.25,
  aside : 34,
  bubble : 10,
  beyond : 24
});
// A hair's direction from the snout, in degrees: 0 to the snout, 90 to the flank, 180 to the tail.
const hairOf = q1 => 90 * (1 + (q1 ?? 0)), qualityOf = hair => clamp(hair / 90 - 1, -1, 1);
const at =
    (angle, r) => [TILT.cx - r * Math.cos(radians(angle)), TILT.cy + r * Math.sin(radians(angle))];
const down = (snout, s) => Math.max(0, Math.sin(radians(snout + s.side * s.hair)));
// The postures the rose is drawn at: where the snout points, every 3 degrees round.
const ROSE = Array.from({length : 121}, (_, n) => 3 * n);

function drawRoses(group, sides) {
  const {cx, cy, ring, petal} = TILT;
  el('circle', {cx, cy, r : ring, class : 'aid-live-rim'}, group);
  for (const s of sides) {
    if (!s.rose)
      continue;
    const outline = [], inner = [];
    ROSE.forEach((angle, n) => {
      outline.push(at(angle, ring + (s.k ? -.7 : 1) * petal * s.rose[n]));
      inner.push(at(angle, ring));
    });
    el('path', {
      d : path(outline) + ' L' + path(inner.reverse()).slice(1) + 'Z',
      class : 'aid-live-petal k' + s.k,
      opacity : .75
    },
       group);
  }
  el('circle', {cx, cy, r : ring, class : 'aid-live-ringline'}, group);
}

liveKind('balance', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-balance';
  const tilt = addPicture(root);
  // Where the snout points (0 to the left, as in the fish panel; 90 down), from the fish panel's
  // probe: its bearing is where "down" lies round the fish, 90 for a level fish.
  const LEVEL = 90;
  let tiltNow = 0, shown;
  const coursesOf = lastCourses('balance');
  const heard = cell =>
      groupReport(studio.state.document, studio.state.anatomy, 'senseProbe', cell.id);
  const organ = () => findOrgan(studio.state.document, organId);
  // The engine answers the course of the cells while a grip is dragged (sense.js, lastCourses).
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive', 'course');
  const settle = () => studio.drafted && studio.settleGraphic();
  // Round the fish a rose of postures: for every way the snout can point, a petal as long as the
  // cells report there; this organ's cells outside the ring, its twin's (their hair mirrored, with
  // their own direction and threshold) inside it, if the fish has the twin. The fish lies as the
  // fish panel's probe turns it; the grip at the hair's tip sets where the hair points; the grip
  // at the rose's end sets the threshold. At each hair's tip the bolt of its stimulus, and round
  // the tip the glow of what the engine reports for its cells.
  function drawTilt(sides) {
    const [{cell, side : face}] = sides, {cx, cy, ring, petal} = TILT;
    const stamp = sides.map(s => [s.side, s.hair, s.gate, s.rose?.join(',')].join(':')).join('|');
    const {svg, live} = picture(tilt, TILT.height, fixed => {
      el('path', {d : `M278 172 v26 m-5 -7 l5 7 l5 -7`, class : 'aid-live-arrow'}, fixed);
      txt(fixed, 278, 210, word('down'), {'text-anchor' : 'middle', class : 'aid-live-small'});
      drawRoses(fixed, sides);
    }, stamp);
    // Where the fish lies now on the rose: a tick across the ring where its snout points.
    const [t0x, t0y] = at(tiltNow, ring - petal), [ t1x, t1y ] = at(tiltNow, ring + petal + 4);
    el('path', {d : `M${t0x} ${t0y} L${t1x} ${t1y}`, class : 'aid-live-arrow'}, live);
    const body = el('g', {transform : `rotate(${- tiltNow} ${cx} ${cy})`}, live);
    fishLeft(body, cx, cy, TILT.fish);
    // Beside each hair the stimulus as the bolt it is in every sense (how far gravity bends the
    // hair), and beyond its tip what the engine reports for its cells, in the fish panel's bubble.
    const reports = [];
    for (const s of [...sides].reverse()) {
      const direction = tiltNow + s.side * s.hair, pull = down(tiltNow, s),
            [ x, y ] = at(direction, TILT.hair),
            [ bx, by ] = at(direction, TILT.hair + TILT.beyond),
            [ px, py ] = at(direction + TILT.aside, TILT.hair * .5);
      if (Number.isFinite(s.response))
        reports.push([ bx, by, s.response ]);
      el('path', {d : `M${cx} ${cy} L${x} ${y}`, class : 'aid-live-hair k' + s.k}, live);
      if (pull > 0)
        el('path', {
          d : IRRITANT,
          class : 'aid-live-pulse',
          transform : `translate(${px} ${py}) scale(${(.45 + .9 * pull).toFixed(2)})`
        },
           live);
    }
    el('circle', {cx, cy, r : 5.5, class : 'aid-live-soma k0 on'}, live);
    for (const [x, y, share] of reports)
      reportBubble(live, TILT.bubble)(x, y, share);
    const angleOf = p => degrees(Math.atan2(p.y - cy, cx - p.x)), mine = sides[0],
          [ hx, hy ] = at(tiltNow + face * mine.hair, TILT.hair);
    drag(svg,
         squareGrip(live, hx, hy, {class : 'aid-live-keygrip k0 on'}),
         p => draft(
             updateCenter(studio.state.document, cell.id,
                          {q1 : qualityOf(clamp(face * turnTo(angleOf(p) - tiltNow), 0, 180))})),
         'balancehair', 'grip', settle);
    const [ex, ey] = at(degrees(Math.asin(clamp(mine.gate))) - face * mine.hair, ring + GRIP / 2 + 3);
    drag(svg, squareGrip(live, ex, ey),
         p => draft(updateCenter(studio.state.document, cell.id, {
           threshold : BOUNDED.threshold(
               clamp(Math.sin(radians(clamp(turnTo(angleOf(p) + face * mine.hair), 0, 90))),
                     TILT.least, TILT.most))
         })),
         'balancegate', 'grip', settle);
  }
  function show() {
    const own = organ(), probe = studio.state.senseProbe;
    const cell = own?.centers[0];
    if (!cell)
      return;
    const nextTilt = LEVEL - (probe?.kind === 'balance' ? probe.bearing : LEVEL);
    const face = sideOf(own) || 1, twin = findOrgan(studio.state.document, own.pair)?.centers[0];
    const ownResponse = heard(cell), twinResponse = twin ? heard(twin) : null;
    const {anatomy, outlinePreview} = studio.state;
    const inputs = [
      cell, face, twin, nextTilt, ownResponse, twinResponse,
      (outlinePreview ?? anatomy)?.senseCourses
    ];
    if (shown?.every((value, index) => value === inputs[index]))
      return;
    shown = inputs;
    tiltNow = nextTilt;
    const side = (cell, side, k, response) =>
        ({cell, side, k, response, hair : hairOf(cell.q1), gate : BOUNDED.gate(cell)});
    const sides = [ side(cell, face, 0, ownResponse) ];
    if (twin)
      sides.push(side(twin, -face, 1, twinResponse));
    const runs =
        coursesOf(studio, sides.map(s => ({id : s.cell.id, stimulus : ROSE.map(a => down(a, s))})));
    sides.forEach((s, i) => s.rose = runs?.[i]?.sent ?? null);
    drawTilt(sides);
  }
  return {root, show};
});
