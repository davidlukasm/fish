import {FULL_TURN, heading, hueRGB, PERCENT, radians} from './units.js';
import {tissueKind} from './tissue.js';
import {percent, t} from './strings.js';
import {PROBE_KIND, SENSORY_PROBE} from './schema.js';
import {updateBrainState} from './brain.js';
import {brainClamp, brainState} from './brain.js';
import {brainArmProbe, brain_inputState} from './brain_input.js';

import {scentColors, scentNames} from './brain_model.js';

import {screenToWorld} from './camera.js';
import {el, rgb, text} from './dom.js';
import {command} from './session.js';
import {displayNow, frameFish, horizontalDelta, sceneState} from './state.js';
import {draw} from './tank.js';
export const brain_probeState = {};

export let brainMixInputs;

export let brainMixOutputs;

export let brainHandles;

function setBrainMix(k, value) {
  value = brainClamp(value);
  const other = brainState.brainMix.reduce((s, v, j) => s + (j === k ? 0 : v), 0);
  const factor = other > 1 - value && other > 0 ? (1 - value) / other : 1;
  updateBrainState({brainMix : brainState.brainMix.map((v, j) => j === k ? value : v * factor)});
  brainUpdateWheel();
}

const WHEEL = Object.freeze({center : 50, radius : 43, handle : 12, handle_span : 31});
const PROBE_SEND = Object.freeze({move : .25, interval : 120, idle : 700});
export function brainUpdateWheel() {
  const scent = brainState.brainTool === 'scent', body = brainState.brainTool === 'body';
  el('brain-wheel-box').hidden = body;
  el('brain-scent-mix').hidden = !scent;
  el('brain-scent-handles').hidden = !scent;
  el('brain-wheel-mark').hidden = scent;
  el('brain-hue').hidden = scent;
  el('brain-strength-control').hidden = body;
  el('brain-body-control').hidden = !body;
  el('brain-size-control').hidden = brainState.brainTool !== 'light';
  text('brain-wheel-label',
       scent ? t('brain_probe.duftmischung12SchritteVorschau') : t('brain_probe.lichtfarbe'));
  text('brain-hue-value', scent ? '' : t('units.degrees', {n : Math.round(brainState.brainHue)}));
  brainArmProbe(brainState.brainProbeArmed && !body);
  const angle = radians(brainState.brainHue);
  el('brain-wheel-mark').style.left = (WHEEL.center + WHEEL.radius * Math.cos(angle)) + '%';
  el('brain-wheel-mark').style.top = (WHEEL.center + WHEEL.radius * Math.sin(angle)) + '%';
  el('brain-wheel-mark').style.background = rgb(hueRGB(brainState.brainHue));
  el('brain-hue').value = brainState.brainHue;
  for (let k = 0; k < scentColors.length; k++) {
    brainMixInputs[k].value = Math.round(brainState.brainMix[k] * PERCENT);
    brainMixOutputs[k].textContent = percent(brainState.brainMix[k]);
    const angle = k * 2 * Math.PI / scentColors.length,
          len = WHEEL.handle + WHEEL.handle_span * brainState.brainMix[k];
    brainHandles[k].style.left = (WHEEL.center + len * Math.cos(angle)) + '%';
    brainHandles[k].style.top = (WHEEL.center + len * Math.sin(angle)) + '%';
    brainHandles[k].style.background = scentColors[k];
  }
}

export async function sendBrainProbe(location = brainState.brainProbePoint) {
  if (!brainState.brainOpen || brainState.brainBusy || !sceneState.frame?.selected)
    return;
  const p = frameFish(sceneState.frame);
  if (!p)
    return;
  if (brainState.brainTool !== 'body' && !location) {
    brainArmProbe(true);
    return;
  }
  const strength = Number(el('brain-strength').value) / PERCENT,
        sense = tissueKind(el('brain-body-sense').value),
        value = Number(el('brain-body-input').value) / PERCENT,
        point = location || {x : p[0], y : p[1]};
  updateBrainState({brainProbePoint : {...point}});
  await command('probe', {
    kind : brainState.brainTool === 'body'    ? PROBE_KIND.sense
           : brainState.brainTool === 'scent' ? PROBE_KIND.smell
                                              : PROBE_KIND.sight,
    x : point.x,
    y : point.y,
    energy : SENSORY_PROBE.energy * strength *
                 (brainState.brainTool === 'scent' ? SENSORY_PROBE.scent_gain : 1),
    radius : brainState.brainTool === 'light' ? Number(el('brain-size').value)
                                              : SENSORY_PROBE.radius,
    sense : brainState.brainTool === 'body' ? sense : 0,
    value,
    color : hueRGB(brainState.brainHue).map(v => v * strength),
    scents : brainState.brainMix.slice()
  });
}

export function brainTrackProbe(now = displayNow()) {
  if (!brainState.brainProbeArmed || !brain_inputState.brainPointerInside ||
      !brainState.brainPointer || brainState.brainTool === 'body' || !brainState.brainOpen ||
      brain_probeState.brainProbeSending || brainState.brainBusy)
    return;
  const point = screenToWorld(brainState.brainPointer), old = brain_probeState.brainProbeLastPoint,
        moved =
            !old || Math.hypot(horizontalDelta(point.x - old.x), point.y - old.y) > PROBE_SEND.move;
  if (now - brain_probeState.brainProbeLastSend < PROBE_SEND.interval ||
      !moved && now - brain_probeState.brainProbeLastSend < PROBE_SEND.idle)
    return;
  brain_probeState.brainProbeLastSend = now;
  brain_probeState.brainProbeLastPoint = point;
  brain_probeState.brainProbeSending = true;
  sendBrainProbe(point).finally(() => { brain_probeState.brainProbeSending = false; });
}

