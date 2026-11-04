// Lightweight playback of developed signal groups. Geometry is sampled once.
// The editor's animated circles follow the engine's recorded group activations.
const NS = 'http://www.w3.org/2000/svg';
const SIGNAL_CUTOFF = .04;

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

// Smooth the presentation between two computed Engine frames. The endpoints remain unchanged.
export function interpolateFrame(frames, position) {
  if (!frames?.length)
    return [];
  const frame = Math.max(0, Math.min(frames.length - 1, position));
  const low = Math.floor(frame), high = Math.min(frames.length - 1, low + 1);
  const mix = frame - low;
  return (frames[low] ?? []).map((value, index) =>
      value * (1 - mix) + (frames[high]?.[index] ?? value) * mix);
}

export function displayedContacts(svg, centers, report) {
  const visible =
      new Set(Array.from(svg.querySelectorAll('[data-contact]'), link => link.dataset.contact));
  return (report?.contacts ?? [])
      .filter(([ from, to ]) => visible.has(from + ':' + to))
      .flatMap(([ from, to, , , positive, negative, meanPositive, meanNegative ]) => {
        const channels = [
          {channel : 'excite', count : positive, weight : meanPositive, sign : 1},
          {channel : 'inhibit', count : negative, weight : meanNegative, sign : -1}
        ];
        return channels.filter(channel => channel.count > 0).map(channel => ({
                                                                   kind : 'contact',
                                                                   id : from + ':' + to,
                                                                   channel : channel.channel,
                                                                   from : centers[from]?.id,
                                                                   to : centers[to]?.id,
                                                                   strength : Math.min(
                                                                       1, Math.abs(channel.weight)),
                                                                   count : channel.count,
                                                                   sign : channel.sign
                                                                 }));
      });
}
export function createSignalPlayer(svg, centers, connections, frames) {
  if (!frames?.length)
    return {start() {}, stop() {}};
  const document = svg.ownerDocument;
  const byId = new Map(centers.map((center, index) => [center.id, index]));
  const nodes = centers.map(center => svg.querySelector('[data-center="' + center.id + '"]'));
  const overlay = document.createElementNS(NS, 'g');
  overlay.setAttribute('class', 'aid-pulse-overlay');
  const activeSources = new Set();
  for (const frame of frames)
    for (let index = 0; index < frame.length; index++)
      if (Math.abs(frame[index] ?? 0) >= SIGNAL_CUTOFF)
        activeSources.add(index);
  const links =
      connections.filter(wire => activeSources.has(byId.get(wire.from)))
          .map(wire => {
            const attribute = wire.kind === 'contact' ? 'data-contact' : 'data-wire';
            const channel = wire.kind === 'contact' ? '[data-channel="' + wire.channel + '"]' : '';
            const path =
                svg.querySelector('[' + attribute + '="' + wire.id + '"] .aid-wire-ink' + channel);
            const from = byId.get(wire.from), to = byId.get(wire.to);
            if (!path || from === undefined || to === undefined)
              return null;
            const density =
                Math.max(1, Math.min(4, Math.round(Math.log2((wire.count ?? 1) + 1))));
            const dots = Array.from({length : density}, () => {
              const dot = document.createElementNS(NS, 'circle');
              dot.setAttribute('class', 'aid-signal-particle');
              dot.style.fill = wire.sign < 0 ? '#e8a2b5' : '#dceea7';
              dot.style.stroke = wire.sign < 0 ? '#f5d4dd' : '#fff7ce';
              dot.setAttribute('r', String(1.5 + 3 * wire.strength));
              dot.setAttribute('opacity', '0');
              overlay.appendChild(dot);
              return dot;
            });
            return {
              from,
              to,
              path,
              dots,
              strength : wire.strength,
              points : sampleSignalPath(path),
              activation : 0
            };
          })
          .filter(Boolean);
  let handle = null, started = null, active = false;
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
      node?.classList.remove('aid-pulse-inhibited');
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
    // Animate at display refresh rate while respecting every measured neural activation.
    const values = interpolateFrame(frames, elapsed / frameDuration);
    nodes.forEach((node, i) => {
      if (!node)
        return;
      const activation = Math.min(1, Math.abs(values[i] ?? 0));
      node.style.opacity = String(.65 + .35 * activation);
      node.classList.toggle('aid-pulse-active', activation > .03);
      node.classList.toggle('aid-pulse-inhibited', (values[i] ?? 0) < -.03);
    });
    for (const link of links) {
      const source = Math.abs(values[link.from] ?? 0);
      link.activation = Math.min(1, source);
      link.path.style.opacity = String(.2 + .8 * link.activation);
      const opacity = String(link.activation >= SIGNAL_CUTOFF ? link.activation : 0);
      const period = 400 + 500 * (1 - link.strength);
      for (let index = 0; index < link.dots.length; ++index) {
        const dot = link.dots[index];
        dot.setAttribute('opacity', opacity);
        if (link.activation < SIGNAL_CUTOFF)
          continue;
        const phase = (elapsed / period + index / link.dots.length) % 1;
        const point = signalPoint(link.points, phase);
        dot.setAttribute('cx', String(point.x));
        dot.setAttribute('cy', String(point.y));
      }
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
