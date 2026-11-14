// The defence's live inspector: the fish with its spines against a mouth; and the cells' life.
// Read in the engine (body_plan.cc, local_defense, spine_aim, spread_spines and the raising of
// spines; material.hh, resting_spine_height; feeding.cc, the bite and what fits a mouth;
// embryo.cc): defence cells stand on the skin and aim from the body's middle to their place;
// their strength is spread over the rim by the wedge of their field's width. At rest the spines
// stand as high as the cells' capacity gives; raised by the brain they stand higher; what counts
// is the higher of the two. A bite from a direction is held off by the guard there, as far as the
// fish can pay for it from its reserve. Who would swallow the fish whole reckons with its radius
// x (1 + the spines' height). In the egg, raising them against the shell harms the fish itself.
// The guard round the fish at rest and raised is the plan's report (anatomy.spinesRest,
// spinesRaised: all the fish's spines together), this organ's direction too (spineAims).
// The mouth and the raising are the picture's own knobs; the fish panel has no probe for them.
// Raised is as high as the planned muscles can raise them under a lasting command
// (anatomy.spineHeights and spinesRaised).
// Not in the pictures: that a hungry fish holds off less; the brake in the water and in the sand.
import {t} from '../../../strings.js';
import {ATELIER_LIMITS} from '../../../schema.js';
import {contactFieldOf, contactHalfAngle} from '../../../tuning.js';
import {findOrgan, groupReport, setNodeCopies, updateCenter} from '../../model/document.js';
import {clamp, drag, el, liveKind, picture} from './kit.js';
import {eggShape, fishAbove, lifeBand, lifePlaces, LIFE} from './skin.js';

const word = (key, values) => t('studio.live.defense.' + key, values);
const SPINE = Object.freeze({
  height : 236,
  cx : 150,
  cy : 118,
  s : 1.9,
  rx : 52,
  ry : 21,
  body : 30,
  long : 26,
  gape : [ .5, 2.1 ],
  step : 2
});
const radians = d => d * Math.PI / 180, degrees = r => r * 180 / Math.PI;
const turnTo = a => ((a + 540) % 360) - 180;

