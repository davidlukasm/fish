// Phones in portrait: the aquarium is the whole screen. The water fills the height and pans
// sideways, two fingers zoom, a tapped fish is followed close up. The interface is a single
// glass pill that fades while nobody touches the screen and shows what the fish are thinking;
// a fish card names the chosen fish; every desktop panel opens as one layer above the water.
// Only arrangement: each action presses the desktop control, so no logic exists twice.
import {camera, cameraState, canvasPoint, resizeAquarium, screenToWorld} from './camera.js';
import {canvas, el} from './dom.js';
import {thoughtBubbles, thoughtLog} from './mind.js';
import {FISH} from './schema.js';
import {fishName} from './selection.js';
import {frameFish, frameSpecies, horizontalDelta, sceneState} from './state.js';
import {formatNumber, t} from './strings.js';
export const mobileState = {};

const QUERY = '(max-width: 760px) and (orientation: portrait)';
const CALM_AFTER = 4000, REFRESH = 250, MAX_ZOOM = 2048, CLOSE_DRAG = 90;
const on = () => document.body.classList.contains('mobile');

function node(tag, className, attributes = {}) {
  const e = document.createElement(tag);
  e.className = className;
  for (const [name, value] of Object.entries(attributes))
    e.setAttribute(name, value);
  return e;
}

// Zoom at which the world's height fills the screen (the desktop fits the whole world).
function fillZoom() {
  const f = sceneState.frame;
  if (!f?.width || !cameraState.viewportWidth)
    return 1;
  const fit = Math.min(cameraState.viewportWidth / f.width, cameraState.viewportHeight / f.height);
  return Math.max(1, cameraState.viewportHeight / f.height / fit);
}

// Two fingers zoom around their midpoint; one finger keeps the tank's own behaviour (a tap
// chooses, a drag pans). Pinch events stop before the tank's handlers see them.
function bindPinch() {
  const touches = new Map();
  let pinch = null;
  const spread = () => {
    const [a, b] = [...touches.values() ];
    return {d : Math.hypot(a.x - b.x, a.y - b.y), x : (a.x + b.x) / 2, y : (a.y + b.y) / 2};
  };
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || !on())
      return;
    touches.set(e.pointerId, {x : e.clientX, y : e.clientY});
    if (touches.size === 2) {
      cameraState.drag = null;
      pinch = {...spread(), zoom : cameraState.zoom};
      e.stopImmediatePropagation();
    }
  }, {capture : true});
  canvas.addEventListener('pointermove', e => {
    if (!touches.has(e.pointerId))
      return;
    touches.set(e.pointerId, {x : e.clientX, y : e.clientY});
    if (!pinch || touches.size < 2 || !sceneState.frame)
      return;
    e.stopImmediatePropagation();
    const now = spread(), at = canvasPoint({clientX : now.x, clientY : now.y}),
          before = screenToWorld(at, camera());
    cameraState.zoom = Math.max(1, Math.min(MAX_ZOOM, pinch.zoom * now.d / Math.max(1, pinch.d)));
    const after = screenToWorld(at, camera());
    cameraState.cameraX += horizontalDelta(before.x - after.x);
    cameraState.cameraY += before.y - after.y;
  }, {capture : true});
  const lift = e => {
    if (!touches.delete(e.pointerId))
      return;
    if (pinch) {
      e.stopImmediatePropagation();
      if (!touches.size)
        pinch = null;
    }
  };
  canvas.addEventListener('pointerup', lift, {capture : true});
  canvas.addEventListener('pointercancel', lift, {capture : true});
}

// The interface rests while the water is only watched; any touch wakes it.
function wake() {
  document.body.classList.remove('calm');
  clearTimeout(mobileState.calmTimer);
  mobileState.calmTimer = setTimeout(() => {
    if (!document.body.classList.contains('panels-open'))
      document.body.classList.add('calm');
  }, CALM_AFTER);
}

function openPanels(tab) {
  if (tab)
    el(tab)?.click();
  document.body.classList.add('panels-open');
  document.body.style.setProperty('--head',
                                  (document.querySelector('header').offsetHeight || 0) + 'px');
  navigator.vibrate?.(8);
}

function closePanels() {
  document.body.classList.remove('panels-open');
  wake();
}

function buildPill() {
  const pill = node('nav', 'reef-pill', {'aria-label' : t('mobile.pill')}),
        play = node('button', 'reef-play', {type : 'button'}),
        info = node('button', 'reef-info', {type : 'button', 'aria-label' : t('mobile.panels')}),
        whisper = node('span', 'reef-whisper'), counts = node('span', 'reef-counts'),
        fresh =
            node('button', 'reef-new',
                 {type : 'button', 'aria-label' : t('mobile.newRun'), title : t('mobile.newRun')});
  play.onclick = () => el('pause').click();
  info.onclick = () => openPanels();
  fresh.textContent = '✚';
  fresh.onclick = () => el('open-new-run').click();
  info.append(whisper, counts);
  pill.append(play, info, fresh);
  document.body.append(pill);
  Object.assign(mobileState, {play, whisper, counts});
}

