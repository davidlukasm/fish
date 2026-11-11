import {CELL_DETAIL} from './brain_tissue.js';
import {
  GUT_TISSUE,
  INTERNAL_TISSUE,
  motorTissue,
  RESERVE_TISSUE,
  senseTissue,
  sidedTissue,
  tissueBase,
  tissueSide,
  VARIANT_TISSUE
} from './tissue.js';
import {updateBrainState} from './brain.js';
import {updateSessionState} from './session.js';
import {animalsState} from './animals.js';
import {brainClamp, brainState} from './brain.js';
import {
  brainCellDetail,
  brainNervePositions,
  brainOrganKey,
  brainPartPosition,
  brainPigmentPositions,
  brainProject
} from './brain_geometry.js';
import {brainConnectivity} from './brain_model.js';
import {brainConnection} from './brain_paths.js';
import {brainPresentationFish} from './brain_signals.js';
import {camera} from './camera.js';

import {fishBodyRadius, fishShapeScale} from './fish_fins.js';
import {fishPoseAnatomy, fishSnapshotAnatomy} from './fish_forms.js';
import {fishReserveShape, fishSatietyShape} from './fish_organs.js';
import {sessionState} from './session.js';
import {blendFish, frameFish} from './state.js';
import {EFFECTOR, FISH, NEURON, RECEPTOR, SYNAPSE, TOLERANCE, VISUAL_SAMPLE} from './schema.js';
export const brain_layoutState = {};

