import {t, formatNumber} from './strings.js';
import {updateEvolutionState} from './evolution.js';
import {brainState, closeBrain} from './brain.js';
import {camera, cameraState, point} from './camera.js';
import {canvas, ctx, el, text, uiIcon} from './dom.js';
import {evolutionState, setView} from './evolution.js';
import {command, request, serverText} from './session.js';
import {horizontalDelta, sceneState, wrapScreenX} from './state.js';
import {drawToolPalettePreview} from './world_palette.js';
import {showWorld} from './world_parameters.js';
import {currentAt, currentValues, feederAt, selectCurrent, selectFeeder} from './world_sources.js';
import {paintFaunaPreview} from './particle_renderer.js';
import {drawPlantChoice, drawAnimalChoices} from './world_palette.js';
import {newRockShape, snapRock} from './rock_geometry.js';
import {plantCurveClear, plantWakeGeometry} from './plant_geometry.js';
export const worldState = {};

export function cancelWorldGesture() {
  worldState.worldDrag = worldState.worldCursor = null;
  worldState.polygonPoints = [];
  cameraState.drag = null;
  if (worldState.placingEggs)
    endEggPlacement();
}

export function beginEggPlacement(id) {
  if (!sceneState.frame || sceneState.frame.historical)
    return;
  setTool('inspect');
  cameraState.drag = null;
  worldState.placingEggs = id;
  canvas.style.cursor = 'crosshair';
  el('egg-placement').hidden = false;
  el('egg-placement-cancel').onclick = endEggPlacement;
  text('feedback', t('world.eierImAquariumPlatzieren'));
}

export function endEggPlacement() {
  worldState.placingEggs = null;
  el('egg-placement').hidden = true;
  canvas.style.cursor = 'grab';
  text('feedback', '');
}

export function eggPlacementPoints(p, count) {
  return Array.from({length : count}, (_, i) => {
    const r = i ? 6 * Math.sqrt(i) : 0;
    return {
      x : wrapScreenX(p.x + Math.cos(i * 2.399963229728653) * r),
      y : Math.max(3, Math.min((sceneState.frame?.height ?? Infinity) - 3,
                               p.y + Math.sin(i * 2.399963229728653) * r))
    };
  });
}

export function setTool(value) {
  if (value !== worldState.tool) {
    worldState.polygonPoints = [];
    worldState.worldDrag = null;
    cameraState.drag = null;
  }
  if (worldState.placingEggs)
    endEggPlacement();
  worldState.tool = value;
  document.querySelectorAll('[data-tool]').forEach(b => {
    b.classList.toggle('active', b.dataset.tool === value);
    b.setAttribute('aria-pressed', String(b.dataset.tool === value));
  });
  canvas.style.cursor = value === 'inspect' ? 'grab' : 'crosshair';
  toolSettings();
}

function placementSurfaces(f) {
  return [
    ...(f?.placement_surfaces || []), ...(f?.plants || [])
                                          .filter(q => !q[17]?.[2])
                                          .map(q => [q[1], q[2], q[3], q[4], q[5], q[6], q[15] || 0,
                                                     q[16] || 0, q[25] ?? 0, q[26] ?? 1])
  ];
}
function nearestPlacement(p, f, tool, surfaces = placementSurfaces(f)) {
  let best = null;
  const geometry = plantWakeGeometry(f);
  for (const s of surfaces) {
    const exposed = tool === 'algae' || tool === 'mussels';
    if (exposed ? s[9] <= s[8] : s[5] > -.5)
      continue;
    const dx = s[2] - s[0], dy = s[3] - s[1], length2 = dx * dx + dy * dy;
    if (length2 < 1e-9)
      continue;
    const t = Math.max(exposed ? s[8] : 0,
                       Math.min(exposed ? s[9] : 1,
                                (horizontalDelta(p.x - s[0]) * dx + (p.y - s[1]) * dy) / length2));
    const depth = s[6] * (1 - t) + s[7] * t;
    if ((tool === 'grass' && depth < .5) ||
        (tool === 'worms' && depth <= (f.parameters?.burrow_depth ?? 2)))
      continue;
    const x = s[0] + t * dx, y = s[1] + t * dy;
    if (!exposed) {
      const rx = x + s[4] * Math.max(.5, depth * .5), ry = y + s[5] * Math.max(.5, depth * .5),
            top = ry - depth * .5 / Math.max(.5, -s[5]) - (tool === 'grass' ? 16 : 10);
      if (!plantCurveClear(f, [ rx, ry, rx, ry, rx, top, rx, top ], .15, 1, geometry))
        continue;
    }
    const distance = Math.hypot(horizontalDelta(x - p.x), y - p.y);
    if (!best || distance < best.distance)
      best = {x, y, t, s, depth, distance};
  }
  return best;
}
function insideWorld(p) {
  const f = sceneState.frame;
  return f && !f.historical && Number.isFinite(p.x) && Number.isFinite(p.y) && p.y >= 0 &&
         p.y < f.height;
}

