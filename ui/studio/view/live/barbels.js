// The barbels' live inspector: the head from above with its two barbels and a thing a tip may
// touch; the map of scents with the barbels' types of cells and what the thing tastes of; what
// each type's cells report of it; and their life.
// Read in the engine (body_plan.cc, barbel_tip; cppn_brain.cc, the taste cells' stimulus;
// small_animals.cc, tip_contact; physiology.hh, birth_exposure): a barbel on each side of the
// mouth, as long as the body's radius x (length + length_per_size x g / (g + organ_half)), g the
// root of its cells; it tastes only what its tip touches, every scent of the thing touched whole;
// a stone is touched and has no taste. A cell's stimulus is (1 - touch share) x min(1, taste) +
// touch share x touched. In the egg a barbel reports nothing. No time here: a tip touches or
// does not.
// Not in the pictures: several tastes touched at once.
import {ATELIER_LIMITS, BARBEL} from '../../../schema.js';
import {t} from '../../../strings.js';
import {activationLevel, unitOfPlan} from '../../../tuning.js';
import {
  addOrganType,
  findOrgan,
  lifePhase,
  organTypes,
  removeOrganType,
  setLifePhase,
  updateCenter
} from '../../model/document.js';
import {label} from '../kit.js';
import {clamp, drag, el, liveKind, picture, txt} from './kit.js';
import {bestScents, sampleColour, sampleShare, scentMap} from './scentmap.js';
import {answer, BOUNDED, IRRITANT, keyGrip, setGate, typeLife} from './sense.js';

const word = (key, values) => t('studio.live.barbels.' + key, values);
const MOST = 4, NEW_WIDTH = .25, NEW_TOUCH = .3, NEW_GATE = .3;
// The head from above, snout to the left; one body radius in the picture, a tip's reach, and
// how far each barbel's root lies from the middle.
const HEAD = Object.freeze(
    {height : 150, mouthX : 150, mouthY : 78, radius : 150, reach : 9, root : 10, thing : 7});
const ROWS = Object.freeze({L : 84, R : 280, top : 14, row : 26});
const lengthOf = cells => {
  const g = Math.sqrt(Math.max(0, cells));
  return HEAD.radius * (BARBEL.length + BARBEL.length_per_size * g / (g + BARBEL.organ_half));
};
const tipOf = (side, cells) => {
  const long = lengthOf(cells);
  return [
    HEAD.mouthX - long * Math.cos(BARBEL.spread),
    HEAD.mouthY + side * (HEAD.root + long * Math.sin(BARBEL.spread))
  ];
};

