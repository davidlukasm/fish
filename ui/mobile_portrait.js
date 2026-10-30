// A phone's full-screen portrait of the chosen fish: the fish itself, large and alive; its mood
// and latest thoughts; reserve, health and age as rings; its organs by current activity; its
// strongest nerve lines as strips of stations; and every figure of its profile. Opened from the
// fish card, closed by ✕, a downward swipe or the system's back gesture.
import {planFor, stationNames, updatePlanLive} from './brain_plan.js';
import {fishRenderRadius} from './fish_fins.js';
import {fishPreviewPose} from './fish_organs.js';
import {paintFishGlyph} from './fish_painter.js';
import {fishProfile} from './fish_profile.js';
import {moodFor, thoughtLog} from './mind.js';
import {LINE_COLORS} from './nerve_map.js';
import {FISH} from './schema.js';
import {fishName} from './selection.js';
import {command} from './session.js';
import {
  blendFish,
  displayStep,
  frameBlend,
  frameFish,
  frameSpecies,
  sceneState,
  syncBrainRequest
} from './state.js';
import {formatNumber, t} from './strings.js';
export const mobile_portraitState = {
  open : false
};

const REFRESH = 300, LINES_SHOWN = 6, CLOSE_SWIPE = 70, RING_RADIUS = 26, FISH_SPAN = 6.5;
const RINGS = [
  {key : 'reserve', color : '#e9c185'}, {key : 'health', color : '#a2d9c6'},
  {key : 'age', color : '#b6a5df'}
];
const SVG = 'http://www.w3.org/2000/svg';

function make(tag, className = '', text = '') {
  const e = document.createElement(tag);
  if (className)
    e.className = className;
  if (text)
    e.textContent = text;
  return e;
}

function ring(label, color) {
  const box = make('div', 'portrait-ring'), svg = document.createElementNS(SVG, 'svg'),
        circumference = 2 * Math.PI * RING_RADIUS;
  svg.setAttribute('viewBox', '0 0 64 64');
  for (const [cls, stroke] of [[ 'track', 'rgba(255,255,255,.1)' ], [ 'value', color ]]) {
    const c = document.createElementNS(SVG, 'circle');
    c.setAttribute('class', cls);
    c.setAttribute('cx', '32');
    c.setAttribute('cy', '32');
    c.setAttribute('r', String(RING_RADIUS));
    c.setAttribute('stroke', stroke);
    c.setAttribute('stroke-dasharray', String(circumference));
    svg.append(c);
  }
  const value = make('b'), name = make('span', '', label);
  box.append(svg, value, name);
  return {
    box,
    set(share, text) {
      svg.lastChild.setAttribute('stroke-dashoffset',
                                 String(circumference * (1 - Math.max(0, Math.min(1, share)))));
      value.textContent = text;
    }
  };
}

function build() {
  const layer = make('section', 'portrait'), close = make('button', 'portrait-close', '✕'),
        canvas = make('canvas', 'portrait-fish'), name = make('h1'),
        species = make('p', 'portrait-species'), mood = make('span', 'portrait-mood'),
        thought = make('p', 'portrait-thought'), rings = make('div', 'portrait-rings'),
        organs = make('div', 'portrait-organs'), lines = make('div', 'portrait-lines'),
        values = make('div', 'deck-grid');
  close.type = 'button';
  close.setAttribute('aria-label', t('mobile.portrait.close'));
  close.onclick = () => closePortrait();
  const ringViews =
      Object.fromEntries(RINGS.map(r => [r.key, ring(t('mobile.portrait.' + r.key), r.color)]));
  for (const r of RINGS)
    rings.append(ringViews[r.key].box);
  const section = (title, body) => {
    const s = make('section', 'portrait-section');
    s.append(make('h2', '', title), body);
    return s;
  };
  layer.append(close, canvas, name, species, mood, thought, rings,
               section(t('mobile.portrait.organs'), organs),
               section(t('mobile.portrait.lines'), lines),
               section(t('mobile.portrait.values'), values));
  // A downward swipe from the top of the layer closes it.
  let start = null;
  layer.addEventListener('pointerdown', e => start = layer.scrollTop <= 0 ? e.clientY : null);
  layer.addEventListener('pointerup', e => {
    if (start !== null && e.clientY - start > CLOSE_SWIPE)
      closePortrait();
    start = null;
  });
  document.body.append(layer);
  Object.assign(mobile_portraitState,
                {layer, canvas, name, species, mood, thought, ringViews, organs, lines, values});
}

