// Phones in portrait get their own interface, built only from the data models (population,
// fish profile, thoughts, species) and not from the desktop panels: the water fills the screen,
// and a deck of three cards lies at the bottom: Becken, Fisch, Arten. Swipe sideways between
// them, tap a card's head to raise or lower the deck.
import {camera, cameraState, canvasPoint, resizeAquarium, screenToWorld} from './camera.js';
import {canvas, el} from './dom.js';
import {zoomToSpecimen} from './evolution.js';
import {fishProfile} from './fish_profile.js';
import {thoughtBubbles, thoughtLog} from './mind.js';
import {populationOverview} from './population_model.js';
import {FISH} from './schema.js';
import {fishName} from './selection.js';
import {frameFish, frameSpecies, horizontalDelta, sceneState, selectFish} from './state.js';
import {formatNumber, t} from './strings.js';
export const mobileState = {
  raised : false,
  card : 0
};

// Any phone or tablet held upright, and any narrow upright window, gets the mobile interface.
const QUERY = '(orientation: portrait) and ((max-width: 900px) or (pointer: coarse))';
const REFRESH = 400, MAX_ZOOM = 2048, SPECIES_SHOWN = 30;
const on = () => document.body.classList.contains('mobile');
const CARDS = [ 'tank', 'fish', 'species' ];

function make(tag, className = '', text = '') {
  const e = document.createElement(tag);
  if (className)
    e.className = className;
  if (text)
    e.textContent = text;
  return e;
}
const button = (className, text, label, action) => {
  const b = make('button', className, text);
  b.type = 'button';
  if (label)
    b.setAttribute('aria-label', label);
  b.onclick = e => {
    e.stopPropagation();
    action();
    navigator.vibrate?.(8);
  };
  return b;
};

// Zoom at which the world's height fills the screen (the desktop fits the whole world).
function fillZoom() {
  const f = sceneState.frame;
  if (!f?.width || !cameraState.viewportWidth)
    return 1;
  const fit = Math.min(cameraState.viewportWidth / f.width, cameraState.viewportHeight / f.height);
  return Math.max(1, cameraState.viewportHeight / f.height / fit);
}

// Two fingers zoom around their midpoint; one finger keeps the tank's own behaviour (a tap
// chooses a fish, a drag pans). Pinch events stop before the tank's handlers see them.
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

function raise(up = !mobileState.raised) {
  mobileState.raised = up;
  document.body.classList.toggle('deck-up', up);
}

function show(index) {
  mobileState.card = index;
  const deck = mobileState.deck;
  deck.scrollTo({left : index * deck.clientWidth, behavior : 'smooth'});
}

// ------------------------------------------------------------------- the three cards
function card(key) {
  const c = make('article', 'deck-card deck-' + key), head = make('div', 'deck-head'),
        title = make('h2', '', t('mobile.cards.' + key)), line = make('p', 'deck-line'),
        body = make('div', 'deck-body');
  head.append(title, line);
  head.onclick = () => raise();
  c.append(head, body);
  return {c, line, body};
}

function stat(label, value, note = '') {
  const s = make('div', 'deck-stat');
  s.append(make('b', '', String(value)), make('span', '', label));
  if (note)
    s.title = note;
  return s;
}

function renderTank(f, view) {
  const o = populationOverview(f), fish = f.fish.filter(p => p[FISH.hatched]).length,
        species = (f.species || []).filter(s => s?.alive).length;
  let newest = null;
  for (const bubble of thoughtBubbles().values())
    if (!newest || bubble.at > newest.at)
      newest = bubble;
  view.line.textContent = newest && performance.now() - newest.at < 8000
                              ? '💭 ' + newest.text
                              : t('mobile.tankLine', {fish, step : formatNumber(f.step)});
  const key = [ fish, species, f.step, o.ratio, o.generation, o.success, f.paused ].join();
  if (view.key === key)
    return;
  view.key = key;
  const grid = make('div', 'deck-grid');
  grid.append(
      stat(t('mobile.fish'), fish), stat(t('mobile.species'), species),
      stat(t('mobile.step'), formatNumber(f.step)),
      stat(t('mobile.replacement'), o.ratio === null ? '–' : formatNumber(o.ratio, 2, true)),
      stat(t('mobile.generation'), o.generation), stat(t('mobile.selfSustaining'), o.success));
  const actions = make('div', 'deck-actions');
  actions.append(
      button('deck-action', f.paused ? '▶  ' + t('mobile.play') : '❚❚  ' + t('mobile.pause'), '',
             () => el('pause').click()),
      button('deck-action', '✦  ' + t('mobile.feed'), '', () => el('quick-feed').click()),
      button('deck-action deck-primary', '✚  ' + t('mobile.newRun'), '',
             () => el('open-new-run').click()));
  view.body.replaceChildren(grid, actions);
}

