import {brainTissuePath} from './brain_tissue.js';
import {fishBodyPath} from './fish_fins.js';
import {fishEye} from './fish_organs.js';
import {TankPath} from './renderer.js';
export const brain_occlusionState = {};

function brainBehindSkin(key, variant = '') {
  return [ 'm0', 'm1', 'm6', 's9' ].includes(key) || variant === 'barbel';
}

export function brainOrganLayer(tissue) {
  const key = tissue.key;
  return brainBehindSkin(key, tissue.variant)              ? 0
         : key === 's5'                                    ? 1
         : key === 'internal'                              ? 2
         : [ 's4', 's10', 's7', 'm8', 'm9' ].includes(key) ? 3
         : key === 's8'                                    ? 4.5
         : [ 'm3', 'm4' ].includes(key)                    ? 4
         : [ 'm2', 'm5' ].includes(key)                    ? 5
         : key === 's1'                                    ? 6
         : key === 's0'                                    ? 7
                                                           : .5;
}

// Paths are recorded once per geometry frame and reused for paint, clipping and picking.
export function brainPathBounds(path) {
  if (path.bounds)
    return path.bounds;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  const add = (x, y) => {
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  };
  for (const [method, a] of path) {
    if (method === 'ellipse' || method === 'arc') {
      const rx = a[2], ry = method === 'arc' ? rx : a[3],
            radius = method === 'ellipse' && a[4] ? Math.max(rx, ry) : 0;
      add(a[0] - (radius || rx), a[1] - (radius || ry));
      add(a[0] + (radius || rx), a[1] + (radius || ry));
    } else
      for (let i = 0; i + 1 < a.length; i += 2)
        add(a[i], a[i + 1]);
  }
  return path.bounds = Number.isFinite(left)
                           ? {left, top, right, bottom}
                           : {left : 0, top : 0, right : 0, bottom : 0, empty : true};
}

function brainBoundsOverlap(a, b) {
  return !a.empty && !b.empty && a.left < b.right && a.right > b.left && a.top < b.bottom &&
         a.bottom > b.top;
}

export function brainRecordPath(draw) {
  let commands = [];
  const recorder = {beginPath() { commands = []; }};
  for (const method of ['moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'ellipse', 'arc',
                        'rect', 'closePath'])
    recorder[method] = (...args) => commands.push([ method, args ]);
  draw(recorder);
  return commands;
}

export function brainReplayPath(g, path, append = false) {
  if (!append)
    g.beginPath();
  for (let i = 0; i < path.length; i++) {
    const [method, args] = path[i];
    if (append && i === 0 && (method === 'ellipse' || method === 'arc')) {
      const [x, y, rx] = args, ry = method === 'arc' ? rx : args[3],
                   angle = method === 'arc' ? 0 : args[4],
                   start = method === 'arc' ? args[3] : args[5];
      g.moveTo(x + Math.cos(angle) * rx * Math.cos(start) - Math.sin(angle) * ry * Math.sin(start),
               y + Math.sin(angle) * rx * Math.cos(start) + Math.cos(angle) * ry * Math.sin(start));
    }
    g[method](...args);
  }
}

export function brainGeometry(d) {
  if (d.geometry)
    return d.geometry;
  const paths = new Map(), occluders = new Map(),
        ordered = [...d.tissues.values() ].sort((a, b) => brainOrganLayer(a) - brainOrganLayer(b));
  for (const t of ordered)
    paths.set(t.key + ':' + t.side + ':' + (t.variant || ''),
              brainRecordPath(g => brainTissuePath(g, d, t.key, t.side, t.variant)));
  const body = brainRecordPath(g => fishBodyPath(g, d.r, d.a)),
        eyes = brainRecordPath(g => {
          g.beginPath();
          for (let side = 0; side < 2; side++)
            if (d.a.organs[side + 1]) {
              const q = fishEye(d.a, side);
              g.moveTo((q.x + q.rx * 1.16) * d.r, q.y * d.r);
              g.ellipse(q.x * d.r, q.y * d.r, q.rx * 1.16 * d.r, q.ry * 1.16 * d.r, 0, 0,
                        Math.PI * 2);
            }
        });
  return d.geometry = {paths, occluders, ordered, body, eyes};
}

