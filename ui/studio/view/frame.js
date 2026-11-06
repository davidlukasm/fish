import {clamp} from '../../units.js';
import {fixed} from './markup.js';
import {BODY_FRAME, BODY_KNOTS, BODY_MIDDLE, ZONE_X} from '../model/layout.js';
import {finVolumeOf, sideFinSize, tailFinSize} from '../../fish_organs.js';
import {FIN} from '../../schema.js';

// The drawing frame of the Atelier: the camera over the design and the abstract fish seen from
// above.
export const FISH_BOX = Object.freeze({x : 60, y : 60, width : 1000, height : 620});
// Far enough out to see where the eyes' fields end, about thirty body radii ahead.
// The view zooms from MIN to MAX, a STEP at a time.
export const CAMERA_ZOOM = Object.freeze({min : .04, max : 8, step : 1.35});
// The body runs smoothly through the frame's width knots (where the sites lie) with MARGIN to
// spare, its head rounded off to a snout NOSE before the first knot; behind the tail root a forked
// tail fin REACH long, SPREAD to each side, its fork FORK deep; two pectoral fins from AT, LENGTH
// along the body from INSET of its edge, standing OUT from it and swept back by SWEEP.
const OUTLINE = Object.freeze({
  margin : 1.08,
  nose : 34,
  tail : {reach : 92, spread : 92, fork : 38},
  fins : {at : 420, length : 95, out : 62, sweep : 70, inset : .9}
});
// Where the pectoral fins join the body: from AT, LENGTH along.
export const FIN_BASE = Object.freeze({at : OUTLINE.fins.at, length : OUTLINE.fins.length});
const f = value => Number(value).toFixed(1);
const xy = ([ x, y ]) => f(x) + ' ' + f(y);
// Cubic segments through points (Catmull-Rom), from the first to the last, each as its start,
// two handles and end.
function through(points) {
  const segments = [];
  for (let k = 0; k + 1 < points.length; ++k) {
    const p0 = points[Math.max(0, k - 1)], p1 = points[k], p2 = points[k + 1],
          p3 = points[Math.min(points.length - 1, k + 2)];
    segments.push([
      p1, [ p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6 ],
      [ p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6 ], p2
    ]);
  }
  return segments;
}
const cubics = segments =>
    segments.map(([, c1, c2, end ]) => ' C' + xy(c1) + ' ' + xy(c2) + ' ' + xy(end)).join('');
// The tip of the snout, where the outline's head ends.
export const SNOUT_TIP =
    Object.freeze({x : BODY_KNOTS[0][0] - OUTLINE.nose, y : BODY_FRAME.middle});
// A quarter ellipse is a cubic with its handles KAPPA of the radii long.
const KAPPA = .5523;
// The fins grow with their muscles as the Aquarium grows them, from the volume of the engine's
// fins (tail, left, right); the outline's fins are those of a fin of volume FIN_REFERENCE, and
// of that size while the engine has not answered.
const FIN_REFERENCE = 1;
export function finSizes(fins = null) {
  const ratio = (size, index, key) => {
    const fin = fins?.[index];
    const volume = fin ? finVolumeOf(fin.cells, fin.strength) : FIN_REFERENCE;
    return size(volume)[key] / size(FIN_REFERENCE)[key];
  };
  return {
    tail : {
      reach : ratio(tailFinSize, FIN.tail, 'length'),
      spread : ratio(tailFinSize, FIN.tail, 'width')
    },
    sides : [ FIN.left, FIN.right ].map(index => ({
                                          length : ratio(sideFinSize, index, 'length'),
                                          out : ratio(sideFinSize, index, 'spread')
                                        }))
  };
}
// The skin's sides through the knots and its head, which rounds off in two quarter ellipses from
// the first knot on each side to the snout. The head's handles at the knots continue the body's
// line there, so the outline has no kink.
function skinParts() {
  const {middle} = BODY_FRAME, O = OUTLINE, knots = BODY_KNOTS.slice(1);
  const nose = [ BODY_KNOTS[0][0] - O.nose, middle ];
  const upper = knots.map(([ x, h ]) => [x, middle - h * O.margin]);
  const lower = [...knots ].reverse().map(([ x, h ]) => [x, middle + h * O.margin]);
  const [front, back] = [ upper[0], lower.at(-1) ], handle = KAPPA * (front[0] - nose[0]);
  const along = (from, to) => {
    const dx = to[0] - from[0], dy = to[1] - from[1], length = Math.hypot(dx, dy);
    return [ from[0] - dx / length * handle, from[1] - dy / length * handle ];
  };
  const head = [
    [ back, along(back, lower.at(-2)), [ nose[0], middle + KAPPA * (back[1] - middle) ], nose ],
    [ nose, [ nose[0], middle - KAPPA * (middle - front[1]) ], along(front, upper[1]), front ]
  ];
  return {upper, lower, sides : [ through(lower), through(upper) ], head};
}
const SKIN = skinParts();
// The outline with its tail fin, or closed straight across the tail root without it, or (open)
// the skin alone from the tail root round the head back to it.
export function fishPath(sizes = finSizes(), withTail = true, open = false) {
  const {middle} = BODY_FRAME, O = OUTLINE, {upper, lower, sides, head} = SKIN,
        root = BODY_KNOTS.at(-1);
  const reach = O.tail.reach * sizes.tail.reach, spread = O.tail.spread * sizes.tail.spread;
  const tail = withTail ? [
    [ root[0] + reach, middle - spread ],
    [ root[0] + reach - O.tail.fork * sizes.tail.reach, middle ],
    [ root[0] + reach, middle + spread ], lower[0]
  ]
                       : [ lower[0] ];
  if (open)
    return 'M' + xy(lower[0]) + cubics(sides[0]) + cubics(head) + cubics(sides[1]);
  return 'M' + xy(upper[0]) + cubics(sides[1]) + ' L' + tail.map(xy).join(' L') + cubics(sides[0]) +
         cubics(head) + ' Z';
}
// The skin as a line of points SKIN_LINE.steps to a cubic, from the tail root on side +1 round
// the snout to the tail root on side -1.
const SKIN_LINE = Object.freeze({steps : 24});
// The weights of a cubic Bezier curve's four points at u along it.
export const cubicWeights = u => {
  const v = 1 - u;
  return [ v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u ];
};
const cubicAt = (points, u) => {
  const w = cubicWeights(u);
  return [ 0, 1 ].map(i => points.reduce((sum, p, k) => sum + w[k] * p[i], 0));
};
const SKIN_POINTS = [...SKIN.sides[0], ...SKIN.head, ...SKIN.sides[1] ].flatMap(
    (segment, k) => Array.from({length : SKIN_LINE.steps + (k ? 0 : 1)},
                               (_, i) => cubicAt(segment, (i + (k ? 1 : 0)) / SKIN_LINE.steps)));
