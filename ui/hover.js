import {scentColors} from './brain_model.js';
import {drawScentWheel} from './organ_graphics.js';
import {PLANT, CORPSE} from './schema.js';
import {updateSceneState} from './state.js';
import {brainState} from './brain.js';
import {brainHit} from './brain_input.js';
import {camera, cameraState, canvasPoint, screenToWorld} from './camera.js';
import {updateCockpit} from './cockpit.js';
import {canvas, el, text} from './dom.js';
import {evolutionState} from './evolution.js';
import {fishRenderRadius} from './fish_fins.js';
import {fishBodyContains} from './fish_forms.js';
import {corpseFish} from './fish_painter.js';
import {
  algaeDisplay,
  bedScale,
  plantRibbon,
  plantFoot,
  animalFoot,
  plantRenderParts
} from './plant_geometry.js';
import {tankObjectInfo, tankOdors} from './object_info.js';
import {showSelection} from './selection.js';
import {
  blendFish,
  blendParticle,
  blendSmallAnimal,
  frameBlend,
  frameFish,
  frameCorpse,
  horizontalDelta,
  sceneState
} from './state.js';
import {tankState} from './tank.js';
import {grassPartPose, grassHitBounds} from './vegetation.js';
import {foodDisplayRadius} from './particle_renderer.js';
export const hoverState = {};
export let tankTooltipRows;

export function tankPanelFrame(f) {
  const id = sceneState.tankPreviewFish;
  if (!id || id === f.selected || brainState.brainOpen || evolutionState.editing ||
      evolutionState.activeView !== 'fish')
    return f;
  const p = frameFish(f, id);
  if (!p && !frameCorpse(f, id))
    return f;
  return {
    ...f,
    selected : id,
    selected_death : null,
    selected_body : null,
    selected_genome_available : true,
    brain : p ? {neuron_count : p[38], edge_count : p[39], planning : false} : null
  };
}

// soft: clicks, drags and selections keep a pinned info panel (Infopanel on).
export function tankHideTooltip(soft = false) {
  if (soft && hoverState.persistent)
    return;
  hoverState.menuHit = null;
  el('tank-tooltip').hidden = true;
  hoverState.tankHoverKey = '';
  hoverState.tankHoverSince = 0;
}

export function tankShowTooltip(info, hit) {
  const tip = el('tank-tooltip');
  if (!info) {
    tip.hidden = true;
    return;
  }
  text('tank-tooltip-title', info.title);
  text('tank-tooltip-subtitle', info.subtitle || '');
  text('tank-tooltip-state', info.state || '');
  el('tank-tooltip-state').hidden = !info.state;
  const icon = el('tank-tooltip-icon');
  icon.className = 'tank-object-' + info.kind;
  icon.style.background = info.color;
  tip.style.setProperty?.('--object-color', info.color);
  tankTooltipRows.forEach((row, i) => {
    const metric = info.metrics[i];
    row.box.hidden = !metric;
    if (metric) {
      if (row.label.textContent !== metric[0])
        row.label.textContent = metric[0];
      if (String(row.value.textContent) !== String(metric[1]))
        row.value.textContent = metric[1];
    }
  });
  const meter = el('tank-tooltip-fill');
  meter.parentElement.hidden = !Number.isFinite(info.fill);
  meter.style.width = 100 * Math.max(0, Math.min(1, info.fill || 0)) + '%';
  const rect = canvas.getBoundingClientRect(), bounds = {
    left : Math.max(0, rect.left),
    top : Math.max(0, rect.top),
    right : Math.min(window.innerWidth || rect.right || rect.left + rect.width,
                     rect.right || rect.left + rect.width),
    bottom : Math.min(window.innerHeight || rect.bottom || rect.top + rect.height,
                      rect.bottom || rect.top + rect.height)
  };
  tip.style.width = '244px';
  tip.style.maxWidth = Math.max(120, Math.min(260, bounds.right - bounds.left - 16)) + 'px';
  tip.hidden = false;
  const scents = el('tank-tooltip-scents');
  scents.hidden = !info.odors;
  if (info.odors)
    drawScentWheel(scents, info.odors);
  // One constant height for every kind of object: the panel keeps the tallest content seen.
  hoverState.tipHeight = Math.max(hoverState.tipHeight || 0, tip.getBoundingClientRect().height);
  tip.style.minHeight = hoverState.tipHeight + 'px';
  const size = tip.getBoundingClientRect(),
        radius = Math.min(35, (hit.radius || 4) * camera().scale * rect.width /
                                  cameraState.viewportWidth),
        object = {
          left : hoverState.tankPointer.x - radius,
          right : hoverState.tankPointer.x + radius,
          top : hoverState.tankPointer.y - radius,
          bottom : hoverState.tankPointer.y + radius
        },
        position = {
          x : Math.max(bounds.left + 8, bounds.right - size.width - 12),
          y : Math.max(bounds.top + 8, bounds.bottom - size.height - 12)
        };
  void object;
  tip.style.left = position.x + 'px';
  tip.style.top = position.y + 'px';
}

