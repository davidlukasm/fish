// The sense of touch's live inspector: the skin pressed in, what its cells report of a touch
// over time, and their life.
// Read in the engine (body_plan.cc, the skin cells' wedge of weights, record_touch and the touch
// stimulus; physiology_parameters.hh, touch_rest and touch_impact_half; embryo.cc): the body's rim
// has 16 sectors; the cells weigh them by a wedge round their own place, 22.5 to 180 degrees wide,
// the weights summing to one. A touch presses its sector: 0.1 for a mere leaning up to 1 for the
// hardest blow. The cells' stimulus is the touched sector's weight x that pressure; it is bounded
// and they do not get used to it. In the egg they feel the shell's pressure.
// The thing is the fish panel's probe (probes.js). The cells' place is the plan's report
// (anatomy.felt).
// Not in the pictures: sediment; several touches at once.
import {t} from '../../../strings.js';
import {contactFieldOf, contactHalfAngle} from '../../../tuning.js';
import {findOrgan, groupReport, updateCenter} from '../../model/document.js';
import {clamp, drag, el, liveKind, path, picture} from './kit.js';
import {BOUNDED, keysOf, senseCourse, STEPS} from './sense.js';
import {eggShape, fishAbove, lifeBand, lifePlaces, LIFE, placeOf, sectorOf, wedge} from './skin.js';

const word = (key, values) => t('studio.live.touch.' + key, values);
const ROUND_MS = 12000;
// The pressure of a touch (physiology_parameters.hh:39; STOPGAP: not in schema.js).
const TOUCH = Object.freeze({rest : .1, half : .05});
const pressureOf = impact => TOUCH.rest + (1 - TOUCH.rest) * impact / (impact + TOUCH.half);
const CUT = Object.freeze(
    {height : 150, L : 14, R : 286, skin : 58, deep : 30, cells : 104, thing : 10, dent : 20});
const turnTo = a => ((a + 540) % 360) - 180;

liveKind('touch', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-touch aid-live-sense-touch';
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
  const cut = svgOf();
  heading(word('cells'));
  const press = svgOf();
  heading(word('life'));
  const life = svgOf();
  const own = {chosen : 0, input : {rise : 60, height : .7, stop : 520}};
  let step = 0, share = 0;
  const organ = () => findOrgan(studio.state.document, organId);
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  const again = () => show();
  const course = senseCourse(press, {
    name : 'touch',
    own,
    tires : false,
    after : 60,
    most : 1,
    scale : BOUNDED,
    words : {course : word('course'), used : '', steps : word('steps')},
    keys : () => keysOf([ {id : '', centers : organ().centers} ], BOUNDED),
    share : () => share,
    doc : () => studio.state.document,
    draft,
    settle,
    redraw : again
  });
  // The skin round the body laid out flat, the cells' own place in the middle; under it the
  // touch cells, each as big as the group weighs its place; the grip at the field's edge sets its
  // width. The fish panel's thing presses the skin in as deep as its pressure.
  function drawCut(cell) {
    const {svg, under, live} = picture(cut, CUT.height),
                       {L, R, skin, deep, cells, thing, dent} = CUT, place = placeOf(studio, cell),
                       weights = wedge(place, contactHalfAngle(cell.field ?? 0)),
                       most = Math.max(...weights), count = weights.length;
    const probe = studio.state.senseProbe?.kind === 'touch' ? studio.state.senseProbe : null,
          pressure = probe ? pressureOf(probe.strength) : 0, X = a => L + (R - L) * (a + 180) / 360,
          aOf = x => clamp((x - L) / (R - L) * 360 - 180, -179, 179),
          tx = probe ? X(turnTo(probe.bearing - place)) : 0;
    const dip = x => probe ? pressure * deep * Math.exp(-(((x - tx) / dent) ** 2)) : 0,
          line = Array.from({length : 69}, (_, n) => {
            const x = L + (R - L) * n / 68;
            return [ x, skin + dip(x) ];
          });
    el('path', {
      d : path(line) + ` L${R} ${CUT.height - 14} L${L} ${CUT.height - 14} Z`,
      class : 'aid-live-flesh'
    },
       under);
    el('path', {d : path(line), class : 'aid-live-skinline'}, live);
    const hit = probe ? sectorOf(probe.bearing, count) : -1;
    share = hit < 0 ? 0 : weights[hit];
    weights.forEach((v, k) => {
      const x = X(turnTo(-180 + (k + .5) * 360 / count - place)), y = cells + .35 * dip(x);
      if (v <= 0) {
        el('circle', {cx : x, cy : y, r : 1.2, class : 'aid-live-rimdot'}, live);
        return;
      }
      el('path', {d : `M${x} ${y - 4} V${skin + dip(x) + 3}`, class : 'aid-live-keyline k0'}, live);
      el('circle', {
        cx : x,
        cy : y,
        r : 2 + 5 * v / most,
        class : 'aid-live-petal k0',
        opacity : .45 + .55 * v / most
      },
         live);
      if (k === hit)
        el('circle', {
          cx : x,
          cy : y,
          r : 5.5 + 5 * v / most,
          class : 'aid-live-water',
          'stroke-width' : 1 + 3 * v * pressure
        },
           live);
    });
    drag(svg,
         el('circle',
            {cx : X(Math.min(contactHalfAngle(cell.field ?? 0), 179)), cy : cells, r : 4.5}, live),
         p => draft(updateCenter(studio.state.document, cell.id,
                                 {field : contactFieldOf(Math.abs(aOf(p.x)))})),
         'touchfield', 'grip', settle);
    if (probe)
      el('circle',
         {cx : tx, cy : skin + pressure * deep - thing + 1, r : thing, class : 'aid-live-thing'},
         live);
  }
  // Its life: in the egg the shell that presses all round, after hatching what touches the skin.
  function drawLife(cell) {
    const {svg, under, live} = picture(life, LIFE.height, fixed => {
      const {egg, grown, y} = lifePlaces();
      eggShape(fixed, egg, y, 17, true);
      for (let n = 0; n < 8; n++) {
        const a = n * Math.PI / 4 + .3;
        el('path', {
          d : `M${egg + 24 * Math.cos(a)} ${y + 24 * Math.sin(a)} L${egg + 19.5 * Math.cos(a)} ${
              y + 19.5 * Math.sin(a)}`,
          class : 'aid-live-water'
        },
           fixed);
      }
      fishAbove(fixed, grown, y, .62);
      el('circle', {cx : grown - 2, cy : y - 13, r : 5.5, class : 'aid-live-thing'}, fixed);
    });
    lifeBand(svg, under, live, {studio, center : cell, name : 'touch', draft, settle});
  }
  function show() {
    const cell = organ()?.centers[0];
    if (!cell)
      return;
    drawCut(cell);
    course.draw();
    drawLife(cell);
    tick(0);
  }
  function tick(dt) {
    step = (step + dt * STEPS / ROUND_MS) % STEPS;
    course.moment(step);
    course.pulse(dt, step);
  }
  return {root, show, tick};
});