// The fish, drawn the way the tank draws it, filling the portrait's width.
function paint() {
  const s = mobile_portraitState;
  if (!s.open)
    return;
  requestAnimationFrame(paint);
  const f = sceneState.frame, p = f && frameFish(f), c = s.canvas;
  if (!p)
    return;
  const ratio = Math.min(2, window.devicePixelRatio || 1), width = c.clientWidth,
        height = c.clientHeight;
  if (c.width !== Math.round(width * ratio) || c.height !== Math.round(height * ratio)) {
    c.width = Math.round(width * ratio);
    c.height = Math.round(height * ratio);
  }
  const g = c.getContext('2d'), blend = frameBlend();
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  g.clearRect(0, 0, width, height);
  if (!p[FISH.hatched])
    return;
  const pose = blendFish(p, blend),
        fit = fishPreviewPose(pose, width, height, FISH_SPAN * fishRenderRadius(p));
  g.save();
  g.translate(fit.x, fit.y);
  paintFishGlyph(g, pose, fit.r, 0, displayStep(f, blend), 1, null, false, 1, fit.a);
  g.restore();
}

function renderOrgans(plan) {
  const s = mobile_portraitState;
  if (!plan) {
    s.organs.replaceChildren(make('p', 'deck-hint', t('mobile.portrait.loading')));
    s.lines.replaceChildren();
    return;
  }
  const organs = [...plan.meta.values() ]
                     .filter(m => m.kind !== 'h')
                     .map(m => ({m, a : plan.activity.get(m.id) || 0}))
                     .sort((x, y) => y.a - x.a);
  const most = Math.max(1e-6, ...organs.map(o => o.a));
  s.organs.replaceChildren(...organs.map(({m, a}) => {
    const chip = make('div', 'portrait-organ ' + (m.kind === 's' ? 'sense' : 'motor')),
          bar = make('i');
    bar.style.width = 100 * a / most + '%';
    chip.append(make('span', '', stationNames(m).name), bar);
    return chip;
  }));
  s.lines.replaceChildren(...plan.routes.slice(0, LINES_SHOWN).map((route, i) => {
    const row = make('div', 'portrait-line'), color = LINE_COLORS[i] || '#a2d9c6',
          stations = route.path.map(id => plan.meta.get(id)).filter(Boolean),
          activity = stations.reduce((sum, m) => sum + (plan.activity.get(m.id) || 0), 0) /
                     Math.max(1, stations.length);
    row.style.setProperty('--line', color);
    row.style.setProperty('--pulse', (2.6 - 2 * Math.min(1, activity * 3)).toFixed(2) + 's');
    for (const m of stations)
      row.append(make('span', 'portrait-stop ' + m.kind, stationNames(m).label));
    return row;
  }));
}

function refresh() {
  const s = mobile_portraitState;
  if (!s.open)
    return;
  setTimeout(refresh, REFRESH);
  const f = sceneState.frame, p = f && frameFish(f);
  if (!p) {
    closePortrait();
    return;
  }
  const id = p[FISH.id], b = f.brain;
  s.name.textContent = fishName(id) || t('mobile.fishNumber', {id});
  s.species.textContent = frameSpecies(f, p[FISH.species])?.name || '';
  const mood = moodFor(id)?.name;
  s.mood.textContent = mood ? t('mobile.portrait.mood', {mood}) : '';
  s.thought.textContent = thoughtLog(id)[0]?.text || '';
  s.ringViews.reserve.set((p[FISH.energy] || 0) / Math.max(1, p[FISH.reserve_capacity]),
                          formatNumber(p[FISH.energy] || 0));
  s.ringViews.health.set(p[FISH.health] ?? 1,
                         t('units.percent', {n : Math.round(100 * (p[FISH.health] ?? 1))}));
  s.ringViews.age.set(p[FISH.hatched] ? 1 : p[FISH.development] || 0,
                      p[FISH.hatched]
                          ? formatNumber(p[FISH.adult_age] || 0)
                          : t('units.percent', {n : Math.round(100 * (p[FISH.development] || 0))}));
  const plan = b && planFor(b);
  if (plan)
    updatePlanLive(plan, b);
  renderOrgans(plan);
  const profile = fishProfile(f, p, b, f.traits?.find(x => x.id === id));
  s.values.replaceChildren(...profile.stats.map(x => {
    const stat = make('div', 'deck-stat');
    stat.append(make('b', '', String(x.value)), make('span', '', x.label));
    stat.title = x.note || '';
    return stat;
  }));
}

export function openPortrait() {
  if (!mobile_portraitState.layer)
    build();
  if (mobile_portraitState.open || !frameFish(sceneState.frame))
    return;
  mobile_portraitState.open = true;
  document.body.classList.add('portrait-open');
  mobile_portraitState.layer.scrollTop = 0;
  // The nerve lines need the brain in detail while the portrait is open.
  command('brain', {value : 1});
  history.pushState({fishPortrait : true}, '');
  navigator.vibrate?.(10);
  refresh();
  paint();
}

export function closePortrait(fromHistory = false) {
  if (!mobile_portraitState.open)
    return;
  mobile_portraitState.open = false;
  document.body.classList.remove('portrait-open');
  syncBrainRequest();
  if (!fromHistory && history.state?.fishPortrait)
    history.back();
}

// The system's back gesture closes an open portrait instead of leaving the page.
export function bindPortrait() { window.addEventListener('popstate', () => closePortrait(true)); }
