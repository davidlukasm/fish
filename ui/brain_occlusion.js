import {ANATOMY, BODY_SHAPE} from './schema.js';
import {
  BARBEL,
  GILL,
  GRAVITY,
  GUT_MUSCLE,
  GUT_TISSUE,
  INTERNAL_TISSUE,
  MOTOR_TISSUE,
  RESERVE_TISSUE,
  SENSE_TISSUE
} from './tissue.js';
import {brainTissuePath} from './brain_tissue.js';
import {fishBodyPath} from './fish_fins.js';
import {fishEye} from './fish_organs.js';
import {TankPath} from './renderer.js';
export const brain_occlusionState = {};

function brainBehindSkin(key, variant = '') {
  return !variant &&
             [ MOTOR_TISSUE.forward, MOTOR_TISSUE.turn, MOTOR_TISSUE.defense ].includes(key) ||
         variant === BARBEL;
}

const TISSUE_LAYERS = Object.freeze([
  [ SENSE_TISSUE.intake ], [ INTERNAL_TISSUE ],
  [
    RESERVE_TISSUE, SENSE_TISSUE.inner_pressure, SENSE_TISSUE.blood, SENSE_TISSUE.bladder_pressure,
    MOTOR_TISSUE.bladder, MOTOR_TISSUE.gland, GRAVITY
  ],
  [ MOTOR_TISSUE.eggs, MOTOR_TISSUE.sperm ],
  [ SENSE_TISSUE.gonad_pressure, GUT_TISSUE, GUT_MUSCLE ],
  [ MOTOR_TISSUE.suction, MOTOR_TISSUE.aggression, GILL ], [ SENSE_TISSUE.odor ],
  [ SENSE_TISSUE.light, SENSE_TISSUE.proximity ]
]);
const UNLISTED_LAYER = .5;
export function brainOrganLayer(tissue) {
  if (brainBehindSkin(tissue.key, tissue.variant))
    return 0;
  const key = [ GRAVITY, GILL, GUT_MUSCLE ].includes(tissue.variant) ? tissue.variant : tissue.key,
        layer = TISSUE_LAYERS.findIndex(keys => keys.includes(key));
  return layer < 0 ? UNLISTED_LAYER : layer + 1;
}

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
            if (d.a.organs[ANATOMY.eye_left + side]) {
              const q = fishEye(d.a, side);
              g.moveTo((q.x + q.rx * BODY_SHAPE.eye_clearance) * d.r, q.y * d.r);
              g.ellipse(q.x * d.r, q.y * d.r, q.rx * BODY_SHAPE.eye_clearance * d.r,
                        q.ry * BODY_SHAPE.eye_clearance * d.r, 0, 0, Math.PI * 2);
            }
        });
  return d.geometry = {paths, occluders, ordered, body, eyes};
}

export function brainTissueGeometry(d, t) {
  return brainGeometry(d).paths.get(t.key + ':' + t.side + ':' + (t.variant || ''));
}

const OPEN_DETAIL = .5;
function brainOccluders(d, t) {
  if ((t.key === SENSE_TISSUE.light || t.key === SENSE_TISSUE.proximity) || t.variant === BARBEL ||
      t.key === INTERNAL_TISSUE && d.cellDetail >= OPEN_DETAIL)
    return [];
  const geom = brainGeometry(d);
  if (geom.occluders.has(t))
    return geom.occluders.get(t);
  const bounds = brainPathBounds(brainTissueGeometry(d, t)),
        result = geom.ordered.filter(
            o => o !== t &&
                 brainBoundsOverlap(bounds, brainPathBounds(brainTissueGeometry(d, o))) &&
                 [
                   GUT_TISSUE, RESERVE_TISSUE, INTERNAL_TISSUE, SENSE_TISSUE.proximity,
                   SENSE_TISSUE.blood, SENSE_TISSUE.bladder_pressure, SENSE_TISSUE.gonad_pressure,
                   MOTOR_TISSUE.bladder, MOTOR_TISSUE.gland, MOTOR_TISSUE.eggs, MOTOR_TISSUE.sperm,
                   MOTOR_TISSUE.suction, MOTOR_TISSUE.aggression, SENSE_TISSUE.odor,
                   SENSE_TISSUE.light
                 ].includes(o.key) &&
                 o.variant !== BARBEL && brainOrganLayer(o) > brainOrganLayer(t));
  geom.occluders.set(t, result);
  return result;
}

const CLIP = Object.freeze({reach : 4, pad : 8});
function brainClipOutside(g, d, path, bounds) {
  const b = bounds || {
    left : -d.width - d.r * CLIP.reach,
    top : -d.height - d.r * CLIP.reach,
    right : d.width + d.r * CLIP.reach,
    bottom : d.height + d.r * CLIP.reach
  };
  g.beginPath();
  g.rect(b.left - CLIP.pad, b.top - CLIP.pad, b.right - b.left + 2 * CLIP.pad,
         b.bottom - b.top + 2 * CLIP.pad);
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
  g.rect(bounds.left - CLIP.pad, bounds.top - CLIP.pad, bounds.right - bounds.left + 2 * CLIP.pad,
         bounds.bottom - bounds.top + 2 * CLIP.pad);
  g.clip();
  if (brainBehindSkin(t.key, t.variant))
    brainClipOutside(g, d, geom.body, bounds);
  else if (![SENSE_TISSUE.light, SENSE_TISSUE.odor, MOTOR_TISSUE.suction, MOTOR_TISSUE.aggression]
                .includes(t.key)) {
    brainReplayPath(g, geom.body);
    g.clip();
  }
  for (const o of brainOccluders(d, t))
    brainClipOutside(g, d, brainTissueGeometry(d, o), bounds);
  if (t.key === MOTOR_TISSUE.aggression)
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
  if (!brainBehindSkin(t.key, t.variant) &&
      ![SENSE_TISSUE.light, SENSE_TISSUE.odor, MOTOR_TISSUE.suction, MOTOR_TISSUE.aggression]
           .includes(t.key) &&
      !body)
    return false;
  if (t.key === MOTOR_TISSUE.aggression && contains(geom.eyes))
    return false;
  return !brainOccluders(d, t).some(o => contains(brainTissueGeometry(d, o)));
}

const initializers = {

};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
