import {BRAIN_SPACE} from './brain_layout.js';
import {BARBEL, MOTOR_TISSUE, SENSE_TISSUE, sidedTissue} from './tissue.js';
import {NEURON} from './schema.js';
import {t} from './strings.js';
import {updateBrainProbeState} from './brain_probe.js';
import {updateBrainState} from './brain.js';
import {updateSessionState} from './session.js';
import {brainSelectedTissue, brainState, focusNeuron, focusTissue} from './brain.js';
import {brainLocal, brainPigmentRadius, brainPigmentState, brainProject} from './brain_geometry.js';
import {brainContext} from './brain_model.js';
import {
  brainOrganLayer,
  brainPointVisible,
  brainReplayPath,
  brainTissueGeometry
} from './brain_occlusion.js';
import {brainTrackProbe, sendBrainProbe} from './brain_probe.js';
import {brainCellOpacity} from './brain_tissue.js';
import {canvasPoint, screenToWorld} from './camera.js';
import {canvas, el, text} from './dom.js';
import {fishMouthPath} from './fish_organs.js';
import {brainShowOrgan} from './organs.js';
import {command, sessionState} from './session.js';
import {HELD_ACTION_SECONDS, sceneState, stepsInSeconds} from './state.js';
export const brain_inputState = {};

function brainModelPoint(p, d = brainState.brainDrawing) {
  if (!d?.view)
    return p;
  const v = d.view, x = (p[0] - v.x) / v.scale, y = (p[1] - v.y) / v.scale, co = Math.cos(v.angle),
        si = Math.sin(v.angle);
  return [
    BRAIN_SPACE / 2 + d.r * (d.a.origin?.[0] || 0) + x * co + y * si,
    BRAIN_SPACE / 2 + d.r * (d.a.origin?.[1] || 0) - x * si + y * co
  ];
}

export function brainScreenPoint(p, d = brainState.brainDrawing) {
  if (!d?.view)
    return p;
  const v = d.view, x = p[0] - BRAIN_SPACE / 2 - d.r * (d.a.origin?.[0] || 0),
        y = p[1] - BRAIN_SPACE / 2 - d.r * (d.a.origin?.[1] || 0), co = Math.cos(v.angle),
        si = Math.sin(v.angle);
  return [ v.x + v.scale * (x * co - y * si), v.y + v.scale * (x * si + y * co) ];
}

function brainMouse(e) {
  const p = canvasPoint(e);
  return [ p.x, p.y ];
}

export function brainArmProbe(value) {
  const was = brainState.brainProbeArmed;
  updateBrainState({brainProbeArmed : value});
  if (was && !value) {
    updateBrainProbeState({brainProbeLastPoint : null});
    command('probe-clear');
  }
  canvas.style.cursor = value ? 'crosshair' : 'grab';
  el('brain-probe').setAttribute('aria-pressed', String(value));
  text('brain-probe', brainState.brainTool === 'body' ? t('brain_input.koerperreizSetzen')
                      : value                         ? t('brain_input.mausreizBeenden')
                                                      : t('brain_input.unterMaus'));
}

