import {TAIL_END} from './fish_geometry.js';
import {hormoneColors} from './hormones.js';
import './tissue.js';
import {FISH, HORMONES, LATERAL_SAMPLE, MOTOR_KIND, NEURON, RECEPTOR, TUNING} from './schema.js';
import {t, percent} from './strings.js';
import {paintEcologyIcon} from './feeding_view.js';
import {chartContext} from './dom.js';
import {brainClamp} from './brain.js';
import {scentColors, scentIcons, scentNames, tissueColor} from './brain_model.js';
import {rgb} from './dom.js';
import {fishBodyPath} from './fish_fins.js';
import {fishAlong} from './fish_forms.js';
import {
  fishCheekPath,
  fishCheekPoint,
  fishDefenseSpines,
  fishGameteShape,
  fishJawFiber,
  fishJawMusclePath,
  fishMouthPath,
  fishMouthShape,
  fishTeeth,
  fishReservePath,
  fishReserveShape
} from './fish_organs.js';
import {eyeImage, organNumber, organPercent} from './organ_readout.js';
import {organSignalHistory} from './organs.js';
import {sceneState} from './state.js';
export const organ_graphicsState = {};

// The scent wheel: one bar per odour channel around the centre, icons outside.
const SCENT_WHEEL = Object.freeze({
  size : 144,
  half_concentration : .1,
  center : 72,
  track_alpha : .14,
  bar_start : 9,
  bar_half : 4,
  bar_length : 37,
  bar_height : 8,
  icon_radius : 59,
  icon_scale : .9,
  digits : 3
});
// Shown strength of a scent concentration on the wheel's fixed scale.
export const scentStrength = concentration =>
    Math.sqrt(concentration / (concentration + SCENT_WHEEL.half_concentration));
// The scent channel under a pointer on the wheel canvas, or -1 on its hub.
export function scentWheelChannel(canvas, clientX, clientY) {
  const r = canvas.getBoundingClientRect(), W = SCENT_WHEEL, n = scentColors.length,
        x = (clientX - r.left) / r.width * W.size - W.center,
        y = (clientY - r.top) / r.height * W.size - W.center;
  if (Math.hypot(x, y) < W.bar_start)
    return -1;
  return ((Math.round(Math.atan2(y, x) / (2 * Math.PI / n)) % n) + n) % n;
}
export function drawScentWheel(canvas, odors) {
  const g = chartContext(canvas, () => drawScentWheel(canvas, odors));
  g.clearRect(0, 0, SCENT_WHEEL.size, SCENT_WHEEL.size);
  // Fixed concentration scale: channels remain comparable as the water moves.
  for (let k = 0; k < scentColors.length; ++k) {
    const angle = k * 2 * Math.PI / scentColors.length, co = Math.cos(angle), si = Math.sin(angle),
          value = scentStrength(Math.max(0, odors[k] || 0));
    g.save();
    g.translate(SCENT_WHEEL.center, SCENT_WHEEL.center);
    g.rotate(angle);
    g.fillStyle = scentColors[k];
    g.globalAlpha = SCENT_WHEEL.track_alpha;
    g.fillRect(SCENT_WHEEL.bar_start, -SCENT_WHEEL.bar_half, SCENT_WHEEL.bar_length,
               SCENT_WHEEL.bar_height);
    g.globalAlpha = 1;
    g.fillRect(SCENT_WHEEL.bar_start, -SCENT_WHEEL.bar_half, SCENT_WHEEL.bar_length * value,
               SCENT_WHEEL.bar_height);
    g.restore();
    const x = SCENT_WHEEL.center + SCENT_WHEEL.icon_radius * co,
          y = SCENT_WHEEL.center + SCENT_WHEEL.icon_radius * si;
    paintEcologyIcon(g, scentIcons[k], x, y, scentColors[k], SCENT_WHEEL.icon_scale);
  }
  g.globalAlpha = 1;
  canvas.title =
      scentNames.map((name, k) => name + ': ' + (odors[k] || 0).toPrecision(SCENT_WHEEL.digits))
          .join(' · ');
  canvas.setAttribute('aria-label', canvas.title);
}

