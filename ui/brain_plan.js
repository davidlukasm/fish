import {
  INTERNAL_TISSUE,
  isMotorTissue,
  isSenseTissue,
  MOTOR_TISSUE,
  motorTissue,
  SENSE_TISSUE,
  senseTissue,
  tissueKind
} from './tissue.js';
import {HORMONE_EFFECT, MOTOR_KIND, NEURON, SENSE_KIND, SYNAPSE} from './schema.js';
// The brain as a network of stations: organ stations (sense and motor cells by organ and side),
// hubs clustered from the processing cells by whom they listen to and drive, the summed
// connections between stations and the strongest signal paths as lines. A pure model of the
// concrete brain without layout; only the station names come from the wording resources. Views
// and the thought observers build on it.
import {t, textArea} from './strings.js';
export const brain_planState = {};

// Organ stations: [organ key, family]
const ORGAN_KINDS = {
  suck : [ MOTOR_TISSUE.suction, 'eat' ],
  bite : [ MOTOR_TISSUE.aggression, 'eat' ],
  noseL : [ SENSE_TISSUE.odor, 'nose' ],
  noseR : [ SENSE_TISSUE.odor, 'nose' ],
  touch : [ SENSE_TISSUE.touch, 'touch' ],
  eyeL : [ SENSE_TISSUE.light, 'eye' ],
  eyeR : [ SENSE_TISSUE.light, 'eye' ],
  nearL : [ SENSE_TISSUE.proximity, 'near' ],
  nearR : [ SENSE_TISSUE.proximity, 'near' ],
  latL : [ SENSE_TISSUE.flow, 'lat' ],
  latR : [ SENSE_TISSUE.flow, 'lat' ],
  turnL : [ MOTOR_TISSUE.turn, 'move' ],
  turnR : [ MOTOR_TISSUE.turn, 'move' ],
  gut : [ SENSE_TISSUE.intake, 'body' ],
  hsense : [ SENSE_TISSUE.blood, 'body' ],
  spines : [ MOTOR_TISSUE.defense, 'guard' ],
  pigment : [ MOTOR_TISSUE.pigment, 'show' ],
  bladder : [ MOTOR_TISSUE.bladder, 'depth' ],
  gland : [ MOTOR_TISSUE.gland, 'gland' ],
  egg : [ MOTOR_TISSUE.eggs, 'repro' ],
  sperm : [ MOTOR_TISSUE.sperm, 'repro' ],
  tail : [ MOTOR_TISSUE.forward, 'move' ]
};
// A station gathers processing cells (hub) or the cells of one sense or motor organ.
export const STATION = Object.freeze({hub : 'h', sense : 's', motor : 'm'});
const MOTOR_ORGANS = {
  [MOTOR_KIND.forward] : 'tail',
  [MOTOR_KIND.turn] : 'turn',
  [MOTOR_KIND.suction] : 'suck',
  [MOTOR_KIND.eggs] : 'egg',
  [MOTOR_KIND.sperm] : 'sperm',
  [MOTOR_KIND.aggression] : 'bite',
  [MOTOR_KIND.defense] : 'spines',
  [MOTOR_KIND.pigment] : 'pigment',
  [MOTOR_KIND.bladder] : 'bladder',
  [MOTOR_KIND.gland] : 'gland'
};
// Neutral line colours, distinguishable on the dark map; lines are numbered by strength.
// ---------------------------------------------------------------------- stations
// Sense and motor cells belong to their organ (and side); processing cells form the hubs.
function organOf(n) {
  if (!n[NEURON.functional])
    return '';
  let best = n[NEURON.internal] || 0, key = INTERNAL_TISSUE;
  (n[NEURON.senses] || []).forEach((v, j) => {
    if (v > best)
      [best, key] = [ v, senseTissue(j) ];
  });
  (n[NEURON.motors] || []).forEach((v, j) => {
    if (v > best)
      [best, key] = [ v, motorTissue(j) ];
  });
  const left = n[NEURON.x] < 0;
  if (isSenseTissue(key)) {
    const k = tissueKind(key);
    return k === SENSE_KIND.light       ? (left ? 'eyeL' : 'eyeR')
           : k === SENSE_KIND.proximity ? (left ? 'nearL' : 'nearR')
           : k === SENSE_KIND.odor      ? (left ? 'noseL' : 'noseR')
           : k === SENSE_KIND.flow      ? (left ? 'latL' : 'latR')
           : k === SENSE_KIND.touch     ? 'touch'
           : k === SENSE_KIND.blood     ? 'hsense'
                                        : 'gut';
  }
  if (isMotorTissue(key)) {
    const k = tissueKind(key);
    return k === MOTOR_KIND.turn ? (left ? 'turnL' : 'turnR') : MOTOR_ORGANS[k] || '';
  }
  return '';
}