// The skin's half width along the frame, from the snout to the tail root, as the outline runs.
const SKIN_WIDTH = SKIN_POINTS.filter(([, y ]) => y >= BODY_FRAME.middle)
                       .map(([ x, y ]) => [x, y - BODY_FRAME.middle])
                       .sort((a, b) => a[0] - b[0]);
// The tail fin alone, from the tail root, and the point it swings about.
export function tailFin(sizes = finSizes()) {
  const {middle} = BODY_FRAME, O = OUTLINE, root = BODY_KNOTS.at(-1);
  const top = [ root[0], middle - root[1] * O.margin ],
        bottom = [ root[0], middle + root[1] * O.margin ];
  const reach = O.tail.reach * sizes.tail.reach, spread = O.tail.spread * sizes.tail.spread;
  const points = [
    top, [ root[0] + reach, middle - spread ],
    [ root[0] + reach - O.tail.fork * sizes.tail.reach, middle ],
    [ root[0] + reach, middle + spread ], bottom
  ];
  return {d : 'M' + points.map(xy).join(' L') + 'Z', root : {x : root[0], y : middle}};
}
// Where each pectoral fin joins the body, the point it beats about.
// The way a direction around the body points on the frame, as the engine counts it: 0 ahead,
// positive towards side +1.
export const bodyDirection = angle => ({x : -Math.cos(angle), y : Math.sin(angle)});
// A field drawn around a small fish centred at (field.cx, field.cy): the point at an angle around
// the body and a distance out, and the fish itself at `scale` of the frame.
export const fieldPoint = (field, angle, r) => {
  const d = bodyDirection(angle);
  return {x : field.cx + d.x * r, y : field.cy + d.y * r};
};
export const fieldFish = (field, scale, cls) =>
    '<path class="' + cls + '" d="' + fishPath() + '" transform="translate(' +
    fixed(field.cx - BODY_MIDDLE.x * scale) + ' ' + fixed(field.cy - BODY_MIDDLE.y * scale) +
    ') scale(' + scale + ')"/>';
// Where a pectoral fin's base runs at x on a side: just inside the skin.
const finBase = (x, side) =>
    BODY_FRAME.middle + (skinAt(x, side) - BODY_FRAME.middle) * OUTLINE.fins.inset;
export const finRoots =
    () => [-1, 1].map(side => ({x : OUTLINE.fins.at, y : finBase(OUTLINE.fins.at, side)}));
