// The sense of balance's live inspector: the fish, turned, with a rose of postures.
// Read in the engine (body_plan.hh, hair_direction; body_plan.cc, the balance stimulus;
// brain_interface.hh): hair cells inside the body; their hair points from the snout (quality -1)
// over the flank (0) to the tail (1), the other side mirrors it. The stimulus is how far the hair
// points down, whatever the fish does. The answer is bounded and the cells do not get used to it,
// so a posture holds its report for as long as it lasts: no time axis.
// The posture is the stimulus and the picture's own round knob; the fish panel has no probe for
// it. The report rights the fish only through the motor region's "feel" input (organs.js, motor
// slots; motor_region.js, flee to turn and escape), so that connection is part of the picture.
import {t} from '../../../strings.js';
import {addWire, findOrgan, updateCenter} from '../../model/document.js';
import {chip, clamp, drag, el, liveKind, path, picture, txt} from './kit.js';
import {answer, BOUNDED, IRRITANT} from './sense.js';
import {fishLeft} from './skin.js';

const word = (key, values) => t('studio.live.balance.' + key, values);
const TILT = Object.freeze({
  height : 246,
  cx : 150,
  cy : 108,
  hair : 30,
  ring : 72,
  petal : 20,
  knob : 100,
  least : .03,
  most : .95,
  fish : 1.25,
  link : 232
});
const radians = d => d * Math.PI / 180, degrees = r => r * 180 / Math.PI;
const turnTo = a => ((a + 540) % 360) - 180;
// A hair's direction from the snout, in degrees: 0 to the snout, 90 to the flank, 180 to the tail.
const hairOf = q1 => 90 * (1 + (q1 ?? 0)), qualityOf = hair => clamp(hair / 90 - 1, -1, 1);