// Odour cloud overlay: while the pointer rests on one scent of the info panel's wheel, the tank
// shows where that odour is, as a coloured cloud over the visible part.
function odorOverlay() {
  let overlay = document.getElementById('tank-odor-overlay');
  if (!overlay && canvas.parentElement) {
    overlay = document.createElement('canvas');
    overlay.id = 'tank-odor-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    canvas.parentElement.insertBefore(overlay, canvas.nextSibling);
  }
  return overlay;
}
function paintOdorCloud(channel) {
  const overlay = odorOverlay(), f = sceneState.frame, grid = f?.odors;
  if (!overlay)
    return;
  const rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  overlay.style.left = canvas.offsetLeft + 'px';
  overlay.style.top = canvas.offsetTop + 'px';
  overlay.style.width = rect.width + 'px';
  overlay.style.height = rect.height + 'px';
  // Assigning a canvas size reallocates and clears its pixels, even with the same value.
  const width = Math.max(1, Math.round(rect.width * dpr)),
        height = Math.max(1, Math.round(rect.height * dpr));
  if (overlay.width !== width)
    overlay.width = width;
  if (overlay.height !== height)
    overlay.height = height;
  const g = overlay.getContext('2d');
  g.clearRect(0, 0, overlay.width, overlay.height);
  overlay.hidden = channel < 0;
  if (channel < 0 || !grid?.columns || !grid.rows || !grid.cells)
    return;
  // The repaint runs every 250 ms while a scent is shown: reuse the small grid image.
  let cloud = hoverState.odorCloud;
  if (!cloud || cloud.columns !== grid.columns || cloud.rows !== grid.rows) {
    const image = document.createElement('canvas');
    image.width = grid.columns;
    image.height = grid.rows;
    const ig = image.getContext('2d');
    cloud = hoverState.odorCloud = {
      columns : grid.columns,
      rows : grid.rows,
      image,
      ig,
      data : ig.createImageData(grid.columns, grid.rows)
    };
  }
  const {image, ig, data} = cloud, pixels = data.data,
                    hex = (scentColors?.[channel] || '#ffffff').slice(1),
                    rgb = [ 0, 2, 4 ].map(i => parseInt(hex.slice(i, i + 2), 16));
  for (let i = 0; i < grid.columns * grid.rows; ++i) {
    const v = Math.max(0, grid.cells[i]?.[channel] || 0), a = Math.sqrt(v / (v + .1));
    pixels[4 * i] = rgb[0];
    pixels[4 * i + 1] = rgb[1];
    pixels[4 * i + 2] = rgb[2];
    pixels[4 * i + 3] = Math.round(115 * a);
  }
  ig.putImageData(data, 0, 0);
  const c = camera(), k = overlay.width / cameraState.viewportWidth;
  g.imageSmoothingEnabled = true;
  for (const shift of [-f.width, 0, f.width])
    g.drawImage(image, (c.ox + shift * c.scale) * k, c.oy * k, f.width * c.scale * k,
                f.height * c.scale * k);
}
function bindScentWheel() {
  const wheel = el('tank-tooltip-scents');
  if (!wheel?.addEventListener || wheel.cloudBound)
    return;
  wheel.cloudBound = true;
  let channel = -1, timer = null;
  const channelAt = e => {
    const r = wheel.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 144 - 72,
          y = (e.clientY - r.top) / r.height * 144 - 72;
    if (Math.hypot(x, y) < 8)
      return -1;
    return ((Math.round(Math.atan2(y, x) / (Math.PI / 4)) % 8) + 8) % 8;
  };
  wheel.addEventListener('pointermove', e => {
    const k = channelAt(e);
    if (k === channel)
      return;
    channel = k;
    paintOdorCloud(channel);
    clearInterval(timer);
    timer = channel >= 0 ? setInterval(() => paintOdorCloud(channel), 250) : null;
  });
  wheel.addEventListener('pointerleave', () => {
    channel = -1;
    clearInterval(timer);
    timer = null;
    paintOdorCloud(-1);
  });
}

