import {FISH, FOOD} from './schema.js';
import {t, formatNumber} from './strings.js';
import {brainClamp, brainState} from './brain.js';
import {
  brainLocal,
  brainPigmentRadius,
  brainPigmentStar,
  brainPigmentState
} from './brain_geometry.js';
import {brainScreenPoint} from './brain_input.js';
import {
  brainHSV,
  brainMotorColors,
  brainReduced,
  brainScentRGB,
  brainScentWeights,
  brainSenseColors,
  cellColor
} from './brain_model.js';
import {
  brainClipTissue,
  brainGeometry,
  brainPathBounds,
  brainPointVisible,
  brainPreparedPath,
  brainTissueGeometry
} from './brain_occlusion.js';
import {brainConnection, brainCurvePoint, brainDrawCurve} from './brain_paths.js';
import {
  brainArrivalValue,
  brainCollectArrivals,
  brainMotorActivity,
  brainMotorColor,
  brainMuscleState,
  brainSignalCurve,
  brain_signalsState
} from './brain_signals.js';
import {
  brainCellOpacity,
  brainDrawInterior,
  brainDrawMuscles,
  brainDrawTissue,
  brainTissuePath
} from './brain_tissue.js';
import {cameraState, worldToScreen} from './camera.js';
import {TankLayer} from './renderer.js';
import {ctx, rgb} from './dom.js';
import {
  fishJawEdge,
  fishMouthPath,
  fishMouthInterior,
  fishMouthShape,
  fishSuctionFlow,
} from './fish_organs.js';
import {sessionState} from './session.js';
import {displayNow, horizontalDelta, sceneState} from './state.js';
export const brain_painterState = {};

function brainDrawMouth(g, d) {
  const a = d.a;
  if (!a.jaw && !a.attack)
    return;
  const r = d.r, q = fishMouthShape(a);
  g.save();
  g.translate(d.cx, d.cy);
  g.rotate(d.angle);
  fishMouthPath(g, r, a);
  g.fillStyle = '#081b23';
  g.globalAlpha = 1;
  g.fill();
  g.lineCap = 'round';
  for (let side = 0; side < 2; side++) {
    g.beginPath();
    for (let i = 0; i <= 16; i++) {
      const p = fishJawEdge(a, side, i / 16);
      if (i)
        g.lineTo(p[0] * r, p[1] * r);
      else
        g.moveTo(p[0] * r, p[1] * r);
    }
    g.strokeStyle = q.suction > .05 ? '#8cc3cb' : '#ccafa3';
    g.lineWidth = Math.max(.65, r * q.lip);
    g.globalAlpha = .65;
    g.stroke();
  }
  fishMouthInterior(g, r, a);
  fishSuctionFlow(g, r, a);
  g.restore();
}

function brainDrawTissues(g, d, now = displayNow()) {
  g.save();
  g.translate(d.cx, d.cy);
  g.lineCap = 'round';
  for (const tissue of brainGeometry(d).ordered)
    brainDrawTissue(g, d, tissue, now);
  g.restore();
}

function brainDrawCells(g, d, now) {
  g.save();
  for (const parts of d.parts.values())
    for (const part of parts) {
      if (part.visible === undefined)
        part.visible = brainPointVisible(d, d.tissues.get(part.tissue),
                                         brainLocal(part.screen, d).map(v => v * d.r));
      if (part.visible)
        brainDrawPart(g, d.nodes.get(part.neuron), part, d, now);
    }
  g.restore();
}

