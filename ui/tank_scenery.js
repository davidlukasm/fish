import {cameraState} from './camera.js';
import {ctx, el} from './dom.js';
import {evolutionState} from './evolution.js';
import {TankLayer, TankPixelImage, touchTankImage} from './renderer.js';
import {horizontalShifts} from './state.js';
import {PLANT} from './schema.js';
import {grassRootPose} from './vegetation.js';
import {plantRenderParts, plantDepth, bedLayer, bedColor} from './plant_geometry.js';
import {paintWaterLight, displayLight} from './water_view.js';
export const tank_sceneryState = {};
export let scenery;

export let sceneryPadding;

export function paintScenery(f, c) {
  scenery.getContext().reset();
  touchTankImage(scenery);
  const g = scenery.getContext('2d');
  g.setTransform(cameraState.pixelRatio, 0, 0, cameraState.pixelRatio, 0, 0);
  g.globalAlpha = 1;
  g.fillStyle = '#091d25';
  g.fillRect(0, 0, scenery.width / cameraState.pixelRatio, scenery.height / cameraState.pixelRatio);
  for (const shift of horizontalShifts(f, c))
    paintSceneryTile(f, {...c, ox : c.ox + shift * c.scale});
}

export function paintSceneryTile(f, c) {
  const ctx = scenery.getContext('2d'), x = v => v * c.scale + c.ox, y = v => v * c.scale + c.oy,
        width = scenery.width / cameraState.pixelRatio,
        height = scenery.height / cameraState.pixelRatio;
  ctx.setTransform(cameraState.pixelRatio, 0, 0, cameraState.pixelRatio, 0, 0);
  ctx.globalAlpha = 1;
  const waterColor = ctx.createLinearGradient(0, y(0), 0, y(f.height));
  waterColor.addColorStop(0, '#205462');
  waterColor.addColorStop(.55, '#1a4554');
  waterColor.addColorStop(1, '#163b4d');
  ctx.fillStyle = waterColor;
  ctx.fillRect(x(0), y(0), f.width * c.scale, f.height * c.scale);
  paintWaterLight(f.light?.clear_values
                      ? {...f, daylight : 1, light : {...f.light, values : f.light.clear_values}}
                      : f,
                  c, ctx);
  ctx.strokeStyle = '#688995';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x(0), y(0));
  ctx.lineTo(x(f.width), y(0));
  ctx.moveTo(x(0), y(f.height));
  ctx.lineTo(x(f.width), y(f.height));
  ctx.stroke();
  ctx.fillStyle = '#4e5550';
  ctx.fillRect(x(0), y(f.height - 5), f.width * c.scale, 5 * c.scale);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x(0), y(0), f.width * c.scale, f.height * c.scale);
  ctx.clip();
  for (let i = 0; i < (f.obstacles || []).length; i++) {
    const [px, py, r] = f.obstacles[i], shape = f.shapes?.[i];
    for (const shift of [-f.width, 0, f.width]) {
      const pts = shape?.length
                      ? shape
                      : Array.from({length : 16}, (_, j) => [px + Math.cos(j * Math.PI / 8) * r,
                                                             py + Math.sin(j * Math.PI / 8) * r]),
            left = Math.min(...pts.map(p => p[0])) + shift,
            right = Math.max(...pts.map(p => p[0])) + shift, top = Math.min(...pts.map(p => p[1])),
            bottom = Math.max(...pts.map(p => p[1]));
      if (x(right) < 0 || x(left) > width || y(bottom) < 0 || y(top) > height)
        continue;
      ctx.save();
      ctx.beginPath();
      pts.forEach(([ a, b ], j) =>
                      j ? ctx.lineTo(x(a + shift), y(b)) : ctx.moveTo(x(a + shift), y(b)));
      ctx.closePath();
      const stone = ctx.createLinearGradient(x(left), y(top), x(right), y(bottom));
      stone.addColorStop(0, '#5a6a64');
      stone.addColorStop(.55, '#3c504f');
      stone.addColorStop(1, '#263a3e');
      ctx.fillStyle = stone;
      ctx.fill();
      ctx.clip();
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k], b = pts[(k + 1) % pts.length], cx = (left + right) / 2,
              cy = top + (bottom - top) * (.38 + .08 * Math.sin(i * 3.7));
        ctx.fillStyle = k % 3 === 0 ? '#b8bda112' : k % 3 === 1 ? '#101f2818' : '#9caf9c08';
        ctx.beginPath();
        ctx.moveTo(x(cx), y(cy));
        ctx.lineTo(x(a[0] + shift), y(a[1]));
        ctx.lineTo(x(b[0] + shift), y(b[1]));
        ctx.closePath();
        ctx.fill();
      }
      if (c.scale > .6)
        for (let k = 0;
             k <
             Math.min(180, Math.ceil((right - left) * (bottom - top) * c.scale * c.scale / 900));
             k++) {
          const u = (Math.sin(k * 127.1 + i * 33.7) * 43758.5453) % 1,
                v = (Math.sin(k * 269.5 + i * 19.3) * 43758.5453) % 1,
                cx = left + Math.abs(u) * (right - left), cy = top + Math.abs(v) * (bottom - top),
                size = .25 + .6 * Math.abs(Math.sin(k * 2.3));
          ctx.fillStyle = k % 2 ? '#abb5a522' : '#112a3025';
          ctx.beginPath();
          ctx.ellipse(x(cx), y(cy), size * c.scale * 2, size * c.scale, .4, 0, Math.PI * 2);
          ctx.fill();
        }
      ctx.restore();
    }
  }
  ctx.restore();
}

