import {worldToScreen} from './camera.js';
import {ctx, rgb} from './dom.js';
import {FISH} from './schema.js';
import {frameFish, frameBlend, blendFish, horizontalDelta} from './state.js';
import {fishBodyRadius} from './fish_fins.js';
export const vision_viewState = {};

function retinalRaster(vision) {
  const count = 128, step = 2 * Math.PI / count,
        raster =
            Array.from({length : 2}, () => Array.from({length : count}, () => [0, 0, 0, 0, 0]));
  for (const b of vision.bands || []) {
    if (b[5] < 0 || b[5] > 1 || b[6] <= 0)
      continue;
    const left = b[0] + vision.heading, right = b[1] + vision.heading;
    for (let k = Math.floor(left / step); k * step < right; ++k) {
      const width = Math.min(right, (k + 1) * step) - Math.max(left, k * step);
      if (width <= 0)
        continue;
      const pixel = raster[b[5]][(k % count + count) % count];
      for (let c = 0; c < 3; ++c)
        pixel[c] += b[c + 2] * width;
      pixel[3] += width;
      pixel[4] = pixel[4] ? Math.min(pixel[4], b[6]) : b[6];
    }
  }
  for (const eye of raster)
    for (const pixel of eye)
      if (pixel[3])
        for (let c = 0; c < 3; ++c)
          pixel[c] /= pixel[3];
  return raster;
}
function mixPixel(a, b, t) {
  if (!a[3])
    return b;
  if (!b[3])
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
  const blend = frameBlend(), detail = fishBodyRadius(p) * c.scale >= 6,
        heading = p[FISH.angle] || 0, colors = [ '#88d5e8', '#f1ce80' ], step = 2 * Math.PI / 128;
  state.blend = blend;
  ctx.save();
  for (let side = 0; side < 2; ++side) {
    const eye = vision.eyes[side];
    if (!eye)
      continue;
    const dx = horizontalDelta(eye[0] - (vision.x ?? raw[FISH.x])),
          dy = eye[1] - (vision.y ?? raw[FISH.y]), rotation = heading - (vision.heading || 0),
          q = worldToScreen({
            x : p[FISH.x] + dx * Math.cos(rotation) - dy * Math.sin(rotation),
            y : p[FISH.y] + dx * Math.sin(rotation) + dy * Math.cos(rotation)
          },
                            c),
          radius = vision.range * c.scale, left = heading + eye[3], right = heading + eye[4],
          active = vision.enabled && eye[2] > 0;
    ctx.beginPath();
    ctx.moveTo(q.x, q.y);
    ctx.arc(q.x, q.y, radius, left, right);
    ctx.closePath();
    ctx.globalAlpha = active ? .025 : .004;
    ctx.fillStyle = colors[side];
    ctx.fill();
    ctx.globalAlpha = active ? .30 : .15;
    ctx.lineWidth = 1;
    ctx.strokeStyle = colors[side];
    ctx.setLineDash([ 4, 4 ]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (detail && active) {
      ctx.save();
      ctx.clip();
      ctx.globalAlpha = .16 * eye[2];
      for (let k = 0; k < 128; ++k) {
        const b = mixPixel(state.before[side][k], state.target[side][k], blend);
        if (!b[3] || b[4] <= 0)
          continue;
        const depth = Math.min(vision.range, b[4]) * c.scale, a = k * step, z = (k + 1) * step;
        ctx.fillStyle = rgb(b.slice(0, 3).map(v => Math.sqrt(Math.max(0, Math.min(1, v)))));
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x + depth * Math.cos(a), q.y + depth * Math.sin(a));
        ctx.lineTo(q.x + depth * Math.cos(z), q.y + depth * Math.sin(z));
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = .85;
    ctx.fillStyle = colors[side];
    ctx.beginPath();
    ctx.arc(q.x, q.y, 2.5, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();
}
const initializers = {};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