function brainDrawPart(g, n, part, d, now = displayNow()) {
  const ink = brainCellOpacity(d),
        chosen = n[5] === sessionState.neuronFocus || n[5] === brainState.brainHover?.id,
        p = part.screen;
  if (ink <= 0)
    return;
  const motor = part.key[0] === 'm', k = Number(part.key.slice(1)),
        arrival = brainArrivalValue(n[5], now),
        value = motor
                    ? brainMotorActivity(n, k, d)
                    : brainClamp(Math.abs(part.key[0] === 's' ? (n[19] ?? n[3]) : (n[18] ?? n[3]))),
        dim = n[7] && !n[10] ? 1 : .35,
        radius = Math.max(2.2, Math.min(5.2, 2.2 + Math.log2(Math.max(1, (d.view?.scale || 1) *
                                                                             200 / 300)))) *
                 (1 + .12 * value) / (d.view?.scale || 1);
  g.fillStyle = motor                     ? brainMotorColor(k, brainMuscleState(n, k, d, now))
                : part.key === 'internal' ? '#bdcde7'
                : k === 1 ? rgb(brainScentRGB(brainScentWeights(n, d.receptors.get(n[5]))))
                : k === 0 ? 'hsl(' + 180 * ((n[20]?.[2] ?? 0) + 1) + ',65%,65%)'
                          : brainSenseColors[k];
  g.strokeStyle = '#102530';
  g.lineWidth = .9;
  g.globalAlpha = ink * dim * (.50 + .50 * value);
  g.beginPath();
  g.arc(p[0], p[1], radius, 0, Math.PI * 2);
  g.fill();
  const isolated = (d.wiring.get(n[5]) || [ 0, 0 ]).every(v => v === 0);
  if (isolated)
    g.setLineDash([ 2, 2 ]);
  g.stroke();
  if (isolated)
    g.setLineDash([]);
  const flash = Math.max(arrival.positive, arrival.negative);
  if (flash > .03) {
    g.strokeStyle = g.fillStyle;
    g.globalAlpha = ink * flash;
    g.lineWidth = 1 + flash;
    g.beginPath();
    g.arc(p[0], p[1], radius + 1.2, 0, Math.PI * 2);
    g.stroke();
  }
  if (chosen) {
    g.strokeStyle = '#f3e4bc';
    g.globalAlpha = ink;
    g.lineWidth = 1.3;
    g.beginPath();
    g.arc(p[0], p[1], radius + 2.5, 0, Math.PI * 2);
    g.stroke();
  }
  g.globalAlpha = 1;
}

function brainDrawTissueFocus(g, d) {
  const tissue = d.tissues.get(brainState.brainHover?.tissue || brainState.brainPinnedTissue);
  if (!tissue)
    return;
  const k = Number(tissue.key.slice(1)), color = tissue.key === 'internal' ? '#a7b6d5'
                                                 : tissue.key[0] === 's'   ? brainSenseColors[k]
                                                                           : brainMotorColors[k];
  g.save();
  g.translate(d.cx, d.cy);
  g.rotate(d.angle);
  brainClipTissue(g, d, tissue);
  if (tissue.key === 'm7' && brainState.brainHover?.ids) {
    g.beginPath();
    for (const group of d.pigments.groups)
      if (group.ids[0] === brainState.brainHover.ids[0])
        brainPigmentStar(
            g, group.p[0] * d.r, group.p[1] * d.r,
            brainPigmentRadius(d.r, brainPigmentState(group, d).value, d.pigments.groups.length));
  } else
    brainTissuePath(g, d, tissue.key, tissue.side, tissue.variant);
  g.fillStyle = g.strokeStyle = color;
  g.globalAlpha = .34;
  const line = tissue.variant === 'barbel' || tissue.key === 's2';
  if (line) {
    g.lineWidth = Math.max(3.5, d.r * .02);
    g.stroke();
  } else {
    g.fill();
    g.globalAlpha = .9;
    g.lineWidth = Math.max(1.5, d.r * .008);
    g.stroke();
  }
  if (tissue.key === 'm2') {
    fishMouthPath(g, d.r, d.a);
    g.globalAlpha = .09;
    g.fill();
  }
  g.restore();
}

function brainSourcePosition(x, y, d = brainState.brainDrawing) {
  const p = worldToScreen({x, y}, d.c);
  return [ p.x, p.y ];
}