function corpseBodyContains(p, x, y, padding, scale) {
  if (!p[CORPSE.morphology_asset])
    return Math.hypot(horizontalDelta(x - p[0]), y - p[1]) <= p[9] + padding;
  const q = corpseFish(p).slice();
  q[0] = p[0];
  q[1] = p[1];
  q[2] = p[8];
  return fishBodyContains(q, x, y, padding, scale);
}

export let tankHoverProviders;

export function tankSedimentHit(world, f = sceneState.frame) {
  for (const p of f.plants || []) {
    const ax = world.x + horizontalDelta(p[1] - world.x), ay = p[2], dx = p[3] - p[1],
          dy = p[4] - p[2], length = Math.max(.01, p[12]),
          t = ((world.x - ax) * dx + (world.y - ay) * dy) / (length * length);
    if (t < 0 || t > 1)
      continue;
    const gap = (world.x - ax) * p[5] + (world.y - ay) * p[6],
          depth = (p[PLANT.sediment_left] ?? 4 * p[11] / length) * (1 - t) +
                  (p[PLANT.sediment_right] ?? 4 * p[11] / length) * t;
    if (depth > 0 && gap >= 0 && gap <= depth)
      return {
        kind : 'sediment',
        item : p,
        key : 'sediment:' + p[0],
        depth,
        radius : 4,
        x : world.x,
        y : world.y
      };
  }
  return null;
}