export function animalPlacement(p, f = sceneState.frame, selectedTool = worldState.tool,
                                count = Number(el('tool-count').value)) {
  const map = {mussels : 9, worms : 7, crabs : 8}, kind = map[selectedTool],
        radius = Number(el('brush').value),
        requestedMorph = Math.min(worldState.animalFamily ?? 0, kind === 9 ? 6 : 3) + .5,
        parameters = f.parameters || {}, rows = [], surfaces = placementSurfaces(f);
  for (let k = 0; k < Math.min(20, count); k++) {
    const scatter = k ? radius * .4 * Math.sqrt(k / Math.max(1, count - 1)) : 0,
          qx = p.x + Math.cos(k * 2.4) * scatter, qy = p.y + Math.sin(k * 2.4) * scatter * .25;
    const best = nearestPlacement({x : qx, y : qy}, f, selectedTool, surfaces);
    if (!best)
      continue;
    const morph = Math.floor(requestedMorph) +
                  ((requestedMorph - Math.floor(requestedMorph) + k * .61803398875) % .999);
    const id = (f.fauna_next_id || 1) + k, individual = (id * 37 % 101) / 100;
    const {s, t} = best, depth = s[6] * (1 - t) + s[7] * t,
              energy = kind === 9   ? (parameters.mussel_birth_energy ?? 4) * 4
                       : kind === 8 ? (parameters.crab_birth_energy ?? 10) * 2
                                    : (parameters.worm_head_energy ?? 8) * 4,
              family = Math.floor(morph), v = morph - family,
              size = kind === 9 ? [ .85, 1.15, 1, .75, 1.05, 1.2, .6 ][family] * (.65 + .7 * v)
                                : [ .82, 1.15, .9, 1 ][family] * (.75 + .5 * v),
              capacity = kind === 9 ? (parameters.mussel_energy ?? 100) * size * size
                                    : (parameters.crab_energy ?? 480) * size * size,
              r = kind === 9   ? 6.1875 * size * (1 + Math.min(1, energy / capacity))
                  : kind === 8 ? size * (5.625 + 3.75 * Math.min(1, energy / (.5 * capacity)))
                               : .72,
              lift = kind === 9   ? .62 * r
                     : kind === 8 ? depth <= .01 ? 1.025 * r
                                                 : Math.max(depth * (.2 + .6 * v), .82 * r,
                                                            1.23 * r / (1 + .41 * r / depth))
                                  : depth * (1 - (.2 + .6 * individual)),
              length =
                  kind === 7
                      ? (.8 * (6 + 19 * individual * individual) *
                         (family === 0   ? .75
                          : family === 2 ? 1.25
                                         : 1)) *
                            Math.max(0, Math.min(1, (depth - (parameters.burrow_depth ?? 2)) / 8))
                      : 0,
              x = best.x + s[4] * lift,
              y = best.y + s[5] * lift -
                  (kind === 7 ? depth * (.2 + .6 * individual) / Math.max(.5, -s[5]) + length : 0),
              angle = kind === 7 ? 0 : Math.atan2(s[4], -s[5]);
    rows.push([
      x,      y,
      energy, id,
      0,      0,
      r,      kind,
      .5,     .4,
      .3,     angle,
      0,      length,
      morph,  kind === 8 ? 1 : 0,
      1,      kind === 8 ? 1 : 0,
      1,      .5,
      length, 0,
      x,      y,
      6,      0
    ]);
    if (kind === 7) {
      const burial = depth * (.2 + .6 * individual), vertical = burial / Math.max(.5, -s[5]),
            row = rows.at(-1);
      row[13] = vertical + length;
      row[15] = Math.atan2(s[4], -s[5]);
      row[18] = Math.max(-1, Math.min(1, 1 - 2 * vertical / Math.max(.001, vertical + length)));
      row[19] = .2 + .6 * individual;
      row[20] = .8 * (6 + 19 * individual * individual) *
                (family === 0   ? .75
                 : family === 2 ? 1.25
                                : 1);
    }
    rows.at(-1).anchor = best;
  }
  return rows;
}
export function plantPlacement(p, f = sceneState.frame, selectedTool = worldState.tool) {
  const best = nearestPlacement(p, f, selectedTool);
  if (!best)
    return null;
  const lift = selectedTool === 'grass' ? best.depth * .5 : 0;
  return {
    ...best,
    anchorX : best.x,
    anchorY : best.y,
    x : best.x + best.s[4] * lift,
    y : best.y + best.s[5] * lift
  };
}

