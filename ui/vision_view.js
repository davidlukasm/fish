import {worldToScreen} from './camera.js';
import {ctx, rgb} from './dom.js';
import {EYE, EYE_VIEW, FISH, IMAGE_BAND, RGB, VISION} from './schema.js';
import {frameFish, frameBlend, blendFish, horizontalDelta} from './state.js';
import {fishBodyRadius} from './fish_fins.js';
export const vision_viewState = {};

const CHANNELS = Object.keys(RGB).length;
export const PIXEL =
    Object.freeze({...RGB, width : CHANNELS, distance : CHANNELS + 1, count : CHANNELS + 2});
const EYES = Object.keys(EYE).length;
const VISION_FAN = Object.freeze({
  colors : Object.freeze([ '#88d5e8', '#f1ce80' ]),
  detail : 6,
  fill : Object.freeze([ .025, .004 ]),
  line : Object.freeze([ .3, .15 ]),
  dash : Object.freeze([ 4, 4 ]),
  raster : .16,
  dot : .85,
  dot_radius : 2.5
});
export function retinalRaster(vision) {
  const I = IMAGE_BAND, count = VISION.pixels, step = 2 * Math.PI / count,
        raster = Array.from({length : EYES},
                            () => Array.from({length : count}, () => Array(PIXEL.count).fill(0)));
  for (const b of vision.bands || []) {
    if (b[I.eye] < 0 || b[I.eye] >= EYES || b[I.distance] <= 0)
      continue;
    const left = b[I.left] + vision.heading, right = b[I.right] + vision.heading;
    for (let k = Math.floor(left / step); k * step < right; ++k) {
      const width = Math.min(right, (k + 1) * step) - Math.max(left, k * step);
      if (width <= 0)
        continue;
      const pixel = raster[b[I.eye]][(k % count + count) % count];
      for (const c of Object.values(RGB))
        pixel[c] += b[I.red + c] * width;
      pixel[PIXEL.width] += width;
      pixel[PIXEL.distance] =
          pixel[PIXEL.distance] ? Math.min(pixel[PIXEL.distance], b[I.distance]) : b[I.distance];
    }
  }
  for (const eye of raster)
    for (const pixel of eye)
      if (pixel[PIXEL.width])
        for (const c of Object.values(RGB))
          pixel[c] /= pixel[PIXEL.width];
  return raster;
}
function mixPixel(a, b, t) {
  if (!a[PIXEL.width])
    return b;
  if (!b[PIXEL.width])
    return a;
  return a.map((v, k) => v + (b[k] - v) * t);
}
export function paintVision(f, c) {
  const vision = f.vision, raw = frameFish(f), p = raw && blendFish(raw);
  if (!p?.[FISH.hatched] || vision?.id !== f.selected || !vision.eyes?.some(Boolean))
    return;
  const state = vision_viewState;
  if (state.vision !== vision) {
    const target = retinalRaster(vision);
    state.before =
        state.epoch === f.render_epoch && state.vision?.id === vision.id && state.target
            ? state.target.map((eye, side) => eye.map(
                                   (v, k) => mixPixel(state.before[side][k], v, state.blend ?? 1)))
            : target;
    state.epoch = f.render_epoch;
    state.target = target;
    state.vision = vision;
  }
  const V = VISION_FAN, blend = frameBlend(), detail = fishBodyRadius(p) * c.scale >= V.detail,
        heading = p[FISH.angle] || 0, colors = V.colors, step = 2 * Math.PI / VISION.pixels,
        E = EYE_VIEW;
  state.blend = blend;
  ctx.save();
  for (let side = 0; side < EYES; ++side) {
    const eye = vision.eyes[side];
    if (!eye)
      continue;
    const dx = horizontalDelta(eye[E.x] - (vision.x ?? raw[FISH.x])),
          dy = eye[E.y] - (vision.y ?? raw[FISH.y]), rotation = heading - (vision.heading || 0),
          q = worldToScreen({
            x : p[FISH.x] + dx * Math.cos(rotation) - dy * Math.sin(rotation),
            y : p[FISH.y] + dx * Math.sin(rotation) + dy * Math.cos(rotation)
          },
                            c),
          radius = vision.range * c.scale, left = heading + eye[E.left],
          right = heading + eye[E.right], active = vision.enabled && eye[E.exposure] > 0;
    ctx.beginPath();
    ctx.moveTo(q.x, q.y);
    ctx.arc(q.x, q.y, radius, left, right);
    ctx.closePath();
    ctx.globalAlpha = V.fill[active ? 0 : 1];
    ctx.fillStyle = colors[side];
    ctx.fill();
    ctx.globalAlpha = V.line[active ? 0 : 1];
    ctx.lineWidth = 1;
    ctx.strokeStyle = colors[side];
    ctx.setLineDash(V.dash);
    ctx.stroke();
    ctx.setLineDash([]);
    if (detail && active) {
      ctx.save();
      ctx.clip();
      ctx.globalAlpha = V.raster * eye[E.exposure];
      for (let k = 0; k < VISION.pixels; ++k) {
        const b = mixPixel(state.before[side][k], state.target[side][k], blend);
        if (!b[PIXEL.width] || b[PIXEL.distance] <= 0)
          continue;
        const depth = Math.min(vision.range, b[PIXEL.distance]) * c.scale, a = k * step,
              z = (k + 1) * step;
        ctx.fillStyle = rgb(
            b.slice(PIXEL.red, PIXEL.blue + 1).map(v => Math.sqrt(Math.max(0, Math.min(1, v)))));
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x + depth * Math.cos(a), q.y + depth * Math.sin(a));
        ctx.lineTo(q.x + depth * Math.cos(z), q.y + depth * Math.sin(z));
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = V.dot;
    ctx.fillStyle = colors[side];
    ctx.beginPath();
    ctx.arc(q.x, q.y, V.dot_radius, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();
}
const initializers = {};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