function tankVegetationHit(world, scale) {
  let best = null, distance = Infinity;
  for (const p of sceneState.frame.plants || []) {
    const bounds = p[9] ? grassHitBounds(p) : null,
          px = bounds ? (bounds[0] + bounds[2]) / 2 +
                            horizontalDelta(world.x - (bounds[0] + bounds[2]) / 2)
                      : 0,
          tolerance = 3 / scale,
          near = !bounds || (px >= bounds[0] - tolerance && px <= bounds[2] + tolerance &&
                             world.y >= bounds[1] - tolerance && world.y <= bounds[3] + tolerance);
    if (p[9] && near)
      for (const part of plantRenderParts(p)) {
        const shown = grassPartPose(p, part), q = shown.q,
              px = q[0] + horizontalDelta(world.x - q[0]), r = Math.max(shown.width, 3 / scale);
        if (px < Math.min(q[0], q[2], q[4], q[6]) - r ||
            px > Math.max(q[0], q[2], q[4], q[6]) + r ||
            world.y < Math.min(q[1], q[3], q[5], q[7]) - r ||
            world.y > Math.max(q[1], q[3], q[5], q[7]) + r)
          continue;
        const span = Math.hypot(q[2] - q[0], q[3] - q[1]) + Math.hypot(q[4] - q[2], q[5] - q[3]) +
                     Math.hypot(q[6] - q[4], q[7] - q[5]),
              steps = Math.max(8, Math.min(48, Math.ceil(span * scale / 8)));
        let before = plantRibbon(q, shown.width, part.kind, 0);
        for (let k = 1; k <= steps; k++) {
          const after = plantRibbon(q, shown.width, part.kind, k / steps),
                dx = after.p[0] - before.p[0], dy = after.p[1] - before.p[1],
                t = Math.max(0,
                             Math.min(1, ((px - before.p[0]) * dx + (world.y - before.p[1]) * dy) /
                                             Math.max(1e-9, dx * dx + dy * dy))),
                x = before.p[0] + dx * t, y = before.p[1] + dy * t,
                d = Math.hypot(px - x, world.y - y),
                radius = before.width + (after.width - before.width) * t + 2 / scale;
          if (d <= radius) {
            const hit = {
              kind : 'plant',
              item : p,
              organ : part,
              trait : p[PLANT.trait] ?? (p[PLANT.form] + .25) / 3,
              key : 'plant:' + p[0] + ':' + part.stem,
              along : (k - 1 + t) / steps,
              radius,
              x,
              y
            };
            if (!best || hitDepth(hit) > hitDepth(best) ||
                hitDepth(hit) === hitDepth(best) && d < distance) {
              best = hit;
              distance = d;
            }
          }
          before = after;
        }
      }
    if (p[7] > 0 && (p[26] ?? 1) > (p[25] ?? 0) && (p[PLANT.sediment_left] ?? p[11]) <= 0 &&
        (p[PLANT.sediment_right] ?? p[11]) <= 0) {
      const dx = p[3] - p[1], dy = p[4] - p[2],
            t = Math.max(p[25] ?? 0, Math.min(p[26] ?? 1, (horizontalDelta(world.x - p[1]) * dx +
                                                           (world.y - p[2]) * dy) /
                                                              (p[12] * p[12]))),
            x = p[1] + dx * t, y = p[2] + dy * t,
            depth = algaeDisplay(p, sceneState.frame).thickness;
      if (Math.hypot(horizontalDelta(x - world.x), y - world.y) <= Math.max(depth, 3 / scale) &&
          !best)
        best = {kind : 'algae', item : p, key : 'algae:' + p[0], depth, radius : 3, x, y};
    }
  }
  if (best)
    return best;
  const bed = tankSedimentHit(world);
  if (bed)
    return bed;
  return tankSolidHit(world) || tankWaterHit(world);
}

export function tankSolidHit(world, f = sceneState.frame) {
  if (!f || world.x < 0 || world.x >= f.width || world.y < 0 || world.y >= f.height)
    return null;
  for (let k = 0; k < (f.obstacles?.length || 0); ++k) {
    const o = f.obstacles[k], shape = f.shapes?.[k],
          x = o[0] + ((world.x - o[0] + f.width / 2) % f.width + f.width) % f.width - f.width / 2;
    let inside = !shape?.length && Math.hypot(x - o[0], world.y - o[1]) <= o[2];
    if (shape?.length)
      for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
        const a = shape[j], b = shape[i];
        if ((a[1] > world.y) !== (b[1] > world.y) &&
            x < (b[0] - a[0]) * (world.y - a[1]) / (b[1] - a[1]) + a[0])
          inside = !inside;
      }
    if (inside) {
      const xs = shape?.map(p => p[0]), ys = shape?.map(p => p[1]);
      return {
        kind : 'rock',
        item : o,
        shape,
        key : 'rock:' + k,
        x : world.x,
        y : world.y,
        radius : 4,
        bounds : {
          width : xs?.length ? Math.max(...xs) - Math.min(...xs) : 2 * o[2],
          height : ys?.length ? Math.max(...ys) - Math.min(...ys) : 2 * o[2]
        }
      };
    }
  }
  return null;
}