export function paintBedOpenings(f, c, blend, layer = null, only = null) {
  if (c.scale < .7)
    return;
  let count = 0;
  for (const p of only ? [ only ] : f.plants || []) {
    if (!p[PLANT.stump] || p[PLANT.root]?.[2] || count >= 180 ||
        layer !== null && bedLayer(plantDepth(p)) !== layer)
      continue;
    const roots = plantRenderParts(p).filter(o => o.parent < 0),
          anchors = roots.map(root => grassRootPose(p[PLANT.id], root.stem, f)).filter(Boolean);
    if (!anchors.length)
      continue;
    const px = anchors.reduce((sum, a) => sum + a[0], 0) / anchors.length,
          py = anchors.reduce((sum, a) => sum + a[1], 0) / anchors.length, sx = px * c.scale + c.ox,
          sy = py * c.scale + c.oy;
    ++count;
    const rootWidth = roots.reduce((sum, o) => sum + o.width, 0) / roots.length,
          spread = Math.max(
              5, (Math.max(...anchors.map(a => a[0])) - Math.min(...anchors.map(a => a[0]))) / 2 +
                     1.4 * rootWidth),
          rise = Math.min(spread * .40, 1.8 + rootWidth * .8),
          along = Math.max(0, Math.min(1, ((px - p[PLANT.ax]) * (p[PLANT.bx] - p[PLANT.ax]) +
                                           (py - p[PLANT.ay]) * (p[PLANT.by] - p[PLANT.ay])) /
                                              Math.max(1, (p[PLANT.bx] - p[PLANT.ax]) ** 2 +
                                                              (p[PLANT.by] - p[PLANT.ay]) ** 2))),
          leftDepth = p[PLANT.sediment_left] || 0, rightDepth = p[PLANT.sediment_right] || 0,
          leftLight = displayLight(f, p[PLANT.ax] + p[PLANT.nx] * leftDepth,
                                   p[PLANT.ay] + p[PLANT.ny] * leftDepth),
          rightLight = displayLight(f, p[PLANT.bx] + p[PLANT.nx] * rightDepth,
                                    p[PLANT.by] + p[PLANT.ny] * rightDepth),
          soilColor = at => {
            at = Math.max(0, Math.min(1, at));
            const light = leftLight * (1 - at) + rightLight * at;
            return 'rgb(' + bedColor(f, p, at).map(v => Math.round(v * light * 255)).join(',') +
                   ')';
          };
    if (sx + spread * c.scale < 0 || sx - spread * c.scale > cameraState.viewportWidth ||
        sy + 2 * c.scale < 0 || sy - rise * c.scale > cameraState.viewportHeight)
      continue;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(Math.atan2(p[5], -p[6]));
    const soil = ctx.createLinearGradient(-spread * c.scale, 0, spread * c.scale, 0);
    for (let i = 0; i <= 4; ++i)
      soil.addColorStop(i / 4,
                        soilColor(along + (i / 2 - 1) * spread / Math.max(1, p[PLANT.length])));
    ctx.fillStyle = soil;
    ctx.strokeStyle = soil;
    ctx.lineWidth = Math.max(.45, c.scale * .12);
    ctx.beginPath();
    ctx.moveTo(-spread * c.scale, .6 * c.scale);
    ctx.bezierCurveTo(-spread * .65 * c.scale, -rise * c.scale, spread * .4 * c.scale,
                      -rise * c.scale, spread * c.scale, .6 * c.scale);
    ctx.quadraticCurveTo(0, 1.3 * c.scale, -spread * c.scale, .6 * c.scale);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.clip();
    const shade = ctx.createLinearGradient(0, -rise * c.scale, 0, 1.3 * c.scale);
    shade.addColorStop(0, '#efe0b922');
    shade.addColorStop(.65, '#00000000');
    shade.addColorStop(1, '#32271b35');
    ctx.fillStyle = shade;
    ctx.fillRect(-spread * c.scale, -rise * c.scale, 2 * spread * c.scale, (rise + 1.3) * c.scale);
    if (!tank_sceneryState.soilGrain) {
      const image = new TankPixelImage();
      image.width = 128;
      image.height = 64;
      const g = image.getContext('2d'), pixels = g.createImageData(128, 64);
      for (let k = 0; k < 128 * 64; k++) {
        const bright = ((k * 73) % 137) > 68, at = k * 4;
        pixels.data[at] = bright ? 230 : 50;
        pixels.data[at + 1] = bright ? 218 : 44;
        pixels.data[at + 2] = bright ? 181 : 30;
        pixels.data[at + 3] = bright ? 17 : 21;
      }
      g.putImageData(pixels, 0, 0);
      tank_sceneryState.soilGrain = image;
    }
    const tile = 12 * c.scale;
    if (c.scale > 1)
      for (let x = -spread * c.scale; x < spread * c.scale; x += tile)
        for (let y = -rise * c.scale; y < 1.3 * c.scale; y += tile / 2)
          ctx.drawImage(tank_sceneryState.soilGrain, x, y, tile, tile / 2);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(-spread * c.scale, .6 * c.scale);
    ctx.bezierCurveTo(-spread * .65 * c.scale, -rise * c.scale, spread * .4 * c.scale,
                      -rise * c.scale, spread * c.scale, .6 * c.scale);
    ctx.stroke();
    ctx.restore();
  }
}

