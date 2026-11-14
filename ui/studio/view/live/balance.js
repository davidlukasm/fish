// The sense of balance's live inspector: the fish, turned, with a rose of postures; and the
// cells' life.
// Read in the engine (body_plan.hh, hair_direction; body_plan.cc, the balance stimulus;
// brain_interface.hh): hair cells inside the body; their hair points from the snout (quality -1)
// over the flank (0) to the tail (1), the other side mirrors it. The stimulus is how far the hair
// points down, whatever the fish does. The answer is bounded, the cells do not get used to it,
// and they feel it in the egg as outside.
// No time here: a posture holds its report for as long as it lasts. The posture tried is the
// picture's own knob; the fish panel has no probe for it.
import {t} from '../../../strings.js';
import {findOrgan, updateCenter} from '../../model/document.js';
import {clamp, drag, el, liveKind, path, picture, txt} from './kit.js';
import {answer, BOUNDED, IRRITANT} from './sense.js';
import {eggShape, fishSide, lifeBand, lifePlaces, LIFE} from './skin.js';

const word = (key, values) => t('studio.live.balance.' + key, values);
const TILT = Object.freeze({
  height : 218,
  cx : 150,
  cy : 108,
  hair : 30,
  ring : 72,
  petal : 20,
  knob : 100,
  least : .03,
  most : .95,
  fish : 1.25
});
const radians = d => d * Math.PI / 180, degrees = r => r * 180 / Math.PI;
const turnTo = a => ((a + 540) % 360) - 180;
// A hair's direction from the snout, in degrees: 0 to the snout, 90 to the flank, 180 to the tail.
const hairOf = q1 => 90 * (1 + (q1 ?? 0)), qualityOf = hair => clamp(hair / 90 - 1, -1, 1);

liveKind('balance', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-balance';
  const heading = words => {
    const h = document.createElement('h4');
    h.textContent = words;
    root.appendChild(h);
  };
  const svgOf = () => {
    const svg = el('svg', {class : 'aid-live-picture'});
    root.appendChild(svg);
    return svg;
  };
  heading(word('feels'));
  const tilt = svgOf();
  heading(word('life'));
  const life = svgOf();
  // The posture tried: where the snout points (0 to the right, 90 down). Not part of the fish.
  const own = {tilt : 25};
  const organ = () => findOrgan(studio.state.document, organId);
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  // Round the fish a rose of postures: for every way the snout can point, a petal as long as the
  // cells report there; this side's cells outside the ring, the other side's (their hair
  // mirrored) inside it. The round knob turns the fish; the grip at the hair's tip sets where the
  // hair points; the grip at the rose's end sets the threshold.
  function drawTilt(cell) {
    const {svg, live} = picture(
        tilt, TILT.height,
        fixed => {
          el('path',
             {d : `M278 ${TILT.height - 46} v26 m-5 -7 l5 7 l5 -7`, class : 'aid-live-arrow'},
             fixed);
          txt(fixed, 278, TILT.height - 8, word('down'),
              {'text-anchor' : 'middle', class : 'aid-live-small'});
        }),
                {cx, cy, ring, petal} = TILT, hair = hairOf(cell.q1), gate = BOUNDED.gate(cell),
                at = (angle,
                      r) => [cx + r * Math.cos(radians(angle)), cy + r * Math.sin(radians(angle))],
                down = (snout, side) => Math.max(0, Math.sin(radians(snout + side * hair)));
    el('circle', {cx, cy, r : ring, class : 'aid-live-rim'}, live);
    for (const side of [1, -1]) {
      const outline = [], inner = [];
      for (let a = 0; a <= 360; a += 3) {
        outline.push(
            at(a, ring + side * petal * answer(down(a, side), gate, 0) * (side > 0 ? 1 : .7)));
        inner.unshift(at(a, ring));
      }
      el('path', {
        d : path(outline) + ' L' +
                inner.map(([ x, y ]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L') + 'Z',
        class : 'aid-live-petal k' + (side > 0 ? 0 : 1),
        opacity : .75
      },
         live);
    }
    // The ring between the two sides' roses, so that they stay apart where both report.
    el('circle', {cx, cy, r : ring, class : 'aid-live-ringline'}, live);
    const body = el('g', {transform : `rotate(${own.tilt} ${cx} ${cy})`}, live);
    fishSide(body, cx, cy, TILT.fish);
    for (const side of [-1, 1]) {
      const [x, y] = at(own.tilt + side * hair, TILT.hair),
                report = answer(down(own.tilt, side), gate, 0), k = side > 0 ? 0 : 1;
      el('path', {d : `M${cx} ${cy} L${x} ${y}`, class : 'aid-live-hair k' + k}, live);
      if (report > 0)
        el('path', {
          d : IRRITANT,
          class : side > 0 ? 'aid-live-pulse' : 'aid-live-petal k1',
          transform : `translate(${cx - side * 16} ${cy - side * 12}) scale(${
              (.45 + .9 * report).toFixed(2)})`
        },
           live);
    }
    el('circle', {cx, cy, r : 5.5, class : 'aid-live-soma k0 on'}, live);
    const angleOf = p => degrees(Math.atan2(p.y - cy, p.x - cx)),
          [ hx, hy ] = at(own.tilt + hair, TILT.hair);
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
                                 {q1 : qualityOf(clamp(turnTo(angleOf(p) - own.tilt), 0, 180))})),
         'balancehair', 'grip', settle);
    const [ex, ey] = at(degrees(Math.asin(clamp(gate))) - hair, ring + 8);
    drag(svg, el('circle', {cx : ex, cy : ey, r : 4.5}, live),
         p => draft(updateCenter(studio.state.document, cell.id, {
           threshold : BOUNDED.threshold(clamp(
               Math.sin(radians(clamp(turnTo(angleOf(p) + hair), 0, 90))), TILT.least, TILT.most))
         })),
         'balancegate', 'grip', settle);
    const [kx, ky] = at(own.tilt, TILT.knob);
    drag(svg, el('circle', {cx : kx, cy : ky, r : 5.5, class : 'aid-live-posture'}, live), p => {
      own.tilt = angleOf(p);
      show();
    }, 'balancetilt', 'knob');
  }
  // Its life: the same in the egg as outside.
  function drawLife(cell) {
    const {svg, under, live} = picture(life, LIFE.height, fixed => {
      const {egg, grown, y} = lifePlaces();
      eggShape(fixed, egg, y, 19, false);
      fishSide(fixed, grown, y, .62);
      for (const x of [egg, grown])
        el('path', {d : `M${x + 30} ${y - 9} v18 m-4 -6 l4 6 l4 -6`, class : 'aid-live-hair k0'},
           fixed);
    });
    lifeBand(svg, under, live, {studio, center : cell, name : 'balance', draft, settle});
  }
  function show() {
    const cell = organ()?.centers[0];
    if (!cell)
      return;
    drawTilt(cell);
    drawLife(cell);
  }
  return {root, show, tick() {}};
});