export function tankWaterHit(world, f = sceneState.frame) {
  if (!f || world.x < 0 || world.x >= f.width || world.y < 0 || world.y >= f.height ||
      tankSolidHit(world, f))
    return null;
  const sample = grid => {
    if (!grid?.columns || !grid.rows)
      return {amount : 0, density : 0, cell : -1};
    const i = Math.floor(world.x / f.width * grid.columns),
          j = Math.floor(world.y / f.height * grid.rows), cell = j * grid.columns + i,
          amount = grid.amounts?.[cell] || 0;
    return {amount, density : amount * grid.columns * grid.rows / (f.width * f.height), cell};
  }, plankton = sample(f.plankton), sediment = sample(f.sediment);
  return {
    kind : 'water',
    item : [],
    key : 'water:' + plankton.cell + ':' + sediment.cell,
    odors : tankOdors(world, f),
    plankton : plankton.amount,
    planktonDensity : plankton.density,
    density : sediment.density * 64,
    radius : 4,
    x : world.x,
    y : world.y
  };
}

export function smallAnimalContains(p, x, y, tolerance) {
  const dx = horizontalDelta(x - p[0]), dy = y - p[1], a = p[11] || 0;
  const scale = bedScale(p[19] ?? .5), radius = p[6] * scale;
  if (p[7] !== 7) {
    const along = dx * Math.cos(a) + dy * Math.sin(a),
          across = -dx * Math.sin(a) + dy * Math.cos(a);
    return Math.hypot(along / (radius + tolerance), across / (radius + tolerance)) <= 1;
  }
  const length = p[13] || 0;
  if (length < .25)
    return Math.hypot(dx / (2.45 * radius + tolerance), dy / (.55 * radius + tolerance)) <= 1;
  const vx = -Math.sin(a) * length, vy = Math.cos(a) * length,
        t = Math.max(0, Math.min(1, (dx * vx + dy * vy) / Math.max(1e-9, length * length)));
  return Math.hypot(dx - t * vx, dy - t * vy) <= Math.max(radius, .6) + tolerance;
}

export function tankHit(pointer, select = false) {
  const local = canvasPoint({clientX : pointer.x, clientY : pointer.y});
  if (brainState.brainOpen && brainState.brainDrawing) {
    const cell = brainHit([ local.x, local.y ]);
    if (cell)
      return {
        kind : 'brain',
        cell,
        key : 'brain:' + (cell.id ?? cell.tissue) + ':' + cell.part,
        radius : 4
      };
  }
  const world = screenToWorld(local), scale = camera().scale;
  const f = sceneState.frame, candidates = [], bed = tankSedimentHit(world, f);
  for (const provider of tankHoverProviders) {
    if (select && !['fish', 'corpse', 'invertebrate'].includes(provider.kind))
      continue;
    for (const item of provider.items(f)) {
      const p = provider.pose(item), radius = provider.radius(p),
            dx = horizontalDelta(p[0] - world.x) * scale, dy = (p[1] - world.y) * scale,
            rx = Math.max(3, radius * scale),
            ry = Math.max(3, radius * scale * (provider.flatten || 1)),
            score = (dx / rx) ** 2 + (dy / ry) ** 2;
      if (provider.kind === 'fish' && bed)
        continue;
      if (!(provider.hit ? provider.hit(p, world.x, world.y, 3 / scale, scale) : score <= 1))
        continue;
      const hit = {
        kind : provider.kind,
        item,
        provider,
        key : provider.kind + ':' + provider.id(item),
        radius,
        x : world.x,
        y : world.y,
        score
      };
      hit.depth = hitDepth(hit, p);
      candidates.push(hit);
    }
  }
  const plant = tankVegetationHit(world, scale);
  if (plant?.kind === 'plant')
    candidates.push({...plant, depth : hitDepth(plant), score : 0});
  candidates.sort((a, b) => b.depth - a.depth || a.score - b.score);
  return candidates[0] || (select && !['plant', 'algae'].includes(plant?.kind) ? null : plant);
}
function hitDepth(hit, pose = hit.item) {
  const key = (hit.kind === 'invertebrate' ? 'animal' : hit.kind) + ':' +
              hit.item[hit.kind === 'plant'  ? 0
                       : hit.kind === 'fish' ? 4
                                             : 3],
        rank = tankState.pickingFrame === sceneState.frame ? tankState.pickingOrder?.get(key)
                                                           : undefined;
  if (rank !== undefined)
    return 1e6 + rank;
  return hit.kind === 'plant'          ? plantFoot(hit.item).y
         : hit.kind === 'invertebrate' ? animalFoot(pose).y
         : hit.kind === 'fish'         ? pose[1] + (pose[51] || 1)
                                       : -1e6;
}

