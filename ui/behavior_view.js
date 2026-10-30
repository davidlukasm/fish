import {family_modelState} from './family_model.js';
import {
  BEHAVIOR_GROUPS,
  behaviorContributions,
  behaviorDeltaLabels,
  behaviorDistance
} from './behavior_model.js';
import {t, formatNumber} from './strings.js';
import {brainClamp} from './brain.js';
import {featureNames, featureValue} from './evolution.js';
export const behavior_viewState = {};

export let behaviorGroupNames;

export function appendBehaviorComparison(box, a, b, name) {
  let parts = box.behaviorParts;
  if (!parts || !Array.from(box.children).includes(parts.canvas)) {
    box.replaceChildren();
    const heading = document.createElement('p'), canvas = document.createElement('canvas');
    heading.className = 'behavior-heading';
    canvas.width = 480;
    canvas.height = 210;
    canvas.className = 'behavior-comparison';
    box.appendChild(heading);
    box.appendChild(canvas);
    parts = box.behaviorParts = {heading, canvas};
  }
  const {heading, canvas} = parts, weights = behaviorContributions(a, b),
                  distance = weights.reduce((s, w) => s + w, 0), top = behaviorDeltaLabels(a, b, 3);
  heading.textContent =
      t('behavior_view.distanceHeading', {name, distance : formatNumber(distance, 3, true)});
  heading.title = t('behavior_view.abstandDerBeobachtetenLebensweisen');
  const g = canvas.getContext('2d', {willReadFrequently : true});
  g.clearRect(0, 0, 480, 210);
  g.font = '12px system-ui';
  g.textAlign = 'left';
  g.fillStyle = '#a2d9c6';
  g.fillRect(0, 5, 13, 4);
  g.fillText(t('behavior_view.auswahl'), 20, 12);
  g.fillStyle = '#96aabd';
  g.fillRect(110, 5, 13, 4);
  g.fillText(t('behavior_view.vergleich'), 130, 12);
  for (let j = 0; j < top.length; j++) {
    const i = top[j].i, y = 34 + j * 45;
    g.fillStyle = '#d8e6e3';
    g.fillText(top[j].text, 0, y + 10);
    g.fillStyle = '#263f49';
    g.fillRect(174, y, 183, 18);
    g.fillStyle = '#a2d9c6';
    g.fillRect(174, y, 183 * brainClamp(a[i]), 7);
    g.fillStyle = '#96aabd';
    g.fillRect(174, y + 11, 183 * brainClamp(b[i]), 7);
    g.fillStyle = '#d8e6e3';
    g.fillText(featureValue(i, a[i]), 365, y + 7);
    g.fillStyle = '#96aabd';
    g.fillText(featureValue(i, b[i]), 365, y + 22);
  }
  if (!top.length) {
    g.fillStyle = '#a2d9c6';
    g.fillText(t('behavior_view.gleichesBeobachtetesVerhalten'), 0, 78);
  }
  for (let j = 0; j < 5; j++) {
    const group = BEHAVIOR_GROUPS[j], value = group.reduce((s, i) => s + weights[i], 0) / .2,
          x = j * 97;
    g.fillStyle = '#8fa9af';
    g.font = '10px system-ui';
    g.fillText(
        [
          t('behavior_view.bewegung'), t('behavior_view.ernaehrung'), t('behavior_view.aufenthalt'),
          t('behavior_view.nachwuchs'), t('behavior_view.aktivitaetFarbe')
        ][j],
        x, 187);
    g.fillStyle = '#263f49';
    g.fillRect(x, 195, 87, 6);
    g.fillStyle = [ '#8bcab6', '#e2a77b', '#78b8d0', '#c1a3d9', '#d2bd79' ][j];
    g.fillRect(x, 195, 87 * value, 6);
  }
  canvas.onpointermove = e => {
    const rect = canvas.getBoundingClientRect(), y = (e.clientY - rect.top) / rect.height * 210;
    if (y < 170) {
      const part = top[Math.max(0, Math.min(top.length - 1, Math.floor((y - 28) / 45)))];
      canvas.title = part ? t('behavior_view.featureCompare', {
        feature : featureNames[part.i],
        selected : featureValue(part.i, a[part.i]),
        compared : featureValue(part.i, b[part.i])
      })
                          : t('behavior_view.gleichesBeobachtetesVerhalten');
    } else {
      const j = Math.max(0, Math.min(4, Math.floor((e.clientX - rect.left) / rect.width * 5))),
            group = BEHAVIOR_GROUPS[j];
      canvas.title = t('behavior_view.groupShare', {
        group : behaviorGroupNames[j],
        n : Math.round(group.reduce((s, i) => s + weights[i], 0) / Math.max(1e-9, distance) * 100)
      });
    }
  };
}