// The gut as a winding tube, longer guts winding more; figures in the right column.
const GUT_GRAPHIC = Object.freeze({
  tube_width : 14,
  steps : 64,
  left : 24,
  step : 2.1,
  middle : 62,
  waves : 2,
  waves_per_length : 6,
  amplitude : 25,
  fill_width : 3,
  fill_width_per_fill : 9,
  title_x : 14,
  title_y : 17,
  column : 190,
  bar_y : 26,
  bar_width : 150,
  usable_y : 54,
  digits : 3,
  reserve_y : 81,
  transit_y : 108,
  tube : '#38535e',
  usable : '#d3bb72'
});
function drawGutGraphic({g, d, color, label, bar}) {
  const length = d.b.gut_length || 0, fill = d.b.satiety || 0, raw = d.b.gut_energy || 0,
        usable = d.b.gut_digestible || 0;
  g.strokeStyle = GUT_GRAPHIC.tube;
  g.lineWidth = GUT_GRAPHIC.tube_width;
  g.beginPath();
  for (let i = 0; i <= GUT_GRAPHIC.steps; i++) {
    const x = GUT_GRAPHIC.left + i * GUT_GRAPHIC.step,
          y = GUT_GRAPHIC.middle +
              Math.sin(i / GUT_GRAPHIC.steps * Math.PI *
                       (GUT_GRAPHIC.waves + GUT_GRAPHIC.waves_per_length * length)) *
                  GUT_GRAPHIC.amplitude;
    if (i)
      g.lineTo(x, y);
    else
      g.moveTo(x, y);
  }
  g.stroke();
  g.strokeStyle = color;
  g.lineWidth = GUT_GRAPHIC.fill_width + GUT_GRAPHIC.fill_width_per_fill * brainClamp(fill);
  g.stroke();
  label(t('organ_graphics.gut', {n : organPercent(fill)}), GUT_GRAPHIC.title_x,
        GUT_GRAPHIC.title_y);
  bar(GUT_GRAPHIC.column, GUT_GRAPHIC.bar_y, GUT_GRAPHIC.bar_width, raw > 0 ? usable / raw : 0,
      GUT_GRAPHIC.usable);
  label(t('organ_graphics.usable', {usable : organNumber(usable, 1), raw : organNumber(raw, 1)}),
        GUT_GRAPHIC.column, GUT_GRAPHIC.usable_y);
  label(t('organ_graphics.toReserve', {n : organNumber(d.b.digestion_net, GUT_GRAPHIC.digits)}),
        GUT_GRAPHIC.column, GUT_GRAPHIC.reserve_y);
  label(t('organ_graphics.transit', {n : organNumber(d.b.gut_transit, 0)}), GUT_GRAPHIC.column,
        GUT_GRAPHIC.transit_y);
}

// One bar per hormone level.
const HORMONE_GRAPHIC = Object.freeze({
  name_x : 12,
  row_y : 22,
  row_step : 28,
  bar_x : 60,
  bar_y : 13,
  bar_width : 220,
  value_x : 290
});
function drawHormoneGraphic({info, label, bar}) {
  for (let k = 0; k < HORMONES.levels; k++) {
    label('H' + (k + 1), HORMONE_GRAPHIC.name_x,
          HORMONE_GRAPHIC.row_y + HORMONE_GRAPHIC.row_step * k);
    bar(HORMONE_GRAPHIC.bar_x, HORMONE_GRAPHIC.bar_y + HORMONE_GRAPHIC.row_step * k,
        HORMONE_GRAPHIC.bar_width, info.values[k] || 0, hormoneColors[k]);
    label(organPercent(info.values[k] || 0), HORMONE_GRAPHIC.value_x,
          HORMONE_GRAPHIC.row_y + HORMONE_GRAPHIC.row_step * k);
  }
}

// The swim bladder with its gas volume.
const BLADDER_GRAPHIC = Object.freeze({
  line_width : 2,
  cx : 84,
  cy : 65,
  rx : 49,
  ry : 28,
  alpha : .25,
  alpha_per_fill : .5,
  gas_rx : 8,
  gas_rx_per_fill : 39,
  gas_ry : 5,
  gas_ry_per_fill : 21,
  column : 160,
  bar_y : 55,
  bar_width : 175,
  label_y : 85
});
function drawBladderGraphic({g, info, color, label, bar}) {
  g.strokeStyle = color;
  g.lineWidth = BLADDER_GRAPHIC.line_width;
  g.beginPath();
  g.ellipse(BLADDER_GRAPHIC.cx, BLADDER_GRAPHIC.cy, BLADDER_GRAPHIC.rx, BLADDER_GRAPHIC.ry, 0, 0,
            2 * Math.PI);
  g.stroke();
  g.fillStyle = color;
  g.globalAlpha = BLADDER_GRAPHIC.alpha + BLADDER_GRAPHIC.alpha_per_fill * info.fill;
  g.beginPath();
  g.ellipse(BLADDER_GRAPHIC.cx, BLADDER_GRAPHIC.cy,
            BLADDER_GRAPHIC.gas_rx + BLADDER_GRAPHIC.gas_rx_per_fill * info.fill,
            BLADDER_GRAPHIC.gas_ry + BLADDER_GRAPHIC.gas_ry_per_fill * info.fill, 0, 0,
            2 * Math.PI);
  g.fill();
  g.globalAlpha = 1;
  bar(BLADDER_GRAPHIC.column, BLADDER_GRAPHIC.bar_y, BLADDER_GRAPHIC.bar_width, info.fill);
  label(t('organ_graphics.gasfuellung'), BLADDER_GRAPHIC.column, BLADDER_GRAPHIC.label_y);
}

