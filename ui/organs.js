import {brainClamp, brainSelectedTissue} from './brain.js';
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
  text('brain-organ-cells', info.cells          ? info.cells + ' Zellen'
                            : info.key === 's4' ? 'Nähezellen fehlen'
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
    canvas.title = Math.abs(angle) < 2
                       ? 'Geradeaus'
                       : Math.round(Math.abs(angle)) + '° ' + (angle < 0 ? 'links' : 'rechts');
  };
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
