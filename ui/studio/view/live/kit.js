// Live inspectors: an organ's pictures built once and kept while its inspector is open. The
// inspector's text is set anew after every edit (controller.js, refreshInspector); a live
// inspector leaves a place in that text and is hung into the new place each time, so its
// pictures, what is tried on them and what moves in them outlive the redraw. It reads the document
// and the engine's capabilities, and writes only through the document's operations, as a draft
// while a grip is dragged and as one undo step when it is let go (handles.js, draftDesign,
// settleGraphic).
import {escapeText} from '../markup.js';

const NS = 'http://www.w3.org/2000/svg';
export const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs))
    e.setAttribute(k, v);
  if (parent)
    parent.appendChild(e);
  return e;
};
export const txt = (parent, x, y, words, attrs = {}) => {
  const e = el('text', {x, y, ...attrs}, parent);
  e.textContent = words;
  return e;
};
export const path = pts => 'M' + pts.map(([ x, y ]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L');
// The colours the live pictures share.
export const COLOUR = Object.freeze({
  axis : '#3b6a6c',
  track : '#0f2c34',
  trackEdge : '#2d5059',
  line : '#f4efd8',
  handle : '#f1dda6',
  chosen : '#f1dda6',
  unchosen : '#0d262c',
  body : '#16363e',
  icon : '#e9e2c6',
  muscle : '#9a6a48',
  edge : '#e6b47c',
  chipEdge : '#5d8384',
  chipSign : '#d7e6e3',
  remove : '#e8a2b5',
  tired : '#eaa886',
  water : '#9cc8f0',
  sand : '#c9b48c',
  ending : '#7f9a99'
});

// The place a live inspector takes in the inspector's text.
export const livePlace = (kind, organ) => '<div class="aid-live" data-live="' + kind +
                                          '" data-live-organ="' + escapeText(organ.id) + '"></div>';

const KINDS = new Map(), open = new Map();
// make(studio, organId) returns {root, show(state), tick(dt)}: its element, a repaint from the
// present state, and what moves.
export const liveKind = (kind, make) => KINDS.set(kind, make);

let last = 0, running = 0;
function frame(now) {
  running = 0;
  const dt = last ? Math.min(50, now - last) : 16;
  last = now;
  let seen = false;
  for (const [key, live] of open) {
    if (!live.root.isConnected) {
      open.delete(key);
      continue;
    }
    seen = true;
    live.tick(dt);
  }
  if (seen)
    running = requestAnimationFrame(frame);
  else
    last = 0;
}
// Hangs every live inspector into its place under `root` and repaints it from the state.
export function mountLive(root, studio) {
  for (const host of root.querySelectorAll('[data-live]')) {
    const key = host.dataset.live + ':' + host.dataset.liveOrgan, make = KINDS.get(host.dataset.live);
    if (!make)
      continue;
    let live = open.get(key);
    if (!live)
      open.set(key, live = make(studio, host.dataset.liveOrgan));
    if (live.root.parentNode !== host)
      host.replaceChildren(live.root);
    live.show(studio.state);
  }
  running ||= requestAnimationFrame(frame);
}

// A picture: what never changes (built once) between a layer under it and one over it; only those
// two are repainted. Its height is fixed, so nothing under it moves.
export function picture(svg, height, build) {
  if (!svg.firstChild) {
    svg.setAttribute('viewBox', `0 0 300 ${height}`);
    const under = el('g', {}, svg), fixed = el('g', {}, svg);
    el('g', {}, svg);
    build?.(fixed, svg, under);
  }
  const [under, , live] = svg.children;
  under.replaceChildren();
  live.replaceChildren();
  return {svg, under, live};
}

// Two kinds of things are dragged, and they look different: a grip sets the organ, a knob shapes
// an input tried on it. `move` gets the pointer in the picture's own units; `done` runs when it is
// let go. The pointer is followed on the window, so a redraw of the inspector cannot lose it.
let held = null;
export const heldGrip = () => held;
export function drag(svg, thing, move, name, kind = 'grip', done = null) {
  thing.classList.add(kind === 'knob' ? 'aid-live-knob' : 'aid-live-grip');
  if (held?.svg === svg && held.name === name)
    thing.classList.add('dragging');
  thing.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    held = {svg, name};
    thing.classList.add('dragging');
    const at = ev => {
      const p = svg.createSVGPoint();
      p.x = ev.clientX;
      p.y = ev.clientY;
      return p.matrixTransform(svg.getScreenCTM().inverse());
    };
    const onMove = ev => move(at(ev));
    const up = () => {
      held = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      done?.();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
}
// A round button.
export function chip(parent, x, y, sign, act, enabled = true, r = 7) {
  const g = el('g', {class : 'aid-live-chip', opacity : enabled ? 1 : .3}, parent), d = r * .45,
        red = sign === '×';
  el('circle', {
    cx : x,
    cy : y,
    r,
    style : `fill:${COLOUR.track};stroke:${red ? COLOUR.remove : COLOUR.chipEdge};stroke-width:1.4`
  },
     g);
  el('path', {
    d : red ? `M${x - d * .8} ${y - d * .8} l${1.6 * d} ${1.6 * d} m0 ${- 1.6 * d} l${- 1.6 * d} ${1.6 * d}`
            : `M${x - d} ${y} h${2 * d}` + (sign === '+' ? ` M${x} ${y - d} v${2 * d}` : ''),
    stroke : red ? COLOUR.remove : COLOUR.chipSign,
    'stroke-width' : 1.5,
    fill : 'none'
  },
     g);
  if (enabled)
    g.addEventListener('click', e => {
      e.stopPropagation();
      act();
    });
}
// A fish seen from the side, for the ages: small for the hatchling, large for the grown fish.
export function fishIcon(parent, x, cy, s, colour) {
  const w = 12 * s, t = 5.5 * s;
  el('path', {
    d : `M${x - w} ${cy} Q${x - w / 3} ${cy - t * 1.7} ${x + w} ${cy} Q${x - w / 3} ${cy + t * 1.7} ${x - w} ${cy} Z M${x + w - s} ${cy} l${8 * s} ${- 6 * s} l${- 2.5 * s} ${6 * s} l${2.5 * s} ${6 * s} Z`,
    fill : colour
  },
     parent);
  el('circle', {cx : x - w * .55, cy : cy - t * .25, r : Math.max(.7, 1.1 * s), fill : COLOUR.track},
     parent);
}
