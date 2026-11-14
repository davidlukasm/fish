// The side fin muscle's live inspector: the fish from the side with its fin as an oar, and what a
// beat does to the fish; below it the muscle's life.
// Read in the engine (src/body_plan.cc:89-128, fin_mechanics; src/movement.cc:9-19, 78-97):
//   a side fin cell beats at its angle: straight back at 0, outward up to 90 degrees, inward down
//   to -90; along the body its force pushes the fish and turns it with the cell's lever, as an
//   oar does; across the body it pushes the fish away from the fin's side and turns it with the
//   cell's arm ahead of or behind the body's middle;
//   a fin grips the water 1 - 0.5 x s / (1 + s), s the fish's speed over its cruising speed:
//   fully at a stand, half at great speed; in the ground it grips 4 x depth x (1 - depth) of what
//   is missing: fully when the fish is half dug in.
// The fish looks to the left, as in the fish panel. The fin's side of the fish is its lower edge
// here, across is up. The antagonist beats forward: everything its beat does is turned round.
// ASSUMED for the picture: the lever and the arm of the fin's place (set on the fish).
// Not in the picture: that the ground's resistance across adds to a fin's grip there.
// Speed and depth are the picture's own knobs; the fish panel has no probe for them.
import {FIN_STROKE, SIDE_FIN} from '../../../schema.js';
import {t} from '../../../strings.js';
import {findOrgan, finAngle, finStroke, setFinAngle} from '../../model/document.js';
import {clamp, drag, el, liveKind, picture} from './kit.js';
import {eggShape, fishLeft, LIFE, lifeBand, lifePlaces} from './skin.js';

const word = key => t('studio.live.fin.' + key);
const FIN = Object.freeze({
  height : 206,
  cx : 168,
  cy : 96,
  s : 2.5,
  hinge : [ 8, 30 ],
  blade : 38,
  arrow : 50,
  lever : .5,
  arm : .25,
  swing : 24,
  round : 2400,
  fast : 3,
  ring : 100,
  streak : {x : 104, y : 34, long : [ 8, 70 ]},
  sand : {x : 8, y : 158, w : 56, h : 36, span : 22}
});
const radians = d => d * Math.PI / 180, degrees = r => r * 180 / Math.PI;

