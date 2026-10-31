// Phones in portrait get their own interface, built only from the data models (population,
// fish profile, thoughts, species, events) and not from the desktop panels: the water fills the
// screen, and a deck of four cards lies at the bottom: Becken, Fisch, Arten, Chronik. Swipe
// sideways between them, tap a card's head to raise or lower the deck.
import {
  camera,
  cameraState,
  canvasPoint,
  resizeAquarium,
  screenToWorld,
  setFollowing,
  worldToScreen,
  zoomToSpecimen
} from './camera.js';
import {canvas, el} from './dom.js';
import {fishProfile} from './fish_profile.js';
import {moodFor, thoughtBubbles, thoughtLog} from './mind.js';
import {buildEvents, renderChronicle, updateEvents} from './mobile_events.js';
import {bindPortrait, openPortrait} from './mobile_portrait.js';
import {populationOverview} from './population_model.js';
import {speciesCensus} from './species_model.js';
import {HABITATS, energyBudget, populationHabitat} from './ecosystem_model.js';
import {foodColors} from './feeding_view.js';
import {foodDisplayIndex} from './nutrition_model.js';
import {FISH} from './schema.js';
import {fishName} from './fish_names.js';
import {command, requestTempo, VIEW_TEMPO_RENEW} from './session.js';
import {controllerState, newRunChoice, startNewRun} from './controller.js';
import {openPopulationPicker} from './population_picker.js';
import {
  blendFish,
  frameFish,
  frameSpecies,
  horizontalDelta,
  sceneState,
  selectFish
} from './state.js';
import {formatNumber, t, tList, textArea} from './strings.js';
export const mobileState = {
  raised : false,
  card : 0
};

// Any phone or tablet held upright, and any narrow upright window, gets the mobile interface.
const QUERY = '(orientation: portrait) and ((max-width: 900px) or (pointer: coarse)), ' +
              '(orientation: landscape) and (pointer: coarse) and (max-height: 540px)';
const LANDSCAPE = '(orientation: landscape)';
const REFRESH = 150, MAX_ZOOM = 2048, SPECIES_SHOWN = 30, SWIPE = 36, LONG_PRESS = 450,
      EDGE_MARGIN = 28;
const on = () => document.body.classList.contains('mobile');
const CARDS = [ 'tank', 'fish', 'species', 'events' ];

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

// ------------------------------------------------------------------- touch on the water
// The water has its own touch language: one finger pans, two fingers zoom, a tap picks the
// nearest fish (generously: fingers are wide), a double tap zooms in, and a resting finger slows
// time almost to a standstill, so a fish can be picked out of a swarm.
const TAP_MOVE = 10, TAP_TIME = 320, DOUBLE_TAP = 300, HOLD_AFTER = 260, PICK_RADIUS = 46,
      ZOOM_TIME = 260;

function nearestFish(clientX, clientY) {
  const f = sceneState.frame, c = camera(), q = canvasPoint({clientX, clientY});
  let best = null;
  for (const raw of f?.fish || []) {
    if (!raw[FISH.hatched])
      continue;
    const p = blendFish(raw), s = worldToScreen({x : p[0], y : p[1]}, c),
          reach = PICK_RADIUS + (raw[FISH.radius] || 0) * c.scale,
          d = Math.hypot(s.x - q.x, s.y - q.y);
    if (d <= reach && (!best || d < best.d))
      best = {id : raw[FISH.id], d};
  }
  return best?.id || 0;
}

