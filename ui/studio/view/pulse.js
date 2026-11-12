import {substanceColor} from '../../hormones.js';

const NS = 'http://www.w3.org/2000/svg';
const colour = leg => leg.kind === 'hormone'    ? substanceColor(leg.substance)
                      : leg.kind === 'teaching' ? 'var(--aid-teach)'
                      : leg.sign < 0            ? 'var(--aid-inhibit)'
                                                : 'var(--aid-light)';
const PLAY = Object.freeze({interval : 520, speed : 180, linger : 800, dot : 5, thinning : .7});
// Geometry is stable for a scene. Reading it while moving the dots forces repeated SVG work.
function sampledPath(path, scale) {
  const length = path.getTotalLength();
  const count = Math.max(12, Math.min(256, Math.ceil(length * scale / 3)));
  const points =
      Array.from({length : count + 1}, (_, i) => path.getPointAtLength(length * i / count));
  return {
    length,
    at(distance) {
      const t = Math.max(0, Math.min(count, length ? distance * count / length : 0));
      const i = Math.min(count - 1, Math.floor(t)), f = t - i, a = points[i], b = points[i + 1];
      return {x : a.x + (b.x - a.x) * f, y : a.y + (b.y - a.y) * f};
    }
  };
}
export function createPlanPlayer(svg, trace, {marks, point, reached, sent = () => {}}) {
  const levels = Math.max(1, ...trace.parts.map(part => part.level)) + 1;
  const linger = PLAY.linger;
  let intervals = Array(levels).fill(PLAY.interval), times = [];
  const timing = () => {
    times = [ 0 ];
    for (const interval of intervals)
      times.push(times.at(-1) + interval);
  };
  timing();
  let overlay, paths = [], parts = [], waves = [], handle = null, started = null, active = false;
  let nextLeg = 0;
  const shown = new Set(), sentLegs = new Set();
  const attach = next => {
    const elapsed = started === null ? 0 : performance.now() - started;
    const nextLevel = times.findIndex((t, i) => i < levels && elapsed < times[i + 1]);
    const level = nextLevel < 0 ? levels - 1 : nextLevel;
    const phase = (elapsed - times[level]) / intervals[level];
    overlay?.remove();
    for (const {cls, elements} of parts)
      for (const element of elements)
        element.classList.remove(cls);
    svg = next;
    overlay = svg.ownerDocument.createElementNS(NS, 'g');
    overlay.setAttribute('class', 'aid-plan-pulses');
    overlay.setAttribute('pointer-events', 'none');
    const routes = new Map(), joined = new Map();
    for (const element of svg.querySelectorAll('[data-signal-edges]')) {
      const path = element.matches('path') ? element : element.querySelector('.aid-wire-ink');
      if (!path)
        continue;
      for (const pair of element.getAttribute('data-signal-edges').split(' ').filter(Boolean)) {
        if (!routes.has(pair))
          routes.set(pair, []);
        routes.get(pair).push({
          path,
          opacity : Number(element.getAttribute('data-signal-opacity') ?? 1),
          section : Number(element.getAttribute('data-signal-section') ?? 1)
        });
      }
    }
    paths = [];
    // A substance spreads from its gland as a wave reaching every cell that answers it.
    const spread = new Map();
    for (const leg of trace.legs.filter(leg => leg.kind === 'hormone')) {
      const from = point(leg.from), to = point(leg.to);
      if (!from || !to)
        continue;
      const key = leg.from + ':' + leg.substance + ':' + leg.level;
      const reach = Math.hypot(to.x - from.x, to.y - from.y);
      const wave = spread.get(key) ?? {leg, from, reach : 0};
      wave.reach = Math.max(wave.reach, reach);
      spread.set(key, wave);
    }
    waves = [...spread.values() ].map(wave => {
      const circle = svg.ownerDocument.createElementNS(NS, 'circle');
      circle.setAttribute('class', 'aid-hormone-wave');
      circle.setAttribute('cx', String(wave.from.x));
      circle.setAttribute('cy', String(wave.from.y));
      circle.setAttribute('r', '0');
      circle.setAttribute('opacity', '0');
      circle.style.setProperty('--hormone', colour(wave.leg));
      overlay.appendChild(circle);
      return {...wave, circle};
    });
    for (const leg of trace.legs) {
      if (leg.kind === 'hormone')
        continue;
      const pair = leg.from + '>' + leg.to;
      const found = routes.get(pair);
      if (!found?.length)
        continue;
      const route = found.sort((a, b) => a.section - b.section).map(entry => entry.path);
      const trunk = route.find(path => path.classList.contains('aid-wire-ink')) ?? route[0];
      if (!joined.has(trunk))
        joined.set(trunk, new Set());
      const key = leg.kind + ':' + leg.sign + ':' + leg.level;
      if (joined.get(trunk).has(key))
        continue;
      joined.get(trunk).add(key);
      const dot = svg.ownerDocument.createElementNS(NS, 'circle');
      dot.style.fill = colour(leg);
      dot.setAttribute('opacity', '0');
      overlay.appendChild(dot);
      paths.push({leg, route, dot, opacity : Math.min(...found.map(entry => entry.opacity))});
    }
    svg.appendChild(overlay);
    const matrix = svg.getScreenCTM();
    const scale = matrix ? Math.hypot(matrix.a, matrix.b) : 1;
    intervals = Array(levels).fill(PLAY.interval);
    const geometry = new Map();
    for (const entry of paths) {
      entry.route = entry.route.map(path => {
        if (!geometry.has(path))
          geometry.set(path, sampledPath(path, scale));
        return geometry.get(path);
      });
      entry.lengths = entry.route.map(path => path.length);
      entry.length = entry.lengths.reduce((sum, length) => sum + length, 0);
      entry.dot.setAttribute('r', String(PLAY.dot / scale));
      intervals[entry.leg.level] =
          Math.max(intervals[entry.leg.level], entry.length * scale / PLAY.speed * 1000);
    }
    timing();
    if (started !== null)
      started = performance.now() - times[level] - phase * intervals[level];
    const cached = new Map();
    parts = trace.parts.map(part => {
      if (!cached.has(part.id))
        cached.set(part.id, marks(part.id));
      const cls = part.kind === 'teaching'  ? 'aid-pulse-teaching'
                  : part.kind === 'hormone' ? 'aid-pulse-binding'
                  : part.sign < 0           ? 'aid-pulse-quieting'
                                            : 'aid-pulse-active';
      return {part, cls, elements : cached.get(part.id), on : false};
    });
  };
  const stop = () => {
    active = false;
    if (handle !== null)
      cancelAnimationFrame(handle);
    handle = null;
    overlay?.remove();
    for (const {cls, elements} of parts)
      for (const element of elements)
        element.classList.remove(cls);
  };
  const draw = now => {
    if (!active || !svg.isConnected)
      return stop();
    if (started === null)
      started = now;
    const elapsed = now - started;
    for (const item of parts) {
      const {part, cls, elements} = item;
      const key = part.id + ':' + part.kind + ':' + part.sign + ':' + (part.substance ?? '');
      if (elapsed >= times[part.level] && !shown.has(key)) {
        shown.add(key);
        reached(part);
      }
      const on = elapsed >= times[part.level] && elapsed < times[part.level] + linger;
      if (item.on !== on) {
        item.on = on;
        for (const element of elements)
          element.classList.toggle(cls, on);
      }
    }
    // The trace lists its legs level by level, so the legs now due are always the next ones.
    while (nextLeg < trace.legs.length && elapsed >= times[trace.legs[nextLeg].level]) {
      const leg = trace.legs[nextLeg++];
      const key =
          leg.from + '>' + leg.to + ':' + leg.kind + ':' + leg.sign + ':' + (leg.substance ?? '');
      if (!sentLegs.has(key)) {
        sentLegs.add(key);
        sent(leg);
      }
    }
    for (const {leg, circle, reach} of waves) {
      const fraction = (elapsed - times[leg.level]) / intervals[leg.level];
      const spreading = fraction >= 0 && fraction < 1;
      circle.setAttribute('opacity', spreading ? String(1 - PLAY.thinning * fraction) : '0');
      if (spreading)
        circle.setAttribute('r', String(fraction * reach));
    }
    for (const {leg, route, dot, length, lengths, opacity} of paths) {
      const fraction = (elapsed - times[leg.level]) / intervals[leg.level];
      dot.setAttribute('opacity', fraction >= 0 && fraction < 1 ? String(opacity) : '0');
      if (fraction >= 0 && fraction < 1) {
        let distance = fraction * length, index = 0;
        while (index + 1 < route.length && distance > lengths[index])
          distance -= lengths[index++];
        const at = route[index].at(distance);
        dot.setAttribute('cx', String(at.x));
        dot.setAttribute('cy', String(at.y));
      }
    }
    if (elapsed < times[levels] + linger)
      handle = requestAnimationFrame(draw);
    else
      stop();
  };
  return {
    start() {
      if (active)
        return;
      active = true;
      attach(svg);
      handle = requestAnimationFrame(draw);
    },
    // A redrawn scene takes the trace along only while it plays.
    attach : next => {
      if (active && next)
        attach(next);
    },
    stop
  };
}