function appendSpeciesLifetime(box, s) {
  if (!s.lifetime_profile_samples)
    return;
  const canvas = document.createElement('canvas'),
        features = [ 0, 1, 2, 3, 4, 5, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 24, 25 ];
  canvas.width = 360;
  canvas.height = 32 + features.length * 24;
  canvas.className = 'behavior-comparison';
  canvas.setAttribute('role', 'img');
  box.appendChild(canvas);
  const g = canvas.getContext('2d'), a = s.lifetime_profile, b = s.adults ? s.profile : [],
        tips = [];
  g.font = '11px system-ui';
  g.fillStyle = '#a2d9c6';
  g.fillRect(4, 8, 14, 4);
  g.fillText(t('behavior_view.gesamt'), 24, 14);
  g.globalAlpha = .55;
  g.fillRect(110, 8, 14, 4);
  g.globalAlpha = 1;
  g.fillText(t('behavior_view.lebend'), 130, 14);
  features.forEach((k, i) => {
    const y = 38 + i * 24;
    g.textAlign = 'left';
    g.fillStyle = '#bad0d3';
    g.fillText(featureNames[k], 4, y);
    g.fillStyle = '#2b424a';
    g.fillRect(150, y - 10, 90, 12);
    g.fillStyle = '#a2d9c6';
    g.fillRect(150, y - 10, 90 * brainClamp(a[k] || 0), 5);
    g.globalAlpha = .55;
    g.fillRect(150, y - 3, 90 * brainClamp(b[k] || 0), 5);
    g.globalAlpha = 1;
    g.textAlign = 'right';
    g.fillStyle = '#e0e9e6';
    g.fillText(featureValue(k, a[k] || 0), 354, y - 3);
    g.globalAlpha = .55;
    g.fillText(b.length ? featureValue(k, b[k] || 0) : '–', 354, y + 8);
    g.globalAlpha = 1;
    tips.push(t('behavior_view.featureLifetime', {
      feature : featureNames[k],
      lifetime : featureValue(k, a[k] || 0),
      living : b.length ? featureValue(k, b[k] || 0) : '–'
    }));
  });
  canvas.setAttribute('aria-label', tips.join('; '));
  const note = t('behavior_view.gesamtMittelAllerVerhaltensbeobachtungen');
  canvas.title = note;
  canvas.onpointermove = e => {
    const r = canvas.getBoundingClientRect(),
          i = Math.floor(((e.clientY - r.top) * canvas.height / r.height - 25) / 24);
    canvas.title = (tips[i] || '') + '\n' + note;
  };
}

export function appendSpeciesBehaviorComparison(box, s, all) {
  const owner = box;
  box.replaceChildren();
  appendSpeciesLifetime(box, s);
  if (s.lifetime_profile_samples) {
    const relatives = document.createElement('div');
    box.appendChild(relatives);
    box = relatives;
  }
  if (!s.profile_samples || s.profile?.length !== 31) {
    box.textContent = t('behavior_view.verhaltenWirdNochBeobachtet');
    return;
  }
  const known =
            new Map([...family_modelState.speciesHistory.values(), ...all ].map(p => [p.id, p])),
        valid = p => p && p.id !== s.id && p.profile_samples > 0 && p.profile?.length === 31,
        choices = [];
  for (const [id, role] of [[ s.mother, t('behavior_view.mutterart') ],
                            [ s.father !== s.mother ? s.father : 0, t('behavior_view.vaterart') ]])
    if (valid(known.get(id)))
      choices.push({s : known.get(id), role});
  for (const p of known.values())
    if (p.mother === s.id && valid(p))
      choices.push({s : p, role : t('behavior_view.tochterart')});
  const nearest = all.filter(valid)
                      .filter(p => p.adults > 0)
                      .sort((a, b) => behaviorDistance(s.profile, a.profile) -
                                      behaviorDistance(s.profile, b.profile))[0];
  if (nearest && !choices.some(c => c.s.id === nearest.id))
    choices.push({s : nearest, role : t('behavior_view.aehnlichsteArt')});
  if (!choices.length) {
    box.textContent = t('behavior_view.nochKeinBeobachtetesVergleichsprofil');
    return;
  }
  const select = document.createElement('select'), chart = document.createElement('div');
  select.className = 'behavior-relative';
  select.setAttribute('aria-label', t('behavior_view.vergleichsart'));
  for (const c of choices) {
    const option = document.createElement('option');
    option.value = c.s.id;
    option.textContent = c.role + ' · ' + c.s.name;
    select.appendChild(option);
  }
  const picked = choices.find(c => c.s.id === owner.relativeId) || choices[0];
  select.value = String(picked.s.id);
  box.appendChild(select);
  box.appendChild(chart);
  const draw = () => {
    const c = choices.find(c => c.s.id === Number(select.value)) || choices[0];
    owner.relativeId = c.s.id;
    appendBehaviorComparison(chart, s.profile, c.s.profile, c.s.name);
  };
  select.onchange = draw;
  draw();
}

export function appendLineageBehavior(box, a, b) {
  const group = document.createElement('div');
  group.className = 'lineage-behavior';
  group.title =
      t('behavior_view.lineageCompare',
        {name : b.name, distance : formatNumber(behaviorDistance(a.profile, b.profile), 3, true)});
  for (const part of behaviorDeltaLabels(a.profile, b.profile, 2)) {
    const label = document.createElement('span');
    label.textContent = part.text;
    group.appendChild(label);
  }
  if (!group.children.length) {
    const same = document.createElement('span');
    same.textContent = t('behavior_view.gleicheLebensweise');
    group.appendChild(same);
  }
  const bar = document.createElement('div');
  bar.className = 'lineage-behavior-bars';
  const weights = behaviorContributions(a.profile, b.profile);
  for (let j = 0; j < 5; j++) {
    const group = BEHAVIOR_GROUPS[j], cell = document.createElement('i'),
          fill = document.createElement('i');
    fill.style.width = 100 * group.reduce((s, i) => s + weights[i], 0) / .2 + '%';
    fill.style.background = [ '#8bcab6', '#e2a77b', '#78b8d0', '#c1a3d9', '#d2bd79' ][j];
    cell.appendChild(fill);
    cell.title = t('behavior_view.groupVersus', {group : behaviorGroupNames[j], name : b.name});
    bar.appendChild(cell);
  }
  group.appendChild(bar);
  box.appendChild(group);
}

const initializers = {
  "behaviorGroupNames" : () => {
    behaviorGroupNames = [
      t('behavior_view.bewegung'), t('behavior_view.ernaehrung'), t('behavior_view.aufenthalt'),
      t('behavior_view.fortpflanzung'), t('behavior_view.aktivitaetUndFarbe')
    ];
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
