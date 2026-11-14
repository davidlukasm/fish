// The mouth's live inspector: jaw and opener as one picture, whichever of the two muscles is
// chosen. The head from the side, looking to the left as in the fish panel; before the mouth the
// four kinds of food, each with the bite it gets.
// Read in the engine (src/physiology.hh:266-305):
//   the mouth opens to the share short + span x the jaw's length of the body; a longer jaw opens
//   wider and has the shorter lever;
//   bite force = the jaw cells' capacity x the brain's command x the body's size x lever x the
//   teeth's grip: sharp teeth cut flesh, blunt ones grind plants and crack shells, a loose piece
//   gives way to either;
//   the opener sucks with its cells' capacity x the body's size; scraping algae takes the sucking
//   force x the opener's pull x lever^2.
// The food tiles use the plan's fully driven bite and scrape forces.
import {ATELIER_LIMITS, BODY_UNIT, MOTOR_KIND} from '../../../schema.js';
import {mouthShare} from '../../../fish_forms.js';
import {tList} from '../../../strings.js';
import {findOrgan, muscleTrait, setMuscleTrait, setNodeCopies} from '../../model/document.js';
import {organFunction} from '../../model/organs.js';
import {clamp, drag, el, liveKind, picture, txt} from './kit.js';

const MOUTH = Object.freeze({
  height : 226,
  hinge : [ 180, 78 ],
  jaw : [ 46, 92 ],
  gape : 58,
  teeth : 6,
  round : 3000,
  muscles : {
    [MOTOR_KIND.aggression] : {x : 26, y : 4, k : 0},
    [MOTOR_KIND.suction] : {x : 30, y : 32, k : 1}
  },
  colours : [ '#ee9f9a', '#8fd18a', '#e6b47c', '#77d2bd' ]
});
const degrees = r => r * 180 / Math.PI;