liveKind('defense', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-defense aid-live-sense-ache';
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
  heading(word('guards'));
  const spines = svgOf();
  heading(word('life'));
  const life = svgOf();
  // What is tried on the spines: how far the brain has them raised, and the mouth (where it bites
  // from, in degrees from the snout; how wide it opens, in body radii). Not part of the fish.
  const own = {up : .4, mouth : {bearing : -60, gape : 1.2}, pull : null};
  const organ = () => findOrgan(studio.state.document, organId);
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => {
    own.pull = null;
    if (studio.drafted)
      studio.settleGraphic();
  };
  function drawSpines(cell) {
    const {spinesRest : rest, spinesRaised : raised} = studio.state.anatomy ?? {},
                                             aim = groupReport(studio.state.document,
                                                               studio.state.anatomy, 'spineAims',
                                                               cell.id);
    const {svg, live} =
        picture(spines, SPINE.height, fixed => fishAbove(fixed, SPINE.cx, SPINE.cy, SPINE.s));
    if (!rest?.length || !raised?.length || !Number.isFinite(aim))
      return;
    const {cx, cy, rx, ry} = SPINE, count = rest.length, mouth = own.mouth,
                       guard =
                           rest.map((v, k) => Math.min(1, v + Math.max(0, raised[k] - v) * own.up)),
                       // The spines' height for the whole fish, at rest and as high as its
                       // muscles can raise them: what a mouth that would swallow it reckons with.
        [ low, high ] = studio.state.anatomy?.spineHeights ?? [ 0, 0 ],
                       lift = Math.max(0, high - low), height = low + own.up * lift;
    // A place on the rim, the fish's right side down; a direction in degrees from the snout.
    const rim = (angle, out = 0) => [cx - 4 - (rx + out) * Math.cos(radians(angle)),
                                     cy + (ry + out) * Math.sin(radians(angle))],
          angleOf = p => degrees(Math.atan2((p.y - cy) / (ry + 30), (cx - 4 - p.x) / (rx + 30))),
          direction = k => -180 + (k + .5) * 360 / count,
          at = angle => clamp(Math.floor((turnTo(angle) + 180) * count / 360), 0, count - 1),
          outOf = p => Math.hypot((p.x - cx + 4) / rx, (p.y - cy) / ry) * ry - ry;
    // The spines: as long as the guard there; what stands at rest light, what the brain has
    // raised beyond it in the cells' colour.
    for (let k = 0; k < count; k += SPINE.step) {
      if (guard[k] <= 0)
        continue;
      const a = direction(k), [ x0, y0 ] = rim(a), [ x1, y1 ] = rim(a, SPINE.long * rest[k]),
            [ x2, y2 ] = rim(a, SPINE.long * guard[k]);
      if (guard[k] > rest[k])
        el('path',
           {d : `M${x1} ${y1} L${x2} ${y2}`, class : 'aid-live-hair k0', 'stroke-width' : 1.8},
           live);
      el('path', {d : `M${x0} ${y0} L${x1} ${y1}`, class : 'aid-live-spine'}, live);
    }
    // How big the fish is for a mouth: a circle, its radius x (1 + the spines' height). The
    // mouth: two jaws in a V; their tips stand at the circle, as far apart as the mouth opens, in
    // the circle's measure: it swallows the fish whole only if they clear it.
    const big = SPINE.body * (1 + height), fits = mouth.gape >= 1 + height,
          ux = Math.cos(radians(mouth.bearing)), uy = -Math.sin(radians(mouth.bearing)),
          from = out => [cx - 4 - out * ux, cy - out * uy], [ mx, my ] = from(big + 46),
          [ tx, ty ] = from(big + 5), half = SPINE.body * mouth.gape,
          jaw = side => [tx + side * uy * half, ty - side * ux * half];
    el('circle',
       {cx : cx - 4, cy, r : big, class : fits ? 'aid-live-swallow fits' : 'aid-live-swallow'},
       live);
    for (const side of [-1, 1]) {
      const [jx, jy] = jaw(side);
      el('path', {d : `M${mx} ${my} L${jx} ${jy}`, class : 'aid-live-jaw'}, live);
    }
    // The bite: what the spines there hold off stops at them, the rest goes into the body;
    // beside it what holding it off costs: a drop of the reserve, as big as the harm held off.
    const held = guard[at(mouth.bearing)], [ bx, by ] = rim(mouth.bearing, SPINE.long * held + 3),
          [ ix, iy ] = rim(mouth.bearing, -16 * (1 - held)), [ sx, sy ] = from(big + 30);
    el('path', {d : `M${sx} ${sy} L${bx} ${by}`, class : 'aid-live-jaw', 'stroke-width' : 5}, live);
    if (held < 1)
      el('path',
         {d : `M${bx} ${by} L${ix} ${iy}`, class : 'aid-live-jaw', 'stroke-width' : 5 * (1 - held)},
         live);
    if (held > 0) {
      el('path', {
        d : `M${bx - uy * 9} ${by + ux * 9} L${bx + uy * 9} ${by - ux * 9}`,
        class : 'aid-live-spine',
        'stroke-width' : 1.5 + 4 * held
      },
         live);
      const [dx, dy] = [ bx - uy * 20, by + ux * 20 ];
      el('path', {
        d : `M${dx} ${dy - 6} q5 6 0 9 q-5 -3 0 -9 Z`,
        class : 'aid-live-reservedrop',
        transform : `translate(${dx} ${dy}) scale(${(.5 + 1.3 * held).toFixed(2)}) translate(${
            - dx} ${- dy})`
      },
         live);
    }
    // The settings: the field's width where this organ's spines end; its cells at the tip of its
    // middle spine as it stands at rest (pulled out: more cells, a higher rest).
    const place = degrees(aim), mid = at(place),
          [ wx, wy ] = rim(place + Math.min(contactHalfAngle(cell.field ?? 0), 179), 5);
    drag(svg, el('circle', {cx : wx, cy : wy, r : 4.5}, live),
         p => draft(updateCenter(studio.state.document, cell.id,
                                 {field : contactFieldOf(Math.abs(turnTo(angleOf(p) - place)))})),
         'defensefield', 'grip', settle);
    const [px, py] = rim(direction(mid), SPINE.long * rest[mid]);
    drag(svg,
         el('rect', {x : px - 4.5, y : py - 4.5, width : 9, height : 9, rx : 2.5}, live), p => {
           // From where the pull began: a cell more for every few units outward.
           own.pull ??= {out : outOf(p), copies : cell.copies};
           const copies = clamp(own.pull.copies + Math.round((outOf(p) - own.pull.out) / 3), 1,
                                ATELIER_LIMITS.max_copies);
           if (copies !== cell.copies)
             draft(setNodeCopies(studio.state.document, organId, copies));
         }, 'defensecells', 'grip', settle);
    // The inputs: the brain raises the spines (the knob beyond the middle spine's tip); the mouth
    // is dragged round the fish at its hinge and opened at a jaw's tip.
    const [rx2, ry2] = rim(direction(mid), SPINE.long * guard[mid] + 9),
                span = Math.max(.02, raised[mid] - rest[mid]);
    // Muscles that cannot raise the spines above their rest have no knob for it.
    if (lift > 0)
      drag(svg, el('circle', {cx : rx2, cy : ry2, r : 5, class : 'aid-live-petal k0'}, live), p => {
        own.up = clamp(((outOf(p) - 9) / SPINE.long - rest[mid]) / span);
        show();
      }, 'defenseup', 'knob');
    drag(svg, el('circle', {cx : mx, cy : my, r : 5.5, class : 'aid-live-thing'}, live), p => {
      mouth.bearing = degrees(Math.atan2(p.y - cy, cx - 4 - p.x));
      show();
    }, 'defensemouth', 'knob');
    const [gx, gy] = jaw(1);
    drag(svg, el('circle', {cx : gx, cy : gy, r : 4.5, class : 'aid-live-thing'}, live), p => {
      mouth.gape = clamp(Math.abs((p.x - tx) * uy - (p.y - ty) * ux) / SPINE.body, ...SPINE.gape);
      show();
    }, 'defensegape', 'knob');
  }
  // Its life: in the egg raised spines harm the fish itself against the shell; outside they
  // guard.
  function drawLife(cell) {
    const {svg, under, live} = picture(life, LIFE.height, fixed => {
      const {egg, grown, y} = lifePlaces();
      eggShape(fixed, egg, y, 17, true);
      for (let n = 0; n < 5; n++) {
        const a = -2.4 + n * .45;
        el('path', {
          d : `M${egg + 11 * Math.cos(a)} ${y + 11 * Math.sin(a)} L${egg + 17 * Math.cos(a)} ${
              y + 17 * Math.sin(a)}`,
          class : 'aid-live-jaw',
          'stroke-width' : 1.8
        },
           fixed);
      }
      fishAbove(fixed, grown, y, .62);
      for (let n = 0; n < 5; n++)
        el('path', {
          d : `M${grown - 12 + n * 5} ${y - 7} l${- 1.5 + n * .6} -8`,
          class : 'aid-live-hair k0',
          'stroke-width' : 1.6
        },
           fixed);
    });
    lifeBand(svg, under, live, {studio, center : cell, name : 'defense', draft, settle});
  }
  function show() {
    const cell = organ()?.centers[0];
    if (!cell)
      return;
    drawSpines(cell);
    drawLife(cell);
  }
  return {root, show, tick() {}};
});
