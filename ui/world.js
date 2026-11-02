import {KEY} from './keys.js';
import {t, formatNumber} from './strings.js';
import {updateEvolutionState} from './evolution.js';
import {brainState, closeBrain} from './brain.js';
import {camera, cameraState, point} from './camera.js';
import {canvas, ctx, el, text, uiIcon} from './dom.js';
import {evolutionState, setView} from './evolution.js';
import {command, importGenome} from './session.js';
import {horizontalDelta, sceneState, wrapScreenX} from './state.js';
import {ANIMAL_TOOLS, drawToolPalettePreview, MIXED_PLANTS} from './world_palette.js';
import {showWorld} from './world_parameters.js';
import {currentAt, currentValues, feederAt, selectCurrent, selectFeeder} from './world_sources.js';
import {paintFaunaPreview} from './particle_renderer.js';
import {drawPlantChoice, drawAnimalChoices} from './world_palette.js';
import {newRockShape, snapRock} from './rock_geometry.js';
import {plantCurveClear, plantWakeGeometry} from './plant_geometry.js';
import {
  CRAB_STATE,
  FAUNA,
  FOOD_KIND,
  INVERTEBRATE,
  INVERTEBRATE_KIND,
  PLACEMENT,
  PLACEMENT_SURFACE,
  PLANT,
  PLANT_ROOT,
  SEABED,
  POPULATION_LIMITS,
  SOURCE_LIMITS,
  TANK,
  TOLERANCE,
  WATER_SETTING,
  CURRENT,
  FEEDER
} from './schema.js';
import {
  burialShare,
  crabRadius,
  crabSupportHeight,
  familyCount,
  familyMorph,
  morphVariant,
  musselRadius,
  smallAnimalColor,
  wormIndividuality,
  wormLength
} from './fauna.js';
// Requested families are placed with their middle variant; bare surfaces hold their front midway.
const MIDDLE_VARIANT = .5, BARE_FRONT = .5;
export const worldState = {};
// One placement adds at most ANIMALS small animals, or OTHER food pieces; brushes paint at most
// every PAINT_MS; R turns a dragged object by ROTATE.
const TOOL_COUNT = Object.freeze({animals : 20, other : 50, paint_ms : 150, rotate : Math.PI / 12});

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
    const r = i ? PLACEMENT.egg_spacing * Math.sqrt(i) : 0, gap = PLACEMENT.egg_edge_gap;
    return {
      x : wrapScreenX(p.x + Math.cos(i * PLACEMENT.golden_angle) * r),
      y : Math.max(gap, Math.min((sceneState.frame?.height ?? Infinity) - gap,
                                 p.y + Math.sin(i * PLACEMENT.golden_angle) * r))
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
  const S = PLACEMENT_SURFACE, fromPlant = q => {
    const row = new Array(S.count);
    for (const name of ['ax', 'ay', 'bx', 'by', 'nx', 'ny'])
      row[S[name]] = q[PLANT[name]];
    row[S.sediment_left] = q[PLANT.sediment_left] || 0;
    row[S.sediment_right] = q[PLANT.sediment_right] || 0;
    row[S.algae_start] = q[PLANT.algae_start] ?? 0;
    row[S.algae_end] = q[PLANT.algae_end] ?? 1;
    return row;
  };
  return [
    ...(f?.placement_surfaces || []),
    ...(f?.plants || []).filter(q => !q[PLANT.root]?.[PLANT_ROOT.drift_age]).map(fromPlant)
  ];
}
function nearestPlacement(p, f, tool, surfaces = placementSurfaces(f)) {
  let best = null;
  const geometry = plantWakeGeometry(f), S = PLACEMENT_SURFACE;
  for (const s of surfaces) {
    const exposed = tool === 'algae' || tool === 'mussels';
    if (exposed ? s[S.algae_end] <= s[S.algae_start] : s[S.ny] > -SEABED.floor_normal)
      continue;
    const dx = s[S.bx] - s[S.ax], dy = s[S.by] - s[S.ay], length2 = dx * dx + dy * dy;
    if (length2 < TOLERANCE.negligible)
      continue;
    const t =
        Math.max(exposed ? s[S.algae_start] : 0,
                 Math.min(exposed ? s[S.algae_end] : 1,
                          (horizontalDelta(p.x - s[S.ax]) * dx + (p.y - s[S.ay]) * dy) / length2));
    const depth = s[S.sediment_left] * (1 - t) + s[S.sediment_right] * t;
    if ((tool === 'grass' && depth < PLACEMENT.grass_min_soil) ||
        (tool === 'worms' && depth <= f.parameters?.burrow_depth))
      continue;
    const x = s[S.ax] + t * dx, y = s[S.ay] + t * dy;
    if (!exposed) {
      const lift = Math.max(PLACEMENT.site_min_height, depth * PLACEMENT.site_depth_share),
            rx = x + s[S.nx] * lift, ry = y + s[S.ny] * lift,
            top = ry - Math.max(0, depth - lift) / Math.max(SEABED.floor_normal, -s[S.ny]) -
                  (tool === 'grass' ? PLACEMENT.grass_headroom : PLACEMENT.animal_headroom);
      if (!plantCurveClear(f, [ rx, ry, rx, ry, rx, top, rx, top ], PLACEMENT.site_probe, 1,
                           geometry))
        continue;
    }
    const distance = Math.hypot(horizontalDelta(x - p.x), y - p.y);
    if (!best || distance < best.distance)
      best = {x, y, t, s, depth, distance};
  }
  return best;
}
// The egg count from its input, within the input's own bounds.
function eggPlacementCount() {
  const input = el('egg-placement-count');
  return Math.max(Number(input.min), Math.min(Number(input.max), Math.trunc(Number(input.value)) ||
                                                                     Number(input.min)));
}
function insideWorld(p) {
  const f = sceneState.frame;
  return f && !f.historical && Number.isFinite(p.x) && Number.isFinite(p.y) && p.y >= 0 &&
         p.y < f.height;
}