export function paintSourceMarkers(f, c) {
  const x = v => v * c.scale + c.ox, y = v => v * c.scale + c.oy;
  ctx.save();
  for (const [px, py] of (
           evolutionState.editing || el('show-food-sources').checked ? f.sources || [] : [])) {
    const radius = Math.max(3, (f.parameters.food_spread || 1) * c.scale);
    if (x(px) + radius < 0 || x(px) - radius > cameraState.viewportWidth || y(py) + radius < 0 ||
        y(py) - radius > cameraState.viewportHeight)
      continue;
    ctx.strokeStyle = '#d9b19066';
    ctx.setLineDash([ 2, 4 ]);
    ctx.beginPath();
    ctx.arc(x(px), y(py), radius, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const [px, py, r] of (
           evolutionState.editing || el('show-food-sources').checked ? f.feeders || [] : [])) {
    ctx.strokeStyle = '#dfa686';
    ctx.setLineDash([ 4, 4 ]);
    ctx.beginPath();
    ctx.arc(x(px), y(py), Math.max(5, r * c.scale), 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([])
  }
  if (evolutionState.editing || el('show-plankton-sources').checked)
    for (const [px, py] of f.plankton_sources || []) {
      const radius = Math.max(12, 72 * c.scale);
      if (x(px) + radius < 0 || x(px) - radius > cameraState.viewportWidth || y(py) + radius < 0 ||
          y(py) - radius > cameraState.viewportHeight)
        continue;
      ctx.strokeStyle = '#b5c993b0';
      ctx.setLineDash([ 2, 5 ]);
      ctx.beginPath();
      ctx.ellipse(x(px), y(py), radius, radius * .7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#d2deb0';
      for (let k = 0; k < 3; ++k) {
        ctx.beginPath();
        ctx.ellipse(x(px) + (k - 1) * 5, y(py) + (k % 2) * 3, 1.5, 2.6, -.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  for (const [px, py, angle, width] of (
           evolutionState.editing || el('show-current-sources').checked ? f.currents || [] : [])) {
    ctx.save();
    ctx.translate(x(px), y(py));
    ctx.rotate(angle);
    ctx.strokeStyle = '#80c6db';
    ctx.lineWidth = 2;
    const length = Math.max(16, 24 * c.scale);
    ctx.beginPath();
    ctx.moveTo(-length * .5, 0);
    ctx.lineTo(length, 0);
    ctx.lineTo(length - 6, -5);
    ctx.moveTo(length, 0);
    ctx.lineTo(length - 6, 5);
    ctx.stroke();
    ctx.setLineDash([ 3, 5 ]);
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(5, width * .5 * c.scale), 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

export function updateTankSceneryState(patch) {
  Object.assign(tank_sceneryState, patch);
  return Object.values(patch)[0];
}

const initializers = {
  "scenery" : () => { scenery = new TankLayer(); },
  "sceneryPadding" : () => { sceneryPadding = 160; },
  "sceneryKey" : () => { tank_sceneryState.sceneryKey = ''; },
  "sceneryCamera" : () => { tank_sceneryState.sceneryCamera = null; },
  "sceneRevision" : () => { tank_sceneryState.sceneRevision = -1; },
  "sceneSignature" : () => { tank_sceneryState.sceneSignature = ''; }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