function buildCard() {
  const card = node('section', 'reef-card', {'aria-live' : 'polite'}),
        open = node('button', 'reef-card-open',
                    {type : 'button', 'aria-label' : t('mobile.fishDetails')}),
        name = node('strong', 'reef-card-name'), thought = node('span', 'reef-card-thought'),
        meters = node('span', 'reef-card-meters'),
        close = node('button', 'reef-card-close',
                     {type : 'button', 'aria-label' : t('mobile.release')});
  const meter = kind => {
    const m = node('i', 'reef-meter reef-meter-' + kind), fill = node('b', '');
    m.append(fill);
    meters.append(m);
    return {m, fill};
  };
  mobileState.energy = meter('energy');
  mobileState.health = meter('health');
  open.append(name, thought, meters);
  open.onclick = () => openPanels('tab-fish');
  close.textContent = '✕';
  close.onclick = () => el('deselect').click();
  card.append(open, close);
  document.body.append(card);
  Object.assign(mobileState, {card, name, thought});
}

function buildLayer() {
  const grip =
      node('button', 'reef-grip', {type : 'button', 'aria-label' : t('mobile.backToWater')});
  grip.onclick = closePanels;
  let start = null;
  grip.addEventListener('pointerdown', e => start = e.clientY);
  grip.addEventListener('pointerup', e => {
    if (start !== null && e.clientY - start > CLOSE_DRAG)
      closePanels();
    start = null;
  });
  el('cockpit').prepend(grip);
}

// Four times a second: what the pill and the card show.
function refresh() {
  const f = sceneState.frame;
  if (on() && f) {
    if (cameraState.zoom === 1 && !cameraState.following && fillZoom() > 1)
      cameraState.zoom = fillZoom();
    mobileState.play.textContent = f.paused ? '▶' : '❚❚';
    mobileState.play.setAttribute('aria-label', f.paused ? t('mobile.play') : t('mobile.pause'));
    const fish = f.fish.filter(p => p[FISH.hatched]).length,
          species = (f.species || []).filter(s => s?.alive).length;
    mobileState.counts.textContent =
        t('mobile.counts', {fish, species, step : formatNumber(f.step)});
    // The newest thought in the water drifts through the pill.
    let newest = null;
    for (const bubble of thoughtBubbles().values())
      if (!newest || bubble.at > newest.at)
        newest = bubble;
    mobileState.whisper.textContent =
        newest && performance.now() - newest.at < 6000 ? newest.text : '';
    const p = frameFish(f);
    document.body.classList.toggle('fish-chosen', !!p);
    if (p) {
      const id = p[FISH.id];
      mobileState.name.textContent =
          fishName(id) ||
          t('mobile.fishOf', {id, species : frameSpecies(f, p[FISH.species])?.name || ''});
      mobileState.thought.textContent = thoughtLog(id)[0]?.text || '';
      mobileState.energy.fill.style.width =
          100 * Math.min(1, (p[FISH.energy] || 0) / Math.max(1, p[FISH.reserve_capacity])) + '%';
      mobileState.health.fill.style.width = 100 * Math.min(1, p[FISH.health] ?? 1) + '%';
      // A fish chosen by the visitor (not the one a world starts with) is followed close up.
      if (mobileState.chosen !== undefined && mobileState.chosen !== id && !cameraState.following &&
          !el('follow').disabled)
        el('follow').click();
      mobileState.chosen = id;
    } else
      mobileState.chosen = 0;
  }
  setTimeout(refresh, REFRESH);
}

function apply(active) {
  document.body.classList.toggle('mobile', active);
  if (!active)
    document.body.classList.remove('panels-open', 'calm');
  requestAnimationFrame(() => {
    resizeAquarium();
    window.dispatchEvent(new Event('resize'));
  });
}

export function initMobile() {
  // ?mobile=1 or ?mobile=0 overrides the screen query; without a browser window nothing happens.
  const forced = new URLSearchParams(globalThis.location?.search || '').get('mobile'),
        media = globalThis.matchMedia?.(QUERY);
  if (!media)
    return;
  buildPill();
  buildCard();
  buildLayer();
  bindPinch();
  for (const type of ['pointerdown', 'keydown'])
    window.addEventListener(type, wake, {capture : true, passive : true});
  const decide = () => apply(forced === '1' || (forced !== '0' && media.matches));
  media.addEventListener?.('change', decide);
  decide();
  wake();
  refresh();
}