function brainDragWheel(e, initial = false) {
  const rect = el('brain-wheel').getBoundingClientRect(),
        dx = e.clientX - rect.left - rect.width / 2, dy = e.clientY - rect.top - rect.height / 2,
        angle = heading(dy, dx);
  if (brainState.brainTool === 'scent') {
    if (initial)
      updateBrainState({
        brainWheelComponent :
            Math.round(angle / FULL_TURN * scentColors.length) % scentColors.length
      });
    setBrainMix(brainState.brainWheelComponent,
                (Math.hypot(dx, dy) / rect.width * PERCENT - WHEEL.handle) / WHEEL.handle_span);
  } else {
    updateBrainState({brainHue : angle});
    brainUpdateWheel();
  }
}

export function updateBrainProbeState(patch) {
  Object.assign(brain_probeState, patch);
  return Object.values(patch)[0];
}

export function setBrainTool(tool) {
  updateBrainState({brainTool : tool});
  el('brain-inputs').open = true;
  brainArmProbe(false);
  brainUpdateWheel();
}

export function setBrainView(view) {
  updateBrainState({brainView : view});
  updateBrainState({brainHover : null});
  updateBrainState({brainDrawingKey : ''});
  updateBrainState({brainPackets : []});
  if (sceneState.frame)
    draw(sceneState.frame);
}

const initializers = {
  "brainMixInputs" : () => { brainMixInputs = []; },
  "brainMixOutputs" : () => { brainMixOutputs = []; },
  "brainHandles" : () => { brainHandles = []; },
  "createElement_label" : () => {
    for (let k = 0; k < 8; k++) {
      const label = document.createElement('label'), name = document.createElement('span'),
            output = document.createElement('output'), input = document.createElement('input');
      name.textContent = '● ' + scentNames[k];
      name.style.color = scentColors[k];
      input.type = 'range';
      input.min = 0;
      input.max = 100;
      input.value = k === 0 ? 100 : 0;
      input.setAttribute('aria-label', t('brain_probe.inMix', {name : name.textContent}));
      input.oninput = () => setBrainMix(k, Number(input.value) / 100);
      label.appendChild(name);
      label.appendChild(output);
      label.appendChild(input);
      el('brain-scent-mix').appendChild(label);
      brainMixInputs.push(input);
      brainMixOutputs.push(output);
      const handle = document.createElement('div');
      handle.className = 'brain-scent-handle';
      el('brain-scent-handles').appendChild(handle);
      brainHandles.push(handle);
    }
  },
  "brainProbeLastPoint" : () => { brain_probeState.brainProbeLastPoint = null; },
  "brainProbeLastSend" : () => { brain_probeState.brainProbeLastSend = 0; },
  "brainProbeSending" : () => { brain_probeState.brainProbeSending = false; },
  "brain_probe_onclick" : () => {
    el('brain-probe').onclick = () => {
      if (brainState.brainTool === 'body')
        sendBrainProbe();
      else
        brainArmProbe(!brainState.brainProbeArmed);
    };
  },
  "brain_clear_probe_onclick" : () => {
    el('brain-clear-probe').onclick = () => {
      updateBrainState({brainProbePoint : null});
      brainArmProbe(false);
      command('probe-clear');
    };
  },
  "brain_inputs_ontoggle" : () => {
    el('brain-inputs').ontoggle = () => {
      if (!el('brain-inputs').open)
        brainArmProbe(false);
    };
  },
  "brain_body_sense_onchange" :
      () => { el('brain-body-sense').onchange = () => brainArmProbe(false); },
  "brain_hue_oninput" : () => {
    el('brain-hue').oninput = () => {
      updateBrainState({brainHue : Number(el('brain-hue').value)});
      brainUpdateWheel();
    };
  },
  "brain_wheel_onpointerdown" : () => {
    el('brain-wheel').onpointerdown = e => {
      updateBrainState({brainWheelDrag : true});
      e.preventDefault?.();
      el('brain-wheel').setPointerCapture?.(e.pointerId);
      brainDragWheel(e, true);
    };
  },
  "brain_wheel_onpointermove" : () => {
    el('brain-wheel').onpointermove = e => {
      if (brainState.brainWheelDrag)
        brainDragWheel(e);
    };
  },
  "brain_wheel_onpointerup" :
      () => { el('brain-wheel').onpointerup = () => updateBrainState({brainWheelDrag : false}); },
  "brain_wheel_onpointercancel" : () => {
    el('brain-wheel').onpointercancel = () => updateBrainState({brainWheelDrag : false});
  },
  "brain_strength_oninput" : () => {
    el('brain-strength').oninput = () =>
        text('brain-strength-value', t('units.percent', {n : el('brain-strength').value}));
  },
  "brain_body_input_oninput" : () => {
    el('brain-body-input').oninput = () =>
        text('brain-body-value', t('units.percent', {n : el('brain-body-input').value}));
    el('brain-size').oninput = () => text('brain-size-value', el('brain-size').value);
  },
  "brainUpdateWheel" : () => { brainUpdateWheel(); }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
