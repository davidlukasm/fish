import {t} from './strings.js';
import {updateBrainState} from './brain.js';
import {brainClamp, brainSetDrawing, brainState, focusNeuron} from './brain.js';
import {brainArmProbe, brain_inputState} from './brain_input.js';
import {brainBuild} from './brain_layout.js';
import {brainHSV, scentColors, scentDescription, scentNames} from './brain_model.js';
import {brainTrace} from './brain_signals.js';
import {screenToWorld} from './camera.js';
import {el, rgb, text} from './dom.js';
import {command} from './session.js';
import {displayNow, frameFish, horizontalDelta, sceneState} from './state.js';
import {draw} from './tank.js';
export const brain_probeState = {};
export let brainOdorMarks;

export let brainMixInputs;

export let brainMixOutputs;

export let brainHandles;

export function setBrainMix(k, value) {
  value = brainClamp(value);
  const other = brainState.brainMix.reduce((s, v, j) => s + (j === k ? 0 : v), 0);
  const factor = other > 1 - value && other > 0 ? (1 - value) / other : 1;
  updateBrainState({brainMix : brainState.brainMix.map((v, j) => j === k ? value : v * factor)});
  brainUpdateWheel();
}

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
  const angle = brainState.brainHue * Math.PI / 180;
  el('brain-wheel-mark').style.left = (50 + 43 * Math.cos(angle)) + '%';
  el('brain-wheel-mark').style.top = (50 + 43 * Math.sin(angle)) + '%';
  el('brain-wheel-mark').style.background = rgb(brainHSV(brainState.brainHue));
  el('brain-hue').value = brainState.brainHue;
  for (let k = 0; k < 8; k++) {
    brainMixInputs[k].value = Math.round(brainState.brainMix[k] * 100);
    brainMixOutputs[k].textContent =
        t('units.percent', {n : Math.round(brainState.brainMix[k] * 100)});
    const angle = k * Math.PI / 4, len = 12 + 31 * brainState.brainMix[k];
    brainHandles[k].style.left = (50 + len * Math.cos(angle)) + '%';
    brainHandles[k].style.top = (50 + len * Math.sin(angle)) + '%';
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
  const strength = Number(el('brain-strength').value) / 100,
        sense = Number(el('brain-body-sense').value.slice(1)),
        value = Number(el('brain-body-input').value) / 100,
        point = location || {x : p[0], y : p[1]};
  updateBrainState({brainProbePoint : {...point}});
  await command('probe', {
    kind : brainState.brainTool === 'body'    ? 2
           : brainState.brainTool === 'scent' ? 1
                                              : 0,
    x : point.x,
    y : point.y,
    // A scent probe has to stand out against the tank's accumulated odours.
    energy : 120 * strength * (brainState.brainTool === 'scent' ? 20 : 1),
    radius : brainState.brainTool === 'light' ? Number(el('brain-size').value) : 2,
    sense : brainState.brainTool === 'body' ? sense : 0,
    value,
    color : brainHSV(brainState.brainHue).map(v => v * strength),
    scents : brainState.brainMix.slice()
  });
}

export function brainTrackProbe(now = displayNow()) {
  if (!brainState.brainProbeArmed || !brain_inputState.brainPointerInside ||
      !brainState.brainPointer || brainState.brainTool === 'body' || !brainState.brainOpen ||
      brain_probeState.brainProbeSending || brainState.brainBusy)
    return;
  const point = screenToWorld(brainState.brainPointer), old = brain_probeState.brainProbeLastPoint,
        moved = !old || Math.hypot(horizontalDelta(point.x - old.x), point.y - old.y) > .25;
  if (now - brain_probeState.brainProbeLastSend < 120 ||
      !moved && now - brain_probeState.brainProbeLastSend < 700)
    return;
  brain_probeState.brainProbeLastSend = now;
  brain_probeState.brainProbeLastPoint = point;
  brain_probeState.brainProbeSending = true;
  sendBrainProbe(point).finally(() => { brain_probeState.brainProbeSending = false; });
}

export function brainDragWheel(e, initial = false) {
  const rect = el('brain-wheel').getBoundingClientRect(),
        dx = e.clientX - rect.left - rect.width / 2, dy = e.clientY - rect.top - rect.height / 2,
        angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
  if (brainState.brainTool === 'scent') {
    if (initial)
      updateBrainState({brainWheelComponent : Math.round(angle / 45) % 8});
    setBrainMix(brainState.brainWheelComponent, (Math.hypot(dx, dy) / rect.width * 100 - 12) / 31);
  } else {
    updateBrainState({brainHue : angle});
    brainUpdateWheel();
  }
}

