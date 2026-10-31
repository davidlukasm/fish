import {FISH, PLANT} from './schema.js';
import {fishRenderRadius} from './fish_fins.js';
import {fishPoseAnatomy, fishSnapshotAnatomy} from './fish_forms.js';
import {fishMouthShape} from './fish_organs.js';
import {cameraState} from './camera.js';
import {ctx} from './dom.js';
import {plantWakeGeometry} from './plant_geometry.js';
import {TankPixelImage} from './renderer.js';
import {
  paintGpuCloudLight,
  paintGpuSediment,
  paintGpuSedimentCloud,
  SedimentCloudRenderer,
  SedimentRenderer
} from './sediment_renderer.js';
import {blendFish, displayStep, frameBlend, horizontalShifts, sceneState} from './state.js';
export const water_viewState = {};

function fieldSample(values, columns, rows, width, height, x, y, centered = false) {
  if (!values?.length || columns < 1 || rows < 1)
    return 1;
  let gx = (x - width * Math.floor(x / width)) / width * (centered ? columns : columns - 1) -
           (centered ? .5 : 0),
      gy = y / height * (centered ? rows : rows - 1) - (centered ? .5 : 0);
  gy = Math.max(0, Math.min(rows - 1, gy));
  let i = Math.floor(gx), j = Math.min(rows - 1, Math.floor(gy)),
      a = centered ? (i + columns) % columns : Math.max(0, Math.min(columns - 1, i)),
      b = centered ? (a + 1) % columns : Math.min(columns - 1, a + 1),
      jj = Math.min(rows - 1, j + 1), fx = gx - i, fy = gy - j;
  return (1 - fy) * ((1 - fx) * values[j * columns + a] + fx * values[j * columns + b]) +
         fy * ((1 - fx) * values[jj * columns + a] + fx * values[jj * columns + b]);
}

function localLight(f, x, y) {
  const l = f.light;
  if (!l)
    return 1;
  const depth = 1 - (1 - l.bottom) * Math.max(0, Math.min(1, y / f.height));
  return (f.daylight ?? 1) * depth *
         fieldSample(l.values, l.columns, l.rows, f.width, f.height, x, y);
}

// Display exposure keeps a shaded fish readable while the senses receive the physical signal.
function observerLight(value) { return .40 + .60 * Math.sqrt(Math.max(0, Math.min(1, value))); }

export function displayLight(f, x, y) { return observerLight(localLight(f, x, y)); }

export function paintCloudLight(f, c) {
  if (!f.light?.clear_values?.length || c.ox >= cameraState.viewportWidth ||
      c.ox + f.width * c.scale <= 0 || c.oy >= cameraState.viewportHeight ||
      c.oy + f.height * c.scale <= 0)
    return;
  paintGpuCloudLight(f, c);
}

export function plantNoise(seed) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function paintWaterLight(f, c, g) {
  const l = f.light;
  if (!l?.values?.length)
    return;
  if (water_viewState.lightRevision !== sceneState.frameRevision || !water_viewState.lightTexture) {
    water_viewState.lightRevision = sceneState.frameRevision;
    const old = paintWaterLight.state;
    let changed = !old || old.columns !== l.columns || old.rows !== l.rows ||
                  old.bottom !== l.bottom || old.daylight !== (f.daylight ?? 1) ||
                  old.values.length !== l.values.length;
    if (!changed)
      for (let k = 0; k < l.values.length; k++)
        if (old.values[k] !== l.values[k]) {
          changed = true;
          break;
        }
    if (changed) {
      paintWaterLight.state = {
        columns : l.columns,
        rows : l.rows,
        bottom : l.bottom,
        daylight : f.daylight ?? 1,
        values : l.values.slice()
      };
      water_viewState.lightTexture ??= new TankPixelImage();
      water_viewState.lightTexture.premultiplied = true;
      water_viewState.lightTexture.width = l.columns;
      water_viewState.lightTexture.height = l.rows;
      const context = water_viewState.lightTexture.getContext('2d'),
            image = context.createImageData?.(l.columns, l.rows);
      if (!image?.data) {
        water_viewState.lightTexture = null;
        return;
      }
      for (let j = 0; j < l.rows; ++j)
        for (let i = 0; i < l.columns; ++i) {
          const k = j * l.columns + i,
                value = (f.daylight ?? 1) * l.values[k] * (1 - (1 - l.bottom) * j / (l.rows - 1));
          image.data[k * 4 + 3] = Math.round(255 * (1 - observerLight(value)));
        }
      context.putImageData(image, 0, 0);
    }
  }
  if (!water_viewState.lightTexture)
    return;
  g.save();
  g.imageSmoothingEnabled = true;
  g.drawImage(water_viewState.lightTexture, c.ox, c.oy, f.width * c.scale, f.height * c.scale);
  g.restore();
}

