import {ORGAN_ICONS} from './organ_icons.js';
import {
  BARBEL,
  GUT_TISSUE,
  INTERNAL_TISSUE,
  MOTOR_TISSUE,
  RESERVE_TISSUE,
  SENSE_TISSUE,
  sidedTissue,
  tissueBase,
  tissueKind,
  tissueSide
} from './tissue.js';
import {t, tList} from './strings.js';
import {setBrainTool} from './brain_probe.js';
import {brainSelectedTissue, brainState, brainTissueName, focusTissue} from './brain.js';
import {tissueColor} from './brain_model.js';
import {el, text} from './dom.js';
import {ORGAN_GROUPS} from './body_model.js';
import {drawOrganGraphic, eyeGraphicAngle} from './organ_graphics.js';
import {brainOrganReadout, organHistory} from './organ_readout.js';
import {drawOrganTuning} from './organ_tuning.js';
import {sceneState} from './state.js';
export const organsState = {};

// Signal histories: at most ORGANS organs, each up to SAMPLES samples from the last STEPS steps.
const HISTORY = Object.freeze({organs : 64, samples : 120, steps : 300});
// Bearings within STRAIGHT_AHEAD degrees count as straight ahead.
const STRAIGHT_AHEAD = 2;
export function organSignalHistory(d, tissue, info) {
  const key = d.b.layout_id + ':' + tissue.key + ':' + tissue.side + ':' + (tissue.variant || '');
  let history = organHistory.get(key);
  if (!history) {
    if (organHistory.size > HISTORY.organs)
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
  while (history.length > HISTORY.samples ||
         history.length > 1 && history[0][0] < sceneState.frame.step - HISTORY.steps)
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
  text('brain-organ-cells', info.cells ? t('organs.cells', {n : info.cells})
                            : info.key === SENSE_TISSUE.proximity ? t('organs.noProximityCells')
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
    const angle = eyeGraphicAngle(e, canvas);
    canvas.title = Math.abs(angle) < STRAIGHT_AHEAD
                       ? t('organs.geradeaus')
                       : t(angle < 0 ? 'organs.angleLeft' : 'organs.angleRight',
                           {n : Math.round(Math.abs(angle))});
  };
}

// Organ symbols (24 × 24 paths) and the groups the Organe tab shows them in.

// The gonad pressure sense has two receptor kinds (eggs, sperm); each is an organ of its own.
function organIconKey(tissue) {
  return tissue.variant === BARBEL                    ? BARBEL
         : tissue.key === SENSE_TISSUE.gonad_pressure ? sidedTissue(tissue.key, tissue.side)
                                                      : tissue.key;
}

function organName(key) {
  const base = tissueBase(key), side = tissueSide(key);
  return key === BARBEL                         ? t('organs.barteln')
         : base === SENSE_TISSUE.gonad_pressure ? tList('body_model.fillingNames')[Number(side)]
                                                : brainTissueName(base);
}

// The stimulus panel follows the chosen organ: light for the eyes, scent for nose and barbels,
// the matching body sense otherwise; organs without a sense get no stimulus.
function matchStimulus(tissue) {
  const key = tissue ? tissue.key : '', signature = key + ':' + (tissue?.variant || '');
  if (organsState.stimulusFor === signature)
    return;
  organsState.stimulusFor = signature;
  const body =
            [
              SENSE_TISSUE.flow, SENSE_TISSUE.touch, SENSE_TISSUE.proximity, SENSE_TISSUE.intake,
              SENSE_TISSUE.damage, SENSE_TISSUE.bladder_pressure, SENSE_TISSUE.gonad_pressure,
              SENSE_TISSUE.inner_pressure, SENSE_TISSUE.blood
            ].includes(key),
        tool = key === SENSE_TISSUE.light  ? 'light'
               : key === SENSE_TISSUE.odor ? 'scent'
               : body                      ? 'body'
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
      t('organs.stimulusFor', {name : organName(organIconKey(tissue))});
}

// Only organs this fish has: one symbol per organ, both sides together; a click shows it and
// marks it on the fish, another click on a paired organ switches the side.
export function renderOrganIcons(d) {
  const box = el('organ-icons');
  if (!box)
    return;
  const present = new Map();
  for (const [id, tissue] of d.tissues)
    if (tissue.members.length || tissue.key === GUT_TISSUE || tissue.key === RESERVE_TISSUE) {
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
  for (const [title, keys] of ORGAN_GROUPS) {
    const shown = keys.filter(k => present.has(k));
    if (!shown.length)
      continue;
    const group = document.createElement('div'), label = document.createElement('small'),
          chips = document.createElement('span');
    group.className = 'organ-icon-group';
    label.textContent = t(title);
    group.append(label, chips);
    for (const key of shown) {
      const ids = present.get(key).sort(), button = document.createElement('button'),
            base = key === BARBEL ? SENSE_TISSUE.odor : tissueBase(key), k = tissueKind(base),
            color = tissueColor(base), name = organName(key);
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
      chips.append(button);
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