const HIT_WIDTHS = Object.freeze([ 1.5, 3, 5, 7 ]);
const ORGAN_HIT = Object.freeze({
  pigment_reach : 6,
  score_per_width : .5,
  suction_width : 6,
  inside_score : 4.5,
  near : 7,
  near_score : 6
});
function brainOrganHit(p, d = brainState.brainDrawing) {
  const local = brainLocal(p, d).map(v => v * d.r), g = brainContext;
  let best = null, bestScore = Infinity, bestDistance = Infinity;
  let pigment = null, pigmentDistance = Infinity;
  for (const group of d.pigments.groups) {
    const pigmentTissue = d.tissues.get(sidedTissue(MOTOR_TISSUE.pigment, 0));
    if (pigmentTissue && !brainPointVisible(d, pigmentTissue, brainLocal(p, d).map(v => v * d.r)))
      continue;
    const screen = brainProject(group.p, d), gap = Math.hypot(screen[0] - p[0], screen[1] - p[1]);
    if (gap < Math.min(ORGAN_HIT.pigment_reach,
                       brainPigmentRadius(d.r, brainPigmentState(group, d).value,
                                          d.pigments.groups.length)) &&
        gap < pigmentDistance) {
      pigment = group;
      pigmentDistance = gap;
    }
  }
  if (pigment) {
    let closer = false;
    for (const parts of d.parts.values())
      for (const part of parts)
        if (part.key !== MOTOR_TISSUE.pigment &&
            Math.hypot(part.screen[0] - p[0], part.screen[1] - p[1]) < pigmentDistance)
          closer = true;
    if (!closer)
      return {
        ids : pigment.ids,
        part : MOTOR_TISSUE.pigment,
        tissue : sidedTissue(MOTOR_TISSUE.pigment, 0)
      };
  }
  for (const [id, tissue] of [...d.tissues].sort((a, b) => brainOrganLayer(b[1]) -
                                                           brainOrganLayer(a[1]))) {
    if (!brainPointVisible(d, tissue, local, g))
      continue;
    let score = Infinity, distance = Infinity;
    for (const {part} of tissue.members)
      distance = Math.min(distance, Math.hypot(part.screen[0] - p[0], part.screen[1] - p[1]));
    g.save();
    g.setTransform?.(1, 0, 0, 1, 0, 0);
    brainReplayPath(g, brainTissueGeometry(d, tissue));
    for (const width of HIT_WIDTHS) {
      g.lineWidth = width;
      if (g.isPointInStroke?.(...local) === true) {
        score = width * ORGAN_HIT.score_per_width;
        break;
      }
    }
    if (tissue.key === MOTOR_TISSUE.suction) {
      fishMouthPath(g, d.r, d.a);
      g.lineWidth = ORGAN_HIT.suction_width;
      if (g.isPointInPath?.(...local) || g.isPointInStroke?.(...local))
        score = Math.min(score, 1);
    }
    const open = tissue.key === SENSE_TISSUE.flow || tissue.variant === BARBEL;
    if (!open && g.isPointInPath?.(...local) === true)
      score = Math.min(score, ORGAN_HIT.inside_score);
    g.restore();
    if (distance < ORGAN_HIT.near)
      score = Math.min(score, ORGAN_HIT.near_score + distance);
    if (Number.isFinite(score) &&
        (score < bestScore || score === bestScore && distance < bestDistance)) {
      bestScore = score;
      bestDistance = distance;
      best = {tissue : id, part : tissue.key};
    }
  }
  return best;
}

export function brainHit(p) {
  const d = brainState.brainDrawing;
  if (!d)
    return null;
  p = brainModelPoint(p, d);
  if (d.hitCache?.x === p[0] && d.hitCache.y === p[1])
    return d.hitCache.hit;
  const hit = brainHitModel(p, d);
  d.hitCache = {x : p[0], y : p[1], hit};
  return hit;
}

const CELL_HIT = Object.freeze({min_opacity : .15, reach : 9});
function brainHitModel(p, d) {
  if (brainCellOpacity(d) > CELL_HIT.min_opacity) {
    let best = null, dist = Infinity;
    for (const [id, parts] of d.parts)
      for (const part of parts) {
        const tissue = d.tissues.get(part.tissue);
        const distance = Math.hypot(part.screen[0] - p[0], part.screen[1] - p[1]),
              reach = CELL_HIT.reach / (d.view?.scale || 1);
        if (distance < reach && distance < dist &&
            brainPointVisible(d, tissue, brainLocal(p, d).map(v => v * d.r))) {
          dist = distance;
          best = {id, part : part.key, tissue : part.tissue};
        }
      }
    if (best) {
      if (best.part === MOTOR_TISSUE.pigment) {
        const reach = CELL_HIT.reach / (d.view?.scale || 1), ids = [];
        for (const [id, parts] of d.parts)
          if (parts.some(part => part.key === MOTOR_TISSUE.pigment &&
                                 Math.hypot(part.screen[0] - p[0], part.screen[1] - p[1]) < reach))
            ids.push(id);
        if (ids.length > 1) {
          best.ids = ids.sort((a, b) => a - b);
          if (ids.includes(sessionState.neuronFocus))
            best.id = sessionState.neuronFocus;
        }
      }
      return best;
    }
  }
  return brainOrganHit(p, d);
}