export function sedimentGeometry(f, columns, rows, resolution) {
  const key =
      JSON.stringify([ f.width, f.height, columns, rows, resolution, f.obstacles, f.shapes ]);
  const cache = water_viewState.geometryByGrid ??= new Map();
  if (cache.has(key))
    return cache.get(key);
  const geometry = plantWakeGeometry(f), dx = f.width / columns, dy = f.height / rows,
        tw = columns * resolution, th = rows * resolution,
        mask = new Uint8Array(tw * th * 4).fill(1), bounds = new Float64Array(columns * rows * 2);
  const clear = (x, y, tx, ty, near) => {
    for (const o of near) {
      if (!o.shape?.length) {
        const vx = tx - x, vy = ty - y,
              t = Math.max(0, Math.min(1, ((o.x - x) * vx + (o.y - y) * vy) /
                                              Math.max(1e-12, vx * vx + vy * vy)));
        if ((x + t * vx - o.x) ** 2 + (y + t * vy - o.y) ** 2 <= o.r ** 2)
          return false;
        continue;
      }
      let inside = false;
      for (let i = 0, j = o.shape.length - 1; i < o.shape.length; j = i++) {
        const a = o.shape[j], b = o.shape[i];
        if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])
          inside = !inside;
        const vx = tx - x, vy = ty - y, ex = b[0] - a[0], ey = b[1] - a[1], det = vx * ey - vy * ex;
        if (Math.abs(det) > 1e-12) {
          const u = ((a[0] - x) * ey - (a[1] - y) * ex) / det,
                v = ((a[0] - x) * vy - (a[1] - y) * vx) / det;
          if (u >= 0 && u <= 1 && v >= 0 && v <= 1)
            return false;
        }
      }
      if (inside)
        return false;
    }
    return true;
  };
  for (let j = 0; j < th; ++j) {
    const py = (j + .5) / th * f.height,
          gy = Math.max(0, Math.min(rows - 1, (j + .5) / resolution - .5)), b = Math.floor(gy),
          row = geometry.filter(o => o.bottom >= py - dy && o.top <= py + dy);
    if (!row.length)
      continue;
    for (let i = 0; i < tw; ++i) {
      const px = (i + .5) / tw * f.width, a = Math.floor((i + .5) / resolution - .5),
            near = row.filter(o => o.right >= px - dx && o.left <= px + dx);
      if (!near.length)
        continue;
      for (let sy = 0; sy < 2; ++sy)
        for (let sx = 0; sx < 2; ++sx) {
          const cx = ((a + sx + columns) % columns + .5) * dx,
                tx = px + (cx - px) - f.width * Math.round((cx - px) / f.width),
                ty = (Math.min(rows - 1, b + sy) + .5) * dy;
          mask[4 * (j * tw + i) + 2 * sy + sx] = clear(px, py, tx, ty, near) ? 1 : 0;
        }
    }
  }
  // Grains stay in the connected water interval containing their physical cell center.
  for (let i = 0; i < columns; ++i) {
    const x = (i + .5) * dx, intervals = [];
    for (const o of geometry) {
      if (x < o.left || x > o.right)
        continue;
      const ys = [];
      if (!o.shape?.length) {
        const h = Math.sqrt(Math.max(0, o.r ** 2 - (x - o.x) ** 2));
        ys.push(o.y - h, o.y + h);
      } else
        for (let a = 0, b = o.shape.length - 1; a < o.shape.length; b = a++) {
          const p = o.shape[b], q = o.shape[a];
          if ((p[0] > x) !== (q[0] > x))
            ys.push(p[1] + (x - p[0]) / (q[0] - p[0]) * (q[1] - p[1]));
        }
      ys.sort((a, b) => a - b);
      for (let k = 0; k + 1 < ys.length; k += 2)
        intervals.push([ ys[k], ys[k + 1] ]);
    }
    for (let j = 0; j < rows; ++j) {
      const y = (j + .5) * dy;
      let top = j * dy, bottom = (j + 1) * dy;
      for (const [a, b] of intervals) {
        if (b <= y)
          top = Math.max(top, b + .02);
        else if (a >= y)
          bottom = Math.min(bottom, a - .02);
        else
          top = bottom = y;
      }
      bounds[2 * (j * columns + i)] = top;
      bounds[2 * (j * columns + i) + 1] = bottom;
    }
  }
  if (cache.size >= 4)
    cache.delete(cache.keys().next().value);
  const result = {mask, bounds};
  cache.set(key, result);
  return result;
}