function unit(v) {
  let s = 0;
  for (const x of v)
    s += x * x;
  s = Math.sqrt(s);
  if (s)
    for (let i = 0; i < v.length; i++)
      v[i] /= s;
  return v;
}

// Clustering refines its centres over ROUNDS rounds.
const KMEANS = Object.freeze({rounds : 14});
function kmeans(points, k) {
  const dist = (a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i++)
      s += (a[i] - b[i]) ** 2;
    return s;
  };
  // Deterministic farthest-point start: the same brain always gives the same plan.
  const centres = [ Float64Array.from(points[0]) ];
  while (centres.length < k) {
    let far = 0, best = -1;
    points.forEach((p, i) => {
      const d = Math.min(...centres.map(c => dist(p, c)));
      if (d > best)
        [best, far] = [ d, i ];
    });
    centres.push(Float64Array.from(points[far]));
  }
  let assign = new Array(points.length).fill(0), cost = 0;
  for (let round = 0; round < KMEANS.rounds; round++) {
    cost = 0;
    assign = points.map(p => {
      let bestK = 0, bestD = Infinity;
      centres.forEach((c, j) => {
        const d = dist(p, c);
        if (d < bestD)
          [bestD, bestK] = [ d, j ];
      });
      cost += bestD;
      return bestK;
    });
    centres.forEach((c, j) => {
      const mine = points.filter((_, i) => assign[i] === j);
      if (!mine.length)
        return;
      c.fill(0);
      for (const p of mine)
        for (let i = 0; i < c.length; i++)
          c[i] += p[i] / mine.length;
    });
  }
  return {assign, cost};
}

// Processing cells are grouped by whom they listen to and whom they drive; the number of hubs
// follows the brain: more hubs only while they explain clearly more of the wiring.
// Processing cells cluster by their wiring and place: up to MAX_HUBS hubs, about one per
// CELLS_PER_HUB squared cells; another hub must cut the cost below GAIN.
const HUBS =
    Object.freeze({neighbours : .5, place : .35, max_hubs : 10, cells_per_hub : 3, gain : .8});
function clusterHubs(b, organs) {
  const present = [...new Set(organs.values()) ], index = new Map(present.map((o, i) => [o, i])),
        dims = 2 * present.length + 2,
        internal = b.neurons.filter(n => n[NEURON.functional] && !organs.has(n[NEURON.index]));
  if (!internal.length)
    return new Map();
  const vec = new Map(internal.map(n => [n[NEURON.index], new Float64Array(dims)])),
        near = new Map(internal.map(n => [n[NEURON.index], []]));
  for (const e of b.edges) {
    const a = organs.get(e[SYNAPSE.source]), c = organs.get(e[SYNAPSE.target]),
          w = Math.abs(e[SYNAPSE.strength]);
    if (a && vec.has(e[SYNAPSE.target]))
      vec.get(e[SYNAPSE.target])[index.get(a)] += w;
    else if (c && vec.has(e[SYNAPSE.source]))
      vec.get(e[SYNAPSE.source])[present.length + index.get(c)] += w;
    else if (vec.has(e[SYNAPSE.source]) && vec.has(e[SYNAPSE.target])) {
      near.get(e[SYNAPSE.source]).push(e[SYNAPSE.target]);
      near.get(e[SYNAPSE.target]).push(e[SYNAPSE.source]);
    }
  }
  for (const v of vec.values())
    unit(v);
  const ids = internal.map(n => n[NEURON.index]), points = internal.map(n => {
    const own = vec.get(n[NEURON.index]), out = Float64Array.from(own),
          list = near.get(n[NEURON.index]);
    for (const j of list) {
      const u = vec.get(j);
      for (let i = 0; i < dims; i++)
        out[i] += HUBS.neighbours * u[i] / list.length;
    }
    unit(out);
    out[dims - 2] = HUBS.place * n[NEURON.x];
    out[dims - 1] = HUBS.place * n[NEURON.y];
    return out;
  });
  const most =
      Math.min(HUBS.max_hubs, Math.max(1, Math.round(Math.sqrt(ids.length / HUBS.cells_per_hub))));
  let chosen = kmeans(points, 1);
  for (let k = 2; k <= most; k++) {
    const next = kmeans(points, k);
    if (next.cost > chosen.cost * HUBS.gain)
      break;
    chosen = next;
  }
  const sizes = new Map();
  for (const a of chosen.assign)
    sizes.set(a, (sizes.get(a) || 0) + 1);
  const order = [...sizes.keys() ].sort((p, q) => sizes.get(q) - sizes.get(p));
  return new Map(ids.map((id, i) => [id, 'h' + order.indexOf(chosen.assign[i])]));
}