function brainDrawSources(g, d) {
  const probe = d.b.probe;
  d.sources = [];
  const add = (x, y, radius, color, id, kind) => {
    const q = brainSourcePosition(x, y, d);
    if (q[0] < -20 || q[1] < -20 || q[0] > cameraState.viewportWidth + 20 ||
        q[1] > cameraState.viewportHeight + 20)
      return;
    const distance = Math.hypot(horizontalDelta(x - d.p[0]), y - d.p[1]);
    d.sources.push({screen : q, distance, id, kind});
  };
  for (const p of sceneState.frame.food || [])
    add(p[FOOD.x], p[FOOD.y], p[FOOD.radius], p.slice(FOOD.red, FOOD.blue + 1), p[FOOD.id], 0);
  for (const p of sceneState.frame.fish || [])
    if (p[FISH.id] !== sceneState.frame.selected)
      add(p[FISH.x], p[FISH.y], p[FISH.radius], p.slice(FISH.red, FISH.blue + 1), p[FISH.id], 1);
  if (probe?.remaining > 0 && probe.kind < 2) {
    add(probe.x, probe.y, probe.radius, probe.color, 0, 6);
    const q = brainSourcePosition(probe.x, probe.y, d),
          radius = Math.max(3, probe.radius * d.c.scale);
    g.strokeStyle = probe.kind === 1 ? '#b6a5df' : rgb(probe.color);
    g.fillStyle = g.strokeStyle;
    g.globalAlpha = .22;
    g.beginPath();
    g.arc(...q, radius, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = .9;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(...q, radius, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#e4ede6';
    g.font = '12px system-ui';
    g.textAlign = 'center';
    g.fillText(
        t('units.px', {
          n : formatNumber(Math.hypot(horizontalDelta(probe.x - d.p[0]), probe.y - d.p[1]), 1, true)
        }),
        brainClamp(q[0], 45, cameraState.viewportWidth - 45),
        brainClamp(q[1] + radius + 18, 20, cameraState.viewportHeight - 16));
  }
  const focus = brainState.brainHover?.id ?? sessionState.neuronFocus,
        hits = (d.b.visual_contributions || [])
                   .filter(h => h[0] === focus)
                   .sort((a, b) => b[6] - a[6])
                   .slice(0, 3);
  for (const hit of hits) {
    const part = d.parts.get(hit[0])?.find(p => p.key === 's0');
    if (!part)
      continue;
    const source = brainSourcePosition(hit[3], hit[4], d),
          target = brainScreenPoint(part.screen, d), dx = target[0] - source[0],
          dy = target[1] - source[1], length = Math.hypot(dx, dy),
          radius = Math.min(length, hit[5] * d.c.scale),
          x = source[0] + dx / Math.max(1, length) * radius,
          y = source[1] + dy / Math.max(1, length) * radius;
    g.strokeStyle = rgb(hit.slice(7, 10).map(c => .25 + .75 * c));
    g.globalAlpha = .45 + .4 * brainClamp(hit[6]);
    g.lineWidth = 1.2;
    g.setLineDash([ 4, 4 ]);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(...target);
    g.stroke();
    g.setLineDash([]);
    g.beginPath();
    g.arc(...target, 3, 0, Math.PI * 2);
    g.stroke();
  }
  if (brainState.brainProbeArmed && brainState.brainPointer) {
    g.strokeStyle =
        brainState.brainTool === 'scent' ? '#b6a5df' : rgb(brainHSV(brainState.brainHue));
    g.globalAlpha = .8;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(brainState.brainPointer.x, brainState.brainPointer.y, 6, 0, Math.PI * 2);
    g.moveTo(brainState.brainPointer.x - 10, brainState.brainPointer.y);
    g.lineTo(brainState.brainPointer.x + 10, brainState.brainPointer.y);
    g.moveTo(brainState.brainPointer.x, brainState.brainPointer.y - 10);
    g.lineTo(brainState.brainPointer.x, brainState.brainPointer.y + 10);
    g.stroke();
  }
  g.globalAlpha = 1;
}

function brainSignalPointVisible(d, packet, point) {
  const local = brainLocal(point, d).map(v => v * d.r),
        keys = new Set([
          ...(d.parts.get(packet.source) || []), ...(d.parts.get(packet.target) || [])
        ].map(p => p.tissue));
  for (const t of brainGeometry(d).ordered) {
    if (!['s4', 's7', 's8', 'm8', 'm9', 'm3', 'm4', 'm2', 'm5', 's1', 's0'].includes(t.key) ||
        t.variant === 'barbel' || keys.has(t.key + ':' + t.side))
      continue;
    const path = brainTissueGeometry(d, t), b = brainPathBounds(path);
    if (local[0] >= b.left && local[0] <= b.right && local[1] >= b.top && local[1] <= b.bottom &&
        brainPreparedPath(path).isPointInPath(...local))
      return false;
  }
  return true;
}

function brainDrawArrivals(g, d, now) {
  for (const [id, event] of brain_signalsState.brainArrivals) {
    const age = now - event.at;
    if (age < 0 || age > 280)
      continue;
    const arrival = brainArrivalValue(id, now),
          strength = Math.max(arrival.positive, arrival.negative);
    if (strength < .03)
      continue;
    const curve = brainSignalCurve(event, d), p = curve ? curve.slice(-2) : d.anchors.get(id);
    if (!p)
      continue;
    const node = d.nodes.get(id), parts = d.parts.get(id) || [],
          dominant = parts.reduce((a, b) => !a || b.share > a.share ? b : a, null);
    if (event.motor === 7 || dominant && !brainPointVisible(d, d.tissues.get(dominant.tissue),
                                                            brainLocal(p, d).map(v => v * d.r)))
      continue;
    const tint = event.motor >= 0 ? brainMotorColors[event.motor]
                 : node           ? cellColor(node)
                                  : '#bdcde7',
          base = Math.max(3.5, Math.min(8, d.r * .018)), radius = base * (.7 + .7 * age / 280);
    g.save();
    g.strokeStyle = g.fillStyle = tint;
    g.globalAlpha = strength * .35 * (1 - age / 280);
    g.beginPath();
    g.arc(p[0], p[1], radius * 1.7, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = brainClamp(strength * 1.3) * (1 - age / 280);
    g.lineWidth = 1.4 + strength;
    g.beginPath();
    g.arc(p[0], p[1], radius, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(p[0], p[1], Math.max(1.6, base * .38) * (1 - age / 280), 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

// Mixed-cell links are static within a geometry frame and share one stroke per style.
export function brainDrawMixed(g, d) {
  if (d.cellDetail < .45)
    return;
  g.save();
  g.lineWidth = .8;
  g.setLineDash([ 2, 4 ]);
  for (const selected of [false, true]) {
    g.strokeStyle = selected ? '#d5cbaa' : '#81969b';
    g.globalAlpha = selected ? .6 : .30;
    g.beginPath();
    for (const n of d.b.neurons) {
      if ((n[5] === sessionState.neuronFocus) !== selected)
        continue;
      const parts = d.parts.get(n[5]);
      if (parts.length < 2)
        continue;
      const main = parts.reduce((a, b) => a.share >= b.share ? a : b);
      for (const part of parts) {
        if (part === main)
          continue;
        part.mixedCurve ??= brainConnection(d, part, main);
        brainDrawCurve(g, part.mixedCurve);
      }
    }
    g.stroke();
  }
  g.restore();
}

function brainDrawLearning(g, d) {
  const groups = d.learningPaths ??= Array.from({length : 10}, () => []);
  for (const group of groups)
    group.length = 0;
  for (const {e, curve} of d.edges) {
    const value = d.b.learning?.signals?.[e[3]];
    if (Number.isFinite(value) && Math.abs(value) >= .001)
      groups[(value < 0 ? 5 : 0) + Math.round(2 * Math.min(2, Math.sqrt(Math.abs(value))))].push(
          curve);
  }
  g.save();
  g.globalAlpha = .22;
  for (let i = 0; i < groups.length; ++i) {
    if (!groups[i].length)
      continue;
    g.strokeStyle = i < 5 ? '#79cf95' : '#ea8784';
    g.lineWidth = .5 + (i % 5) * .5;
    g.beginPath();
    for (const curve of groups[i])
      brainDrawCurve(g, curve);
    g.stroke();
  }
  g.restore();
}

// The static and slowly changing parts of the inspection drawing (body interior, tissues,
// wiring, cells) are painted into a texture in the fish's own frame at a resolution bucket and
// refreshed ten times a second. Every frame only places that texture on the moving,
// zooming fish and adds the travelling signals; zooming never repaints the drawing.
const BRAIN_CACHE_SPAN = 1600, BRAIN_CACHE_REFRESH_MS = 100;
function brainCacheBucket(scale) {
  const wanted = Math.min(2048 / BRAIN_CACHE_SPAN, scale * cameraState.pixelRatio);
  return Math.max(.125, Math.pow(2, Math.round(Math.log2(Math.max(1e-3, wanted)) * 2) / 2));
}
function brainPaintCached(g, d, time) {
  const v = d.view, now = performance.now(), zooming = now - (cameraState.wheelAt || 0) < 220,
        bucket = brainCacheBucket(v.scale), cx = 512 + d.r * (d.a.origin?.[0] || 0),
        cy = 512 + d.r * (d.a.origin?.[1] || 0);
  let cache = brainState.brainPaintCache;
  const key = [
    d.b.layout_id, brainState.brainView, brainState.brainPinnedTissue,
    brainState.brainHover?.tissue, brainState.brainHover?.id, sessionState.neuronFocus
  ].join(':');
  if (!cache || cache.key !== key || (!zooming && cache.bucket !== bucket) ||
      (!zooming && now - cache.time > (brainState.brainCacheRefreshMs ?? BRAIN_CACHE_REFRESH_MS))) {
    const layer = cache?.layer || new TankLayer(),
          size = Math.ceil(BRAIN_CACHE_SPAN * (zooming && cache ? cache.bucket : bucket));
    layer.width = layer.height = size; // also starts a fresh drawing and a new texture version
    const lg = layer.getContext(), resolution = size / BRAIN_CACHE_SPAN;
    lg.setTransform(resolution, 0, 0, resolution, 0, 0);
    lg.translate(BRAIN_CACHE_SPAN / 2 - cx, BRAIN_CACHE_SPAN / 2 - cy);
    brainDrawInterior(lg, d);
    brainDrawTissues(lg, d, time);
    lg.drawImage(d.mesh, d.meshBounds.x, d.meshBounds.y, d.meshBounds.width, d.meshBounds.height);
    brainDrawLearning(lg, d);
    lg.save();
    lg.translate(d.cx, d.cy);
    brainDrawMuscles(lg, d, time);
    lg.restore();
    brainDrawCells(lg, d, time);
    brainDrawMouth(lg, d);
    brainDrawTissueFocus(lg, d);
    cache = brainState.brainPaintCache =
        {layer, key, bucket : zooming && cache ? cache.bucket : bucket, time : now};
  }
  g.drawImage(cache.layer, cx - BRAIN_CACHE_SPAN / 2, cy - BRAIN_CACHE_SPAN / 2, BRAIN_CACHE_SPAN,
              BRAIN_CACHE_SPAN);
}

export function brainRender(time = displayNow()) {
  const d = brainState.brainDrawing, g = ctx;
  if (!d || brainState.brainOpacity <= 0)
    return;
  brainCollectArrivals(d, time);
  g.save();
  const v = d.view;
  g.setTransform(cameraState.pixelRatio, 0, 0, cameraState.pixelRatio, 0, 0);
  g.translate(v.x, v.y);
  g.rotate(v.angle);
  g.scale(v.scale, v.scale);
  g.translate(-512 - d.r * (d.a.origin?.[0] || 0), -512 - d.r * (d.a.origin?.[1] || 0));
  brainPaintCached(g, d, time);

  brainDrawArrivals(g, d, time);
  if (!brainReduced)
    for (const packet of brainState.brainPackets) {
      const t = (time - packet.start) / packet.duration;
      if (t < 0 || t > 1)
        continue;
      const curve = brainSignalCurve(packet, d);
      if (!curve)
        continue;
      if (packet.motor >= 0) {
        g.strokeStyle = packet.sign > 0 ? '#79cf95' : '#ea8784';
        g.globalAlpha = .17;
        g.lineWidth = .8;
        g.beginPath();
        brainDrawCurve(g, curve);
        g.stroke();
      }
      const p = brainCurvePoint(curve, t);
      if (!brainSignalPointVisible(d, packet, p))
        continue;
      g.fillStyle = g.strokeStyle = packet.sign > 0 ? '#79cf95' : '#ea8784';
      g.globalAlpha = (.65 + .35 * packet.alpha) * Math.min(1, t * 8, (1 - t) * 8);
      const trail = brainCurvePoint(curve, Math.max(0, t - .018));
      g.lineWidth = packet.radius * .9;
      g.beginPath();
      g.moveTo(...trail);
      g.lineTo(...p);
      g.stroke();
      g.beginPath();
      g.arc(p[0], p[1], packet.radius, 0, Math.PI * 2);
      g.fill();
    }
  g.globalAlpha = 1;
  g.restore();
  brainDrawSources(g, d);
}

const initializers = {

};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
