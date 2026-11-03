// Lightweight playback of developed signal groups. Geometry is sampled once.
// The editor's animated circles follow the engine's recorded group activations.
const NS = 'http://www.w3.org/2000/svg';

export function sampleSignalPath(path, divisions = 32) {
  const count = Math.max(2, Math.round(divisions));
  const length = path.getTotalLength();
  return Array.from({length : count + 1}, (_, index) => {
    const point = path.getPointAtLength(length * index / count);
    return {x : point.x, y : point.y};
  });
}

export function signalPoint(points, fraction) {
  if (!points.length)
    return {x : 0, y : 0};
  const index = Math.min(points.length - 1, Math.max(0, fraction) * (points.length - 1));
  const first = Math.floor(index), next = Math.min(points.length - 1, first + 1);
  const share = index - first;
  return {
    x : points[first].x * (1 - share) + points[next].x * share,
    y : points[first].y * (1 - share) + points[next].y * share
  };
}

export function createSignalPlayer(svg, centers, connections, frames) {
  if (!frames?.length)
    return {start() {}, stop() {}};
  const document = svg.ownerDocument;
  const byId = new Map(centers.map((center, index) => [center.id, index]));
  const nodes = centers.map(center => svg.querySelector('[data-center="' + center.id + '"]'));
  const overlay = document.createElementNS(NS, 'g');
  overlay.setAttribute('class', 'aid-pulse-overlay');
  const links =
      connections
          .map(wire => {
            const path = svg.querySelector('[data-wire="' + wire.id + '"] .aid-wire-ink');
            const from = byId.get(wire.from), to = byId.get(wire.to);
            if (!path || from === undefined || to === undefined)
              return null;
            const dot = document.createElementNS(NS, 'circle');
            dot.setAttribute('class', 'aid-signal-particle');
            dot.setAttribute('r', String(1.5 + 3 * wire.strength));
            dot.setAttribute('opacity', '0');
            overlay.appendChild(dot);
            return {
              from, to, path, dot, strength : wire.strength,
              points : sampleSignalPath(path), activation : 0
            };
          })
          .filter(Boolean);
  let handle = null, started = null, previous = -1, active = false;
  const frameDuration = 85;
  const duration = frames.length * frameDuration;
  const stop = () => {
    if (!active)
      return;
    active = false;
    if (handle !== null)
      cancelAnimationFrame(handle);
    handle = null;
    overlay.remove();
    for (const node of nodes) {
      node?.classList.remove('aid-pulse-active');
      node?.style.removeProperty('opacity');
    }
    for (const link of links)
      link.path.style.removeProperty('opacity');
  };
  const draw = now => {
    if (!active || !overlay.isConnected) {
      stop();
      return;
    }
    if (started === null)
      started = now;
    const elapsed = now - started;
    const index = Math.min(frames.length - 1, Math.floor(elapsed / frameDuration));
    if (index !== previous) {
      previous = index;
      const values = frames[index] ?? [];
      nodes.forEach((node, i) => {
        if (!node)
          return;
        const activation = Math.min(1, Math.abs(values[i] ?? 0));
        node.style.opacity = String(.65 + .35 * activation);
        node.classList.toggle('aid-pulse-active', activation > .03);
      });
      for (const link of links) {
        const source = Math.abs(values[link.from] ?? 0);
        const target = Math.abs(values[link.to] ?? 0);
        link.activation = Math.min(1, Math.max(source, target));
        link.path.style.opacity = String(.2 + .8 * link.activation);
        link.dot.setAttribute('opacity', String(link.activation >= .04 ? link.activation : 0));
      }
    }
    for (const link of links) {
      if (link.activation < .04)
        continue;
      const phase = (elapsed / (400 + 500 * (1 - link.strength))) % 1;
      const point = signalPoint(link.points, phase);
      link.dot.setAttribute('cx', String(point.x));
      link.dot.setAttribute('cy', String(point.y));
    }
    if (elapsed < duration)
      handle = requestAnimationFrame(draw);
    else
      stop();
  };
  return {
    start() {
      if (active)
        return;
      active = true;
      svg.appendChild(overlay);
      handle = requestAnimationFrame(draw);
    },
    stop
  };
}
