// A stimulus as signals running through the drawn network. From the stimulated parts a signal
// runs along each wire that leaves a part when it fires, in the colour of what the part sends
// (exciting, inhibiting or modulating), so a signal splits where a part sends on to several and
// takes the colour of each part it passes. Where a signal arrives, the part fires if the
// engine's probe found it active; else the signal fades there. A part fires once, when the first
// signal reaches it. Effectors twitch as they fire, the other parts light up, and both stay
// marked as reached. The engine decides which parts fire; the drawing paces the way at SPEED
// frame units a second, each leg LEAST to MOST milliseconds long, a fading signal FADE.
const NS = 'http://www.w3.org/2000/svg';
export const SIGNAL = Object.freeze({
  cutoff : .04,
  speed : 100,
  least : 1500,
  most : 4000,
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
// How long a signal takes along points.
export function legDuration(points) {
  let length = 0;
  for (let k = 1; k < points.length; ++k)
    length += Math.hypot(points[k].x - points[k - 1].x, points[k].y - points[k - 1].y);
  return Math.max(SIGNAL.least, Math.min(SIGNAL.most, 1000 * length / SIGNAL.speed));
}
// The way of a stimulus: from the parts `starts`, along `links` ({from, to, points, ...}) to the
// parts `active` says fired. Each leg starts when its part fires and ends where the next one
// fires (or the signal fades); a part fires at the first signal's arrival.
export function signalSchedule(starts, links, active) {
  const fired = new Map(starts.map(key => [key, 0])), done = new Set(), legs = [];
  const pending = starts.map(key => ({key, time : 0}));
  while (pending.length) {
    pending.sort((a, b) => a.time - b.time);
    const {key, time} = pending.shift();
    if (done.has(key))
      continue;
    done.add(key);
    for (const link of links.filter(l => l.from === key && l.to !== key)) {
      const end = time + legDuration(link.points), fires = active(link.to);
      legs.push({link, start : time, end, fires});
      if (fires && (!fired.has(link.to) || fired.get(link.to) > end)) {
        fired.set(link.to, end);
        pending.push({key : link.to, time : end});
      }
    }
  }
  return {legs, fired};
}
// Plays a schedule in the scene: `marks(key)` gives the elements of a part, `twitches(key)`
// whether it moves when it fires, `reached(key, link)` hears each part as it fires and each leg
// as it starts.
export function createSignalPlayer(svg, schedule, {marks, twitches, reached}) {
  const document = svg.ownerDocument, overlay = document.createElementNS(NS, 'g');
  overlay.setAttribute('class', 'aid-pulse-overlay');
  const dots = schedule.legs.map(leg => {
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('class', 'aid-signal-particle');
    dot.setAttribute('r', String(SIGNAL.radius[0] +
                                 (SIGNAL.radius[1] - SIGNAL.radius[0]) * (leg.link.strength ?? 1)));
    dot.setAttribute('opacity', '0');
    overlay.appendChild(dot);
    return {leg, dot, state : 'waiting'};
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
    for (const part of parts)
      for (const element of marks(part.key))
        element.classList.remove('aid-pulse-active', 'aid-pulse-twitch');
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
          element.classList.add('aid-pulse-active', 'aid-pulse-fired',
                                ...(twitches(part.key) ? [ 'aid-pulse-twitch' ] : []));
      } else if (part.state === 'firing' && elapsed >= part.time + SIGNAL.glow) {
        part.state = 'done';
        for (const element of marks(part.key))
          element.classList.remove('aid-pulse-active', 'aid-pulse-twitch');
      }
    }
    for (const item of dots) {
      const {leg, dot} = item;
      if (item.state === 'waiting' && elapsed >= leg.start) {
        item.state = 'running';
        colour(dot, leg.link.kind);
        reached(null, leg.link);
      }
      if (item.state === 'running') {
        const share = (elapsed - leg.start) / (leg.end - leg.start);
        const at = signalPoint(leg.link.points, Math.min(1, share));
        dot.setAttribute('cx', String(at.x));
        dot.setAttribute('cy', String(at.y));
        if (share < 1)
          dot.setAttribute('opacity', '1');
        else {
          // A signal that reaches a part that stays quiet fades there in grey.
          if (!leg.fires)
            colour(dot, 'fade');
          const fade = (elapsed - leg.end) / SIGNAL.fade;
          dot.setAttribute('opacity', String(Math.max(0, 1 - fade)));
          if (fade >= 1)
            item.state = 'done';
        }
      }
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
    stop
  };
}