export function applyTool(p) {
  if (!insideWorld(p))
    return;
  if ([ 'grass', 'algae' ].includes(worldState.tool)) {
    const site = plantPlacement(p);
    if (!site) {
      text('feedback', t('world.keineGeeigneteFlaeche'));
      return;
    }
    p = {x : site.anchorX, y : site.anchorY};
  }
  const radius = Number(el('brush').value), count = Number(el('tool-count').value);
  if ([ 'mussels', 'worms', 'crabs' ].includes(worldState.tool))
    command(worldState.tool, {
      ...p,
      radius,
      count : Math.min(20, count),
      morph : Math.min(worldState.animalFamily ?? 0, worldState.tool === 'mussels' ? 6 : 3) + .5
    });
  else if (worldState.tool === 'feed' || worldState.tool === 'clean')
    command(worldState.tool === 'feed' ? 'spray' : 'remove-food', {...p, count, radius});
  else if ([ 'grass', 'algae', 'remove-plants', 'sediment', 'remove-sediment' ].includes(
               worldState.tool))
    command(worldState.tool, {
      ...p,
      radius,
      plant : worldState.editorPlant,
      amount : Number(el('sediment-amount').value)
    });
  else if (worldState.tool === 'rock') {
    if (worldState.rockPending)
      return;
    worldState.rockPending = true;
    return command('polygon', {points : rockPlacement(p)}).then(ok => {
      worldState.rockPending = false;
      if (ok)
        varyRock();
      return ok;
    });
  } else if (worldState.tool === 'feeder')
    command(
        'feeder',
        {...p, radius : Number(el('feeder-width').value), rate : Number(el('feeder-rate').value)});
  else if (worldState.tool === 'erase')
    command('erase', p);
}

function geometryPoint(e) {
  const r = canvas.getBoundingClientRect(), c = camera();
  return {
    x : ((e.clientX - r.left) / r.width * cameraState.viewportWidth - c.ox) / c.scale,
    y : ((e.clientY - r.top) / r.height * cameraState.viewportHeight - c.oy) / c.scale
  };
}

function editorPoint(e) {
  return [ 'wall', 'rock', 'move', 'polygon' ].includes(worldState.tool) ? geometryPoint(e)
                                                                         : point(e);
}

export let tankDown;

export let tankMove;

export let tankUp;

export let tankCancel;

export function toolSettings() {
  el('rock-settings').hidden = worldState.tool !== 'rock';
  el('plant-palette').hidden = worldState.tool !== 'grass';
  el('animal-palette').hidden = !['mussels', 'worms', 'crabs'].includes(worldState.tool);
  drawAnimalChoices();
  el('sediment-amount-setting').hidden = worldState.tool !== 'sediment';
  text('tool-heading', toolNames[worldState.tool] || t('world.werkzeug'));
  el('tool-symbol').innerHTML = uiIcon(worldState.tool);
  drawToolPalettePreview();
  const fields = {
    brush : [
      'rock', 'feed', 'clean', 'grass', 'algae', 'remove-plants', 'sediment', 'remove-sediment',
      'mussels', 'worms', 'crabs'
    ],
    'wall-width' : [ 'wall', 'planter' ],
    'tool-count' : [ 'feed', 'mussels', 'worms', 'crabs' ],
    'feeder-rate' : [ 'feeder' ],
    'feeder-width' : [ 'feeder' ],
    'current-angle' : [ 'current' ],
    'current-width' : [ 'current' ],
    'current-strength' : [ 'current' ]
  };
  for (const [id, tools] of Object.entries(fields))
    el(id).parentElement.hidden = !tools.includes(worldState.tool);
  el('feeder-list').hidden = worldState.tool !== 'feeder';
  el('current-list').hidden = worldState.tool !== 'current';
  el('undo-geometry').disabled =
      !evolutionState.editing || !!sceneState.frame?.historical || !sceneState.frame?.can_undo;
  const lo = worldState.tool === 'rock' ? 8 : 1;
  el('brush').min = String(lo);
  if (Number(el('brush').value) < lo)
    el('brush').value = String(lo);
  el('brush').max = worldState.tool === 'feed' ? '100' : '120';
  const maximum = [ 'mussels', 'worms', 'crabs' ].includes(worldState.tool) ? 20 : 50;
  el('tool-count').max = String(maximum);
  if (Number(el('tool-count').value) > maximum)
    el('tool-count').value = String(maximum);
  text('tool-count-value', el('tool-count').value);
}

