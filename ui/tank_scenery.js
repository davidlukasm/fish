import {PALETTE} from './palette.js';
import {PIXEL_BYTES, sineHash} from './units.js';
import {cameraState, horizontalShifts, ZOOM} from './camera.js';
import {ctx, el, rgb} from './dom.js';
import {evolutionState} from './evolution.js';
import {TankLayer, TankPixelImage, touchTankImage} from './renderer.js';
import {CURRENT, FEEDER, PLANKTON_SOURCE, PLANT, PLANT_ROOT} from './schema.js';
import {grassRootPose} from './vegetation.js';
import {plantRenderParts, plantDepth, bedLayer, bedColor} from './plant_geometry.js';
import {paintWaterLight, displayLight} from './water_view.js';
export const tank_sceneryState = {};
export let scenery;

export const SCENERY_PADDING = 160;

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

const STONE = Object.freeze({
  corners : 16,
  water_mid : .55,
  floor : 5,
  stone_mid : .55,
  facet_y : .38,
  facet_spread : .08,
  facet_hash : 3.7,
  grain_scale : .6,
  max_grains : 180,
  grain_area : 900,
  grain : .25,
  grain_spread : .6,
  grain_hash : 2.3,
  grain_place : Object.freeze({u_grain : 127.1, u_stone : 33.7, v_grain : 269.5, v_stone : 19.3}),
  grain_aspect : 2,
  grain_tilt : .4,
  water_top : '#4e4e4e',
  water : '#404040',
  water_bottom : '#373737',
  rim : '#688995',
  floor_color : '#4e5550',
  stone_light : '#5a6a64',
  stone : '#3c504f',
  stone_dark : '#263a3e',
  facet_light : '#b8bda112',
  facet_dark : '#101f2818',
  facet_faint : '#9caf9c08',
  grain_light : '#abb5a522',
  grain_dark : '#112a3025'
});
export function paintSceneryTile(f, c) {
  const ctx = scenery.getContext('2d'), x = v => v * c.scale + c.ox, y = v => v * c.scale + c.oy,
        width = scenery.width / cameraState.pixelRatio,
        height = scenery.height / cameraState.pixelRatio;
  ctx.setTransform(cameraState.pixelRatio, 0, 0, cameraState.pixelRatio, 0, 0);
  ctx.globalAlpha = 1;
  const waterColor = ctx.createLinearGradient(0, y(0), 0, y(f.height));
  waterColor.addColorStop(0, STONE.water_top);
  waterColor.addColorStop(STONE.water_mid, STONE.water);
  waterColor.addColorStop(1, STONE.water_bottom);
  ctx.fillStyle = waterColor;
  ctx.fillRect(x(0), y(0), f.width * c.scale, f.height * c.scale);
  paintWaterLight(f.light?.clear_values
                      ? {...f, daylight : 1, light : {...f.light, values : f.light.clear_values}}
                      : f,
                  c, ctx);
  ctx.strokeStyle = STONE.rim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x(0), y(0));
  ctx.lineTo(x(f.width), y(0));
  ctx.moveTo(x(0), y(f.height));
  ctx.lineTo(x(f.width), y(f.height));
  ctx.stroke();
  ctx.fillStyle = STONE.floor_color;
  ctx.fillRect(x(0), y(f.height - STONE.floor), f.width * c.scale, STONE.floor * c.scale);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x(0), y(0), f.width * c.scale, f.height * c.scale);
  ctx.clip();
  for (let i = 0; i < (f.obstacles || []).length; i++) {
    const [px, py, r] = f.obstacles[i], shape = f.shapes?.[i];
    for (const shift of [-f.width, 0, f.width]) {
      const pts = shape?.length
                      ? shape
                      : Array.from({length : STONE.corners},
                                   (_, j) => [px + Math.cos(2 * Math.PI * j / STONE.corners) * r,
                                              py + Math.sin(2 * Math.PI * j / STONE.corners) * r]),
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
      stone.addColorStop(0, STONE.stone_light);
      stone.addColorStop(STONE.stone_mid, STONE.stone);
      stone.addColorStop(1, STONE.stone_dark);
      ctx.fillStyle = stone;
      ctx.fill();
      ctx.clip();
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k], b = pts[(k + 1) % pts.length], cx = (left + right) / 2,
              cy = top + (bottom - top) *
                             (STONE.facet_y + STONE.facet_spread * Math.sin(i * STONE.facet_hash));
        ctx.fillStyle = k % 3 === 0   ? STONE.facet_light
                        : k % 3 === 1 ? STONE.facet_dark
                                      : STONE.facet_faint;
        ctx.beginPath();
        ctx.moveTo(x(cx), y(cy));
        ctx.lineTo(x(a[0] + shift), y(a[1]));
        ctx.lineTo(x(b[0] + shift), y(b[1]));
        ctx.closePath();
        ctx.fill();
      }
      if (c.scale > STONE.grain_scale)
        for (let k = 0;
             k < Math.min(STONE.max_grains, Math.ceil((right - left) * (bottom - top) * c.scale *
                                                      c.scale / STONE.grain_area));
             k++) {
          const H = STONE.grain_place, u = sineHash(k * H.u_grain + i * H.u_stone),
                v = sineHash(k * H.v_grain + i * H.v_stone), cx = left + u * (right - left),
                cy = top + v * (bottom - top),
                size = STONE.grain + STONE.grain_spread * Math.abs(Math.sin(k * STONE.grain_hash));
          ctx.fillStyle = k % 2 ? STONE.grain_light : STONE.grain_dark;
          ctx.beginPath();
          ctx.ellipse(x(cx), y(cy), size * c.scale * STONE.grain_aspect, size * c.scale,
                      STONE.grain_tilt, 0, Math.PI * 2);
          ctx.fill();
        }
      ctx.restore();
    }
  }
  ctx.restore();
}