export function scentSphere(receptor) {
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 240;
  canvas.setAttribute('aria-label', t('brain_probe.duftsphaereZiehenZumDrehen'));
  let yaw = -.5, pitch = .35, drag = null;
  const latitude = [ 90, 35, 35, 35, 35, -10, -60, -60 ],
        longitude = [ 0, -25, 25, 155, 205, 180, 90, 270 ], r = 76;
  const vector = (lat, lon) => {
    lat *= Math.PI / 180;
    lon *= Math.PI / 180;
    return [ Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat) ];
  };
  const project = ([ x, y, z ]) => {
    const a = x * Math.cos(yaw) - y * Math.sin(yaw), b = x * Math.sin(yaw) + y * Math.cos(yaw);
    return [
      180 + r * a, 120 - r * (z * Math.cos(pitch) - b * Math.sin(pitch)),
      z * Math.sin(pitch) + b * Math.cos(pitch)
    ];
  };
  const paint = () => {
    const g = canvas.getContext('2d', {willReadFrequently : true});
    g.clearRect(0, 0, 360, 240);
    g.strokeStyle = '#4c6970';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(180, 120, r, 0, 2 * Math.PI);
    g.stroke();
    for (const lat of [-60, 0, 60]) {
      g.beginPath();
      for (let lon = 0; lon <= 360; lon += 5) {
        const p = project(vector(lat, lon));
        lon ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]);
      }
      g.stroke();
    }
    g.font = '11px system-ui';
    for (let k = 0; k < 8; ++k) {
      const p = project(vector(latitude[k], longitude[k]));
      g.globalAlpha = p[2] < 0 ? .5 : 1;
      g.fillStyle = scentColors[k];
      g.beginPath();
      g.arc(p[0], p[1], 3 + 3 * (receptor[14]?.[k] || 0), 0, 2 * Math.PI);
      g.fill();
      g.fillText(scentNames[k], p[0] + 7, p[1] + (k % 2 ? 12 : -4));
    }
    const height = receptor[15] || 0, phi = Math.PI * ((receptor[16] || 0) + 1),
          rad = Math.sqrt(1 - height * height),
          p = project([ rad * Math.cos(phi), rad * Math.sin(phi), height ]);
    g.globalAlpha = 1;
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(p[0], p[1], 7, 0, 2 * Math.PI);
    g.stroke();
    g.fillStyle = '#b9ced0';
    g.fillText(t('brain_probe.weisserRingAusgewaehlteRiechzelle'), 12, 232);
  };
  canvas.onpointerdown = e => {
    drag = [ e.clientX, e.clientY ];
    canvas.setPointerCapture?.(e.pointerId);
  };
  canvas.onpointermove = e => {
    if (!drag)
      return;
    yaw += (e.clientX - drag[0]) * .015;
    pitch = Math.max(-1.5, Math.min(1.5, pitch + (e.clientY - drag[1]) * .015));
    drag = [ e.clientX, e.clientY ];
    paint();
  };
  canvas.onpointerup = canvas.onpointercancel = () => drag = null;
  canvas.title = t('brain_probe.dragSphere', {text : scentDescription(receptor)});
  paint();
  return canvas;
}

export function updateBrainProbeState(patch) {
  Object.assign(brain_probeState, patch);
  return Object.values(patch)[0];
}

// The stimulus tool follows the organ chosen in the Organe tab.
export function setBrainTool(tool) {
  updateBrainState({brainTool : tool});
  el('brain-inputs').open = true;
  brainArmProbe(false);
  brainUpdateWheel();
}

// Network or organ drawing of the inspected fish (Nervensystem and Organe tabs).
export function setBrainView(view) {
  updateBrainState({brainView : view});
  updateBrainState({brainHover : null});
  updateBrainState({brainDrawingKey : ''});
  updateBrainState({brainPackets : []});
  if (sceneState.frame)
    draw(sceneState.frame);
}

const initializers = {
  "brainOdorMarks" : () => { brainOdorMarks = []; },
  "createElement_span" : () => {
    for (let k = 0; k < 8; k++) {
      const box = document.createElement('span'), dot = document.createElement('i'),
            label = document.createElement('span');
      box.appendChild(dot);
      box.appendChild(label);
      el('brain-odor-profile').appendChild(box);
      brainOdorMarks.push({box, dot, label});
    }
  },
  "brainMixInputs" : () => { brainMixInputs = []; },
  "brainMixOutputs" : () => { brainMixOutputs = []; },
  "brainHandles" : () => { brainHandles = []; },
  "createElement_label" : () => {
    for (let k = 0; k < 8; k++) {
      const label = document.createElement('label'), name = document.createElement('span'),
            output = document.createElement('output'), input = document.createElement('input');
      // Same colours as the scent compass of the info panel.
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
  "strong_edges_onchange" : () => {
    el('strong-edges').onchange = el('brain-flow').onchange = () => {
      updateBrainState({brainPackets : []});
      if (sceneState.frame) {
        brainSetDrawing(brainBuild(sceneState.frame));
        if (brainState.brainDrawing) {
          brainTrace(brainState.brainDrawing);
          updateBrainState({brainDrawingKey : ''});
        }
      }
    };
  },
  "brain_cell_onchange" :
      () => { el('brain-cell').onchange = () => focusNeuron(Number(el('brain-cell').value)); },
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
