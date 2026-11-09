const NS = 'http://www.w3.org/2000/svg';
const colour = leg => leg.kind === 'hormone'    ? '#d4b7ee'
                      : leg.kind === 'teaching' ? '#e2c487'
                      : leg.sign < 0            ? '#f0adbd'
                                                : '#e3efad';
export function createPlanPlayer(svg, trace, {marks, point, reached}) {
  const levels = Math.max(1, ...trace.parts.map(part => part.level)) + 1;
  const interval = Math.min(420, 8000 / levels), linger = 800;
  let overlay, paths = [], parts = [], handle = null, started = null, active = false;
  const shown = new Set();
  const attach = next => {
    overlay?.remove();
    svg = next;
    overlay = svg.ownerDocument.createElementNS(NS, 'g');
    overlay.setAttribute('class', 'aid-plan-pulses');
    overlay.setAttribute('pointer-events', 'none');
    const routes = new Map(), joined = new Map();
    for (const element of svg.querySelectorAll('[data-signal-edges]')) {
      const path = element.matches('path') ? element : element.querySelector('.aid-wire-ink');
      if (!path)
        continue;
      for (const pair of element.getAttribute('data-signal-edges').split(' ')) {
        if (!routes.has(pair))
          routes.set(pair, new Set());
        routes.get(pair).add(path);
      }
    }
    paths = [];
    for (const leg of trace.legs) {
      const pair = leg.from + '>' + leg.to;
      let found = routes.get(pair);
      if (!found) {
        const from = point(leg.from), to = point(leg.to);
        if (!from || !to)
          continue;
        const path = svg.ownerDocument.createElementNS(NS, 'path');
        path.setAttribute('d', 'M' + from.x + ' ' + from.y + ' L' + to.x + ' ' + to.y);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', colour(leg));
        path.setAttribute('stroke-opacity', leg.kind === 'electrical' ? '.15' : '.45');
        path.setAttribute('stroke-dasharray', '4 5');
        overlay.appendChild(path);
        found = new Set([ path ]);
        routes.set(pair, found);
      }
      for (const path of found) {
        if (!joined.has(path))
          joined.set(path, new Set());
        const key = leg.kind + ':' + leg.sign + ':' + leg.level;
        if (joined.get(path).has(key))
          continue;
        joined.get(path).add(key);
        const dot = svg.ownerDocument.createElementNS(NS, 'circle');
        dot.setAttribute('r', '5');
        dot.setAttribute('fill', colour(leg));
        dot.setAttribute('opacity', '0');
        overlay.appendChild(dot);
        paths.push({leg, path, dot});
      }
    }
    svg.appendChild(overlay);
    for (const entry of paths)
      entry.length = entry.path.getTotalLength();
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
      const {part, cls, elements} = item, key = part.id + ':' + part.kind + ':' + part.sign;
      if (elapsed >= part.level * interval && !shown.has(key)) {
        shown.add(key);
        reached(part);
      }
      const on = elapsed >= part.level * interval && elapsed < part.level * interval + linger;
      if (item.on !== on) {
        item.on = on;
        for (const element of elements)
          element.classList.toggle(cls, on);
      }
    }
    for (const {leg, path, dot, length} of paths) {
      const fraction = elapsed / interval - leg.level;
      dot.setAttribute('opacity', fraction >= 0 && fraction < 1 ? '1' : '0');
      if (fraction >= 0 && fraction < 1) {
        const at = path.getPointAtLength(fraction * length);
        dot.setAttribute('cx', String(at.x));
        dot.setAttribute('cy', String(at.y));
      }
    }
    if (elapsed < levels * interval + linger)
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
      if (active)
        attach(next);
    },
    stop
  };
}