// Lines follow the signal: from a sense organ through the hubs that pass it on to the organ it
// drives. Each line starts at the strongest unused connection and grows forward along outgoing
// and backward along incoming connections while it is inside the hubs; organs are terminals.
// A brain gets as many lines, and lines as long, as its strong pathways allow.
// At most MAX_ROUTES routes of up to MAX_LENGTH stations, starting at MIN_START and continuing
// while links keep MIN_STEP of the strongest; routes from senses count SENSE_BONUS times.
const ROUTES = Object.freeze(
    {max_routes : 16, sense_bonus : 1.2, min_start : .15, max_length : 12, min_step : .06});
function extractRoutes(pairs, meta) {
  const residual = new Map([...pairs ].map(([ k, p ]) => [k, p.sum])), out = new Map(),
        into = new Map();
  for (const p of pairs.values()) {
    if (!out.has(p.from))
      out.set(p.from, []);
    if (!into.has(p.to))
      into.set(p.to, []);
    out.get(p.from).push(p.to);
    into.get(p.to).push(p.from);
  }
  const max = Math.max(0, ...residual.values()), routes = [];
  const strongest = (at, seen, forward) => {
    let to = '', w = 0;
    for (const c of (forward ? out : into).get(at) || []) {
      const v = residual.get(forward ? at + '>' + c : c + '>' + at);
      if (!seen.has(c) && v > w)
        [w, to] = [ v, c ];
    }
    return [ to, w ];
  };
  while (routes.length < ROUTES.max_routes) {
    let start = '', best = 0;
    for (const [key, w] of residual) {
      const score =
          w * (meta.get(key.split('>')[0]).kind === STATION.sense ? ROUTES.sense_bonus : 1);
      if (score > best)
        [best, start] = [ score, key ];
    }
    if (!start || best < ROUTES.min_start * max)
      break;
    const path = start.split('>'), seen = new Set(path);
    let weight = residual.get(start);
    residual.set(start, 0);
    for (const forward of [true, false])
      while (path.length < ROUTES.max_length) {
        const at = forward ? path[path.length - 1] : path[0];
        if (meta.get(at).kind !== STATION.hub)
          break;
        const [to, w] = strongest(at, seen, forward);
        if (!to || w < ROUTES.min_step * max)
          break;
        residual.set(forward ? at + '>' + to : to + '>' + at, 0);
        weight += w;
        seen.add(to);
        if (forward)
          path.push(to);
        else
          path.unshift(to);
      }
    routes.push({path, weight});
  }
  return routes.sort((p, q) => q.weight - p.weight);
}

// A hub lies on a side once its cells' mean reaches LATERAL off the midline.
const HUB_SIDE = Object.freeze({lateral : .25});
function buildPlanModel(b) {
  const organs = new Map();
  for (const n of b.neurons) {
    const o = organOf(n);
    if (o)
      organs.set(n[NEURON.index], o);
  }
  const nodes = new Map(b.neurons.map(n => [n[NEURON.index], n])), hubs = clusterHubs(b, organs),
        station = new Map([...organs, ...hubs ]), members = new Map(), meta = new Map();
  for (const [id, s] of station) {
    if (!members.has(s))
      members.set(s, []);
    members.get(s).push(id);
  }
  for (const [id, ids] of members) {
    const [organ, family] = ORGAN_KINDS[id] || [ INTERNAL_TISSUE, '' ];
    meta.set(id, {
      id,
      organ,
      family,
      size : ids.length,
      kind : organ === INTERNAL_TISSUE ? STATION.hub
             : isSenseTissue(organ)    ? STATION.sense
                                       : STATION.motor
    });
  }
  const pairs = new Map();
  b.edges.forEach((e, i) => {
    const a = station.get(e[SYNAPSE.source]), c = station.get(e[SYNAPSE.target]);
    if (!a || !c || a === c)
      return;
    const key = a + '>' + c;
    let p = pairs.get(key);
    if (!p)
      pairs.set(key,
                p = {key, from : a, to : c, edges : [], sum : 0, plus : 0, flow : 0, learned : 0});
    p.edges.push(i);
    p.sum += Math.abs(e[SYNAPSE.strength]);
    if (e[SYNAPSE.strength] >= 0)
      p.plus += e[SYNAPSE.strength];
  });
  // Hubs take the family of what feeds or drives them most, their side from where their cells
  // lie, and a rank among hubs of the same family and side.
  const ranks = new Map();
  for (const h of [...meta.values()]
           .filter(m => m.kind === STATION.hub)
           .sort((p, q) => q.size - p.size)) {
    const into = {}, out = {};
    let inTotal = 0, outTotal = 0;
    for (const p of pairs.values()) {
      if (p.to === h.id && meta.get(p.from).kind === STATION.sense) {
        into[meta.get(p.from).family] = (into[meta.get(p.from).family] || 0) + p.sum;
        inTotal += p.sum;
      }
      if (p.from === h.id && meta.get(p.to).kind === STATION.motor) {
        out[meta.get(p.to).family] = (out[meta.get(p.to).family] || 0) + p.sum;
        outTotal += p.sum;
      }
    }
    const top = o => Object.entries(o).sort((p, q) => q[1] - p[1])[0],
          lateral =
              members.get(h.id).reduce((sum, id) => sum + (nodes.get(id)?.[0] || 0), 0) / h.size;
    h.family = (inTotal >= outTotal ? top(into)?.[0] : top(out)?.[0]) || 'hub';
    h.inFamily = top(into)?.[0] || '';
    h.side = lateral < -HUB_SIDE.lateral ? 'left' : lateral > HUB_SIDE.lateral ? 'right' : '';
    h.rank = (ranks.get(h.family + h.side) || 0) + 1;
    ranks.set(h.family + h.side, h.rank);
  }
  return {
    fish : b.id,
    layout : b.layout_id,
    count : b.edges.length,
    station,
    members,
    meta,
    pairs,
    routes : extractRoutes(pairs, meta),
    activity : new Map(),
    max : Math.max(...[...pairs.values()].map(p => p.sum))
  };
}