function renderFish(f, view) {
  const p = frameFish(f);
  if (!p) {
    view.line.textContent = t('mobile.noFish');
    if (view.key !== 'none') {
      view.key = 'none';
      view.body.replaceChildren(make('p', 'deck-hint', t('mobile.chooseHint')));
    }
    return;
  }
  const id = p[FISH.id], thoughts = thoughtLog(id).slice(0, 4),
        name = fishName(id) || t('mobile.fishNumber', {id}),
        species = frameSpecies(f, p[FISH.species])?.name || '';
  view.line.textContent = thoughts[0] ? '💭 ' + thoughts[0].text : name + ' · ' + species;
  const profile = fishProfile(f, p, f.brain, f.traits?.find(x => x.id === id)),
        key = [ id, f.step, thoughts.length && thoughts[0].time, cameraState.following ].join();
  if (view.key === key)
    return;
  view.key = key;
  const top = make('div', 'deck-fish-top');
  top.append(make('strong', '', name), make('span', '', species),
             button('deck-round', cameraState.following ? '◉' : '◎', t('mobile.follow'),
                    () => el('follow').click()),
             button('deck-round', '✕', t('mobile.release'), () => selectFish(0)));
  const list = make('ol', 'deck-thoughts');
  for (const thought of thoughts)
    list.append(make('li', '', thought.text));
  const grid = make('div', 'deck-grid');
  for (const s of profile.stats)
    grid.append(stat(s.label, s.value, s.note));
  view.body.replaceChildren(top, list, grid);
}

function renderSpecies(f, view) {
  const living =
      (f.species || []).filter(s => s?.alive).sort((a, b) => (b.adults || 0) - (a.adults || 0));
  view.line.textContent = t('mobile.speciesLine', {n : living.length});
  const key = living.map(s => s.id + ':' + s.adults).join();
  if (view.key === key)
    return;
  view.key = key;
  const most = Math.max(1, ...living.map(s => s.adults || 0)), list = make('ul', 'deck-species');
  for (const s of living.slice(0, SPECIES_SHOWN)) {
    const row = make('li'), bar = make('i');
    bar.style.width = 100 * (s.adults || 0) / most + '%';
    row.append(make('strong', '', s.name),
               make('span', '', t('mobile.adults', {n : s.adults || 0})), bar);
    if (s.typical_fish)
      row.onclick = () => {
        zoomToSpecimen(s.typical_fish);
        show(1);
      };
    list.append(row);
  }
  view.body.replaceChildren(list);
}

function refresh() {
  const f = sceneState.frame;
  if (on() && f) {
    if (cameraState.zoom === 1 && !cameraState.following && fillZoom() > 1)
      cameraState.zoom = fillZoom();
    renderTank(f, mobileState.views.tank);
    renderFish(f, mobileState.views.fish);
    renderSpecies(f, mobileState.views.species);
    // A fish the visitor taps in the water is followed and its card comes forward.
    const id = f.selected || 0;
    if (mobileState.chosen !== undefined && id && id !== mobileState.chosen) {
      if (!cameraState.following && !el('follow').disabled)
        el('follow').click();
      show(1);
    }
    mobileState.chosen = id;
  }
  setTimeout(refresh, REFRESH);
}

function build() {
  const deck = make('section', 'deck'), dots = make('div', 'deck-dots');
  mobileState.views = {};
  CARDS.forEach((key, i) => {
    const view = card(key);
    mobileState.views[key] = view;
    deck.append(view.c);
    dots.append(button('deck-dot', '', t('mobile.cards.' + key), () => show(i)));
  });
  deck.addEventListener('scroll', () => {
    const i = Math.round(deck.scrollLeft / Math.max(1, deck.clientWidth));
    if (i !== mobileState.card)
      navigator.vibrate?.(4);
    mobileState.card = i;
    [...dots.children].forEach((d, k) => d.classList.toggle('active', k === i));
  }, {passive : true});
  dots.children[0].classList.add('active');
  const shell = make('div', 'deck-shell');
  shell.append(dots, deck);
  document.body.append(shell);
  mobileState.deck = deck;
}

function apply(active) {
  document.body.classList.toggle('mobile', active);
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
  build();
  bindPinch();
  const decide = () => apply(forced === '1' || (forced !== '0' && media.matches));
  media.addEventListener?.('change', decide);
  decide();
  refresh();
}