// Zoom changes glide instead of jumping; the point under the fingers stays put. Without a
// point (while following a fish) the fish itself stays put.
function zoomTo(target, clientX, clientY) {
  const from = cameraState.zoom, start = performance.now(),
        at = clientX === undefined ? null : canvasPoint({clientX, clientY});
  if (at)
    setFollowing(false);
  const step = now => {
    const k = Math.min(1, (now - start) / ZOOM_TIME), ease = 1 - (1 - k) ** 3,
          before = at && screenToWorld(at, camera());
    cameraState.zoom = from + (target - from) * ease;
    if (at) {
      const after = screenToWorld(at, camera());
      cameraState.cameraX += horizontalDelta(before.x - after.x);
      cameraState.cameraY += before.y - after.y;
    }
    if (k < 1)
      requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// A newly chosen fish is followed and brought close; on a phone it would otherwise be a dot.
const FOLLOW_CLOSER = 3;
function approach() {
  setFollowing(true);
  zoomTo(Math.max(cameraState.zoom, fillZoom() * FOLLOW_CLOSER));
}

function bindTouch() {
  const touches = new Map();
  let gesture = null, lastTap = null;
  const spread = () => {
    const [a, b] = [...touches.values() ];
    return {d : Math.hypot(a.x - b.x, a.y - b.y), x : (a.x + b.x) / 2, y : (a.y + b.y) / 2};
  };
  const mine = e => e.pointerType === 'touch' && on();
  canvas.addEventListener('pointerdown', e => {
    if (!mine(e))
      return;
    e.stopImmediatePropagation();
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    touches.set(e.pointerId, {x : e.clientX, y : e.clientY});
    cameraState.drag = null;
    if (touches.size === 1) {
      gesture = {
        kind : 'tap',
        x : e.clientX,
        y : e.clientY,
        at : performance.now(),
        cx : cameraState.cameraX,
        cy : cameraState.cameraY
      };
      gesture.hold = setTimeout(() => {
        if (gesture?.kind === 'tap')
          setHolding(true);
      }, HOLD_AFTER);
    } else if (touches.size === 2) {
      clearTimeout(gesture?.hold);
      setHolding(false);
      setFollowing(false);
      gesture = {kind : 'pinch', ...spread(), zoom : cameraState.zoom};
    }
  }, {capture : true});
  canvas.addEventListener('pointermove', e => {
    if (!mine(e) || !touches.has(e.pointerId))
      return;
    e.stopImmediatePropagation();
    touches.set(e.pointerId, {x : e.clientX, y : e.clientY});
    if (!gesture || !sceneState.frame)
      return;
    if (gesture.kind === 'pinch' && touches.size === 2) {
      const now = spread(), at = canvasPoint({clientX : now.x, clientY : now.y}),
            before = screenToWorld(at, camera());
      cameraState.zoom =
          Math.max(1, Math.min(MAX_ZOOM, gesture.zoom * now.d / Math.max(1, gesture.d)));
      const after = screenToWorld(at, camera());
      cameraState.cameraX += horizontalDelta(before.x - after.x);
      cameraState.cameraY += before.y - after.y;
      return;
    }
    const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
    if (gesture.kind === 'tap' && Math.hypot(dx, dy) > TAP_MOVE) {
      clearTimeout(gesture.hold);
      setHolding(false);
      setFollowing(false);
      gesture.kind = 'pan';
      document.body.classList.add('panning');
    }
    if (gesture.kind === 'pan') {
      const scale = camera().scale;
      cameraState.cameraX = gesture.cx - dx / scale;
      cameraState.cameraY = gesture.cy - dy / scale;
    }
  }, {capture : true});
  const lift = e => {
    if (!mine(e) || !touches.delete(e.pointerId))
      return;
    e.stopImmediatePropagation();
    if (touches.size || !gesture)
      return;
    clearTimeout(gesture.hold);
    document.body.classList.remove('panning');
    const tapped = (gesture.kind === 'tap' && performance.now() - gesture.at < TAP_TIME) ||
                   mobileState.holding;
    setHolding(false);
    if (tapped && e.type === 'pointerup') {
      const now = performance.now();
      if (lastTap && now - lastTap.at < DOUBLE_TAP &&
          Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < PICK_RADIUS) {
        zoomTo(Math.min(MAX_ZOOM, cameraState.zoom * 2), e.clientX, e.clientY);
        lastTap = null;
      } else if (mobileState.feeding) {
        feedAt(e.clientX, e.clientY);
      } else {
        lastTap = {at : now, x : e.clientX, y : e.clientY};
        const id = nearestFish(e.clientX, e.clientY);
        if (id) {
          navigator.vibrate?.(12);
          selectFish(id);
        }
      }
    }
    gesture = null;
  };
  canvas.addEventListener('pointerup', lift, {capture : true});
  canvas.addEventListener('pointercancel', lift, {capture : true});
}

// ------------------------------------------------------------------- tempo follows the eye
// Closer means slower, more strongly than on the desktop, and a resting finger nearly stops
// time (the slowest tempo the simulation takes). The simulation's step delay glides towards the
// wanted value; leaving restores the visitor's own tempo. Any other tempo is a view tempo the
// server lets lapse unless it is renewed.
const HOLD_DELAY = 1000, MAX_DELAY = 900, ZOOM_SLOWING = 1.6, TEMPO_EVERY = 300, TEMPO_GLIDE = .45,
      TEMPO_TOLERANCE = .12, TEMPO_SETTLE = 1500;

function setHolding(value) {
  mobileState.holding = value;
  document.body.classList.toggle('time-held', value);
  if (value)
    navigator.vibrate?.(6);
}

function steerTempo(f) {
  if (f.paused || f.turbo || f.historical)
    return;
  const now = performance.now();
  // At rest the visitor's tempo is the one the simulation runs at, perhaps changed in another
  // window; frames from before the last request may still show the view tempo.
  if (mobileState.baseDelay === undefined ||
      !mobileState.viewTempo && now - (mobileState.tempoAt || 0) > TEMPO_SETTLE &&
          f.delay_ms !== undefined && f.delay_ms !== mobileState.baseDelay) {
    mobileState.baseDelay = mobileState.sentDelay = f.delay_ms ?? 30;
    mobileState.delay = undefined;
  }
  const own = mobileState.baseDelay, base = Math.max(1, own),
        closer = Math.max(1, cameraState.zoom / fillZoom()),
        wanted = mobileState.racing ? 0
                 : mobileState.holding
                     ? HOLD_DELAY
                     : Math.max(base, Math.min(MAX_DELAY, base * closer ** ZOOM_SLOWING)),
        current = mobileState.delay ?? base,
        next = Math.abs(wanted - current) < 4 ? wanted : current + (wanted - current) * TEMPO_GLIDE;
  mobileState.delay = next;
  if (now - (mobileState.tempoAt || 0) < TEMPO_EVERY)
    return;
  const sent = mobileState.sentDelay, value = Math.round(next) === base ? own : Math.round(next),
        renew = value !== own && now - mobileState.tempoAt > VIEW_TEMPO_RENEW;
  if (!renew && (value === sent ||
                 Math.abs(next - sent) / Math.max(sent, 1) < TEMPO_TOLERANCE && next !== wanted))
    return;
  mobileState.tempoAt = now;
  mobileState.sentDelay = value;
  mobileState.viewTempo = value !== own;
  requestTempo(value, own);
}

// Holding the fast-forward button runs the simulation as fast as it can while still drawn;
// letting go glides back to the visitor's tempo.
function bindRace(race) {
  const stop = () => {
    if (!mobileState.racing)
      return;
    mobileState.racing = false;
    race.classList.remove('active');
  };
  race.addEventListener('pointerdown', e => {
    e.preventDefault();
    mobileState.racing = true;
    mobileState.delay = mobileState.tempoAt = 0;
    race.classList.add('active');
    navigator.vibrate?.(8);
    if (sceneState.frame)
      steerTempo(sceneState.frame);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave'])
    race.addEventListener(type, stop);
}

// Feeding mode: every tap on the water drops food exactly there, until the mode is switched off
// or the water rests for a while.
const FEED_IDLE = 8000, FEED_COUNT = 10, FEED_RADIUS = 26;
function setFeeding(value) {
  mobileState.feeding = value;
  mobileState.fedAt = performance.now();
  document.body.classList.toggle('feeding', value);
  if (value) {
    raise(false);
    navigator.vibrate?.(8);
  }
}

function feedAt(clientX, clientY) {
  const p = screenToWorld(canvasPoint({clientX, clientY}), camera()), ring = make('i', 'feed-ring');
  ring.style.left = clientX + 'px';
  ring.style.top = clientY + 'px';
  ring.addEventListener('animationend', () => ring.remove());
  document.body.append(ring);
  mobileState.fedAt = performance.now();
  navigator.vibrate?.(6);
  command('spray', {x : p.x, y : p.y, count : FEED_COUNT, radius : FEED_RADIUS});
}

// A new run in one tap: the seven example classes, the same start as last time, or the full
// choice of start lines in the desktop dialog.
function openRunSheet() {
  const sheet = make('div', 'run-sheet'), panel = make('div', 'run-sheet-panel'),
        close = () => sheet.remove(), start = async choice => {
          close();
          if (await startNewRun(choice))
            raise(false);
        };
  panel.append(make('h2', '', t('mobile.runSheet.title')),
               button('deck-action deck-primary', '▶  ' + t('mobile.runSheet.examples'), '',
                      () => start({...newRunChoice(), population : []})));
  if (controllerState.lastRun)
    panel.append(button('deck-action', '↻  ' + t('mobile.runSheet.again'), '',
                        () => start(controllerState.lastRun)));
  panel.append(button('deck-action', '☰  ' + t('mobile.runSheet.choose'), '', () => {
                 close();
                 openPopulationPicker();
               }), button('deck-action run-sheet-cancel', t('mobile.runSheet.cancel'), '', close));
  sheet.addEventListener('click', e => e.target === sheet && close());
  sheet.append(panel);
  document.body.append(sheet);
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

// ------------------------------------------------------------------------- the cards
function card(key) {
  const c = make('article', 'deck-card deck-' + key), head = make('div', 'deck-head'),
        title = make('h2', '', t('mobile.cards.' + key)), line = make('p', 'deck-line'),
        body = make('div', 'deck-body');
  head.append(title, line);
  // Up opens more (for the fish its portrait), down lowers the deck, a tap toggles it.
  let start = null;
  head.addEventListener('pointerdown', e => start = e.clientY);
  head.addEventListener('pointerup', e => {
    if (start === null)
      return;
    const dy = e.clientY - start;
    start = null;
    if (dy < -SWIPE)
      key === 'fish' && mobileState.raised ? openPortrait() : raise(true);
    else if (dy > SWIPE)
      raise(false);
    else
      raise();
  });
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

// Cards keep their elements; only words and numbers change, so a finger never loses a button
// that was rebuilt under it.
function renderTank(f, view) {
  const o = populationOverview(f), fish = f.fish.filter(p => p[FISH.hatched]).length,
        species = speciesCensus(f).living.length;
  let newest = null;
  for (const bubble of thoughtBubbles().values())
    if (!newest || bubble.at > newest.at)
      newest = bubble;
  view.line.textContent = newest && performance.now() - newest.at < 8000
                              ? '💭 ' + newest.text
                              : t('mobile.tankLine', {fish, step : formatNumber(f.step)});
  if (!view.parts) {
    const grid = make('div', 'deck-grid'), actions = make('div', 'deck-actions'), stats = {};
    for (const key of ['fish', 'species', 'step', 'replacement', 'generation', 'selfSustaining']) {
      stats[key] = stat('', '');
      grid.append(stats[key]);
    }
    const play = button('deck-action', '', '', () => el('pause').click()),
          feed = button('deck-action', '', '', () => setFeeding(!mobileState.feeding)),
          race = make('button', 'deck-action deck-race', '⏩  ' + t('mobile.race'));
    race.type = 'button';
    bindRace(race);
    actions.append(
        play, feed, race,
        button('deck-action deck-primary', '✚  ' + t('mobile.newRun'), '', openRunSheet));
    const energy = make('div', 'deck-energy'), legend = make('div', 'deck-energy-legend'),
          habitat = make('div', 'deck-habitat');
    view.body.replaceChildren(grid, make('h3', 'deck-sub', t('mobile.energy')), energy, legend,
                              make('h3', 'deck-sub', t('mobile.habitat')), habitat, actions);
    view.parts = {stats, play, feed, energy, legend, habitat};
  }
  const values = {
    fish,
    species,
    step : formatNumber(f.step),
    replacement : o.ratio === null ? '–' : formatNumber(o.ratio, 2, true),
    generation : o.generation,
    selfSustaining : o.success
  };
  // Labels follow the number they stand under ("1 Art", "3 Arten").
  for (const [key, value] of Object.entries(values)) {
    view.parts.stats[key].firstChild.textContent = String(value);
    view.parts.stats[key].lastChild.textContent = t('mobile.' + key, {n : value});
  }
  view.parts.play.textContent = f.paused ? '▶  ' + t('mobile.play') : '❚❚  ' + t('mobile.pause');
  renderEnergyStrip(f, view.parts.energy, view.parts.legend);
  renderHabitat(f, view.parts.habitat);
  view.parts.feed.textContent =
      mobileState.feeding ? '✦  ' + t('mobile.feeding') : '✦  ' + t('mobile.feed');
  view.parts.feed.classList.toggle('active', !!mobileState.feeding);
  if (mobileState.feeding && performance.now() - mobileState.fedAt > FEED_IDLE)
    setFeeding(false);
}

// Where the tank's energy sits: one strip, a segment per food source in its usual colour, and
// the largest stores named below it.
const ENERGY_NAMED = 3;
function renderEnergyStrip(f, box, legend) {
  const budget = energyBudget(f), names = textArea('energy_view').groupNames,
        total = Math.max(1, budget.total),
        color = g => foodColors[foodDisplayIndex(g.sources[0], g.key === 'drift')];
  if (box.children.length !== budget.groups.length)
    box.replaceChildren(...budget.groups.map(() => make('i')));
  budget.groups.forEach((g, i) => {
    const part = box.children[i];
    part.style.width = 100 * g.stock / total + '%';
    part.style.background = color(g);
    part.title =
        t('energy_view.namedEnergy', {name : names[g.key], n : formatNumber(Math.round(g.stock))});
  });
  const largest = [...budget.groups ].sort((a, b) => b.stock - a.stock).slice(0, ENERGY_NAMED);
  if (legend.children.length !== largest.length)
    legend.replaceChildren(...largest.map(() => make('span')));
  largest.forEach((g, i) => {
    const item = legend.children[i];
    item.style.setProperty('--dot', color(g));
    item.textContent =
        t('mobile.energyShare', {name : names[g.key], n : Math.round(100 * g.stock / total)});
  });
}

// Where the living fish spend their time, as five short bars.
function renderHabitat(f, box) {
  const shares = populationHabitat(f).shares, names = tList('mobile.habitats');
  if (box.children.length !== HABITATS.length)
    box.replaceChildren(...HABITATS.map((_, i) => {
      const row = make('div', 'deck-habitat-row'), bar = make('i');
      row.append(make('span', '', names[i]), bar, make('b'));
      return row;
    }));
  shares.forEach((share, i) => {
    const row = box.children[i];
    row.children[1].style.width = 100 * Math.min(1, share) + '%';
    row.children[2].textContent = t('units.percent', {n : Math.round(100 * share)});
  });
}

const FISH_STATS_EVERY = 1000;

function renderFish(f, view) {
  const p = frameFish(f);
  if (!p) {
    view.line.textContent = t('mobile.noFish');
    if (view.fish !== 0) {
      view.fish = 0;
      view.body.replaceChildren(make('p', 'deck-hint', t('mobile.chooseHint')));
    }
    return;
  }
  const id = p[FISH.id], thoughts = thoughtLog(id).slice(0, 4),
        name = fishName(id) || t('mobile.fishNumber', {id}),
        species = frameSpecies(f, p[FISH.species])?.name || '';
  const mood = moodFor(id)?.name;
  view.line.textContent = thoughts[0] ? '💭 ' + thoughts[0].text
                          : mood      ? t('mobile.portrait.mood', {mood})
                                      : name + ' · ' + species;
  if (view.fish !== id) {
    view.fish = id;
    const top = make('div', 'deck-fish-top'),
          follow = button('deck-round', '', t('mobile.follow'),
                          () => cameraState.following ? setFollowing(false) : approach());
    top.append(make('strong', '', name), make('span', '', species), follow,
               button('deck-round', '⤢', t('mobile.portrait.open'), openPortrait),
               button('deck-round', '✕', t('mobile.release'), () => selectFish(0)));
    view.parts = {follow, thoughts : make('ol', 'deck-thoughts'), grid : make('div', 'deck-grid')};
    view.body.replaceChildren(top, view.parts.thoughts, view.parts.grid);
    view.thoughtAt = view.statsAt = null;
  }
  view.parts.follow.textContent = cameraState.following ? '◉' : '◎';
  if (view.thoughtAt !== thoughts[0]?.time) {
    view.thoughtAt = thoughts[0]?.time;
    // The newest thought already stands in the card head; the list keeps the ones before it.
    view.parts.thoughts.replaceChildren(...thoughts.slice(1).map(x => make('li', '', x.text)));
  }
  const now = performance.now();
  if (view.statsAt === null || now - view.statsAt > FISH_STATS_EVERY) {
    view.statsAt = now;
    const profile = fishProfile(f, p, f.brain, f.traits?.find(x => x.id === id));
    view.parts.grid.replaceChildren(...profile.stats.map(s => stat(s.label, s.value, s.note)));
  }
}

// A tap brings the species' typical fish close; a long press marks all its fish in the water
// (again to unmark). Rows are kept per species, so a count change never cuts a press short.
function speciesRow(s, view) {
  const row = make('li'), name = make('strong'), count = make('span'), bar = make('i');
  row.append(name, count, bar);
  let timer = null, long = false;
  row.addEventListener('pointerdown', () => {
    long = false;
    timer = setTimeout(() => {
      long = true;
      sceneState.highlightSpecies =
          sceneState.highlightSpecies === row.speciesId ? 0 : row.speciesId;
      navigator.vibrate?.(18);
    }, LONG_PRESS);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave'])
    row.addEventListener(type, () => clearTimeout(timer));
  row.addEventListener('click', () => {
    if (long || !row.typicalFish)
      return;
    zoomToSpecimen(row.typicalFish);
    show(1);
  });
  view.rows.set(s.id, row);
  return Object.assign(row, {name, count, bar});
}

function renderSpecies(f, view) {
  const living = speciesCensus(f)
                     .living.sort((a, b) => (b.adults || 0) - (a.adults || 0))
                     .slice(0, SPECIES_SHOWN);
  view.line.textContent = t('mobile.speciesLine', {n : living.length});
  if (!view.list) {
    view.list = make('ul', 'deck-kinds');
    view.rows = new Map();
    view.body.replaceChildren(make('p', 'deck-hint', t('mobile.speciesHint')), view.list);
  }
  const most = Math.max(1, ...living.map(s => s.adults || 0)), order = [];
  for (const s of living) {
    const row = view.rows.get(s.id) || speciesRow(s, view);
    Object.assign(row, {speciesId : s.id, typicalFish : s.typical_fish});
    row.name.textContent = s.name;
    row.count.textContent = t('mobile.adults', {n : s.adults || 0});
    row.bar.style.width = 100 * (s.adults || 0) / most + '%';
    row.classList.toggle('marked', sceneState.highlightSpecies === s.id);
    order.push(row);
  }
  for (const [id, row] of view.rows)
    if (!living.some(s => s.id === id)) {
      row.remove();
      view.rows.delete(id);
    }
  if (order.some((row, i) => view.list.children[i] !== row))
    view.list.append(...order);
}

// A chosen fish outside the screen is shown by an arrow at the edge; tapping it brings the fish
// back.
function updateArrow(f) {
  const arrow = mobileState.arrow, p = frameFish(f);
  let visible = false;
  if (p && !cameraState.following && !document.body.classList.contains('portrait-open')) {
    const b = blendFish(p), q = worldToScreen({x : b[0], y : b[1]}, camera()),
          w = cameraState.viewportWidth, h = cameraState.viewportHeight;
    if (q.x < 0 || q.y < 0 || q.x > w || q.y > h) {
      const cx = w / 2, cy = h / 2, dx = q.x - cx, dy = q.y - cy,
            k = Math.min((cx - EDGE_MARGIN) / Math.abs(dx || 1e-9),
                         (cy - EDGE_MARGIN) / Math.abs(dy || 1e-9));
      arrow.style.transform =
          `translate(${cx + dx * k}px, ${cy + dy * k}px) rotate(${Math.atan2(dy, dx)}rad)`;
      visible = true;
    }
  }
  arrow.hidden = !visible;
}

function refresh() {
  const f = sceneState.frame;
  if (on() && f) {
    if (cameraState.zoom === 1 && !cameraState.following && fillZoom() > 1)
      cameraState.zoom = fillZoom();
    steerTempo(f);
    renderTank(f, mobileState.views.tank);
    renderFish(f, mobileState.views.fish);
    renderSpecies(f, mobileState.views.species);
    renderChronicle(mobileState.views.events, () => show(1));
    updateArrow(f);
    updateEvents();
    // A fish the visitor taps in the water is followed and its card comes forward.
    const id = f.selected || 0;
    if (mobileState.chosen !== undefined && id && id !== mobileState.chosen) {
      approach();
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
  const arrow = button('edge-arrow', '➤', t('mobile.findFish'), approach);
  arrow.hidden = true;
  document.body.append(arrow);
  mobileState.arrow = arrow;
  const shell = make('div', 'deck-shell');
  shell.append(dots, deck);
  document.body.append(shell);
  mobileState.deck = deck;
}

function apply(active) {
  sceneState.layout = active ? 'phone' : 'desktop';
  document.body.classList.toggle('mobile', active);
  document.body.classList.toggle('landscape', active && globalThis.matchMedia(LANDSCAPE).matches);
  requestAnimationFrame(() => {
    resizeAquarium();
    window.dispatchEvent(new Event('resize'));
  });
}

// While someone watches the water the screen stays on (where the browser allows it).
function keepAwake() {
  const request = async () => {
    if (!on() || document.visibilityState !== 'visible' || mobileState.wake)
      return;
    try {
      mobileState.wake = await navigator.wakeLock?.request('screen');
      mobileState.wake?.addEventListener('release', () => mobileState.wake = null);
    } catch {
      mobileState.wake = null;
    }
  };
  document.addEventListener('visibilitychange', request);
  document.addEventListener('pointerdown', request, {once : true});
  request();
}

export function initMobile() {
  // ?mobile=1 or ?mobile=0 overrides the screen query; without a browser window nothing happens.
  const forced = new URLSearchParams(globalThis.location?.search || '').get('mobile'),
        media = globalThis.matchMedia?.(QUERY);
  if (!media)
    return;
  build();
  buildEvents();
  bindTouch();
  bindPortrait();
  keepAwake();
  const decide = () => apply(forced === '1' || (forced !== '0' && media.matches));
  media.addEventListener?.('change', decide);
  globalThis.matchMedia(LANDSCAPE).addEventListener?.('change', decide);
  decide();
  refresh();
}