function updateSedimentView(f) {
  if (water_viewState.sedimentRevision === sceneState.frameRevision)
    return;
  water_viewState.sedimentRevision = sceneState.frameRevision;
  water_viewState.dustCells = [];
  const s = f.sediment;
  if (!s?.columns || !s.rows)
    return;
  const columns = s.columns, rows = s.rows, dx = f.width / columns, dy = f.height / rows,
        area = dx * dy;
  const water = f.water || [], flowXs = [...new Set(water.map(p => p[0])) ].sort((a, b) => a - b),
        flowYs = [...new Set(water.map(p => p[1])) ].sort((a, b) => a - b),
        step = flowXs.length > 1 ? flowXs[1] - flowXs[0] : 96,
        flows = new Map(water.map(p => [p[0] + ':' + p[1], p]));
  if (!s.amounts.some(m => m > 1e-8)) {
    water_viewState.sedimentField = null;
    return;
  }
  const geometry = water_viewState.sedimentField = sedimentGeometry(f, columns, rows, 2);

  for (let j = 0; j < rows; ++j)
    for (let i = 0; i < columns; ++i) {
      const density = Math.min(1, 64 * (s.amounts[j * columns + i] || 0) / area);
      if (density < .003)
        continue;
      const x = (i + .5) * dx, y = (j + .5) * dy,
            fx = flowXs.length ? flowXs[Math.max(0, Math.min(flowXs.length - 1,
                                                             Math.round((x - flowXs[0]) / step)))]
                               : 0,
            fy = flowYs.length ? flowYs[Math.max(0, Math.min(flowYs.length - 1,
                                                             Math.round((y - flowYs[0]) / step)))]
                               : 0,
            v = flows.get(fx + ':' + fy);
      const top = geometry.bounds[2 * (j * columns + i)],
            bottom = geometry.bounds[2 * (j * columns + i) + 1];
      if (bottom > top)
        water_viewState.dustCells.push(
            {i, j, dx, dy : bottom - top, top, density, u : v?.[2] || 0, v : v?.[3] || 0});
    }
}

