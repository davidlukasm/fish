// Views of the fish thoughts (ui/mind.js): a list (the full log in the nervous system tab, the
// latest few in the fish tab) and speech bubbles in the tank.
import {SECOND_MS} from './units.js';
import {cameraState} from './camera.js';
import {ctx} from './dom.js';
import {fishBodyRadius} from './fish_fins.js';
import {mindState, thoughtLog} from './mind.js';
import {FISH} from './schema.js';
import {blendFish, frameFish, wrapScreenX} from './state.js';
import {t, voiceArea} from './strings.js';
export const thought_viewState = {};
// A thought list shows THOUGHTS_LISTED thoughts unless told otherwise.
const THOUGHTS_LISTED = 3;

// Re-rendered only when a thought arrived or another fish is shown. Options: limit, and for the
// nervous system the station colours, names and a focus action for a clicked thought.
export function renderThoughtList(list, id, {limit = THOUGHTS_LISTED, color, name, focus} = {}) {
  if (!list)
    return;
  // Only new thoughts of this fish redraw the list; other fishes' thoughts leave it alone.
  const entries = thoughtLog(id).slice(0, limit),
        key = id + ':' + limit + ':' + entries.map(entry => entry.time + entry.text).join('|');
  if (list.thoughtKey === key)
    return;
  list.thoughtKey = key;
  list.replaceChildren(...entries.map(entry => {
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

// Bubbles: FONT pixels, fading over FADE ms, LIFT above the fish; the selected fish's at
// SELECTED opacity, others at OTHER; INK on a SHADOW one pixel below right, with thought dots
// [dx, dy, r] towards the fish.
const BUBBLE = Object.freeze({
  font : 11,
  fade : 500,
  lift : 16,
  selected : .9,
  other : .7,
  ink : '#e8efe6',
  shadow : 'rgba(8, 20, 24, .8)',
  dots : Object.freeze([ [ 3, 4, 1.2 ], [ 6, 9, 1.8 ] ])
});

// A single short line of text floating above the fish, fading in and out; no box. It rides on
// the fish as drawn: the same interpolated pose and the same wrap-around copies of the tank.
export function paintThoughtBubbles(f, c, blend, shifts, now = performance.now()) {
  if (!mindState.bubbles.size)
    return;
  const life = SECOND_MS * voiceArea('thoughts').compose.bubble;
  ctx.save();
  ctx.font = 'italic ' + BUBBLE.font + 'px system-ui';
  for (const [id, bubble] of mindState.bubbles) {
    const raw = frameFish(f, id), age = now - bubble.at,
          alpha = Math.min(1, age / BUBBLE.fade, (life - age) / BUBBLE.fade);
    if (!raw || alpha <= 0)
      continue;
    const p = blendFish(raw, blend), width = ctx.measureText(bubble.text).width,
          y = p[FISH.y] * c.scale + c.oy - fishBodyRadius(p) * c.scale - BUBBLE.lift;
    if (y < 0 || y - BUBBLE.font > cameraState.viewportHeight)
      continue;
    ctx.globalAlpha = alpha * (id === f.selected ? BUBBLE.selected : BUBBLE.other);
    for (const shift of shifts) {
      const center = (wrapScreenX(p[FISH.x]) + shift) * c.scale + c.ox, x = center - width / 2;
      if (x + width < 0 || x > cameraState.viewportWidth)
        continue;
      ctx.fillStyle = BUBBLE.ink;
      for (const [dx, dy, r] of BUBBLE.dots) {
        ctx.beginPath();
        ctx.arc(center + dx, y + dy, r, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.fillStyle = BUBBLE.shadow;
      ctx.fillText(bubble.text, x + 1, y + 1);
      ctx.fillStyle = BUBBLE.ink;
      ctx.fillText(bubble.text, x, y);
    }
  }
  ctx.restore();
}
