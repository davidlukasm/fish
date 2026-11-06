import {clamp, SECOND_MS} from '../../units.js';

// A stimulus as signals running through the drawn network. From the stimulated parts a signal
// runs along each wire that leaves a part when it fires, in the colour of what the part sends
// (exciting, inhibiting or modulating), so a signal splits where a part sends on to several and
// takes the colour of each part it passes. A signal runs as the wires are drawn: from the nodes
// a part sends from along their branches, together along the trunk, and apart along the
// branches to the nodes it reaches. Where a signal arrives, the part fires if the
// engine's probe found it rising above its rest; an inhibiting signal at a part the probe found
// falling below it quiets the part, which darkens and sends nothing; a modulating one marks
// the part it tunes; any other signal fades there. A part fires once, when the first signal
// reaches it. Effectors twitch as they fire, the other parts light up, and all stay marked as
// reached or quieted. The engine decides which parts fire; the drawing paces the way at SPEED
// frame units a second, each leg LEAST to MOST milliseconds long, a fading signal FADE.
const NS = 'http://www.w3.org/2000/svg';
export const SIGNAL = Object.freeze({
  cutoff : .04,
  speed : 120,
  least : 1250,
  most : 3300,
  fade : 600,
  glow : 1100,
  radius : [ 3.5, 7 ]
});
const COLOURS = Object.freeze({
  excite : [ '#dceea7', '#fff7ce' ],
  inhibit : [ '#e8a2b5', '#f5d4dd' ],
  modulate : [ '#c7b3ec', '#ece2ff' ],
  fade : [ '#8aa0a3', '#c3d1d2' ]
});