function clearFishPreview() {
  if (!sceneState.tankPreviewFish)
    return;
  updateSceneState({tankPreviewFish : 0});
  if (sceneState.frame && evolutionState.activeView === 'fish') {
    showSelection(sceneState.frame);
    updateCockpit(sceneState.frame);
  }
}

export function tankHoverReady(key, now) {
  if (!hoverState.tankHoverKey && !hoverState.tankHoverSince)
    hoverState.tankHoverSince = now;
  hoverState.tankHoverKey = key;
  return hoverState.persistent || now - hoverState.tankHoverSince >= 180;
}

export function tankHoverUpdate(now = Date.now()) {
  if (!hoverState.tankPointer || now - hoverState.tankHoverLast < 50)
    return;
  hoverState.tankHoverLast = now;
  // The info panel sits fixed in the corner; without it there is no object info at all.
  if (!hoverState.persistent) {
    clearFishPreview();
    tankHideTooltip();
    return;
  }
  if (!sceneState.frame || sceneState.frame.turbo || evolutionState.editing ||
      brainState.brainProbeArmed) {
    tankHideTooltip();
    return;
  }
  // Clicking or dragging in the tank keeps the panel showing the last object.
  if (cameraState.drag)
    return;
  let hit;
  const locked = hoverState.menuHit;
  if (locked && locked.epoch === sceneState.frame.render_epoch) {
    const plant = locked.hit.kind === 'plant', idColumn = plant ? 0 : 3,
          item = (plant ? sceneState.frame.plants : sceneState.frame.invertebrates || [])
                     .find(p => p[idColumn] === locked.hit.item[idColumn]);
    if (item)
      hit = {...locked.hit, item};
    else
      hoverState.menuHit = null;
  }
  hit ||= tankHit(hoverState.tankPointer);
  if (!hit) {
    clearFishPreview();
    return;
  }
  if (!tankHoverReady(hit.key, now))
    return;
  if ((hit.kind === 'fish' || hit.kind === 'corpse') && !brainState.brainOpen &&
      evolutionState.activeView === 'fish') {
    const id = hit.kind === 'corpse' ? hit.item[CORPSE.source_id] : hit.item[4];
    if (sceneState.tankPreviewFish !== id) {
      updateSceneState({tankPreviewFish : id});
      showSelection(sceneState.frame);
      if (typeof updateCockpit === 'function')
        updateCockpit(sceneState.frame);
    }
  } else
    clearFishPreview();
  tankShowTooltip(hit.provider?.describe ? hit.provider.describe(hit, sceneState.frame)
                                         : tankObjectInfo(hit),
                  hit);
}

export function tankHoverMove(e) {
  hoverState.menuHit = null;
  if (e.pointerType === 'touch' || e.buttons || cameraState.drag) {
    hoverState.tankPointer = null;
    clearFishPreview();
    return;
  }
  const previous = hoverState.tankPointer;
  if (!previous || Math.hypot(e.clientX - previous.x, e.clientY - previous.y) >= 2)
    hoverState.tankHoverSince = Date.now();
  hoverState.tankPointer = {x : e.clientX, y : e.clientY};
  tankHoverUpdate();
}

export let tankPreviousLeave;

export function updateHoverState(patch) {
  Object.assign(hoverState, patch);
  return Object.values(patch)[0];
}

