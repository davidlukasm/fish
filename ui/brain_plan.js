// The brain as a network of stations: organ stations (sense and motor cells by organ and side),
// hubs clustered from the processing cells by whom they listen to and drive, the summed
// connections between stations and the strongest signal paths as lines. A pure model of the
// concrete brain: no layout, no wording; views and the thought observers build on it.
export const brain_planState = {};

// Organ stations: [organ key, family]
const ORGAN_KINDS = {
  suck : [ 'm2', 'eat' ],
  bite : [ 'm5', 'eat' ],
  noseL : [ 's1', 'nose' ],
  noseR : [ 's1', 'nose' ],
  touch : [ 's3', 'touch' ],
  eyeL : [ 's0', 'eye' ],
  eyeR : [ 's0', 'eye' ],
  latL : [ 's2', 'lat' ],
  latR : [ 's2', 'lat' ],
  turnL : [ 'm1', 'move' ],
  turnR : [ 'm1', 'move' ],
  gut : [ 's4', 'body' ],
  hsense : [ 's10', 'body' ],
  spines : [ 'm6', 'guard' ],
  pigment : [ 'm7', 'show' ],
  bladder : [ 'm8', 'depth' ],
  gland : [ 'm9', 'gland' ],
  egg : [ 'm3', 'repro' ],
  sperm : [ 'm4', 'repro' ],
  tail : [ 'm0', 'move' ]
};
const MOTOR_ORGANS =
    [ 'tail', 'turn', 'suck', 'egg', 'sperm', 'bite', 'spines', 'pigment', 'bladder', 'gland' ];
