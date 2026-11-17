// Live inspectors: an organ's pictures built once and kept while its inspector is open. The
// inspector's text is set anew after every edit (controller.js, refreshInspector); a live
// inspector leaves a place in that text and is hung into the new place each time, so its
// pictures, what is tried on them and what moves in them outlive the redraw. It reads the document
// and the engine's capabilities, and writes only through the document's operations, as a draft
// while a grip is dragged and as one undo step when it is let go (handles.js, draftDesign,
// settleGraphic).
import {escapeText} from '../markup.js';
import {percent} from '../../../strings.js';

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
// A grip is drawn this large, edge or diameter, in every picture: nothing to grab is smaller.
// Square sets the plan, round is what comes from outside.
export const GRIP = 22;
export const squareGrip = (parent, x, y, attrs = {}) => el(
    'rect', {x : x - GRIP / 2, y : y - GRIP / 2, width : GRIP, height : GRIP, rx : 5, ...attrs},
    parent);
export const roundGrip = (parent, x, y, attrs = {}) =>
    el('circle', {cx : x, cy : y, r : GRIP / 2, ...attrs}, parent);
export const path = pts => 'M' + pts.map(([ x, y ]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L');
// The place a live inspector takes in the inspector's text.
export const livePlace = (kind, organ) => '<div class="aid-live" data-live="' + kind +
                                          '" data-live-organ="' + escapeText(organ.id) + '"></div>';

const KINDS = new Map(), open = new Map();
// Only diagrams that animate supply tick(dt).
export const liveKind = (kind, make) => KINDS.set(kind, make);

let last = 0, running = 0;
const animated = new WeakMap();
const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
  for (const entry of entries) {
    const live = animated.get(entry.target);
    if (live)
      live.visible = entry.isIntersecting;
  }
  startFrames();
})
                                                            : null;

function discardClosed() {
  for (const [key, live] of open) {
    if (!live.root.isConnected) {
      observer?.unobserve(live.root);
      open.delete(key);
    }
  }
}

function startFrames() {
  if (!running && Array.from(open.values()).some(live => live.tick && live.visible))
    running = requestAnimationFrame(frame);
  if (!running)
    last = 0;
}

function frame(now) {
  running = 0;
  const dt = last ? Math.min(50, now - last) : 16;
  last = now;
  discardClosed();
  for (const live of open.values())
    if (live.visible)
      live.tick?.(dt);
  startFrames();
}
// Hangs every live inspector into its place under `root` and repaints it from the state.
export function mountLive(root, studio) {
  for (const host of root.querySelectorAll('[data-live]')) {
    const key = host.dataset.live + ':' + host.dataset.liveOrgan, make = KINDS.get(host.dataset.live);
    if (!make)
      continue;
    let live = open.get(key);
    if (!live) {
      open.set(key, live = make(studio, host.dataset.liveOrgan));
      live.visible = !observer;
      if (live.tick && observer) {
        animated.set(live.root, live);
        observer.observe(live.root);
      }
    }
    if (live.root.parentNode !== host)
      host.replaceChildren(live.root);
    live.show(studio.state);
  }
  discardClosed();
  startFrames();
}

// A picture: what never changes (built once) between a layer under it and one over it; only those
// two are repainted. Its height is fixed, so nothing under it moves.
// `stamp`: what the fixed part hangs on; when it changes, the picture is built anew.
export function picture(svg, height, build, stamp = '') {
  if (svg.firstChild && svg.dataset.stamp !== String(stamp))
    svg.replaceChildren();
  if (!svg.firstChild) {
    svg.dataset.stamp = String(stamp);
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

// Their colours are in studio.css (.aid-live-*); only a muscle's fibre colour is set in the code.
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
    // `move` gets where the pointer is and where it came down.
    const from = at(e), onMove = ev => move(at(ev), from);
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
  const red = sign === '×', d = r * .45,
        g = el('g', {class : red ? 'aid-live-chip remove' : 'aid-live-chip', opacity : enabled ? 1 : .3}, parent);
  el('circle', {cx : x, cy : y, r}, g);
  el('path', {
    d : red ? `M${x - d * .8} ${y - d * .8} l${1.6 * d} ${1.6 * d} m0 ${- 1.6 * d} l${- 1.6 * d} ${1.6 * d}`
            : `M${x - d} ${y} h${2 * d}` + (sign === '+' ? ` M${x} ${y - d} v${2 * d}` : ''),
  },
     g);
  if (enabled)
    g.addEventListener('click', e => {
      e.stopPropagation();
      act();
    });
}
// A fish seen from the side, for the ages: small for the hatchling, large for the grown fish.
export function fishIcon(parent, x, cy, s) {
  const w = 12 * s, t = 5.5 * s;
  el('path', {
    d : `M${x - w} ${cy} Q${x - w / 3} ${cy - t * 1.7} ${x + w} ${cy} Q${x - w / 3} ${cy + t * 1.7} ${x - w} ${cy} Z M${x + w - s} ${cy} l${8 * s} ${- 6 * s} l${- 2.5 * s} ${6 * s} l${2.5 * s} ${6 * s} Z`,
    class : 'aid-live-eye'
  },
     parent);
  el('circle', {cx : x - w * .55, cy : cy - t * .25, r : Math.max(.7, 1.1 * s), class : 'aid-live-pupil'}, parent);
}
// The maturity at which this plan's fish hatches at the earliest (the plan report's
// hatchMaturity: more energy in the egg makes it later, and the mother is not in the Atelier).
// Until the report is in, the middle.
export const hatchOf = studio => clamp(studio.state.anatomy?.hatchMaturity ?? .5);
// A picture of its own at the end of a live inspector's root.
export function addPicture(root) {
  const svg = el('svg', {class : 'aid-live-picture'});
  root.appendChild(svg);
  return svg;
}
// What cells report, with the sign the fish panel has for it (probes.js, answerSvg): a bubble with
// the share in it, the brighter the more they report. Returns how to place and fill it.
export function reportBubble(parent, r = 12) {
  const g = el('g', {class : 'aid-probe-answer', 'pointer-events' : 'none'}, parent);
  el('circle', {r}, g);
  const words = txt(g, 0, 4, '', {'text-anchor' : 'middle'});
  return (x, y, share) => {
    const now = clamp(share);
    g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    g.style.setProperty('--lit', now.toFixed(2));
    words.textContent = percent(now);
  };
}