export function planktonGrains(f, c) {
  const p = f.plankton, dx = f.width / p.columns, dy = f.height / p.rows, step = f.step || 0,
        grid = [ f.render_epoch, f.width, f.height, p.columns, p.rows ].join(':'),
        key = [ c.scale, c.ox, c.oy, cameraState.viewportWidth, cameraState.viewportHeight ].join(
            ':'),
        cached = water_viewState.planktonGrains;
  if (cached?.amounts === p.amounts && cached.water === f.water && cached.step === step &&
      cached.key === key)
    return cached.grains;
  const maximum = f.parameters?.plankton_max_density ?? .01, cells = [];
  for (let j = 0; j < p.rows; ++j)
    for (let i = 0; i < p.columns; ++i) {
      const density = (p.amounts[j * p.columns + i] || 0) / (dx * dy);
      if (density > maximum * .04)
        cells.push([ i, j, Math.min(1, density / maximum) ]);
    }
  const water = f.water || [], flows = new Map(water.map(v => [v[0] + ':' + v[1], v])),
        xs = [...new Set(water.map(v => v[0])) ].sort((a, b) => a - b),
        ys = [...new Set(water.map(v => v[1])) ].sort((a, b) => a - b), wx = xs[1] - xs[0] || 96,
        wy = ys[1] - ys[0] || 96,
        previous = cached?.grid === grid && step >= cached.step ? cached.tracks : null,
        elapsed = previous ? step - cached.step : 0,
        // Global density sampling is independent of camera position and visible cell count.
      perCell = Math.min(4, dx * dy * c.scale * c.scale / 70, 800 / Math.max(1, cells.length)),
        tracks = new Map(), grains = [];
  for (const [i, j, density] of cells) {
    const seed = (j * p.columns + i) * 17, count = perCell * density;
    for (let k = 0; k < 4; ++k) {
      if (k + plantNoise(seed + k * 83 + 39) >= count)
        continue;
      const id = 4 * (j * p.columns + i) + k, old = previous?.get(id);
      let x = old ? old[0] + old[4] * elapsed : (i + plantNoise(seed + k)) * dx,
          y = old ? old[1] + old[5] * elapsed : (j + plantNoise(seed + k + 197)) * dy,
          birth = old?.[3] ?? (previous ? step : step - 24);
      x = (x % f.width + f.width) % f.width;
      y = Math.max(0, Math.min(f.height - .001, y));
      const field = (Math.floor(y / dy) * p.columns + Math.floor(x / dx)),
            local = (p.amounts[field] || 0) / (dx * dy);
      if (local < maximum * .02 || Math.abs(x - (i + .5) * dx) > 3 * dx ||
          Math.abs(y - (j + .5) * dy) > 3 * dy) {
        x = (i + plantNoise(seed + k)) * dx;
        y = (j + plantNoise(seed + k + 197)) * dy;
        birth = step;
      }
      const fx = xs[Math.max(0, Math.min(xs.length - 1, Math.round((x - xs[0]) / wx)))],
            fy = ys[Math.max(0, Math.min(ys.length - 1, Math.round((y - ys[0]) / wy)))],
            flow = flows.get(fx + ':' + fy), grain = [
              x, y, dx, birth, flow?.[2] || 0, flow?.[3] || 0,
              .55 + .35 * plantNoise(seed + k + 71), density, 0, 0, step, plantNoise(seed + k + 401)
            ];
      grain.id = id;
      tracks.set(id, grain);
      grains.push(grain);
    }
  }
  if (grains.length > 800) {
    grains.sort((a, b) => a[11] - b[11]);
    grains.length = 800;
  }
  const visible = grains.filter(g => {
    const x = g[0] * c.scale + c.ox, y = g[1] * c.scale + c.oy;
    return x >= -24 && x <= cameraState.viewportWidth + 24 && y >= -24 &&
           y <= cameraState.viewportHeight + 24;
  });
  water_viewState.planktonGrains =
      {amounts : p.amounts, water : f.water, key, grid, step, grains : visible, tracks};
  return visible;
}
// Captured display particles keep their own origin; the field remains the food source.
export function planktonIntake(grains, mouths, step, epoch) {
  let state = water_viewState.planktonIntake;
  if (!state || state.epoch !== epoch || step < state.step)
    state = water_viewState.planktonIntake = {epoch, step, captures : new Map()};
  state.step = step;
  const captures = state.captures, byId = new Map(mouths.map(m => [m.id, m])), cells = new Map(),
        cellSize = 32;
  for (const m of mouths) {
    if (m.active === false)
      continue;
    for (let y = Math.floor((m.y - m.reach) / cellSize);
         y <= Math.floor((m.y + m.reach) / cellSize); y++)
      for (let x = Math.floor((m.x - m.reach) / cellSize);
           x <= Math.floor((m.x + m.reach) / cellSize); x++) {
        const key = x + ':' + y;
        if (!cells.has(key))
          cells.set(key, []);
        cells.get(key).push(m);
      }
  }
  for (const [id, capture] of captures)
    if (step - capture.start > 320)
      captures.delete(id);
  if (!mouths.length && !captures.size)
    return grains;
  const seen = new Set(), drawCapture = (capture, id) => {
    const mouth = byId.get(capture.fish);
    if (mouth) {
      capture.x = mouth.x;
      capture.y = mouth.y;
    }
    const row = capture.source.slice();
    row.id = id;
    row.intake = [ capture.x, capture.y, capture.start, capture.duration ];
    return row;
  };
  const visible = grains.map(g => {
    const id = g.id, x = g[0] + g[4] * (step - g[10]), y = g[1] + g[5] * (step - g[10]);
    seen.add(id);
    let capture = captures.get(id);
    if (capture && capture.birth !== g[3]) {
      captures.delete(id);
      capture = null;
    }
    if (capture && step - capture.start > 160) {
      captures.delete(id);
      g[3] = step;
      return g;
    }
    if (!capture && step - g[3] >= 16) {
      let best = null, gap = Infinity;
      for (const m of cells.get(Math.floor(x / cellSize) + ':' + Math.floor(y / cellSize)) || []) {
        const dx = x - m.x, dy = y - m.y, along = dx * m.nx + dy * m.ny,
              across = Math.abs(dx * m.ny - dy * m.nx), d = dx * dx + dy * dy;
        if (along >= -m.gap && along < m.reach && across < m.gap + .55 * Math.max(0, along) &&
            d < gap) {
          best = m;
          gap = d;
        }
      }
      if (best) {
        capture = {
          birth : g[3],
          source : g.slice(),
          fish : best.id,
          x : best.x,
          y : best.y,
          start : step,
          duration : Math.max(5, Math.min(16, 5 + Math.sqrt(gap) * .55))
        };
        captures.set(id, capture);
      }
    }
    if (!capture)
      return g;
    // A swallowed glyph stays absent until this local sample is renewed.
    return drawCapture(capture, id);
  });
  // Depletion of the field must not erase an animal halfway to the mouth.
  for (const [id, capture] of captures)
    if (!seen.has(id) && step < capture.start + capture.duration)
      visible.push(drawCapture(capture, id));
  return visible;
}
function planktonMouths(f, c) {
  const result = [], blend = frameBlend(), time = displayStep(f), tracked = new Set();
  for (const capture of water_viewState.planktonIntake?.captures.values() || [])
    if (time < capture.start + capture.duration)
      tracked.add(Number.parseInt(capture.fish, 10));
  for (const raw of f.fish || []) {
    const active = raw[FISH.filtered] > 1e-8 && raw[FISH.suction_pose] > .01;
    if (!raw[FISH.hatched] || !active && !tracked.has(raw[FISH.id]))
      continue;
    const p = blendFish(raw, blend), radius = fishRenderRadius(p),
          a = fishPoseAnatomy(fishSnapshotAnatomy(p), p), mouth = fishMouthShape(a),
          nx = Math.cos(p[FISH.angle]), ny = Math.sin(p[FISH.angle]),
          front = (mouth.front - (a.origin?.[0] || 0)) * radius,
          side = -(a.origin?.[1] || 0) * radius, x = p[FISH.x] + nx * front - ny * side,
          y = p[FISH.y] + ny * front + nx * side,
          reach = Math.min(8, Math.max(.5, p[FISH.mouth_aperture])) *
                  (f.parameters?.suction_range ?? 1),
          gap = radius * mouth.gap;
    for (const shift of [-f.width, 0, f.width]) {
      const mx = x + shift;
      if (mx + reach < 0 || mx - reach > f.width || (mx + reach) * c.scale + c.ox < 0 ||
          (mx - reach) * c.scale + c.ox > cameraState.viewportWidth ||
          (y + reach) * c.scale + c.oy < 0 ||
          (y - reach) * c.scale + c.oy > cameraState.viewportHeight)
        continue;
      result.push({id : p[FISH.id] + ':' + shift, x : mx, y, nx, ny, reach, gap, active});
    }
  }
  return result;
}
export function paintPlankton(f, c) {
  const p = f.plankton;
  if (!p?.columns || !p.rows || !p.amounts || c.ox >= cameraState.viewportWidth ||
      c.ox + f.width * c.scale <= 0 || c.oy >= cameraState.viewportHeight ||
      c.oy + f.height * c.scale <= 0)
    return;
  // One cached density texture supplies the overview; individual animals take over nearby.
  if (c.scale < 4) {
    const key = [ f.environment, f.width, f.height, p.columns, p.rows ].join(':');
    if (water_viewState.planktonMaskKey !== key) {
      water_viewState.planktonMaskKey = key;
      water_viewState.planktonMask = sedimentGeometry(f, p.columns, p.rows, 2);
    }
    const cloud = water_viewState.planktonCloud ??=
        new SedimentCloudRenderer(undefined, [ .47, .57, .39 ], 44, .55);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(.45, 1.5 * (4 - c.scale) / 8));
    cloud.paint({...f, sediment : p}, c, water_viewState.planktonMask);
    ctx.restore();
  }
  if (c.scale < .45)
    return;
  const grains = planktonGrains(f, c);
  const animals = water_viewState.planktonParticles ??= new SedimentRenderer(true);
  ctx.save();
  clipObstacles(f, c, ctx,
                {x : 0, y : 0, w : cameraState.viewportWidth, h : cameraState.viewportHeight});
  const time = displayStep(f);
  animals.paint(c, time,
                planktonIntake(grains, planktonMouths(f, c), time,
                               [ f.render_epoch, f.view_context, f.width, f.height ].join(':')));
  ctx.restore();
}