// Neutral line colours, distinguishable on the dark map; lines are numbered by strength.
// ---------------------------------------------------------------------- stations
// Sense and motor cells belong to their organ (and side); processing cells form the hubs.
function organOf(n) {
  if (!n[4])
    return '';
  let best = n[12] || 0, kind = 'i', k = -1;
  (n[13] || []).forEach((v, j) => {
    if (v > best)
      [best, kind, k] = [ v, 's', j ];
  });
  (n[14] || []).forEach((v, j) => {
    if (v > best)
      [best, kind, k] = [ v, 'm', j ];
  });
  const left = n[0] < 0;
  if (kind === 's')
    return k === 0    ? (left ? 'eyeL' : 'eyeR')
           : k === 1  ? (left ? 'noseL' : 'noseR')
           : k === 2  ? (left ? 'latL' : 'latR')
           : k === 3  ? 'touch'
           : k === 10 ? 'hsense'
                      : 'gut';
  if (kind === 'm')
    return k === 1 ? (left ? 'turnL' : 'turnR') : MOTOR_ORGANS[k] || '';
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
  for (let round = 0; round < 14; round++) {
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
function clusterHubs(b, organs) {
  const present = [...new Set(organs.values()) ], index = new Map(present.map((o, i) => [o, i])),
        dims = 2 * present.length + 2, internal = b.neurons.filter(n => n[4] && !organs.has(n[5]));
  if (!internal.length)
    return new Map();
  const vec = new Map(internal.map(n => [n[5], new Float64Array(dims)])),
        near = new Map(internal.map(n => [n[5], []]));
  for (const e of b.edges) {
    const a = organs.get(e[0]), c = organs.get(e[1]), w = Math.abs(e[2]);
    if (a && vec.has(e[1]))
      vec.get(e[1])[index.get(a)] += w;
    else if (c && vec.has(e[0]))
      vec.get(e[0])[present.length + index.get(c)] += w;
    else if (vec.has(e[0]) && vec.has(e[1])) {
      near.get(e[0]).push(e[1]);
      near.get(e[1]).push(e[0]);
    }
  }
  for (const v of vec.values())
    unit(v);
  const ids = internal.map(n => n[5]), points = internal.map(n => {
    const own = vec.get(n[5]), out = Float64Array.from(own), list = near.get(n[5]);
    for (const j of list) {
      const u = vec.get(j);
      for (let i = 0; i < dims; i++)
        out[i] += .5 * u[i] / list.length;
    }
    unit(out);
    out[dims - 2] = .35 * n[0];
    out[dims - 1] = .35 * n[1];
    return out;
  });
  const most = Math.min(10, Math.max(1, Math.round(Math.sqrt(ids.length / 3))));
  let chosen = kmeans(points, 1);
  for (let k = 2; k <= most; k++) {
    const next = kmeans(points, k);
    if (next.cost > chosen.cost * .8)
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
  while (routes.length < 16) {
    let start = '', best = 0;
    for (const [key, w] of residual) {
      const score = w * (meta.get(key.split('>')[0]).kind === 's' ? 1.2 : 1);
      if (score > best)
        [best, start] = [ score, key ];
    }
    if (!start || best < .15 * max)
      break;
    const path = start.split('>'), seen = new Set(path);
    let weight = residual.get(start);
    residual.set(start, 0);
    for (const forward of [true, false])
      while (path.length < 12) {
        const at = forward ? path[path.length - 1] : path[0];
        if (meta.get(at).kind !== 'h')
          break;
        const [to, w] = strongest(at, seen, forward);
        if (!to || w < .06 * max)
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

export function buildPlanModel(b) {
  const organs = new Map();
  for (const n of b.neurons) {
    const o = organOf(n);
    if (o)
      organs.set(n[5], o);
  }
  const nodes = new Map(b.neurons.map(n => [n[5], n])), hubs = clusterHubs(b, organs),
        station = new Map([...organs, ...hubs ]), members = new Map(), meta = new Map();
  for (const [id, s] of station) {
    if (!members.has(s))
      members.set(s, []);
    members.get(s).push(id);
  }
  for (const [id, ids] of members) {
    const [organ, family] = ORGAN_KINDS[id] || [ 'internal', '' ];
    meta.set(id, {
      id,
      organ,
      family,
      size : ids.length,
      kind : organ === 'internal' ? 'h'
             : organ[0] === 's'   ? 's'
                                  : 'm'
    });
  }
  const pairs = new Map();
  b.edges.forEach((e, i) => {
    const a = station.get(e[0]), c = station.get(e[1]);
    if (!a || !c || a === c)
      return;
    const key = a + '>' + c;
    let p = pairs.get(key);
    if (!p)
      pairs.set(key,
                p = {key, from : a, to : c, edges : [], sum : 0, plus : 0, flow : 0, learned : 0});
    p.edges.push(i);
    p.sum += Math.abs(e[2]);
    if (e[2] >= 0)
      p.plus += e[2];
  });
  // Hubs take the family of what feeds or drives them most, their side from where their cells
  // lie, and a rank among hubs of the same family and side.
  const ranks = new Map();
  for (const h of [...meta.values()].filter(m => m.kind === 'h').sort((p, q) => q.size - p.size)) {
    const into = {}, out = {};
    let inTotal = 0, outTotal = 0;
    for (const p of pairs.values()) {
      if (p.to === h.id && meta.get(p.from).kind === 's') {
        into[meta.get(p.from).family] = (into[meta.get(p.from).family] || 0) + p.sum;
        inTotal += p.sum;
      }
      if (p.from === h.id && meta.get(p.to).kind === 'm') {
        out[meta.get(p.to).family] = (out[meta.get(p.to).family] || 0) + p.sum;
        outTotal += p.sum;
      }
    }
    const top = o => Object.entries(o).sort((p, q) => q[1] - p[1])[0],
          lateral =
              members.get(h.id).reduce((sum, id) => sum + (nodes.get(id)?.[0] || 0), 0) / h.size;
    h.family = (inTotal >= outTotal ? top(into)?.[0] : top(out)?.[0]) || 'hub';
    h.inFamily = top(into)?.[0] || '';
    h.side = lateral < -.25 ? 'left' : lateral > .25 ? 'right' : '';
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
    act.set(n[5], state?.[n[5]]?.[0] ?? n[3] ?? 0);
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
      flow += (act.get(e[0]) || 0) * e[2];
      if (learned?.has(e[3]))
        change += Math.abs(learned.get(e[3]) - e[2]);
    }
    p.flow = flow / (p.sum || 1);
    p.learned = change / (p.sum || 1);
  }
}

// ---------------------------------------------------------------------- hormone weather
export function hormoneEffects(b) {
  const sum = [ 0, 0, 0, 0, 0, 0 ];
  let count = 0;
  // Without the selected fish's brain detail (only scalar readings) there is nothing to average.
  for (const n of Array.isArray(b?.neurons) ? b.neurons : [])
    if (n[4] && n[12] > 0 && n[27]?.length) {
      n[27].forEach((v, k) => sum[k] += v);
      count++;
    }
  return count ? sum.map(v => v / count) : sum;
}
