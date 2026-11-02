import {PERCENT} from './units.js';
import {family_modelState} from './family_model.js';
import {
  BEHAVIOR_GROUPS,
  behaviorContributions,
  behaviorDeltaLabels,
  behaviorDistance
} from './behavior_model.js';
import {cssPercent, formatNumber, t, tList} from './strings.js';
import {brainClamp} from './brain.js';
import {featureNames, featureValue} from './evolution.js';
import {BEHAVIOR, BEHAVIOR_FEATURE, TOLERANCE} from './schema.js';
export const behavior_viewState = {};

export let behaviorGroupNames;

// One colour per behaviour group: movement, feeding, place, offspring, activity and colour.
const GROUP_COLORS = [ '#8bcab6', '#e2a77b', '#78b8d0', '#c1a3d9', '#d2bd79' ];
// Behaviour comparison canvas in pixels: the ROWS most different features in rows ROW apart from
// ROW_TOP, both values as half bars, then the behaviour groups GROUP_WIDTH apart from GROUPS_Y on.
const COMPARISON = Object.freeze({
  width : 480,
  height : 210,
  rows : 3,
  digits : 3,
  key_y : 5,
  key_width : 13,
  key_height : 4,
  key_text_x : 20,
  key_text_y : 12,
  key2_x : 110,
  key2_text_x : 130,
  row_top : 34,
  row : 45,
  name_dy : 10,
  bar_x : 174,
  bar_width : 183,
  bar_height : 18,
  half_bar : 7,
  second_dy : 11,
  value_x : 365,
  value_dy : 7,
  second_value_dy : 22,
  same_y : 78,
  group_width : 97,
  group_label_y : 187,
  group_bar_y : 195,
  group_bar : 87,
  group_bar_height : 6,
  groups_y : 170,
  row_hit : 28,
  selected : '#a2d9c6',
  compared : '#96aabd',
  text : '#d8e6e3',
  track : '#263f49',
  group_label : '#8fa9af'
});
export function appendBehaviorComparison(
    box, a, b, name, legend = [ t('behavior_view.auswahl'), t('behavior_view.vergleich') ]) {
  let parts = box.behaviorParts;
  if (!parts || !Array.from(box.children).includes(parts.canvas)) {
    box.replaceChildren();
    const heading = document.createElement('p'), canvas = document.createElement('canvas');
    heading.className = 'behavior-heading';
    canvas.width = COMPARISON.width;
    canvas.height = COMPARISON.height;
    canvas.className = 'behavior-comparison';
    box.appendChild(heading);
    box.appendChild(canvas);
    parts = box.behaviorParts = {heading, canvas};
  }
  const {heading, canvas} = parts, weights = behaviorContributions(a, b),
                  distance = weights.reduce((s, w) => s + w, 0),
                  top = behaviorDeltaLabels(a, b, COMPARISON.rows);
  heading.textContent = t('behavior_view.distanceHeading',
                          {name, distance : formatNumber(distance, COMPARISON.digits, true)});
  heading.title = t('behavior_view.abstandDerBeobachtetenLebensweisen');
  const g = canvas.getContext('2d', {willReadFrequently : true});
  g.clearRect(0, 0, COMPARISON.width, COMPARISON.height);
  g.font = '12px system-ui';
  g.textAlign = 'left';
  g.fillStyle = COMPARISON.selected;
  g.fillRect(0, COMPARISON.key_y, COMPARISON.key_width, COMPARISON.key_height);
  g.fillText(legend[0], COMPARISON.key_text_x, COMPARISON.key_text_y);
  g.fillStyle = COMPARISON.compared;
  g.fillRect(COMPARISON.key2_x, COMPARISON.key_y, COMPARISON.key_width, COMPARISON.key_height);
  g.fillText(legend[1], COMPARISON.key2_text_x, COMPARISON.key_text_y);
  for (let j = 0; j < top.length; j++) {
    const i = top[j].i, y = COMPARISON.row_top + j * COMPARISON.row;
    g.fillStyle = COMPARISON.text;
    g.fillText(top[j].text, 0, y + COMPARISON.name_dy);
    g.fillStyle = COMPARISON.track;
    g.fillRect(COMPARISON.bar_x, y, COMPARISON.bar_width, COMPARISON.bar_height);
    g.fillStyle = COMPARISON.selected;
    g.fillRect(COMPARISON.bar_x, y, COMPARISON.bar_width * brainClamp(a[i]), COMPARISON.half_bar);
    g.fillStyle = COMPARISON.compared;
    g.fillRect(COMPARISON.bar_x, y + COMPARISON.second_dy, COMPARISON.bar_width * brainClamp(b[i]),
               COMPARISON.half_bar);
    g.fillStyle = COMPARISON.text;
    g.fillText(featureValue(i, a[i]), COMPARISON.value_x, y + COMPARISON.value_dy);
    g.fillStyle = COMPARISON.compared;
    g.fillText(featureValue(i, b[i]), COMPARISON.value_x, y + COMPARISON.second_value_dy);
  }
  if (!top.length) {
    g.fillStyle = COMPARISON.selected;
    g.fillText(t('behavior_view.gleichesBeobachtetesVerhalten'), 0, COMPARISON.same_y);
  }
  for (let j = 0; j < BEHAVIOR_GROUPS.length; j++) {
    const group = BEHAVIOR_GROUPS[j],
          value = group.reduce((s, i) => s + weights[i], 0) / BEHAVIOR.group_weight,
          x = j * COMPARISON.group_width;
    g.fillStyle = COMPARISON.group_label;
    g.font = '10px system-ui';
    g.fillText(tList('behavior_view.groupLabels')[j], x, COMPARISON.group_label_y);
    g.fillStyle = COMPARISON.track;
    g.fillRect(x, COMPARISON.group_bar_y, COMPARISON.group_bar, COMPARISON.group_bar_height);
    g.fillStyle = GROUP_COLORS[j];
    g.fillRect(x, COMPARISON.group_bar_y, COMPARISON.group_bar * value,
               COMPARISON.group_bar_height);
  }
  canvas.onpointermove = e => {
    const rect = canvas.getBoundingClientRect(),
          y = (e.clientY - rect.top) / rect.height * COMPARISON.height;
    if (y < COMPARISON.groups_y) {
      const part = top[Math.max(
          0, Math.min(top.length - 1, Math.floor((y - COMPARISON.row_hit) / COMPARISON.row)))];
      canvas.title = part ? t('behavior_view.featureCompare', {
        feature : featureNames[part.i],
        selected : featureValue(part.i, a[part.i]),
        compared : featureValue(part.i, b[part.i])
      })
                          : t('behavior_view.gleichesBeobachtetesVerhalten');
    } else {
      const j = Math.max(0, Math.min(BEHAVIOR_GROUPS.length - 1,
                                     Math.floor((e.clientX - rect.left) / rect.width *
                                                BEHAVIOR_GROUPS.length))),
            group = BEHAVIOR_GROUPS[j];
      canvas.title = t('behavior_view.groupShare', {
        group : behaviorGroupNames[j],
        n : Math.round(group.reduce((s, i) => s + weights[i], 0) /
                       Math.max(TOLERANCE.negligible, distance) * PERCENT)
      });
    }
  };
}

