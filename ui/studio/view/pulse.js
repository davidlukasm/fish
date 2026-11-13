import {substanceColor} from '../../hormones.js';

const NS = 'http://www.w3.org/2000/svg';
const colour = leg => leg.kind === 'hormone'    ? substanceColor(leg.substance)
                      : leg.kind === 'teaching' ? 'var(--aid-teach)'
                      : leg.sign < 0            ? 'var(--aid-inhibit)'
                                                : 'var(--aid-light)';
const PLAY = Object.freeze({speed : 180, linger : 800, dot : 5, thinning : .7, instant : 1});
const signalShape = leg => leg.kind === 'teaching' ? 'teaching'
                           : leg.sign < 0          ? 'inhibition'
                                                   : 'excitation';
function pulseMark(svg, leg, scale) {
  const dot = svg.ownerDocument.createElementNS(NS, 'circle');
  dot.style.fill = colour(leg);
  dot.setAttribute('class', 'aid-signal-dot ' + signalShape(leg));
  dot.setAttribute('opacity', '0');
  const resizeDot = value => dot.setAttribute('r', String(PLAY.dot / value));
  resizeDot(scale);
  if (leg.kind === 'electrical' && !leg.rhythm && leg.sign >= 0)
    return {
      dot,
      resize : resizeDot,
      move : p => {
        dot.setAttribute('cx', String(p.x));
        dot.setAttribute('cy', String(p.y));
      }
    };
  const group = svg.ownerDocument.createElementNS(NS, 'g');
  group.setAttribute('class', 'aid-signal-mark ' + signalShape(leg));
  group.style.setProperty('--signal', colour(leg));
  group.setAttribute('opacity', '0');
  dot.setAttribute('opacity', '1');
  group.appendChild(dot);
  let symbol, ring;
  if (leg.kind === 'teaching' || leg.sign < 0) {
    symbol = svg.ownerDocument.createElementNS(NS, 'path');
    symbol.setAttribute('class', 'aid-signal-symbol');
    group.appendChild(symbol);
  }
  if (leg.rhythm) {
    ring = svg.ownerDocument.createElementNS(NS, 'circle');
    ring.setAttribute('class', 'aid-signal-rhythm');
    group.appendChild(ring);
  }
  const resize = value => {
    resizeDot(value);
    const r = PLAY.dot / value;
    symbol?.setAttribute('d', leg.kind === 'teaching' ? `M0 ${- r}L${r} 0 0 ${r} ${- r} 0Z`
                                                      : `M${- r * .6} 0H${r * .6}`);
    ring?.setAttribute('r', String((PLAY.dot + 3) / value));
  };
  resize(scale);
  return {
    dot : group,
    resize,
    move : p => group.setAttribute('transform', `translate(${p.x} ${p.y})`)
  };
}
const screenScale = svg => {
  const matrix = svg.getScreenCTM();
  return matrix ? Math.hypot(matrix.a, matrix.b) : 1;
};
// Geometry is stable for a scene. Reading it while moving the dots forces repeated SVG work.
const pathSamples = new WeakMap();
function sampledPath(path, scale) {
  const d = path.getAttribute('d'), cached = pathSamples.get(path);
  if (cached && cached.d === d && cached.scale >= scale)
    return cached.sampled;
  const length = path.getTotalLength();
  const count = Math.max(12, Math.min(256, Math.ceil(length * scale / 3)));
  const points =
      Array.from({length : count + 1}, (_, i) => path.getPointAtLength(length * i / count));
  const sampled = {
    length,
    at(distance) {
      const t = Math.max(0, Math.min(count, length ? distance * count / length : 0));
      const i = Math.min(count - 1, Math.floor(t)), f = t - i, a = points[i], b = points[i + 1];
      return {x : a.x + (b.x - a.x) * f, y : a.y + (b.y - a.y) * f};
    }
  };
  pathSamples.set(path, {d, scale, sampled});
  return sampled;
}
const signalKey = part => part.id + ':' + (part.kind ?? 'electrical') + ':' + (part.sign ?? 1) +
                          ':' + (part.substance ?? '');
