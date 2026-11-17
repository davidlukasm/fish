// The blood sense's live inspector: the circulation with the substances in it and the sense's
// types of cells among them; what each type reports of the blood as it is.
// Read in the engine (colony-core/field/hormones.hh, the substances' places, hormone_affinity and
// blood_stimulus; body_plan.cc, the blood stimulus; brain_interface.hh): the blood carries the
// hormones and what the body reports of itself: its maturity, its energy reserve and the
// exhaustion of its fast fibres; all lie on a wheel. A type of blood cells has a place on the
// wheel's plane and a width; it takes of each substance exp(-distance^2 / (2 sigma^2)), not
// brought to a sum of one. Its stimulus is the sum of what it takes x the level in the blood;
// the answer is bounded, the cells do not get used to it, and they read the blood in the egg as
// outside. What each type's cells report of it is the engine's (sense.js, lastCourses).
// The levels are the preview's blood (trials.js, setPreviewContext): the same the other pictures
// of the Atelier read.
// STOPGAP: the levels are dragged here, on the wheel. They are the fish's state, not this organ's,
// and are set in two more places (development.js, the life line; substances.js, the hormone
// tool). They belong to one tool for the fish's phase of life in the fish panel; until that
// exists the wheel keeps its grips, or the sense could not be tried at all.
import {BLOOD_SUBSTANCE} from '../../../schema.js';
import {bloodColour} from '../../../hormones.js';
import {t} from '../../../strings.js';
import {
  addOrganType,
  bloodLevel,
  findOrgan,
  organTypes,
  removeOrganType,
  updateCenter,
  wheelAffinity,
  wheelPlace
} from '../../model/document.js';
import {previewContextOf} from '../development.js';
import {label} from '../kit.js';
import {substanceName} from '../substances.js';
import {addPicture, chip, clamp, drag, el, liveKind, path, picture, txt} from './kit.js';
import {BOUNDED, IRRITANT, keyGrip, lastCourses, setGate} from './sense.js';

const word = (key, values) => t('studio.live.blood.' + key, values);
const RING = Object.freeze({
  height : 232,
  cx : 108,
  cy : 116,
  ring : 74,
  plane : 60,
  thin : 3,
  thick : 14,
  arc : .4,
  listed : .08,
  snap : .14,
  reach : [ 16, 44 ]
});
const ROWS = Object.freeze({L : 84, R : 280, top : 8, row : 26});
const NEW = Object.freeze({q1 : 0, q2 : 0, qwidth : .1});
// The body's own three each have their own colour here, to be told apart in a type's report.
const colourOf = bloodColour;
// The body's own three have short names here: the ring has little room beside them.
const BODY_WORDS = Object.freeze({
  [BLOOD_SUBSTANCE.maturity] : 'maturity',
  [BLOOD_SUBSTANCE.reserve] : 'reserve',
  [BLOOD_SUBSTANCE.fatigue] : 'fatigue'
});