const MOUND = Object.freeze({foot : .6, left : .65, right : .4, below : 1.3});
function traceMound(spread, rise, scale) {
  ctx.moveTo(-spread, MOUND.foot * scale);
  ctx.bezierCurveTo(-spread * MOUND.left, -rise, spread * MOUND.right, -rise, spread,
                    MOUND.foot * scale);
}
const SOIL_GRAIN = Object.freeze({
  width : 128,
  height : 64,
  hash : 73,
  period : 137,
  bright_from : 69,
  bright : [ 230, 218, 181, 17 ],
  dark : [ 50, 44, 30, 21 ]
});
function soilGrainImage() {
  const S = SOIL_GRAIN, image = new TankPixelImage();
  image.width = S.width;
  image.height = S.height;
  const g = image.getContext('2d'), pixels = g.createImageData(S.width, S.height);
  for (let k = 0; k < S.width * S.height; k++)
    pixels.data.set((k * S.hash) % S.period >= S.bright_from ? S.bright : S.dark, k * PIXEL_BYTES);
  g.putImageData(pixels, 0, 0);
  return image;
}
const BED_OPENING = Object.freeze({
  max_beds : 180,
  min_spread : 5,
  root_spread : 1.4,
  max_rise : .40,
  rise : 1.8,
  rise_per_root : .8,
  margin : 2,
  soil_stops : 4,
  min_line : .45,
  line : .12,
  shade_mid : .65,
  grain_tile : 12,
  shade_light : '#efe0b922',
  shade_clear : '#00000000',
  shade_dark : '#32271b35'
});
export function paintBedOpenings(f, c, blend, layer = null, only = null) {
  if (c.scale < ZOOM.detail)
    return;
  let count = 0;
  for (const p of only ? [ only ] : f.plants || []) {
    if (!p[PLANT.stump] || p[PLANT.root]?.[PLANT_ROOT.drift_age] || count >= BED_OPENING.max_beds ||
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
              BED_OPENING.min_spread,
              (Math.max(...anchors.map(a => a[0])) - Math.min(...anchors.map(a => a[0]))) / 2 +
                  BED_OPENING.root_spread * rootWidth),
          rise = Math.min(spread * BED_OPENING.max_rise,
                          BED_OPENING.rise + rootWidth * BED_OPENING.rise_per_root),
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
            return rgb(bedColor(f, p, at).map(v => v * light));
          };
    if (sx + spread * c.scale < 0 || sx - spread * c.scale > cameraState.viewportWidth ||
        sy + BED_OPENING.margin * c.scale < 0 || sy - rise * c.scale > cameraState.viewportHeight)
      continue;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(Math.atan2(p[PLANT.nx], -p[PLANT.ny]));
    const soil = ctx.createLinearGradient(-spread * c.scale, 0, spread * c.scale, 0);
    for (let i = 0; i <= BED_OPENING.soil_stops; ++i)
      soil.addColorStop(i / BED_OPENING.soil_stops,
                        soilColor(along + (i / 2 - 1) * spread / Math.max(1, p[PLANT.length])));
    ctx.fillStyle = soil;
    ctx.strokeStyle = soil;
    ctx.lineWidth = Math.max(BED_OPENING.min_line, c.scale * BED_OPENING.line);
    ctx.beginPath();
    traceMound(spread * c.scale, rise * c.scale, c.scale);
    ctx.quadraticCurveTo(0, MOUND.below * c.scale, -spread * c.scale, MOUND.foot * c.scale);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.clip();
    const shade = ctx.createLinearGradient(0, -rise * c.scale, 0, MOUND.below * c.scale);
    shade.addColorStop(0, BED_OPENING.shade_light);
    shade.addColorStop(BED_OPENING.shade_mid, BED_OPENING.shade_clear);
    shade.addColorStop(1, BED_OPENING.shade_dark);
    ctx.fillStyle = shade;
    ctx.fillRect(-spread * c.scale, -rise * c.scale, 2 * spread * c.scale,
                 (rise + MOUND.below) * c.scale);
    tank_sceneryState.soilGrain ??= soilGrainImage();
    const tile = BED_OPENING.grain_tile * c.scale;
    if (c.scale > 1)
      for (let x = -spread * c.scale; x < spread * c.scale; x += tile)
        for (let y = -rise * c.scale; y < MOUND.below * c.scale; y += tile / 2)
          ctx.drawImage(tank_sceneryState.soilGrain, x, y, tile, tile / 2);
    ctx.restore();
    ctx.beginPath();
    traceMound(spread * c.scale, rise * c.scale, c.scale);
    ctx.stroke();
    ctx.restore();
  }
}