// The plan of the brain in view, rebuilt only when the brain or its layout changes.
export function planFor(b) {
  if (!b?.neurons?.length || !b.edges?.length)
    return null;
  const p = brain_planState.plan;
  if (p && p.fish === b.id && p.layout === b.layout_id && p.count === b.edges.length)
    return p;
  return brain_planState.plan = buildPlanModel(b);
}

// Live state: mean activity per station, signal flow and learned change per connection.
export function updatePlanLive(plan, b) {
  const state = b.neuron_state, act = new Map();
  for (const n of b.neurons)
    act.set(n[NEURON.index], state?.[n[NEURON.index]]?.[0] ?? n[NEURON.activity] ?? 0);
  for (const [id, ids] of plan.members) {
    let sum = 0;
    for (const i of ids)
      sum += Math.abs(act.get(i) || 0);
    plan.activity.set(id, ids.length ? sum / ids.length : 0);
  }
  const learned = b.learning?.weights?.length ? new Map(b.learning.weights) : null;
  for (const p of plan.pairs.values()) {
    let flow = 0, change = 0;
    for (const i of p.edges) {
      const e = b.edges[i];
      flow += (act.get(e[SYNAPSE.source]) || 0) * e[SYNAPSE.strength];
      if (learned?.has(e[SYNAPSE.id]))
        change += Math.abs(learned.get(e[SYNAPSE.id]) - e[SYNAPSE.strength]);
    }
    p.flow = flow / (p.sum || 1);
    p.learned = change / (p.sum || 1);
  }
}

// ---------------------------------------------------------------------- hormone weather
export function hormoneEffects(b) {
  const sum = Array(Object.keys(HORMONE_EFFECT).length).fill(0);
  let count = 0;
  // Without the selected fish's brain detail (only scalar readings) there is nothing to average.
  for (const n of Array.isArray(b?.neurons) ? b.neurons : [])
    if (n[NEURON.functional] && n[NEURON.internal] > 0 && n[NEURON.hormone_response]?.length) {
      n[NEURON.hormone_response].forEach((v, k) => sum[k] += v);
      count++;
    }
  return count ? sum.map(v => v / count) : sum;
}

// ---------------------------------------------------------------------- names
// What a station is called: organs by their own name, hubs by the sense family they serve,
// with side and rank when one brain has several. `label` is the short form for tight places.
export function stationNames(m) {
  const ui = textArea('nerve_map');
  if (m.kind !== STATION.hub) {
    const [name, label] = ui.organs[m.id];
    return {name, label};
  }
  const [base, short] = ui.hubs[m.family] || ui.hubs.hub,
               sided = text => m.side ? t('nerve_map.sides.' + m.side, {name : text}) : text,
               numbered = text =>
                   m.rank > 1 ? t('nerve_map.sides.numbered', {name : text, n : m.rank}) : text;
  return {name : numbered(sided(base)), label : numbered(short)};
}