export function paintSuspendedSediment(f, c, blend = 1) {
  const grid = f.sediment;
  if (!grid?.columns || !grid.rows)
    return;
  const dx = f.width / grid.columns, dy = f.height / grid.rows,
        i0 = Math.max(0, Math.floor(-c.ox / c.scale / dx) - 2),
        i1 = Math.min(grid.columns - 1,
                      Math.ceil((cameraState.viewportWidth - c.ox) / c.scale / dx) + 2),
        j0 = Math.max(0, Math.floor(-c.oy / c.scale / dy) - 2),
        j1 = Math.min(grid.rows - 1,
                      Math.ceil((cameraState.viewportHeight - c.oy) / c.scale / dy) + 2);
  let visible = false;
  for (let j = j0; j <= j1 && !visible; ++j)
    for (let i = i0; i <= i1; ++i)
      if (grid.amounts[j * grid.columns + i] > 1e-8) {
        visible = true;
        break;
      }
  if (!visible)
    return;
  updateSedimentView(f);
  if (!water_viewState.dustCells.length)
    return;
  const step = displayStep(f, blend);
  ctx.save();
  clipObstacles(f, c, ctx,
                {x : 0, y : 0, w : cameraState.viewportWidth, h : cameraState.viewportHeight});
  if (water_viewState.sedimentField)
    paintGpuSedimentCloud(f, c, water_viewState.sedimentField);
  const grains = sedimentGrains(f, c);
  paintGpuSediment(f, c, step, grains);
  ctx.restore();
}