liveKind('blood', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-blood';
  const heading = words => {
    const h = document.createElement('h4');
    h.textContent = words;
    root.appendChild(h);
    return h;
  };
  const ring = addPicture(root);
  heading(word('report'));
  const rows = addPicture(root);
  const own = {chosen : 0};
  const coursesOf = lastCourses('blood');
  const organ = () => findOrgan(studio.state.document, organId);
  // The engine answers the course of the cells while a grip is dragged (sense.js, lastCourses).
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive', 'course');
  const settle = () => studio.drafted && studio.settleGraphic();
  const change = doc => doc && studio.changeDocument(doc, studio.state.selected);
  const again = () => show();
  const nameOf = index =>
      BODY_WORDS[index] ? word(BODY_WORDS[index]) : substanceName(studio.state, index);
  // Where a level is set in the preview's blood (trials.js, setPreviewContext).
  const levelKey = index => index === BLOOD_SUBSTANCE.maturity ? 'maturity' : String(index);
  // The wheel as the circulation: each substance a stretch of the ring, as thick as its level in
  // the blood now; the round knob on it sets that level. A type's grip lies among them; lines run
  // from it to the substances it takes, the stronger the more.
  function drawRing(wheel, cells, levels, takes) {
    const {svg, live} = picture(ring, RING.height), {cx, cy, plane} = RING, count = levels.length,
                turns = Array.from({length : count}, (_, j) => wheel.substanceTurns[j]),
                on = (turn, r) => [cx + r * Math.cos(2 * Math.PI * turn),
                                   cy - r * Math.sin(2 * Math.PI * turn)];
    // Half the gap to the nearer neighbour on the wheel.
    const gap = j => Math.min(...turns.filter((_, k) => k !== j).map(turn => {
      const d = Math.abs(turn - turns[j]) % 1;
      return Math.min(d, 1 - d);
    }));
    cells.forEach((cell, i) => takes[i].forEach((a, j) => {
      if (a < RING.listed)
        return;
      const [x, y] = on(turns[j], RING.ring - 3);
      el('path', {
        d : `M${cx + plane * cell.q1} ${cy - plane * cell.q2} L${x} ${y}`,
        class : 'aid-live-hair k' + i,
        'stroke-width' : .6 + 3 * a,
        opacity : (i === own.chosen ? .35 : .15) + .5 * a
      },
         live);
    }));
    turns.forEach((turn, j) => {
      const half = gap(j) * RING.arc, level = levels[j],
            wide = RING.thin + (RING.thick - RING.thin) * level, colour = colourOf(j),
            body = j >= wheel.hormones;
      el('path', {
        d : path(Array.from({length : 9},
                            (_, n) => on(turn - half + 2 * half * n / 8, RING.ring + wide / 2))),
        fill : 'none',
        stroke : colour,
        'stroke-width' : wide,
        opacity : .35 + .65 * level
      },
         live);
      const [nx, ny] = on(turn, RING.ring + RING.thick + 13);
      txt(live, nx + (body ? 4 : 0), ny + 4, nameOf(j), {
        'text-anchor' : body ? 'start' : 'middle',
        style : 'fill:' + colour,
        class : 'aid-live-scent-name'
      });
      const [kx, ky] = on(turn, RING.ring + wide + 2);
      drag(svg, el('circle', {cx : kx, cy : ky, r : 4.5, style : 'fill:' + colour}, live),
           p => studio.setPreviewContext(
               levelKey(j), clamp((Math.hypot(p.x - cx, p.y - cy) - RING.ring - RING.thin - 2) /
                                  (RING.thick - RING.thin))),
           'bloodlevel' + j, 'knob');
    });
    cells.forEach((cell, i) => {
      const chosen = i === own.chosen, x = cx + plane * cell.q1, y = cy - plane * cell.q2;
      if (chosen) {
        const arm = RING.reach[0] + (RING.reach[1] - RING.reach[0]) * cell.qwidth,
              ux = x >= cx ? -1 : 1;
        el('path', {d : `M${x} ${y} h${ux * arm}`, class : 'aid-live-keyline k' + i}, live);
        drag(svg, el('circle', {cx : x + ux * arm, cy : y, r : 4.5}, live),
             p => draft(updateCenter(studio.state.document, cell.id, {
               qwidth : clamp((Math.abs(p.x - x) - RING.reach[0]) / (RING.reach[1] - RING.reach[0]))
             })),
             'bloodwidth', 'grip', settle);
        if (cells.length > 1)
          chip(live, x, y + (y <= cy ? 17 : -17), '×', () => remove(i), true, 6);
      }
      drag(svg,
           el('rect',
              {x : x - 5, y : y - 5, width : 10, height : 10, rx : 2.5, class : keyGrip(i, chosen)},
              live),
           p => {
             // A place dragged close to a substance is that substance; none lies outside the wheel.
             let nx = (p.x - cx) / plane, ny = (cy - p.y) / plane;
             const far = Math.hypot(nx, ny);
             if (far > 1) {
               nx /= far;
               ny /= far;
             }
             const near = turns.findIndex((_, j) => {
               const [px, py] = wheelPlace(wheel, j);
               return Math.hypot(nx - px, ny - py) < RING.snap;
             });
             if (near >= 0)
               [nx, ny] = wheelPlace(wheel, near);
             own.chosen = i;
             draft(updateCenter(studio.state.document, cell.id, {q1 : nx, q2 : ny}));
           },
           'bloodtype' + i, 'grip', settle);
    });
    chip(live, 288, RING.height - 10, '+', add, cells.length < wheel.bloodSubstances - 1, 7);
  }
  // For each type a row: what its cells get of the blood now, each substance's part in its
  // colour, ending at all; the threshold as a dashed mark with its grip; before the row the
  // type's nerve cell with what it reports.
  function drawRows(cells, levels, takes) {
    const {L, R, top, row} = ROWS, {svg, live} = picture(rows, top + row * cells.length + 20),
                      X = v => L + (R - L) * clamp(v);
    const sums = takes.map(take => take.reduce((sum, a, j) => sum + a * levels[j], 0)),
          reports =
              coursesOf(studio, cells.map((cell, i) => ({id : cell.id, stimulus : [ sums[i] ]})));
    txt(live, L, top + row * cells.length + 8, word('nothing'), {class : 'aid-live-small'});
    txt(live, R, top + row * cells.length + 8, word('whole'),
        {'text-anchor' : 'end', class : 'aid-live-small'});
    cells.forEach((cell, i) => {
      const chosen = i === own.chosen, y = top + row * i,
            parts = takes[i].map((a, j) => a * levels[j]), gate = BOUNDED.gate(cell), pick = () => {
              own.chosen = i;
              again();
            };
      el('rect', {
        x : L,
        y,
        width : R - L,
        height : row - 8,
        rx : 4,
        class : 'aid-live-tasterow k' + i + (chosen ? ' on' : '')
      },
         live)
          .addEventListener('pointerdown', pick);
      let at = 0;
      parts.forEach((v, j) => {
        if (v <= .004 || at >= 1)
          return;
        el('rect', {
          x : X(at),
          y : y + 1,
          width : X(Math.min(1, at + v)) - X(at),
          height : row - 10,
          style : 'fill:' + colourOf(j),
          'pointer-events' : 'none'
        },
           live);
        at += v;
      });
      const cy = y + row / 2 - 4, report = reports?.[i]?.sent[0] ?? 0;
      el('path', {
        d : `M${L - 16} ${cy} q-10 -2 -16 -10 M${L - 16} ${cy} l8 0`,
        class : 'aid-live-nerve-fibre k' + i
      },
         live);
      el('circle', {cx : L - 16, cy, r : 6, class : 'aid-live-soma k' + i + (chosen ? ' on' : '')},
         live)
          .addEventListener('pointerdown', pick);
      if (report > 0)
        el('path', {
          d : IRRITANT,
          class : 'aid-live-pulse',
          transform : `translate(${L - 42} ${cy - 8}) scale(${(.45 + .9 * report).toFixed(2)})`
        },
           live);
      el('path', {d : `M${X(gate)} ${y - 2} v${row - 4}`, class : 'aid-live-keyline k' + i + ' on'},
         live);
      if (chosen)
        drag(svg,
             el('rect', {
               x : X(gate) - 4,
               y : y + row - 12,
               width : 8,
               height : 10,
               rx : 2,
               class : keyGrip(i, true)
             },
                live),
             p => draft(setGate(studio.state.document, {id : cell.id}, clamp((p.x - L) / (R - L)))),
             'bloodgate', 'grip', settle);
    });
  }
  function remove(i) {
    const type = organTypes(organ())[i];
    own.chosen = 0;
    change(removeOrganType(studio.state.document, organId, type.id));
  }
  function add() {
    const added = addOrganType(studio.state.document, organId, studio.state.sites, NEW);
    if (!added)
      return studio.notice(label('status.noRoom'));
    own.chosen = organTypes(organ()).length;
    change(added.document);
  }
  function show() {
    const sense = organ(), wheel = studio.state.capabilities;
    if (!sense || !wheel?.substanceTurns)
      return;
    const cells = organTypes(sense).map(type => type.centers[0]),
          context = previewContextOf(studio.state),
          levels = Array.from({length : wheel.bloodSubstances}, (_, j) => bloodLevel(context, j)),
          takes = cells.map(
              cell => levels.map((_, j) => wheelAffinity(wheel, cell.q1, cell.q2, cell.qwidth, j)));
    own.chosen = Math.min(own.chosen, cells.length - 1);
    drawRing(wheel, cells, levels, takes);
    drawRows(cells, levels, takes);
  }
  return {root, show};
});