function finishPolygon() {
  if (worldState.polygonPoints.length >= 3)
    command('polygon', {points : worldState.polygonPoints});
  worldState.polygonPoints = [];
}

export function planterPoints(a, b, width) {
  const right = a.x + horizontalDelta(b.x - a.x), left = Math.min(a.x, right),
        end = Math.max(a.x, right), floor = a.y, rim = Math.max(8, Math.min(24, width)),
        wall = Math.min(width, (end - left) / 4);
  if (end - left < 4 * width)
    return [];
  return [
    [ left, floor - rim ], [ left + wall, floor - rim ], [ left + wall, floor ],
    [ end - wall, floor ], [ end - wall, floor - rim ], [ end, floor - rim ],
    [ end, floor + width ], [ left, floor + width ]
  ].map(([ x, y ]) => ({x, y}));
}

function varyRock() {
  worldState.rockShape = newRockShape();
  worldState.rockPlacement = null;
  drawToolPalettePreview();
}

export function rockPlacement(p, f = sceneState.frame) {
  const radius = Number(el('brush').value), snap = el('rock-snap').checked,
        old = worldState.rockPlacement;
  if (old && old.x === p.x && old.y === p.y && old.radius === radius && old.snap === snap &&
      old.shapes === f.shapes && old.obstacles === f.obstacles && old.width === f.width &&
      old.height === f.height)
    return old.points;
  worldState.rockShape ??= newRockShape();
  let points = worldState.rockShape.map(v => ({x : p.x + radius * v.x, y : p.y + radius * v.y}));
  if (snap)
    points = snapRock(points, f);
  worldState.rockPlacement = {
    ...p,
    radius,
    snap,
    points,
    shapes : f.shapes,
    obstacles : f.obstacles,
    width : f.width,
    height : f.height
  };
  return points;
}

