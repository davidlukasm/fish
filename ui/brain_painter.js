import {PALETTE} from './palette.js';
import {hueRGB} from './units.js';
import {BRAIN_SPACE} from './brain_layout.js';
import {
  BARBEL,
  GILL,
  GRAVITY,
  INTERNAL_TISSUE,
  isMotorTissue,
  isSenseTissue,
  MOTOR_TISSUE,
  SENSE_TISSUE,
  tissueKind
} from './tissue.js';
import {
  FISH,
  FOOD,
  MOTOR_KIND,
  NEURON,
  PROBE_KIND,
  SENSE_KIND,
  SENSORY_PROBE,
  SYNAPSE,
  VISUAL_CONTRIBUTION
} from './schema.js';
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
  brainMotorColors,
  brainReduced,
  brainScentRGB,
  brainScentWeights,
  brainSenseColors,
  cellColor,
  EXCITE_COLOR,
  INHIBIT_COLOR,
  lightCellHue,
  tissueColor
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
  brainTissuePath,
  CELL_DETAIL
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

const BRAIN_MOUTH = Object.freeze({
  steps : 16,
  suction_min : .05,
  min_width : .65,
  alpha : .65,
  inside : '#081b23',
  suction : '#8cc3cb',
  lips : '#ccafa3'
});
function brainDrawMouth(g, d) {
  const a = d.a;
  if (!a.jaw && !a.attack)
    return;
  const r = d.r, q = fishMouthShape(a);
  g.save();
  g.translate(d.cx, d.cy);
  g.rotate(d.angle);
  fishMouthPath(g, r, a);
  g.fillStyle = BRAIN_MOUTH.inside;
  g.globalAlpha = 1;
  g.fill();
  g.lineCap = 'round';
  for (let side = 0; side < 2; side++) {
    g.beginPath();
    for (let i = 0; i <= BRAIN_MOUTH.steps; i++) {
      const p = fishJawEdge(a, side, i / BRAIN_MOUTH.steps);
      if (i)
        g.lineTo(p[0] * r, p[1] * r);
      else
        g.moveTo(p[0] * r, p[1] * r);
    }
    g.strokeStyle = q.suction > BRAIN_MOUTH.suction_min ? BRAIN_MOUTH.suction : BRAIN_MOUTH.lips;
    g.lineWidth = Math.max(BRAIN_MOUTH.min_width, r * q.lip);
    g.globalAlpha = BRAIN_MOUTH.alpha;
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

const CELL = Object.freeze({
  light_saturation : 65,
  light_lightness : 65,
  dead : .12,
  idle : .35,
  min_radius : 2.2,
  max_radius : 5.2,
  zoom : 200,
  zoom_unit : 300,
  radius_per_value : .12,
  outline : .9,
  alpha : .50,
  alpha_per_value : .50,
  dash : 2,
  flash_min : .03,
  flash_gap : 1.2,
  chosen_width : 1.3,
  chosen_gap : 2.5,
  internal : '#bdcde7',
  outline_color : '#102530',
  chosen : '#f3e4bc'
});
function brainDrawPart(g, n, part, d, now = displayNow()) {
  const ink = brainCellOpacity(d),
        chosen = n[NEURON.index] === sessionState.neuronFocus ||
                 n[NEURON.index] === brainState.brainHover?.id,
        p = part.screen;
  if (ink <= 0)
    return;
  const motor = isMotorTissue(part.key), k = tissueKind(part.key),
        arrival = brainArrivalValue(n[NEURON.index], now),
        value = motor ? brainMotorActivity(n, k, d)
                      : brainClamp(Math.abs(isSenseTissue(part.key)
                                                ? (n[NEURON.signal] ?? n[NEURON.activity])
                                                : (n[NEURON.state] ?? n[NEURON.activity]))),
        dim = n[NEURON.life] === 2 ? CELL.dead
              : n[NEURON.life] === 1 && !n[NEURON.muted]
                  ? 1
                  : CELL.idle * (.5 + .5 * (n[NEURON.development] ?? 0)),
        radius = Math.max(CELL.min_radius,
                          Math.min(CELL.max_radius,
                                   CELL.min_radius +
                                       Math.log2(Math.max(1, (d.view?.scale || 1) * CELL.zoom /
                                                                 CELL.zoom_unit)))) *
                 (1 + CELL.radius_per_value * value) / (d.view?.scale || 1);
  g.fillStyle = motor                          ? brainMotorColor(k, brainMuscleState(n, k, d, now))
                : part.key === INTERNAL_TISSUE ? CELL.internal
                : k === SENSE_KIND.odor
                    ? rgb(brainScentRGB(brainScentWeights(n, d.receptors.get(n[NEURON.index]))))
                : k === SENSE_KIND.light
                    ? `hsl(${lightCellHue(n)},${CELL.light_saturation}%,${CELL.light_lightness}%)`
                    : brainSenseColors[k];
  g.strokeStyle = CELL.outline_color;
  g.lineWidth = CELL.outline;
  g.globalAlpha = ink * dim * (CELL.alpha + CELL.alpha_per_value * value);
  g.beginPath();
  g.arc(p[0], p[1], radius, 0, Math.PI * 2);
  g.fill();
  const isolated = (d.wiring.get(n[NEURON.index]) || [ 0, 0 ]).every(v => v === 0);
  if (isolated)
    g.setLineDash([ CELL.dash, CELL.dash ]);
  g.stroke();
  if (isolated)
    g.setLineDash([]);
  const flash = Math.max(arrival.positive, arrival.negative);
  if (flash > CELL.flash_min) {
    g.strokeStyle = g.fillStyle;
    g.globalAlpha = ink * flash;
    g.lineWidth = 1 + flash;
    g.beginPath();
    g.arc(p[0], p[1], radius + CELL.flash_gap, 0, Math.PI * 2);
    g.stroke();
  }
  if (chosen) {
    g.strokeStyle = CELL.chosen;
    g.globalAlpha = ink;
    g.lineWidth = CELL.chosen_width;
    g.beginPath();
    g.arc(p[0], p[1], radius + CELL.chosen_gap, 0, Math.PI * 2);
    g.stroke();
  }
  g.globalAlpha = 1;
}

const FOCUS = Object.freeze({
  alpha : .34,
  line_min_width : 3.5,
  line_width : .02,
  outline_alpha : .9,
  min_width : 1.5,
  width : .008,
  mouth_alpha : .09
});
function brainDrawTissueFocus(g, d) {
  const tissue = d.tissues.get(brainState.brainHover?.tissue || brainState.brainPinnedTissue);
  if (!tissue)
    return;
  const color = tissueColor(tissue.key);
  g.save();
  g.translate(d.cx, d.cy);
  g.rotate(d.angle);
  brainClipTissue(g, d, tissue);
  if (tissue.key === MOTOR_TISSUE.pigment && brainState.brainHover?.ids) {
    g.beginPath();
    for (const group of d.pigments.groups)
      if (group.ids[0] === brainState.brainHover.ids[0])
        brainPigmentStar(
            g, group.p[0] * d.r, group.p[1] * d.r,
            brainPigmentRadius(d.r, brainPigmentState(group, d).value, d.pigments.groups.length));
  } else
    brainTissuePath(g, d, tissue.key, tissue.side, tissue.variant);
  g.fillStyle = g.strokeStyle = color;
  g.globalAlpha = FOCUS.alpha;
  const line = tissue.variant === BARBEL || tissue.variant === GILL ||
               tissue.key === SENSE_TISSUE.flow && tissue.variant !== GRAVITY;
  if (line) {
    g.lineWidth = Math.max(FOCUS.line_min_width, d.r * FOCUS.line_width);
    g.stroke();
  } else {
    g.fill();
    g.globalAlpha = FOCUS.outline_alpha;
    g.lineWidth = Math.max(FOCUS.min_width, d.r * FOCUS.width);
    g.stroke();
  }
  if (tissue.key === MOTOR_TISSUE.suction && !tissue.variant) {
    fishMouthPath(g, d.r, d.a);
    g.globalAlpha = FOCUS.mouth_alpha;
    g.fill();
  }
  g.restore();
}

function brainSourcePosition(x, y, d = brainState.brainDrawing) {
  const p = worldToScreen({x, y}, d.c);
  return [ p.x, p.y ];
}

const SOURCES = Object.freeze({
  font : '12px system-ui',
  margin : 20,
  min_radius : 3,
  alpha : .22,
  ring_alpha : .9,
  ring_width : 1.5,
  label_margin : 45,
  label_gap : 18,
  label_top : 20,
  label_bottom : 16,
  hit_color : .25,
  hit_color_span : .75,
  hit_alpha : .45,
  hit_alpha_per_light : .4,
  hit_width : 1.2,
  hit_dash : 4,
  hit_dot : 3,
  pointer_alpha : .8,
  pointer_radius : 6,
  pointer_cross : 10,
  smell : PALETTE.lilac,
  label : '#e4ede6'
});
function brainDrawSources(g, d) {
  const probe = d.b.probe;
  d.sources = [];
  const add = (x, y, radius, color, id, kind) => {
    const q = brainSourcePosition(x, y, d);
    if (q[0] < -SOURCES.margin || q[1] < -SOURCES.margin ||
        q[0] > cameraState.viewportWidth + SOURCES.margin ||
        q[1] > cameraState.viewportHeight + SOURCES.margin)
      return;
    const distance = Math.hypot(horizontalDelta(x - d.p[FISH.x]), y - d.p[FISH.y]);
    d.sources.push({screen : q, distance, id, kind});
  };
  for (const p of sceneState.frame.food || [])
    add(p[FOOD.x], p[FOOD.y], p[FOOD.radius], p.slice(FOOD.red, FOOD.blue + 1), p[FOOD.id], 0);
  for (const p of sceneState.frame.fish || [])
    if (p[FISH.id] !== sceneState.frame.selected)
      add(p[FISH.x], p[FISH.y], p[FISH.radius], p.slice(FISH.red, FISH.blue + 1), p[FISH.id], 1);
  if (probe?.remaining > 0 && probe.kind !== PROBE_KIND.sense) {
    add(probe.x, probe.y, probe.radius, probe.color, 0, SENSORY_PROBE.object_kind);
    const q = brainSourcePosition(probe.x, probe.y, d),
          radius = Math.max(SOURCES.min_radius, probe.radius * d.c.scale);
    g.strokeStyle = probe.kind === PROBE_KIND.smell ? SOURCES.smell : rgb(probe.color);
    g.fillStyle = g.strokeStyle;
    g.globalAlpha = SOURCES.alpha;
    g.beginPath();
    g.arc(...q, radius, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = SOURCES.ring_alpha;
    g.lineWidth = SOURCES.ring_width;
    g.beginPath();
    g.arc(...q, radius, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = SOURCES.label;
    g.font = SOURCES.font;
    g.textAlign = 'center';
    g.fillText(
        t('units.px', {
          n : formatNumber(
              Math.hypot(horizontalDelta(probe.x - d.p[FISH.x]), probe.y - d.p[FISH.y]), 1, true)
        }),
        brainClamp(q[0], SOURCES.label_margin, cameraState.viewportWidth - SOURCES.label_margin),
        brainClamp(q[1] + radius + SOURCES.label_gap, SOURCES.label_top,
                   cameraState.viewportHeight - SOURCES.label_bottom));
  }
  const SHOWN_CONTRIBUTIONS = 3;
  const focus = brainState.brainHover?.id ?? sessionState.neuronFocus, V = VISUAL_CONTRIBUTION,
        hits = (d.b.visual_contributions || [])
                   .filter(h => h[V.neuron] === focus)
                   .sort((a, b) => b[V.light] - a[V.light])
                   .slice(0, SHOWN_CONTRIBUTIONS);
  for (const hit of hits) {
    const part = d.parts.get(hit[V.neuron])?.find(p => p.key === SENSE_TISSUE.light);
    if (!part)
      continue;
    const source = brainSourcePosition(hit[V.x], hit[V.y], d),
          target = brainScreenPoint(part.screen, d), dx = target[0] - source[0],
          dy = target[1] - source[1], length = Math.hypot(dx, dy),
          radius = Math.min(length, hit[V.radius] * d.c.scale),
          x = source[0] + dx / Math.max(1, length) * radius,
          y = source[1] + dy / Math.max(1, length) * radius;
    g.strokeStyle =
        rgb(hit.slice(V.red, V.blue + 1).map(c => SOURCES.hit_color + SOURCES.hit_color_span * c));
    g.globalAlpha = SOURCES.hit_alpha + SOURCES.hit_alpha_per_light * brainClamp(hit[V.light]);
    g.lineWidth = SOURCES.hit_width;
    g.setLineDash([ SOURCES.hit_dash, SOURCES.hit_dash ]);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(...target);
    g.stroke();
    g.setLineDash([]);
    g.beginPath();
    g.arc(...target, SOURCES.hit_dot, 0, Math.PI * 2);
    g.stroke();
  }
  if (brainState.brainProbeArmed && brainState.brainPointer) {
    g.strokeStyle =
        brainState.brainTool === 'scent' ? SOURCES.smell : rgb(hueRGB(brainState.brainHue));
    g.globalAlpha = SOURCES.pointer_alpha;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(brainState.brainPointer.x, brainState.brainPointer.y, SOURCES.pointer_radius, 0,
          Math.PI * 2);
    g.moveTo(brainState.brainPointer.x - SOURCES.pointer_cross, brainState.brainPointer.y);
    g.lineTo(brainState.brainPointer.x + SOURCES.pointer_cross, brainState.brainPointer.y);
    g.moveTo(brainState.brainPointer.x, brainState.brainPointer.y - SOURCES.pointer_cross);
    g.lineTo(brainState.brainPointer.x, brainState.brainPointer.y + SOURCES.pointer_cross);
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
    if (![SENSE_TISSUE.proximity, SENSE_TISSUE.bladder_pressure, SENSE_TISSUE.gonad_pressure,
          MOTOR_TISSUE.bladder, MOTOR_TISSUE.gland, MOTOR_TISSUE.eggs, MOTOR_TISSUE.sperm,
          MOTOR_TISSUE.suction, MOTOR_TISSUE.aggression, SENSE_TISSUE.odor, SENSE_TISSUE.light]
             .includes(t.key) ||
        t.variant === BARBEL || keys.has(t.key + ':' + t.side))
      continue;
    const path = brainTissueGeometry(d, t), b = brainPathBounds(path);
    if (local[0] >= b.left && local[0] <= b.right && local[1] >= b.top && local[1] <= b.bottom &&
        brainPreparedPath(path).isPointInPath(...local))
      return false;
  }
  return true;
}

const ARRIVAL_RING = Object.freeze({
  shown : 280,
  min_strength : .03,
  min_base : 3.5,
  max_base : 8,
  base : .018,
  grow : .7,
  glow : .35,
  glow_radius : 1.7,
  ring : 1.3,
  ring_width : 1.4,
  min_core : 1.6,
  core : .38,
  internal : '#bdcde7'
});
function brainDrawArrivals(g, d, now) {
  for (const [id, event] of brain_signalsState.brainArrivals) {
    const age = now - event.at;
    if (age < 0 || age > ARRIVAL_RING.shown)
      continue;
    const arrival = brainArrivalValue(id, now),
          strength = Math.max(arrival.positive, arrival.negative);
    if (strength < ARRIVAL_RING.min_strength)
      continue;
    const curve = brainSignalCurve(event, d), p = curve ? curve.slice(-2) : d.anchors.get(id);
    if (!p)
      continue;
    const node = d.nodes.get(id), parts = d.parts.get(id) || [],
          dominant = parts.reduce((a, b) => !a || b.share > a.share ? b : a, null);
    if (event.motor === MOTOR_KIND.pigment ||
        dominant && !brainPointVisible(d, d.tissues.get(dominant.tissue),
                                       brainLocal(p, d).map(v => v * d.r)))
      continue;
    const tint = event.motor >= 0 ? brainMotorColors[event.motor]
                 : node           ? cellColor(node)
                                  : ARRIVAL_RING.internal,
          base = Math.max(ARRIVAL_RING.min_base,
                          Math.min(ARRIVAL_RING.max_base, d.r * ARRIVAL_RING.base)),
          radius = base * (ARRIVAL_RING.grow + ARRIVAL_RING.grow * age / ARRIVAL_RING.shown);
    g.save();
    g.strokeStyle = g.fillStyle = tint;
    g.globalAlpha = strength * ARRIVAL_RING.glow * (1 - age / ARRIVAL_RING.shown);
    g.beginPath();
    g.arc(p[0], p[1], radius * ARRIVAL_RING.glow_radius, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = brainClamp(strength * ARRIVAL_RING.ring) * (1 - age / ARRIVAL_RING.shown);
    g.lineWidth = ARRIVAL_RING.ring_width + strength;
    g.beginPath();
    g.arc(p[0], p[1], radius, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(p[0], p[1],
          Math.max(ARRIVAL_RING.min_core, base * ARRIVAL_RING.core) *
              (1 - age / ARRIVAL_RING.shown),
          0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

const MIXED = Object.freeze({
  width : .8,
  dash : 2,
  gap : 4,
  chosen_alpha : .6,
  alpha : .30,
  chosen : '#d5cbaa',
  line : '#81969b'
});
export function brainDrawMixed(g, d) {
  if (d.cellDetail < CELL_DETAIL.from)
    return;
  g.save();
  g.lineWidth = MIXED.width;
  g.setLineDash([ MIXED.dash, MIXED.gap ]);
  for (const selected of [false, true]) {
    g.strokeStyle = selected ? MIXED.chosen : MIXED.line;
    g.globalAlpha = selected ? MIXED.chosen_alpha : MIXED.alpha;
    g.beginPath();
    for (const n of d.b.neurons) {
      if ((n[NEURON.index] === sessionState.neuronFocus) !== selected)
        continue;
      const parts = d.parts.get(n[NEURON.index]);
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

const LEARNING = Object.freeze(
    {bands : 10, min : .001, inhibit_offset : 5, alpha : .22, base_width : .5, width_step : .5});
function brainDrawLearning(g, d) {
  const groups = d.learningPaths ??= Array.from({length : LEARNING.bands}, () => []);
  for (const group of groups)
    group.length = 0;
  for (const {e, curve} of d.edges) {
    const value = d.b.learning?.signals?.[e[SYNAPSE.id]];
    if (Number.isFinite(value) && Math.abs(value) >= LEARNING.min)
      groups[(value < 0 ? LEARNING.inhibit_offset : 0) +
             Math.round(2 * Math.min(2, Math.sqrt(Math.abs(value))))]
          .push(curve);
  }
  g.save();
  g.globalAlpha = LEARNING.alpha;
  for (let i = 0; i < groups.length; ++i) {
    if (!groups[i].length)
      continue;
    g.strokeStyle = i < LEARNING.inhibit_offset ? EXCITE_COLOR : INHIBIT_COLOR;
    g.lineWidth = LEARNING.base_width + (i % LEARNING.inhibit_offset) * LEARNING.width_step;
    g.beginPath();
    for (const curve of groups[i])
      brainDrawCurve(g, curve);
    g.stroke();
  }
  g.restore();
}

function brainDrawWiring(g, d) {
  for (const group of d.wiringStrokes) {
    g.globalAlpha = group.alpha;
    g.strokeStyle = group.color;
    g.lineWidth = group.width;
    g.beginPath();
    for (const q of group.curves)
      brainDrawCurve(g, q);
    g.stroke();
  }
  g.globalAlpha = 1;
  brainDrawMixed(g, d);
}

const BRAIN_CACHE_SCREENS = 1.5, BRAIN_CACHE_MARGIN = .15, BRAIN_CACHE_SLACK = .25,
      BRAIN_LIVE_REFRESH_MS = 100, BRAIN_WIRING_REFRESH_MS = 3000, BRAIN_LIVE_SHARE = .1;

function brainPaintLayer(layer, region, resolution, paint) {
  layer ||= new TankLayer();
  layer.width = Math.max(1, Math.ceil((region.right - region.left) * resolution));
  layer.height = Math.max(1, Math.ceil((region.bottom - region.top) * resolution));
  const lg = layer.getContext();
  lg.setTransform(resolution, 0, 0, resolution, 0, 0);
  lg.translate(-region.left, -region.top);
  paint(lg);
  return layer;
}

function brainDrawingBounds(d) {
  let left = d.meshBounds.x, top = d.meshBounds.y, right = left + d.meshBounds.width,
      bottom = top + d.meshBounds.height;
  const add = (x, y, reach = 0) => {
    left = Math.min(left, d.cx + x - reach);
    right = Math.max(right, d.cx + x + reach);
    top = Math.min(top, d.cy + y - reach);
    bottom = Math.max(bottom, d.cy + y + reach);
  };
  for (const [method, args] of brainGeometry(d).body)
    if (method === 'arc' || method === 'ellipse')
      add(args[0], args[1], method === 'arc' ? args[2] : Math.max(args[2], args[3]));
    else
      for (let i = 0; i + 1 < args.length; i += 2)
        add(args[i], args[i + 1]);
  const pad = BRAIN_CACHE_MARGIN * Math.max(right - left, bottom - top);
  return {left : left - pad, top : top - pad, right : right + pad, bottom : bottom + pad};
}

function brainViewRegion(d, origin) {
  const v = d.view, cos = Math.cos(-v.angle), sin = Math.sin(-v.angle),
        w = cameraState.viewportWidth, h = cameraState.viewportHeight;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const [sx, sy] of [[ 0, 0 ], [ w, 0 ], [ 0, h ], [ w, h ]]) {
    const x = (sx - v.x) / v.scale, y = (sy - v.y) / v.scale, px = origin.x + cos * x - sin * y,
          py = origin.y + sin * x + cos * y;
    left = Math.min(left, px);
    right = Math.max(right, px);
    top = Math.min(top, py);
    bottom = Math.max(bottom, py);
  }
  return {left, top, right, bottom};
}

function brainIntersect(a, b) {
  return {
    left : Math.max(a.left, b.left),
    top : Math.max(a.top, b.top),
    right : Math.min(a.right, b.right),
    bottom : Math.min(a.bottom, b.bottom)
  };
}

const PAINT_CACHE =
    Object.freeze({zoom_hold : 220, min_bucket : .125, min_wanted : 1e-3, half_steps : 2});
function brainPaintCached(g, d, time, origin) {
  const v = d.view, now = performance.now(),
        zooming = now - (cameraState.wheelAt || 0) < PAINT_CACHE.zoom_hold,
        body = brainDrawingBounds(d), shown = brainIntersect(body, brainViewRegion(d, origin));
  if (shown.right <= shown.left || shown.bottom <= shown.top)
    return;
  let cache = brainState.brainPaintCache;
  const key = [
    d.b.layout_id, brainState.brainView, brainState.brainPinnedTissue,
    brainState.brainHover?.tissue, brainState.brainHover?.id, sessionState.neuronFocus
  ].join(':');
  const covered = cache && cache.region.left <= shown.left && cache.region.top <= shown.top &&
                  cache.region.right >= shown.right && cache.region.bottom >= shown.bottom,
        wanted = v.scale * cameraState.pixelRatio,
        bucket =
            Math.max(PAINT_CACHE.min_bucket,
                     Math.pow(2, Math.ceil(Math.log2(Math.max(PAINT_CACHE.min_wanted, wanted)) *
                                           PAINT_CACHE.half_steps) /
                                     PAINT_CACHE.half_steps)),
        shownSpan = Math.max(shown.right - shown.left, shown.bottom - shown.top),
        pixels = Math.min(ctx.textureLimit,
                          BRAIN_CACHE_SCREENS * cameraState.pixelRatio *
                              Math.max(cameraState.viewportWidth, cameraState.viewportHeight)),
        sharp = Math.min(bucket, pixels / shownSpan),
        slack =
            Math.max(0, Math.min(BRAIN_CACHE_SLACK * shownSpan, (pixels / sharp - shownSpan) / 2)),
        region = brainIntersect(body, {
          left : shown.left - slack,
          top : shown.top - slack,
          right : shown.right + slack,
          bottom : shown.bottom + slack
        });
  const stale = !covered || cache.key !== key || (!zooming && cache.bucket !== bucket);
  if (stale || (!zooming && now - cache.wiringTime > BRAIN_WIRING_REFRESH_MS)) {
    // A periodic wiring refresh shares the existing activity layers' coordinates.
    // A changed region requires all three layers to be repainted together.
    const paintRegion = stale ? region : cache.region,
          resolution = stale ? sharp : cache.resolution;
    cache = brainState.brainPaintCache = {
      ...cache,
      key,
      bucket,
      region : paintRegion,
      resolution,
      wiringTime : now,
      liveTime : stale ? -Infinity : cache.liveTime,
      wiring : brainPaintLayer(cache?.wiring, paintRegion, resolution,
                               lg => {
                                 brainDrawWiring(lg, d);
                                 brainDrawLearning(lg, d);
                               })
    };
  }
  if (cache.liveTime === -Infinity ||
      (!zooming && now - cache.liveTime >
                       Math.max(BRAIN_LIVE_REFRESH_MS, (cache.liveCost || 0) / BRAIN_LIVE_SHARE))) {
    const start = performance.now();
    cache.under = brainPaintLayer(cache.under, cache.region, cache.resolution, lg => {
      brainDrawInterior(lg, d);
      brainDrawTissues(lg, d, time);
    });
    cache.over = brainPaintLayer(cache.over, cache.region, cache.resolution, lg => {
      lg.save();
      lg.translate(d.cx, d.cy);
      brainDrawMuscles(lg, d, time);
      lg.restore();
      brainDrawCells(lg, d, time);
      brainDrawMouth(lg, d);
      brainDrawTissueFocus(lg, d);
    });
    cache.liveTime = now;
    cache.liveCost = performance.now() - start;
  }
  const r = cache.region;
  for (const layer of [cache.under, cache.wiring, cache.over])
    if (layer)
      g.drawImage(layer, r.left, r.top, r.right - r.left, r.bottom - r.top);
}

const PACKETS = Object.freeze({
  line_alpha : .17,
  line_width : .8,
  alpha : .65,
  alpha_per_packet : .35,
  fade : 8,
  trail : .018,
  trail_width : .9
});
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
  const origin = {
    x : BRAIN_SPACE / 2 + d.r * (d.a.origin?.[0] || 0),
    y : BRAIN_SPACE / 2 + d.r * (d.a.origin?.[1] || 0)
  };
  g.translate(-origin.x, -origin.y);
  brainPaintCached(g, d, time, origin);

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
        g.strokeStyle = packet.sign > 0 ? EXCITE_COLOR : INHIBIT_COLOR;
        g.globalAlpha = PACKETS.line_alpha;
        g.lineWidth = PACKETS.line_width;
        g.beginPath();
        brainDrawCurve(g, curve);
        g.stroke();
      }
      const p = brainCurvePoint(curve, t);
      if (!brainSignalPointVisible(d, packet, p))
        continue;
      g.fillStyle = g.strokeStyle = packet.sign > 0 ? EXCITE_COLOR : INHIBIT_COLOR;
      g.globalAlpha = (PACKETS.alpha + PACKETS.alpha_per_packet * packet.alpha) *
                      Math.min(1, t * PACKETS.fade, (1 - t) * PACKETS.fade);
      const trail = brainCurvePoint(curve, Math.max(0, t - PACKETS.trail));
      g.lineWidth = packet.radius * PACKETS.trail_width;
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