// Scent channels in two columns: preference track and stimulus.
const SCENT_GRAPHIC = Object.freeze({
  columns : 2,
  left_x : 8,
  right_x : 188,
  row_y : 22,
  row_step : 26,
  track_offset : 3,
  bar_width : 158,
  track_height : 7,
  odor_offset : 4,
  odor_height : 5,
  caption_y : 130,
  digits : 3,
  track : '#334f58'
});
function drawScentGraphic({g, canvas, info, label}) {
  const rows = scentNames.length / SCENT_GRAPHIC.columns;
  for (let k = 0; k < scentNames.length; k++) {
    const x = k < rows ? SCENT_GRAPHIC.left_x : SCENT_GRAPHIC.right_x,
          y = SCENT_GRAPHIC.row_y + (k % rows) * SCENT_GRAPHIC.row_step,
          value = info.ambient ? 1 : info.values[k] || 0;
    label(scentNames[k], x, y, scentColors[k]);
    g.fillStyle = SCENT_GRAPHIC.track;
    g.fillRect(x, y + SCENT_GRAPHIC.track_offset, SCENT_GRAPHIC.bar_width * brainClamp(value),
               SCENT_GRAPHIC.track_height);
    g.fillStyle = scentColors[k];
    g.fillRect(x, y + SCENT_GRAPHIC.odor_offset,
               SCENT_GRAPHIC.bar_width * Math.tanh((info.odors[k] || 0) * value),
               SCENT_GRAPHIC.odor_height);
  }
  label(info.ambient ? t('organ_graphics.duftImWasser')
                     : t('organ_graphics.farbeDuftreizHintergrundVorliebe'),
        SCENT_GRAPHIC.left_x, SCENT_GRAPHIC.caption_y);
  canvas.title = info.ambient
                     ? scentNames
                           .map((name, k) => name + ': ' +
                                             (info.odors[k] || 0).toPrecision(SCENT_GRAPHIC.digits))
                           .join(' · ')
                     : t('organ_graphics.duftreizUndErblicheVorliebe');
  canvas.setAttribute('aria-label', canvas.title);
}

// Light at the eye and the receptor response, each as a strip from left to right.
const EYE_GRAPHIC = Object.freeze({
  left : 12,
  width : 336,
  light_row : 22,
  response_row : 76,
  caption_gap : 5,
  samples : 120,
  row_height : 29,
  axis_y : 124,
  front_x : 165,
  right_x : 315,
  empty_x : 120,
  empty_y : 69,
  back : '#07131b'
});
// The bearing in degrees (left negative) the eye graphic shows under the pointer.
export function eyeGraphicAngle(e, canvas) {
  const rect = canvas.getBoundingClientRect(),
        x = (e.clientX - rect.left) / rect.width * ORGAN_GRAPHIC.width;
  return (2 * brainClamp((x - EYE_GRAPHIC.left) / EYE_GRAPHIC.width) - 1) * TUNING.visual_width_max;
}
function drawEyeGraphic({g, canvas, info, label}) {
  const left = EYE_GRAPHIC.left, width = EYE_GRAPHIC.width;
  for (const [row, responses] of [[ EYE_GRAPHIC.light_row, false ],
                                  [ EYE_GRAPHIC.response_row, true ]]) {
    label(responses ? t('organ_graphics.rezeptorantwortNachFiltern')
                    : t('organ_graphics.lichtAmAuge'),
          left, row - EYE_GRAPHIC.caption_gap);
    const image = eyeImage(info, EYE_GRAPHIC.samples, responses);
    g.fillStyle = EYE_GRAPHIC.back;
    g.fillRect(left, row, width, EYE_GRAPHIC.row_height);
    for (let i = 0; i < image.length; ++i) {
      g.fillStyle = rgb(image[i].map(v => Math.sqrt(v)));
      g.fillRect(left + width * i / image.length, row, width / image.length + 1,
                 EYE_GRAPHIC.row_height);
    }
  }
  label(t('organ_graphics.left'), EYE_GRAPHIC.left, EYE_GRAPHIC.axis_y);
  label(t('organ_graphics.front'), EYE_GRAPHIC.front_x, EYE_GRAPHIC.axis_y);
  label(t('organ_graphics.right'), EYE_GRAPHIC.right_x, EYE_GRAPHIC.axis_y);
  canvas.title = t('organ_graphics.obenLichtNachVerdeckung');
  if (!info.image?.length)
    label(t('organ_graphics.nochKeinSehbild'), EYE_GRAPHIC.empty_x, EYE_GRAPHIC.empty_y);
}