liveKind('balance', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-balance';
  const svgOf = () => {
    const svg = el('svg', {class : 'aid-live-picture'});
    root.appendChild(svg);
    return svg;
  };
  const tilt = svgOf();
  // The posture tried: where the snout points (0 to the left, as in the fish panel; 90 down). Not
  // part of the fish.
  const tried = {tilt : 25};
  const organ = () => findOrgan(studio.state.document, organId);
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  const change = doc => doc && studio.changeDocument(doc, studio.state.selected);
  // The wire that carries the report to the motor region's "feel" input, from either side.
  function motorLink(doc, own, twin) {
    const mine =
        new Set([ own, twin ].filter(Boolean).flatMap(o => [o.id, ...o.centers.map(c => c.id)]));
    const wire = doc.wires.find(w => w.toPort === 'feel' && mine.has(w.from) &&
                                     findOrgan(doc, w.to)?.type === 'motor');
    const motors = doc.organs.filter(o => o.type === 'motor');
    return {
      wired : !!wire,
      motor : wire ? findOrgan(doc, wire.to) : motors.find(o => o.side === own.side) ?? motors[0]
    };
  }
  // Round the fish a rose of postures: for every way the snout can point, a petal as long as the
  // cells report there; this organ's cells outside the ring, its twin's (their hair mirrored, with
  // their own direction and threshold) inside it, if the fish has the twin. The round knob turns
  // the fish; the grip at the hair's tip sets where the hair points; the grip at the rose's end
  // sets the threshold. At each hair's tip, what its cells report in the posture tried.
  function drawTilt(own, twin) {
    const {svg, live} = picture(
        tilt, TILT.height,
        fixed => {
          el('path', {d : `M278 172 v26 m-5 -7 l5 7 l5 -7`, class : 'aid-live-arrow'}, fixed);
          txt(fixed, 278, 210, word('down'), {'text-anchor' : 'middle', class : 'aid-live-small'});
        }),
                {cx, cy, ring, petal} = TILT, cell = own.centers[0],
                sides =
                    [ {cell, side : 1, k : 0}, twin && {cell : twin.centers[0], side : -1, k : 1} ]
                        .filter(Boolean)
                        .map(s => ({...s, hair : hairOf(s.cell.q1), gate : BOUNDED.gate(s.cell)})),
                at = (angle,
                      r) => [cx - r * Math.cos(radians(angle)), cy + r * Math.sin(radians(angle))],
                down = (snout, s) => Math.max(0, Math.sin(radians(snout + s.side * s.hair))),
                report = (snout, s) => answer(down(snout, s), s.gate, 0);
    el('circle', {cx, cy, r : ring, class : 'aid-live-rim'}, live);
    for (const s of sides) {
      const outline = [], inner = [];
      for (let a = 0; a <= 360; a += 3) {
        outline.push(at(a, ring + s.side * petal * report(a, s) * (s.side > 0 ? 1 : .7)));
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
    const body = el('g', {transform : `rotate(${- tried.tilt} ${cx} ${cy})`}, live);
    fishLeft(body, cx, cy, TILT.fish);
    // At each hair's tip the stimulus as the bolt it is in every sense (how far gravity bends the
    // hair), and round the tip the glow of what the cells report of it.
    let loudest = 0;
    for (const s of [...sides].reverse()) {
      const [x, y] = at(tried.tilt + s.side * s.hair, TILT.hair), pull = down(tried.tilt, s),
                now = report(tried.tilt, s),
                [ px, py ] = at(tried.tilt + s.side * s.hair, TILT.hair + 14);
      loudest = Math.max(loudest, now);
      if (now > 0)
        el('circle', {
          cx : x,
          cy : y,
          r : 6 + 6 * now,
          class : 'aid-live-glow k' + s.k,
          opacity : .25 + .5 * now
        },
           live);
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
    const angleOf = p => degrees(Math.atan2(p.y - cy, cx - p.x)), mine = sides[0],
          [ hx, hy ] = at(tried.tilt + mine.hair, TILT.hair);
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
         p => draft(updateCenter(studio.state.document, cell.id,
                                 {q1 : qualityOf(clamp(turnTo(angleOf(p) - tried.tilt), 0, 180))})),
         'balancehair', 'grip', settle);
    const [ex, ey] = at(degrees(Math.asin(clamp(mine.gate))) - mine.hair, ring + 8);
    drag(svg, el('circle', {cx : ex, cy : ey, r : 4.5}, live),
         p => draft(updateCenter(studio.state.document, cell.id, {
           threshold : BOUNDED.threshold(
               clamp(Math.sin(radians(clamp(turnTo(angleOf(p) + mine.hair), 0, 90))), TILT.least,
                     TILT.most))
         })),
         'balancegate', 'grip', settle);
    const [kx, ky] = at(tried.tilt, TILT.knob);
    drag(svg, el('circle', {cx : kx, cy : ky, r : 5.5, class : 'aid-live-posture'}, live), p => {
      tried.tilt = angleOf(p);
      show();
    }, 'balancetilt', 'knob');
    // Where the report goes: the glow, as strong as the louder side, and the motor region. Wired
    // to it, its name leads there; not wired, the button wires it; a fish without a motor region
    // shows the name pale, since nothing can right it.
    const doc = studio.state.document, link = motorLink(doc, own, twin), y = TILT.link;
    if (loudest > 0)
      el('circle', {
        cx : cx - 50,
        cy : y - 3,
        r : 3 + 4 * loudest,
        class : 'aid-live-glow k0',
        opacity : link.wired ? .25 + .5 * loudest : .2
      },
         live);
    if (link.wired) {
      el('path', {d : `M${cx - 36} ${y - 3} h22 m-5 -4 l5 4 l-5 4`, class : 'aid-live-arrow'},
         live);
      txt(live, cx - 6, y, t('studio.organs.motor'), {
        class : 'aid-live-small aid-live-chip'
      }).addEventListener('click', () => studio.select('organ', link.motor.id, null, false));
      return;
    }
    if (link.motor)
      chip(live, cx - 25, y - 3, '+',
           () => change(addWire(doc, own.id, link.motor.id, null, studio.state.sites, {
                          toPort : 'feel'
                        })?.document));
    txt(live, cx - 6, y, t('studio.organs.motor'), {class : 'aid-live-small', opacity : .45});
  }
  function show() {
    const own = organ();
    if (own?.centers[0])
      drawTilt(own, findOrgan(studio.state.document, own.pair));
  }
  return {root, show, tick() {}};
});