const SOURCE_MARK = Object.freeze({
  min_food : 3,
  food_dash : [ 2, 4 ],
  feeder_dash : [ 4, 4 ],
  min_feeder : 5,
  min_plankton : 12,
  plankton_dash : [ 2, 5 ],
  plankton_flat : .7,
  cells : 3,
  cell_dx : 5,
  cell_dy : 3,
  cell_rx : 1.5,
  cell_ry : 2.6,
  cell_tilt : .4,
  line_width : 2,
  min_arrow : 16,
  arrow : 24,
  head_back : 6,
  head_side : 5,
  current_dash : [ 3, 5 ],
  min_current : 5,
  food : '#d9b19066',
  feeder : '#dfa686',
  plankton : '#b5c993b0',
  cell : '#d2deb0',
  current : PALETTE.blue
});
export function paintSourceMarkers(f, c) {
  const x = v => v * c.scale + c.ox, y = v => v * c.scale + c.oy;
  ctx.save();
  for (const [px, py] of (
           evolutionState.editing || el('show-food-sources').checked ? f.sources || [] : [])) {
    const radius = Math.max(SOURCE_MARK.min_food, f.parameters.food_spread * c.scale);
    if (x(px) + radius < 0 || x(px) - radius > cameraState.viewportWidth || y(py) + radius < 0 ||
        y(py) - radius > cameraState.viewportHeight)
      continue;
    ctx.strokeStyle = SOURCE_MARK.food;
    ctx.setLineDash(SOURCE_MARK.food_dash);
    ctx.beginPath();
    ctx.arc(x(px), y(py), radius, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const q of (evolutionState.editing || el('show-food-sources').checked ? f.feeders || []
                                                                             : [])) {
    const px = q[FEEDER.x], py = q[FEEDER.y], r = q[FEEDER.radius];
    ctx.strokeStyle = SOURCE_MARK.feeder;
    ctx.setLineDash(SOURCE_MARK.feeder_dash);
    ctx.beginPath();
    ctx.arc(x(px), y(py), Math.max(SOURCE_MARK.min_feeder, r * c.scale), 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([])
  }
  if (evolutionState.editing || el('show-plankton-sources').checked)
    for (const [px, py] of f.plankton_sources || []) {
      const radius = Math.max(SOURCE_MARK.min_plankton, PLANKTON_SOURCE.radius * c.scale);
      if (x(px) + radius < 0 || x(px) - radius > cameraState.viewportWidth || y(py) + radius < 0 ||
          y(py) - radius > cameraState.viewportHeight)
        continue;
      ctx.strokeStyle = SOURCE_MARK.plankton;
      ctx.setLineDash(SOURCE_MARK.plankton_dash);
      ctx.beginPath();
      ctx.ellipse(x(px), y(py), radius, radius * SOURCE_MARK.plankton_flat, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = SOURCE_MARK.cell;
      for (let k = 0; k < SOURCE_MARK.cells; ++k) {
        ctx.beginPath();
        ctx.ellipse(x(px) + (k - 1) * SOURCE_MARK.cell_dx, y(py) + (k % 2) * SOURCE_MARK.cell_dy,
                    SOURCE_MARK.cell_rx, SOURCE_MARK.cell_ry, -SOURCE_MARK.cell_tilt, 0,
                    Math.PI * 2);
        ctx.fill();
      }
    }
  for (const q of (evolutionState.editing || el('show-current-sources').checked ? f.currents || []
                                                                                : [])) {
    const px = q[CURRENT.x], py = q[CURRENT.y], angle = q[CURRENT.angle], width = q[CURRENT.width];
    ctx.save();
    ctx.translate(x(px), y(py));
    ctx.rotate(angle);
    ctx.strokeStyle = SOURCE_MARK.current;
    ctx.lineWidth = SOURCE_MARK.line_width;
    const length = Math.max(SOURCE_MARK.min_arrow, SOURCE_MARK.arrow * c.scale);
    ctx.beginPath();
    ctx.moveTo(-length * .5, 0);
    ctx.lineTo(length, 0);
    ctx.lineTo(length - SOURCE_MARK.head_back, -SOURCE_MARK.head_side);
    ctx.moveTo(length, 0);
    ctx.lineTo(length - SOURCE_MARK.head_back, SOURCE_MARK.head_side);
    ctx.stroke();
    ctx.setLineDash(SOURCE_MARK.current_dash);
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(SOURCE_MARK.min_current, width * .5 * c.scale), 0, 2 * Math.PI);
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
  "sceneryKey" : () => { tank_sceneryState.sceneryKey = ''; },
  "sceneryCamera" : () => { tank_sceneryState.sceneryCamera = null; },
  "sceneRevision" : () => { tank_sceneryState.sceneRevision = -1; },
  "sceneSignature" : () => { tank_sceneryState.sceneSignature = ''; }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