liveKind('mouth', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-mouth';
  const svgOf = () => {
    const svg = el('svg', {class : 'aid-live-picture'});
    root.appendChild(svg);
    return svg;
  };
  const head = svgOf();
  let film = null, phase = 0;
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  // The muscles of one kind and their cells.
  const musclesOf = code => studio.state.document.organs.filter(
      o => o.type === 'muscle' && organFunction(o, studio.state.sites) === code);
  const cellsOf = organs =>
      organs.reduce((sum, o) => sum + o.centers.reduce((n, c) => n + c.copies, 0), 0);
  function model() {
    const state = studio.state, middle = BODY_UNIT.trait_middle,
          trait = key => muscleTrait(state.document, MOTOR_KIND.aggression, key, state.sites),
          long = trait('jaw_length') ?? middle, blunt = trait('blunt_teeth') ?? middle,
          jaws = musclesOf(MOTOR_KIND.aggression), openers = musclesOf(MOTOR_KIND.suction);
    return {
      long,
      blunt,
      jaws,
      openers,
      bite : cellsOf(jaws),
      suck : cellsOf(openers),
      // The force on each kind of food: cutting, grinding, a loose piece, scraping.
      forces : state.anatomy?.mouthForces ?? []
    };
  }
  function drawHead(m) {
    const {svg, live} = picture(head, MOUTH.height), [ hx, hy ] = MOUTH.hinge,
                long = MOUTH.jaw[0] + (MOUTH.jaw[1] - MOUTH.jaw[0]) * m.long,
                open = MOUTH.gape * mouthShare(m.long), most = ATELIER_LIMITS.max_copies;
    // The head behind the jaws, with the two muscles: the jaw's closer above, the opener below.
    el('path', {
      d : `M${hx - 8} ${hy - 30} Q${hx + 40} ${hy - 52} ${hx + 84} ${hy - 46} q12 2 12 14 V${
          hy + 38} q0 12 -12 12 Q${hx + 40} ${hy + 50} ${hx - 8} ${hy + 30} Z`,
      class : 'aid-live-head'
    },
       live);
    el('circle', {cx : hx + 34, cy : hy - 22, r : 5, class : 'aid-live-eye'}, live);
    const sizeOf = cells => 9 + 1.4 * Math.min(cells, 2 * most);
    for (const [code, organs, cells] of [[ MOTOR_KIND.aggression, m.jaws, m.bite ],
                                         [ MOTOR_KIND.suction, m.openers, m.suck ]]) {
      if (!organs.length)
        continue;
      const {x, y, k} = MOUTH.muscles[code], cx = hx + x, cy = hy + y, out = sizeOf(cells),
                   own = organs.some(o => o.id === organId);
      el('ellipse', {
        cx,
        cy,
        rx : out,
        ry : out * .55,
        class : 'aid-live-mouth-muscle k' + k + (own ? ' own' : ''),
        transform : `rotate(-18 ${cx} ${cy})`
      },
         live);
      // The grip at a muscle: the cells of each of its nodes.
      const nodes = organs.reduce((n, o) => n + o.centers.length, 0);
      drag(svg,
           el('rect', {
             x : cx + out - 4,
             y : cy - 5 - out * .3,
             width : 8,
             height : 10,
             rx : 2,
             class : 'aid-live-keygrip k' + k + ' on'
           },
              live),
           p => {
             const copies = Math.round(clamp((p.x - cx - 9) / 1.4 / nodes, 1, most));
             draft(organs.reduce((doc, o) => setNodeCopies(doc, o.id, copies) ?? doc,
                                 studio.state.document));
           },
           'mouthcells' + k, 'grip', settle);
    }
    // The jaws: two bars from the hinge; they open and shut.
    const jaws = [ -1, 1 ].map(side => {
      const g = el('g', {}, live);
      el('path', {d : `M0 0 L${- long} 0`, class : 'aid-live-mouth-jaw'}, g);
      // The teeth: sharp points or blunt blocks.
      for (let n = 0; n < MOUTH.teeth; n++) {
        const x = -long * (.35 + .6 * n / (MOUTH.teeth - 1)), flat = 3.2 * m.blunt,
              high = 7 - 3 * m.blunt;
        el('path', {
          d : `M${x - 3.4} 0 L${x - flat} ${- side * high} L${x + flat} ${- side * high} L${
              x + 3.4} 0 Z`,
          class : 'aid-live-mouth-tooth'
        },
           g);
      }
      return {g, side};
    });
    // Before the mouth the four kinds of food, each bitten as deep as the force on it.
    const names = tList('studio.live.mouth.foods');
    names.forEach((name, j) => {
      const x = 40 + 73 * j, y = 176, deep = Math.sqrt(clamp(m.forces[j] ?? 0));
      el('rect', {x : x - 15, y : y - 15, width : 30, height : 30, rx : 7, fill : MOUTH.colours[j]},
         live);
      // The area of the mark follows force. Both dimensions grow together so weak bites
      // remain visible, while a missing muscle still leaves the food whole.
      if (deep > 0)
        el('path', {
          d : `M${x - 15 * deep} ${y - 15} Q${x} ${y - 15 + 60 * deep} ${x + 15 * deep} ${
              y - 15} Z`,
          class : 'aid-live-mouth-bite'
        },
           live);
      txt(live, x, y + 29, name,
          {'text-anchor' : 'middle', class : 'aid-live-small', style : `fill:${MOUTH.colours[j]}`});
    });
    // The jaw's settings, where there is a jaw muscle to carry them: its length at its tip, the
    // teeth's form at a tooth.
    let tipGrip = null, toothGrip = null;
    const setTrait = (key, value) => draft(setMuscleTrait(
        studio.state.document, MOTOR_KIND.aggression, key, clamp(value), studio.state.sites));
    if (m.jaws.length) {
      tipGrip =
          el('rect', {width : 9, height : 9, rx : 2.5, class : 'aid-live-keygrip k0 on'}, live);
      drag(svg, tipGrip,
           p => setTrait('jaw_length', (hx - p.x - MOUTH.jaw[0]) / (MOUTH.jaw[1] - MOUTH.jaw[0])),
           'mouthlong', 'grip', settle);
      toothGrip = el('circle', {r : 4.5}, live);
      drag(svg, toothGrip, p => setTrait('blunt_teeth', (p.x - (hx - long * .9)) / (long * .5)),
           'mouthblunt', 'grip', settle);
    }
    // The water the opener draws in: threads before the mouth, the more the stronger it sucks.
    const threads =
        m.openers.length
            ? Array.from({length : 5}, () => el('path', {class : 'aid-live-fin-stream'}, live))
            : [];
    film = {jaws, tipGrip, toothGrip, threads, long, open, hx, hy, blunt : m.blunt, suck : m.suck};
    move();
  }
  // The mouth opens and sucks, then bites.
  function move() {
    if (!film)
      return;
    const {jaws,
           tipGrip,
           toothGrip,
           threads,
           long,
           open,
           hx,
           hy,
           blunt,
           suck} = film,
           wide = phase < .55 ? Math.sin(Math.PI * phase / .55) : 0,
           angle = degrees(Math.atan2(open * wide / 2, long));
    for (const {g, side} of jaws)
      g.setAttribute('transform', `translate(${hx} ${hy + side * 4}) rotate(${- side * angle})`);
    const tx = hx - long, at = .9 - .5 * blunt;
    tipGrip?.setAttribute('x', (tx - 4.5).toFixed(1));
    tipGrip?.setAttribute('y', (hy - 4 - open * wide / 2 * .98 - 12).toFixed(1));
    toothGrip?.setAttribute('cx', (hx - long * at).toFixed(1));
    toothGrip?.setAttribute('cy', (hy + 4 + open * wide / 2 * at + 10).toFixed(1));
    threads.forEach((e, n) => {
      const far = (20 + 30 * Math.min(1, suck / ATELIER_LIMITS.max_copies)) * wide,
            y = hy + (n - 2) * open * wide / 5;
      e.setAttribute('d', `M${tx - 6 - far} ${y + (n - 2) * 5 * wide} L${tx - 6} ${y}`);
      e.setAttribute('opacity', (wide * .9).toFixed(2));
    });
  }
  function show() {
    const muscle = findOrgan(studio.state.document, organId);
    if (!muscle?.centers.length)
      return;
    drawHead(model());
  }
  return {
    root,
    show,
    tick(dt) {
      phase = (phase + dt / MOUTH.round) % 1;
      move();
    }
  };
});
