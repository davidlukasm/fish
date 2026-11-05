// Lightweight playback of developed signal groups. Geometry is sampled once.
// The editor's animated circles follow the engine's recorded group activations.
const NS = 'http://www.w3.org/2000/svg';
const SIGNAL_CUTOFF = .04;
const FRAME_INTERVAL = 1000 / 30;
const VISUAL_CHANGE = .015;
// Slow enough to follow a signal from its source to its target: each engine frame shows for
// FRAME_MS, a pulse travels a strong contact in TRAVEL_MS and a weak one TRAVEL_WEAK_MS longer.
const FRAME_MS = 340, TRAVEL_MS = 1600, TRAVEL_WEAK_MS = 2000;

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
  return (frames[low] ?? [])
      .map((value, index) => value * (1 - mix) + (frames[high]?.[index] ?? value) * mix);
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
  const overlay = document.createElementNS(NS, 'g');
  overlay.setAttribute('class', 'aid-pulse-overlay');
  const activeSources = new Set();
  for (const frame of frames)
    for (let index = 0; index < frame.length; index++)
      if (Math.abs(frame[index] ?? 0) >= SIGNAL_CUTOFF)
        activeSources.add(index);
  const nodes =
      [...activeSources ]
          .map(index => ({
                 index,
                 element :
                     svg.querySelector('[data-center="' + centers[index]?.id + '"]') ??
                         svg.querySelector('[data-activity-center="' + centers[index]?.id + '"]'),
                 opacity : null,
                 active : false,
                 inhibited : false
               }))
          .filter(node => node.element);
  const links =
      connections.filter(wire => activeSources.has(byId.get(wire.from)))
          .map(wire => {
            const channel = '[data-channel="' + wire.channel + '"]';
            const path =
                svg.querySelector('[data-contact="' + wire.id + '"] .aid-wire-ink' + channel);
            const from = byId.get(wire.from), to = byId.get(wire.to);
            if (!path || from === undefined || to === undefined)
              return null;
            const density = Math.max(1, Math.min(4, Math.round(Math.log2((wire.count ?? 1) + 1))));
            const dots = Array.from({length : density}, () => {
              const dot = document.createElementNS(NS, 'circle');
              dot.setAttribute('class', 'aid-signal-particle');
              dot.style.fill = wire.sign < 0 ? '#e8a2b5' : '#dceea7';
              dot.style.stroke = wire.sign < 0 ? '#f5d4dd' : '#fff7ce';
              dot.setAttribute('r', String(1.5 + 3 * (wire.strength ?? 1)));
              dot.setAttribute('opacity', '0');
              overlay.appendChild(dot);
              return dot;
            });
            return {
              from,
              to,
              path,
              dots,
              strength : wire.strength ?? 1,
              points : sampleSignalPath(path),
              activation : null,
              opacity : null
            };
          })
          .filter(Boolean);
  let handle = null, started = null, lastDraw = -Infinity, active = false;
  const frameDuration = FRAME_MS;
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
      node.element.classList.remove('aid-pulse-active');
      node.element.classList.remove('aid-pulse-inhibited');
      node.element.style.removeProperty('opacity');
      node.opacity = null;
      node.active = false;
      node.inhibited = false;
    }
    for (const link of links) {
      link.path.style.removeProperty('opacity');
      link.activation = null;
      link.opacity = null;
    }
  };
  const draw = now => {
    if (!active || !overlay.isConnected) {
      stop();
      return;
    }
    if (started === null)
      started = now;
    const elapsed = now - started;
    if (elapsed < duration && elapsed - lastDraw < FRAME_INTERVAL) {
      handle = requestAnimationFrame(draw);
      return;
    }
    lastDraw = elapsed;
    // Only active groups and links need visual changes; inactive SVG stays untouched.
    const values = interpolateFrame(frames, elapsed / frameDuration);
    for (const node of nodes) {
      const value = values[node.index] ?? 0;
      const activation = Math.min(1, Math.abs(value));
      const opacity = .65 + .35 * activation;
      if (node.opacity === null || Math.abs(node.opacity - opacity) >= VISUAL_CHANGE) {
        node.element.style.opacity = String(opacity);
        node.opacity = opacity;
      }
      const activeNow = activation > .03;
      const inhibitedNow = value < -.03;
      if (node.active !== activeNow) {
        node.element.classList.toggle('aid-pulse-active', activeNow);
        node.active = activeNow;
      }
      if (node.inhibited !== inhibitedNow) {
        node.element.classList.toggle('aid-pulse-inhibited', inhibitedNow);
        node.inhibited = inhibitedNow;
      }
    }
    for (const link of links) {
      const source = Math.abs(values[link.from] ?? 0);
      const activation = Math.min(1, source);
      if (link.activation === null || Math.abs(link.activation - activation) >= VISUAL_CHANGE) {
        link.path.style.opacity = String(.2 + .8 * activation);
        link.activation = activation;
      }
      const opacity = activation >= SIGNAL_CUTOFF ? activation : 0;
      const period = TRAVEL_MS + TRAVEL_WEAK_MS * (1 - link.strength);
      if (link.opacity === null || Math.abs(link.opacity - opacity) >= VISUAL_CHANGE) {
        for (const dot of link.dots)
          dot.setAttribute('opacity', String(opacity));
        link.opacity = opacity;
      }
      if (activation < SIGNAL_CUTOFF)
        continue;
      for (let index = 0; index < link.dots.length; ++index) {
        const dot = link.dots[index];
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
      started = null;
      lastDraw = -Infinity;
      svg.appendChild(overlay);
      handle = requestAnimationFrame(draw);
    },
    stop
  };
}
