// A phone's full-screen portrait of the chosen fish: the fish itself, large and alive; its mood
// and latest thoughts; reserve, health and age as rings; its organs by current activity; its
// strongest nerve lines as strips of stations; and every figure of its profile. Opened from the
// fish card, closed by ✕, a downward swipe or the system's back gesture.
import {planFor, stationNames, updatePlanLive} from './brain_plan.js';
import {familyChildren, familyParents, familyRecord, family_modelState} from './family_model.js';
import {fishRenderRadius} from './fish_fins.js';
import {fishPreviewPose} from './fish_organs.js';
import {paintFishGlyph} from './fish_painter.js';
import {fishProfile} from './fish_profile.js';
import {moodFor, thoughtLog} from './mind.js';
import {LINE_COLORS} from './nerve_map.js';
import {FISH} from './schema.js';
import {fishLabel, fishTitle} from './fish_names.js';
import {command} from './session.js';
import {
  blendFish,
  displayStep,
  frameBlend,
  frameFish,
  frameSpecies,
  sceneState,
  selectFish,
  syncBrainRequest
} from './state.js';
import {formatNumber, t} from './strings.js';
export const mobile_portraitState = {
  open : false
};

const REFRESH = 300, LINES_SHOWN = 6, CLOSE_SWIPE = 70, RING_RADIUS = 26, FISH_SPAN = 6.5,
      SIBLING_SWIPE = 60, CARD = {
        width : 1080,
        height : 1350
      };
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
        share = make('button', 'portrait-share', '⇪'), siblings = make('p', 'portrait-siblings'),
        canvas = make('canvas', 'portrait-fish'), name = make('h1'),
        species = make('p', 'portrait-species'), mood = make('span', 'portrait-mood'),
        thought = make('p', 'portrait-thought'), rings = make('div', 'portrait-rings'),
        organs = make('div', 'portrait-organs'), lines = make('div', 'portrait-lines'),
        values = make('div', 'deck-grid'), family = make('div', 'portrait-family');
  close.type = 'button';
  close.setAttribute('aria-label', t('mobile.portrait.close'));
  close.onclick = () => closePortrait();
  share.type = 'button';
  share.setAttribute('aria-label', t('mobile.portrait.share'));
  share.onclick = () => shareCard();
  const ringViews =
      Object.fromEntries(RINGS.map(r => [r.key, ring(t('mobile.portrait.' + r.key), r.color)]));
  for (const r of RINGS)
    rings.append(ringViews[r.key].box);
  const section = (title, body) => {
    const s = make('section', 'portrait-section');
    s.append(make('h2', '', title), body);
    return s;
  };
  layer.append(
      close, share, canvas, siblings, name, species, mood, thought, rings,
      section(t('mobile.portrait.organs'), organs), section(t('mobile.portrait.lines'), lines),
      section(t('mobile.portrait.family'), family), section(t('mobile.portrait.values'), values));
  // A downward swipe from the top of the layer closes it; sideways over the fish moves to the
  // next or previous fish of the same species.
  let start = null;
  layer.addEventListener('pointerdown',
                         e => start = {x : e.clientX, y : e.clientY, top : layer.scrollTop <= 0});
  layer.addEventListener('pointerup', e => {
    if (!start)
      return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (start.top && dy > CLOSE_SWIPE && Math.abs(dy) > Math.abs(dx))
      closePortrait();
    else if (Math.abs(dx) > SIBLING_SWIPE && Math.abs(dx) > 2 * Math.abs(dy) && e.target === canvas)
      sibling(dx < 0 ? 1 : -1);
    start = null;
  });
  document.body.append(layer);
  Object.assign(mobile_portraitState, {
    layer,
    canvas,
    siblings,
    name,
    species,
    mood,
    thought,
    ringViews,
    organs,
    lines,
    values,
    family,
    familyKey : ''
  });
}

// The living hatched fish of the chosen fish's species, in a stable order.
function kin(f, p) {
  return f.fish.filter(q => q[FISH.hatched] && q[FISH.species] === p[FISH.species])
      .map(q => q[FISH.id])
      .sort((a, b) => a - b);
}

function sibling(step) {
  const f = sceneState.frame, p = f && frameFish(f);
  if (!p)
    return;
  const ids = kin(f, p), at = ids.indexOf(p[FISH.id]);
  if (ids.length < 2)
    return;
  navigator.vibrate?.(8);
  selectFish(ids[(at + step + ids.length) % ids.length], {details : false});
}

