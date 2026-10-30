import {t, formatNumber} from './strings.js';
import {updateWorldState} from './world.js';
import {el} from './dom.js';
import {command} from './session.js';
import {horizontalDelta, sceneState} from './state.js';
import {setTool, worldState} from './world.js';
export const world_sourcesState = {};

function sourceButton(q, index, current) {
  const b = document.createElement('button'), c = document.createElement('canvas');
  b.className = 'source-choice';
  c.width = 176;
  c.height = 68;
  c.style.width = '88px';
  c.style.height = '34px';
  const g = c.getContext('2d');
  g.scale(2, 2);
  g.strokeStyle = current ? '#80c3d0' : '#e2b47c';
  g.fillStyle = current ? '#80c3d025' : '#e2b47c25';
  g.lineWidth = 1.6;
  g.beginPath();
  g.ellipse(44, 17, Math.min(36, 12 + Math.sqrt(current ? q[3] : q[2])), 12, 0, 0, Math.PI * 2);
  g.fill();
  if (current) {
    g.save();
    g.translate(44, 17);
    g.rotate(q[2]);
    g.beginPath();
    g.moveTo(-20, 0);
    g.lineTo(20, 0);
    g.lineTo(13, -5);
    g.moveTo(20, 0);
    g.lineTo(13, 5);
    g.stroke();
    g.restore();
  } else {
    g.fillStyle = '#e2b47c';
    for (let k = 0; k < 13; k++) {
      g.beginPath();
      g.arc(23 + (k * 17 % 44), 6 + (k * 11 % 23), 1.7, 0, Math.PI * 2);
      g.fill();
    }
  }
  const label = document.createElement('span');
  label.textContent = String(index + 1);
  b.title = current
                ? t('world_sources.current', {n : index + 1, speed : formatNumber(q[4], 1, true)})
                : t('world_sources.food', {n : index + 1, share : q[3]});
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
    angle : Number(el('current-angle').value) * Math.PI / 180,
    width : Number(el('current-width').value),
    strength : Number(el('current-strength').value)
  };
}

export function selectCurrent(index) {
  updateWorldState({currentSelection : index});
  const q = sceneState.frame?.currents?.[index];
  if (!q)
    return;
  el('current-angle').value = String(Math.round(q[2] * 180 / Math.PI));
  el('current-width').value = String(q[3]);
  el('current-strength').value = String(q[4]);
  setTool('current');
  markSource('current-list', index);
}

export function renderCurrentSources(f) {
  const signature = JSON.stringify((f.currents || []).map(q => q.slice(0, 5)));
  if (signature === worldState.currentSignature)
    return;
  updateWorldState({currentSignature : signature});
  const box = el('current-list');
  box.replaceChildren();
  for (const [i, q] of (f.currents || []).entries()) {
    const button = sourceButton(q, i, true);
    button.onclick = () => selectCurrent(i);
    box.appendChild(button);
  }
  const add = document.createElement('button');
  add.textContent = '+';
  add.title = t('world_sources.neueQuelle');
  add.setAttribute('aria-label', t('world_sources.neueQuelle'));
  add.onclick = () => {
    updateWorldState({currentSelection : -1});
    setTool('current');
    markSource('current-list', -1);
  };
  box.appendChild(add);
  if (worldState.currentSelection >= (f.currents || []).length)
    updateWorldState({currentSelection : -1});
}

function sourceAt(p, rows, radius) {
  let nearest = -1, best = Infinity;
  rows.forEach((q, i) => {
    const d = Math.hypot(horizontalDelta(q[0] - p.x), q[1] - p.y);
    if (d <= radius(q) + 10 && d < best) {
      best = d;
      nearest = i;
    }
  });
  return nearest;
}
export function currentAt(p) {
  return sourceAt(p, sceneState.frame?.currents || [], q => q[3] / 2);
}
export function feederAt(p) { return sourceAt(p, sceneState.frame?.feeders || [], q => q[2]); }

export function selectFeeder(index) {
  updateWorldState({feederSelection : index});
  const q = sceneState.frame?.feeders?.[index];
  if (!q)
    return;
  el('feeder-rate').value = String(q[3]);
  el('feeder-width').value = String(q[2]);
  setTool('feeder');
  markSource('feeder-list', index);
}

export function renderFeeders(f) {
  const signature = JSON.stringify((f.feeders || []).map(q => q.slice(2)));
  if (signature === worldState.feederSignature)
    return;
  updateWorldState({feederSignature : signature});
  const box = el('feeder-list');
  box.replaceChildren();
  for (const [i, q] of (f.feeders || []).entries()) {
    const button = sourceButton(q, i, false);
    button.onclick = () => selectFeeder(i);
    box.appendChild(button);
  }
  const add = document.createElement('button');
  add.textContent = '+';
  add.title = t('world_sources.neueQuelle');
  add.setAttribute('aria-label', t('world_sources.neueQuelle'));
  add.onclick = () => {
    updateWorldState({feederSelection : -1});
    setTool('feeder');
    markSource('feeder-list', -1);
  };
  box.appendChild(add);
  if (worldState.feederSelection >= (f.feeders || []).length)
    updateWorldState({feederSelection : -1});
}

const initializers = {
  "el" : () => {
    for (const id of ['current-angle', 'current-width', 'current-strength'])
      el(id).onchange = () => {
        const q = sceneState.frame?.currents?.[worldState.currentSelection];
        if (q)
          command('current-source',
                  {index : worldState.currentSelection, x : q[0], y : q[1], ...currentValues()});
      };
  },
  "el_additional_2" : () => {
    for (const id of ['feeder-rate', 'feeder-width'])
      el(id).onchange = () => {
        const q = sceneState.frame?.feeders?.[worldState.feederSelection];
        if (q)
          command('feeder', {
            index : worldState.feederSelection,
            x : q[0],
            y : q[1],
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