async function brainStimulateHit(hit) {
  if (brainState.brainBusy || sceneState.frame?.historical)
    return;
  const d = brainState.brainDrawing,
        ids = hit.ids || (hit.id !== undefined ? [ hit.id ]
                                               : (d.tissues.get(hit.tissue)?.members ||
                                                  []).map(m => m.n[NEURON.index])),
        active = [...new Set(ids) ].filter(id => {
          const n = d.nodes.get(id);
          return n?.[NEURON.functional] && n[NEURON.ready] && !n[NEURON.muted];
        });
  if (!active.length) {
    text('feedback', t('brain_input.diesesGewebeEnthaeltKeine'));
    return;
  }
  updateBrainState({brainBusy : true});
  try {
    const steps = stepsInSeconds(HELD_ACTION_SECONDS),
          sent = await command('stimulate', hit.id !== undefined
                                                ? {neuron : active[0], amount : 1, steps}
                                                : {neurons : active, amount : 1, steps});
    if (sent)
      text('feedback', active.length === 1 ? t('brain_input.zelleGereizt')
                                           : t('brain_input.cellsProbed', {n : active.length}));
  } finally {
    updateBrainState({brainBusy : false});
  }
}

const BODY_HIT = Object.freeze({tail : 1.8, margin : .35});
export function brainCanvasClick(e) {
  if (!brainState.brainOpen || !brainState.brainDrawing)
    return false;
  const p = brainMouse(e);
  if (brainState.brainProbeArmed) {
    updateBrainState({brainProbePoint : screenToWorld({x : p[0], y : p[1]})});
    sendBrainProbe(brainState.brainProbePoint);
    return true;
  }
  const hit = brainHit(p);
  if (hit) {
    if (hit.ids?.length > 1) {
      const next = hit.ids[(hit.ids.indexOf(sessionState.neuronFocus) + 1) % hit.ids.length];
      hit.id = next;
      text('feedback', t('brain_input.pigmentGroup', {n : hit.ids.length}));
      updateBrainState({brainDrawing : {...brainState.brainDrawing, hitCache : null}});
    }
    if (hit.id !== undefined)
      focusNeuron(hit.id, hit.part);
    else
      focusTissue(hit);
    brainStimulateHit(hit.id !== undefined ? {...hit, ids : undefined} : hit);
    return true;
  }
  const local = brainLocal(brainModelPoint(p));
  if (local[0] > -BODY_HIT.tail && local[0] < brainState.brainDrawing.a.snout + BODY_HIT.margin &&
      Math.abs(local[1]) < Math.max(...brainState.brainDrawing.a.flank) + BODY_HIT.margin) {
    updateSessionState({neuronFocus : -1});
    updateBrainState({brainPinnedTissue : ''});
    updateBrainState({brainTissueFocus : 'all'});
    updateBrainState({brainDrawingKey : ''});
    return true;
  }
  return false;
}

export function brainHoverAt(p) {
  if (!brainState.brainDrawing)
    return;
  const hit = brainHit(p), old = brainState.brainHover;
  updateBrainState({brainHover : hit});
  if (hit && !brainState.brainProbeArmed &&
      (hit.id !== old?.id || hit.tissue !== old?.tissue || hit.part !== old?.part)) {
    if (hit.id !== undefined)
      focusNeuron(hit.id, hit.part, false);
    else
      focusTissue(hit);
  }
  const tissue = brainSelectedTissue(brainState.brainDrawing, hit);
  canvas.title = '';
  brainShowOrgan(brainState.brainDrawing, tissue);
  canvas.style.cursor = brainState.brainProbeArmed ? 'crosshair' : hit ? 'pointer' : 'grab';
}

export function brainCanvasHover(e) {
  const p = brainMouse(e);
  updateBrainState({brainPointer : {x : p[0], y : p[1]}});
  brain_inputState.brainPointerInside = true;
  if (!brainState.brainOpen || !brainState.brainDrawing)
    return;
  brainHoverAt(p);
  brainTrackProbe();
}

const initializers = {
  "brainPointerInside" : () => { brain_inputState.brainPointerInside = false; },
  "onpointerleave" : () => {
    canvas.onpointerleave = () => {
      brain_inputState.brainPointerInside = false;
      updateBrainState({brainHover : null});
      canvas.title = '';
      if (brainState.brainProbeArmed) {
        updateBrainProbeState({brainProbeLastPoint : null});
        command('probe-clear');
      }
    };
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