export function animalPlacement(p, f = sceneState.frame, selectedTool = worldState.tool,
                                count = Number(el('tool-count').value)) {
  const map = {
    mussels : INVERTEBRATE_KIND.mussel,
    worms : INVERTEBRATE_KIND.worm,
    crabs : INVERTEBRATE_KIND.crab
  },
        kind = map[selectedTool], radius = Number(el('brush').value),
        mussel = kind === INVERTEBRATE_KIND.mussel, crab = kind === INVERTEBRATE_KIND.crab,
        worm = kind === INVERTEBRATE_KIND.worm,
        requestedMorph =
            Math.min(worldState.animalFamily ?? 0, familyCount(kind) - 1) + MIDDLE_VARIANT,
        parameters = f.parameters || {}, rows = [], surfaces = placementSurfaces(f),
        S = PLACEMENT_SURFACE, C = INVERTEBRATE;
  for (let k = 0; k < Math.min(PLACEMENT.animal_max, count); k++) {
    const scatter =
              k ? radius * PLACEMENT.animal_spread * Math.sqrt(k / Math.max(1, count - 1)) : 0,
          qx = p.x + Math.cos(k * PLACEMENT.golden_angle) * scatter,
          qy = p.y + Math.sin(k * PLACEMENT.golden_angle) * scatter * PLACEMENT.animal_flatten;
    const best = nearestPlacement({x : qx, y : qy}, f, selectedTool, surfaces);
    if (!best)
      continue;
    const morph =
        Math.floor(requestedMorph) +
        ((morphVariant(requestedMorph) + k * PLACEMENT.morph_step) % PLACEMENT.morph_span);
    const id = (f.fauna_next_id || 1) + k, individual = wormIndividuality(id);
    const {s, t} = best, depth = s[S.sediment_left] * (1 - t) + s[S.sediment_right] * t,
              energy = mussel ? parameters.mussel_birth_energy * PLACEMENT.mussel_births
                       : crab ? parameters.crab_birth_energy * PLACEMENT.crab_births
                              : parameters.worm_head_energy * PLACEMENT.worm_heads,
              r = mussel ? musselRadius(energy, parameters, morph)
                  : crab ? crabRadius(energy, parameters, morph)
                         : FAUNA.worm_head_radius,
              burial = burialShare(crab ? morphVariant(morph) : individual),
              lift = mussel ? FAUNA.mussel_lift * r
                     : crab ? crabSupportHeight(r, depth, burial)
                            : depth * (1 - burial),
              bodyLength = worm ? wormLength(id, morph) : 0,
              length =
                  worm ? bodyLength * Math.max(0, Math.min(1, (depth - parameters.burrow_depth) /
                                                                  FAUNA.worm_full_depth))
                       : 0,
              vertical = worm ? depth * burial / Math.max(SEABED.floor_normal, -s[S.ny]) : 0,
              x = best.x + s[S.nx] * lift,
              y = best.y + s[S.ny] * lift - (worm ? vertical + length : 0),
              angle = worm ? 0 : Math.atan2(s[S.nx], -s[S.ny]), color = smallAnimalColor(kind),
              row = new Array(C.count).fill(0);
    row[C.x] = x;
    row[C.y] = y;
    row[C.energy] = energy;
    row[C.id] = id;
    row[C.radius] = r;
    row[C.kind] = kind;
    [row[C.red], row[C.green], row[C.blue]] = color;
    row[C.angle] = angle;
    row[C.length] = length;
    row[C.morph] = morph;
    row[C.state] = crab ? CRAB_STATE.foraging : 0;
    row[C.direction] = 1;
    row[C.closed] = crab ? 1 : 0;
    row[C.ground] = 1;
    row[C.bed_depth] = BARE_FRONT;
    row[C.body_length] = length;
    row[C.food_x] = x;
    row[C.food_y] = y;
    row[C.food_kind] = FOOD_KIND.plankton;
    if (worm) {
      row[C.length] = vertical + length;
      row[C.state] = Math.atan2(s[S.nx], -s[S.ny]);
      row[C.ground] = Math.max(
          -1, Math.min(1, 1 - 2 * vertical / Math.max(TOLERANCE.negligible, vertical + length)));
      row[C.bed_depth] = burial;
      row[C.body_length] = bodyLength;
    }
    row.anchor = best;
    rows.push(row);
  }
  return rows;
}
export function plantPlacement(p, f = sceneState.frame, selectedTool = worldState.tool) {
  const best = nearestPlacement(p, f, selectedTool);
  if (!best)
    return null;
  // New plants show at half the soil depth above their root.
  const lift = selectedTool === 'grass' ? best.depth / 2 : 0, S = PLACEMENT_SURFACE;
  return {
    ...best,
    anchorX : best.x,
    anchorY : best.y,
    x : best.x + best.s[S.nx] * lift,
    y : best.y + best.s[S.ny] * lift
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
  const animal = ANIMAL_TOOLS[worldState.tool];
  if (animal)
    command(worldState.tool, {
      ...p,
      radius,
      count : Math.min(TOOL_COUNT.animals, count),
      morph : familyMorph(Math.min(worldState.animalFamily ?? 0, familyCount(animal.kind) - 1))
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
  el('animal-palette').hidden = !ANIMAL_TOOLS[worldState.tool];
  drawAnimalChoices();
  el('sediment-amount-setting').hidden = worldState.tool !== 'sediment';
  text('tool-heading', toolNames[worldState.tool] || t('world.werkzeug'));
  el('tool-symbol').innerHTML = uiIcon(worldState.tool);
  drawToolPalettePreview();
  const fields = {
    brush : [
      'rock', 'feed', 'clean', 'grass', 'algae', 'remove-plants', 'sediment', 'remove-sediment',
      ...Object.keys(ANIMAL_TOOLS)
    ],
    'wall-width' : [ 'wall', 'planter' ],
    'tool-count' : [ 'feed', ...Object.keys(ANIMAL_TOOLS) ],
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
  // The brush keeps the bounds of the markup, narrowed for rocks and food.
  const brush = el('brush');
  brush.dataset.min ??= brush.min;
  brush.dataset.max ??= brush.max;
  const lo = worldState.tool === 'rock' ? BRUSH.rock_min : Number(brush.dataset.min);
  brush.min = String(lo);
  if (Number(brush.value) < lo)
    brush.value = String(lo);
  brush.max = String(worldState.tool === 'feed' ? BRUSH.feed_max : brush.dataset.max);
  const maximum = ANIMAL_TOOLS[worldState.tool] ? TOOL_COUNT.animals : TOOL_COUNT.other;
  el('tool-count').max = String(maximum);
  if (Number(el('tool-count').value) > maximum)
    el('tool-count').value = String(maximum);
  text('tool-count-value', el('tool-count').value);
}

// Polygons take MIN_POINTS to MAX_POINTS corners and close on a click within CLOSE pixels of the
// first one.
const POLYGON = Object.freeze({min_points : 3, max_points : 32, close : 10});
function finishPolygon() {
  if (worldState.polygonPoints.length >= POLYGON.min_points)
    command('polygon', {points : worldState.polygonPoints});
  worldState.polygonPoints = [];
}

// Rock brushes are at least ROCK_MIN wide, food brushes at most FEED_MAX.
const BRUSH = Object.freeze({rock_min : 8, feed_max : 100});
// Planters: a rim of MIN_RIM to MAX_RIM, walls up to 1/WALL_SHARE of the span; the span takes at
// least MIN_SPAN wall widths.
const PLANTER = Object.freeze({min_rim : 8, max_rim : 24, wall_share : 4, min_span : 4});
export function planterPoints(a, b, width) {
  const right = a.x + horizontalDelta(b.x - a.x), left = Math.min(a.x, right),
        end = Math.max(a.x, right), floor = a.y,
        rim = Math.max(PLANTER.min_rim, Math.min(PLANTER.max_rim, width)),
        wall = Math.min(width, (end - left) / PLANTER.wall_share);
  if (end - left < PLANTER.min_span * width)
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

// Tool previews: aiming a current needs AIM pixels of drag; plants show at PLANT_SCALE.
const PREVIEW = Object.freeze({aim : 5, plant_scale : .55});
// Tool preview drawing in pixels: eggs at least MIN_EGG wide, blocked sites as a crossed ring,
// links dashed, currents as arrows at least MIN_ARROW long.
const TOOL_DRAW = Object.freeze({
  min_egg : 3,
  egg : 2.4,
  egg_line : 1.2,
  egg_tall : 1.12,
  yolk_dx : .1,
  yolk_rx : .36,
  yolk_ry : .56,
  yolk_tilt : .4,
  blocked_width : 2,
  blocked_dash : 4,
  blocked_r : 12,
  cross : 7,
  line_width : 1.5,
  link_dash : 3,
  link_gap : 4,
  min_algae : 4,
  algae_width : 2,
  corner : 5,
  min_arrow : 30,
  arrow : .35,
  head : 10,
  head_angle : .5,
  label_dx : 8,
  label_dy : 10,
  label_gap : 6,
  egg_fill : '#cfbb7790',
  egg_edge : '#fff0c8',
  yolk : '#66583d',
  blocked : '#ca9e88',
  tool : '#e9c185',
  tool_fill : '#e9c18514',
  algae : '#6e995a',
  rock : '#435965b0'
});
export function drawToolPreview(f, c) {
  if (!worldState.worldCursor)
    return;
  if (worldState.placingEggs) {
    const count = eggPlacementCount();
    ctx.save();
    for (const p of eggPlacementPoints(worldState.worldCursor, count)) {
      const x = p.x * c.scale + c.ox, y = p.y * c.scale + c.oy,
            r = Math.max(TOOL_DRAW.min_egg, TOOL_DRAW.egg * c.scale);
      ctx.fillStyle = TOOL_DRAW.egg_fill;
      ctx.strokeStyle = TOOL_DRAW.egg_edge;
      ctx.lineWidth = TOOL_DRAW.egg_line;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * TOOL_DRAW.egg_tall, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = TOOL_DRAW.yolk;
      ctx.beginPath();
      ctx.ellipse(x + r * TOOL_DRAW.yolk_dx, y, r * TOOL_DRAW.yolk_rx, r * TOOL_DRAW.yolk_ry,
                  -TOOL_DRAW.yolk_tilt, 0, Math.PI * 2);
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
    ctx.strokeStyle = TOOL_DRAW.blocked;
    ctx.lineWidth = TOOL_DRAW.blocked_width;
    ctx.setLineDash([ TOOL_DRAW.blocked_dash, TOOL_DRAW.blocked_dash ]);
    ctx.beginPath();
    ctx.arc(px, py, TOOL_DRAW.blocked_r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(px - TOOL_DRAW.cross, py + TOOL_DRAW.cross);
    ctx.lineTo(px + TOOL_DRAW.cross, py - TOOL_DRAW.cross);
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
  ctx.strokeStyle = TOOL_DRAW.tool;
  ctx.fillStyle = TOOL_DRAW.tool_fill;
  ctx.lineWidth = TOOL_DRAW.line_width;
  if (ANIMAL_TOOLS[worldState.tool]) {
    const rows = animalPlacement(worldState.worldCursor, f);
    if (!rows.length)
      unavailable();
    else
      paintFaunaPreview(f, c, rows);
    if (rows[0]) {
      const q = rows[0].anchor;
      ctx.setLineDash([ TOOL_DRAW.link_dash, TOOL_DRAW.link_gap ]);
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
      ctx.setLineDash([ TOOL_DRAW.link_dash, TOOL_DRAW.link_gap ]);
      ctx.beginPath();
      ctx.moveTo(x(worldState.worldCursor.x), y(worldState.worldCursor.y));
      ctx.lineTo(x(site.x), y(site.y));
      ctx.stroke();
      ctx.setLineDash([]);
      if (worldState.tool === 'grass') {
        ctx.save();
        ctx.translate(x(site.x), y(site.y));
        drawPlantChoice(ctx, worldState.editorPlant, 0, 0,
                        Math.max(1, c.scale) * PREVIEW.plant_scale);
        ctx.restore();
      } else {
        ctx.strokeStyle = TOOL_DRAW.algae;
        ctx.lineWidth = Math.max(TOOL_DRAW.min_algae, c.scale * TOOL_DRAW.algae_width);
        ctx.lineCap = 'round';
        ctx.beginPath();
        const S = PLACEMENT_SURFACE, s = site.s, dx = s[S.bx] - s[S.ax], dy = s[S.by] - s[S.ay],
              length = Math.hypot(dx, dy),
              radius = Number(el('brush').value) / Math.max(TOLERANCE.negligible, length),
              start = Math.max(s[S.algae_start], site.t - radius),
              end = Math.min(s[S.algae_end], site.t + radius);
        ctx.moveTo(x(s[S.ax] + dx * start), y(s[S.ay] + dy * start));
        ctx.lineTo(x(s[S.ax] + dx * end), y(s[S.ay] + dy * end));
        ctx.stroke();
      }
    } else
      unavailable();
    return;
  }
  if (worldState.tool === 'rock') {
    const points = rockPlacement(worldState.worldCursor, f);
    ctx.fillStyle = TOOL_DRAW.rock;
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
      ctx.arc(x(worldState.polygonPoints[0].x), y(worldState.polygonPoints[0].y), TOOL_DRAW.corner,
              0, 2 * Math.PI);
      ctx.stroke();
    }
    return;
  }
  if (worldState.tool === 'current') {
    const start = worldState.worldDrag?.start || worldState.worldCursor, values = currentValues(),
          angle =
              worldState.worldDrag && Math.hypot(worldState.worldCursor.x - start.x,
                                                 worldState.worldCursor.y - start.y) > PREVIEW.aim
                  ? Math.atan2(worldState.worldCursor.y - start.y,
                               horizontalDelta(worldState.worldCursor.x - start.x))
                  : values.angle;
    ctx.beginPath();
    ctx.arc(x(start.x), y(start.y), values.width / 2 * c.scale, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x(start.x), y(start.y));
    const length = Math.max(TOOL_DRAW.min_arrow, values.width * TOOL_DRAW.arrow),
          tip = {x : start.x + length * Math.cos(angle), y : start.y + length * Math.sin(angle)};
    ctx.lineTo(x(tip.x), y(tip.y));
    for (const side of [-1, 1]) {
      ctx.moveTo(x(tip.x - TOOL_DRAW.head * Math.cos(angle + side * TOOL_DRAW.head_angle)),
                 y(tip.y - TOOL_DRAW.head * Math.sin(angle + side * TOOL_DRAW.head_angle)));
      ctx.lineTo(x(tip.x), y(tip.y));
    }
    ctx.stroke();
    ctx.font = '12px system-ui';
    ctx.fillStyle = TOOL_DRAW.tool;
    ctx.fillText(t('world.sourceSize', {
                   radius : Math.round(values.width / 2),
                   strength : formatNumber(values.strength, 1, true)
                 }),
                 x(start.x) + TOOL_DRAW.label_dx, y(start.y) - TOOL_DRAW.label_dy);
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
    ctx.fillStyle = TOOL_DRAW.tool;
    ctx.fillText(worldState.tool === 'feed' ? t('world.foodCount', {n : el('tool-count').value})
                                            : '',
                 x(worldState.worldCursor.x) + radius * c.scale + TOOL_DRAW.label_gap,
                 y(worldState.worldCursor.y));
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
      const result = await importGenome(file);
      beginEggPlacement({saved : result.message.replace(/^archive:/, '')});
    } catch (error) {
      text('error', error.message);
    } finally {
      input.value = '';
      button.disabled = !!sceneState.frame?.historical;
    }
  };
}

// The mouse wheel changes a current's width and strength by these steps.
const CURRENT_WHEEL = Object.freeze({'current-width' : 8, 'current-strength' : .1, digits : 1});
const INPUT_LIMITS = [
  [ 'minimum-population', 0, POPULATION_LIMITS.max_fish ],
  [ 'population-limit', POPULATION_LIMITS.min_limit, POPULATION_LIMITS.max_fish ],
  [ 'new-fish', 1, POPULATION_LIMITS.max_fish ], [ 'world-width', TANK.min_width, TANK.max_width ],
  [ 'world-height', TANK.min_height, TANK.max_height ],
  [ 'feeder-rate', 0, SOURCE_LIMITS.max_feeder_rate ],
  [ 'feeder-width', SOURCE_LIMITS.min_feeder_radius, SOURCE_LIMITS.max_feeder_radius ],
  [ 'current-width', SOURCE_LIMITS.min_width, SOURCE_LIMITS.max_width ],
  [ 'current-strength', 0, SOURCE_LIMITS.max_strength ], [ 'flow', 0, WATER_SETTING.max_flow ],
  [ 'gravity', 0, WATER_SETTING.max_gravity ]
];
const initializers = {
  "editorPlant" : () => { worldState.editorPlant = MIXED_PLANTS; },
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
        const count = eggPlacementCount();
        const placed =
            id.clone !== undefined ? command('clone-eggs', {...p, id : id.clone, count})
            : id.saved !== undefined
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
        if (worldState.polygonPoints.length >= POLYGON.min_points &&
            Math.hypot(p.x - worldState.polygonPoints[0].x, p.y - worldState.polygonPoints[0].y) <
                POLYGON.close / camera().scale) {
          finishPolygon();
          return;
        }
        if (worldState.polygonPoints.length < POLYGON.max_points)
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
          Date.now() - worldState.lastPaint > TOOL_COUNT.paint_ms) {
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
            angle : q[CURRENT.angle] + worldState.worldDrag.angle,
            width : q[CURRENT.width],
            strength : q[CURRENT.strength]
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
            radius : source[FEEDER.radius],
            rate : source[FEEDER.rate]
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
        if (distance > PREVIEW.aim)
          values.angle =
              Math.atan2(worldState.worldCursor.y - worldState.worldDrag.start.y,
                         horizontalDelta(worldState.worldCursor.x - worldState.worldDrag.start.x));
        command('current-source', {
          index : worldState.currentSelection,
          x : q?.[CURRENT.x] ?? worldState.worldDrag.start.x,
          y : q?.[CURRENT.y] ?? worldState.worldDrag.start.y,
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
      if (e.key === KEY.escape && worldState.placingEggs) {
        endEggPlacement();
      }
      if (e.key?.toLowerCase() === 'r' && worldState.worldDrag && worldState.tool === 'move' &&
          !['INPUT', 'SELECT'].includes(e.target.tagName))
        worldState.worldDrag.angle =
            Math.atan2(Math.sin(worldState.worldDrag.angle + TOOL_COUNT.rotate),
                       Math.cos(worldState.worldDrag.angle + TOOL_COUNT.rotate));
    });
  },
  "addEventListener_keydown_additional_2" : () => {
    document.addEventListener('keydown', e => {
      if (!evolutionState.editing || worldState.tool !== 'polygon' ||
          [ 'INPUT', 'SELECT' ].includes(e.target.tagName))
        return;
      if (e.key === KEY.enter)
        finishPolygon();
      else if (e.key === KEY.escape)
        worldState.polygonPoints = [];
    });
  },
  "tankWheel" : () => { tankWheel = canvas.onwheel; },
  // Tank, population and source inputs take their limits from the engine's.
  "inputLimits" : () => {
    for (const [id, lo, hi] of INPUT_LIMITS) {
      el(id).min = String(lo);
      el(id).max = String(hi);
    }
  },
  "onwheel" : () => {
    canvas.onwheel = e => {
      if (!evolutionState.editing || worldState.tool !== 'current')
        return tankWheel(e);
      e.preventDefault();
      const id = e.shiftKey ? 'current-strength' : 'current-width', input = el(id),
            step = CURRENT_WHEEL[id], value = Number(input.value) + (e.deltaY < 0 ? step : -step);
      input.value = String(Number(Math.max(Number(input.min), Math.min(Number(input.max), value))
                                      .toFixed(CURRENT_WHEEL.digits)));
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