function sedimentGrains(f, c) {
  const scale = 2 ** Math.round(Math.log2(Math.max(.001, c.scale))), left = -c.ox / c.scale,
        right = (cameraState.viewportWidth - c.ox) / c.scale, top = -c.oy / c.scale,
        bottom = (cameraState.viewportHeight - c.oy) / c.scale, dx = f.width / f.sediment.columns,
        dy = f.height / f.sediment.rows, view = [
          Math.max(0, Math.floor(left / dx)), Math.min(f.sediment.columns, Math.ceil(right / dx)),
          Math.max(0, Math.floor(top / dy)), Math.min(f.sediment.rows, Math.ceil(bottom / dy))
        ].join(':');
  if (water_viewState.grainRevision === water_viewState.sedimentRevision &&
      water_viewState.grainScale === scale && water_viewState.grainView === view)
    return water_viewState.grainData;
  water_viewState.grainView = view;
  water_viewState.grainRevision = water_viewState.sedimentRevision;
  water_viewState.grainScale = scale;
  water_viewState.grainData = [];
  // The smooth opacity field carries the cloud; individual grains are screen-space detail.
  const cells = water_viewState.dustCells.filter(
            q => (q.i + 1) * q.dx >= left - dx && q.i * q.dx <= right + dx &&
                 q.top + q.dy >= top - dy && q.top <= bottom + dy),
        area = cells.length ? (cells[0].dx * cells[0].dy) : 1,
        perCell = Math.min(7, area * scale * scale / 600, 2048 / Math.max(1, cells.length));
  for (const {i, j, dx, dy, top, density, u, v} of cells) {
    const count = perCell * density, whole = Math.floor(count),
          seed = (j * f.sediment.columns + i) * 13;
    for (let k = 0; k < whole + (plantNoise(seed + 391) < count - whole ? 1 : 0); ++k)
      water_viewState.grainData.push([
        i * dx, top, dx, dy, u, v + 20 * Math.LN2 / (f.parameters?.sediment_half_life || 35 / 3),
        .07 + .10 * plantNoise(seed + k + 71), Math.sqrt(density), plantNoise(seed + k),
        plantNoise(seed + k + 197), 0, 0
      ]);
  }
  return water_viewState.grainData;
}

