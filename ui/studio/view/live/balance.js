// The sense of balance's live inspector: the fish, turned, with a rose of postures.
// Read in the engine (body_plan.hh, hair_direction; body_plan.cc, the balance stimulus;
// brain_interface.hh): hair cells inside the body; their hair points from the snout (quality -1)
// over the flank (0) to the tail (1), the other side mirrors it. The stimulus is how far the hair
// points down, whatever the fish does. The answer is bounded and the cells do not get used to it,
// so a posture holds its report for as long as it lasts: no time axis.
// The posture is the stimulus: the fish panel's gravity probe (probes.js; the direction of
// "down" round the fish), and what the cells report of it is the engine's (anatomy.senseProbe).
// The rose round the fish is what the fish panel cannot show: the report for every posture. It
// is reckoned here with the engine's rule for a bounded answer (sense.js, answer). The report
// rights the fish only through the motor region's "feel" input (organs.js, motor slots;
// motor_region.js, flee to turn and escape); that connection is made and shown in the
// inspector's list of ports (circuit.js, portsSection).
import {t} from '../../../strings.js';
import {degrees, radians} from '../../../units.js';
import {findOrgan, groupReport, updateCenter} from '../../model/document.js';
import {sideOf} from '../../model/layout.js';
import {addPicture, clamp, drag, el, liveKind, path, picture, txt, reportBubble} from './kit.js';
import {answer, BOUNDED, IRRITANT} from './sense.js';
import {fishLeft, turnTo} from './skin.js';

const word = (key, values) => t('studio.live.balance.' + key, values);
const TILT = Object.freeze({
  height : 218,
  cx : 150,
  cy : 108,
  hair : 30,
  ring : 72,
  petal : 20,
  least : .03,
  most : .95,
  fish : 1.25,
  aside : 22,
  bubble : 10,
  beyond : 18
});
// A hair's direction from the snout, in degrees: 0 to the snout, 90 to the flank, 180 to the tail.
const hairOf = q1 => 90 * (1 + (q1 ?? 0)), qualityOf = hair => clamp(hair / 90 - 1, -1, 1);

liveKind('balance', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-balance';
  const tilt = addPicture(root);
  // Where the snout points (0 to the left, as in the fish panel; 90 down), from the fish panel's
  // probe: its bearing is where "down" lies round the fish, 90 for a level fish.
  const LEVEL = 90;
  const tried = {tilt : 0};
  const heard = cell =>
      groupReport(studio.state.document, studio.state.anatomy, 'senseProbe', cell.id);
  const organ = () => findOrgan(studio.state.document, organId);
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  // Round the fish a rose of postures: for every way the snout can point, a petal as long as the
  // cells report there; this organ's cells outside the ring, its twin's (their hair mirrored, with
  // their own direction and threshold) inside it, if the fish has the twin. The fish lies as the
  // fish panel's probe turns it; the grip at the hair's tip sets where the hair points; the grip
  // at the rose's end sets the threshold. At each hair's tip the bolt of its stimulus, and round
  // the tip the glow of what the engine reports for its cells.
  function drawTilt(own, twin) {
    const {svg,
           live} =
        picture(tilt, TILT.height,
                fixed => {
                  el('path', {d : `M278 172 v26 m-5 -7 l5 7 l5 -7`, class : 'aid-live-arrow'},
                     fixed);
                  txt(fixed, 278, 210, word('down'),
                      {'text-anchor' : 'middle', class : 'aid-live-small'});
                }),
           {cx, cy, ring, petal} = TILT, cell = own.centers[0], face = sideOf(own) || 1,
           sides =
               [ {cell, side : face, k : 0}, twin && {cell : twin.centers[0], side : -face, k : 1} ]
                   .filter(Boolean)
                   .map(s => ({...s, hair : hairOf(s.cell.q1), gate : BOUNDED.gate(s.cell)})),
           at =
               (angle, r) => [cx - r * Math.cos(radians(angle)), cy + r * Math.sin(radians(angle))],
           down = (snout, s) => Math.max(0, Math.sin(radians(snout + s.side * s.hair))),
           report = (snout, s) => answer(down(snout, s), s.gate, 0);
    el('circle', {cx, cy, r : ring, class : 'aid-live-rim'}, live);
    for (const s of sides) {
      const outline = [], inner = [];
      for (let a = 0; a <= 360; a += 3) {
        outline.push(at(a, ring + (s.k ? -.7 : 1) * petal * report(a, s)));
        inner.unshift(at(a, ring));
      }
      el('path', {
        d : path(outline) + ' L' +
                inner.map(([ x, y ]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L') + 'Z',
        class : 'aid-live-petal k' + s.k,
        opacity : .75
      },
         live);
    }
    // The ring between the two sides' roses, so that they stay apart where both report.
    el('circle', {cx, cy, r : ring, class : 'aid-live-ringline'}, live);
    // Where the fish lies now on the rose: a tick across the ring where its snout points.
    const [t0x, t0y] = at(tried.tilt, ring - petal),
                [ t1x, t1y ] = at(tried.tilt, ring + petal + 4);
    el('path', {d : `M${t0x} ${t0y} L${t1x} ${t1y}`, class : 'aid-live-arrow'}, live);
    const body = el('g', {transform : `rotate(${- tried.tilt} ${cx} ${cy})`}, live);
    fishLeft(body, cx, cy, TILT.fish);
    // Beside each hair the stimulus as the bolt it is in every sense (how far gravity bends the
    // hair), and beyond its tip what the engine reports for its cells, in the fish panel's bubble.
    const reports = [];
    for (const s of [...sides].reverse()) {
      const [x, y] = at(tried.tilt + s.side * s.hair, TILT.hair), pull = down(tried.tilt, s),
                now = heard(s.cell),
                [ bx, by ] = at(tried.tilt + s.side * s.hair, TILT.hair + TILT.beyond),
                [ px, py ] = at(tried.tilt + s.side * s.hair + TILT.aside, TILT.hair * .62);
      if (Number.isFinite(now))
        reports.push([ bx, by, now ]);
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
          [ hx, hy ] = at(tried.tilt + face * mine.hair, TILT.hair);
    drag(svg,
         el('rect', {
           x : hx - 4.5,
           y : hy - 4.5,
           width : 9,
           height : 9,
           rx : 2.5,
           class : 'aid-live-keygrip k0 on'
         },
            live),
         p => draft(
             updateCenter(studio.state.document, cell.id,
                          {q1 : qualityOf(clamp(face * turnTo(angleOf(p) - tried.tilt), 0, 180))})),
         'balancehair', 'grip', settle);
    const [ex, ey] = at(degrees(Math.asin(clamp(mine.gate))) - face * mine.hair, ring + 8);
    drag(svg, el('circle', {cx : ex, cy : ey, r : 4.5}, live),
         p => draft(updateCenter(studio.state.document, cell.id, {
           threshold : BOUNDED.threshold(
               clamp(Math.sin(radians(clamp(turnTo(angleOf(p) + face * mine.hair), 0, 90))),
                     TILT.least, TILT.most))
         })),
         'balancegate', 'grip', settle);
  }
  function show() {
    const own = organ(), probe = studio.state.senseProbe;
    tried.tilt = LEVEL - (probe?.kind === 'balance' ? probe.bearing : LEVEL);
    if (own?.centers[0])
      drawTilt(own, findOrgan(studio.state.document, own.pair));
  }
  return {root, show};
});