liveKind('barbels', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-barbels';
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
  const kind = heading(''), head = svgOf();
  heading(word('taste'));
  const map = svgOf();
  heading(word('report'));
  const rows = svgOf();
  heading(word('life'));
  const life = svgOf();
  // What is tried on the barbels and which of their types is chosen: not part of the fish.
  const own = {chosen : 0, probe : null, thing : null};
  const organ = () => findOrgan(studio.state.document, organId);
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  const change = doc => doc && studio.changeDocument(doc, studio.state.selected);
  const again = () => show();
  function remove(type) {
    own.chosen = 0;
    change(removeOrganType(studio.state.document, organId, type));
  }
  // A new type starts at what the tip touches.
  function add() {
    const added = addOrganType(studio.state.document, organId, studio.state.sites, {
      q1 : own.probe.q1,
      q2 : own.probe.q2,
      qwidth : NEW_WIDTH,
      field : NEW_TOUCH,
      threshold : BOUNDED.threshold(NEW_GATE)
    });
    if (!added)
      return studio.notice(label('status.noRoom'));
    own.chosen = organTypes(organ()).length;
    change(added.document);
  }
  // The side whose tip touches the thing (-1 above, 1 below), or 0: each side's cells feel their
  // own tip.
  const touching = cells => [-1, 1].find(side => {
    const [x, y] = tipOf(side, cells);
    return Math.hypot(x - own.thing.x, y - own.thing.y) <= HEAD.reach + HEAD.thing;
  }) ?? 0;
  function buildHead(fixed) {
    const {mouthX : x, mouthY : y} = HEAD;
    el('path', {
      d : `M300 ${y - 62} Q${x + 60} ${y - 64} ${x + 12} ${y - 22} Q${x - 8} ${y} ${x + 12} ${
          y + 22} Q${x + 60} ${y + 64} 300 ${y + 62} Z`,
      class : 'aid-live-head'
    },
       fixed);
    for (const side of [-1, 1]) {
      el('circle', {cx : x + 62, cy : y + side * 40, r : 5, class : 'aid-live-headeye'}, fixed);
      el('circle', {cx : x + 60.2, cy : y + side * 40 - 1.5, r : 1.3, class : 'aid-live-eye'},
         fixed);
    }
  }
  // The barbels as long as their cells make them; the grip at the upper tip sets the chosen
  // type's cells, the round knob is the thing a tip may touch.
  function drawHead(cells, chosen) {
    const {svg, live} = picture(head, HEAD.height, buildHead), {mouthX, mouthY} = HEAD,
                all = cells.reduce((sum, c) => sum + c.copies, 0), others = all - chosen.copies,
                colour = sampleColour(own.probe);
    // At first the thing lies at the upper tip.
    own.thing ??= {x : tipOf(-1, all)[0] - HEAD.thing - 5, y : tipOf(-1, all)[1]};
    const touched = touching(all);
    txt(live, 6, HEAD.height - 6, word(touched ? 'touching' : 'apart'), {class : 'aid-live-small'});
    for (const side of [-1, 1]) {
      const [x, y] = tipOf(side, all), from = [ mouthX + 8, mouthY + side * HEAD.root ],
                mid = [ (from[0] + x) / 2, (from[1] + y) / 2 + side * 6 ];
      el('path', {d : `M${from} Q${mid} ${x} ${y}`, class : 'aid-live-barbel'}, live);
      // Its reach at the tip: drawn full where it touches the thing.
      const ring = el('circle', {
        cx : x,
        cy : y,
        r : HEAD.reach,
        class : 'aid-live-reach' + (touched === side ? ' on' : '')
      },
                      live);
      if (touched === side && colour)
        ring.style.stroke = colour;
      // A stroke across the barbel for each of its cells.
      for (let c = 1; c <= all; c++) {
        const s = c / (all + 1), u = 1 - s, bx = u * u * from[0] + 2 * s * u * mid[0] + s * s * x,
              by = u * u * from[1] + 2 * s * u * mid[1] + s * s * y;
        el('path', {
          d : `M${(bx - 1.5).toFixed(1)} ${(by - 4).toFixed(1)} l3 8`,
          class : 'aid-live-barbcell'
        },
           live);
      }
    }
    const [gx, gy] = tipOf(-1, all);
    drag(svg, el('rect', {x : gx - 4, y : gy - 5.5, width : 8, height : 11, rx : 2}, live), p => {
      let best = chosen.copies;
      for (let c = 1; c <= ATELIER_LIMITS.max_copies; c++)
        if (Math.abs(tipOf(-1, others + c)[0] - p.x) < Math.abs(tipOf(-1, others + best)[0] - p.x))
          best = c;
      if (best !== chosen.copies)
        draft(updateCenter(studio.state.document, chosen.id, {copies : best}));
    }, 'barbcells', 'grip', settle);
    const thing =
        el('circle', {cx : own.thing.x, cy : own.thing.y, r : HEAD.thing, class : 'aid-live-stone'},
           live);
    if (colour)
      thing.style.fill = colour;
    drag(svg, thing, p => {
      own.thing = {x : clamp(p.x, 8, 292), y : clamp(p.y, 20, HEAD.height - 8)};
      again();
    }, 'barbthing', 'knob');
    return touched;
  }
  // For each type a row: the stimulus the thing at the tip gives its cells, its taste (in the
  // taste's colour) and beside it its mere touch (light), with the type's threshold as a dashed
  // mark; before the row the type's nerve cell with what it reports of that. The round grip
  // sets taste against touch, the square one the threshold.
  function drawRows(cells, touched) {
    const {L, R, top, row} = ROWS, {svg, live} = picture(rows, top + row * cells.length + 22),
                      X = v => L + (R - L) * clamp(v), vOf = x => clamp((x - L) / (R - L)),
                      colour = sampleColour(own.probe), foot = top + row * cells.length + 10;
    txt(live, L, foot, word('nothing'), {class : 'aid-live-small'});
    txt(live, R, foot, word('whole'), {'text-anchor' : 'end', class : 'aid-live-small'});
    txt(live, L, top - 3, word('tastes'), {class : 'aid-live-small'});
    txt(live, R, top - 3, word('feels'), {'text-anchor' : 'end', class : 'aid-live-small'});
    cells.forEach((cell, i) => {
      const on = i === own.chosen, y = top + row * i, met = touched ? 1 : 0,
            taste = (1 - cell.field) * Math.min(1, sampleShare(cell, own.probe)) * met,
            sum = taste + cell.field * met, gate = activationLevel(unitOfPlan(cell.threshold)),
            pick = () => {
              own.chosen = i;
              again();
            };
      el('rect', {
        x : L,
        y,
        width : R - L,
        height : row - 8,
        rx : 4,
        class : 'aid-live-tasterow k' + i + (on ? ' on' : '')
      },
         live)
          .addEventListener('pointerdown', pick);
      const tasted = el('rect', {
        x : L,
        y : y + 1,
        width : X(taste) - L,
        height : row - 10,
        rx : 3,
        class : 'aid-live-stone',
        'pointer-events' : 'none'
      },
                        live);
      if (colour)
        tasted.style.fill = colour;
      el('rect', {
        x : X(taste),
        y : y + 1,
        width : X(sum) - X(taste),
        height : row - 10,
        rx : 3,
        class : 'aid-live-touched',
        'pointer-events' : 'none'
      },
         live);
      // The type's nerve cell before its row: what it reports, as a flash as big as the report.
      const cy = y + row / 2 - 4, report = answer(sum, gate, 0);
      el('path', {
        d : `M${L - 16} ${cy} q-10 -2 -16 -10 M${L - 16} ${cy} l8 0`,
        class : 'aid-live-nerve-fibre k' + i
      },
         live);
      el('circle', {cx : L - 16, cy, r : 6, class : 'aid-live-soma k' + i + (on ? ' on' : '')},
         live)
          .addEventListener('pointerdown', pick);
      if (report > 0)
        el('path', {
          d : IRRITANT,
          class : 'aid-live-pulse',
          transform : `translate(${L - 42} ${cy - 8}) scale(${(.45 + .9 * report).toFixed(2)})`
        },
           live);
      // It reports where its stimulus passes its threshold.
      el('path', {d : `M${X(gate)} ${y - 2} v${row - 4}`, class : 'aid-live-keyline k' + i + ' on'},
         live);
      if (!on)
        return;
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
           p => draft(setGate(studio.state.document, {id : cell.id}, vOf(p.x))), 'tastegate',
           'grip', settle);
      // Taste against touch: the grip on the row's upper edge, from all taste to all touch.
      drag(svg, el('circle', {cx : X(cell.field), cy : y, r : 4.5}, live),
           p => draft(updateCenter(studio.state.document, cell.id, {field : vOf(p.x)})),
           'tastefeel', 'grip', settle);
    });
  }
  function show() {
    const barbels = organ();
    if (!barbels)
      return;
    const kinds = organTypes(barbels), cells = kinds.map(type => type.centers[0]),
          caps = studio.state.capabilities;
    own.chosen = Math.min(own.chosen, cells.length - 1);
    own.probe ??= {q1 : cells[0].q1, q2 : cells[0].q2};
    kind.textContent = word('tasting', {list : bestScents(cells)});
    const touched = drawHead(barbels.centers, cells[own.chosen]);
    scentMap(map, {
      name : 'barbels',
      own,
      cells,
      stone : true,
      words : {sample : word('sample'), stone : word('stone')},
      most : MOST,
      place : (i, tuning) => updateCenter(studio.state.document, cells[i].id, tuning),
      width : (i, qwidth) => updateCenter(studio.state.document, cells[i].id, {qwidth}),
      remove : i => remove(kinds[i].id),
      add,
      draft,
      settle,
      redraw : again
    });
    drawRows(cells, touched);
    typeLife(life, {
      name : 'barbels',
      own,
      phases : cells.map(lifePhase),
      egg : 'none',
      words : {egg : word('egg'), grown : word('grown')},
      set : (i, to) => setLifePhase(studio.state.document, cells[i].id, to, caps.sensitivitySpan,
                                    caps.steepnessSpan),
      draft,
      settle,
      redraw : again
    });
  }
  return {root, show, tick() {}};
});