// Lifetime profile canvas in pixels: one feature per ROW from ROW_TOP, lifetime bars above, living
// ones LIVING_ALPHA faint below.
const LIFETIME = Object.freeze({
  width : 360,
  top : 32,
  row : 24,
  key_x : 4,
  key_y : 8,
  key_width : 14,
  key_height : 4,
  key_text_x : 24,
  key_text_y : 14,
  living_alpha : .55,
  key2_x : 110,
  key2_text_x : 130,
  row_top : 38,
  bar_x : 150,
  bar_top : 10,
  bar_width : 90,
  bar_height : 12,
  half_bar : 5,
  value_dy : 3,
  value_x : 354,
  living_dy : 8,
  row_hit : 25,
  lifetime : '#a2d9c6',
  name : '#bad0d3',
  track : '#2b424a',
  value : '#e0e9e6'
});
function appendSpeciesLifetime(box, s) {
  if (!s.lifetime_profile_samples)
    return;
  const canvas = document.createElement('canvas'), F = BEHAVIOR_FEATURE, features = [
    F.travel, F.turn, F.pauses, F.range, F.pulses, F.glides, F.bottom, F.top, F.spawn, F.sperm,
    F.mouth, F.aggression, F.defense, F.red, F.green, F.blue, F.turbidity, F.current
  ];
  canvas.width = LIFETIME.width;
  canvas.height = LIFETIME.top + features.length * LIFETIME.row;
  canvas.className = 'behavior-comparison';
  canvas.setAttribute('role', 'img');
  box.appendChild(canvas);
  const g = canvas.getContext('2d'), a = s.lifetime_profile, b = s.adults ? s.profile : [],
        tips = [];
  g.font = '11px system-ui';
  g.fillStyle = LIFETIME.lifetime;
  g.fillRect(LIFETIME.key_x, LIFETIME.key_y, LIFETIME.key_width, LIFETIME.key_height);
  g.fillText(t('behavior_view.gesamt'), LIFETIME.key_text_x, LIFETIME.key_text_y);
  g.globalAlpha = LIFETIME.living_alpha;
  g.fillRect(LIFETIME.key2_x, LIFETIME.key_y, LIFETIME.key_width, LIFETIME.key_height);
  g.globalAlpha = 1;
  g.fillText(t('behavior_view.lebend'), LIFETIME.key2_text_x, LIFETIME.key_text_y);
  features.forEach((k, i) => {
    const y = LIFETIME.row_top + i * LIFETIME.row;
    g.textAlign = 'left';
    g.fillStyle = LIFETIME.name;
    g.fillText(featureNames[k], LIFETIME.key_x, y);
    g.fillStyle = LIFETIME.track;
    g.fillRect(LIFETIME.bar_x, y - LIFETIME.bar_top, LIFETIME.bar_width, LIFETIME.bar_height);
    g.fillStyle = LIFETIME.lifetime;
    g.fillRect(LIFETIME.bar_x, y - LIFETIME.bar_top, LIFETIME.bar_width * brainClamp(a[k] || 0),
               LIFETIME.half_bar);
    g.globalAlpha = LIFETIME.living_alpha;
    g.fillRect(LIFETIME.bar_x, y - LIFETIME.value_dy, LIFETIME.bar_width * brainClamp(b[k] || 0),
               LIFETIME.half_bar);
    g.globalAlpha = 1;
    g.textAlign = 'right';
    g.fillStyle = LIFETIME.value;
    g.fillText(featureValue(k, a[k] || 0), LIFETIME.value_x, y - LIFETIME.value_dy);
    g.globalAlpha = LIFETIME.living_alpha;
    g.fillText(b.length ? featureValue(k, b[k] || 0) : '–', LIFETIME.value_x,
               y + LIFETIME.living_dy);
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
          i = Math.floor(((e.clientY - r.top) * canvas.height / r.height - LIFETIME.row_hit) /
                         LIFETIME.row);
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
  if (!s.profile_samples || s.profile?.length !== BEHAVIOR_FEATURE.count) {
    box.textContent = t('behavior_view.verhaltenWirdNochBeobachtet');
    return;
  }
  const known =
            new Map([...family_modelState.speciesHistory.values(), ...all ].map(p => [p.id, p])),
        valid = p => p && p.id !== s.id && p.profile_samples > 0 &&
                     p.profile?.length === BEHAVIOR_FEATURE.count,
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
  for (let j = 0; j < BEHAVIOR_GROUPS.length; j++) {
    const group = BEHAVIOR_GROUPS[j], cell = document.createElement('i'),
          fill = document.createElement('i');
    fill.style.width =
        cssPercent(group.reduce((s, i) => s + weights[i], 0) / BEHAVIOR.group_weight);
    fill.style.background = GROUP_COLORS[j];
    cell.appendChild(fill);
    cell.title = t('behavior_view.groupVersus', {group : behaviorGroupNames[j], name : b.name});
    bar.appendChild(cell);
  }
  group.appendChild(bar);
  box.appendChild(group);
}

const initializers = {
  "behaviorGroupNames" : () => { behaviorGroupNames = tList('behavior_view.groupNames'); }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
