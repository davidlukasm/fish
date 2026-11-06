import {clamp, SECOND_MS} from '../../units.js';

const NS = 'http://www.w3.org/2000/svg';
export const SIGNAL = Object.freeze({
  blood : 1.6,
  thinning : .7,
  cutoff : .04,
  clear : .5,
  speed : 120,
  least : 1250,
  most : 3300,
  fade : 600,
  glow : 1100,
  trail : 28,
  radius : [ 3.5, 7 ]
});
const COLOURS = Object.freeze({
  excite : [ '#dceea7', '#fff7ce' ],
  inhibit : [ '#e8a2b5', '#f5d4dd' ],
  modulate : [ '#c7b3ec', '#ece2ff' ],
  fade : [ '#8aa0a3', '#c3d1d2' ]
});

function distances(points) {
  const along = [ 0 ];
  for (let k = 1; k < points.length; ++k)
    along.push(along[k - 1] +
               Math.hypot(points[k].x - points[k - 1].x, points[k].y - points[k - 1].y));
  return along;
}
const lineLength = points => distances(points).at(-1);
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
export function legStages(link) {
  return [ link.starts ?? [], [ link.points ], link.arrives ?? [] ]
      .filter(lines => lines.length)
      .map(lines => ({lines, length : Math.max(...lines.map(lineLength))}));
}
const linkDuration = link => duration(legStages(link).reduce((sum, s) => sum + s.length, 0)) *
                             (link.kind === HORMONE ? SIGNAL.blood : 1);
const HORMONE = 'hormone';
// How the probe's `frames` (per step the swing of each part from its rest) found a part made of
// the probe's parts `indices`: 'rise', 'fall' or null, by the part that swings most. A part
// pushed down may swing back past its rest afterwards; it still counts as falling.
export function signalAnswer(frames, indices) {
  let best = null;
  for (const index of indices) {
    const swings = frames.map(f => (f[index] ?? 0) - (frames[0]?.[index] ?? 0));
    const peak = Math.max(0, ...swings.map(Math.abs));
    if (peak < SIGNAL.cutoff || (best && peak <= best.peak))
      continue;
    const first = swings.find(s => Math.abs(s) >= SIGNAL.clear * peak);
    best = {peak, answer : first > 0 ? 'rise' : 'fall'};
  }
  return best?.answer ?? null;
}
const PUSH = Object.freeze(
    {fire : {excite : 'rise', inhibit : 'fall'}, quiet : {excite : 'fall', inhibit : 'rise'}});
