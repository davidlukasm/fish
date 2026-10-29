import {brainClamp} from './brain.js';
import {featureNames, featureValue} from './evolution.js';
import {lineageState} from './lineage.js';
export const behavior_viewState = {};
export let behaviorGroups;

export function behaviorContributions(a, b) {
  const weights = Array(31).fill(0);
  for (let k = 0; k < 5; ++k) {
    const group = behaviorGroups[k];
    if (k === 1) {
      let sum = 0;
      for (const i of group) {
        weights[i] = .1 * Math.abs((a[i] || 0) - (b[i] || 0));
        sum += weights[i];
      }
      if (sum > .2)
        for (const i of group)
          weights[i] *= .2 / sum;
      continue;
    }
    let sum = 0;
    for (const i of group)
      sum += ((a[i] || 0) - (b[i] || 0)) ** 2;
    if (sum > 0)
      for (const i of group)
        weights[i] = .2 * ((a[i] || 0) - (b[i] || 0)) ** 2 / Math.sqrt(group.length * sum);
  }
  return weights;
}

export function behaviorDistance(a, b) {
  return behaviorContributions(a, b).reduce((sum, v) => sum + v, 0);
}

export let behaviorGroupNames;

export function behaviorDeltaLabels(a, b, count = 2) {
  const weights = behaviorContributions(a, b), phrases = [
    [ 'schwimmt langsamer', 'schwimmt schneller' ],
    [ 'wendet weniger', 'wendet mehr' ],
    [ 'seltener langsam unterwegs', 'öfter langsam unterwegs' ],
    [ 'nutzt weniger Raum', 'nutzt mehr Raum' ],
    [ 'schlägt seltener', 'schlägt häufiger' ],
    [ 'gleitet weniger', 'gleitet mehr' ],
    [ 'weniger Futter', 'mehr Futter' ],
    [ 'weniger Fischfraß', 'mehr Fischfraß' ],
    [ 'weniger Eierfraß', 'mehr Eierfraß' ],
    [ 'weniger Aas', 'mehr Aas' ],
    [ 'seltener am Boden', 'öfter am Boden' ],
    [ 'seltener oben', 'öfter oben' ],
    [ 'legt seltener Eier', 'legt häufiger Eier' ],
    [ 'gibt seltener Sperma ab', 'gibt häufiger Sperma ab' ],
    [ 'schwächeres Saugsignal', 'stärkeres Saugsignal' ],
    [ 'weniger aggressiv', 'aggressiver' ],
    [ 'weniger Abwehr', 'mehr Abwehr' ],
    [ 'weniger Rot', 'röter' ],
    [ 'weniger Grün', 'grüner' ],
    [ 'weniger Blau', 'blauer' ],
    [ 'weniger Algen', 'mehr Algen' ],
    [ 'weniger Pflanzen', 'mehr Pflanzen' ],
    [ 'seltener an festen Flächen', 'öfter an festen Flächen' ],
    [ 'seltener im Bewuchs', 'öfter im Bewuchs' ],
    [ 'in klarerem Wasser', 'in trüberem Wasser' ],
    [ 'weniger Strömung', 'mehr Strömung' ],
    [ 'weniger Plankton', 'mehr Plankton' ],
    [ 'weniger Würmer', 'mehr Würmer' ],
    [ 'weniger Krabben', 'mehr Krabben' ],
    [ 'weniger Muscheln', 'mehr Muscheln' ],
    [ 'weniger Bodennahrung', 'mehr Bodennahrung' ]
  ];
  return weights.map((weight, i) => ({i, weight, text : phrases[i][a[i] >= b[i] ? 1 : 0]}))
      .filter(x => x.weight > 1e-8)
      .sort((x, y) => y.weight - x.weight)
      .slice(0, count);
}

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
  heading.textContent = name + ' · Abstand ' + distance.toFixed(3).replace('.', ',');
  heading.title =
      'Abstand der beobachteten Lebensweisen, berechnet wie in der Neuheitssuche. Jede der fünf Gruppen trägt höchstens 0,2 bei.';
  const g = canvas.getContext('2d', {willReadFrequently : true});
  g.clearRect(0, 0, 480, 210);
  g.font = '12px system-ui';
  g.textAlign = 'left';
  g.fillStyle = '#a2d9c6';
  g.fillRect(0, 5, 13, 4);
  g.fillText('Auswahl', 20, 12);
  g.fillStyle = '#96aabd';
  g.fillRect(110, 5, 13, 4);
  g.fillText('Vergleich', 130, 12);
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
    g.fillText('Gleiches beobachtetes Verhalten', 0, 78);
  }
  for (let j = 0; j < 5; j++) {
    const group = behaviorGroups[j], value = group.reduce((s, i) => s + weights[i], 0) / .2,
          x = j * 97;
    g.fillStyle = '#8fa9af';
    g.font = '10px system-ui';
    g.fillText([ 'Bewegung', 'Ernährung', 'Aufenthalt', 'Nachwuchs', 'Aktivität/Farbe' ][j], x,
               187);
    g.fillStyle = '#263f49';
    g.fillRect(x, 195, 87, 6);
    g.fillStyle = [ '#8bcab6', '#e2a77b', '#78b8d0', '#c1a3d9', '#d2bd79' ][j];
    g.fillRect(x, 195, 87 * value, 6);
  }
  canvas.onpointermove = e => {
    const rect = canvas.getBoundingClientRect(), y = (e.clientY - rect.top) / rect.height * 210;
    if (y < 170) {
      const part = top[Math.max(0, Math.min(top.length - 1, Math.floor((y - 28) / 45)))];
      canvas.title = part ? featureNames[part.i] + ': Auswahl ' + featureValue(part.i, a[part.i]) +
                                ' · Vergleich ' + featureValue(part.i, b[part.i])
                          : 'Gleiches beobachtetes Verhalten';
    } else {
      const j = Math.max(0, Math.min(4, Math.floor((e.clientX - rect.left) / rect.width * 5))),
            group = behaviorGroups[j];
      canvas.title =
          behaviorGroupNames[j] + ' · ' +
          Math.round(group.reduce((s, i) => s + weights[i], 0) / Math.max(1e-9, distance) * 100) +
          ' % des gesamten Profilabstands';
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
  g.fillText('Gesamt', 24, 14);
  g.globalAlpha = .55;
  g.fillRect(110, 8, 14, 4);
  g.globalAlpha = 1;
  g.fillText('Lebend', 130, 14);
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
    tips.push(featureNames[k] + ': Gesamt ' + featureValue(k, a[k] || 0) + ' · Lebend ' +
              (b.length ? featureValue(k, b[k] || 0) : '–'));
  });
  canvas.setAttribute('aria-label', tips.join('; '));
  const note =
      'Gesamt: Mittel aller Verhaltensbeobachtungen, einschließlich verstorbener Fische. Lebend: zuletzt beobachtetes Verhalten des heutigen Bestands.';
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
    box.textContent = 'Verhalten wird noch beobachtet.';
    return;
  }
  const known = new Map([...lineageState.speciesHistory.values(), ...all ].map(p => [p.id, p])),
        valid = p => p && p.id !== s.id && p.profile_samples > 0 && p.profile?.length === 31,
        choices = [];
  for (const [id, role] of [[ s.mother, 'Mutterart' ],
                            [ s.father !== s.mother ? s.father : 0, 'Vaterart' ]])
    if (valid(known.get(id)))
      choices.push({s : known.get(id), role});
  for (const p of known.values())
    if (p.mother === s.id && valid(p))
      choices.push({s : p, role : 'Tochterart'});
  const nearest = all.filter(valid)
                      .filter(p => p.adults > 0)
                      .sort((a, b) => behaviorDistance(s.profile, a.profile) -
                                      behaviorDistance(s.profile, b.profile))[0];
  if (nearest && !choices.some(c => c.s.id === nearest.id))
    choices.push({s : nearest, role : 'Ähnlichste Art'});
  if (!choices.length) {
    box.textContent = 'Noch kein beobachtetes Vergleichsprofil.';
    return;
  }
  const select = document.createElement('select'), chart = document.createElement('div');
  select.className = 'behavior-relative';
  select.setAttribute('aria-label', 'Vergleichsart');
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
  group.title = 'Lebensweise gegenüber ' + b.name + ' · Neuheitsabstand ' +
                behaviorDistance(a.profile, b.profile).toFixed(3).replace('.', ',');
  for (const part of behaviorDeltaLabels(a.profile, b.profile, 2)) {
    const label = document.createElement('span');
    label.textContent = part.text;
    group.appendChild(label);
  }
  if (!group.children.length) {
    const same = document.createElement('span');
    same.textContent = 'gleiche Lebensweise';
    group.appendChild(same);
  }
  const bar = document.createElement('div');
  bar.className = 'lineage-behavior-bars';
  const weights = behaviorContributions(a.profile, b.profile);
  for (let j = 0; j < 5; j++) {
    const group = behaviorGroups[j], cell = document.createElement('i'),
          fill = document.createElement('i');
    fill.style.width = 100 * group.reduce((s, i) => s + weights[i], 0) / .2 + '%';
    fill.style.background = [ '#8bcab6', '#e2a77b', '#78b8d0', '#c1a3d9', '#d2bd79' ][j];
    cell.appendChild(fill);
    cell.title = behaviorGroupNames[j] + ' gegenüber ' + b.name;
    bar.appendChild(cell);
  }
  group.appendChild(bar);
  box.appendChild(group);
}

const initializers = {
  "behaviorGroups" : () => {
    behaviorGroups = [
      [ 0, 1, 2, 3, 4, 5 ], [ 6, 7, 8, 9, 20, 21, 26, 27, 28, 29, 30 ], [ 10, 11, 22, 23, 24, 25 ],
      [ 12, 13 ], [ 14, 15, 16, 17, 18, 19 ]
    ];
  },
  "behaviorGroupNames" : () => {
    behaviorGroupNames =
        [ 'Bewegung', 'Ernährung', 'Aufenthalt', 'Fortpflanzung', 'Aktivität und Farbe' ];
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
