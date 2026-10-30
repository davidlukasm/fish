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

const BUBBLE = {
  font : 11,
  fade : 500,
  lift : 16
};

// A single short line of text floating above the fish, fading in and out; no box.
export function paintThoughtBubbles(f, c, now = performance.now()) {
  if (!mindState.bubbles.size)
    return;
  const rows = new Map((f.fish || []).map(p => [p[FISH.id], p])),
        life = 1000 * textArea('thoughts', 'de-AT').compose.bubble;
  ctx.save();
  ctx.font = 'italic ' + BUBBLE.font + 'px system-ui';
  for (const [id, bubble] of mindState.bubbles) {
    const p = rows.get(id), age = now - bubble.at,
          alpha = Math.min(1, age / BUBBLE.fade, (life - age) / BUBBLE.fade);
    if (!p || alpha <= 0)
      continue;
    const q = worldToScreen({x : p[FISH.x], y : p[FISH.y]}, c),
          x = q.x - ctx.measureText(bubble.text).width / 2,
          y = q.y - fishBodyRadius(p) * c.scale - BUBBLE.lift;
    ctx.globalAlpha = alpha * (id === f.selected ? .9 : .7);
    ctx.fillStyle = '#e8efe6';
    for (const [dx, dy, r] of [[ 3, 4, 1.2 ], [ 6, 9, 1.8 ]]) {
      ctx.beginPath();
      ctx.arc(q.x + dx, y + dy, r, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(8, 20, 24, .8)';
    ctx.fillText(bubble.text, x + 1, y + 1);
    ctx.fillStyle = '#e8efe6';
    ctx.fillText(bubble.text, x, y);
  }
  ctx.restore();
}
