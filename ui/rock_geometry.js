// Placement geometry only. The simulation receives this exact polygon.
export function newRockShape(random = Math.random) {
  const height = .65 + .35 * random(), points = [];
  for (let i = 0; i < 10; ++i) {
    const angle = 2 * Math.PI * (i + .15 * random()) / 10, radius = .72 + .28 * random();
    points.push(
        {x : radius * Math.cos(angle), y : height * Math.min(.55, radius * Math.sin(angle))});
  }
  points.sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = list => {
    const hull = [];
    for (const p of list) {
      while (hull.length > 1 && cross(hull.at(-2), hull.at(-1), p) <= 0)
        hull.pop();
      hull.push(p);
    }
    hull.pop();
    return hull;
  };
  return [...half(points), ...half([...points ].reverse()) ];
}

// Vertical translations for which a convex rock intersects a solid edge.
function edgeInterval(rock, a, b) {
  if (Math.max(a.x, b.x) <= Math.min(...rock.map(p => p.x)) + 1e-9 ||
      Math.min(a.x, b.x) >= Math.max(...rock.map(p => p.x)) - 1e-9)
    return null;
  const contacts = [], atX = (p, q, x) => p.y + (q.y - p.y) * (x - p.x) / (q.x - p.x),
        spans = (p, q, x) =>
            Math.abs(p.x - q.x) > 1e-10 && x >= Math.min(p.x, q.x) && x <= Math.max(p.x, q.x);
  for (let i = 0; i < rock.length; ++i) {
    const p = rock[i], q = rock[(i + 1) % rock.length];
    if (spans(a, b, p.x))
      contacts.push(atX(a, b, p.x) - p.y);
    for (const v of [a, b])
      if (spans(p, q, v.x))
        contacts.push(v.y - atX(p, q, v.x));
  }
  return contacts.length > 1 ? [ Math.min(...contacts), Math.max(...contacts) ] : null;
}

export function snapRock(rock, frame) {
  const left = Math.min(...rock.map(p => p.x)), right = Math.max(...rock.map(p => p.x)),
        center = (left + right) / 2,
        intervals = [ [ frame.height - Math.max(...rock.map(p => p.y)), Infinity ] ];
  for (let index = 0; index < (frame.obstacles || []).length; ++index) {
    const [x, y, radius] = frame.obstacles[index], shape = frame.shapes?.[index],
                 nearest =
                     frame.width > 0 ? Math.round((center - x) / frame.width) * frame.width : 0;
    for (const shift of frame.width > 0 ? [ nearest - frame.width, nearest, nearest + frame.width ]
                                        : [ 0 ]) {
      if (x + shift + radius <= left + 1e-9 || x + shift - radius >= right - 1e-9)
        continue;
      if (shape?.length) {
        const polygon = shape.map(([ px, py ]) => ({x : px + shift, y : py})), crossings = [],
              vertex = rock[0];
        for (let i = 0; i < polygon.length; ++i) {
          const a = polygon[i], b = polygon[(i + 1) % polygon.length],
                interval = edgeInterval(rock, a, b);
          if (interval)
            intervals.push(interval);
          // Covers placements wholly inside an obstacle, with no edge intersection.
          if ((a.x > vertex.x) !== (b.x > vertex.x))
            crossings.push(a.y + (b.y - a.y) * (vertex.x - a.x) / (b.x - a.x) - vertex.y);
        }
        crossings.sort((a, b) => a - b);
        for (let i = 0; i + 1 < crossings.length; i += 2)
          intervals.push([ crossings[i], crossings[i + 1] ]);
      } else {
        const contacts = [], cx = x + shift;
        for (let i = 0; i < rock.length; ++i) {
          const p = rock[i], q = rock[(i + 1) % rock.length], dx = p.x - cx;
          if (Math.abs(dx) <= radius) {
            const dy = Math.sqrt(Math.max(0, radius * radius - dx * dx));
            contacts.push(y - dy - p.y, y + dy - p.y);
          }
          const ex = q.x - p.x, ey = q.y - p.y, length = Math.hypot(ex, ey);
          if (Math.abs(ex) <= 1e-10 || !length)
            continue;
          for (const sign of [-1, 1]) {
            const tx = cx - sign * radius * ey / length, ty = y + sign * radius * ex / length,
                  t = (tx - p.x) / ex;
            if (t >= 0 && t <= 1)
              contacts.push(ty - p.y - t * ey);
          }
        }
        if (contacts.length > 1)
          intervals.push([ Math.min(...contacts), Math.max(...contacts) ]);
      }
    }
  }
  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const interval of intervals) {
    if (interval[1] - interval[0] < 1e-8)
      continue;
    const last = merged.at(-1);
    if (last && interval[0] <= last[1] + 1e-8)
      last[1] = Math.max(last[1], interval[1]);
    else
      merged.push(interval.slice());
  }
  const drop = merged.find(interval => interval[1] > 1e-8)?.[0] ?? 0;
  return rock.map(p => ({x : p.x, y : p.y + drop}));
}
