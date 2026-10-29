import {chartContext, chartSize} from './dom.js';
import {brainClamp, brainTissueName} from './brain.js';
import {brainMotorColors, brainSenseColors} from './brain_model.js';
import {organPercent} from './organ_readout.js';
export const organ_tuningState = {};

export function drawOrganTuning(canvas, info, d, tissue) {
  const g = chartContext(canvas, () => drawOrganTuning(canvas, info, d, tissue)),
        nodes = [...new Map(tissue.members.map(m => [m.n[5], m.n])).values() ],
        sense = tissue.key[0] === 's', motor = tissue.key[0] === 'm',
        k = Number(tissue.key.slice(1)), signed = motor && (k === 8 || k === 9),
        intensity = [ 0, 1, 2, 5, 6, 10 ].includes(k),
        color = sense   ? brainSenseColors[k]
                : motor ? brainMotorColors[k]
                        : '#a7b6d5';
  g.clearRect(0, 0, 360, 112);
  g.font = '10px system-ui';
  g.textAlign = 'left';
  g.lineWidth = 1;
  g.strokeStyle = '#38535e';
  g.fillStyle = '#a8c0c5';
  g.fillText(sense   ? 'Reiz → Sinnesantwort'
             : motor ? 'Zellzustand → Motoraktivität'
                     : 'Zeitkonstante und Eigenantrieb',
             8, 13);
  const x0 = 24, y0 = 87, w = 174, h = 58,
        map = value => x0 + w * brainClamp((Math.log10(Math.max(.0001, value)) + 4) / 4),
        response = (raw, tau) => raw <= 0 ? 0
                                 : intensity
                                     ? raw / (raw + tau)
                                     : raw * (1 - tau) / (raw * (1 - tau) + (1 - raw) * tau);
  g.beginPath();
  g.moveTo(x0, 24);
  g.lineTo(x0, y0);
  g.lineTo(x0 + w, y0);
  g.stroke();
  g.fillText('1', 8, 29);
  g.fillText('0', 8, 90);
  if (sense || motor) {
    const records =
              sense ? nodes.map(n => d.receptors.get(n[5])).filter(Boolean)
                    : d.b.effectors.filter(e => e[1] === [ 1, 2, 6, 4, 5, 10, 11, 7, 12, 13 ][k] &&
                                                nodes.some(n => n[5] === e[0])),
          components = d.components ??=
              new Map((d.b.sensory_components || []).map(row => [row[0], row]));
    // Bounded drawing cost: at most 48 representative curves, all cells in the mean.
    const stride = Math.max(1, Math.ceil(records.length / 48));
    for (let j = 0; j < records.length; j += stride) {
      const r = records[j], tau = sense ? r[intensity ? 13 : 4] : r[2];
      g.strokeStyle = color;
      g.globalAlpha = .13;
      g.beginPath();
      for (let i = 0; i <= 48; i++) {
        const raw = sense    ? 10 ** (-4 + 4 * i / 48)
                    : signed ? 2 * i / 48 - 1
                             : i / 48,
              v = sense    ? response(raw, tau)
                  : signed ? Math.abs(raw)
                           : brainClamp(raw),
              x = x0 + w * i / 48, y = y0 - h * v;
        if (i)
          g.lineTo(x, y);
        else
          g.moveTo(x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i <= 48; i++) {
      const raw = sense    ? 10 ** (-4 + 4 * i / 48)
                  : signed ? 2 * i / 48 - 1
                           : i / 48,
            v = records.reduce((sum, r) => sum + (sense    ? response(raw, r[intensity ? 13 : 4])
                                                  : signed ? Math.abs(raw)
                                                           : brainClamp(raw)),
                               0) /
                Math.max(1, records.length),
            x = x0 + w * i / 48, y = y0 - h * v;
      if (i)
        g.lineTo(x, y);
      else
        g.moveTo(x, y);
    }
    g.stroke();
    for (let j = 0; j < records.length; j += stride) {
      const r = records[j], n = d.nodes.get(r[0]), row = components.get(r[0]),
            v = sense
                    ? (row ? brainClamp((row[k + 1] || 0) / Math.max(1e-9, r[9]?.[k] || 0)) : null)
                : signed ? Math.abs(brainClamp(n?.[18] ?? n?.[3] ?? 0, -1, 1))
                         : brainClamp(n?.[18] ?? n?.[3] ?? 0);
      if (v === null)
        continue;
      const tau = r[intensity ? 13 : 4],
            raw = sense    ? (intensity ? tau * v / Math.max(1e-9, 1 - v)
                                        : v * tau / Math.max(1e-9, (1 - v) * (1 - tau) + v * tau))
                  : signed ? brainClamp(n?.[18] ?? n?.[3] ?? 0, -1, 1)
                           : v;
      g.fillStyle = '#f0d286';
      g.beginPath();
      g.arc(sense ? map(raw) : x0 + w * brainClamp(signed ? (raw + 1) / 2 : raw), y0 - h * v, 2.2,
            0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#96b5bf';
    g.fillText(sense ? '0,01 %' : signed ? '−1' : '0', x0, 105);
    g.fillText(sense ? '1 %' : signed ? '0' : '50 %', x0 + 78, 105);
    g.fillText(signed ? '+1' : '100 %', x0 + w - 28, 105);
    canvas.title =
        sense
            ? 'Angeborene Kennlinie; Reizadaptation verschiebt die Intensitätsschwelle im Betrieb.'
        : signed ? 'Positive Werte geben Gas beziehungsweise Hormon ab; negative Werte binden es.'
                 : 'Der positive neuronale Zustand aktiviert den Muskel direkt.';
  } else {
    for (const n of nodes) {
      g.fillStyle = color;
      g.globalAlpha = .35 + .65 * brainClamp(n[11] / 3);
      g.beginPath();
      g.arc(x0 + w * brainClamp((n[16] || 0) / 48), y0 - h * brainClamp((n[15] + 1) / 2), 2.2, 0,
            Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#96b5bf';
    g.fillText('4', x0, 105);
    g.fillText('Zeitkonstante', x0 + 55, 105);
    g.fillText('48', x0 + w - 16, 105);
    canvas.title =
        'Jeder Punkt ist eine innere Nervenzelle. Waagrecht: Zeitkonstante in Schritten; senkrecht: Bias von −1 bis +1; Deckkraft: Zellstärke.';
  }
  const senseCount = brainSenseColors.length, motorCount = brainMotorColors.length,
        internalIndex = senseCount + motorCount, mix = Array(internalIndex + 1).fill(0),
        mixColor = i => i < senseCount      ? brainSenseColors[i]
                        : i < internalIndex ? brainMotorColors[i - senseCount]
                                            : '#a7b6d5';
  for (const n of nodes) {
    mix[internalIndex] += n[12] * n[11];
    for (let i = 0; i < senseCount; i++)
      mix[i] += (n[13]?.[i] || 0) * n[11];
    for (let i = 0; i < motorCount; i++)
      mix[i + senseCount] += (n[14]?.[i] || 0) * n[11];
  }
  const total = mix.reduce((a, b) => a + b, 0);
  g.fillStyle = '#abc3c7';
  g.fillText('Funktionsmischung', 219, 13);
  if (motor && [ 0, 2, 5 ].includes(k))
    canvas.title += ' · ' + (k === 2 ? 'Kieferlänge ' + organPercent(d.b.jaw_length) +
                                           ', Darmlänge ' + organPercent(d.b.gut_length)
                             : k === 5 ? 'Stumpfe Zähne ' + organPercent(d.b.blunt_teeth)
                                       : 'Schlängeln ' + organPercent(d.b.undulation));
  let x = 220;
  for (let i = 0; i < mix.length; i++) {
    const width = 128 * mix[i] / Math.max(1e-9, total);
    g.fillStyle = mixColor(i);
    g.fillRect(x, 27, width, 11);
    x += width;
  }
  const ranked = mix.map((value, i) => ({value, i}))
                     .filter(v => v.value > 0)
                     .sort((a, b) => b.value - a.value)
                     .slice(0, 3);
  ranked.forEach(({value, i}, j) => {
    g.fillStyle = mixColor(i);
    g.fillRect(220, 51 + j * 18, 5, 5);
    g.fillStyle = '#bad0d2';
    const name = i === internalIndex
                     ? 'ZNS'
                     : brainTissueName(i < senseCount ? 's' + i : 'm' + (i - senseCount));
    g.fillText(name.slice(0, 14), 231, 57 + j * 18);
    g.textAlign = 'right';
    g.fillText(organPercent(value / Math.max(1e-9, total)), 350, 57 + j * 18);
    g.textAlign = 'left';
  });
  g.globalAlpha = 1;
}

const initializers = {

};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