const initializers = {
  "tankPointer" : () => {
    // Aquarium objects share one hit test and one stable tooltip.
    hoverState.tankPointer = null;
    const toggle = el('keep-hover-info');
    // Shown by default; only an explicit choice switches it off.
    hoverState.persistent = true;
    try {
      hoverState.persistent = window.localStorage?.getItem('fish-infopanel') !== '0';
    } catch {
    }
    toggle.checked = hoverState.persistent;
    // The panel's ✕ minimises it to the ⓘ chip in the tank corner; both use the same switch.
    const chip = el('infopanel-chip'), choose = on => {
      toggle.checked = on;
      if (toggle.dispatchEvent)
        toggle.dispatchEvent(new Event('change', {bubbles : true}));
      else
        toggle.onchange();
    };
    chip.hidden = hoverState.persistent;
    chip.onclick = () => choose(true);
    el('tank-tooltip-close').onclick = () => choose(false);
    toggle.onchange = () => {
      hoverState.persistent = toggle.checked;
      chip.hidden = toggle.checked;
      try {
        window.localStorage?.setItem('fish-infopanel', toggle.checked ? '1' : '0');
      } catch {
      }
      if (!toggle.checked)
        tankHideTooltip();
      hoverState.tankHoverLast = 0;
      tankHoverUpdate();
    };
  },
  "tankHoverKey" : () => { hoverState.tankHoverKey = ''; },
  "tankHoverSince" : () => { hoverState.tankHoverSince = 0; },
  "tankHoverLast" : () => { hoverState.tankHoverLast = 0; },
  "tankTooltipRows" : () => { tankTooltipRows = []; },
  "createElement_div" : () => {
    bindScentWheel();
    for (let i = 0; i < 4; i++) {
      const box = document.createElement('div'), label = document.createElement('small'),
            value = document.createElement('strong');
      box.appendChild(label);
      box.appendChild(value);
      el('tank-tooltip-values').appendChild(box);
      tankTooltipRows.push({box, label, value});
    }
  },
  "tankHoverProviders" : () => {
    tankHoverProviders = [
      {
        kind : 'fish',
        items : f => f.fish,
        id : p => p[4],
        pose : p => blendFish(p),
        radius : p => fishRenderRadius(p),
        hit : fishBodyContains
      },
      {
        kind : 'corpse',
        items : f => f.corpses || [],
        id : p => p[7],
        pose : p => blendParticle(p, sceneState.previousCorpses, 7, frameBlend()),
        radius : p => p[9],
        flatten : .55,
        hit : corpseBodyContains
      },
      {
        kind : 'invertebrate',
        items : f => (f.invertebrates || []).filter(p => p[7] !== 6),
        id : p => p[3],
        pose : p => blendSmallAnimal(p),
        radius : p => p[6],
        hit : smallAnimalContains
      },
      {
        kind : 'food',
        items : f => f.food || [],
        id : p => p[3],
        pose : p => blendParticle(p, sceneState.previousFood, 3, frameBlend()),
        radius : p => foodDisplayRadius(p)
      },
      {
        kind : 'sperm',
        items : f => f.gametes || [],
        id : p => p[6],
        pose : p => p,
        radius : () => Math.hypot(sceneState.frame.width / sceneState.frame.plankton.columns,
                                  sceneState.frame.height / sceneState.frame.plankton.rows) *
                       .5
      }
    ];
  },
  "tankPreviousLeave" : () => { tankPreviousLeave = canvas.onpointerleave; },
  "onpointerleave" : () => {
    canvas.onpointerleave = e => {
      tankPreviousLeave?.(e);
      hoverState.tankPointer = null;
      clearFishPreview();
      if (!hoverState.persistent)
        tankHideTooltip();
    };
  },
  "addEventListener_blur" : () => {
    window.addEventListener?.('blur', () => {
      hoverState.tankPointer = null;
      clearFishPreview();
      tankHideTooltip(true);
    });
  },
  "addEventListener_keydown" : () => {
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        clearFishPreview();
        hoverState.tankPointer = null;
        tankHideTooltip();
      }
    });
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
