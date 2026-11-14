// The gills' live inspector: the head cut level and seen from above, what its rakers keep of
// plankton and of the ground's flocks, and how much water goes through.
// The engine (physiology.hh, gill_area, gill_water, raker_*; feeding.cc, filter_through_gills):
//   pumped water = pump area x 2 x gill signal x mouth opening; held long, the signal averages
//                  half the command times what the fibres have left, so: area x command x
//                  reserve x opening;
//   met swimming = 2 x mouth x speed x how far the mouth is open beyond rest;
//   the rakers let the share raker_passage of it through and keep raker_retention of its
//   plankton; of the flocks in a mouthful of ground raker_sifting stays; sand never stays.
// The plan's report gives the pump area and the mouth for the whole plan at the reference body
// (state.anatomy.gills). While a grip is dragged the area follows the cells' strength on the
// engine's force curve, whose scale is read back from that report.
// A schema: the specks stand for food, not for water. Flocks come with suction strokes into the
// ground, which the jaw's opener makes; here they are given by the knob at the sand.
import {fastShare, fibreCourse, fibreForce, fibreHex} from '../../../fibre.js';
import {rakerPassage, rakerRetention, rakerSifting} from '../../../fish_organs.js';
import {ATELIER_LIMITS, BEHAVIOR_SCALE, BODY_UNIT, MOUTH_CYCLE} from '../../../schema.js';
import {percent, t} from '../../../strings.js';
import {
  findOrgan,
  gillRakers,
  lifePhase,
  setGillRakers,
  setLifePhase,
  setMuscleFibre,
  setNodeCopies,
  setOrganNodes
} from '../../model/document.js';
import {nodeLimit} from '../../model/organs.js';
import {label} from '../kit.js';
import {chip, clamp, drag, el, fishIcon, liveKind, path, picture, txt} from './kit.js';

const word = (key, values) => t('studio.live.gills.' + key, values);
const FULL = ATELIER_LIMITS.max_copies;
// long: steps the pump has beaten before its stroke is shown; fastest: the swim offered, twice
// the cruising speed; hatch: where the life picture marks hatching, a schematic place.
const GILL = Object.freeze({long : 400, fastest : 2 * BEHAVIOR_SCALE.cruising_speed, hatch : .5, beat : 900});
// Specks a second: of plankton for each unit of water, of flocks and of sand at the hardest suck.
const SPECKS = Object.freeze({plankton : 1.1, flock : 2.2, sand : 3});
const HEAD = Object.freeze({
  height : 184,
  mid : 84,
  tip : 46,
  gape : 17,
  cheek : 118,
  half : 40,
  lid : 72,
  arch : [ [ 182, 8 ], [ 126, 32 ] ],
  throat : 182,
  gut : 240,
  end : 296,
  // How far the cover swings: a little always, the rest with the root of the pump's share.
  swing : [ 3, 16 ],
  // Rakers drawn on an arch, open to dense.
  teeth : [ 3, 14 ]
});
const RAKERS = Object.freeze({L : 44, R : 264, top : 26, base : 96, height : 118, samples : 60});
const WATER = Object.freeze({L : 44, R : 250, top : 16, base : 92, FY : 124, height : 148, speedX : 276});
const LIFE = Object.freeze({L : 44, R : 264, top : 18, base : 70, icons : 88, height : 102, beside : 16, whole : .015, least : .08, on : .65});
// What a pump muscle's fast fibres have left after beating long at this command.
const leftAfter = (fast, drive) => {
  const reserve = fibreCourse(fast, GILL.long, drive).reserve.at(-1);
  return 1 - fast + fast * reserve;
};