// Water flow at the lateral lines relative to the body, with the cells along it.
const DIRECTION_GRAPHIC = Object.freeze({
  line_width : 1.5,
  cx : 180,
  cy : 64,
  rx : 130,
  ry : 26,
  left_x : 90,
  spacing : 180,
  arrow : 35,
  buried_min : .5,
  arrow_width : 2,
  min_speed : .001,
  head_back : 7,
  head_side : 4,
  dot : 3,
  digits : 2,
  value_shift : 28,
  value_y : 118,
  cell_offset : 24,
  cell_alpha : .25,
  cell_alpha_per_value : .75,
  cell_radius : 2,
  cell_radius_per_value : 2,
  tail_x : 66,
  caption_y : 14,
  head_x : 258,
  note_x : 65,
  note_y : 132,
  rim : '#47636b',
  body : '#1c3741',
  buried : '#9a8e7b',
  flow : '#a6dfdc'
});
function drawDirectionGraphic({g, info, d, color, label}) {
  g.strokeStyle = DIRECTION_GRAPHIC.rim;
  g.fillStyle = DIRECTION_GRAPHIC.body;
  g.lineWidth = DIRECTION_GRAPHIC.line_width;
  g.beginPath();
  g.ellipse(DIRECTION_GRAPHIC.cx, DIRECTION_GRAPHIC.cy, DIRECTION_GRAPHIC.rx, DIRECTION_GRAPHIC.ry,
            0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  const samples = d.b.lateral_samples || [], ca = Math.cos(d.p[FISH.angle]),
        sa = Math.sin(d.p[FISH.angle]);
  for (let k = 0; k < 2; k++) {
    const q = samples[k], x = DIRECTION_GRAPHIC.left_x + DIRECTION_GRAPHIC.spacing * k;
    if (!q)
      continue;
    const L = LATERAL_SAMPLE, dx = q[L.flow_x] * ca + q[L.flow_y] * sa,
          dy = -q[L.flow_x] * sa + q[L.flow_y] * ca, m = Math.hypot(dx, dy),
          scale = DIRECTION_GRAPHIC.arrow / Math.max(1, m), tx = x + dx * scale,
          ty = DIRECTION_GRAPHIC.cy + dy * scale;
    g.strokeStyle = q[L.buried] > DIRECTION_GRAPHIC.buried_min ? DIRECTION_GRAPHIC.buried
                                                               : DIRECTION_GRAPHIC.flow;
    g.lineWidth = DIRECTION_GRAPHIC.arrow_width;
    g.beginPath();
    g.moveTo(x, DIRECTION_GRAPHIC.cy);
    g.lineTo(tx, ty);
    if (m > DIRECTION_GRAPHIC.min_speed) {
      const nx = dx / m, ny = dy / m;
      g.lineTo(tx - DIRECTION_GRAPHIC.head_back * nx + DIRECTION_GRAPHIC.head_side * ny,
               ty - DIRECTION_GRAPHIC.head_back * ny - DIRECTION_GRAPHIC.head_side * nx);
      g.moveTo(tx, ty);
      g.lineTo(tx - DIRECTION_GRAPHIC.head_back * nx - DIRECTION_GRAPHIC.head_side * ny,
               ty - DIRECTION_GRAPHIC.head_back * ny + DIRECTION_GRAPHIC.head_side * nx);
    }
    g.stroke();
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, DIRECTION_GRAPHIC.cy, DIRECTION_GRAPHIC.dot, 0, Math.PI * 2);
    g.fill();
    label(t('units.pxPerStepShort', {n : organNumber(m, DIRECTION_GRAPHIC.digits)}),
          x - DIRECTION_GRAPHIC.value_shift, DIRECTION_GRAPHIC.value_y);
  }
  for (const r of info.receptors) {
    const longitudinal =
              r[RECEPTOR.longitudinal] ?? d.nodes.get(r[RECEPTOR.neuron])?.[NEURON.y] ?? 0,
          x = DIRECTION_GRAPHIC.left_x + DIRECTION_GRAPHIC.spacing * (longitudinal + 1) / 2,
          y = DIRECTION_GRAPHIC.cy + (r[RECEPTOR.angle] < 0 ? -DIRECTION_GRAPHIC.cell_offset
                                                            : DIRECTION_GRAPHIC.cell_offset),
          v = brainClamp(r[RECEPTOR.value]);
    g.fillStyle = color;
    g.globalAlpha = DIRECTION_GRAPHIC.cell_alpha + DIRECTION_GRAPHIC.cell_alpha_per_value * v;
    g.beginPath();
    g.arc(x, y, DIRECTION_GRAPHIC.cell_radius + DIRECTION_GRAPHIC.cell_radius_per_value * v, 0,
          Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  label(t('organ_graphics.schwanz'), DIRECTION_GRAPHIC.tail_x, DIRECTION_GRAPHIC.caption_y);
  label(t('organ_graphics.kopf'), DIRECTION_GRAPHIC.head_x, DIRECTION_GRAPHIC.caption_y);
  label(t('organ_graphics.koerperbewegungRelativZumWasser'), DIRECTION_GRAPHIC.note_x,
        DIRECTION_GRAPHIC.note_y);
}

// Depth between surface and floor.
const DEPTH_GRAPHIC = Object.freeze({
  top : 12,
  height : 100,
  left : 110,
  width : 140,
  right : 250,
  bottom : 112,
  cx : 180,
  rx : 16,
  ry : 5,
  top_label_x : 65,
  top_label_y : 17,
  bottom_label_x : 61,
  bottom_label_y : 116,
  water : '#163b4a',
  surface : '#7ca4b8',
  floor : '#8e8571'
});
function drawDepthGraphic({g, info, color, label}) {
  const y = DEPTH_GRAPHIC.top + DEPTH_GRAPHIC.height * brainClamp(info.fill);
  g.fillStyle = DEPTH_GRAPHIC.water;
  g.fillRect(DEPTH_GRAPHIC.left, DEPTH_GRAPHIC.top, DEPTH_GRAPHIC.width, DEPTH_GRAPHIC.height);
  g.strokeStyle = DEPTH_GRAPHIC.surface;
  g.beginPath();
  g.moveTo(DEPTH_GRAPHIC.left, DEPTH_GRAPHIC.top);
  g.lineTo(DEPTH_GRAPHIC.right, DEPTH_GRAPHIC.top);
  g.stroke();
  g.strokeStyle = DEPTH_GRAPHIC.floor;
  g.beginPath();
  g.moveTo(DEPTH_GRAPHIC.left, DEPTH_GRAPHIC.bottom);
  g.lineTo(DEPTH_GRAPHIC.right, DEPTH_GRAPHIC.bottom);
  g.stroke();
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(DEPTH_GRAPHIC.cx, y, DEPTH_GRAPHIC.rx, DEPTH_GRAPHIC.ry, 0, 0, Math.PI * 2);
  g.fill();
  label(t('organ_graphics.top'), DEPTH_GRAPHIC.top_label_x, DEPTH_GRAPHIC.top_label_y);
  label(t('organ_graphics.boden'), DEPTH_GRAPHIC.bottom_label_x, DEPTH_GRAPHIC.bottom_label_y);
}

// Coming pulses over PERIODS periods, between MIN_EXTENT and MAX_EXTENT steps.
const PULSE_GRAPHIC = Object.freeze({
  left : 8,
  axis_y : 101,
  right : 350,
  min_extent : 48,
  max_extent : 240,
  periods : 3,
  line_width : 2,
  start_x : 10,
  span : 338,
  base_y : 100,
  rise : 2,
  peak_y : 39,
  fall : 7,
  label_y : 123,
  steps_x : 275,
  glide_x : 148,
  glide_y : 69,
  dot_x : 341,
  dot_y : 15,
  dot_radius : 4,
  axis : '#304b55'
});
function drawPulseGraphic({g, info, color, label}) {
  g.strokeStyle = PULSE_GRAPHIC.axis;
  g.beginPath();
  g.moveTo(PULSE_GRAPHIC.left, PULSE_GRAPHIC.axis_y);
  g.lineTo(PULSE_GRAPHIC.right, PULSE_GRAPHIC.axis_y);
  g.stroke();
  if (Number.isFinite(info.period)) {
    const extent =
        Math.max(PULSE_GRAPHIC.min_extent,
                 Math.min(PULSE_GRAPHIC.max_extent, info.period * PULSE_GRAPHIC.periods));
    g.strokeStyle = color;
    g.lineWidth = PULSE_GRAPHIC.line_width;
    for (let t = info.nextSteps ?? 0; t <= extent; t += info.period) {
      const x = PULSE_GRAPHIC.start_x + PULSE_GRAPHIC.span * t / extent;
      g.beginPath();
      g.moveTo(x, PULSE_GRAPHIC.base_y);
      g.lineTo(x + PULSE_GRAPHIC.rise, PULSE_GRAPHIC.peak_y);
      g.lineTo(x + PULSE_GRAPHIC.fall, PULSE_GRAPHIC.base_y);
      g.stroke();
    }
    label('0', PULSE_GRAPHIC.left, PULSE_GRAPHIC.label_y);
    label(t('units.steps', {n : organNumber(extent, 0)}), PULSE_GRAPHIC.steps_x,
          PULSE_GRAPHIC.label_y);
  } else
    label(t('organ_graphics.gleiten'), PULSE_GRAPHIC.glide_x, PULSE_GRAPHIC.glide_y);
  if (info.series > 0) {
    g.fillStyle = color;
    g.beginPath();
    g.arc(PULSE_GRAPHIC.dot_x, PULSE_GRAPHIC.dot_y, PULSE_GRAPHIC.dot_radius, 0, 2 * Math.PI);
    g.fill();
  }
}

// The signal history over at least WINDOW steps.
const SIGNAL_GRAPHIC = Object.freeze({
  window : 30,
  axis_x : 30,
  axis_top : 20,
  axis_y : 105,
  axis_right : 348,
  max_y : 13,
  zero_x : 15,
  zero_y : 109,
  now_x : 323,
  caption_y : 126,
  line_width : 2,
  axis_width : 318,
  axis_height : 80,
  dot : 3,
  axis : '#2e4a54'
});
function drawSignalGraphic({g, info, d, tissue, color, label}) {
  const history = organSignalHistory(d, tissue, info), end = sceneState.frame.step,
        start =
            Math.min(end - SIGNAL_GRAPHIC.window, history[0]?.[0] ?? end - SIGNAL_GRAPHIC.window),
        feeding = info.graphic === 'feeding',
        max = feeding ? Math.max(1, ...history.map(p => p[1])) : 1;
  g.strokeStyle = SIGNAL_GRAPHIC.axis;
  g.beginPath();
  g.moveTo(SIGNAL_GRAPHIC.axis_x, SIGNAL_GRAPHIC.axis_top);
  g.lineTo(SIGNAL_GRAPHIC.axis_x, SIGNAL_GRAPHIC.axis_y);
  g.lineTo(SIGNAL_GRAPHIC.axis_right, SIGNAL_GRAPHIC.axis_y);
  g.stroke();
  label(feeding ? t('units.energyPerStep', {n : organNumber(max, 1)}) : percent(1), 0,
        SIGNAL_GRAPHIC.max_y);
  label('0', SIGNAL_GRAPHIC.zero_x, SIGNAL_GRAPHIC.zero_y);
  label(t('organ_graphics.now'), SIGNAL_GRAPHIC.now_x, SIGNAL_GRAPHIC.caption_y);
  label(t('units.steps', {n : organNumber(start - end, 0)}), SIGNAL_GRAPHIC.axis_x,
        SIGNAL_GRAPHIC.caption_y);
  g.strokeStyle = color;
  g.lineWidth = SIGNAL_GRAPHIC.line_width;
  g.beginPath();
  for (let i = 0; i < history.length; i++) {
    const [t, value] = history[i],
              x = SIGNAL_GRAPHIC.axis_x + SIGNAL_GRAPHIC.axis_width * (t - start) / (end - start),
              y = SIGNAL_GRAPHIC.axis_y - SIGNAL_GRAPHIC.axis_height * brainClamp(value / max);
    if (i)
      g.lineTo(x, y);
    else
      g.moveTo(x, y);
  }
  g.stroke();
  if (history.length === 1) {
    g.fillStyle = color;
    g.beginPath();
    g.arc(SIGNAL_GRAPHIC.axis_right,
          SIGNAL_GRAPHIC.axis_y - SIGNAL_GRAPHIC.axis_height * brainClamp(info.series / max),
          SIGNAL_GRAPHIC.dot, 0, 2 * Math.PI);
    g.fill();
  }
}

// The reserve organ, filled with fat, and its filling.
const RESERVE_GRAPHIC = Object.freeze({
  radius : 43,
  cx : 83,
  cy : 63,
  alpha : .25,
  alpha_per_fill : .65,
  line_width : 1.5,
  column : 146,
  bar_y : 54,
  bar_width : 190,
  label_y : 84,
  full_x : 315,
  fat : '#d8bf69'
});
function drawReserveGraphic({g, info, d, color, label, bar}) {
  const q = fishReserveShape(d.a), scale = RESERVE_GRAPHIC.radius / q.rx;
  g.save();
  g.translate(RESERVE_GRAPHIC.cx - q.x * scale, RESERVE_GRAPHIC.cy - (q.y - q.bend * .5) * scale);
  fishReservePath(g, scale, d.a);
  g.fillStyle = RESERVE_GRAPHIC.fat;
  g.globalAlpha = RESERVE_GRAPHIC.alpha + RESERVE_GRAPHIC.alpha_per_fill * brainClamp(info.fill);
  g.fill();
  g.globalAlpha = 1;
  g.strokeStyle = color;
  g.lineWidth = RESERVE_GRAPHIC.line_width;
  g.stroke();
  g.restore();
  bar(RESERVE_GRAPHIC.column, RESERVE_GRAPHIC.bar_y, RESERVE_GRAPHIC.bar_width, info.fill);
  label(t('organ_graphics.empty'), RESERVE_GRAPHIC.column, RESERVE_GRAPHIC.label_y);
  label(t('organ_graphics.full'), RESERVE_GRAPHIC.full_x, RESERVE_GRAPHIC.label_y);
}

// A gamete organ filling from below.
const GONAD_GRAPHIC = Object.freeze({
  line_width : 2,
  cx : 83,
  cy : 57,
  rx : 43,
  max_ry : 39,
  sperm_ry : 23,
  alpha : .65,
  fill_x : 35,
  fill_bottom : 103,
  fill_height : 92,
  fill_width : 96,
  fill_cover : 100,
  column : 146,
  bar_y : 54,
  bar_width : 190,
  label_y : 84,
  full_x : 315
});
function drawGonadGraphic({g, info, d, color, label, bar}) {
  g.strokeStyle = color;
  g.lineWidth = GONAD_GRAPHIC.line_width;
  g.beginPath();
  g.ellipse(GONAD_GRAPHIC.cx, GONAD_GRAPHIC.cy, GONAD_GRAPHIC.rx,
            info.graphic === 'egg'
                ? Math.min(GONAD_GRAPHIC.max_ry, GONAD_GRAPHIC.rx *
                                                     fishGameteShape(d.a, MOTOR_KIND.eggs).ry /
                                                     fishGameteShape(d.a, MOTOR_KIND.eggs).rx)
                : GONAD_GRAPHIC.sperm_ry,
            0, 0, Math.PI * 2);
  g.stroke();
  g.save();
  g.clip();
  g.fillStyle = color;
  g.globalAlpha = GONAD_GRAPHIC.alpha;
  g.fillRect(GONAD_GRAPHIC.fill_x,
             GONAD_GRAPHIC.fill_bottom - GONAD_GRAPHIC.fill_height * brainClamp(info.fill),
             GONAD_GRAPHIC.fill_width, GONAD_GRAPHIC.fill_cover);
  g.restore();
  g.globalAlpha = 1;
  bar(GONAD_GRAPHIC.column, GONAD_GRAPHIC.bar_y, GONAD_GRAPHIC.bar_width, info.fill);
  label(t('organ_graphics.empty'), GONAD_GRAPHIC.column, GONAD_GRAPHIC.label_y);
  label(t('organ_graphics.full'), GONAD_GRAPHIC.full_x, GONAD_GRAPHIC.label_y);
}

// Red, green and blue channel bars.
const CHANNEL_COLORS = Object.freeze([ '#df907d', '#8bcf9e', '#89aee0' ]);
// Pigment channels and the resulting colour.
const COLOR_GRAPHIC = Object.freeze({
  name_x : 14,
  row_y : 24,
  row_step : 37,
  bar_x : 66,
  bar_y : 15,
  bar_width : 232,
  value_x : 308,
  swatch_x : 14,
  swatch_y : 114,
  swatch_width : 332,
  swatch_height : 8
});
function drawColorGraphic({g, info, label, bar}) {
  for (let i = 0; i < CHANNEL_COLORS.length; i++) {
    label([ t('organ_graphics.rot'), t('organ_graphics.gruen'), t('organ_graphics.blau') ][i],
          COLOR_GRAPHIC.name_x, COLOR_GRAPHIC.row_y + COLOR_GRAPHIC.row_step * i);
    bar(COLOR_GRAPHIC.bar_x, COLOR_GRAPHIC.bar_y + COLOR_GRAPHIC.row_step * i,
        COLOR_GRAPHIC.bar_width, info.values[i], CHANNEL_COLORS[i]);
    label(organPercent(info.values[i]), COLOR_GRAPHIC.value_x,
          COLOR_GRAPHIC.row_y + COLOR_GRAPHIC.row_step * i);
  }
  g.fillStyle = rgb(info.values);
  g.fillRect(COLOR_GRAPHIC.swatch_x, COLOR_GRAPHIC.swatch_y, COLOR_GRAPHIC.swatch_width,
             COLOR_GRAPHIC.swatch_height);
}

// Body organs drawn into a fitted frame: mouth and jaw muscles, cheeks, spines or the body.
const BODY_GRAPHIC = Object.freeze({
  cheek_points : 13,
  cheek_steps : 12,
  body_x : .1,
  margin : .32,
  fit_width : 172,
  min_extent : .1,
  fit_height : 100,
  cx : 108,
  cy : 65,
  line_width : 1.6,
  mouth_alpha : .18,
  attack_mouth_alpha : .28,
  cheek_alpha : .9,
  other_alpha : .25,
  body_alpha : .12,
  outline_alpha : .5,
  min_bite : .25,
  column : 223,
  bar_y : 56,
  bar_width : 113,
  label_y : 84,
  teeth : '#d9cfac'
});
function drawBodyGraphic({g, info, d, color, label, bar}) {
  const a=d.a,kind=info.graphic,points=kind==='attack'?[...Array.from({length:2},(_,side)=>Array.from({length:BODY_GRAPHIC.cheek_points},(_,i)=>[fishCheekPoint(a,side,i/BODY_GRAPHIC.cheek_steps,0),fishCheekPoint(a,side,i/BODY_GRAPHIC.cheek_steps,1)]).flat()).flat(),[fishMouthShape(a).front,0]]:kind==='mouth'?[...fishJawFiber(a,0,0),...fishJawFiber(a,1,1),[fishMouthShape(a).front,fishMouthShape(a).gap],[fishMouthShape(a).front,-fishMouthShape(a).gap]]:[[fishAlong(a,-TAIL_END),0],[a.snout,0],[BODY_GRAPHIC.body_x,Math.max(a.shoulder,...a.flank)+BODY_GRAPHIC.margin],[BODY_GRAPHIC.body_x,-Math.max(a.shoulder,...a.flank)-BODY_GRAPHIC.margin]],minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1])),scale=Math.min(BODY_GRAPHIC.fit_width/Math.max(BODY_GRAPHIC.min_extent,maxX-minX),BODY_GRAPHIC.fit_height/Math.max(BODY_GRAPHIC.min_extent,maxY-minY));
  g.save();
  g.translate(BODY_GRAPHIC.cx - scale * (minX + maxX) / 2,
              BODY_GRAPHIC.cy - scale * (minY + maxY) / 2);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = BODY_GRAPHIC.line_width;
  if (kind === 'mouth') {
    fishMouthPath(g, scale, a);
    g.globalAlpha = BODY_GRAPHIC.mouth_alpha;
    g.fill();
    g.globalAlpha = 1;
    g.stroke();
    for (let side = 0; side < 2; side++) {
      fishJawMusclePath(g, scale, a, side);
      g.stroke();
    }
  } else if (kind === 'attack') {
    fishMouthPath(g, scale, a);
    g.globalAlpha = BODY_GRAPHIC.attack_mouth_alpha;
    g.stroke();
    for (let side = 0; side < 2; side++) {
      fishCheekPath(g, scale, a, side);
      g.globalAlpha = side === info.side ? BODY_GRAPHIC.cheek_alpha : BODY_GRAPHIC.other_alpha;
      g.fill();
      g.stroke();
    }
  } else {
    fishBodyPath(g, scale, a);
    g.globalAlpha = BODY_GRAPHIC.body_alpha;
    g.fill();
    g.globalAlpha = BODY_GRAPHIC.outline_alpha;
    g.stroke();
    if (kind === 'defense') {
      g.globalAlpha = 1;
      for (let side = 0; side < 2; side++)
        for (const piece of fishDefenseSpines(a, side)) {
          g.beginPath();
          piece.forEach((p, i) => i ? g.lineTo(p[0] * scale, p[1] * scale)
                                    : g.moveTo(p[0] * scale, p[1] * scale));
          g.closePath();
          g.fill();
        }
    }
  }
  if (kind === 'mouth' || kind === 'attack') {
    g.globalAlpha = 1;
    g.fillStyle = BODY_GRAPHIC.teeth;
    for (const side of [0, 1])
      for (const tooth of fishTeeth({...a, bitePose : Math.max(BODY_GRAPHIC.min_bite, a.bitePose)},
                                    side)) {
        g.beginPath();
        tooth.forEach((p, i) => i ? g.lineTo(p[0] * scale, p[1] * scale)
                                  : g.moveTo(p[0] * scale, p[1] * scale));
        g.closePath();
        g.fill();
      }
  }
  g.restore();
  g.globalAlpha = 1;
  const val = kind === 'mouth' ? d.p[FISH.mouth_pose] : info.fill;
  bar(BODY_GRAPHIC.column, BODY_GRAPHIC.bar_y, BODY_GRAPHIC.bar_width, val);
  label(kind === 'health'    ? t('organ_graphics.healthy')
        : kind === 'defense' ? t('organ_graphics.schutz')
        : kind === 'attack'  ? t('organ_graphics.schliesskraft')
        : kind === 'touch'   ? t('organ_graphics.kontakt')
                             : t('organ_graphics.oeffnung'),
        BODY_GRAPHIC.column, BODY_GRAPHIC.label_y);
}

