// Nerve bundles that run close and alongside each other are drawn together as one nerve, strand
// beside strand, instead of as near-parallel lines: each bundle is followed as a line of evenly
// spaced points, every point is drawn towards the nearest points of the other bundles that run the
// same way within `reach`, and where they then lie on top of each other over at least `run` they
// share one course and lie side by side across it, as wide together as their strands. A bundle
// joins and leaves that course over `blend`, so it bends into the nerve instead of meeting it at
// a corner. A bundle's first and last `ramp` stay where its organs are; no point moves into an
// organ or region.
import {fixed, pointText} from './markup.js';

export const NERVE_SNAP = Object.freeze({
  step : 2,
  samples : 320,
  reach : 9,
  parallel : .8,
  rounds : 10,
  pull : .5,
  smooth : .3,
  ramp : 10,
  touch : .75,
  run : 12,
  gap : 3,
  bend : .3,
  // Strands lie this share of their width apart, a join takes this many points, and the course is
  // smoothed this often afterwards.
  pack : .8,
  blend : 8,
  settle : 12
});
const S = NERVE_SNAP;

const lengthsOf = points => {
  const lengths = [ 0 ];
  for (let i = 1; i < points.length; i++)
    lengths.push(lengths[i - 1] +
                 Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  return lengths;
};
// A line of points walked by its length: `at` and `direction` take the share of the length, `path`
// draws the part between two shares.
export function polylineWay(points) {
  const lengths = lengthsOf(points), total = lengths.at(-1) || 1;
  const locate = s => {
    const d = Math.max(0, Math.min(1, s)) * total;
    let lo = 0, hi = lengths.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (lengths[mid] <= d)
        lo = mid;
      else
        hi = mid;
    }
    const span = lengths[hi] - lengths[lo], t = span > 0 ? (d - lengths[lo]) / span : 0;
    return {lo, hi, t};
  };
  const at = s => {
    const {lo, hi, t} = locate(s), a = points[lo], b = points[hi];
    return {x : a.x + (b.x - a.x) * t, y : a.y + (b.y - a.y) * t};
  };
  const step = S.step / total;
  let shaped = null;
  const drawn = new Map();
  return {
    points,
    lengths,
    length : total,
    at,
    direction : s => {
      const a = at(Math.max(0, s - step)), b = at(Math.min(1, s + step));
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return {x : (b.x - a.x) / length, y : (b.y - a.y) / length};
    },
    path : (s0, s1) => {
      const key = fixed(s0 * total) + ':' + fixed(s1 * total);
      if (!drawn.has(key)) {
        const from = locate(s0), to = locate(s1);
        shaped ??= keptPoints(points);
        const inner = shaped.filter(i => i >= from.hi && i <= to.lo).map(i => points[i]);
        drawn.set(key, curvePath([ at(s0), ...inner, at(s1) ], false));
      }
      return drawn.get(key);
    }
  };
}
// Only the points that shape the line (Douglas–Peucker within `bend` units), drawn as one smooth
// curve through them.
function keptPoints(points) {
  if (points.length < 3)
    return points.map((_, i) => i);
  const keep = new Uint8Array(points.length), stack = [ [ 0, points.length - 1 ] ];
  keep[0] = keep[points.length - 1] = 1;
  while (stack.length) {
    const [lo, hi] = stack.pop(), a = points[lo], b = points[hi];
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
    let far = -1, most = S.bend;
    for (let i = lo + 1; i < hi; i++) {
      const off = Math.abs((points[i].x - a.x) * dy - (points[i].y - a.y) * dx) / length;
      if (off > most)
        [far, most] = [ i, off ];
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([ lo, far ], [ far, hi ]);
    }
  }
  return points.map((_, i) => i).filter(i => keep[i]);
}
export function curvePath(points, shape = true) {
  const P = shape && points.length > 2 ? keptPoints(points).map(i => points[i]) : points;
  let d = 'M' + pointText(P[0]);
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], e = P[Math.min(P.length - 1, i + 2)];
    d += ' C' + pointText({x : b.x + (c.x - a.x) / 6, y : b.y + (c.y - a.y) / 6}) + ' ' +
         pointText({x : c.x - (e.x - b.x) / 6, y : c.y - (e.y - b.y) / 6}) + ' ' + pointText(c);
  }
  return d;
}
// The way as points `step` apart along its length.
export function evenPoints(way) {
  const fine = Array.from({length : S.samples + 1}, (_, k) => way.at(k / S.samples));
  return resampled(fine);
}
function resampled(points) {
  const lengths = lengthsOf(points), total = lengths.at(-1);
  const count = Math.max(1, Math.round(total / S.step)), out = [];
  let k = 0;
  for (let i = 0; i <= count; i++) {
    const d = total * i / count;
    while (k + 1 < lengths.length - 1 && lengths[k + 1] < d)
      k++;
    const span = lengths[k + 1] - lengths[k], t = span > 0 ? (d - lengths[k]) / span : 0;
    const a = points[k], b = points[Math.min(points.length - 1, k + 1)];
    out.push({x : a.x + (b.x - a.x) * t, y : a.y + (b.y - a.y) * t});
  }
  return out;
}
// Each point's direction along its line.
const tangents = P => P.map((_, i) => {
  const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return {x : (b.x - a.x) / length, y : (b.y - a.y) / length};
});
const CELL_ROW = 1 << 16;
function grid(lines) {
  const cells = new Map(), cell = (x, y) => (y + CELL_ROW / 2) * CELL_ROW + x + CELL_ROW / 2;
  const turns = lines.map(line => tangents(line.points));
  lines.forEach((line, b) => line.points.forEach((p, i) => {
    const k = cell(Math.floor(p.x / S.reach), Math.floor(p.y / S.reach));
    const list = cells.get(k);
    if (list)
      list.push(b, i);
    else
      cells.set(k, [ b, i ]);
  }));
  // The nearest point of every other line within `reach` that runs the same way, or the opposite.
  return (b, i, reach) => {
    const p = lines[b].points[i], t = turns[b][i], found = new Map(), most = reach * reach;
    const cx = Math.floor(p.x / S.reach), cy = Math.floor(p.y / S.reach);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const list = cells.get(cell(cx + dx, cy + dy));
        if (!list)
          continue;
        for (let k = 0; k < list.length; k += 2) {
          const c = list[k], j = list[k + 1];
          if (c === b)
            continue;
          const q = lines[c].points[j], d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
          if (d > most || found.get(c)?.d <= d)
            continue;
          const u = turns[c][j];
          if (Math.abs(t.x * u.x + t.y * u.y) >= S.parallel)
            found.set(c, {d, j});
        }
      }
    return found;
  };
}
// How far each point may move: nothing at the bundle's ends and at its bends, fully `ramp` away
// from them along the bundle.
const freedom = (points, pins = []) => {
  const lengths = lengthsOf(points), total = lengths.at(-1);
  const gap = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  const pinned = pins.map(pin => lengths[points.reduce(
                              (best, p, i) => gap(p, pin) < gap(points[best], pin) ? i : best, 0)]);
  return lengths.map(
      d => Math.max(
          0, Math.min(1, Math.min(d, total - d, ...pinned.map(at => Math.abs(d - at))) / S.ramp)));
};
function attract(lines) {
  for (let round = 0; round < S.rounds; round++) {
    const near = grid(lines);
    const next = lines.map((line, b) => line.points.map((p, i) => {
      const free = line.free[i];
      if (!free)
        return p;
      const found = near(b, i, S.reach);
      if (!found.size)
        return p;
      let x = p.x, y = p.y;
      for (const [c, {j}] of found) {
        x += lines[c].points[j].x;
        y += lines[c].points[j].y;
      }
      const k = found.size + 1, moved = {
        x : p.x + (x / k - p.x) * S.pull * free,
        y : p.y + (y / k - p.y) * S.pull * free
      };
      return line.safe(moved) ? moved : p;
    }));
    lines.forEach((line, b) => {
      const P = next[b];
      line.points = P.map((p, i) => {
        if (!line.free[i] || i === 0 || i === P.length - 1)
          return p;
        const smooth = {
          x : p.x + ((P[i - 1].x + P[i + 1].x) / 2 - p.x) * S.smooth * line.free[i],
          y : p.y + ((P[i - 1].y + P[i + 1].y) / 2 - p.y) * S.smooth * line.free[i]
        };
        return line.safe(smooth) ? smooth : p;
      });
    });
  }
  for (const line of lines) {
    line.points = resampled(line.points);
    line.free = freedom(line.points, line.pins);
  }
}
// Stretches of one line where another lies on it, as runs of point indices; short gaps are
// bridged and short runs dropped.
function sharedRuns(lines, near, b, c) {
  const runs = [];
  let open = null;
  lines[b].points.forEach((_, i) => {
    if (near[b][i].has(c)) {
      if (open && i - open[1] <= S.gap)
        open[1] = i;
      else
        runs.push(open = [ i, i ]);
    }
  });
  const lengths = lengthsOf(lines[b].points);
  return runs.filter(([ i, j ]) => lengths[j] - lengths[i] >= S.run);
}
// Draws the given bundle ways together. Each line is {way, safe, width} or {way} for one that
// keeps its course; the result gives every line its new way and the nerves it runs in, each with
// its member lines and the nerve's middle course.
export function nerveBundling(lines) {
  const moving = lines.map((line, index) => ({index, line}))
                     .filter(({line}) => line.safe)
                     .map(({index, line}) => {
                       const points = evenPoints(line.way), pins = line.pins ?? [];
                       return {
                         index,
                         points,
                         pins,
                         safe : line.safe,
                         width : line.width,
                         free : freedom(points, pins)
                       };
                     });
  if (moving.length > 1)
    attract(moving);
  const lookup = grid(moving);
  const near = moving.map((line, b) => line.points.map((_, i) => {
    const found = lookup(b, i, S.touch + S.reach * .25);
    return new Map([...found ].map(([ c, f ]) => [c, f.j]));
  }));
  const shared = moving.map((line, b) => {
    const members = line.points.map(() => new Set([ b ]));
    for (let c = 0; c < moving.length; c++)
      if (c !== b)
        for (const [i, j] of sharedRuns(moving, near, b, c))
          for (let k = i; k <= j; k++)
            members[k].add(c);
    return members;
  });
  // Where a bundle comes from and goes to, as one place: strands lie across a nerve in the order
  // of these places, so they leave it on the side they are bound for.
  const bound = moving.map(
      ({points}) =>
          ({x : (points[0].x + points.at(-1).x) / 2, y : (points[0].y + points.at(-1).y) / 2}));
  const turns = moving.map(line => tangents(line.points));
  // The middle of the nerve at each shared point, and the bundle's place across it.
  const centre = moving.map((line, b) => line.points.map((p, i) => {
    let x = p.x, y = p.y, n = 1;
    for (const c of shared[b][i]) {
      const j = near[b][i].get(c);
      if (j === undefined)
        continue;
      x += moving[c].points[j].x;
      y += moving[c].points[j].y;
      n++;
    }
    return {x : x / n, y : y / n};
  }));
  const beside = moving.map((line, b) => line.points.map((p, i) => {
    const members = shared[b][i];
    if (members.size < 2)
      return p;
    // One direction for all strands of the nerve here, whichever way each of them runs.
    const t = turns[b][i], flip = t.x < 0 || (t.x === 0 && t.y < 0) ? -1 : 1,
          across = {x : -t.y * flip, y : t.x * flip}, c = centre[b][i];
    const side = k => (bound[k].x - c.x) * across.x + (bound[k].y - c.y) * across.y;
    const order = [...members ].sort((x, y) => side(x) - side(y) || x - y);
    const width = k => moving[k].width * S.pack;
    let before = 0;
    for (const k of order) {
      if (k === b)
        break;
      before += width(k);
    }
    const all = order.reduce((sum, k) => sum + width(k), 0), off = before + width(b) / 2 - all / 2;
    return {x : c.x + across.x * off, y : c.y + across.y * off};
  }));
  // A bundle bends into its place over `blend` points from where the nerve begins or ends.
  moving.forEach((line, b) => {
    const count = line.points.length, joinedAt = new Array(count).fill(Infinity);
    let since = Infinity;
    for (let i = 0; i < count; i++)
      joinedAt[i] = since = shared[b][i].size > 1 ? since + 1 : 0;
    since = Infinity;
    for (let i = count - 1; i >= 0; i--) {
      since = shared[b][i].size > 1 ? since + 1 : 0;
      joinedAt[i] = Math.min(joinedAt[i], since);
    }
    const placed = line.points.map((p, i) => {
      const u = Math.min(1, joinedAt[i] / S.blend), m = u * u * (3 - 2 * u) * line.free[i],
            q = {x : p.x + (beside[b][i].x - p.x) * m, y : p.y + (beside[b][i].y - p.y) * m};
      return line.safe(q) ? q : p;
    });
    for (let round = 0; round < S.settle; round++)
      for (let i = 1; i < count - 1; i++) {
        if (!line.free[i])
          continue;
        const q = {
          x : placed[i].x + ((placed[i - 1].x + placed[i + 1].x) / 2 - placed[i].x) * S.smooth,
          y : placed[i].y + ((placed[i - 1].y + placed[i + 1].y) / 2 - placed[i].y) * S.smooth
        };
        if (line.safe(q))
          placed[i] = q;
      }
    line.course = centre[b];
    line.points = placed;
  });
  const result = lines.map(line => ({way : line.way, nerves : []}));
  moving.forEach((line, b) => {
    const way = polylineWay(line.points), out = result[line.index];
    out.way = way;
    const members = shared[b];
    let start = null;
    const close = end => {
      if (start === null)
        return;
      // The nerve is listed once, by its first member, piece by piece where its members change.
      let from = start;
      for (let k = start + 1; k <= end + 1; k++) {
        const same = k <= end && [...members[k] ].join() === [...members[from] ].join();
        if (same)
          continue;
        const group = [...members[from] ].sort((x, y) => x - y);
        if (group[0] === b && k - 1 > from)
          out.nerves.push({
            members : group.map(c => moving[c].index),
            d : curvePath(line.course.slice(from, k))
          });
        from = k - 1;
      }
      start = null;
    };
    members.forEach((set, i) => {
      if (set.size > 1 && start === null)
        start = i;
      if (set.size === 1)
        close(i - 1);
    });
    close(members.length - 1);
  });
  return result;
}