const sourceKey = leg => signalKey({id : leg.from, sign : leg.sourceSign ?? 1});
// Feedback arriving after a node's first trace visit does not invent a second firing.
export function pulseSchedule(trace, durations) {
  const incoming = new Map(), ready = new Map();
  for (const leg of trace.legs) {
    const key = signalKey({...leg, id : leg.to});
    if (!incoming.has(key))
      incoming.set(key, []);
    incoming.get(key).push(leg);
  }
  const parts = [...trace.parts ].sort((a, b) => a.level - b.level).map(part => {
    const arrivals = (incoming.get(signalKey(part)) ?? [])
                         .filter(leg => leg.level < part.level)
                         .map(leg => (ready.get(sourceKey(leg)) ?? 0) + (durations.get(leg) ?? 0));
    const at = part.level && arrivals.length ? Math.max(...arrivals) : 0;
    ready.set(signalKey(part), at);
    return {part, at, waitingAt : arrivals.length ? Math.min(...arrivals) : at};
  });
  const legs =
      trace.legs
          .map(leg =>
                   ({leg, at : ready.get(sourceKey(leg)) ?? 0, duration : durations.get(leg) ?? 0}))
          .sort((a, b) => a.at - b.at);
  return {
    parts,
    legs,
    end : legs.reduce((end, l) => Math.max(end, l.at + l.duration),
                      parts.reduce((end, p) => Math.max(end, p.at), 0))
  };
}
export function createPlanPlayer(svg, trace, {marks, point, reached, sent = () => {}}) {
  let overlay, paths = [], parts = [], waves = [], schedule = {legs : [], end : 0};
  let handle = null, started = null, active = false, nextEvent = 0, sceneScale = 1, events = [];
  const shown = new Set(), sentLegs = new Set();
  let glowing = new Map();
  const glow = (item, cls, on) => {
    for (const element of item.elements) {
      if (!glowing.has(element))
        glowing.set(element, new Map());
      const classes = glowing.get(element);
      if (!classes.has(cls))
        classes.set(cls, new Set());
      const signals = classes.get(cls);
      if (on)
        signals.add(item);
      else
        signals.delete(item);
      element.classList.toggle(cls, signals.size > 0);
      if (cls === 'aid-pulse-waiting' && signals.size)
        element.style.setProperty('--aid-pulse-colour', colour([...signals ].at(-1).part));
    }
  };
  const cleanMarks = () => {
    for (const {cls, elements} of parts)
      for (const element of elements) {
        element.classList.remove(cls);
        element.classList.remove('aid-pulse-waiting');
      }
    glowing = new Map();
  };
  const attach = next => {
    const elapsed = started === null ? 0 : performance.now() - started;
    overlay?.remove();
    cleanMarks();
    svg = next;
    overlay = svg.ownerDocument.createElementNS(NS, 'g');
    overlay.setAttribute('class', 'aid-plan-pulses');
    overlay.setAttribute('pointer-events', 'none');
    const routes = new Map(), ids = new Map();
    for (const element of svg.querySelectorAll('[data-signal-edges]')) {
      const path = element.matches('path') ? element : element.querySelector('.aid-wire-ink');
      if (!path)
        continue;
      if (!ids.has(path))
        ids.set(path, ids.size);
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
    const scale = screenScale(svg);
    const geometry = new Map(), durations = new Map(), joined = new Set(), spread = new Map();
    const travel = length => Math.max(PLAY.instant, length * scale / PLAY.speed * 1000);
    paths = [];
    for (const leg of trace.legs) {
      const from = point(leg.from), to = point(leg.to);
      if (from && to)
        durations.set(leg, travel(Math.hypot(to.x - from.x, to.y - from.y)));
      if (leg.kind === 'hormone') {
        if (!from || !to)
          continue;
        const key = leg.from + ':' + leg.substance + ':' + leg.level + ':' + (leg.sourceSign ?? 1);
        const reach = Math.hypot(to.x - from.x, to.y - from.y),
              wave = spread.get(key) ?? {leg, from, reach : 0};
        wave.reach = Math.max(wave.reach, reach);
        spread.set(key, wave);
        continue;
      }
      const found = routes.get(leg.from + '>' + leg.to);
      if (!found?.length)
        continue;
      const route = found.sort((a, b) => a.section - b.section).map(entry => entry.path);
      const key = route.map(path => ids.get(path)).join(',') + ':' + leg.from + ':' + leg.kind +
                  ':' + leg.sign + ':' + leg.level + ':' + (leg.sourceSign ?? 1);
      const sampled = route.map(path => {
        if (!geometry.has(path))
          geometry.set(path, sampledPath(path, scale));
        return geometry.get(path);
      });
      const lengths = sampled.map(path => path.length),
            length = lengths.reduce((sum, n) => sum + n, 0), duration = travel(length);
      durations.set(leg, duration);
      if (joined.has(key))
        continue;
      joined.add(key);
      const {dot, move, resize} = pulseMark(svg, leg, scale);
      overlay.appendChild(dot);
      paths.push({
        leg,
        route : sampled,
        dot,
        move,
        resize,
        length,
        lengths,
        duration,
        opacity : Math.min(...found.map(entry => entry.opacity))
      });
    }
    schedule = pulseSchedule(trace, durations);
    events = [
      ...schedule.parts.map(({part, at}) => ({part, at, level : part.level})),
      ...schedule.legs.map(({leg, at}) => ({leg, at, level : leg.level}))
    ].sort((a, b) => a.at - b.at || a.level - b.level || Number(!!a.leg) - Number(!!b.leg));
    nextEvent = 0;
    const departures = new Map(schedule.legs.map(entry => [entry.leg, entry.at]));
    for (const entry of paths)
      entry.at = departures.get(entry.leg);
    waves = [...spread.values() ].map(wave => {
      const circle = svg.ownerDocument.createElementNS(NS, 'circle');
      circle.setAttribute('class', 'aid-hormone-wave');
      circle.setAttribute('cx', String(wave.from.x));
      circle.setAttribute('cy', String(wave.from.y));
      circle.setAttribute('r', '0');
      circle.setAttribute('opacity', '0');
      circle.style.setProperty('--hormone', colour(wave.leg));
      overlay.appendChild(circle);
      return {...wave, circle, at : departures.get(wave.leg), duration : travel(wave.reach)};
    });
    svg.appendChild(overlay);
    const cached = new Map();
    parts = schedule.parts.map(entry => {
      const {part} = entry;
      if (!cached.has(part.id))
        cached.set(part.id, marks(part.id));
      const cls = part.kind === 'teaching'  ? 'aid-pulse-teaching'
                  : part.kind === 'hormone' ? 'aid-pulse-binding'
                  : part.sign < 0           ? 'aid-pulse-quieting'
                                            : 'aid-pulse-active';
      const elements = cached.get(part.id);
      return {...entry, cls, elements, on : false, waiting : false};
    });
    if (started !== null)
      started = performance.now() - elapsed * scale / sceneScale;
    sceneScale = scale;
  };
  // A wheel zoom changes the screen scale but keeps every sampled path and its current progress.
  const rescale = () => {
    if (!active)
      return;
    const scale = screenScale(svg), ratio = scale / sceneScale;
    if (!(scale > 0) || ratio === 1)
      return;
    const now = performance.now();
    if (started !== null)
      started = now - (now - started) * ratio;
    for (const part of parts) {
      part.at *= ratio;
      part.waitingAt *= ratio;
    }
    for (const path of paths) {
      path.at *= ratio;
      path.duration *= ratio;
      path.resize(scale);
    }
    for (const wave of waves) {
      wave.at *= ratio;
      wave.duration *= ratio;
    }
    for (const leg of schedule.legs) {
      leg.at *= ratio;
      leg.duration *= ratio;
    }
    for (const event of events)
      event.at *= ratio;
    schedule.end *= ratio;
    sceneScale = scale;
  };
  const stop = () => {
    active = false;
    if (handle !== null)
      cancelAnimationFrame(handle);
    handle = null;
    overlay?.remove();
    cleanMarks();
  };
  const paint = elapsed => {
    // A skipped frame must preserve the same causal callback order as uninterrupted playback.
    while (nextEvent < events.length && elapsed >= events[nextEvent].at) {
      const {part, leg} = events[nextEvent++];
      if (part) {
        const key = signalKey(part);
        if (!shown.has(key)) {
          shown.add(key);
          reached(part);
        }
      } else {
        const key =
            leg.from + '>' + leg.to + ':' + leg.kind + ':' + leg.sign + ':' + (leg.substance ?? '');
        if (!sentLegs.has(key)) {
          sentLegs.add(key);
          sent(leg);
        }
      }
    }
    for (const item of parts) {
      const {cls, at, waitingAt} = item;
      const on = elapsed >= at && elapsed < at + PLAY.linger;
      const waiting = elapsed >= waitingAt && elapsed < at;
      if (item.on !== on) {
        item.on = on;
        glow(item, cls, on);
      }
      if (item.waiting !== waiting) {
        item.waiting = waiting;
        glow(item, 'aid-pulse-waiting', waiting);
      }
    }
    for (const {circle, reach, at, duration} of waves) {
      const fraction = (elapsed - at) / duration, spreading = fraction >= 0 && fraction < 1;
      circle.setAttribute('opacity', spreading ? String(1 - PLAY.thinning * fraction) : '0');
      if (spreading)
        circle.setAttribute('r', String(fraction * reach));
    }
    for (const {route, dot, move, length, lengths, opacity, at, duration} of paths) {
      const fraction = (elapsed - at) / duration;
      dot.setAttribute('opacity', fraction >= 0 && fraction < 1 ? String(opacity) : '0');
      if (fraction >= 0 && fraction < 1) {
        let distance = fraction * length, index = 0;
        while (index + 1 < route.length && distance > lengths[index])
          distance -= lengths[index++];
        move(route[index].at(distance));
      }
    }
  };
  const draw = now => {
    if (!active || !svg.isConnected)
      return stop();
    if (started === null)
      started = now;
    const elapsed = now - started;
    paint(elapsed);
    if (elapsed < schedule.end + PLAY.linger)
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
      shown.clear();
      sentLegs.clear();
      attach(svg);
      // Initial callbacks build wire indexes and mark organs before the animation clock starts.
      paint(0);
      handle = requestAnimationFrame(draw);
    },
    attach : next => {
      if (active && next)
        attach(next);
    },
    rescale,
    stop
  };
}