export function drawToolPreview(f, c) {
  if (!worldState.worldCursor)
    return;
  if (worldState.placingEggs) {
    const count =
        Math.max(1, Math.min(50, Math.trunc(Number(el('egg-placement-count').value)) || 1));
    ctx.save();
    for (const p of eggPlacementPoints(worldState.worldCursor, count)) {
      const x = p.x * c.scale + c.ox, y = p.y * c.scale + c.oy, r = Math.max(3, 2.4 * c.scale);
      ctx.fillStyle = '#cfbb7790';
      ctx.strokeStyle = '#fff0c8';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 1.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#66583d';
      ctx.beginPath();
      ctx.ellipse(x + r * .1, y, r * .36, r * .56, -.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  if (worldState.tool === 'inspect')
    return;
  const unavailable = () => {
    const px = worldState.worldCursor.x * c.scale + c.ox,
          py = worldState.worldCursor.y * c.scale + c.oy;
    ctx.save();
    ctx.strokeStyle = '#ca9e88';
    ctx.lineWidth = 2;
    ctx.setLineDash([ 4, 4 ]);
    ctx.beginPath();
    ctx.arc(px, py, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(px - 7, py + 7);
    ctx.lineTo(px + 7, py - 7);
    ctx.stroke();
    ctx.restore();
  };
  const center = (cameraState.viewportWidth / 2 - c.ox) / c.scale,
        shift = worldState.tool === 'current'
                    ? center +
                          horizontalDelta(
                              (worldState.worldDrag?.start || worldState.worldCursor).x - center) -
                          (worldState.worldDrag?.start || worldState.worldCursor).x
                    : 0,
        x = v => (v + shift) * c.scale + c.ox, y = v => v * c.scale + c.oy;
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#e9c185';
  ctx.fillStyle = '#e9c18514';
  ctx.lineWidth = 1.5;
  if ([ 'mussels', 'worms', 'crabs' ].includes(worldState.tool)) {
    const rows = animalPlacement(worldState.worldCursor, f);
    if (!rows.length)
      unavailable();
    else
      paintFaunaPreview(f, c, rows);
    if (rows[0]) {
      const q = rows[0].anchor;
      ctx.setLineDash([ 3, 4 ]);
      ctx.beginPath();
      ctx.moveTo(x(worldState.worldCursor.x), y(worldState.worldCursor.y));
      ctx.lineTo(x(q.x), y(q.y));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    return;
  }
  if ([ 'grass', 'algae' ].includes(worldState.tool)) {
    const site = plantPlacement(worldState.worldCursor, f);
    if (site) {
      ctx.setLineDash([ 3, 4 ]);
      ctx.beginPath();
      ctx.moveTo(x(worldState.worldCursor.x), y(worldState.worldCursor.y));
      ctx.lineTo(x(site.x), y(site.y));
      ctx.stroke();
      ctx.setLineDash([]);
      if (worldState.tool === 'grass') {
        ctx.save();
        ctx.translate(x(site.x), y(site.y));
        drawPlantChoice(ctx, worldState.editorPlant ?? 0, 0, 0, Math.max(.55, c.scale * .55));
        ctx.restore();
      } else {
        ctx.strokeStyle = '#6e995a';
        ctx.lineWidth = Math.max(4, c.scale * 2);
        ctx.lineCap = 'round';
        ctx.beginPath();
        const s = site.s, dx = s[2] - s[0], dy = s[3] - s[1], length = Math.hypot(dx, dy),
              radius = Number(el('brush').value) / Math.max(.001, length),
              start = Math.max(s[8], site.t - radius), end = Math.min(s[9], site.t + radius);
        ctx.moveTo(x(s[0] + dx * start), y(s[1] + dy * start));
        ctx.lineTo(x(s[0] + dx * end), y(s[1] + dy * end));
        ctx.stroke();
      }
    } else
      unavailable();
    return;
  }
  if (worldState.tool === 'rock') {
    const points = rockPlacement(worldState.worldCursor, f);
    ctx.fillStyle = '#435965b0';
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(x(p.x), y(p.y)) : ctx.moveTo(x(p.x), y(p.y)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    return;
  }
  if (worldState.tool === 'polygon') {
    const points = [...worldState.polygonPoints, worldState.worldCursor ];
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(x(p.x), y(p.y)) : ctx.moveTo(x(p.x), y(p.y)));
    ctx.stroke();
    if (worldState.polygonPoints.length) {
      ctx.beginPath();
      ctx.arc(x(worldState.polygonPoints[0].x), y(worldState.polygonPoints[0].y), 5, 0,
              2 * Math.PI);
      ctx.stroke();
    }
    return;
  }
  if (worldState.tool === 'current') {
    const start = worldState.worldDrag?.start || worldState.worldCursor, values = currentValues(),
          angle = worldState.worldDrag && Math.hypot(worldState.worldCursor.x - start.x,
                                                     worldState.worldCursor.y - start.y) > 5
                      ? Math.atan2(worldState.worldCursor.y - start.y,
                                   horizontalDelta(worldState.worldCursor.x - start.x))
                      : values.angle;
    ctx.beginPath();
    ctx.arc(x(start.x), y(start.y), values.width / 2 * c.scale, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x(start.x), y(start.y));
    const length = Math.max(30, values.width * .35),
          tip = {x : start.x + length * Math.cos(angle), y : start.y + length * Math.sin(angle)};
    ctx.lineTo(x(tip.x), y(tip.y));
    for (const side of [-1, 1]) {
      ctx.moveTo(x(tip.x - 10 * Math.cos(angle + side * .5)),
                 y(tip.y - 10 * Math.sin(angle + side * .5)));
      ctx.lineTo(x(tip.x), y(tip.y));
    }
    ctx.stroke();
    ctx.font = '12px system-ui';
    ctx.fillStyle = '#e9c185';
    ctx.fillText(t('world.sourceSize', {
                   radius : Math.round(values.width / 2),
                   strength : formatNumber(values.strength, 1, true)
                 }),
                 x(start.x) + 8, y(start.y) - 10);
  } else if (worldState.tool === 'planter' && worldState.worldDrag) {
    const points = planterPoints(worldState.worldDrag.start, worldState.worldCursor,
                                 Number(el('wall-width').value));
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(x(p.x), y(p.y)) : ctx.moveTo(x(p.x), y(p.y)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (worldState.tool === 'wall' && worldState.worldDrag) {
    ctx.lineWidth = Number(el('wall-width').value) * c.scale;
    ctx.beginPath();
    ctx.moveTo(x(worldState.worldDrag.start.x), y(worldState.worldDrag.start.y));
    ctx.lineTo(x(worldState.worldCursor.x), y(worldState.worldCursor.y));
    ctx.stroke();
  } else {
    const radius =
        worldState.tool === 'feeder' ? Number(el('feeder-width').value) : Number(el('brush').value);
    ctx.beginPath();
    ctx.arc(x(worldState.worldCursor.x), y(worldState.worldCursor.y), radius * c.scale, 0,
            2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.font = '12px system-ui';
    ctx.fillStyle = '#e9c185';
    ctx.fillText(worldState.tool === 'feed' ? t('world.foodCount', {n : el('tool-count').value})
                                            : '',
                 x(worldState.worldCursor.x) + radius * c.scale + 6, y(worldState.worldCursor.y));
  }
}

export let tankWheel;

export let toolNames;

export function updateWorldState(patch) {
  Object.assign(worldState, patch);
  return Object.values(patch)[0];
}

export function bindGenomeImport() {
  const button = el('import-genome'), input = el('genome-file');
  button.onclick = () => input.click();
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file || sceneState.frame?.historical)
      return;
    button.disabled = true;
    try {
      if (file.size > 1000000)
        throw Error(t('world.derBauplanUeberschreitet1'));
      const genome = await file.text();
      const response = await request('/command', {
        method : 'POST',
        headers : {'Content-Type' : 'application/json', 'X-Fish-Token' : window.FISH_TOKEN},
        body : JSON.stringify({command : 'population-import', name : file.name, genome})
      },
                                     30000),
            result = await response.json();
      if (!response.ok)
        throw Error(serverText(result.error));
      beginEggPlacement({saved : result.message.replace(/^archive:/, '')});
    } catch (error) {
      text('error', error.message);
    } finally {
      input.value = '';
      button.disabled = !!sceneState.frame?.historical;
    }
  };
}

const initializers = {
  "editorPlant" : () => { worldState.editorPlant = -1; },
  "polygonPoints" : () => { worldState.polygonPoints = []; },
  "rockControls" : () => {
    worldState.rockShape = newRockShape();
    worldState.rockPlacement = null;
    worldState.rockPending = false;
    el('rock-variation').onclick = varyRock;
  },
  "tool" : () => { worldState.tool = 'inspect'; },
  "worldDrag" : () => { worldState.worldDrag = null; },
  "worldCursor" : () => { worldState.worldCursor = null; },
  "lastPaint" : () => { worldState.lastPaint = 0; },
  "parameterInputs" : () => { worldState.parameterInputs = new Map(); },
  "parametersBuilt" : () => { worldState.parametersBuilt = ''; },
  "currentSelection" : () => { worldState.currentSelection = -1; },
  "currentSignature" : () => { worldState.currentSignature = ''; },
  "feederSelection" : () => { worldState.feederSelection = -1; },
  "feederSignature" : () => { worldState.feederSignature = ''; },
  "querySelectorAll_data_tool_forEach" : () => {
    document.querySelectorAll('[data-tool]').forEach(b => {
      b.setAttribute('aria-label', toolNames[b.dataset.tool] || b.textContent || b.dataset.tool);
      b.innerHTML = uiIcon(b.dataset.tool);
      if (b.dataset.tool === 'polygon')
        b.title = t('world.eckenSetzenEnterSchliesst');
      if (b.dataset.tool === 'planter')
        b.title = t('world.waagrechtZiehenDanachSediment');
      if (b.dataset.tool === 'grass')
        b.title = t('world.pflanzenBrauchenSedimentUnd');
      if (b.dataset.tool === 'algae')
        b.title = t('world.algenBrauchenLichtUnd');
      b.onclick = () => setTool(b.dataset.tool);
    });
  },
  "undo_geometry_innerHTML" : () => {
    el('undo-geometry').setAttribute('aria-label', t('world.geometrieRueckgaengigMachen'));
    el('undo-geometry').innerHTML = uiIcon('undo');
  },
  "edit_world_onclick" : () => {
    el('edit-world').onclick = async () => {
      if (brainState.brainOpen)
        await closeBrain();
      updateEvolutionState({editing : !evolutionState.editing});
      el('edit-world').setAttribute('aria-pressed', String(evolutionState.editing));
      text('edit-world',
           evolutionState.editing ? t('world.zurBeobachtung') : t('world.weltBearbeiten'));
      toolSettings();
      el('observations').hidden = evolutionState.editing;
      el('view-world').hidden = !evolutionState.editing;
      el('controls').hidden = evolutionState.editing;
      el('tools').hidden = !evolutionState.editing;
      setView(evolutionState.activeView);
      setTool('inspect');
      if (evolutionState.editing && sceneState.frame)
        showWorld(sceneState.frame);
    };
  },
  "tankDown" : () => { tankDown = canvas.onpointerdown; },
  "tankMove" : () => { tankMove = canvas.onpointermove; },
  "tankUp" : () => { tankUp = canvas.onpointerup; },
  "tankCancel" : () => { tankCancel = canvas.onpointercancel; },
  "onpointerdown" : () => {
    canvas.onpointerdown = e => {
      if (worldState.placingEggs && e.button === 0) {
        const p = point(e), id = worldState.placingEggs;
        if (!insideWorld(p) || worldState.eggPending)
          return;
        worldState.eggPending = true;
        cameraState.drag = null;
        const count =
            Math.max(1, Math.min(50, Math.trunc(Number(el('egg-placement-count').value)) || 1));
        const placed =
            typeof id === 'object'
                ? command('saved-eggs', {...p, id : id.saved, count})
                : command('select', {value : id}).then(ok => ok && command('eggs', {...p, count}));
        return placed
            .then(ok => {
              if (ok && worldState.placingEggs === id)
                endEggPlacement();
            })
            .finally(() => { worldState.eggPending = false; });
      }
      if (!evolutionState.editing || worldState.tool === 'inspect' || e.button === 1) {
        tankDown(e);
        return;
      }
      if (!sceneState.frame || sceneState.frame.historical || e.button !== 0)
        return;
      const p = editorPoint(e);
      if (!['wall', 'rock', 'move', 'polygon'].includes(worldState.tool) &&
          (p.x < 0 || p.y < 0 || p.x >= sceneState.frame.width || p.y >= sceneState.frame.height))
        return;
      if (worldState.tool === 'polygon') {
        if (worldState.polygonPoints.length >= 3 &&
            Math.hypot(p.x - worldState.polygonPoints[0].x, p.y - worldState.polygonPoints[0].y) <
                10 / camera().scale) {
          finishPolygon();
          return;
        }
        if (worldState.polygonPoints.length < 32)
          worldState.polygonPoints.push(p);
        return;
      }
      const drag = {
        start : p,
        angle : 0,
        current : worldState.tool === 'move' ? currentAt(p) : -1,
        feeder : worldState.tool === 'move' ? feederAt(p) : -1
      };
      if (worldState.tool === 'current') {
        worldState.currentSelection = currentAt(p);
        if (worldState.currentSelection >= 0)
          selectCurrent(worldState.currentSelection);
      }
      if (worldState.tool === 'feeder') {
        worldState.feederSelection = feederAt(p);
        if (worldState.feederSelection >= 0)
          selectFeeder(worldState.feederSelection);
      }
      worldState.worldDrag = drag;
      worldState.worldCursor = p;
      canvas.setPointerCapture?.(e.pointerId);
      if (!['wall', 'planter', 'move', 'current', 'feeder'].includes(worldState.tool)) {
        applyTool(p);
        worldState.lastPaint = Date.now();
      }
    };
  },
  "onpointermove" : () => {
    canvas.onpointermove = e => {
      if ((evolutionState.editing || worldState.placingEggs) && sceneState.frame)
        worldState.worldCursor = editorPoint(e);
      if (!worldState.worldDrag) {
        tankMove(e);
        return;
      }
      worldState.worldCursor = editorPoint(e);
      if (!evolutionState.editing || !insideWorld(worldState.worldCursor)) {
        worldState.worldDrag = null;
        return;
      }
      if ([
            'feed', 'clean', 'grass', 'algae', 'remove-plants', 'sediment', 'remove-sediment'
          ].includes(worldState.tool) &&
          Date.now() - worldState.lastPaint > 150) {
        applyTool(worldState.worldCursor);
        worldState.lastPaint = Date.now();
      }
    };
  },
  "onpointerup" : () => {
    canvas.onpointerup = e => {
      if (worldState.placingEggs || worldState.eggPending)
        return;
      if (!worldState.worldDrag) {
        tankUp(e);
        return;
      }
      if (!evolutionState.editing || !sceneState.frame || sceneState.frame.historical) {
        worldState.worldDrag = null;
        return;
      }
      if (Number.isFinite(e.clientX))
        worldState.worldCursor = editorPoint(e);
      if (worldState.tool === 'planter') {
        const points = planterPoints(worldState.worldDrag.start, worldState.worldCursor,
                                     Number(el('wall-width').value));
        if (points.length)
          command('polygon', {points});
      }
      if (worldState.tool === 'wall')
        command('wall', {
          ...worldState.worldDrag.start,
          tx : worldState.worldCursor.x,
          ty : worldState.worldCursor.y,
          width : Number(el('wall-width').value)
        });
      if (worldState.tool === 'move') {
        const q = sceneState.frame.currents?.[worldState.worldDrag.current];
        if (q)
          command('current-source', {
            index : worldState.worldDrag.current,
            x : wrapScreenX(worldState.worldCursor.x),
            y : worldState.worldCursor.y,
            angle : q[2] + worldState.worldDrag.angle,
            width : q[3],
            strength : q[4]
          });
        else if (worldState.worldDrag.feeder >= 0) {
          const source = sceneState.frame.feeders?.[worldState.worldDrag.feeder];
          if (!source) {
            worldState.worldDrag = null;
            return;
          }
          command('feeder', {
            index : worldState.worldDrag.feeder,
            x : wrapScreenX(worldState.worldCursor.x),
            y : worldState.worldCursor.y,
            radius : source[2],
            rate : source[3]
          });
        } else if (worldState.worldDrag.current < 0)
          command('move-obstacle', {
            ...worldState.worldDrag.start,
            tx : worldState.worldCursor.x,
            ty : worldState.worldCursor.y,
            angle : worldState.worldDrag.angle
          });
      }
      if (worldState.tool === 'feeder' && worldState.feederSelection < 0)
        applyTool(worldState.worldDrag.start);
      if (worldState.tool === 'current') {
        const q = sceneState.frame.currents?.[worldState.currentSelection],
              values = currentValues(),
              distance = Math.hypot(
                  horizontalDelta(worldState.worldCursor.x - worldState.worldDrag.start.x),
                  worldState.worldCursor.y - worldState.worldDrag.start.y);
        if (distance > 5)
          values.angle =
              Math.atan2(worldState.worldCursor.y - worldState.worldDrag.start.y,
                         horizontalDelta(worldState.worldCursor.x - worldState.worldDrag.start.x));
        command('current-source', {
          index : worldState.currentSelection,
          x : q?.[0] ?? worldState.worldDrag.start.x,
          y : q?.[1] ?? worldState.worldDrag.start.y,
          ...values
        });
      }
      worldState.worldDrag = null;
    };
  },
  "onpointercancel" : () => {
    canvas.onpointercancel = () => {
      worldState.worldDrag = worldState.worldCursor = null;
      tankCancel();
    };
  },
  "addEventListener_keydown" : () => {
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && worldState.placingEggs) {
        endEggPlacement();
      }
      if (e.key?.toLowerCase() === 'r' && worldState.worldDrag && worldState.tool === 'move' &&
          !['INPUT', 'SELECT'].includes(e.target.tagName))
        worldState.worldDrag.angle =
            Math.atan2(Math.sin(worldState.worldDrag.angle + Math.PI / 12),
                       Math.cos(worldState.worldDrag.angle + Math.PI / 12));
    });
  },
  "addEventListener_keydown_additional_2" : () => {
    document.addEventListener('keydown', e => {
      if (!evolutionState.editing || worldState.tool !== 'polygon' ||
          [ 'INPUT', 'SELECT' ].includes(e.target.tagName))
        return;
      if (e.key === 'Enter')
        finishPolygon();
      else if (e.key === 'Escape')
        worldState.polygonPoints = [];
    });
  },
  "tankWheel" : () => { tankWheel = canvas.onwheel; },
  "onwheel" : () => {
    canvas.onwheel = e => {
      if (!evolutionState.editing || worldState.tool !== 'current')
        return tankWheel(e);
      e.preventDefault();
      const id = e.shiftKey ? 'current-strength' : 'current-width', input = el(id),
            step = e.shiftKey ? .1 : 8, value = Number(input.value) + (e.deltaY < 0 ? step : -step);
      input.value = String(
          Math.round(Math.max(Number(input.min), Math.min(Number(input.max), value)) * 10) / 10);
      if (!worldState.worldDrag && worldState.currentSelection >= 0)
        input.onchange();
    };
  },
  "toolNames" : () => {
    toolNames = {
      inspect : t('world.auswaehlen'),
      wall : t('world.wand'),
      planter : t('world.pflanzbecken'),
      rock : t('world.stein'),
      polygon : t('world.polygon'),
      grass : t('world.pflanzen'),
      algae : t('world.algenbelag'),
      sediment : t('world.sediment'),
      'remove-plants' : t('world.bewuchsEntfernen'),
      'remove-sediment' : t('world.sedimentEntfernen'),
      current : t('world.stroemung'),
      feeder : t('world.futterquelle'),
      feed : t('world.futter'),
      clean : t('world.futterEntfernen'),
      mussels : t('world.muscheln'),
      worms : t('world.wuermer'),
      crabs : t('world.krabben'),
      move : t('world.verschieben'),
      erase : t('world.entfernen')
    };
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