// A shareable picture of the fish: portrait, name, species, mood and its latest thought.
function wrap(g, text, x, y, width, line) {
  const words = text.split(' ');
  let row = '';
  for (const word of words) {
    const next = row ? row + ' ' + word : word;
    if (g.measureText(next).width > width && row) {
      g.fillText(row, x, y);
      row = word;
      y += line;
    } else
      row = next;
  }
  if (row)
    g.fillText(row, x, y);
}

async function shareCard() {
  const s = mobile_portraitState, c = document.createElement('canvas');
  c.width = CARD.width;
  c.height = CARD.height;
  const g = c.getContext('2d'), sky = g.createLinearGradient(0, 0, 0, CARD.height);
  sky.addColorStop(0, '#163a44');
  sky.addColorStop(1, '#071216');
  g.fillStyle = sky;
  g.fillRect(0, 0, CARD.width, CARD.height);
  const ratio = s.canvas.height / Math.max(1, s.canvas.width);
  g.drawImage(s.canvas, 60, 80, CARD.width - 120, (CARD.width - 120) * ratio);
  g.fillStyle = '#eef6f3';
  g.font = '600 72px system-ui, sans-serif';
  g.fillText(s.name.textContent, 80, 820);
  g.fillStyle = '#9bb1b6';
  g.font = 'italic 40px system-ui, sans-serif';
  g.fillText(s.species.textContent, 80, 884);
  g.fillStyle = '#d9cff2';
  g.font = '36px system-ui, sans-serif';
  g.fillText(s.mood.textContent, 80, 950);
  if (s.thought.textContent) {
    g.fillStyle = '#e6f1ed';
    g.font = 'italic 46px system-ui, sans-serif';
    wrap(g, t('mobile.portrait.quoted', {text : s.thought.textContent}), 80, 1050, CARD.width - 160,
         60);
  }
  g.fillStyle = '#a2d9c6';
  g.font = '600 30px system-ui, sans-serif';
  g.fillText(t('mobile.portrait.shareFooter'), 80, CARD.height - 70);
  const blob = await new Promise(resolve => c.toBlob(resolve, 'image/png'));
  if (!blob)
    return;
  const file =
      new File([ blob ], t('mobile.portrait.shareFile', {name : s.name.textContent}) + '.png',
               {type : 'image/png'});
  if (navigator.canShare?.({files : [ file ]})) {
    try {
      await navigator.share({files : [ file ], title : s.name.textContent});
      return;
    } catch {
      // Cancelled by the visitor: nothing else to do.
      return;
    }
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
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
    // Sense and muscle carry their side ("Auge links"), so mirrored lines stay apart; the
    // relay stations between them keep their short names.
    stations.forEach((m, k) => {
      const names = stationNames(m), end = k === 0 || k === stations.length - 1;
      row.append(make('span', 'portrait-stop ' + m.kind, end ? names.name : names.label));
    });
    return row;
  }));
}

// Parents and offspring from the family records; living relatives can be visited directly.
const FAMILY_SHOWN = 12;
function renderFamily(f, id) {
  const s = mobile_portraitState, record = familyRecord(id, f), parents = familyParents(record),
        children = familyChildren(id, f).slice(0, FAMILY_SHOWN),
        key = [ id, ...parents.map(p => p.id), ...children.map(c => c.id) ].join();
  if (s.familyKey === key)
    return;
  s.familyKey = key;
  const chip = (relative, label) => {
    const alive = family_modelState.familyLive.has(relative),
          b = make('button', 'portrait-kin' + (alive ? ' alive' : ''), label);
    b.type = 'button';
    b.disabled = !alive;
    b.onclick = () => selectFish(relative, {details : false});
    return b;
  };
  const group = (title, items) => {
    const g = make('div', 'portrait-kin-group');
    g.append(make('span', '', title), ...items);
    return g;
  };
  const rows = [];
  if (parents.length)
    rows.push(group(t('mobile.portrait.parents'),
                    parents.map(p => chip(p.id, t('mobile.portrait.kin',
                                                  {role : p.role, fish : fishLabel(p.id)})))));
  if (children.length)
    rows.push(group(t('mobile.portrait.children'), children.map(c => chip(c.id, fishTitle(c.id)))));
  s.family.replaceChildren(
      ...(rows.length ? rows : [ make('p', 'deck-hint', t('mobile.portrait.noFamily')) ]));
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
  s.name.textContent = fishTitle(id);
  s.species.textContent = frameSpecies(f, p[FISH.species])?.name || '';
  const ids = kin(f, p);
  s.siblings.textContent =
      ids.length > 1 ? t('mobile.portrait.siblings', {n : ids.indexOf(id) + 1, of : ids.length})
                     : '';
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
  renderFamily(f, id);
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

function closePortrait(fromHistory = false) {
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
