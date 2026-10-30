import {t} from './strings.js';
import {setBrainTool} from './brain_probe.js';
import {
  brainClamp,
  brainSelectedTissue,
  brainState,
  brainTissueName,
  focusTissue
} from './brain.js';
import {brainMotorColors, brainSenseColors} from './brain_model.js';
import {el, text} from './dom.js';
import {drawOrganGraphic} from './organ_graphics.js';
import {brainOrganReadout, organHistory} from './organ_readout.js';
import {drawOrganTuning} from './organ_tuning.js';
import {sceneState} from './state.js';
export const organsState = {};

export function organSignalHistory(d, tissue, info) {
  const key = d.b.layout_id + ':' + tissue.key + ':' + tissue.side + ':' + (tissue.variant || '');
  let history = organHistory.get(key);
  if (!history) {
    if (organHistory.size > 64)
      organHistory.clear();
    organHistory.set(key, history = []);
  }
  if (history.length && sceneState.frame.step < history[history.length - 1][0])
    history.length = 0;
  const sample = [ sceneState.frame.step, info.series ];
  if (history.length && history[history.length - 1][0] === sceneState.frame.step)
    history[history.length - 1] = sample;
  else
    history.push(sample);
  while (history.length > 120 || history.length > 1 && history[0][0] < sceneState.frame.step - 300)
    history.shift();
  return history;
}

export let brainOrganMetrics;

export function brainShowOrgan(d, tissue = brainSelectedTissue(d)) {
  el('brain-organ-info').hidden = !tissue;
  if (!tissue) {
    organsState.organShownKey = '';
    return;
  }
  const signature = d.b.layout_id + ':' + sceneState.frameRevision + ':' + tissue.key + ':' +
                    tissue.side + ':' + (tissue.variant || '') + ':' + (tissue.group || '');
  if (signature === organsState.organShownKey)
    return;
  organsState.organShownKey = signature;
  const info = brainOrganReadout(d, tissue);
  text('brain-tissue-info', info.title);
  text('brain-organ-cells', info.cells          ? t('organs.cells', {n : info.cells})
                            : info.key === 's4' ? t('organs.ohneEnergiesinn')
                                                : '');
  text('brain-organ-value', info.hero);
  text('brain-organ-meaning', info.caption);
  brainOrganMetrics.forEach((row, i) => {
    const m = info.metrics[i];
    row.box.hidden = !m;
    if (m) {
      row.label.textContent = m.label;
      row.value.textContent = m.value;
      row.box.title = m.hint;
    }
  });
  const canvas = el('brain-organ-chart');
  canvas.setAttribute('aria-label', info.title + ' · ' + info.caption + ' · ' + info.hero);
  drawOrganGraphic(canvas, info, d, tissue);
  drawOrganTuning(el('brain-organ-tuning'), info, d, tissue);
  canvas.onpointermove = e => {
    if (info.graphic !== 'eye') {
      canvas.title = info.caption;
      return;
    }
    const rect = canvas.getBoundingClientRect(), x = (e.clientX - rect.left) / rect.width * 360,
          angle = brainClamp((x - 12) / 336) * 234 - 117;
    canvas.title = Math.abs(angle) < 2 ? t('organs.geradeaus')
                                       : t(angle < 0 ? 'organs.angleLeft' : 'organs.angleRight',
                                           {n : Math.round(Math.abs(angle))});
  };
}

// Organ symbols (24 × 24 paths) and the groups the Organe tab shows them in.
export const ORGAN_ICONS = {
  s0 : 'M2 12c3-5 7-7 10-7s7 2 10 7c-3 5-7 7-10 7s-7-2-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  s1 :
      'M8 15a3 3 0 1 0 .01 0M16 15a3 3 0 1 0 .01 0M6 8c2-2 4-2 6 0s4 2 6 0M6 4c2-2 4-2 6 0s4 2 6 0',
  barbel : 'M12 6v4M12 10c-2 3-5 4-8 9M12 10c2 3 5 4 8 9',
  s2 : 'M2 12h3M7 12h3M12 12h3M17 12h3M4 8c5-3 11-3 16 0M4 16c5 3 11 3 16 0',
  s3 : 'M5 5h14v14H5zM9 9h.01M15 9h.01M9 15h.01M15 15h.01M12 12h.01',
  s4 : 'M4 8h14v8H4zM18 11h2v2h-2M7 10v4M10 10v4M13 10v4',
  s5 : 'M4 5h16l-6 7v7h-4v-7z',
  s6 : 'M13 2L6 13h5l-2 9 8-12h-5z',
  s7 : 'M12 3v15M7 13l5 5 5-5M5 21h14',
  s8 : 'M3 12h18M6 9l-3 3 3 3M18 9l3 3-3 3',
  s9 : 'M12 2l2 6 6-2-4 5 5 4-6 0-1 6-3-5-5 3 2-6-5-3 6-1z',
  s10 : 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z',
  m0 : 'M3 12c4-4 8-4 11 0-3 4-7 4-11 0zM14 12l7-6v12z',
  m1 : 'M5 15a7 7 0 1 1 7 6M12 21l-3-3M12 21l3-2',
  m2 : 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM4 12h5M20 12h-5M12 4v5M12 20v-5',
  m3 : 'M12 3c4 0 7 6 7 11a7 7 0 0 1-14 0c0-5 3-11 7-11z',
  m4 : 'M8 8a3 3 0 1 0 .01 0M8 11c0 4 3 6 8 9M16 4a2 2 0 1 0 .01 0M16 6c1 3 3 4 5 5',
  m5 :
      'M3 7c4 6 14 6 18 0M3 17c4-6 14-6 18 0M7 9l1-2 1 2M11 10l1-2 1 2M15 9l1-2 1 2M7 15l1 2 1-2M11 14l1 2 1-2M15 15l1 2 1-2',
  m6 : 'M3 19l3-9 3 9M10 19l3-12 3 12M17 19l2-7 2 7',
  m7 : 'M6 6a2 2 0 1 0 .01 0M14 5a3 3 0 1 0 .01 0M8 15a3 3 0 1 0 .01 0M17 15a2 2 0 1 0 .01 0',
  m8 : 'M12 3a6 7 0 1 0 0 14 6 7 0 0 0 0-14zM12 17v4',
  m9 : 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8c2 3 3 4 3 6a3 3 0 0 1-6 0c0-2 1-3 3-6z',
  internal :
      'M6 6a2 2 0 1 0 .01 0M18 6a2 2 0 1 0 .01 0M12 18a2 2 0 1 0 .01 0M6 8l6 8M18 8l-6 8M8 6h8'
};
const organGroups = () => [
    [ t('organs.sinne'), [ 's0', 's1', 'barbel', 's2', 's3', 's7', 's8' ] ],
    [ t('organs.innereFuehler'), [ 's4', 's6', 's9', 's10' ] ],
    [ t('organs.bewegung'), [ 'm0', 'm1', 'm8' ] ], [ t('organs.fressen'), [ 'm2', 'm5', 's5' ] ],
    [ t('organs.schutzUndSignale'), [ 'm6', 'm7' ] ], [ t('organs.fortpflanzung'), [ 'm3', 'm4' ] ],
    [ t('organs.steuerung'), [ 'm9', 'internal' ] ]];

