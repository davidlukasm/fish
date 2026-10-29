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
import {brainDrawMixed} from './brain_painter.js';
import {brainConnection, brainDrawCurve} from './brain_paths.js';
import {brainPresentationFish} from './brain_signals.js';
import {camera} from './camera.js';
import {el} from './dom.js';
import {fishBodyRadius, fishShapeScale} from './fish_fins.js';
import {fishPoseAnatomy, fishSnapshotAnatomy} from './fish_forms.js';
import {fishReserveShape, fishSatietyShape} from './fish_organs.js';
import {TankLayer} from './renderer.js';
import {sessionState} from './session.js';
import {blendFish, frameFish} from './state.js';
export const brain_layoutState = {};

export function brainBuild(f, c = camera(f)) {
  const b = f.brain, raw = frameFish(f);
  if (!raw || !b?.neurons?.length)
    return null;
  const p = brainPresentationFish(blendFish(raw)),
        base = animalsState.animalSceneFish.get(p[4])?.a || fishSnapshotAnatomy(raw, 16),
        a = fishPoseAnatomy(base, p), w = 1024, h = 1024, screen = {x : 512, y : 512},
        r = 200 * fishShapeScale(p);
  const d = {
    b,
    p,
    raw,
    step : f.step,
    a,
    c,
    wiring : brainConnectivity(b),
    visualSamples : new Map((b.visual_samples || []).map(sample => [sample[0], sample])),
    angle : 0,
    cx : screen.x,
    cy : screen.y,
    r,
    pigments : brainPigmentPositions(b, a),
    nerve : brainNervePositions(b, a),
    cellDetail : brainCellDetail(p, c),
    nodes : new Map(b.neurons.map(n => [n[5], n])),
    parts : new Map(),
    mainParts : new Map(),
    tissues : new Map(),
    anchors : new Map(),
    receptors : new Map(b.receptors.map(r => [r[0], r])),
    effectors : new Map(),
    curves : new Map(),
    edges : [],
    width : w,
    height : h
  };
  for (const e of b.effectors) {
    if (!d.effectors.has(e[0]))
      d.effectors.set(e[0], []);
    d.effectors.get(e[0]).push(e);
  }
  for (const n of b.neurons) {
    if (!n[4]) {
      d.parts.set(n[5], []);
      continue;
    }
    const parts = [], rec = d.receptors.get(n[5]);
    if (n[12] > 0)
      parts.push({key : 'internal', share : n[12], p : brainPartPosition(n, 'internal', d, rec)});
    const dominantSense = n[13]?.indexOf(Math.max(...n[13]));
    for (let k = 0; k < Math.max(n[13]?.length || 0, n[14]?.length || 0); k++) {
      if (k === dominantSense && n[13]?.[k] > 0)
        parts.push({key : 's' + k, share : n[13][k], p : brainPartPosition(n, 's' + k, d, rec)});
      if (n[14]?.[k] > 0) {
        parts.push({key : 'm' + k, share : n[14][k], p : brainPartPosition(n, 'm' + k, d, rec)});
      }
    }
    if (!parts.length)
      parts.push({key : 'internal', share : 1, p : brainPartPosition(n, 'internal', d, rec)});
    d.parts.set(n[5], parts);
    for (const part of parts) {
      part.neuron = n[5];
      part.screen = brainProject(part.p, d);
      const tissueId = part.key === 'internal' ? 'internal:0' : brainOrganKey(part.key, n, rec);
      part.tissue = tissueId;
      if (!d.tissues.has(tissueId))
        d.tissues.set(tissueId, {
          key : tissueId.startsWith('barbel:') ? 's1' : part.key,
          variant : tissueId.startsWith('barbel:') ? 'barbel' : '',
          side : Number(tissueId.split(':')[1]),
          members : []
        });
      d.tissues.get(tissueId).members.push({n, part});
    }
    const dominant = parts.reduce((best, part) => part.share > best.share ? part : best);
    d.anchors.set(n[5], dominant.screen);
    d.mainParts.set(n[5], parts.reduce((x, y) => x.share >= y.share ? x : y));
  }
  if (!d.tissues.has('s8:0'))
    d.tissues.set('s8:0', {key : 's8', side : 0, members : []});
  if (!d.tissues.has('s4:0'))
    d.tissues.set('s4:0', {key : 's4', side : 0, members : []});
  for (const tissue of d.tissues.values()) {
    let x = 0, y = 0, total = 0;
    for (const {part} of tissue.members) {
      x += part.p[0] * part.share;
      y += part.p[1] * part.share;
      total += part.share;
    }
    const q = tissue.key === 's8' ? fishSatietyShape(a) : fishReserveShape(a);
    tissue.center = brainProject(total ? [ x / total, y / total ] : [ q.x, q.y ], d);
  }
  if (d.cellDetail < .45 && sessionState.neuronFocus >= 0 &&
      d.parts.get(sessionState.neuronFocus)?.length) {
    const parts = d.parts.get(sessionState.neuronFocus),
          part = parts.find(p => p.key === brainState.brainSelectionPart) ||
                 parts.reduce((a, b) => a.share >= b.share ? a : b);
    updateBrainState({brainPinnedTissue : part.tissue});
    updateBrainState({brainTissueFocus : part.key});
    updateSessionState({neuronFocus : -1});
    updateBrainState({brainOptionsKey : ''});
  }
  const selection = el('brain-flow').value === 'selection', strong = el('strong-edges').checked,
        detail = brainClamp(Math.log2(Math.max(1, fishBodyRadius(p) * c.scale / 95)) / 4),
        share = (strong ? .15 : 1) * (.003 + .997 * detail * detail),
        cellMode = d.cellDetail >= .45;
  if (!brainState.brainEdgeCache || brainState.brainEdgeCache.layout !== b.layout_id ||
      brainState.brainEdgeCache.edges.length !== b.edges.length ||
      brainState.brainEdgeCache.step !== Math.floor(f.step / 60)) {
    const current = new Map(b.learning?.weights || []),
          magnitude = e => Math.abs(current.get(e[3]) ?? e[2]),
          ordered = b.edges.slice().sort((a, c) => magnitude(c) - magnitude(a) || a[3] - c[3]);
    updateBrainState({
      brainEdgeCache : {
        edges : b.edges,
        layout : b.layout_id,
        step : Math.floor(f.step / 60),
        ordered,
        maxWeight : ordered.reduce((best, e) => Math.max(best, magnitude(e)), 1e-9),
        magnitude
      }
    });
  }
  const ordered = brainState.brainEdgeCache.ordered,
        shownCount = Math.min(ordered.length, Math.max(1, Math.ceil(ordered.length * share)),
                              cellMode ? Math.floor(24 + 1500 * detail * detail) : 28),
        bundles = new Map();
  d.edgeBudget = shownCount;
  const visibleIds = cellMode ? new Set(ordered.slice(0, shownCount).map(e => e[3])) : null;
  if (cellMode && !strong) {
    const covered = new Set();
    for (const e of ordered) {
      if (!d.anchors.has(e[0]) || !d.anchors.has(e[1]))
        continue;
      if (visibleIds.size < Math.max(shownCount, 1200) &&
          (!covered.has(e[0]) || !covered.has(e[1])))
        visibleIds.add(e[3]);
      covered.add(e[0]);
      covered.add(e[1]);
    }
  }
  if (visibleIds && sessionState.neuronFocus >= 0)
    for (const e of ordered)
      if (e[0] === sessionState.neuronFocus || e[1] === sessionState.neuronFocus)
        visibleIds.add(e[3]);
  // A pair of organs keeps the same strongest representative as the cells move.
  if (!cellMode && !brainState.brainEdgeCache.organOrdered) {
    const seen = new Set(), organOrdered = [];
    for (const e of ordered) {
      const a = d.mainParts.get(e[0]), b = d.mainParts.get(e[1]);
      if (!a || !b)
        continue;
      const key = a.tissue + '>' + b.tissue + ':' + (e[2] >= 0);
      if (!seen.has(key)) {
        seen.add(key);
        organOrdered.push(e);
      }
    }
    updateBrainState({brainEdgeCache : {...brainState.brainEdgeCache, organOrdered}});
  }
  for (const e of cellMode ? ordered : brainState.brainEdgeCache.organOrdered) {
    if (!d.anchors.has(e[0]) || !d.anchors.has(e[1]) || (cellMode && !visibleIds.has(e[3])))
      continue;
    if (selection && sessionState.neuronFocus >= 0 && e[0] !== sessionState.neuronFocus &&
        e[1] !== sessionState.neuronFocus)
      continue;
    const a = d.mainParts.get(e[0]), b = d.mainParts.get(e[1]);
    if (selection && brainState.brainPinnedTissue && a.tissue !== brainState.brainPinnedTissue &&
        b.tissue !== brainState.brainPinnedTissue)
      continue;
    const key = cellMode ? String(e[3]) : a.tissue + '>' + b.tissue + ':' + (e[2] >= 0);
    if (bundles.has(key))
      continue;
    const curve = brainConnection(d, a, b, e[0] === e[1]);
    const edge = {
      e,
      curve,
      tissues : [ a.tissue, b.tissue ],
      width : .45 + (.55 + 3.1 * detail) * Math.sqrt(brainState.brainEdgeCache.magnitude(e) /
                                                     brainState.brainEdgeCache.maxWeight),
      alpha : (selection ? .24 : .13)
    };
    bundles.set(key, edge);
    d.edges.push(edge);
    d.curves.set(e[3], curve);
    if (!cellMode && d.edges.length >= shownCount)
      break;
  }
  // Build each organ's signed edge lists once, preserving drawing order and self-edge uniqueness.
  d.organEdges = new Map();
  for (const edge of d.edges)
    for (const key of new Set(edge.tissues || [])) {
      let groups = d.organEdges.get(key);
      if (!groups)
        d.organEdges.set(key, groups = [ [], [] ]);
      groups[edge.e[2] >= 0 ? 0 : 1].push(edge.curve);
    }
  const mixed = [];
  if (d.cellDetail >= .45)
    for (const n of b.neurons) {
      const parts = d.parts.get(n[5]);
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
  left = Math.floor(left - 6);
  top = Math.floor(top - 6);
  right = Math.ceil(right + 6);
  bottom = Math.ceil(bottom + 6);
  const width = Math.max(1, right - left), height = Math.max(1, bottom - top),
        resolution = Math.min(1, 1024 / width, 1024 / height);
  d.meshBounds = {x : left, y : top, width, height};
  d.mesh = new TankLayer();
  d.mesh.width = Math.max(1, Math.ceil(width * resolution));
  d.mesh.height = Math.max(1, Math.ceil(height * resolution));
  const mesh = d.mesh.getContext();
  mesh.setTransform(resolution, 0, 0, resolution, -left * resolution, -top * resolution);

  const strokes = new Map();
  for (let i = 0; i < d.edges.length; i++) {
    const edge = d.edges[i],
          alpha = edge.alpha *
                  brainClamp((d.edges.length - i) / Math.max(1, Math.min(8, d.edges.length * .15))),
          width = Math.round(edge.width * 16) / 16,
          key = ((d.b.learning?.signals?.[edge.e[3]] ?? edge.e[2]) >= 0 ? '+' : '-') + ':' + width +
                ':' + alpha;
    let group = strokes.get(key);
    if (!group) {
      group = {alpha, width, color : '#657f86', curves : []};
      strokes.set(key, group);
    }
    group.curves.push(edge.curve);
  }
  for (const group of strokes.values()) {
    mesh.globalAlpha = group.alpha;
    mesh.strokeStyle = group.color;
    mesh.lineWidth = group.width;
    mesh.beginPath();
    for (const q of group.curves)
      brainDrawCurve(mesh, q);
    mesh.stroke();
  }
  brainDrawMixed(mesh, d);
  return d;
}

const initializers = {

};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