liveKind('gills', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-gills';
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
  const kind = heading('');
  const head = svgOf();
  heading(word('rakers'));
  const rakers = svgOf();
  heading(word('water'));
  const water = svgOf();
  heading(word('life'));
  const life = svgOf();
  // What is tried on the gills: not part of the fish.
  const input = {open : .8, pump : 1, speed : BEHAVIOR_SCALE.cruising_speed, suck : 0, gut : .3, maturity : .8};
  const film = {lids : [], eyes : [], skin : null, room : null, specks : null, list : [], beat : 0};
  // forceScale: the scale of the engine's force curve, read back from the last compiled plan.
  let state = studio.state, m = null, forceScale = null;
  const organ = () => findOrgan(studio.state.document, organId);
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  const change = doc => doc && studio.changeDocument(doc, studio.state.selected);
  const again = () => show(studio.state);

  // The gills as the pictures need them, from the document and the plan's report.
  function derive(gills) {
    const cells = gills.centers, first = cells[0], phase = lifePhase(first), fast = fastShare(first.tau),
          report = state.anatomy?.gills, mouth = report?.mouthAperture ?? 0;
    const strength = n => n * first.copies / FULL * fibreForce(fast);
    // The engine's force curve, its scale read back from the report of the plan as compiled:
    // share = 2 F / (F + scale), area = 4 x mouth^2 x share.
    // The report belongs to the settled plan, so the scale is only taken while nothing is dragged.
    const whole = 4 * mouth * mouth, shareNow = whole > 0 ? (report.pumpArea ?? 0) / whole : 0;
    if (!studio.drafted && shareNow > 0 && shareNow < 1)
      forceScale = strength(cells.length) * (2 / shareNow - 1);
    const scale = forceScale;
    const areaOf = force => scale === null ? (report?.pumpArea ?? 0) : whole * Math.min(1, 2 * force / (force + scale));
    return {
      cells,
      pairs : cells.length / 2,
      copies : first.copies,
      fast,
      density : gillRakers(gills) ?? BODY_UNIT.trait_middle,
      from : phase.start ?? 0,
      until : phase.end ?? 1,
      mouth,
      areaOf,
      strength,
      rest : report?.restShare,
      most : nodeLimit(gills, state.sites)
    };
  }
  const works = r => r >= m.from && (m.until >= 1 || r < m.until);
  const pumped = (force, r = input.maturity, open = input.open) =>
      works(r) ? m.areaOf(force) * input.pump * leftAfter(m.fast, input.pump) * open : 0;
  const met = (open = input.open) =>
      2 * m.mouth * input.speed * Math.max(0, open - MOUTH_CYCLE.rest) / (1 - MOUTH_CYCLE.rest);
  const forceNow = () => m.strength(m.cells.length);
  // The most water any pump and any swim offered here gives: the scale of the water's picture.
  const mostWater = () => {
    let most = 0;
    for (let k = 0; k <= 20; k++)
      most = Math.max(most, m.areaOf(m.most * fibreForce(k / 20)) * leftAfter(k / 20, 1));
    return Math.max(1e-9, most + 2 * m.mouth * GILL.fastest);
  };
  // What a mouthful brings at this moment, of each kind: how much comes, what share of it stays.
  function stream() {
    const out = input.maturity >= GILL.hatch, fed = out && input.gut < 1,
          through = (pumped(forceNow()) + met()) * rakerPassage(m.density),
          ground = out && input.open > 0 ? input.suck : 0;
    return {
      through,
      kinds : [
        {food : 'plankton', rate : out ? SPECKS.plankton * through : 0, keeps : fed ? rakerRetention(m.density) : 0, size : 2.2},
        {food : 'flock', rate : SPECKS.flock * ground, keeps : fed ? rakerSifting(m.density) : 0, size : 3},
        {grain : true, rate : SPECKS.sand * ground, keeps : 0}
      ]
    };
  }
  const teeth = () => HEAD.teeth[0] + Math.round((HEAD.teeth[1] - HEAD.teeth[0]) * m.density);
  const toothAt = (k, n, side) => {
    const [[x0, y0], [x1, y1]] = HEAD.arch, at = (k + .5) / n;
    return [ x0 + (x1 - x0) * at, HEAD.mid + side * (y0 + (y1 - y0) * at) ];
  };

  function buildHead(fixed) {
    const {mid, throat, gut} = HEAD;
    film.skin = el('path', {class : 'aid-live-body'}, fixed);
    film.room = el('path', {class : 'aid-live-room'}, fixed);
    el('path', {d : `M${throat} ${mid - 7} H${gut} M${throat} ${mid + 7} H${gut}`, class : 'aid-live-guttube', 'stroke-width' : 2}, fixed);
    for (const side of [ 0, 1 ]) {
      const eye = el('g', {}, fixed);
      el('circle', {r : 5, class : 'aid-live-gilleye'}, eye);
      el('circle', {r : 1.3, cx : -1.8, cy : -1.5, class : 'aid-live-eye'}, eye);
      film.eyes[side] = eye;
      film.lids[side] = el('path', {class : 'aid-live-lid'}, fixed);
    }
    film.specks = el('g', {}, fixed);
  }
  function drawHead() {
    const {svg, under, live} = picture(head, HEAD.height, buildHead),
          {mid, tip, gape, cheek, half, lid, arch, gut, height} = HEAD, n = teeth(), now = stream();
    if (Number.isFinite(m.rest))
      txt(live, 4, 10, word('rest', {p : percent(m.rest, 1)}), {class : 'aid-live-small'});
    // Sand before the mouth, as far as the fish sucks at the ground.
    if (input.suck > 0) {
      const edge = (tip + 2) * Math.min(1, input.suck * 4);
      el('path', {d : `M0 16 H${edge} Q${edge + 5} ${height / 3} ${edge} ${height / 2} T${edge} ${height - 30} H0 Z`, class : 'aid-live-gillsand'}, under);
    }
    for (const side of [ -1, 1 ]) {
      // The arch and its rakers: teeth into the mouth's room, the denser the more of them.
      el('path', {d : `M${arch[0][0]} ${mid + side * arch[0][1]} L${arch[1][0]} ${mid + side * arch[1][1]}`, class : 'aid-live-arch'}, live);
      for (let k = 0; k < n; k++) {
        const [x, y] = toothAt(k, n, side);
        el('path', {d : `M${x} ${y} l-9 ${- side * 6}`, class : 'aid-live-raker'}, live);
      }
      // The pump muscle outside the cover: a piece for each pair of cells, the fuller the
      // thicker, in its fibres' colour.
      const piece = (lid - 16) / (m.most / 2);
      for (let i = 0; i < m.pairs; i++)
        el('path', {
          d : `M${cheek + 8 + piece * i + 2} ${mid + side * (half + 12)} h${piece - 4}`,
          stroke : fibreHex(m.fast),
          'stroke-width' : 2 + 6 * m.copies / FULL,
          'stroke-linecap' : 'round',
          opacity : works(input.maturity) ? 1 : .3
        },
           under);
    }
    // The gut behind the throat: how full it is (the knob), and beside that what arrives of
    // each kind. The word leads to the gut's own inspector.
    const g0 = gut, g1 = gut + 46, top = mid - 17, base = mid + 17, level = base - (base - top) * input.gut;
    el('rect', {x : g0, y : top, width : g1 - g0, height : base - top, rx : 7, class : 'aid-live-stomach-back'}, live);
    el('rect', {x : g0 + 2, y : Math.min(level, base - 2), width : 20, height : Math.max(0, base - level - 2), rx : 3, class : 'aid-live-stomach-content'}, live);
    el('rect', {x : g0, y : top, width : g1 - g0, height : base - top, rx : 7, class : 'aid-live-stomach'}, live);
    now.kinds.slice(0, 2).forEach((kindOf, i) => {
      const arrives = clamp(kindOf.rate * kindOf.keeps / (i ? SPECKS.flock : SPECKS.plankton * mostWater() * rakerPassage(1) * rakerRetention(1)));
      el('rect', {x : g0 + 26 + 9 * i, y : top + 3, width : 6, height : base - top - 6, rx : 2, class : 'aid-live-track'}, live);
      el('rect', {x : g0 + 26 + 9 * i, y : base - 3 - (base - top - 6) * arrives, width : 6, height : (base - top - 6) * arrives, rx : 2, class : 'aid-live-food-fill', 'data-food' : kindOf.food}, live);
    });
    drag(svg, el('circle', {cx : g0 + 12, cy : clamp(level, top + 4, base - 4), r : 5.5, class : 'aid-live-gutknob'}, live), p => {
      input.gut = clamp((base - p.y) / (base - top));
      again();
    }, 'gut', 'knob');
    const gutOrgan = studio.state.document.organs.find(o => o.type === 'gut');
    if (gutOrgan)
      txt(live, (g0 + g1) / 2, base + 13, word('gut'), {'text-anchor' : 'middle', class : 'aid-live-small aid-live-chip'})
          .addEventListener('click', () => studio.select('organ', gutOrgan.id, null, false));
    // What the organ is: the rakers' density on the arch; the pump muscle's cells on the cover,
    // fuller with the grip, more or fewer pairs with the buttons.
    const along = .15 + .7 * m.density, gx = arch[0][0] + (arch[1][0] - arch[0][0]) * along,
          gy = mid - (arch[0][1] + (arch[1][1] - arch[0][1]) * along);
    drag(svg, el('rect', {x : gx - 4, y : gy - 5.5, width : 8, height : 11, rx : 2, class : 'aid-live-rakergrip'}, live),
         p => draft(setGillRakers(studio.state.document, organId, clamp(((arch[0][0] - p.x) / (arch[0][0] - arch[1][0]) - .15) / .7))),
         'rakers', 'grip', settle);
    const my = mid - half - 17 - 12 * m.copies / FULL;
    drag(svg, el('rect', {x : cheek + 12, y : my - 4, width : 11, height : 8, rx : 2, style : 'fill:' + fibreHex(m.fast)}, live),
         p => draft(setNodeCopies(studio.state.document, organId, Math.round(clamp((mid - half - 17 - p.y) / 12 * FULL, 1, FULL)))),
         'size', 'grip', settle);
    const pairsTo = count => {
      const doc = setOrganNodes(studio.state.document, organId, count, studio.state.sites);
      if (!doc)
        return studio.notice(label('status.noRoom'));
      change(doc);
    };
    chip(live, cheek + lid - 20, mid - half - 24, '−', () => pairsTo(m.cells.length - 2), m.pairs > 1, 6);
    chip(live, cheek + lid - 4, mid - half - 24, '+', () => pairsTo(m.cells.length + 2), m.cells.length < m.most, 6);
    // What the organ is given: how wide the mouth stands open (the jaw's muscle), how hard the
    // pump is told to beat, how hard the fish sucks at the ground.
    drag(svg, el('circle', {cx : tip, cy : mid + 3 + gape * input.open, r : 5.5}, live), p => {
      input.open = clamp((p.y - mid - 3) / gape);
      again();
    }, 'open', 'knob');
    txt(live, tip + 8, mid + half + 13, word('open'), {class : 'aid-live-small'});
    drag(svg, el('circle', {cx : cheek + lid - 8, cy : mid + half + 20 + 12 * input.pump, r : 5.5}, live), p => {
      input.pump = clamp((p.y - mid - half - 20) / 12);
      again();
    }, 'pump', 'knob');
    txt(live, cheek + lid, mid + half + 36, word('command'), {class : 'aid-live-small'});
    drag(svg, el('circle', {cx : 8 + (tip - 14) * input.suck, cy : height - 14, r : 5.5, class : 'aid-live-sandknob'}, live), p => {
      input.suck = clamp((p.x - 8) / (tip - 14));
      again();
    }, 'suck', 'knob');
    txt(live, tip + 2, height - 10, word('suck'), {class : 'aid-live-small'});
  }
  // What stays in the fish over the rakers' density: of the plankton in the water before the
  // mouth (less water passes dense rakers, more of its plankton stays), and of the flocks in
  // the ground.
  function drawRakers() {
    const {svg, live} = picture(rakers, RAKERS.height), {L, R, top, base, samples} = RAKERS, d = m.density;
    const X = v => L + (R - L) * v, Y = v => base - (base - top) * v,
          kinds = [ [ 'plankton', v => rakerPassage(v) * rakerRetention(v) ], [ 'flock', rakerSifting ] ],
          shown = kinds.map(k => Math.round(100 * k[1](d)));
    el('path', {d : `M${L} ${top} V${base} H${R}`, class : 'aid-live-axis'}, live);
    txt(live, L, base + 17, word('open0'));
    txt(live, R, base + 17, word('dense'), {'text-anchor' : 'end'});
    txt(live, L - 4, top + 8, word('stays'), {'text-anchor' : 'end'});
    el('path', {d : `M${X(d)} ${top} V${base}`, class : 'aid-live-input'}, live);
    kinds.forEach(([ food, of ], i) => {
      el('path', {d : path(Array.from({length : samples + 1}, (_, k) => [ X(k / samples), Y(of(k / samples)) ])), class : 'aid-live-food-line', 'data-food' : food}, live);
      el('circle', {cx : X(d), cy : Y(of(d)), r : 3, class : 'aid-live-food-fill', 'data-food' : food}, live);
      // The higher value's number stands above its dot, the lower one's below; equal ones are
      // said once.
      const upper = shown[i] > shown[1 - i] || (shown[i] === shown[1 - i] && i === 0);
      if (shown[i] !== shown[1 - i] || i === 0)
        txt(live, X(d) + (d > .7 ? -7 : 7), Y(of(d)) + (upper || Y(of(d)) > base - 14 ? -5 : 13), percent(shown[i] / 100),
            {'text-anchor' : d > .7 ? 'end' : 'start', class : 'aid-live-food-word', 'data-food' : shown[i] === shown[1 - i] ? 'all' : food});
      el('circle', {cx : L + 4 + 124 * i, cy : top - 17.5, r : 3, class : 'aid-live-food-fill', 'data-food' : food}, live);
      txt(live, L + 10 + 124 * i, top - 14, word(food), {class : 'aid-live-small'});
    });
    drag(svg, el('rect', {x : X(d) - 4, y : base - 5.5, width : 8, height : 11, rx : 2, class : 'aid-live-rakergrip'}, live),
         p => draft(setGillRakers(studio.state.document, organId, clamp((p.x - L) / (R - L)))), 'line', 'grip', settle);
  }
  // The water through the gills: below what the fish meets while it swims with its mouth open,
  // on it what the covers pump, over the pump muscle's size. The fine line: the same with the
  // mouth wide open. Below, the muscle's fibres; beside, how fast the fish swims.
  function buildWater(fixed) {
    const {L, R, FY} = WATER, grad = el('linearGradient', {id : 'aid-live-gillfibres'}, el('defs', {}, fixed));
    el('stop', {offset : 0, 'stop-color' : fibreHex(0)}, grad);
    el('stop', {offset : 1, 'stop-color' : fibreHex(1)}, grad);
    el('rect', {x : L, y : FY - 4, width : R - L, height : 8, rx : 4, fill : 'url(#aid-live-gillfibres)', opacity : .85}, fixed);
    txt(fixed, L, FY + 19, word('enduring'));
    txt(fixed, R, FY + 19, word('strong'), {'text-anchor' : 'end'});
  }
  function drawWater() {
    const {svg, under, live} = picture(water, WATER.height, buildWater), {L, R, top, base, FY, speedX} = WATER,
          pass = rakerPassage(m.density), swum = met() * pass, scale = mostWater(), least = 2 / FULL, most = m.most,
          cells = m.cells.length * m.copies / FULL;
    // Along the bottom: the muscle's cells as full cells, from one pair of the thinnest to all
    // places full.
    const X = c => L + (R - L) * (c - least) / (most - least), Y = v => base - (base - top) * clamp(v / scale),
          force = c => c * fibreForce(m.fast), sum = c => swum + pumped(force(c)) * pass,
          wide = c => (met(1) + pumped(force(c), input.maturity, 1)) * pass;
    const line = of => Array.from({length : 65}, (_, k) => {
      const c = least + (most - least) * k / 64;
      return [ X(c), Y(of(c)) ];
    });
    el('path', {d : `M${L} ${Y(swum)} H${R} V${base} H${L} Z`, class : 'aid-live-met'}, under);
    el('path', {d : path(line(sum)) + ` L${R} ${Y(swum)} L${L} ${Y(swum)} Z`, fill : fibreHex(m.fast), opacity : .5}, under);
    el('path', {d : path(line(wide)), class : 'aid-live-wide'}, live);
    el('path', {d : path(line(sum)), class : 'aid-live-now'}, live);
    el('path', {d : `M${L} ${top} V${base} H${R}`, class : 'aid-live-axis'}, live);
    txt(live, L - 4, top + 8, word('amount'), {'text-anchor' : 'end'});
    txt(live, L, base + 13, word('weak'));
    txt(live, (L + R) / 2, base + 13, word('muscle'), {'text-anchor' : 'middle'});
    txt(live, R, base + 13, word('stronger'), {'text-anchor' : 'end'});
    txt(live, R - 3, Y(wide(most)) - 5, word('wide'), {'text-anchor' : 'end', class : 'aid-live-small'});
    el('rect', {x : L + 6, y : top + 2, width : 8, height : 8, rx : 2, fill : fibreHex(m.fast), opacity : .8}, live);
    txt(live, L + 18, top + 10, word('pumped'), {class : 'aid-live-small'});
    el('rect', {x : L + 6, y : top + 15, width : 8, height : 8, rx : 2, class : 'aid-live-met'}, live);
    txt(live, L + 18, top + 23, word('met'), {class : 'aid-live-small'});
    drag(svg, el('rect', {x : X(cells) - 4, y : Y(sum(cells)) - 5.5, width : 8, height : 11, rx : 2, style : 'fill:' + fibreHex(m.fast)}, live), p => {
      // Fuller cells first, then more pairs; pairs are only taken away with the button, for
      // with a cell go its wires. Where no further pair finds a place, the cells there are
      // carry the strength.
      const wanted = clamp(least + (p.x - L) / (R - L) * (most - least), least, most), have = m.cells.length,
            count = clamp(2 * Math.ceil(wanted / 2), have, m.most),
            grown = count > have ? setOrganNodes(studio.state.document, organId, count, studio.state.sites) : null,
            nodes = grown ? count : have;
      draft(setNodeCopies(grown ?? studio.state.document, organId, Math.round(clamp(wanted / nodes * FULL, 1, FULL))));
    }, 'curve', 'grip', settle);
    drag(svg, el('circle', {cx : L + (R - L) * m.fast, cy : FY, r : 7}, live),
         p => draft(setMuscleFibre(studio.state.document, organId, clamp((p.x - L) / (R - L)))), 'fibre', 'grip', settle);
    // How fast the fish swims: its own scale beside the picture.
    const SY = v => base - (base - top - 8) * v / GILL.fastest;
    el('path', {d : `M${speedX} ${base} V${top + 8}`, class : 'aid-live-axis'}, live);
    txt(live, speedX, top + 2, word('speed'), {'text-anchor' : 'middle', class : 'aid-live-small'});
    el('path', {d : `M${L} ${Y(swum)} H${swum > 0 ? speedX : R}`, class : 'aid-live-input'}, live);
    drag(svg, el('circle', {cx : speedX, cy : SY(input.speed), r : 5.5}, live), p => {
      input.speed = clamp((base - p.y) / (base - top - 8)) * GILL.fastest;
      again();
    }, 'speed', 'knob');
  }
  // The pump over the fish's life: from what maturity its cells can beat and at what they die.
  // The rakers stay as they are. In the egg the covers can beat already; the fish eats from
  // hatching on.
  function buildLife(fixed) {
    const {L, R, top, icons} = LIFE, hatch = L + (R - L) * GILL.hatch;
    txt(fixed, L, top - 4, word('ready'));
    el('ellipse', {cx : L + 8, cy : icons, rx : 6, ry : 5, class : 'aid-live-egg'}, fixed);
    el('circle', {cx : L + 8, cy : icons, r : 1.8, class : 'aid-live-eye'}, fixed);
    fishIcon(fixed, hatch, icons, .5);
    fishIcon(fixed, R - 16, icons, .8);
    el('path', {d : `M${L + 22} ${icons} H${hatch - 16} m-6 -3.5 l6 3.5 l-6 3.5 M${hatch + 18} ${icons} H${R - 40} m-6 -3.5 l6 3.5 l-6 3.5`, class : 'aid-live-arrow'}, fixed);
  }
  function drawLife() {
    const {svg, under, live} = picture(life, LIFE.height, buildLife), {L, R, top, base, beside, whole, least, on} = LIFE,
          caps = state.capabilities, until = Math.min(1, m.until), first = m.cells[0];
    const X = r => L + (R - L) * clamp(r), rOf = x => clamp((x - L) / (R - L)), Y = v => base - (base - top) * v,
          level = r => works(r) ? on : 0;
    el('rect', {x : L, y : top, width : R - L, height : base - top, class : 'aid-live-track'}, under);
    const cuts = [ ...new Set([ 0, m.from, until, 1 ]) ].sort((a, b) => a - b), line = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const v = level((cuts[i] + cuts[i + 1]) / 2);
      line.push([ X(cuts[i]), Y(v) ], [ X(cuts[i + 1]), Y(v) ]);
    }
    el('path', {d : path(line) + ` L${R} ${base} L${L} ${base} Z`, fill : fibreHex(m.fast), opacity : .4}, under);
    el('path', {d : path(line), class : 'aid-live-now', 'stroke-width' : 2}, live);
    // The food's way opens with hatching: a row of specks from there on.
    for (let x = X(GILL.hatch) + 8; x < R - 2; x += 11)
      el('circle', {cx : x, cy : top + 5, r : 2, class : 'aid-live-food-fill', 'data-food' : 'plankton'}, live);
    el('path', {d : `M${X(GILL.hatch)} ${top} V${base + 5}`, class : 'aid-live-hatch'}, live);
    el('path', {d : `M${L} ${top} V${base} H${R}`, class : 'aid-live-axis'}, live);
    const phase = to => setLifePhase(studio.state.document, first.id, to, caps.sensitivitySpan, caps.steepnessSpan);
    const grip = (inside, x, name, move) => drag(svg, el('rect', {x : x - 4, y : (inside ? Y(on / 2) : base - 7) - 5.5, width : 8, height : 11, rx : 2, style : 'fill:' + fibreHex(m.fast)}, live),
                                                 p => draft(move(rOf(p.x))), name, 'grip', settle);
    grip(m.from > 0, m.from > 0 ? X(m.from) : L - beside, 'from', to => phase({start : to < whole ? null : Math.min(to, until - least)}));
    grip(until < 1, until < 1 ? X(until) : R + beside, 'until', to => phase({end : to > 1 - whole ? null : Math.max(to, m.from + least)}));
    const r = input.maturity;
    el('path', {d : `M${X(r)} ${top} V${base}`, class : 'aid-live-input'}, live);
    drag(svg, el('circle', {cx : X(r), cy : Y(level(r)), r : 5.5}, live), p => {
      const before = input.maturity >= GILL.hatch;
      input.maturity = rOf(p.x);
      // Back in the egg nothing of the trial just shown drifts on.
      if (before && input.maturity < GILL.hatch)
        clearSpecks();
      again();
    }, 'maturity', 'knob');
  }
  function clearSpecks() {
    for (const speck of film.list)
      speck.dot.remove();
    film.list = [];
  }
  function show(next) {
    state = next;
    const gills = organ();
    if (!gills?.centers.length)
      return;
    m = derive(gills);
    kind.textContent = word(m.density < .25 ? 'kindOpen' : m.density < .72 ? 'kindSift' : 'kindFilter');
    drawHead();
    drawRakers();
    drawWater();
    drawLife();
    tick(0);
  }
  // The head at this moment: the mouth as wide as it is held, the covers at their stroke, and
  // the specks on their way: those the rakers keep stay on a tooth and go down the throat, the
  // others leave under the cover.
  function tick(dt) {
    if (!m || !film.specks)
      return;
    const {mid, tip, gape, cheek, half, lid, arch, throat, gut, end, swing} = HEAD, n = teeth(),
          whole = 4 * m.mouth * m.mouth, share = works(input.maturity) && whole > 0 ? m.areaOf(forceNow()) / whole : 0;
    film.beat = (film.beat + dt / GILL.beat) % 1;
    const lift = input.pump * (swing[0] + swing[1] * Math.sqrt(share)) * (share > 0 ? Math.max(0, Math.sin(2 * Math.PI * film.beat)) : 0),
          open = 3 + gape * input.open;
    for (const side of [ -1, 1 ]) {
      const i = (side + 1) / 2;
      film.lids[i].setAttribute('d', `M${cheek} ${mid + side * half} Q${cheek + lid / 2} ${mid + side * (half + 5 + lift / 2)} ${cheek + lid} ${mid + side * (half - 2 + lift)}`);
      film.eyes[i].setAttribute('transform', `translate(${.25 * tip + .5 * (tip + 40) + .25 * cheek - 6} ${mid + side * (.25 * open + .5 * (half - 4) + .25 * half - 1)})`);
    }
    // The skin: snout, cheeks, the body behind the gill slits, closed at its end.
    film.skin.setAttribute('d', `M${tip} ${mid - open} Q${tip + 40} ${mid - half + 4} ${cheek} ${mid - half} L${cheek + lid + 5} ${mid - half + 7} Q${end - 8} ${mid - half + 8} ${end} ${mid} Q${end - 8} ${mid + half - 8} ${cheek + lid + 5} ${mid + half - 7} L${cheek} ${mid + half} Q${tip + 40} ${mid + half - 4} ${tip} ${mid + open} Z`);
    // The mouth's room, from the lips to the arches and the throat.
    film.room.setAttribute('d', `M${tip + 1} ${mid - open + 1} Q${tip + 40} ${mid - half + 12} ${arch[1][0]} ${mid - arch[1][1]} L${arch[0][0]} ${mid - arch[0][1] + 1} V${mid + arch[0][1] - 1} L${arch[1][0]} ${mid + arch[1][1]} Q${tip + 40} ${mid + half - 12} ${tip + 1} ${mid + open - 1} Z`);
    const now = stream();
    for (const kindOf of now.kinds) {
      if (Math.random() >= kindOf.rate * dt / 1000)
        continue;
      const side = Math.random() < .5 ? -1 : 1, kept = Math.random() < kindOf.keeps,
            [rx, ry] = toothAt(Math.floor(Math.random() * n), n, side),
            start = [ tip - 28, mid + side * Math.random() * open * .8 ], inside = [ tip + 44, mid + side * (3 + Math.random() * 12) ];
      // Kept: onto a tooth, a rest there, along the arch into the throat. Not kept: between
      // the teeth and out under the cover.
      const way = kept ? [ start, inside, [ rx - 8, ry - side * 5 ], [ rx - 8, ry - side * 5 ], [ throat, mid + side * 3 ], [ gut + 4, mid ] ]
                       : [ start, inside, [ rx - 4, ry - side * 3 ], [ rx + 12, ry + side * 9 ], [ cheek + lid + 4, mid + side * (half + 5) ], [ 304, mid + side * (half + 16) ] ];
      const dot = kindOf.grain ? el('rect', {width : 2.6, height : 2.6, x : -1.3, y : -1.3, class : 'aid-live-grain'}, film.specks)
                               : el('circle', {r : kindOf.size, class : 'aid-live-food-fill', 'data-food' : kindOf.food}, film.specks);
      film.list.push({way, at : 0, kept, dot});
    }
    const pace = (.9 + .25 * Math.sqrt(now.through)) * dt / 1000;
    film.list = film.list.filter(speck => {
      speck.at += pace * (speck.kept && speck.at >= 2 && speck.at < 3 ? .5 : 1);
      if (speck.at >= 5) {
        speck.dot.remove();
        return false;
      }
      const i = Math.floor(speck.at), f = speck.at - i, a = speck.way[i], b = speck.way[i + 1];
      speck.dot.setAttribute('transform', `translate(${(a[0] + (b[0] - a[0]) * f).toFixed(1)} ${(a[1] + (b[1] - a[1]) * f).toFixed(1)})`);
      return true;
    });
  }
  return {root, show, tick};
});