function organIconKey(tissue) { return tissue.variant === 'barbel' ? 'barbel' : tissue.key; }

// The stimulus panel follows the chosen organ: light for the eyes, scent for nose and barbels,
// the matching body sense otherwise; organs without a sense get no stimulus.
function matchStimulus(tissue) {
  const key = tissue ? tissue.key : '', signature = key + ':' + (tissue?.variant || '');
  if (organsState.stimulusFor === signature)
    return;
  organsState.stimulusFor = signature;
  const body = [ 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9' ].includes(key),
        tool = key === 's0'   ? 'light'
               : key === 's1' ? 'scent'
               : body         ? 'body'
                              : '';
  el('brain-inputs').hidden = !tool;
  el('brain-inputs-none').hidden = !tissue || !!tool;
  if (!tool)
    return;
  setBrainTool(tool);
  if (body) {
    const select = el('brain-body-sense');
    select.value = key;
    select.onchange?.();
  }
  el('brain-inputs').querySelector('summary').textContent =
      t('organs.stimulusFor',
        {name : tissue.variant === 'barbel' ? t('organs.barteln') : brainTissueName(key)});
}

// Only organs this fish has: one symbol per organ, both sides together; a click shows it and
// marks it on the fish, another click on a paired organ switches the side.
export function renderOrganIcons(d) {
  const box = el('organ-icons');
  if (!box)
    return;
  const present = new Map();
  for (const [id, tissue] of d.tissues)
    if (tissue.members.length || tissue.key === 's4' || tissue.key === 's8') {
      const key = organIconKey(tissue);
      if (!present.has(key))
        present.set(key, []);
      present.get(key).push(id);
    }
  const pinned =
      d.tissues.get(brainState.brainPinnedTissue || '') ? brainState.brainPinnedTissue : '';
  matchStimulus(pinned && d.tissues.get(pinned));
  const signature =
      d.b.layout_id + ':' + [...present ].map(([ k, ids ]) => k + ids.length).join() + ':' + pinned;
  if (box.organSignature === signature)
    return;
  box.organSignature = signature;
  box.replaceChildren();
  for (const [title, keys] of organGroups()) {
    const shown = keys.filter(k => present.has(k));
    if (!shown.length)
      continue;
    const group = document.createElement('div'), label = document.createElement('small');
    group.className = 'organ-icon-group';
    label.textContent = title;
    group.append(label);
    for (const key of shown) {
      const ids = present.get(key).sort(), button = document.createElement('button'),
            base = key === 'barbel' ? 's1' : key, k = Number(base.slice(1)),
            color = base === 'internal' ? '#a7b6d5'
                    : base[0] === 's'   ? brainSenseColors[k]
                                        : brainMotorColors[k],
            name = key === 'barbel' ? t('organs.barteln') : brainTissueName(base);
      button.type = 'button';
      button.className = 'organ-icon';
      button.style.setProperty('--organ-color', color);
      button.title = ids.length > 1 ? t('organs.sides', {name, n : ids.length}) : name;
      button.setAttribute('aria-pressed', String(ids.includes(pinned)));
      button.innerHTML =
          '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="' +
          ORGAN_ICONS[key] +
          '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>' +
          name + (ids.length > 1 ? ' ×' + ids.length : '') + '</span>';
      button.onclick = () => {
        const next = ids.includes(pinned) ? ids[(ids.indexOf(pinned) + 1) % ids.length] : ids[0];
        const member = d.tissues.get(next).members[0];
        focusTissue({tissue : next, part : member?.part.key || d.tissues.get(next).key});
      };
      group.append(button);
    }
    box.append(group);
  }
}

const initializers = {
  "brainOrganMetrics" : () => { brainOrganMetrics = []; },
  "createElement_div" : () => {
    for (let i = 0; i < 2; i++) {
      const box = document.createElement('div'), label = document.createElement('small'),
            value = document.createElement('output');
      box.appendChild(label);
      box.appendChild(value);
      el('brain-organ-metrics').appendChild(box);
      brainOrganMetrics.push({box, label, value});
    }
  },
  "organShownKey" : () => { organsState.organShownKey = ''; }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