export const BRAIN_SPACE = 1024, BRAIN_BODY_RADIUS = 200;
const LAYOUT = Object.freeze({
  detail_radius : 95,
  detail_steps : 4,
  share : .003,
  share_span : .997,
  refresh : 60,
  min_edges : 24,
  edges_per_detail : 1500,
  coarse_edges : 28,
  min_visible : 1200,
  width : .45,
  width_base : .55,
  width_per_detail : 3.1,
  alpha : .13,
  pad : 6,
  fade_edges : 8,
  fade_share : .15,
  width_steps : 16,
  edge : '#657f86'
});
export function brainBuild(f, c = camera(f)) {
  const b = f.brain, raw = frameFish(f);
  if (!raw || !b?.neurons?.length)
    return null;
  const p = brainPresentationFish(blendFish(raw)),
        base = animalsState.animalSceneFish.get(p[FISH.id])?.a || fishSnapshotAnatomy(raw),
        a = fishPoseAnatomy(base, p), w = BRAIN_SPACE, h = BRAIN_SPACE,
        screen = {x : BRAIN_SPACE / 2, y : BRAIN_SPACE / 2},
        r = BRAIN_BODY_RADIUS * fishShapeScale(p);
  const d = {
    b,
    p,
    raw,
    step : f.step,
    a,
    c,
    wiring : brainConnectivity(b),
    visualSamples :
        new Map((b.visual_samples || []).map(sample => [sample[VISUAL_SAMPLE.neuron], sample])),
    angle : 0,
    cx : screen.x,
    cy : screen.y,
    r,
    pigments : brainPigmentPositions(b, a),
    nerve : brainNervePositions(b, a),
    cellDetail : brainCellDetail(p, c),
    nodes : new Map(b.neurons.map(n => [n[NEURON.index], n])),
    parts : new Map(),
    mainParts : new Map(),
    tissues : new Map(),
    anchors : new Map(),
    receptors : new Map(b.receptors.map(r => [r[RECEPTOR.neuron], r])),
    effectors : new Map(),
    curves : new Map(),
    edges : [],
    width : w,
    height : h
  };
  for (const e of b.effectors) {
    if (!d.effectors.has(e[EFFECTOR.neuron]))
      d.effectors.set(e[EFFECTOR.neuron], []);
    d.effectors.get(e[EFFECTOR.neuron]).push(e);
  }
  for (const n of b.neurons) {
    if (!n[NEURON.functional]) {
      d.parts.set(n[NEURON.index], []);
      continue;
    }
    const parts = [], rec = d.receptors.get(n[NEURON.index]);
    if (n[NEURON.internal] > 0)
      parts.push({
        key : INTERNAL_TISSUE,
        share : n[NEURON.internal],
        p : brainPartPosition(n, INTERNAL_TISSUE, d, rec)
      });
    const dominantSense = n[NEURON.senses]?.indexOf(Math.max(...n[NEURON.senses]));
    for (let k = 0; k < Math.max(n[NEURON.senses]?.length || 0, n[NEURON.motors]?.length || 0);
         k++) {
      if (k === dominantSense && n[NEURON.senses]?.[k] > 0)
        parts.push({
          key : senseTissue(k),
          share : n[NEURON.senses][k],
          p : brainPartPosition(n, senseTissue(k), d, rec)
        });
      if (n[NEURON.motors]?.[k] > 0) {
        parts.push({
          key : motorTissue(k),
          share : n[NEURON.motors][k],
          p : brainPartPosition(n, motorTissue(k), d, rec)
        });
      }
    }
    if (!parts.length)
      parts.push(
          {key : INTERNAL_TISSUE, share : 1, p : brainPartPosition(n, INTERNAL_TISSUE, d, rec)});
    d.parts.set(n[NEURON.index], parts);
    for (const part of parts) {
      part.neuron = n[NEURON.index];
      part.screen = brainProject(part.p, d);
      const tissueId = part.key === INTERNAL_TISSUE
                           ? sidedTissue(INTERNAL_TISSUE, 0)
                           : brainOrganKey(part.key, n, rec, d.effectors.get(n[NEURON.index]));
      part.tissue = tissueId;
      if (!d.tissues.has(tissueId))
        d.tissues.set(tissueId, {
          key : VARIANT_TISSUE[tissueBase(tissueId)] ?? part.key,
          variant : VARIANT_TISSUE[tissueBase(tissueId)] ? tissueBase(tissueId) : '',
          side : Number(tissueSide(tissueId)),
          members : []
        });
      d.tissues.get(tissueId).members.push({n, part});
    }
    const dominant = parts.reduce((best, part) => part.share > best.share ? part : best);
    d.anchors.set(n[NEURON.index], dominant.screen);
    d.mainParts.set(n[NEURON.index], parts.reduce((x, y) => x.share >= y.share ? x : y));
  }
  d.tissues.set(sidedTissue(GUT_TISSUE, 0), {key : GUT_TISSUE, side : 0, members : []});
  d.tissues.set(sidedTissue(RESERVE_TISSUE, 0), {key : RESERVE_TISSUE, side : 0, members : []});
  for (const tissue of d.tissues.values()) {
    let x = 0, y = 0, total = 0;
    for (const {part} of tissue.members) {
      x += part.p[0] * part.share;
      y += part.p[1] * part.share;
      total += part.share;
    }
    const q = tissue.key === GUT_TISSUE ? fishSatietyShape(a) : fishReserveShape(a);
    tissue.center = brainProject(total ? [ x / total, y / total ] : [ q.x, q.y ], d);
  }
  if (d.cellDetail < CELL_DETAIL.from && sessionState.neuronFocus >= 0 &&
      d.parts.get(sessionState.neuronFocus)?.length) {
    const parts = d.parts.get(sessionState.neuronFocus),
          part = parts.find(p => p.key === brainState.brainSelectionPart) ||
                 parts.reduce((a, b) => a.share >= b.share ? a : b);
    updateBrainState({brainPinnedTissue : part.tissue});
    updateBrainState({brainTissueFocus : part.key});
    updateSessionState({neuronFocus : -1});
    updateBrainState({brainOptionsKey : ''});
  }
  const detail =
            brainClamp(Math.log2(Math.max(1, fishBodyRadius(p) * c.scale / LAYOUT.detail_radius)) /
                       LAYOUT.detail_steps),
        share = LAYOUT.share + LAYOUT.share_span * detail * detail,
        cellMode = d.cellDetail >= CELL_DETAIL.from;
  if (!brainState.brainEdgeCache || brainState.brainEdgeCache.layout !== b.layout_id ||
      brainState.brainEdgeCache.edges.length !== b.edges.length ||
      brainState.brainEdgeCache.step !== Math.floor(f.step / LAYOUT.refresh)) {
    const current = new Map(b.learning?.weights || []),
          magnitude = e => Math.abs(current.get(e[SYNAPSE.id]) ?? e[SYNAPSE.strength]),
          ordered = b.edges.slice().sort((a, c) => magnitude(c) - magnitude(a) ||
                                                   a[SYNAPSE.id] - c[SYNAPSE.id]);
    updateBrainState({
      brainEdgeCache : {
        edges : b.edges,
        layout : b.layout_id,
        step : Math.floor(f.step / LAYOUT.refresh),
        ordered,
        maxWeight : ordered.reduce((best, e) => Math.max(best, magnitude(e)), TOLERANCE.negligible),
        magnitude
      }
    });
  }
  const ordered = brainState.brainEdgeCache.ordered,
        shownCount = Math.min(
            ordered.length, Math.max(1, Math.ceil(ordered.length * share)),
            cellMode ? Math.floor(LAYOUT.min_edges + LAYOUT.edges_per_detail * detail * detail)
                     : LAYOUT.coarse_edges),
        bundles = new Map();
  d.edgeBudget = shownCount;
  const visibleIds =
      cellMode ? new Set(ordered.slice(0, shownCount).map(e => e[SYNAPSE.id])) : null;
  if (cellMode) {
    const covered = new Set();
    for (const e of ordered) {
      if (!d.anchors.has(e[SYNAPSE.source]) || !d.anchors.has(e[SYNAPSE.target]))
        continue;
      if (visibleIds.size < Math.max(shownCount, LAYOUT.min_visible) &&
          (!covered.has(e[SYNAPSE.source]) || !covered.has(e[SYNAPSE.target])))
        visibleIds.add(e[SYNAPSE.id]);
      covered.add(e[SYNAPSE.source]);
      covered.add(e[SYNAPSE.target]);
    }
  }
  if (visibleIds && sessionState.neuronFocus >= 0)
    for (const e of ordered)
      if (e[SYNAPSE.source] === sessionState.neuronFocus ||
          e[SYNAPSE.target] === sessionState.neuronFocus)
        visibleIds.add(e[SYNAPSE.id]);
  if (!cellMode && !brainState.brainEdgeCache.organOrdered) {
    const seen = new Set(), organOrdered = [];
    for (const e of ordered) {
      const a = d.mainParts.get(e[SYNAPSE.source]), b = d.mainParts.get(e[SYNAPSE.target]);
      if (!a || !b)
        continue;
      const key = a.tissue + '>' + b.tissue + ':' + (e[SYNAPSE.strength] >= 0);
      if (!seen.has(key)) {
        seen.add(key);
        organOrdered.push(e);
      }
    }
    updateBrainState({brainEdgeCache : {...brainState.brainEdgeCache, organOrdered}});
  }
  for (const e of cellMode ? ordered : brainState.brainEdgeCache.organOrdered) {
    if (!d.anchors.has(e[SYNAPSE.source]) || !d.anchors.has(e[SYNAPSE.target]) ||
        (cellMode && !visibleIds.has(e[SYNAPSE.id])))
      continue;
    const a = d.mainParts.get(e[SYNAPSE.source]), b = d.mainParts.get(e[SYNAPSE.target]);
    const key = cellMode ? String(e[SYNAPSE.id])
                         : a.tissue + '>' + b.tissue + ':' + (e[SYNAPSE.strength] >= 0);
    if (bundles.has(key))
      continue;
    const curve = brainConnection(d, a, b, e[SYNAPSE.source] === e[SYNAPSE.target]);
    const edge = {
      e,
      curve,
      tissues : [ a.tissue, b.tissue ],
      width : LAYOUT.width + (LAYOUT.width_base + LAYOUT.width_per_detail * detail) *
                                 Math.sqrt(brainState.brainEdgeCache.magnitude(e) /
                                           brainState.brainEdgeCache.maxWeight),
      alpha : LAYOUT.alpha
    };
    bundles.set(key, edge);
    d.edges.push(edge);
    d.curves.set(e[SYNAPSE.id], curve);
    if (!cellMode && d.edges.length >= shownCount)
      break;
  }
  d.organEdges = new Map();
  for (const edge of d.edges)
    for (const key of new Set(edge.tissues || [])) {
      let groups = d.organEdges.get(key);
      if (!groups)
        d.organEdges.set(key, groups = [ [], [] ]);
      groups[edge.e[SYNAPSE.strength] >= 0 ? 0 : 1].push(edge.curve);
    }
  const mixed = [];
  if (d.cellDetail >= CELL_DETAIL.from)
    for (const n of b.neurons) {
      const parts = d.parts.get(n[NEURON.index]);
      if (parts.length < 2)
        continue;
      const main = parts.reduce((a, b) => a.share >= b.share ? a : b);
      for (const part of parts)
        if (part !== main) {
          part.mixedCurve ??= brainConnection(d, part, main);
          mixed.push(part.mixedCurve);
        }
    }
  let left = w, top = h, right = 0, bottom = 0;
  for (const q of d.edges.map(e => e.curve).concat(mixed))
    for (let i = 0; i < q.length; i += 2) {
      left = Math.min(left, q[i]);
      right = Math.max(right, q[i]);
      top = Math.min(top, q[i + 1]);
      bottom = Math.max(bottom, q[i + 1]);
    }
  left = Math.floor(left - LAYOUT.pad);
  top = Math.floor(top - LAYOUT.pad);
  right = Math.ceil(right + LAYOUT.pad);
  bottom = Math.ceil(bottom + LAYOUT.pad);
  d.meshBounds =
      {x : left, y : top, width : Math.max(1, right - left), height : Math.max(1, bottom - top)};
  const strokes = new Map();
  for (let i = 0; i < d.edges.length; i++) {
    const edge = d.edges[i],
          alpha = edge.alpha *
                  brainClamp(
                      (d.edges.length - i) /
                      Math.max(1, Math.min(LAYOUT.fade_edges, d.edges.length * LAYOUT.fade_share))),
          width = Math.round(edge.width * LAYOUT.width_steps) / LAYOUT.width_steps,
          key = ((d.b.learning?.signals?.[edge.e[SYNAPSE.id]] ?? edge.e[SYNAPSE.strength]) >= 0
                     ? '+'
                     : '-') +
                ':' + width + ':' + alpha;
    let group = strokes.get(key);
    if (!group) {
      group = {alpha, width, color : LAYOUT.edge, curves : []};
      strokes.set(key, group);
    }
    group.curves.push(edge.curve);
  }
  d.wiringStrokes = [...strokes.values() ];
  return d;
}

const initializers = {

};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