// The way along points to each of them, and its whole length.
function distances(points) {
  const along = [ 0 ];
  for (let k = 1; k < points.length; ++k)
    along.push(along[k - 1] +
               Math.hypot(points[k].x - points[k - 1].x, points[k].y - points[k - 1].y));
  return along;
}
const lineLength = points => distances(points).at(-1);
// The point a fraction of the way along points, by their length, so a signal keeps its pace
// over short and long stretches alike.
export function signalPoint(points, fraction) {
  if (!points.length)
    return {x : 0, y : 0};
  const lengths = distances(points);
  const goal = clamp(fraction) * lengths.at(-1);
  let k = 1;
  while (k < points.length - 1 && lengths[k] < goal)
    ++k;
  const span = lengths[k] - lengths[k - 1], share = span > 0 ? (goal - lengths[k - 1]) / span : 0;
  const a = points[Math.max(0, k - 1)], b = points[Math.min(points.length - 1, k)];
  return {x : a.x + (b.x - a.x) * share, y : a.y + (b.y - a.y) * share};
}
const duration = length => clamp(SECOND_MS * length / SIGNAL.speed, SIGNAL.least, SIGNAL.most);
// How long a signal takes along points.
export const legDuration = points => duration(lineLength(points));
// The stages of a link's way, as its wires are drawn: from the nodes it leaves along their
// branches (`starts`, all at once) into its trunk (`points`), and out of it along the branches
// to the nodes it reaches (`arrives`); each stage with its lines and the length of its longest.
export function legStages(link) {
  return [ link.starts ?? [], [ link.points ], link.arrives ?? [] ]
      .filter(lines => lines.length)
      .map(lines => ({lines, length : Math.max(...lines.map(lineLength))}));
}
// How long a signal takes along a link's whole way.
const linkDuration = link => duration(legStages(link).reduce((sum, s) => sum + s.length, 0));
// The way of a stimulus: from the parts `starts`, along `links` ({from, to, kind, points, ...}),
// with `response(key)` saying how the probe found a part: 'rise', 'fall' or null. Each leg starts
// when its part fires and ends where the next one fires, is quieted (an inhibiting leg at a
// falling part) or the signal fades; a part fires at the first signal's arrival.
export function signalSchedule(starts, links, response) {
  const fired = new Map(starts.map(key => [key, 0])), done = new Set(), legs = [];
  const pending = starts.map(key => ({key, time : 0}));
  while (pending.length) {
    pending.sort((a, b) => a.time - b.time);
    const {key, time} = pending.shift();
    if (done.has(key))
      continue;
    done.add(key);
    for (const link of links.filter(l => l.from === key && l.to !== key)) {
      const end = time + linkDuration(link), answer = response(link.to);
      const fires = answer === 'rise',
            quiets = !fires && answer === 'fall' && link.kind === 'inhibit';
      legs.push({link, start : time, end, fires, quiets});
      if (fires && (!fired.has(link.to) || fired.get(link.to) > end)) {
        fired.set(link.to, end);
        pending.push({key : link.to, time : end});
      }
    }
  }
  return {legs, fired};
}
// Plays a schedule in the scene: `marks(key)` gives the elements of a part, `moves(key)` the
// [element, class] pairs that set what it moves going when it fires (a fin, the jaw), `reached(key,
// link, quieted)` hears each part as it fires, each leg as it starts and each part a leg quiets.
// The scene may be drawn anew while it plays: `attach` moves the signals into the new one.
export function createSignalPlayer(svg, schedule, {marks, moves, reached}) {
  const document = svg.ownerDocument, overlay = document.createElementNS(NS, 'g');
  overlay.setAttribute('class', 'aid-pulse-overlay');
  // Each leg runs its stages one after the other, each over its share of the leg's time by its
  // length, with a dot on each of its lines.
  const dots = schedule.legs.map(leg => {
    const stages = legStages(leg.link), total = stages.reduce((sum, s) => sum + s.length, 0) || 1;
    let from = 0;
    return {
      leg,
      state : 'waiting',
      stages : stages.map(stage => {
        const share = stage.length / total, part = {from, to : from + share};
        from += share;
        part.lines = stage.lines.map(points => {
          const dot = document.createElementNS(NS, 'circle');
          dot.setAttribute('class', 'aid-signal-particle');
          dot.setAttribute('r', String(SIGNAL.radius[0] + (SIGNAL.radius[1] - SIGNAL.radius[0]) *
                                                              (leg.link.strength ?? 1)));
          dot.setAttribute('opacity', '0');
          overlay.appendChild(dot);
          return {points, dot};
        });
        return part;
      })
    };
  });
  const parts =
      [...schedule.fired.entries() ].map(([ key, time ]) => ({key, time, state : 'waiting'}));
  const colour = (dot, kind) => {
    const [fill, stroke] = COLOURS[kind] ?? COLOURS.excite;
    dot.style.fill = fill;
    dot.style.stroke = stroke;
  };
  const end = Math.max(0, ...schedule.legs.map(l => l.end)) + SIGNAL.fade + SIGNAL.glow;
  let handle = null, started = null, active = false;
  const stop = () => {
    if (!active)
      return;
    active = false;
    if (handle !== null)
      cancelAnimationFrame(handle);
    handle = null;
    overlay.remove();
    for (const part of parts) {
      for (const element of marks(part.key))
        element.classList.remove('aid-pulse-active');
      for (const [element, name] of part.moving ?? [])
        element.classList.remove(name);
    }
  };
  const draw = now => {
    if (!active || !overlay.isConnected)
      return stop();
    if (started === null)
      started = now;
    const elapsed = now - started;
    for (const part of parts) {
      if (part.state === 'waiting' && elapsed >= part.time) {
        part.state = 'firing';
        reached(part.key, null);
        for (const element of marks(part.key))
          element.classList.add('aid-pulse-active', 'aid-pulse-fired');
        part.moving = moves(part.key);
        for (const [element, name] of part.moving)
          element.classList.add(name);
      } else if (part.state === 'firing' && elapsed >= part.time + SIGNAL.glow) {
        part.state = 'done';
        for (const element of marks(part.key))
          element.classList.remove('aid-pulse-active');
        for (const [element, name] of part.moving ?? [])
          element.classList.remove(name);
      }
    }
    for (const item of dots) {
      const {leg, stages} = item;
      if (item.state === 'waiting' && elapsed >= leg.start) {
        item.state = 'running';
        for (const {lines} of stages)
          for (const {dot} of lines)
            colour(dot, leg.link.kind);
        reached(null, leg.link);
      }
      if (item.state !== 'running')
        continue;
      const share = (elapsed - leg.start) / (leg.end - leg.start);
      // A dot shows while its stage runs; the last stage's dots stay at their ends to fade.
      stages.forEach((stage, k) => {
        const last = k === stages.length - 1, span = stage.to - stage.from || 1;
        const along = (share - stage.from) / span;
        for (const {points, dot} of stage.lines) {
          const at = signalPoint(points, clamp(along));
          dot.setAttribute('cx', String(at.x));
          dot.setAttribute('cy', String(at.y));
          if (!last)
            dot.setAttribute('opacity', along >= 0 && along < 1 ? '1' : '0');
        }
      });
      const final = stages.at(-1)?.lines ?? [];
      if (share < 1) {
        if (share >= (stages.at(-1)?.from ?? 0))
          for (const {dot} of final)
            dot.setAttribute('opacity', '1');
        continue;
      }
      // At its end a signal quiets its part, tunes it, or fades in grey where it stays quiet.
      if (!item.arrived) {
        item.arrived = true;
        const mark = leg.quiets                     ? 'aid-pulse-quieted'
                     : leg.link.kind === 'modulate' ? 'aid-pulse-tuned'
                                                    : null;
        if (mark) {
          for (const element of marks(leg.link.to))
            element.classList.add(mark);
          if (leg.quiets)
            reached(null, null, leg.link.to);
        }
      }
      const fade = (elapsed - leg.end) / SIGNAL.fade;
      for (const {dot} of final) {
        if (!leg.fires && !leg.quiets)
          colour(dot, 'fade');
        dot.setAttribute('opacity', String(Math.max(0, 1 - fade)));
      }
      if (fade >= 1)
        item.state = 'done';
    }
    if (elapsed < end)
      handle = requestAnimationFrame(draw);
    else
      stop();
  };
  return {
    start() {
      if (active)
        return;
      active = true;
      started = null;
      svg.appendChild(overlay);
      handle = requestAnimationFrame(draw);
    },
    attach(next) {
      svg = next;
      if (active)
        svg.appendChild(overlay);
    },
    stop
  };
}
