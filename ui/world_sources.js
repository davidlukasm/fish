import {tracePath} from './path_data.js';
import {t, formatNumber} from './strings.js';
import {CURRENT, FEEDER, SOURCE_LIMITS} from './schema.js';
import {degrees, radians} from './units.js';
import {updateWorldState} from './world.js';
import {el} from './dom.js';
import {command} from './session.js';
import {horizontalDelta, sceneState} from './state.js';
import {setTool, worldState} from './world.js';
export const world_sourcesState = {};

const SOURCE_ICON = Object.freeze({
  width : 88,
  height : 34,
  scale : 2,
  line : 1.6,
  current : '#80c3d0',
  feeder : '#e2b47c',
  fill_alpha : '25',
  rx : 12,
  max_rx : 36,
  ry : 12,
  arrow : 'M-20 0L20 0L13 -5M20 0L13 5',
  grains : 13,
  grain : Object.freeze({x : 23, y : 6, dx : 44, dy : 23, step_x : 17, step_y : 11, r : 1.7})
});
function sourceButton(q, index, current) {
  const b = document.createElement('button'), c = document.createElement('canvas'), I = SOURCE_ICON,
        cx = I.width / 2, cy = I.height / 2, color = current ? I.current : I.feeder;
  b.className = 'source-choice';
  c.width = I.width * I.scale;
  c.height = I.height * I.scale;
  c.style.width = I.width + 'px';
  c.style.height = I.height + 'px';
  const g = c.getContext('2d');
  g.scale(I.scale, I.scale);
  g.strokeStyle = color;
  g.fillStyle = color + I.fill_alpha;
  g.lineWidth = I.line;
  g.beginPath();
  g.ellipse(cx, cy,
            Math.min(I.max_rx, I.rx + Math.sqrt(current ? q[CURRENT.width] : q[FEEDER.radius])),
            I.ry, 0, 0, Math.PI * 2);
  g.fill();
  if (current) {
    g.save();
    g.translate(cx, cy);
    g.rotate(q[CURRENT.angle]);
    g.beginPath();
    tracePath(g, I.arrow);
    g.stroke();
    g.restore();
  } else {
    const G = I.grain;
    g.fillStyle = color;
    for (let k = 0; k < I.grains; k++) {
      g.beginPath();
      g.arc(G.x + (k * G.step_x % G.dx), G.y + (k * G.step_y % G.dy), G.r, 0, Math.PI * 2);
      g.fill();
    }
  }
  const label = document.createElement('span');
  label.textContent = String(index + 1);
  b.title = current ? t('world_sources.current',
                        {n : index + 1, speed : formatNumber(q[CURRENT.strength], 1, true)})
                    : t('world_sources.food', {n : index + 1, share : q[FEEDER.rate]});
  b.setAttribute('aria-label', b.title);
  b.append(c, label);
  return b;
}
function markSource(box, index) {
  [...el(box).children].forEach((b, i) => {
    b.classList.toggle('active', i === index);
    b.setAttribute('aria-pressed', String(i === index));
  });
}

export function currentValues() {
  return {
    angle : radians(Number(el('current-angle').value)),
    width : Number(el('current-width').value),
    strength : Number(el('current-strength').value)
  };
}

const SOURCE_LIST = Object.freeze({
  current :
      {list : 'current-list', selection : 'currentSelection', tool : 'current', current : true},
  feeder : {list : 'feeder-list', selection : 'feederSelection', tool : 'feeder', current : false}
});
function sourceList({list, selection, tool, current}, sources, select) {
  const box = el(list);
  box.replaceChildren();
  for (const [i, q] of sources.entries()) {
    const button = sourceButton(q, i, current);
    button.onclick = () => select(i);
    box.appendChild(button);
  }
  const add = document.createElement('button');
  add.textContent = t('world_sources.add');
  add.title = t('world_sources.neueQuelle');
  add.setAttribute('aria-label', t('world_sources.neueQuelle'));
  add.onclick = () => {
    updateWorldState({[selection] : -1});
    setTool(tool);
    markSource(list, -1);
  };
  box.appendChild(add);
  if (worldState[selection] >= sources.length)
    updateWorldState({[selection] : -1});
}
export function selectCurrent(index) {
  updateWorldState({currentSelection : index});
  const q = sceneState.frame?.currents?.[index];
  if (!q)
    return;
  el('current-angle').value = String(Math.round(degrees(q[CURRENT.angle])));
  el('current-width').value = String(q[CURRENT.width]);
  el('current-strength').value = String(q[CURRENT.strength]);
  setTool('current');
  markSource('current-list', index);
}

export function renderCurrentSources(f) {
  const signature = JSON.stringify((f.currents || []).map(q => q.slice(0, CURRENT.flow)));
  if (signature === worldState.currentSignature)
    return;
  updateWorldState({currentSignature : signature});
  sourceList(SOURCE_LIST.current, f.currents || [], selectCurrent);
}

function sourceAt(p, rows, radius) {
  let nearest = -1, best = Infinity;
  rows.forEach((q, i) => {
    const d = Math.hypot(horizontalDelta(q[FEEDER.x] - p.x), q[FEEDER.y] - p.y);
    if (d <= radius(q) + SOURCE_LIMITS.erase_margin && d < best) {
      best = d;
      nearest = i;
    }
  });
  return nearest;
}
export function currentAt(p) {
  return sourceAt(p, sceneState.frame?.currents || [], q => q[CURRENT.width] / 2);
}
export function feederAt(p) {
  return sourceAt(p, sceneState.frame?.feeders || [], q => q[FEEDER.radius]);
}

export function selectFeeder(index) {
  updateWorldState({feederSelection : index});
  const q = sceneState.frame?.feeders?.[index];
  if (!q)
    return;
  el('feeder-rate').value = String(q[FEEDER.rate]);
  el('feeder-width').value = String(q[FEEDER.radius]);
  setTool('feeder');
  markSource('feeder-list', index);
}

export function renderFeeders(f) {
  const signature = JSON.stringify((f.feeders || []).map(q => q.slice(FEEDER.radius)));
  if (signature === worldState.feederSignature)
    return;
  updateWorldState({feederSignature : signature});
  sourceList(SOURCE_LIST.feeder, f.feeders || [], selectFeeder);
}

const initializers = {
  "el" : () => {
    for (const id of ['current-angle', 'current-width', 'current-strength'])
      el(id).onchange = () => {
        const q = sceneState.frame?.currents?.[worldState.currentSelection];
        if (q)
          command('current-source', {
            index : worldState.currentSelection,
            x : q[CURRENT.x],
            y : q[CURRENT.y],
            ...currentValues()
          });
      };
  },
  "el_additional_2" : () => {
    for (const id of ['feeder-rate', 'feeder-width'])
      el(id).onchange = () => {
        const q = sceneState.frame?.feeders?.[worldState.feederSelection];
        if (q)
          command('feeder', {
            index : worldState.feederSelection,
            x : q[FEEDER.x],
            y : q[FEEDER.y],
            rate : Number(el('feeder-rate').value),
            radius : Number(el('feeder-width').value)
          });
      };
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
