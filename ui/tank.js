import {PALETTE} from './palette.js';
import {familyMorph} from './fauna.js';
import {tracePath} from './path_data.js';
import {KEY} from './keys.js';
import {fishLabel} from './fish_names.js';
import {t, tList} from './strings.js';
import {paintThoughtBubbles} from './thought_view.js';
import {BED_LAYERS, bedRenderOrder} from './plant_geometry.js';
import {
  CORPSE,
  FISH,
  FOOD,
  FOOD_KIND,
  INVERTEBRATE,
  INVERTEBRATE_KIND,
  MUSSEL_STATE,
  PLANT,
  PLANT_ROOT,
  PLANT_TYPE
} from './schema.js';
import {displayFaults} from './diagnostics.js';
import {adaptResolution, horizontalShifts, POINTER, updateCameraState, ZOOM} from './camera.js';
import {brainVisible, updateBrainState} from './brain.js';
import {updateSessionState, command} from './session.js';
import {updateHoverState} from './hover.js';
import {
  advanceScene,
  blendFish,
  blendParticle,
  displayNow,
  displayStep,
  frameBlend,
  frameFish,
  HELD_ACTION_SECONDS,
  horizontalDelta,
  sceneState,
  stepsInSeconds,
  updateSceneState,
  wrapScreenX
} from './state.js';
import {selectFish} from './fish_choice.js';
import {updateTankSceneryState} from './tank_scenery.js';
import {resetTankBatches} from './vegetation.js';
import {paintAnimals, paintRevealedAnimals} from './animals.js';
import {paintVision} from './vision_view.js';
import {brainDrawOverlay, brainState, brainZoomUpdate} from './brain.js';
import {brainCanvasClick, brainCanvasHover} from './brain_input.js';
import {brainPreDraw} from './brain_signals.js';
import {
  camera,
  cameraState,
  canvasPoint,
  point,
  screenToWorld,
  setFollowing,
  worldToScreen
} from './camera.js';
import {drawObservations, isSickFish} from './cockpit.js';
import {canvas, ctx, el} from './dom.js';
import {
  paintBlood,
  paintCombat,
  paintFeeding,
  paintEcologyFeeding,
  sceneEffectsPending
} from './effects.js';
import {clipSediment} from './water_view.js';
import {animateSpecies, deselectSpecies, evolutionState} from './evolution.js';
import {fishBodyRadius} from './fish_fins.js';
import {
  hoverState,
  tankHideTooltip,
  tankHit,
  tankHoverMove,
  tankHoverUpdate,
  tankSedimentHit,
  tankShowTooltip
} from './hover.js';
import {tankObjectInfo} from './object_info.js';
import {paintGpuFood, paintGpuGametes, paintGpuSmallAnimals} from './particle_renderer.js';
import {fpsReport, updateFps} from './report.js';
import {paintGpuSurface, SEDIMENT_PEEK_RADIUS} from './sediment_renderer.js';
import {animateSelectedFish} from './selection.js';
import {sessionState} from './session.js';
import {
  paintScenery,
  paintSourceMarkers,
  paintBedOpenings,
  scenery,
  SCENERY_PADDING,
  tank_sceneryState
} from './tank_scenery.js';
import {grassPartPose, paintGpuGrass} from './vegetation.js';
import {
  clipObstacles,
  paintCloudLight,
  paintSuspendedSediment,
  paintPlankton
} from './water_view.js';
import {drawToolPreview, plantPlacement, worldState} from './world.js';
import {ANIMAL_TOOLS, drawAnimalChoice, drawPlantChoice, MIXED_PLANTS} from './world_palette.js';
import {plantCurveClear, plantRenderParts} from './plant_geometry.js';
export const tankState = {};
// Picking keys of drawn objects in depth order: their kind and id.
const PICK_ID =
    Object.freeze({plant : PLANT.id, fish : FISH.id, food : FOOD.id, animal : INVERTEBRATE.id});
export function pickingKey(kind, item) { return kind + ':' + item[PICK_ID[kind]]; }
// World radius that one stir from the menu loosens.
const STIR_RADIUS = 24;