liveKind('fin', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-fin';
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
  heading(word('does'));
  const oar = svgOf();
  heading(word('life'));
  const life = svgOf();
  // What is tried: the fish's speed over its cruising speed, and how deep it lies in the ground.
  const own = {speed : .3, bury : 0};
  const film = {blade : null, effects : null, angle : 0, hx : 0, hy : 0, phase : 0};
  const organ = () => findOrgan(studio.state.document, organId);
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  function drawOar(muscle) {
    const {svg, live} = picture(oar, FIN.height,
                                fixed => {
                                  fishLeft(fixed, FIN.cx, FIN.cy, FIN.s);
                                  el('rect', {
                                    x : FIN.sand.x,
                                    y : FIN.sand.y,
                                    width : FIN.sand.w,
                                    height : FIN.sand.h,
                                    rx : 4,
                                    class : 'aid-live-fin-ground'
                                  },
                                     fixed);
                                }),
                {cx, cy} = FIN, hx = cx - FIN.hinge[0], hy = cy + FIN.hinge[1],
                angle = SIDE_FIN.angle * (2 * finAngle(muscle) - 1), a = radians(angle),
                sense = finStroke(muscle) === FIN_STROKE.front ? -1 : 1;
    // How well the fin grips: the water by the fish's speed, the ground by how deep it lies in it.
    const water = 1 - .5 * own.speed / (1 + own.speed), ground = 4 * own.bury * (1 - own.bury),
          grip = (water + (1 - water) * ground) * sense;
    const push = Math.cos(a) * grip, across = Math.sin(a) * grip,
          turn = (Math.cos(a) * FIN.lever + Math.sin(a) * FIN.arm) * grip;
    // What the beat does to the fish: it pushes it along, across, and turns it.
    const effects = el('g', {class : 'aid-live-fin-effect'}, live);
    const arrow = (x0, y0, x1, y1) => {
      const long = Math.hypot(x1 - x0, y1 - y0);
      if (long < 4)
        return;
      const ux = (x1 - x0) / long, uy = (y1 - y0) / long;
      el('path', {
        d : `M${x0} ${y0} L${x1} ${y1} m${- 7 * ux + 4.5 * uy} ${- 7 * uy - 4.5 * ux} L${x1} ${
            y1} l${- 7 * ux - 4.5 * uy} ${- 7 * uy + 4.5 * ux}`
      },
         effects);
    };
    // Along is to the left, across away from the fin, up.
    arrow(cx - 80, cy, cx - 80 - FIN.arrow * push, cy);
    arrow(cx, cy - 40, cx, cy - 40 - FIN.arrow * across);
    if (Math.abs(turn) > .03) {
      // The turn: an arc before the snout, as long as the turn, away from the fin's side.
      const r = FIN.ring, to = -70 * turn,
            at = d => [cx - r * Math.cos(radians(d)), cy + r * Math.sin(radians(d))],
            [ x0, y0 ] = at(0), [ x1, y1 ] = at(to), way = to > 0 ? 1 : -1;
      el('path', {d : `M${x0} ${y0} A${r} ${r} 0 0 ${to > 0 ? 0 : 1} ${x1} ${y1}`}, effects);
      const tx = Math.sin(radians(to)) * way, ty = Math.cos(radians(to)) * way;
      el('path', {
        d : `M${x1 - 7 * tx + 4.5 * ty} ${y1 - 7 * ty - 4.5 * tx} L${x1} ${y1} L${
            x1 - 7 * tx - 4.5 * ty} ${y1 - 7 * ty + 4.5 * tx}`
      },
         effects);
    }
    // The fin: a blade at its hinge, pointing where it beats: straight back is to the right here,
    // outward down.
    const blade = el('path', {
      d : `M0 -4 Q${FIN.blade * .6} -9 ${FIN.blade} 0 Q${FIN.blade * .6} 9 0 4 Z`,
      class : 'aid-live-fin-blade k0'
    },
                     live);
    Object.assign(film, {blade, effects, angle, hx, hy});
    const tip = [ hx + FIN.blade * Math.cos(a), hy + FIN.blade * Math.sin(a) ];
    drag(svg,
         el('rect', {
           x : tip[0] - 4.5,
           y : tip[1] - 4.5,
           width : 9,
           height : 9,
           rx : 2.5,
           class : 'aid-live-keygrip k0 on'
         },
            live),
         p => draft(setFinAngle(
             studio.state.document, organId,
             (clamp(degrees(Math.atan2(p.y - hy, Math.max(0, p.x - hx))) / SIDE_FIN.angle, -1, 1) +
              1) /
                 2,
             studio.state.sites)),
         'finangle', 'grip', settle);
    // The fish's speed: the water streaming past it, the longer the faster; the knob at its end.
    const S = FIN.streak, long = S.long[0] + (S.long[1] - S.long[0]) * own.speed / FIN.fast;
    for (const dy of [-9, 0, 9])
      el('path',
         {d : `M${S.x} ${S.y + dy} h${long * (dy ? .7 : 1)}`, class : 'aid-live-fin-stream'}, live);
    drag(svg,
         el('circle', {cx : S.x + long, cy : S.y, r : 5, class : 'aid-live-fin-streamknob'}, live),
         p => {
           own.speed = clamp((p.x - S.x - S.long[0]) / (S.long[1] - S.long[0])) * FIN.fast;
           show();
         },
         'finspeed', 'knob');
    // How deep the fish lies in the ground: the little fish is dragged down into the sand.
    const G = FIN.sand, iy = G.y - 8 + G.span * own.bury;
    fishLeft(live, G.x + 30, iy, .5);
    if (own.bury > 0)
      el('rect',
         {x : G.x, y : G.y, width : G.w, height : G.h, rx : 4, class : 'aid-live-fin-ground over'},
         live);
    drag(svg,
         el('circle', {cx : G.x + 8, cy : iy, r : 5, class : 'aid-live-sandknob'}, live), p => {
           own.bury = clamp((p.y - G.y + 8) / G.span);
           show();
         }, 'finbury', 'knob');
    beat();
  }
  // The fin beats; what it does shows while it beats.
  function beat() {
    if (!film.blade)
      return;
    const pull = film.phase < .35 ? Math.sin(Math.PI * film.phase / .35) : 0;
    film.blade.setAttribute('transform', `translate(${film.hx} ${film.hy}) rotate(${
                                             (film.angle - FIN.swing * (1 - pull)).toFixed(1)})`);
    film.effects.setAttribute('opacity', (.3 + .7 * pull).toFixed(2));
  }
  // Its life: in the egg the fin twitches like every muscle; after hatching it rows.
  function drawLife(muscle) {
    const {svg, under, live} = picture(life, LIFE.height, fixed => {
      const {egg, grown, y} = lifePlaces();
      eggShape(fixed, egg, y, 19, false);
      el('path', {
        d : `M${egg + 4} ${y + 3} q7 2 9 8 M${egg + 15} ${y + 2} l3 -3 M${egg + 17} ${y + 7} l4 0`,
        class : 'aid-live-fin-twitch k0'
      },
         fixed);
      fishLeft(fixed, grown, y, .62);
      el('path',
         {d : `M${grown - 4} ${y + 7} q9 3 14 9 q-9 0 -14 -5 Z`, class : 'aid-live-fin-blade k0'},
         fixed);
    });
    lifeBand(svg, under, live, {
      studio,
      center : muscle.centers[0],
      centers : muscle.centers.map(c => c.id),
      name : 'fin',
      draft,
      settle
    });
  }
  function show() {
    const muscle = organ();
    if (!muscle?.centers.length)
      return;
    drawOar(muscle);
    drawLife(muscle);
  }
  return {
    root,
    show,
    tick(dt) {
      film.phase = (film.phase + dt / FIN.round) % 1;
      beat();
    }
  };
});
