import {
  INTERNAL_COLOR,
  INTERNAL_TISSUE,
  isMotorTissue,
  isSenseTissue,
  motorTissue,
  senseTissue,
  tissueKind,
  variantPort
} from './tissue.js';
import {formatNumber, percent, t, tList} from './strings.js';
import {chartContext} from './dom.js';
import {brainClamp, brainTissueName} from './brain.js';
import {brainMotorColors, brainSenseColors, MIDLINE_MOTORS, tissueColor} from './brain_model.js';
import {organPercent} from './organ_readout.js';
import {LONGEST_TIME_CONSTANT} from './tuning.js';
import {
  EFFECTOR,
  MOTOR_KIND,
  MOTOR_PORTS,
  NEURON,
  RECEPTOR,
  SENSORY_COMPONENT,
  TIME_CONSTANT,
  TOLERANCE
} from './schema.js';
export const organ_tuningState = {};
const CURVES = 48, CURVE_POINTS = 48, DECADES = 4;

const TUNING_GRAPHIC = Object.freeze({
  font : '10px system-ui',
  width : 360,
  height : 112,
  title_x : 8,
  title_y : 13,
  left : 24,
  bottom : 87,
  plot_width : 174,
  plot_height : 58,
  top : 24,
  label_x : 8,
  one_y : 29,
  zero_y : 90,
  curve_alpha : .13,
  dot : 2.2,
  axis_y : 105,
  middle_x : 78,
  end_x : 28,
  alpha : .35,
  alpha_span : .65,
  full_strength : 3,
  time_x : 55,
  time_end_x : 16,
  mix_title_x : 219,
  mix_x : 220,
  mix_width : 128,
  mix_y : 27,
  mix_height : 11,
  ranked : 3,
  rank_y : 51,
  rank_step : 18,
  swatch : 5,
  name_chars : 14,
  name_x : 231,
  rank_text_y : 57,
  value_x : 350,
  axis : '#38535e',
  title : '#a8c0c5',
  cell : '#f0d286',
  label : '#96b5bf',
  mix_title : '#abc3c7',
  rank : '#bad0d2'
});
export function drawOrganTuning(canvas, info, d, tissue) {
  const g = chartContext(canvas, () => drawOrganTuning(canvas, info, d, tissue)),
        nodes = [...new Map(tissue.members.map(m => [m.n[NEURON.index], m.n])).values() ],
        sense = isSenseTissue(tissue.key), motor = isMotorTissue(tissue.key),
        k = tissueKind(tissue.key),
        signed = motor && (k === MOTOR_KIND.bladder || k === MOTOR_KIND.gland),
        intensity =
            sense && nodes.some(n => d.receptors.get(n[NEURON.index])?.[RECEPTOR.intensity]),
        color = tissueColor(tissue.key);
  g.clearRect(0, 0, TUNING_GRAPHIC.width, TUNING_GRAPHIC.height);
  g.font = TUNING_GRAPHIC.font;
  g.textAlign = 'left';
  g.lineWidth = 1;
  g.strokeStyle = TUNING_GRAPHIC.axis;
  g.fillStyle = TUNING_GRAPHIC.title;
  g.fillText(sense   ? t('organ_tuning.reizSinnesantwort')
             : motor ? t('organ_tuning.zellzustandMotoraktivitaet')
                     : t('organ_tuning.zeitkonstanteUndEigenantrieb'),
             TUNING_GRAPHIC.title_x, TUNING_GRAPHIC.title_y);
  const x0 = TUNING_GRAPHIC.left, y0 = TUNING_GRAPHIC.bottom, w = TUNING_GRAPHIC.plot_width,
        h = TUNING_GRAPHIC.plot_height,
        map = value =>
            x0 +
            w * brainClamp(intensity
                               ? (Math.log10(Math.max(10 ** -DECADES, value)) + DECADES) / DECADES
                               : value),
        response = (raw, r) => {
          const logarithmic = r[RECEPTOR.intensity],
                tau = r[logarithmic ? RECEPTOR.response_threshold : RECEPTOR.threshold];
          return raw <= 0      ? 0
                 : logarithmic ? raw / (raw + tau)
                               : raw * (1 - tau) / (raw * (1 - tau) + (1 - raw) * tau);
        };
  g.beginPath();
  g.moveTo(x0, TUNING_GRAPHIC.top);
  g.lineTo(x0, y0);
  g.lineTo(x0 + w, y0);
  g.stroke();
  g.fillText('1', TUNING_GRAPHIC.label_x, TUNING_GRAPHIC.one_y);
  g.fillText('0', TUNING_GRAPHIC.label_x, TUNING_GRAPHIC.zero_y);
  if (sense || motor) {
    const records =
              sense
                  ? nodes.map(n => d.receptors.get(n[NEURON.index])).filter(Boolean)
                  : d.b.effectors.filter(
                        e => e[EFFECTOR.port] === (variantPort(tissue.variant) ?? MOTOR_PORTS[k]) &&
                             nodes.some(n => n[NEURON.index] === e[EFFECTOR.neuron])),
          components = d.components ??= new Map(
              (d.b.sensory_components || []).map(row => [row[SENSORY_COMPONENT.neuron], row]));
    const stride = Math.max(1, Math.ceil(records.length / CURVES));
    for (let j = 0; j < records.length; j += stride) {
      const r = records[j];
      g.strokeStyle = color;
      g.globalAlpha = TUNING_GRAPHIC.curve_alpha;
      g.beginPath();
      for (let i = 0; i <= CURVE_POINTS; i++) {
        const raw = intensity ? 10 ** (DECADES * (i / CURVE_POINTS - 1))
                    : signed  ? 2 * i / CURVE_POINTS - 1
                              : i / CURVE_POINTS,
              v = sense    ? response(raw, r)
                  : signed ? Math.abs(raw)
                           : brainClamp(raw),
              x = x0 + w * i / CURVE_POINTS, y = y0 - h * v;
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
    for (let i = 0; i <= CURVE_POINTS; i++) {
      const raw = intensity ? 10 ** (DECADES * (i / CURVE_POINTS - 1))
                  : signed  ? 2 * i / CURVE_POINTS - 1
                            : i / CURVE_POINTS,
            v = records.reduce((sum, r) => sum + (sense    ? response(raw, r)
                                                  : signed ? Math.abs(raw)
                                                           : brainClamp(raw)),
                               0) /
                Math.max(1, records.length),
            x = x0 + w * i / CURVE_POINTS, y = y0 - h * v;
      if (i)
        g.lineTo(x, y);
      else
        g.moveTo(x, y);
    }
    g.stroke();
    for (let j = 0; j < records.length; j += stride) {
      const r = records[j], cell = sense ? r[RECEPTOR.neuron] : r[EFFECTOR.neuron],
            n = d.nodes.get(cell), row = components.get(cell),
            v = sense ? (row ? brainClamp(
                                   (row[SENSORY_COMPONENT.senses + k] || 0) /
                                   Math.max(TOLERANCE.negligible, r[RECEPTOR.senses]?.[k] || 0))
                             : null)
                : signed
                    ? Math.abs(brainClamp(n?.[NEURON.state] ?? n?.[NEURON.activity] ?? 0, -1, 1))
                    : brainClamp(n?.[NEURON.state] ?? n?.[NEURON.activity] ?? 0);
      if (v === null)
        continue;
      const logarithmic = r[RECEPTOR.intensity],
            tau = r[logarithmic ? RECEPTOR.response_threshold : RECEPTOR.threshold],
            raw = sense    ? (logarithmic
                                  ? tau * v / Math.max(TOLERANCE.negligible, 1 - v)
                                  : v * tau /
                                     Math.max(TOLERANCE.negligible, (1 - v) * (1 - tau) + v * tau))
                  : signed ? brainClamp(n?.[NEURON.state] ?? n?.[NEURON.activity] ?? 0, -1, 1)
                           : v;
      g.fillStyle = TUNING_GRAPHIC.cell;
      g.beginPath();
      g.arc(sense ? map(raw) : x0 + w * brainClamp(signed ? (raw + 1) / 2 : raw), y0 - h * v,
            TUNING_GRAPHIC.dot, 0, Math.PI * 2);
      g.fill();
    }
    const [low, middle, high] =
        intensity ? [ 10 ** -DECADES, 10 ** (-DECADES / 2), 1 ].map(v => percent(v, DECADES))
        : signed  ? tList('units.signedAxis')
                  : [ 0, 1 / 2, 1 ].map(v => percent(v));
    g.fillStyle = TUNING_GRAPHIC.label;
    g.fillText(low, x0, TUNING_GRAPHIC.axis_y);
    g.fillText(middle, x0 + TUNING_GRAPHIC.middle_x, TUNING_GRAPHIC.axis_y);
    g.fillText(high, x0 + w - TUNING_GRAPHIC.end_x, TUNING_GRAPHIC.axis_y);
    canvas.title = sense    ? t('organ_tuning.innateCurve')
                   : signed ? t('organ_tuning.signedOutput')
                            : t('organ_tuning.derPositiveNeuronaleZustand');
  } else {
    for (const n of nodes) {
      g.fillStyle = color;
      g.globalAlpha =
          TUNING_GRAPHIC.alpha +
          TUNING_GRAPHIC.alpha_span * brainClamp(n[NEURON.strength] / TUNING_GRAPHIC.full_strength);
      g.beginPath();
      g.arc(x0 + w * brainClamp((n[NEURON.time_constant] || 0) / LONGEST_TIME_CONSTANT),
            y0 - h * brainClamp((n[NEURON.bias] + 1) / 2), TUNING_GRAPHIC.dot, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = TUNING_GRAPHIC.label;
    g.fillText(formatNumber(TIME_CONSTANT.min_steps), x0, TUNING_GRAPHIC.axis_y);
    g.fillText(t('organ_tuning.zeitkonstante'), x0 + TUNING_GRAPHIC.time_x, TUNING_GRAPHIC.axis_y);
    g.fillText(formatNumber(LONGEST_TIME_CONSTANT), x0 + w - TUNING_GRAPHIC.time_end_x,
               TUNING_GRAPHIC.axis_y);
    canvas.title = t('organ_tuning.jederPunktIstEine');
  }
  const senseCount = brainSenseColors.length, motorCount = brainMotorColors.length,
        internalIndex = senseCount + motorCount, mix = Array(internalIndex + 1).fill(0),
        mixColor = i => i < senseCount      ? brainSenseColors[i]
                        : i < internalIndex ? brainMotorColors[i - senseCount]
                                            : INTERNAL_COLOR;
  for (const n of nodes) {
    mix[internalIndex] += n[NEURON.internal] * n[NEURON.strength];
    for (let i = 0; i < senseCount; i++)
      mix[i] += (n[NEURON.senses]?.[i] || 0) * n[NEURON.strength];
    for (let i = 0; i < motorCount; i++)
      mix[i + senseCount] += (n[NEURON.motors]?.[i] || 0) * n[NEURON.strength];
  }
  const total = mix.reduce((a, b) => a + b, 0);
  g.fillStyle = TUNING_GRAPHIC.mix_title;
  g.fillText(t('organ_tuning.funktionsmischung'), TUNING_GRAPHIC.mix_title_x,
             TUNING_GRAPHIC.title_y);
  if (motor && MIDLINE_MOTORS.includes(k))
    canvas.title +=
        ' · ' + (k === MOTOR_KIND.suction
                     ? t('organ_tuning.jawGut',
                         {jaw : organPercent(d.b.jaw_length), gut : organPercent(d.b.gut_length)})
                 : k === MOTOR_KIND.aggression
                     ? t('organ_tuning.bluntTeeth', {n : organPercent(d.b.blunt_teeth)})
                     : t('organ_tuning.undulation', {n : organPercent(d.b.undulation)}));
  let x = TUNING_GRAPHIC.mix_x;
  for (let i = 0; i < mix.length; i++) {
    const width = TUNING_GRAPHIC.mix_width * mix[i] / Math.max(TOLERANCE.negligible, total);
    g.fillStyle = mixColor(i);
    g.fillRect(x, TUNING_GRAPHIC.mix_y, width, TUNING_GRAPHIC.mix_height);
    x += width;
  }
  const ranked = mix.map((value, i) => ({value, i}))
                     .filter(v => v.value > 0)
                     .sort((a, b) => b.value - a.value)
                     .slice(0, TUNING_GRAPHIC.ranked);
  ranked.forEach(({value, i}, j) => {
    g.fillStyle = mixColor(i);
    g.fillRect(TUNING_GRAPHIC.mix_x, TUNING_GRAPHIC.rank_y + j * TUNING_GRAPHIC.rank_step,
               TUNING_GRAPHIC.swatch, TUNING_GRAPHIC.swatch);
    g.fillStyle = TUNING_GRAPHIC.rank;
    const name = brainTissueName(i === internalIndex ? INTERNAL_TISSUE
                                 : i < senseCount    ? senseTissue(i)
                                                     : motorTissue(i - senseCount));
    g.fillText(name.slice(0, TUNING_GRAPHIC.name_chars), TUNING_GRAPHIC.name_x,
               TUNING_GRAPHIC.rank_text_y + j * TUNING_GRAPHIC.rank_step);
    g.textAlign = 'right';
    g.fillText(organPercent(value / Math.max(TOLERANCE.negligible, total)), TUNING_GRAPHIC.value_x,
               TUNING_GRAPHIC.rank_text_y + j * TUNING_GRAPHIC.rank_step);
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