// Match the interpolated, smoothly joined top edge of the sediment shader.
export function clipSediment(f, c, g, shifts, blend = 1, items = null) {
  if (water_viewState.clipFrame !== f) {
    water_viewState.clipFrame = f;
    water_viewState.clipBeds =
        (f.plants || [])
            .filter(p => !p[PLANT.root]?.[2] &&
                         (p[PLANT.sediment_left] > 0 || p[PLANT.sediment_right] > 0));
    water_viewState.clipPrevious =
        new Map((sceneState.previous?.plants || []).map(p => [p[PLANT.id], p]));
  }
  // Only mask beds that can touch this fish batch; open-water batches need no stencil work.
  const nearby = items?.map(v => {
    const r = v.r * (v.extent || 4);
    return [ v.p[FISH.x] - r, v.p[FISH.y] - r, v.p[FISH.x] + r, v.p[FISH.y] + r ];
  });
  g.beginPath();
  let found = false;
  for (const p of water_viewState.clipBeds) {
    const old = water_viewState.clipPrevious.get(p[PLANT.id]) || p,
          left = old[PLANT.sediment_left] +
                 (p[PLANT.sediment_left] - old[PLANT.sediment_left]) * blend,
          right = old[PLANT.sediment_right] +
                  (p[PLANT.sediment_right] - old[PLANT.sediment_right]) * blend,
          h = Math.max(left, right),
          loY = Math.min(p[PLANT.ay], p[PLANT.by], p[PLANT.ay] + p[PLANT.ny] * h,
                         p[PLANT.by] + p[PLANT.ny] * h),
          hiY = Math.max(p[PLANT.ay], p[PLANT.by], p[PLANT.ay] + p[PLANT.ny] * h,
                         p[PLANT.by] + p[PLANT.ny] * h);
    if (hiY * c.scale + c.oy < 0 || loY * c.scale + c.oy > cameraState.viewportHeight)
      continue;
    if (nearby &&
        !nearby.some(b => b[3] >= loY && b[1] <= hiY &&
                          shifts.some(shift => b[2] >= Math.min(p[PLANT.ax], p[PLANT.bx]) + shift -
                                                           Math.abs(p[PLANT.nx] * h) &&
                                               b[0] <= Math.max(p[PLANT.ax], p[PLANT.bx]) + shift +
                                                           Math.abs(p[PLANT.nx] * h))))
      continue;
    for (const shift of shifts) {
      const loX = Math.min(p[PLANT.ax], p[PLANT.bx], p[PLANT.ax] + p[PLANT.nx] * h,
                           p[PLANT.bx] + p[PLANT.nx] * h) +
                  shift,
            hiX = Math.max(p[PLANT.ax], p[PLANT.bx], p[PLANT.ax] + p[PLANT.nx] * h,
                           p[PLANT.bx] + p[PLANT.nx] * h) +
                  shift;
      if (hiX * c.scale + c.ox < 0 || loX * c.scale + c.ox > cameraState.viewportWidth)
        continue;
      found = true;
      g.moveTo((p[PLANT.ax] + shift) * c.scale + c.ox, p[PLANT.ay] * c.scale + c.oy);
      g.lineTo((p[PLANT.bx] + shift) * c.scale + c.ox, p[PLANT.by] * c.scale + c.oy);
      for (let k = 8; k >= 0; --k) {
        const t = k / 8, u = t * t * (3 - 2 * t), d = left + (right - left) * u;
        g.lineTo(
            (p[PLANT.ax] + (p[PLANT.bx] - p[PLANT.ax]) * t + p[PLANT.nx] * d + shift) * c.scale +
                c.ox,
            (p[PLANT.ay] + (p[PLANT.by] - p[PLANT.ay]) * t + p[PLANT.ny] * d) * c.scale + c.oy);
      }
      g.closePath();
    }
  }
  if (found)
    g.clip('outside');
}