// The target ID stays captured while a moving animal leaves the pointer.
export function objectActions(hit) {
  if (hit?.kind === 'plant')
    return [
      {id : 'inspect', label : t('tank.ansehen')},
      ...(!hit.item[PLANT.root]?.[PLANT_ROOT.drift_age]
              ? [ {id : 'encourage', label : t('tank.wachsen')} ]
              : []),
      {id : 'bite-plant', label : t('tank.beissen')}, {id : 'crush', label : t('tank.abtrennen')}
    ];
  if (hit?.kind === 'invertebrate' &&
      [ INVERTEBRATE_KIND.worm, INVERTEBRATE_KIND.crab, INVERTEBRATE_KIND.mussel ].includes(
          hit.item[INVERTEBRATE.kind]) &&
      !(hit.item[INVERTEBRATE.kind] === INVERTEBRATE_KIND.mussel &&
        hit.item[INVERTEBRATE.state] === MUSSEL_STATE.empty_shell))
    return [
      {id : 'inspect', label : t('tank.ansehen')}, {id : 'encourage', label : t('tank.fressen')},
      {id : 'startle', label : t('tank.aufscheuchen')}, {
        id : 'crush',
        label : hit.item[INVERTEBRATE.kind] === INVERTEBRATE_KIND.worm ? t('tank.abtrennen')
                                                                       : t('tank.knacken')
      }
    ];
  if (hit?.kind === 'sediment')
    return [
      {
        id : 'plants',
        label : t('tank.pflanzen'),
        plant : PLANT_TYPE.fine_grass,
        children : tList('tank.plantNames')
                       .map((label, plant) => ({id : 'place', tool : 'grass', label, plant}))
      },
      ...[[ 'worms', t('tank.wuermer') ], [ 'crabs', t('tank.krabben') ]].map(
          ([ tool, label ]) => ({
            id : tool,
            label,
            tool,
            children : tList(ANIMAL_TOOLS[tool].names)
                           .map((name, family) => ({id : 'place', tool, family, label : name}))
          })),
      {id : 'stir', label : t('tank.aufwirbeln')}
    ];
  return [];
}
function backgroundMenuHit(e) {
  const p = point(e), f = sceneState.frame;
  p.x = wrapScreenX(p.x);
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.y < 0 || p.y >= f.height ||
      !plantCurveClear(f, [ p.x, p.y, p.x, p.y, p.x, p.y, p.x, p.y ], 0, 1))
    return null;
  return tankSedimentHit(p, f) || {kind : 'water', ...p};
}
function currentMenuItem(hit) {
  if (hit.kind === 'water' || hit.kind === 'sediment')
    return hit;
  const plant = hit.kind === 'plant', index = plant ? PLANT.id : INVERTEBRATE.id;
  return (plant ? sceneState.frame.plants || [] : sceneState.frame.invertebrates || [])
      .find(p => p[index] === hit.item[index]);
}
// The radial menu around the pointer: rings from INNER to OUTER pixels, icons at ICON with their
// labels LABEL_Y below; the menu keeps MARGIN pixels from the view edges and takes presses
// within REACH. Sectors leave GAP radians between them.
const MENU = Object.freeze({
  inner : 25,
  outer : 92,
  icon : 59,
  icon_y : -5,
  label_y : 20,
  margin : 100,
  reach : 110,
  gap : .035,
  line_width : 1.5,
  icon_width : 2,
  plant_y : 7,
  plant_scale : .65,
  animal_y : 5,
  animal_scale : .75,
  grow_y : 8,
  fill : '#142e36ee',
  chosen_fill : '#496f6bf5',
  edge : '#71918b',
  chosen_edge : '#d8e8d6',
  ink : '#d7e7d9',
  label : '#ecf1e6',
  close : '#aac4bc',
  food : '#dfc991'
});
// Menu icons as path data (see path_data.js), around the icon centre.
const MENU_ICONS = Object.freeze({
  stir : 'M-9 8L9 8M0 8C-8 2 8 -2 0 -4C-6 -6 4 -10 1 -11',
  back : 'M9 0L-8 0L-2 -6M-8 0L-2 6',
  'bite-plant' :
      'M-10 -7Q0 2 10 -7M-10 7Q0 -2 10 7M-7 -3L-5 0L-3 -3M-2 -1.5L0 1.5L2 -1.5M3 -3L5 0L7 -3' +
          'M-7 3L-5 0L-3 3M-2 1.5L0 -1.5L2 1.5M3 3L5 0L7 3',
  startle : 'M-9 6L-6 -3L-3 2M-3 6L0 -3L3 2M3 6L6 -3L9 2',
  crush : 'M-10 -5L-3 0L-10 5M10 -5L3 0L10 5M0 -8L-2 -1L2 2L0 8',
  close : 'M-4 -4L4 4M-4 4L4 -4'
});
// The eye of "inspect" and the open mouth of "encourage" with its morsel.
const INSPECT_ICON = Object.freeze({rx : 10, ry : 6, pupil : 2.5});
const FEED_ICON = Object.freeze({x : 3, r : 9, mouth : .8, food_x : 12, food_r : 2});
export function radialChoice(menu, x, y) {
  if (Math.hypot(x - menu.x, y - menu.y) < MENU.inner)
    return -1;
  const angle = (Math.atan2(y - menu.y, x - menu.x) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
  return Math.floor((angle + Math.PI / menu.actions.length) / (2 * Math.PI / menu.actions.length)) %
         menu.actions.length;
}
function openObjectMenu(hit, e) {
  const actions = objectActions(hit);
  if (!actions.length)
    return false;
  const q = canvasPoint(e), margin = MENU.margin;
  if (!Number.isFinite(q.x) || !Number.isFinite(q.y))
    return false;
  tankState.contextMenu = {
    hit,
    actions,
    x : Math.max(margin, Math.min(cameraState.viewportWidth - margin, q.x)),
    y : Math.max(margin, Math.min(cameraState.viewportHeight - margin, q.y)),
    pointerX : q.x,
    pointerY : q.y,
    choice : -1,
    epoch : sceneState.frame.render_epoch,
    pressed : true,
    startedX : q.x,
    startedY : q.y
  };
  sceneState.renderInputRevision++;
  return true;
}
// Menu placements: within REACH pixels of the click (or the depth found), with brushes of
// PLANT_RADIUS or ANIMAL_RADIUS; bites aim at ALONG of an organ; a startle reaches STARTLE animal
// radii, between MIN_STARTLE and MAX_STARTLE.
const PLACE = Object.freeze({
  reach : 60,
  plant_radius : 5,
  animal_radius : 12,
  along : .5,
  startle : 3,
  min_startle : 40,
  max_startle : 120
});
function runObjectAction(menu) {
  const action = menu.actions[menu.choice], hit = menu.hit;
  if (sceneState.frame.historical || menu.epoch !== sceneState.frame.render_epoch ||
      !currentMenuItem(hit)) {
    tankState.contextMenu = null;
    sceneState.renderInputRevision++;
    return;
  }
  if (action?.children) {
    menu.parents = [...(menu.parents || []), menu.actions ];
    menu.actions = [...action.children, {id : 'back', label : t('tank.zurueck')} ];
    menu.choice = -1;
    menu.opened = true;
    sceneState.renderInputRevision++;
    return;
  }
  if (action?.id === 'back') {
    menu.actions = menu.parents.pop();
    menu.choice = -1;
    sceneState.renderInputRevision++;
    return;
  }
  tankState.contextMenu = null;
  sceneState.renderInputRevision++;
  if (!action)
    return;
  if (action.id === 'stir') {
    command('stir-sediment', {x : wrapScreenX(hit.x), y : hit.y, radius : STIR_RADIUS});
    return;
  }
  if (action.id === 'place') {
    const site = plantPlacement(hit, sceneState.frame, action.tool);
    if (!site || (site.distance ?? 0) > Math.max(PLACE.reach, hit.depth || 0))
      return;
    command(action.tool, {
      x : wrapScreenX(site.anchorX ?? site.x),
      y : site.anchorY ?? site.y,
      radius : action.tool === 'grass' ? PLACE.plant_radius : PLACE.animal_radius,
      count : 1,
      plant : action.plant ?? MIXED_PLANTS,
      morph : familyMorph(action.family ?? 0),
      amount : 1
    });
    return;
  }
  const plant = hit.kind === 'plant', id = hit.item[plant ? PLANT.id : INVERTEBRATE.id],
        item = currentMenuItem(hit);
  if (action.id === 'bite-plant')
    command('bite-plant',
            {kind : FOOD_KIND.plant, id, organ : hit.organ.stem, along : hit.along ?? PLACE.along});
  else if (action.id === 'crush' || action.id === 'encourage') {
    const steps = action.id === 'encourage' ? stepsInSeconds(HELD_ACTION_SECONDS) : undefined;
    command(action.id, {
      kind : plant ? FOOD_KIND.plant : item[INVERTEBRATE.kind],
      id,
      organ : plant ? hit.organ.stem : -1,
      along : plant ? hit.along ?? 0 : 0,
      steps
    });
    if (plant && action.id === 'encourage')
      (tankState.boosts ??= new Map()).set(id, displayStep() + steps);
  } else if (action.id === 'startle')
    command('startle', {
      x : wrapScreenX(item[INVERTEBRATE.x]),
      y : item[INVERTEBRATE.y],
      radius : Math.min(PLACE.max_startle,
                        Math.max(PLACE.min_startle, item[INVERTEBRATE.radius] * PLACE.startle))
    });
  else {
    const r = canvas.getBoundingClientRect();
    updateHoverState({
      menuHit : {hit : {...hit, item}, epoch : menu.epoch},
      tankHoverKey : hit.key,
      tankHoverSince : 0,
      tankPointer : {
        x : r.left + menu.x * r.width / cameraState.viewportWidth,
        y : r.top + menu.y * r.height / cameraState.viewportHeight
      }
    });
    tankShowTooltip(tankObjectInfo({...hit, item}));
  }
}
// Encouraged plants: the plant itself glows in a slow pulse while the growth boost lasts.
// Growth boosts glow for at most HORIZON steps, pulsing every PULSE_MS and fading over their last
// FADE_STEPS.
const BOOST_GLOW = Object.freeze({
  pulse_ms : 260,
  horizon : 800,
  fade_steps : 60,
  alpha : .18,
  pulse_alpha : .32,
  min_width : 3,
  pad : 4,
  pulse_width : 3,
  glow : '#c9ff8a'
});
function paintGrowthBoosts(f, x, y, shifts) {
  const boosts = tankState.boosts;
  if (!boosts?.size)
    return;
  const now = displayStep(f), c = camera(f),
        pulse = .5 + .5 * Math.sin(performance.now() / BOOST_GLOW.pulse_ms);
  ctx.save();
  ctx.lineCap = 'round';
  for (const [id, until] of boosts) {
    if (now >= until || until - now > BOOST_GLOW.horizon) {
      boosts.delete(id);
      continue;
    }
    const p = (f.plants || []).find(q => q[PLANT.id] === id);
    if (!p)
      continue;
    const fade = Math.min(1, (until - now) / BOOST_GLOW.fade_steps);
    for (const part of plantRenderParts(p)) {
      const q = grassPartPose(p, part, f).q;
      for (const shift of shifts) {
        const dx = wrapScreenX(q[0]) - q[0] + shift;
        ctx.globalAlpha = fade * (BOOST_GLOW.alpha + BOOST_GLOW.pulse_alpha * pulse);
        ctx.strokeStyle = BOOST_GLOW.glow;
        ctx.lineWidth = Math.max(BOOST_GLOW.min_width, part.width * c.scale * 2 + BOOST_GLOW.pad +
                                                           BOOST_GLOW.pulse_width * pulse);
        ctx.beginPath();
        ctx.moveTo(x(q[0] + dx), y(q[1]));
        ctx.bezierCurveTo(x(q[2] + dx), y(q[3]), x(q[4] + dx), y(q[5]), x(q[6] + dx), y(q[7]));
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}
function paintObjectMenu() {
  const m = tankState.contextMenu;
  if (!m)
    return;
  if (m.epoch !== sceneState.frame.render_epoch || evolutionState.editing ||
      !currentMenuItem(m.hit)) {
    tankState.contextMenu = null;
    return;
  }
  const M = MENU, trace = d => {
    ctx.beginPath();
    tracePath(ctx, d);
    ctx.stroke();
  };
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.lineWidth = M.line_width;
  const n = m.actions.length, angle = 2 * Math.PI / n;
  for (let i = 0; i < n; ++i) {
    const center = -Math.PI / 2 + i * angle, lo = center - angle / 2 + M.gap,
          hi = center + angle / 2 - M.gap, chosen = m.choice === i;
    ctx.fillStyle = chosen ? M.chosen_fill : M.fill;
    ctx.strokeStyle = chosen ? M.chosen_edge : M.edge;
    ctx.beginPath();
    ctx.arc(0, 0, M.outer, lo, hi);
    ctx.arc(0, 0, M.inner, hi, lo, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.translate(Math.cos(center) * M.icon, Math.sin(center) * M.icon + M.icon_y);
    ctx.strokeStyle = ctx.fillStyle = M.ink;
    ctx.lineWidth = M.icon_width;
    const action = m.actions[i];
    if (action.plant !== undefined)
      drawPlantChoice(ctx, action.plant, 0, M.plant_y, M.plant_scale);
    else if (ANIMAL_TOOLS[action.tool])
      drawAnimalChoice(ctx, action.tool, action.family ?? 0, 0, M.animal_y, M.animal_scale);
    else if (action.id === 'encourage' && m.hit.kind === 'plant')
      drawPlantChoice(ctx, PLANT_TYPE.fine_grass, 0, M.grow_y, M.plant_scale);
    else if (action.id === 'encourage') {
      const F = FEED_ICON;
      ctx.beginPath();
      ctx.arc(F.x, 0, F.r, -F.mouth, F.mouth, true);
      ctx.lineTo(F.x, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = M.food;
      ctx.beginPath();
      ctx.arc(F.food_x, 0, F.food_r, 0, 2 * Math.PI);
      ctx.fill();
    } else if (action.id === 'inspect') {
      const E = INSPECT_ICON;
      ctx.beginPath();
      ctx.ellipse(0, 0, E.rx, E.ry, 0, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, E.pupil, 0, 2 * Math.PI);
      ctx.fill();
    } else
      trace(MENU_ICONS[action.id] ?? MENU_ICONS.crush);
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = M.label;
    ctx.fillText(action.label, 0, M.label_y);
    ctx.restore();
  }
  ctx.strokeStyle = M.close;
  trace(MENU_ICONS.close);
  ctx.restore();
}

function paintDriftTile(f, c, blend) {
  if (globalThis.document?.getElementById?.('layer-plankton')?.checked !== false)
    paintPlankton(f, c);
  paintGpuFood(f, c, blend);
  fpsReport?.mark('food');
  paintGpuGametes(f, c, blend);
  fpsReport?.mark('gametes');
}

// Selection marks fade in as fish shrink below FULL_BELOW + FADE_SPAN pixels, fully shown below
// FULL_BELOW.
const SELECTION_FADE = Object.freeze({full_below : 36, fade_span : 20});
function selectionOpacity(r) {
  const t = Math.max(0, Math.min(1, (SELECTION_FADE.full_below - r) / SELECTION_FADE.fade_span));
  return t * t * (3 - 2 * t);
}

// Selection corners PAD pixels outside the body, their arms ARM of the radius long.
const SELECTION = Object.freeze({line_width : 2, pad : 4, min_arm : 3, arm : .25});
export function paintSelection(ctx, r, color) {
  const alpha = selectionOpacity(r);
  if (alpha <= 0)
    return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = SELECTION.line_width;
  const edge = r + SELECTION.pad, arm = Math.max(SELECTION.min_arm, r * SELECTION.arm);
  ctx.beginPath();
  for (const x of [-1, 1])
    for (const y of [-1, 1]) {
      ctx.moveTo(x * edge, y * (edge - arm));
      ctx.lineTo(x * edge, y * edge);
      ctx.lineTo(x * (edge - arm), y * edge);
    }
  ctx.stroke();
  ctx.restore();
}

export function resetDrawing() {
  draw.error = null;
  for (const [scope, fault] of displayFaults.issues)
    if (fault.guarded)
      displayFaults.clear(scope);
  draw.idleStamp = null;
}

export function draw(f = sceneState.frame) {
  displayFaults.run(t('tank.tank'), () => paintTank(f));
  draw.error = displayFaults.issues.get(t('tank.tank'))?.error || null;
}

// Tank view: scenery is repainted once the camera moves SCENERY_SHIFT of its padding; tiles draw
// within MARGIN pixels of the view; fish more than PEEK_COVER buried show under the sediment peek,
// those more than BURIED_COVER get a marker.
const TANK_VIEW = Object.freeze({
  scenery_shift : .6,
  margin : 80,
  label_dx : 8,
  label_dy : 6,
  peek_cover : .05,
  buried_cover : .5,
  marker : 4,
  buried_label_dy : 13,
  background : '#091d25',
  selected : '#faf5db',
  sick : '#ff214c',
  species : PALETTE.mint,
  label : '#edf5e4',
  buried_selected : '#f6e5b0',
  buried : '#9ab9b7'
});
function paintTank(f) {
  if (!f || f.binary_scene && !f.visibleFish || f.turbo || ctx.lost)
    return false;
  const idle = f.paused && frameBlend() >= 1 && !evolutionState.editing && !cameraState.drag &&
               !brainVisible() && !sceneState.eggBirths.size && !sceneState.maternalBirths.size,
        stamp = [
          sceneState.frameRevision, cameraState.cameraX, cameraState.cameraY, cameraState.zoom,
          cameraState.viewportWidth, cameraState.viewportHeight,
          typeof hoverState.tankPointer === 'undefined' ? '' : hoverState.tankPointer?.x,
          typeof hoverState.tankPointer === 'undefined' ? '' : hoverState.tankPointer?.y,
          sceneState.renderInputRevision, sceneState.highlightSpecies, sceneState.highlightSick
        ].join(':');
  if (idle && draw.idleStamp === stamp) {
    tankHoverUpdate();
    return;
  }
  if (!ctx.frameReady())
    return false;
  draw.idleStamp = idle ? stamp : null;
  const priorRenderTime = sceneState.renderTime, priorRenderScale = sceneState.renderScale;
  updateSceneState({renderTime : displayNow()});
  try {
    const chosen = frameFish(f), blend = frameBlend();
    if (cameraState.following && chosen) {
      const p = blendFish(chosen, blend);
      updateCameraState({
        cameraX : (cameraState.cameraX ?? p[FISH.x]) +
                      horizontalDelta(p[FISH.x] + cameraState.followOffsetX -
                                      (cameraState.cameraX ?? p[FISH.x]))
      });
      updateCameraState({cameraY : p[FISH.y] + cameraState.followOffsetY});
    }
    const c = camera(f), x = v => v * c.scale + c.ox, y = v => v * c.scale + c.oy;
    updateSceneState({renderScale : c.scale});
    brainZoomUpdate(f, c);
    brainPreDraw(f);
    fpsReport?.mark('prepare');
    ctx.beginFrame();
    ctx.setTransform(cameraState.pixelRatio, 0, 0, cameraState.pixelRatio, 0, 0);
    if (tank_sceneryState.sceneRevision !== sceneState.frameRevision || paintScenery.frame !== f) {
      updateTankSceneryState({sceneRevision : sceneState.frameRevision});
      paintScenery.frame = f;
      updateTankSceneryState({
        sceneSignature : JSON.stringify([
          f.width, f.height, f.obstacles, f.shapes,
          f.light ? {
            bottom : f.light.bottom,
            shadow : f.light.shadow,
            columns : f.light.columns,
            rows : f.light.rows,
            base : f.light.clear_asset ?? f.light.clear_values
          }
                  : null
        ])
      });
    }
    const key =
        [ c.scale, canvas.width, canvas.height, tank_sceneryState.sceneSignature ].join('/');
    if (key !== tank_sceneryState.sceneryKey || !tank_sceneryState.sceneryCamera ||
        Math.abs(c.ox - tank_sceneryState.sceneryCamera.ox) >
            SCENERY_PADDING * TANK_VIEW.scenery_shift ||
        Math.abs(c.oy - tank_sceneryState.sceneryCamera.oy) >
            SCENERY_PADDING * TANK_VIEW.scenery_shift) {
      const width = Math.ceil((cameraState.viewportWidth + 2 * SCENERY_PADDING) *
                              cameraState.pixelRatio),
            height = Math.ceil((cameraState.viewportHeight + 2 * SCENERY_PADDING) *
                               cameraState.pixelRatio);
      if (scenery.width !== width)
        scenery.width = width;
      if (scenery.height !== height)
        scenery.height = height;
      updateTankSceneryState({sceneryCamera : {...c}});
      paintScenery(f, {...c, ox : c.ox + SCENERY_PADDING, oy : c.oy + SCENERY_PADDING});
      updateTankSceneryState({sceneryKey : key});
    }
    ctx.fillStyle = TANK_VIEW.background;
    ctx.fillRect(0, 0, cameraState.viewportWidth, cameraState.viewportHeight);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y(0), cameraState.viewportWidth, f.height * c.scale);
    ctx.clip();
    ctx.drawImage(scenery, c.ox - tank_sceneryState.sceneryCamera.ox - SCENERY_PADDING,
                  c.oy - tank_sceneryState.sceneryCamera.oy - SCENERY_PADDING,
                  scenery.width / cameraState.pixelRatio, scenery.height / cameraState.pixelRatio);
    for (const shift of horizontalShifts(f, c))
      paintSourceMarkers(f, {...c, ox : c.ox + shift * c.scale});
    if (globalThis.document?.getElementById?.('layer-light')?.checked !== false)
      for (const shift of horizontalShifts(f, c))
        paintCloudLight(f, {...c, ox : c.ox + shift * c.scale});
    paintGpuSurface(f, c, horizontalShifts(f, c), null, false, blend);
    fpsReport?.mark('background');
    const shifts = horizontalShifts(f, c).filter(
        shift => c.ox + (shift + f.width) * c.scale >= -TANK_VIEW.margin &&
                 c.ox + shift * c.scale <= cameraState.viewportWidth + TANK_VIEW.margin);
    for (const shift of shifts) {
      const tile = {...c, ox : c.ox + shift * c.scale};
      paintDriftTile(f, tile, blend);
      drawObservations(f, tile, blend);
      fpsReport?.mark('observations');
    }
    ctx.save();
    clipObstacles(f, c, ctx,
                  {x : 0, y : 0, w : cameraState.viewportWidth, h : cameraState.viewportHeight});
    paintAnimals(f, c, blend, shifts, true);
    ctx.restore();
    const remains = (f.corpses || []).find(p => f.selected && p[CORPSE.source_id] === f.selected);
    if (remains) {
      const p = blendParticle(remains, sceneState.previousCorpses, CORPSE.id, blend),
            q = worldToScreen({x : p[CORPSE.x], y : p[CORPSE.y]}, c);
      ctx.save();
      ctx.translate(q.x, q.y);
      paintSelection(ctx, p[CORPSE.radius] * c.scale, TANK_VIEW.selected);
      ctx.restore();
    }
    fpsReport?.mark('corpses');
    ctx.save();
    clipObstacles(f, c, ctx,
                  {x : 0, y : 0, w : cameraState.viewportWidth, h : cameraState.viewportHeight});
    const visible = paintAnimals(f, c, blend, shifts, false, -1);
    ctx.restore();
    for (const {p, embryo} of visible) {
      if (embryo)
        continue;
      const q = worldToScreen({x : p[FISH.x], y : p[FISH.y]}, c),
            selected = p[FISH.id] === f.selected;
      if (selected || isSickFish(p) && sceneState.highlightSick ||
          sceneState.highlightSpecies && p[FISH.species] === sceneState.highlightSpecies) {
        ctx.save();
        ctx.translate(q.x, q.y);
        paintSelection(ctx, fishBodyRadius(p) * c.scale,
                       selected                   ? TANK_VIEW.selected
                       : sceneState.highlightSick ? TANK_VIEW.sick
                                                  : TANK_VIEW.species);
        ctx.restore();
      }
      if (selected && selectionOpacity(fishBodyRadius(p) * c.scale) > 0) {
        ctx.font = '11px system-ui';
        ctx.fillStyle = TANK_VIEW.label;
        ctx.fillText(fishLabel(p[FISH.id]), q.x + fishBodyRadius(p) * c.scale + TANK_VIEW.label_dx,
                     q.y - TANK_VIEW.label_dy);
      }
    }
    paintVision(f, c);
    fpsReport?.mark('fish');
    paintBlood(f, c, blend, shifts);
    let sedimentPointer = null;
    if (hoverState.tankPointer && !evolutionState.editing && !brainState.brainOpen) {
      const local =
          canvasPoint({clientX : hoverState.tankPointer.x, clientY : hoverState.tankPointer.y});
      if (tankSedimentHit(screenToWorld(local), f))
        sedimentPointer = local;
    }
    paintGpuSurface(f, c, shifts, sedimentPointer, true, blend);
    ctx.save();
    clipObstacles(f, c, ctx,
                  {x : 0, y : 0, w : cameraState.viewportWidth, h : cameraState.viewportHeight});
    if (c.scale >= ZOOM.detail && c.scale < ZOOM.close)
      for (const shift of shifts)
        paintGpuFood(f, {...c, ox : c.ox + shift * c.scale}, blend, 'ground');
    if (c.scale >= ZOOM.detail) {
      const order = bedRenderOrder(f, c, shifts, blend, visible);
      tankState.pickingFrame = f;
      tankState.pickingOrder = new Map(order.map((q, i) => [pickingKey(q.kind, q.p), i + 1]));
      for (let i = 0; i < order.length;) {
        const kind = order[i].kind, group = [];
        while (i < order.length && order[i].kind === kind) {
          const next = order[i];
          if (kind === 'plant' &&
              group.some(q => q.foot.left < next.foot.right && q.foot.right > next.foot.left &&
                              q.foot.top < next.foot.y && q.foot.y > next.foot.top))
            break;
          group.push(order[i++]);
        }
        if (kind === 'fish') {
          const fishBatch = group.map(q => q.item);
          paintAnimals(f, c, blend, shifts, false, {items : fishBatch});
          ctx.save();
          clipSediment(f, c, ctx, shifts, blend, fishBatch);
          paintFeeding(f, c, blend, fishBatch.map(v => v.p));
          paintCombat(f, c, displayNow(), new Set(fishBatch.map(v => v.p[FISH.id])));
          ctx.restore();
        } else if (kind === 'plant') {
          paintGpuGrass(f, c, blend, shifts, {ids : group.map(q => q.p[PLANT.id])});
          for (const q of group)
            for (const shift of shifts)
              paintBedOpenings(f, {...c, ox : c.ox + shift * c.scale}, blend, null, q.p);
        } else if (kind === 'food') {
          for (const shift of shifts)
            paintGpuFood(f, {...c, ox : c.ox + shift * c.scale}, blend,
                         {ids : group.map(q => q.p[FOOD.id])});
        } else {
          for (const shift of shifts) {
            const tile = {...c, ox : c.ox + shift * c.scale};
            paintGpuSmallAnimals(f, tile, blend, {
              ids : group.filter(q => q.p[INVERTEBRATE.kind] !== INVERTEBRATE_KIND.grazing)
                        .map(q => q.p[INVERTEBRATE.id])
            });
            for (const q of group)
              paintEcologyFeeding(f, tile, blend, null, q.p);
          }
        }
      }

    } else {
      for (const shift of shifts)
        paintGpuFood(f, {...c, ox : c.ox + shift * c.scale}, blend, 'ground');
      for (let layer = 0; layer < BED_LAYERS; ++layer) {
        paintAnimals(f, c, blend, shifts, false, layer);
        paintGpuGrass(f, c, blend, shifts, layer);
        for (const shift of shifts)
          paintGpuSmallAnimals(f, {...c, ox : c.ox + shift * c.scale}, blend, layer);
      }
    }
    fpsReport?.mark('plants');
    ctx.restore();
    if (globalThis.document?.getElementById?.('layer-turbidity')?.checked !== false)
      for (const shift of shifts)
        paintSuspendedSediment(f, {...c, ox : c.ox + shift * c.scale}, blend);
    fpsReport?.mark('sediment');
    if (sedimentPointer && f.buried?.length) {
      const cover = new Map(f.buried),
            hidden = visible.filter(v => !v.embryo &&
                                         (cover.get(v.p[FISH.id]) || 0) > TANK_VIEW.peek_cover);
      if (hidden.length) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(sedimentPointer.x, sedimentPointer.y, SEDIMENT_PEEK_RADIUS, 0, 2 * Math.PI);
        ctx.clip();
        paintRevealedAnimals(hidden, c, shifts, f, blend);
        ctx.restore();
      }
    }
    if (f.buried?.length) {
      const covered = new Map(f.buried);
      for (const raw of f.fish) {
        if (f.visibleFish && !f.visibleFish.has(raw[FISH.id]))
          continue;
        if ((covered.get(raw[FISH.id]) || 0) < TANK_VIEW.buried_cover)
          continue;
        const p = blendFish(raw, blend);
        for (const shift of shifts) {
          const sx = x(wrapScreenX(p[FISH.x]) + shift), sy = y(p[FISH.y]);
          if (sx < 0 || sx > cameraState.viewportWidth || sy < 0 || sy > cameraState.viewportHeight)
            continue;
          ctx.strokeStyle =
              raw[FISH.id] === f.selected ? TANK_VIEW.buried_selected : TANK_VIEW.buried;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(sx, sy - TANK_VIEW.marker);
          ctx.lineTo(sx + TANK_VIEW.marker, sy);
          ctx.lineTo(sx, sy + TANK_VIEW.marker);
          ctx.lineTo(sx - TANK_VIEW.marker, sy);
          ctx.closePath();
          ctx.stroke();
          if (raw[FISH.id] === f.selected) {
            ctx.font = '11px system-ui';
            ctx.fillStyle = TANK_VIEW.buried_selected;
            ctx.fillText(t('tank.imSediment'), sx + TANK_VIEW.label_dx,
                         sy + TANK_VIEW.buried_label_dy);
          }
        }
      }
    }

    fpsReport?.mark('buried');
    paintThoughtBubbles(f, c, blend, shifts);
    brainDrawOverlay(f, c);
    fpsReport?.mark('brain');
    if (c.scale < ZOOM.detail && sceneEffectsPending(f, c, blend)) {
      ctx.save();
      clipObstacles(f, c, ctx,
                    {x : 0, y : 0, w : cameraState.viewportWidth, h : cameraState.viewportHeight});
      clipSediment(f, c, ctx, shifts, blend);
      paintCombat(f, c);
      paintFeeding(f, c, blend);
      ctx.restore();
    }
    ctx.restore();
    if (evolutionState.editing || worldState.placingEggs)
      drawToolPreview(f, c);
    paintGrowthBoosts(f, x, y, shifts);
    paintObjectMenu();
    tankHoverUpdate();
    fpsReport?.mark('overlay');
    ctx.endFrame(f.render_epoch + ':' + displayStep(f));
    fpsReport?.mark('finish');
  } catch (error) {
    draw.idleStamp = null;
    throw error;
  } finally {
    updateSceneState({renderTime : priorRenderTime});
    updateSceneState({renderScale : priorRenderScale});
  }
}

// Display faults are shown at most once per ERROR_STATUS_MS.
const ANIMATE = Object.freeze({error_status_ms : 1000});
export function animate(now) {
  try {
    displayFaults.run(t('tank.animation'), () => {
      fpsReport?.begin(now);
      displayFaults.run(t('tank.bilduebernahme'), advanceScene);
      fpsReport?.mark('scene');
      displayFaults.run(t('tank.fpsDisplay'), () => updateFps(now));
      fpsReport?.mark('cadence');
      draw();
      displayFaults.run(t('tank.aufloesung'), () => adaptResolution(now));
      displayFaults.run(t('tank.artenvorschau'), animateSpecies);
      displayFaults.run(t('tank.fischvorschau'), animateSelectedFish);
      fpsReport?.mark('previews');
      fpsReport?.end();
    });
    if (displayFaults.issues.size &&
        (!animate.errorStatusAt || now - animate.errorStatusAt > ANIMATE.error_status_ms)) {
      animate.errorStatusAt = now;
      displayFaults.paint();
    }
  } catch (error) {
    displayFaults.report(t('tank.animation'), error);
  } finally {
    requestAnimationFrame(animate);
  }
}

const initializers = {
  "onpointerdown" : () => {
    canvas.onpointerdown = e => {
      if (typeof tankHideTooltip === 'function') {
        updateHoverState({tankPointer : null});
        tankHideTooltip(true);
      }
      if (!sceneState.frame || sessionState.busy || ![0, 1].includes(e.button))
        return;
      camera();
      if (e.button === 0 && !evolutionState.editing && !worldState.placingEggs &&
          !brainState.brainOpen && !sceneState.frame.historical) {
        const q = canvasPoint(e), menu = tankState.contextMenu;
        if (menu && Math.hypot(q.x - menu.x, q.y - menu.y) <= MENU.reach) {
          menu.pressed = true;
          menu.choice = radialChoice(menu, q.x, q.y);
          sceneState.renderInputRevision++;
          canvas.setPointerCapture?.(e.pointerId);
          return;
        }
        if (openObjectMenu(tankHit({x : e.clientX, y : e.clientY}, true), e)) {
          canvas.setPointerCapture?.(e.pointerId);
          return;
        }
      }
      tankState.contextMenu = null;
      updateCameraState({
        drag : {
          x : e.clientX,
          y : e.clientY,
          cx : cameraState.cameraX,
          cy : cameraState.cameraY,
          pan : e.button === 1
        }
      });
      canvas.setPointerCapture?.(e.pointerId);
    };
  },
  "onpointermove" : () => {
    canvas.onpointermove = e => {
      if (tankState.contextMenu) {
        const m = tankState.contextMenu, q = canvasPoint(e);
        m.choice = radialChoice(m, q.x + (m.opened ? 0 : m.x - m.startedX),
                                q.y + (m.opened ? 0 : m.y - m.startedY));
        sceneState.renderInputRevision++;
        return;
      }
      if (typeof tankHoverMove === 'function')
        tankHoverMove(e);
      if (typeof brainCanvasHover === 'function')
        brainCanvasHover(e);
      if (!cameraState.drag || !sceneState.frame)
        return;
      if (Math.hypot(e.clientX - cameraState.drag.x, e.clientY - cameraState.drag.y) > POINTER.drag)
        updateCameraState({drag : {...cameraState.drag, pan : true}});
      if (cameraState.drag.pan) {
        setFollowing(false);
        const r = canvas.getBoundingClientRect(), scale = camera().scale;
        updateCameraState({
          cameraX : cameraState.drag.cx - (e.clientX - cameraState.drag.x) *
                                              cameraState.viewportWidth / r.width / scale
        });
        updateCameraState({
          cameraY : cameraState.drag.cy - (e.clientY - cameraState.drag.y) *
                                              cameraState.viewportHeight / r.height / scale
        });
        camera();
        if (!evolutionState.editing &&
            sceneState.frame.fish.some(p => p[FISH.id] === sceneState.frame.selected &&
                                            p[FISH.hatched]))
          setFollowing(true, true);
      }
    };
  },
  "onpointerup" : () => {
    canvas.onpointerup = e => {
      const menu = tankState.contextMenu;
      if (menu) {
        menu.pressed = false;
        // A click opens; dragging or a second click selects. The center cancels.
        if (menu.choice >= 0)
          runObjectAction(menu);
        else if (menu.opened) {
          tankState.contextMenu = null;
          sceneState.renderInputRevision++;
        } else
          menu.opened = true;
        canvas.releasePointerCapture?.(e.pointerId);
        return;
      }
      if (cameraState.drag && !cameraState.drag.pan && typeof brainCanvasClick === 'function' &&
          brainCanvasClick({
            clientX : e.clientX ?? cameraState.drag.x,
            clientY : e.clientY ?? cameraState.drag.y
          })) {
        updateCameraState({drag : null});
        return;
      }
      if (cameraState.drag && !cameraState.drag.pan) {
        const click = {
          clientX : e.clientX ?? cameraState.drag.x,
          clientY : e.clientY ?? cameraState.drag.y
        };
        const hit = tankHit({x : click.clientX, y : click.clientY}, true);
        if (!hit && !evolutionState.editing && !worldState.placingEggs && !brainState.brainOpen &&
            !sceneState.frame.historical && openObjectMenu(backgroundMenuHit(click), click)) {
          tankState.contextMenu.pressed = false;
          tankState.contextMenu.opened = true;
          updateCameraState({drag : null});
          return;
        }
        if (!hit && !evolutionState.editing && !worldState.placingEggs) {
          if (evolutionState.selectedSpecies || sceneState.highlightSpecies ||
              sceneState.highlightSick || evolutionState.previewSpecies)
            deselectSpecies();
          selectFish(0);
          updateCameraState({drag : null});
          canvas.releasePointerCapture?.(e.pointerId);
          return;
        }
        const nearest = hit?.kind === 'fish' ? hit.item : null;
        const selectedId =
            nearest?.[FISH.id] || (hit?.kind === 'corpse' ? hit.item[CORPSE.source_id] : 0);
        if (hit?.kind === 'corpse')
          selectFish(selectedId, {follow : false});
        else if (brainState.brainOpen) {
          if (nearest && nearest[FISH.id] !== sceneState.frame.selected)
            selectFish(nearest[FISH.id], {follow : cameraState.following, details : false});
          else {
            updateSessionState({neuronFocus : -1});
            updateBrainState({brainPinnedTissue : ''});
            updateBrainState({brainDrawingKey : ''});
          }
        } else
          selectFish(selectedId || 0);
      }
      updateCameraState({drag : null});
    };
  },
  "onpointercancel" : () => {
    canvas.onpointercancel = () => {
      tankState.contextMenu = null;
      updateCameraState({drag : null});
      sceneState.renderInputRevision++;
    };
    window.addEventListener('keydown', e => {
      if (e.key === KEY.escape) {
        tankState.contextMenu = null;
        sceneState.renderInputRevision++;
      }
    });
  },
  "ctx_onRestore" : () => {
    canvas.addEventListener?.(
        'webglcontextlost',
        () => displayFaults.report(t('tank.grafik'),
                                   Error(t('tank.grafikkontextVerlorenWiederherstellungLaeuft'))));
    ctx.onRestore = () => {
      resetTankBatches();
      updateTankSceneryState({sceneryKey : ''});
      draw.error = null;
      displayFaults.clear(t('tank.grafik'));
      displayFaults.clear(t('tank.tank'));
      sceneState.renderInputRevision++;
      draw.idleStamp = null;
    };
    // Markers switched on or off appear at once, also while the run is paused.
    for (const id of ['show-current-sources', 'show-food-sources', 'show-plankton-sources'])
      el(id)?.addEventListener?.('change', () => {
        updateTankSceneryState({sceneryKey : ''});
        sceneState.renderInputRevision++;
        draw.idleStamp = null;
      });
  },
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