// Each organ graphic by its kind; signal histories otherwise.
const GRAPHICS = Object.freeze({
  gut : drawGutGraphic,
  hormones : drawHormoneGraphic,
  bladder : drawBladderGraphic,
  scent : drawScentGraphic,
  eye : drawEyeGraphic,
  direction : drawDirectionGraphic,
  depth : drawDepthGraphic,
  pulse : drawPulseGraphic,
  reserve : drawReserveGraphic,
  egg : drawGonadGraphic,
  sperm : drawGonadGraphic,
  color : drawColorGraphic,
  health : drawBodyGraphic,
  defense : drawBodyGraphic,
  attack : drawBodyGraphic,
  touch : drawBodyGraphic,
  mouth : drawBodyGraphic
});
// Organ graphics are WIDTH by HEIGHT pixels.
const ORGAN_GRAPHIC = Object.freeze({
  font : '11px system-ui',
  width : 360,
  height : 132,
  bar_height : 10,
  label : '#afc7cb',
  track : '#223e49'
});
export function drawOrganGraphic(canvas, info, d, tissue) {
  const g = chartContext(canvas, () => drawOrganGraphic(canvas, info, d, tissue)),
        w = ORGAN_GRAPHIC.width, h = ORGAN_GRAPHIC.height;
  g.clearRect(0, 0, w, h);
  g.font = ORGAN_GRAPHIC.font;
  g.textAlign = 'left';
  g.lineCap = 'round';
  const color = tissueColor(tissue.key), label = (text, x, y, c = ORGAN_GRAPHIC.label) => {
    g.fillStyle = c;
    g.fillText(text, x, y);
  }, bar = (x, y, width, value, c = color) => {
    g.fillStyle = ORGAN_GRAPHIC.track;
    g.fillRect(x, y, width, ORGAN_GRAPHIC.bar_height);
    g.fillStyle = c;
    g.fillRect(x, y, width * brainClamp(value), ORGAN_GRAPHIC.bar_height);
  };
  (GRAPHICS[info.graphic] ?? drawSignalGraphic)({g, canvas, info, d, tissue, color, label, bar});
  g.globalAlpha = 1;
}
