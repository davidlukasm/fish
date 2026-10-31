import {fishLabel} from './fish_names.js';
import {t} from './strings.js';
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
  PLANT
} from './schema.js';
import {displayFaults} from './diagnostics.js';
import {adaptResolution, updateCameraState} from './camera.js';
import {updateBrainState} from './brain.js';
import {updateSessionState, command} from './session.js';
import {updateHoverState} from './hover.js';
import {updateSceneState} from './state.js';
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
  blendFish,
  blendParticle,
  advanceScene,
  displayStep,
  displayNow,
  frameBlend,
  frameFish,
  horizontalDelta,
  horizontalShifts,
  sceneState,
  selectFish,
  wrapScreenX
} from './state.js';
import {
  paintScenery,
  paintSourceMarkers,
  paintBedOpenings,
  scenery,
  sceneryPadding,
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
import {drawAnimalChoice, drawPlantChoice} from './world_palette.js';
import {plantCurveClear, plantRenderParts} from './plant_geometry.js';
export const tankState = {};

// The target ID stays captured while a moving animal leaves the pointer.
export function objectActions(hit) {
  if (hit?.kind === 'plant')
    return [
      {id : 'inspect', label : t('tank.ansehen')},
      ...(!hit.item[PLANT.root]?.[2] ? [ {id : 'encourage', label : t('tank.wachsen')} ] : []),
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
        plant : 0,
        children : [
          t('tank.feingras'), t('tank.bandgras'), t('tank.lanzett'), t('tank.rundblatt'),
          t('tank.staengel'), t('tank.fieder')
        ].map((label, plant) => ({id : 'place', tool : 'grass', label, plant}))
      },
      ...['worms', 'crabs'].map(
          (tool, i) => ({
            id : tool,
            label : i ? t('tank.krabben') : t('tank.wuermer'),
            tool,
            children : [ 0, 1, 2, 3 ].map(
                family =>
                    ({id : 'place', tool, family, label : [ 'I', 'II', 'III', 'IV' ][family]}))
          }))
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
export function radialChoice(menu, x, y) {
  if (Math.hypot(x - menu.x, y - menu.y) < 24)
    return -1;
  const angle = (Math.atan2(y - menu.y, x - menu.x) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
  return Math.floor((angle + Math.PI / menu.actions.length) / (2 * Math.PI / menu.actions.length)) %
         menu.actions.length;
}
function openObjectMenu(hit, e) {
  const actions = objectActions(hit);
  if (!actions.length)
    return false;
  const q = canvasPoint(e), margin = 100;
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
  if (action.id === 'place') {
    const site = action.tool === 'spray' ? hit : plantPlacement(hit, sceneState.frame, action.tool);
    if (!site || (site.distance ?? 0) > Math.max(60, hit.depth || 0))
      return;
    command(action.tool, {
      x : wrapScreenX(site.anchorX ?? site.x),
      y : site.anchorY ?? site.y,
      radius : action.tool === 'grass' ? 5 : 12,
      count : action.count ?? 1,
      plant : action.plant ?? -1,
      morph : (action.family ?? 0) + .5,
      amount : 1
    });
    return;
  }
  const plant = hit.kind === 'plant', id = hit.item[plant ? PLANT.id : INVERTEBRATE.id],
        item = currentMenuItem(hit);
  if (action.id === 'bite-plant')
    command('bite-plant',
            {kind : FOOD_KIND.plant, id, organ : hit.organ.stem, along : hit.along ?? .5});
  else if (action.id === 'crush' || action.id === 'encourage') {
    command(action.id, {
      kind : plant ? FOOD_KIND.plant : item[INVERTEBRATE.kind],
      id,
      organ : plant ? hit.organ.stem : -1,
      along : plant ? hit.along ?? 0 : 0
    });
    if (plant && action.id === 'encourage')
      (tankState.boosts ??= new Map()).set(id, displayStep() + 400);
  } else if (action.id === 'startle')
    command('startle', {
      x : wrapScreenX(item[INVERTEBRATE.x]),
      y : item[INVERTEBRATE.y],
      radius : Math.min(120, Math.max(40, item[INVERTEBRATE.radius] * 3))
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
function paintGrowthBoosts(f, x, y, shifts) {
  const boosts = tankState.boosts;
  if (!boosts?.size)
    return;
  const now = displayStep(f), c = camera(f), pulse = .5 + .5 * Math.sin(performance.now() / 260);
  ctx.save();
  ctx.lineCap = 'round';
  for (const [id, until] of boosts) {
    if (now >= until || until - now > 800) {
      boosts.delete(id);
      continue;
    }
    const p = (f.plants || []).find(q => q[0] === id);
    if (!p)
      continue;
    const fade = Math.min(1, (until - now) / 60);
    for (const part of plantRenderParts(p)) {
      const q = grassPartPose(p, part, f).q;
      for (const shift of shifts) {
        const dx = wrapScreenX(q[0]) - q[0] + shift;
        ctx.globalAlpha = fade * (.18 + .32 * pulse);
        ctx.strokeStyle = '#c9ff8a';
        ctx.lineWidth = Math.max(3, part.width * c.scale * 2 + 4 + 3 * pulse);
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
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.lineWidth = 1.5;
  const n = m.actions.length, angle = 2 * Math.PI / n;
  for (let i = 0; i < n; ++i) {
    const center = -Math.PI / 2 + i * angle, lo = center - angle / 2 + .035,
          hi = center + angle / 2 - .035;
    ctx.fillStyle = m.choice === i ? '#496f6bf5' : '#142e36ee';
    ctx.strokeStyle = m.choice === i ? '#d8e8d6' : '#71918b';
    ctx.beginPath();
    ctx.arc(0, 0, 92, lo, hi);
    ctx.arc(0, 0, 25, hi, lo, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const x = Math.cos(center) * 59, y = Math.sin(center) * 59;
    ctx.save();
    ctx.translate(x, y - 5);
    ctx.strokeStyle = '#d7e7d9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const action = m.actions[i];
    if (action.plant !== undefined) {
      drawPlantChoice(ctx, action.plant, 0, 7, .65);
    } else if ([ 'crabs', 'worms' ].includes(action.tool)) {
      drawAnimalChoice(ctx, action.tool, action.family ?? 0, 0, 5, .75);
    } else if (action.tool === 'spray') {
      ctx.fillStyle = '#eea56e';
      for (let k = 0; k < 5; ++k) {
        ctx.beginPath();
        ctx.arc((k % 3 - 1) * 6, Math.floor(k / 3) * 6 - 3, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (action.id === 'back') {
      ctx.moveTo(9, 0);
      ctx.lineTo(-8, 0);
      ctx.lineTo(-2, -6);
      ctx.moveTo(-8, 0);
      ctx.lineTo(-2, 6);
      ctx.stroke();
    } else if (action.id === 'encourage') {
      if (m.hit.kind === 'plant') {
        drawPlantChoice(ctx, 0, 0, 8, .65);
      } else {
        ctx.arc(3, 0, 9, -.8, .8, true);
        ctx.lineTo(3, 0);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = '#dfc991';
        ctx.beginPath();
        ctx.arc(12, 0, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (action.id === 'bite-plant') {
      // Open jaws with a row of teeth.
      ctx.moveTo(-10, -7);
      ctx.quadraticCurveTo(0, 2, 10, -7);
      ctx.moveTo(-10, 7);
      ctx.quadraticCurveTo(0, -2, 10, 7);
      for (const s of [-1, 1])
        for (let k = -1; k <= 1; ++k) {
          ctx.moveTo(k * 5 - 2, s * (k ? 3 : 1.5));
          ctx.lineTo(k * 5, s * (k ? 0 : -1.5));
          ctx.lineTo(k * 5 + 2, s * (k ? 3 : 1.5));
        }
      ctx.stroke();
    } else if (action.id === 'inspect') {
      ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#d7e7d9';
      ctx.fill();
    } else if (m.actions[i].id === 'startle') {
      for (let k = 0; k < 3; ++k) {
        ctx.moveTo(-9 + k * 6, 6);
        ctx.lineTo(-6 + k * 6, -3);
        ctx.lineTo(-3 + k * 6, 2);
      }
      ctx.stroke();
    } else {
      ctx.moveTo(-10, -5);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-10, 5);
      ctx.moveTo(10, -5);
      ctx.lineTo(3, 0);
      ctx.lineTo(10, 5);
      ctx.moveTo(0, -8);
      ctx.lineTo(-2, -1);
      ctx.lineTo(2, 2);
      ctx.lineTo(0, 8);
      ctx.stroke();
    }
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ecf1e6';
    ctx.fillText(m.actions[i].label, 0, 20);
    ctx.restore();
  }
  ctx.strokeStyle = '#aac4bc';
  ctx.beginPath();
  ctx.moveTo(-4, -4);
  ctx.lineTo(4, 4);
  ctx.moveTo(-4, 4);
  ctx.lineTo(4, -4);
  ctx.stroke();
  ctx.restore();
}

export function foodColor() { return 'rgb(255,51,26)'; }

function paintDriftTile(f, c, blend) {
  if (globalThis.document?.getElementById?.('layer-plankton')?.checked !== false)
    paintPlankton(f, c);
  paintGpuFood(f, c, blend);
  fpsReport?.mark('food');
  paintGpuGametes(f, c, blend);
  fpsReport?.mark('gametes');
}

function selectionOpacity(r) {
  const t = Math.max(0, Math.min(1, (36 - r) / 20));
  return t * t * (3 - 2 * t);
}

export function paintSelection(ctx, r, color) {
  const alpha = selectionOpacity(r);
  if (alpha <= 0)
    return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  const edge = r + 4, arm = Math.max(3, r * .25);
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

function paintTank(f) {
  if (!f || f.binary_scene && !f.visibleFish || f.turbo || ctx.lost)
    return false;
  const idle = f.paused && frameBlend() >= 1 && !evolutionState.editing && !cameraState.drag &&
               brainState.brainOpacity < .005 && !sceneState.eggBirths.size &&
               !sceneState.maternalBirths.size,
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
        Math.abs(c.ox - tank_sceneryState.sceneryCamera.ox) > sceneryPadding * .6 ||
        Math.abs(c.oy - tank_sceneryState.sceneryCamera.oy) > sceneryPadding * .6) {
      const width = Math.ceil((cameraState.viewportWidth + 2 * sceneryPadding) *
                              cameraState.pixelRatio),
            height = Math.ceil((cameraState.viewportHeight + 2 * sceneryPadding) *
                               cameraState.pixelRatio);
      if (scenery.width !== width)
        scenery.width = width;
      if (scenery.height !== height)
        scenery.height = height;
      updateTankSceneryState({sceneryCamera : {...c}});
      paintScenery(f, {...c, ox : c.ox + sceneryPadding, oy : c.oy + sceneryPadding});
      updateTankSceneryState({sceneryKey : key});
    }
    ctx.fillStyle = '#091d25';
    ctx.fillRect(0, 0, cameraState.viewportWidth, cameraState.viewportHeight);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y(0), cameraState.viewportWidth, f.height * c.scale);
    ctx.clip();
    ctx.drawImage(scenery, c.ox - tank_sceneryState.sceneryCamera.ox - sceneryPadding,
                  c.oy - tank_sceneryState.sceneryCamera.oy - sceneryPadding,
                  scenery.width / cameraState.pixelRatio, scenery.height / cameraState.pixelRatio);
    for (const shift of horizontalShifts(f, c))
      paintSourceMarkers(f, {...c, ox : c.ox + shift * c.scale});
    if (globalThis.document?.getElementById?.('layer-light')?.checked !== false)
      for (const shift of horizontalShifts(f, c))
        paintCloudLight(f, {...c, ox : c.ox + shift * c.scale});
    paintGpuSurface(f, c, horizontalShifts(f, c), null, false, blend);
    fpsReport?.mark('background');
    const shifts = horizontalShifts(f, c).filter(
        shift => c.ox + (shift + f.width) * c.scale >= -80 &&
                 c.ox + shift * c.scale <= cameraState.viewportWidth + 80);
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
      paintSelection(ctx, p[CORPSE.radius] * c.scale, '#faf5db');
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
                       selected                   ? '#faf5db'
                       : sceneState.highlightSick ? '#ff214c'
                                                  : '#a2d9c6');
        ctx.restore();
      }
      if (selected && selectionOpacity(fishBodyRadius(p) * c.scale) > 0) {
        ctx.font = '11px system-ui';
        ctx.fillStyle = '#edf5e4';
        ctx.fillText(fishLabel(p[FISH.id]), q.x + fishBodyRadius(p) * c.scale + 8, q.y - 6);
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
    if (c.scale >= .7 && c.scale < 1.5)
      for (const shift of shifts)
        paintGpuFood(f, {...c, ox : c.ox + shift * c.scale}, blend, 'ground');
    if (c.scale >= .7) {
      const order = bedRenderOrder(f, c, shifts, blend, visible);
      tankState.pickingFrame = f;
      tankState.pickingOrder =
          new Map(order.map((q, i) => [q.kind + ':' +
                                           (q.kind === 'plant'  ? q.p[PLANT.id]
                                            : q.kind === 'fish' ? q.p[FISH.id]
                                            : q.kind === 'food' ? q.p[FOOD.id]
                                                                : q.p[INVERTEBRATE.id]),
                                       i + 1]));
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
            hidden = visible.filter(v => !v.embryo && (cover.get(v.p[FISH.id]) || 0) > .05);
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
        if ((covered.get(raw[FISH.id]) || 0) < .5)
          continue;
        const p = blendFish(raw, blend);
        for (const shift of shifts) {
          const sx = x(wrapScreenX(p[FISH.x]) + shift), sy = y(p[FISH.y]);
          if (sx < 0 || sx > cameraState.viewportWidth || sy < 0 || sy > cameraState.viewportHeight)
            continue;
          ctx.strokeStyle = raw[FISH.id] === f.selected ? '#f6e5b0' : '#9ab9b7';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(sx, sy - 4);
          ctx.lineTo(sx + 4, sy);
          ctx.lineTo(sx, sy + 4);
          ctx.lineTo(sx - 4, sy);
          ctx.closePath();
          ctx.stroke();
          if (raw[FISH.id] === f.selected) {
            ctx.font = '11px system-ui';
            ctx.fillStyle = '#f6e5b0';
            ctx.fillText(t('tank.imSediment'), sx + 8, sy + 13);
          }
        }
      }
    }

    fpsReport?.mark('buried');
    paintThoughtBubbles(f, c, blend, shifts);
    brainDrawOverlay(f, c);
    fpsReport?.mark('brain');
    if (c.scale < .7 && sceneEffectsPending(f, c, blend)) {
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
        (!animate.errorStatusAt || now - animate.errorStatusAt > 1000)) {
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
        if (menu && Math.hypot(q.x - menu.x, q.y - menu.y) <= 110) {
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
      if (Math.hypot(e.clientX - cameraState.drag.x, e.clientY - cameraState.drag.y) > 5)
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
      if (e.key === 'Escape') {
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
