// Views of the fish thoughts (ui/mind.js): a list (the full log in the nervous system tab, the
// latest few in the fish tab) and speech bubbles in the tank.
import {worldToScreen} from './camera.js';
import {ctx} from './dom.js';
import {fishBodyRadius} from './fish_fins.js';
import {mindState, thoughtLog} from './mind.js';
import {FISH} from './schema.js';
import {t, textArea} from './strings.js';
export const thought_viewState = {};

// Re-rendered only when a thought arrived or another fish is shown. Options: limit, and for the
// nervous system the station colours, names and a focus action for a clicked thought.
export function renderThoughtList(list, id, {limit = 3, color, name, focus} = {}) {
  if (!list)
    return;
  const key = id + ':' + mindState.version + ':' + limit;
  if (list.thoughtKey === key)
    return;
  list.thoughtKey = key;
  list.replaceChildren(...thoughtLog(id).slice(0, limit).map(entry => {
    const item = document.createElement('li'), time = document.createElement('time'),
          body = document.createElement('span');
    time.textContent = new Date(entry.time).toLocaleTimeString(t('units.locale'), {
      hour : '2-digit',
      minute : '2-digit',
      second : '2-digit'
    });
    body.textContent = entry.icon + ' ' + entry.text;
    item.append(time, body);
    const stations = color ? entry.stations.filter(s => color(s)) : [];
    if (stations.length) {
      const tags = document.createElement('span');
      tags.className = 'nerve-tags';
      for (const s of stations) {
        const dot = document.createElement('i');
        dot.style.background = color(s);
        dot.title = name?.(s) || '';
        tags.append(dot);
      }
      item.append(tags);
      item.style.setProperty('--thought', color(stations[0]));
    }
    if (focus) {
      item.title = t('thought_view.focusHint');
      item.onclick = () => focus(new Set(stations));
    }
    return item;
  }));
}

function wrap(text, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? line + ' ' + word : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else
      line = next;
  }
  return line ? [...lines, line ] : lines;
}

const BUBBLE = {
  font : 12,
  line : 15,
  pad : 7,
  width : 210,
  fade : 600
};

// A rounded bubble above the fish with a small tail pointing at it, fading in and out.
export function paintThoughtBubbles(f, c, now = performance.now()) {
  if (!mindState.bubbles.size)
    return;
  const rows = new Map((f.fish || []).map(p => [p[FISH.id], p])),
        life = 1000 * textArea('thoughts', 'de-AT').compose.bubble;
  ctx.save();
  ctx.font = BUBBLE.font + 'px system-ui';
  for (const [id, bubble] of mindState.bubbles) {
    const p = rows.get(id);
    if (!p)
      continue;
    const age = now - bubble.at, alpha = Math.min(1, age / BUBBLE.fade, (life - age) / BUBBLE.fade);
    if (alpha <= 0)
      continue;
    const q = worldToScreen({x : p[FISH.x], y : p[FISH.y]}, c),
          lines = wrap(bubble.icon + ' ' + bubble.text, BUBBLE.width),
          w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 2 * BUBBLE.pad,
          h = lines.length * BUBBLE.line + BUBBLE.pad, x = q.x - w / 2,
          y = q.y - fishBodyRadius(p) * c.scale - 14 - h, r = 7;
    ctx.globalAlpha = alpha * (id === f.selected ? .95 : .82);
    ctx.fillStyle = '#f4f1e6';
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(q.x + 6, y + h);
    ctx.lineTo(q.x, y + h + 8);
    ctx.lineTo(q.x - 4, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1d2b2f';
    lines.forEach((l, k) => ctx.fillText(l, x + BUBBLE.pad,
                                         y + BUBBLE.pad + BUBBLE.font + k * BUBBLE.line - 2));
  }
  ctx.restore();
}
