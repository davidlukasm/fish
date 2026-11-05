import {BODY_FRAME, BODY_KNOTS, halfWidth} from '../model/layout.js';

// The drawing frame of the Atelier: the camera over the design and the abstract fish seen from
// above.
export const FISH_BOX = Object.freeze({x : 60, y : 60, width : 1000, height : 620});
// Far enough out to see where the eyes' fields end, about thirty body radii ahead.
export const CAMERA_ZOOM = Object.freeze({min : .04, max : 8});
// The body runs smoothly through the frame's width knots (where the sites lie) with MARGIN to
// spare, its head rounded off to a snout NOSE before the first knot; behind the tail root a forked
// tail fin REACH long, SPREAD to each side, its fork FORK deep; two pectoral fins from AT, LENGTH
// along the body from INSET of its edge, standing OUT from it and swept back by SWEEP.
const OUTLINE = Object.freeze({
  margin : 1.08,
  nose : 34,
  tail : {reach : 92, spread : 92, fork : 38},
  fins : {at : 345, length : 95, out : 62, sweep : 70, inset : .9}
});
const f = value => Number(value).toFixed(1);
const xy = ([ x, y ]) => f(x) + ' ' + f(y);
// Cubic segments through points (Catmull-Rom), from the first to the last.
function through(points) {
  let d = '';
  for (let k = 0; k + 1 < points.length; ++k) {
    const p0 = points[Math.max(0, k - 1)], p1 = points[k], p2 = points[k + 1],
          p3 = points[Math.min(points.length - 1, k + 2)];
    const c1 = [ p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6 ],
          c2 = [ p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6 ];
    d += ' C' + xy(c1) + ' ' + xy(c2) + ' ' + xy(p2);
  }
  return d;
}
// The tip of the snout, where the outline's head ends.
export const SNOUT_TIP =
    Object.freeze({x : BODY_KNOTS[0][0] - OUTLINE.nose, y : BODY_FRAME.middle});
// A quarter ellipse is a cubic with its handles KAPPA of the radii long.
const KAPPA = .5523;
export function fishPath() {
  const {middle} = BODY_FRAME, O = OUTLINE, knots = BODY_KNOTS.slice(1);
  const nose = [ BODY_KNOTS[0][0] - O.nose, middle ], root = knots.at(-1);
  const upper = knots.map(([ x, h ]) => [x, middle - h * O.margin]);
  const lower = [...knots ].reverse().map(([ x, h ]) => [x, middle + h * O.margin]);
  const tail = [
    [ root[0] + O.tail.reach, middle - O.tail.spread ],
    [ root[0] + O.tail.reach - O.tail.fork, middle ],
    [ root[0] + O.tail.reach, middle + O.tail.spread ], lower[0]
  ];
  // The head rounds off in two quarter ellipses from the first knot on each side to the snout.
  // Its handles at the knots continue the body's line there, so the outline has no kink.
  const [front, back] = [ upper[0], lower.at(-1) ], reach = KAPPA * (front[0] - nose[0]);
  const along = (from, to) => {
    const dx = to[0] - from[0], dy = to[1] - from[1], length = Math.hypot(dx, dy);
    return [ from[0] - dx / length * reach, from[1] - dy / length * reach ];
  };
  const head = ' C' + xy(along(back, lower.at(-2))) + ' ' +
               xy([ nose[0], middle + KAPPA * (back[1] - middle) ]) + ' ' + xy(nose) + ' C' +
               xy([ nose[0], middle - KAPPA * (middle - front[1]) ]) + ' ' +
               xy(along(front, upper[1])) + ' ' + xy(front);
  return 'M' + xy(front) + through(upper) + ' L' + tail.map(xy).join(' L') + through(lower) + head +
         ' Z';
}
// The pectoral fins, one on each side.
export function finPaths() {
  const {middle} = BODY_FRAME, F = OUTLINE.fins;
  return [ -1, 1 ].map(side => {
    const base = middle + side * halfWidth(F.at) * OUTLINE.margin * F.inset,
          end = middle + side * halfWidth(F.at + F.length) * OUTLINE.margin * F.inset;
    const tip = [ F.at + F.length / 2 + F.sweep, base + side * F.out ];
    return 'M' + f(F.at) + ' ' + f(base) + ' Q' + f(F.at + F.sweep / 2) + ' ' +
           f(base + side * F.out) + ' ' + f(tip[0]) + ' ' + f(tip[1]) + ' Q' + f(F.at + F.length) +
           ' ' + f(end + side * F.out / 2) + ' ' + f(F.at + F.length) + ' ' + f(end) + ' Z';
  });
}
export function cameraBox(camera) {
  const zoom = Math.max(CAMERA_ZOOM.min, Math.min(CAMERA_ZOOM.max, camera.zoom ?? 1));
  const width = FISH_BOX.width / zoom, height = FISH_BOX.height / zoom;
  const x = (camera.x ?? 560) - width / 2, y = (camera.y ?? 365) - height / 2;
  return {x, y, width, height, zoom};
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