export function brainTissueGeometry(d, t) {
  return brainGeometry(d).paths.get(t.key + ':' + t.side + ':' + (t.variant || ''));
}

function brainOccluders(d, t) {
  if (t.key === 's0' || t.variant === 'barbel' || t.key === 'internal' && d.cellDetail >= .5)
    return [];
  const geom = brainGeometry(d);
  if (geom.occluders.has(t))
    return geom.occluders.get(t);
  const bounds = brainPathBounds(brainTissueGeometry(d, t)),
        result = geom.ordered.filter(
            o => o !== t &&
                 brainBoundsOverlap(bounds, brainPathBounds(brainTissueGeometry(d, o))) &&
                 [
                   'internal', 's4', 's10', 's7', 's8', 'm8', 'm9', 'm3', 'm4', 'm2', 'm5', 's1',
                   's0'
                 ].includes(o.key) &&
                 o.variant !== 'barbel' && brainOrganLayer(o) > brainOrganLayer(t));
  geom.occluders.set(t, result);
  return result;
}

function brainClipOutside(g, d, path, bounds) {
  const b = bounds || {
    left : -d.width - d.r * 4,
    top : -d.height - d.r * 4,
    right : d.width + d.r * 4,
    bottom : d.height + d.r * 4
  };
  g.beginPath();
  g.rect(b.left - 8, b.top - 8, b.right - b.left + 16, b.bottom - b.top + 16);
  brainReplayPath(g, path, true);
  g.clip('evenodd');
}

export function brainClipTissue(g, d, t) {
  const geom = brainGeometry(d), bounds = brainPathBounds(brainTissueGeometry(d, t));
  if (bounds.empty) {
    g.beginPath();
    g.rect(0, 0, 0, 0);
    g.clip();
    return;
  }
  g.beginPath();
  g.rect(bounds.left - 8, bounds.top - 8, bounds.right - bounds.left + 16,
         bounds.bottom - bounds.top + 16);
  g.clip();
  if (brainBehindSkin(t.key, t.variant))
    brainClipOutside(g, d, geom.body, bounds);
  else if (!['s0', 's1', 'm2', 'm5'].includes(t.key)) {
    brainReplayPath(g, geom.body);
    g.clip();
  }
  for (const o of brainOccluders(d, t))
    brainClipOutside(g, d, brainTissueGeometry(d, o), bounds);
  if (t.key === 'm5')
    brainClipOutside(g, d, geom.eyes, bounds);
}

export function brainPreparedPath(path) {
  if (!path.probe) {
    const g = new TankPath();
    brainReplayPath(g, path);
    path.probe = g;
  }
  return path.probe;
}

export function brainPointVisible(d, t, local) {
  const shape = brainTissueGeometry(d, t);
  if (!shape || brainPathBounds(shape).empty)
    return false;
  const contains = path => {
    const b = brainPathBounds(path);
    return local[0] >= b.left && local[0] <= b.right && local[1] >= b.top && local[1] <= b.bottom &&
           brainPreparedPath(path).isPointInPath(...local);
  }, geom = brainGeometry(d), body = contains(geom.body);
  if (brainBehindSkin(t.key, t.variant) && body)
    return false;
  if (!brainBehindSkin(t.key, t.variant) && !['s0', 's1', 'm2', 'm5'].includes(t.key) && !body)
    return false;
  if (t.key === 'm5' && contains(geom.eyes))
    return false;
  return !brainOccluders(d, t).some(o => contains(brainTissueGeometry(d, o)));
}

const initializers = {

};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