export function clipObstacles(f, c, g, bounds) {
  g.beginPath();
  let found = false;
  for (let i = 0; i < (f.obstacles || []).length; ++i) {
    const [px, py, r] = f.obstacles[i], shape = f.shapes?.[i],
                   loX = shape?.length ? Math.min(...shape.map(p => p[0])) : px - r,
                   hiX = shape?.length ? Math.max(...shape.map(p => p[0])) : px + r,
                   loY = shape?.length ? Math.min(...shape.map(p => p[1])) : py - r,
                   hiY = shape?.length ? Math.max(...shape.map(p => p[1])) : py + r;
    if (hiY * c.scale + c.oy < bounds.y || loY * c.scale + c.oy > bounds.y + bounds.h)
      continue;
    for (const shift of horizontalShifts(f, c)) {
      if ((hiX + shift) * c.scale + c.ox < bounds.x ||
          (loX + shift) * c.scale + c.ox > bounds.x + bounds.w)
        continue;
      found = true;
      if (shape?.length) {
        shape.forEach(([ x, y ], k) =>
                          k ? g.lineTo((x + shift) * c.scale + c.ox, y * c.scale + c.oy)
                            : g.moveTo((x + shift) * c.scale + c.ox, y * c.scale + c.oy));
        g.closePath();
      } else {
        g.moveTo((px + shift + r) * c.scale + c.ox, py * c.scale + c.oy);
        g.arc((px + shift) * c.scale + c.ox, py * c.scale + c.oy, r * c.scale, 0, 2 * Math.PI);
        g.closePath();
      }
    }
  }
  if (found)
    g.clip('outside');
}

const initializers = {
  "lightTexture" : () => { water_viewState.lightTexture = null; },
  "lightRevision" : () => { water_viewState.lightRevision = -1; },
  "sedimentGeometryKey" : () => { water_viewState.sedimentGeometryKey = ''; },
  "sedimentGeometryCache" : () => { water_viewState.sedimentGeometryCache = null; },
  "sedimentField" : () => { water_viewState.sedimentField = null; },
  "sedimentRevision" : () => { water_viewState.sedimentRevision = -1; },
  "dustCells" : () => { water_viewState.dustCells = []; },
  "grainRevision" : () => { water_viewState.grainRevision = -1; },
  "grainScale" : () => { water_viewState.grainScale = 0; },
  "grainView" : () => { water_viewState.grainView = ''; },
  "grainData" : () => { water_viewState.grainData = []; }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