// Where the skin lies at x on a side (-1 or 1), on the drawn outline.
export function skinAt(x, side) {
  const W = SKIN_WIDTH;
  let k = 1;
  while (k < W.length - 1 && W[k][0] < x)
    ++k;
  const [a, b] = [ W[k - 1], W[k] ];
  const share = clamp(b[0] > a[0] ? (x - a[0]) / (b[0] - a[0]) : 0);
  return BODY_FRAME.middle + side * (a[1] + (b[1] - a[1]) * share);
}
// The engine lays its cells out in a body 2 long (from 1 at the snout to -1) and 1 wide, each
// zone as long as its cells weigh (`zones`, [front, extent] each, as the design view gives them;
// even without it); the frame draws each zone over ZONE_X. A point of the skin lies for the
// engine as far along as its zone puts it and at the body's side, nearer the middle where the
// drawn body narrows below its width where the first zone begins (towards the snout and the tail
// root); its direction from the body's centre is the engine's (0 ahead, positive towards side
// +1), in which the engine's spines and touch cells face.
const EVEN_ZONES = ZONE_X.map((_, z) => [1 - 2 * z / ZONE_X.length, 2 / ZONE_X.length]);
const SKIN_NARROW = skinAt(ZONE_X[0][0], 1) - BODY_FRAME.middle;
export function skinDirection(point, zones = null) {
  const spans = zones?.length === ZONE_X.length ? zones : EVEN_ZONES;
  const found = ZONE_X.findIndex(([, end ]) => point.x <= end),
        zone = found < 0 ? ZONE_X.length - 1 : found;
  const [start, end] = ZONE_X[zone], [ front, extent ] = spans[zone];
  const u = clamp((end - point.x) / (end - start));
  const off = point.y - BODY_FRAME.middle;
  return Math.atan2(Math.sign(off) * Math.min(1, Math.abs(off) / SKIN_NARROW) / 2,
                    front - extent * (1 - u));
}
// Points STEP apart along the skin from the tail root on side +1 round the snout to the tail
// root on side -1, each with the way out of the body there.
export function skinPoints(step) {
  const points = [];
  let carried = step / 2;
  for (let k = 1; k < SKIN_POINTS.length; ++k) {
    const [a, b] = [ SKIN_POINTS[k - 1], SKIN_POINTS[k] ];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length <= 0)
      continue;
    // Along this way round, the way out lies to the right of the way ahead.
    const out = {x : (b[1] - a[1]) / length, y : -(b[0] - a[0]) / length};
    for (; carried <= length; carried += step) {
      const u = carried / length;
      points.push({x : a[0] + (b[0] - a[0]) * u, y : a[1] + (b[1] - a[1]) * u, out});
    }
    carried -= length;
  }
  return points;
}
// The pectoral fins, one on each side (the engine's left fin on side -1), swept back and
// standing out as far as their sizes say.
export function finPaths(sizes = finSizes()) {
  const F = OUTLINE.fins;
  return [ -1, 1 ].map((side, k) => {
    const sweep = F.sweep * sizes.sides[k].length, out = F.out * sizes.sides[k].out;
    const base = finBase(F.at, side), end = finBase(F.at + F.length, side);
    const tip = [ F.at + F.length / 2 + sweep, base + side * out ];
    return 'M' + f(F.at) + ' ' + f(base) + ' Q' + f(F.at + sweep / 2) + ' ' + f(base + side * out) +
           ' ' + f(tip[0]) + ' ' + f(tip[1]) + ' Q' + f(F.at + F.length) + ' ' +
           f(end + side * out / 2) + ' ' + f(F.at + F.length) + ' ' + f(end) + ' Z';
  });
}
// Where the camera looks at first and after fitting: a little left of the box's middle, so the
// snout clears the tool bar floating over the canvas' left edge.
export const CAMERA_HOME = Object.freeze({x : 520, y : 365});
export function cameraBox(camera) {
  const zoom = Math.max(CAMERA_ZOOM.min, Math.min(CAMERA_ZOOM.max, camera.zoom ?? 1));
  const width = FISH_BOX.width / zoom, height = FISH_BOX.height / zoom;
  const x = (camera.x ?? CAMERA_HOME.x) - width / 2, y = (camera.y ?? CAMERA_HOME.y) - height / 2;
  return {x, y, width, height, zoom};
}
// A mark that keeps its size on screen at any zoom: it stands at a point, scaled against the
// zoom, and zooming rescales every mark so marked (STEADY) in place.
export const STEADY = 'data-steady';
export const steadyScale = (zoom = 1) => 'scale(' + fixed(1 / zoom) + ')';
export const steadyAt = (p, zoom) => ' ' + STEADY + ' transform="translate(' + fixed(p.x) + ' ' +
                                     fixed(p.y) + ') ' + steadyScale(zoom) + '"';
// The camera's view as an SVG viewBox.
export function viewBoxOf(camera) {
  const box = cameraBox(camera);
  return [ box.x, box.y, box.width, box.height ].map(fixed).join(' ');
}
// Pixels per world unit in the SVG's *actual* letterboxed viewport.
export function cameraScale(rect, camera) {
  const box = cameraBox(camera);
  return Math.min(rect.width / box.width, rect.height / box.height);
}
export function cameraCoordinates(event, svg, camera) {
  const matrix = svg.getScreenCTM?.();
  if (matrix && svg.createSVGPoint) {
    const pointer = svg.createSVGPoint();
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    const position = pointer.matrixTransform(matrix.inverse());
    return {x : position.x, y : position.y};
  }
  const rect = svg.getBoundingClientRect(), box = cameraBox(camera);
  const scale = cameraScale(rect, camera);
  const left = rect.left + (rect.width - box.width * scale) / 2;
  const top = rect.top + (rect.height - box.height * scale) / 2;
  return {x : box.x + (event.clientX - left) / scale, y : box.y + (event.clientY - top) / scale};
}