const ANSWER_MODE = Object.freeze({rise : 'fire', fall : 'quiet'});
export function signalSchedule(starts, links, response) {
  const parts = new Map(starts.map(key => [key, {time : 0, mode : 'fire'}])), done = new Set(),
        legs = [];
  const pending = starts.map(key => ({key, time : 0}));
  while (pending.length) {
    pending.sort((a, b) => a.time - b.time);
    const {key, time} = pending.shift();
    if (done.has(key))
      continue;
    done.add(key);
    const sends = parts.get(key).mode;
    for (const link of links.filter(l => l.from === key && l.to !== key &&
                                         (l.kind !== HORMONE || sends === 'fire'))) {
      const push = link.kind === HORMONE ? link.push : PUSH[sends][link.kind] ?? null;
      const answer = response(link.to, push);
      const end = time + linkDuration(link),
            answers = answer && (push === null || answer === push) ? ANSWER_MODE[answer] : null;
      legs.push({link, start : time, end, sends, answers});
      if (answers && !done.has(link.to) && !(parts.get(link.to)?.time <= end)) {
        parts.set(link.to, {time : end, mode : answers});
        pending.push({key : link.to, time : end});
      }
    }
  }
  return {legs, parts};
}
const ANSWERING = Object.freeze({fire : 'aid-pulse-active', quiet : 'aid-pulse-quieting'});
const ANSWERED = Object.freeze({fire : 'aid-pulse-fired', quiet : 'aid-pulse-quieted'});
const MOVES = Object.freeze({fire : true, quiet : false});
export function createSignalPlayer(svg, schedule, {marks, moves, reached}) {
  const document = svg.ownerDocument, overlay = document.createElementNS(NS, 'g');
  overlay.setAttribute('class', 'aid-pulse-overlay');
  const signal = (leg, points) => {
    const size =
        SIGNAL.radius[0] + (SIGNAL.radius[1] - SIGNAL.radius[0]) * (leg.link.strength ?? 1);
    if (leg.link.kind === HORMONE) {
      if (!leg.link.wave)
        return {points, quiet : true};
      const wave = document.createElementNS(NS, 'circle');
      wave.setAttribute('class', 'aid-hormone-wave');
      wave.setAttribute('cx', String(points[0].x));
      wave.setAttribute('cy', String(points[0].y));
      wave.setAttribute('r', '0');
      wave.setAttribute('opacity', '0');
      wave.style.setProperty('--hormone', leg.link.colour);
      overlay.appendChild(wave);
      return {points, wave, length : lineLength(points)};
    }
    if (leg.sends === 'fire') {
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('class', 'aid-signal-particle');
      dot.setAttribute('r', String(size));
      dot.setAttribute('opacity', '0');
      overlay.appendChild(dot);
      return {points, dot};
    }
    const trail = document.createElementNS(NS, 'path'), length = lineLength(points);
    trail.setAttribute('class', 'aid-signal-withdrawn');
    trail.setAttribute('d', 'M' + points.map(p => p.x + ' ' + p.y).join(' L'));
    trail.setAttribute('stroke-width', String(size));
    trail.setAttribute('stroke-dasharray', SIGNAL.trail + ' ' + (length + SIGNAL.trail));
    trail.setAttribute('opacity', '0');
    overlay.appendChild(trail);
    return {points, trail, length};
  };
  const place = (line, along) => {
    if (line.quiet)
      return;
    if (line.wave) {
      line.wave.setAttribute('r', String(clamp(along) * line.length));
      line.wave.style.opacity = String(1 - SIGNAL.thinning * clamp(along));
    } else if (line.dot) {
      const at = signalPoint(line.points, clamp(along));
      line.dot.setAttribute('cx', String(at.x));
      line.dot.setAttribute('cy', String(at.y));
    } else
      line.trail.setAttribute('stroke-dashoffset',
                              String(SIGNAL.trail - clamp(along) * (line.length + SIGNAL.trail)));
  };
  const show = (line, visible) =>
      line.quiet ||
      (line.wave ?? line.dot ?? line.trail).setAttribute('opacity', visible ? '1' : '0');
  const legs = schedule.legs.map(leg => {
    const stages = legStages(leg.link), total = stages.reduce((sum, s) => sum + s.length, 0) || 1;
    let from = 0;
    return {
      leg,
      state : 'waiting',
      stages : stages.map(stage => {
        const share = stage.length / total, part = {from, to : from + share};
        from += share;
        part.lines = stage.lines.map(points => signal(leg, points));
        return part;
      })
    };
  });
  const parts = [...schedule.parts.entries() ].map(([ key, {time, mode} ]) =>
                                                       ({key, time, mode, state : 'waiting'}));
  const colour = (dot, kind) => {
    const [fill, stroke] = COLOURS[kind] ?? COLOURS.excite;
    dot.style.fill = fill;
    dot.style.stroke = stroke;
  };
  const end = Math.max(0, ...schedule.legs.map(l => l.end)) + SIGNAL.fade + SIGNAL.glow;
  let handle = null, started = null, active = false;
  const settle = part => {
    for (const element of marks(part.key))
      element.classList.remove(ANSWERING[part.mode]);
    for (const [element, name] of part.moving ?? [])
      element.classList.remove(name);
  };
  const stop = () => {
    if (!active)
      return;
    active = false;
    if (handle !== null)
      cancelAnimationFrame(handle);
    handle = null;
    overlay.remove();
    for (const part of parts.filter(p => p.state === 'answering'))
      settle(part);
  };
  const answer = elapsed => {
    for (const part of parts) {
      if (part.state === 'waiting' && elapsed >= part.time) {
        part.state = 'answering';
        reached({key : part.key, mode : part.mode});
        for (const element of marks(part.key))
          element.classList.add(ANSWERING[part.mode], ANSWERED[part.mode]);
        part.moving = MOVES[part.mode] ? moves(part.key) : [];
        for (const [element, name] of part.moving)
          element.classList.add(name);
      } else if (part.state === 'answering' && elapsed >= part.time + SIGNAL.glow) {
        part.state = 'done';
        settle(part);
      }
    }
  };
  const run = (item, elapsed) => {
    const {leg, stages} = item;
    if (item.state === 'waiting' && elapsed >= leg.start) {
      item.state = 'running';
      for (const {lines} of stages)
        for (const {dot} of lines)
          if (dot)
            colour(dot, leg.link.kind);
      reached({link : leg.link, mode : leg.sends});
    }
    if (item.state !== 'running')
      return;
    const share = (elapsed - leg.start) / (leg.end - leg.start);
    stages.forEach((stage, k) => {
      const last = k === stages.length - 1,
            along = (share - stage.from) / (stage.to - stage.from || 1);
      for (const line of stage.lines) {
        place(line, along);
        if (!last || line.trail)
          show(line, along >= 0 && along < 1);
        else if (along >= 0)
          show(line, true);
      }
    });
    if (share < 1)
      return;
    if (!item.arrived) {
      item.arrived = true;
      if (leg.link.kind === 'modulate' && leg.sends === 'fire')
        for (const element of marks(leg.link.to))
          element.classList.add('aid-pulse-tuned');
      if (leg.link.kind === HORMONE) {
        const end = leg.link.points.at(-1), shown = document.createElementNS(NS, 'g');
        shown.setAttribute('class', 'aid-hormone-arrival');
        shown.setAttribute('transform', 'translate(' + end.x + ' ' + end.y + ')');
        shown.innerHTML = leg.link.mark;
        overlay.appendChild(shown);
        item.shown = shown;
        for (const element of marks(leg.link.to)) {
          element.classList.add('aid-pulse-hormone');
          element.style.setProperty('--hormone', leg.link.colour);
        }
      }
    }
    if (item.shown)
      item.shown.setAttribute('opacity',
                              String(Math.max(0, 1 - (elapsed - leg.end) / SIGNAL.glow)));
    for (const {wave} of stages.at(-1)?.lines ?? [])
      if (wave)
        wave.setAttribute('opacity', String(Math.max(0, 1 - (elapsed - leg.end) / SIGNAL.fade)));
    const fade = (elapsed - leg.end) / SIGNAL.fade;
    for (const {dot} of stages.at(-1)?.lines ?? [])
      if (dot) {
        if (!leg.answers)
          colour(dot, 'fade');
        dot.setAttribute('opacity', String(Math.max(0, 1 - fade)));
      }
    if (fade >= 1 && (!item.shown || elapsed - leg.end >= SIGNAL.glow))
      item.state = 'done';
  };
  const draw = now => {
    if (!active || !overlay.isConnected)
      return stop();
    if (started === null)
      started = now;
    const elapsed = now - started;
    answer(elapsed);
    for (const item of legs)
      run(item, elapsed);
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
    running : () => active,
    stop
  };
}
