import {ATELIER_LIMITS, HORMONE_EFFECT, HORMONES, TUNING, VISION} from './schema.js';
import {hormoneColors} from './hormones.js';
import {STUDIO_ICON} from './organ_icons.js';
import {MODULES, NEURONS, ORGANS, ROLE} from './studio_organs.js';
import {findCenter, findOrgan, lifePhase, producers, receivers} from './studio_model.js';
import {escapeText, centerTitle, organTitle, tone} from './studio_views.js';
import {t} from './strings.js';

const label = key => t('studio.' + key);
const icon = (kind, size = 25) =>
    '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="' + escapeText(STUDIO_ICON[kind] ?? STUDIO_ICON.brain) +
    '" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/></svg>';
const heading = text => '<h3>' + escapeText(text) + '</h3>';
const number = value => Number(value).toFixed(2).replace(/\\.00$/, '');
function dial(name, value, key, low = 0, high = 1, step = .01, target = '') {
  const precision = Math.max(2, (String(step).split('.')[1] ?? '').length);
  const display = Number(value).toFixed(precision);
  return '<label class="aid-dial"><span>' + escapeText(name) + '</span>' +
         '<input type="range" data-field="' + key + '" data-target="' + target + '" min="' + low +
         '" max="' + high + '" step="' + step + '" value="' + display + '"/><output>' + display +
         '</output></label>';
}
function iconCells(count, id) {
  let html = '<div class="aid-cell-chooser" aria-label="' + label('inspector.count') + '">';
  for (let i = 1; i <= ATELIER_LIMITS.max_copies; ++i)
    html += '<button type="button" class="aid-cell-pill' + (i <= count ? ' on' : '') +
            '" data-cell-count="' + i + '" data-center-id="' + escapeText(id) + '" title="' + i +
            '" aria-label="' + i + '"></button>';
  return html + '</div>';
}
function spectrum(center) {
  const position = (center.q1 + 1) * 50, spread = center.qwidth * 50;
  return '<div class="aid-colour-spectrum" data-spectrum="' + escapeText(center.id) +
         '" tabindex="0" title="' + label('inspector.eyeSpectrum') + '">' +
         '<span class="aid-spectrum-window" style="left:' + number(Math.max(0, position - spread)) +
         '%;width:' + number(Math.min(100, position + spread) - Math.max(0, position - spread)) +
         '%"></span>' +
         '<span class="aid-spectrum-marker" style="left:' + number(position) + '%"></span></div>' +
         dial(label('inspector.spectrumWidth'), center.qwidth, 'qwidth', 0, 1, .01, center.id);
}
function compass(center) {
  // Quality 1 is spherical longitude, quality 2 is elevation (receptor_tuning.hh).
  const x = 12 + (center.q1 + 1) * 88, y = 8 + (1 - center.q2) * 59;
  const markers = TUNING.scent_latitudes
                      .map((latitude, i) => {
                        const longitude = TUNING.scent_longitudes[i];
                        const px = 12 + ((longitude + 360) % 360) * 176 / 360;
                        const py = 8 + (90 - latitude) * 118 / 180;
                        return '<circle cx="' + number(px) + '" cy="' + number(py) +
                               '" r="5" class="aid-scent-source"><title>' + (i + 1) +
                               '</title></circle>';
                      })
                      .join('');
  return '<svg class="aid-scent-compass" data-compass="' + escapeText(center.id) +
         '" viewBox="0 0 200 135" tabindex="0" role="img" aria-label="' +
         label('inspector.scents') + '">' +
         '<rect x="12" y="8" width="176" height="118" rx="10"/>' +
         '<path d="M100 8 V126 M12 67 H188"/>' + markers +
         '<circle class="aid-scent-selector" cx="' + number(x) + '" cy="' + number(y) +
         '" r="7"/></svg>' +
         dial(label('inspector.width'), center.qwidth, 'qwidth', 0, 1, .01, center.id);
}
function vectorPad(center, xLeft, xRight, yTop, yBottom) {
  const x = 15 + (center.q1 + 1) * 60, y = 15 + (1 - center.q2) * 60;
  return '<div class="aid-vector-editor">' +
         '<svg data-vector-pad="' + escapeText(center.id) +
         '" viewBox="0 0 150 150" tabindex="0" role="img" aria-label="' +
         label('inspector.organShape') + '">' +
         '<rect x="15" y="15" width="120" height="120" rx="12"/>' +
         '<path d="M75 15 V135 M15 75 H135"/>' +
         '<circle class="aid-vector-point" cx="' + number(x) + '" cy="' + number(y) +
         '" r="8"/></svg>' +
         '<div class="aid-vector-hints"><span>' + escapeText(xLeft) + '</span><span>' +
         escapeText(yTop) + '</span><span>' + escapeText(xRight) + '</span><span>' +
         escapeText(yBottom) + '</span></div></div>';
}
function contactField(center) {
  const half =
      Math.PI / 180 * (TUNING.contact_width_min + TUNING.contact_width_span * center.field);
  const radial = angle => [70 + 53 * Math.sin(angle), 70 - 53 * Math.cos(angle)];
  const lo = radial(-half), hi = radial(half);
  return '<svg class="aid-contact-field" viewBox="0 0 140 140" role="img" aria-label="' +
         label('inspector.contactAngle') + '"><circle cx="70" cy="70" r="53"/>' +
         '<path class="aid-contact-sector" d="M70 70 L' + number(lo[0]) + ' ' + number(lo[1]) +
         ' A53 53 0 ' + (half * 2 > Math.PI ? 1 : 0) + ' 1 ' + number(hi[0]) + ' ' + number(hi[1]) +
         ' Z"/>' +
         '<circle cx="70" cy="70" r="5"/></svg>';
}
function eyeField(state, center) {
  const site = state.sites.find(s => s.id === center.site);
  if (!site)
    return '';
  const limit = Math.PI * VISION.half_view;
  const direction = site.side * limit * (.5 * (1 - site.u) + .5 * site.w);
  const width = Math.PI / 180 * TUNING.visual_width_min *
                Math.pow(TUNING.visual_width_max / TUNING.visual_width_min, center.field);
  const start = Math.max(-limit, direction - width);
  const end = Math.min(limit, direction + width);
  const point = a => [50 + 41 * Math.sin(a), 53 - 41 * Math.cos(a)];
  const left = point(start), right = point(end), mid = point(direction);
  const large = end - start > Math.PI ? 1 : 0;
  const sector = 'M50 53 L' + number(left[0]) + ' ' + number(left[1]) + ' A41 41 0 ' + large +
                 ' 1 ' + number(right[0]) + ' ' + number(right[1]) + ' Z';
  return '<div class="aid-eye-field">' +
         '<svg class="aid-eye-pad" viewBox="0 0 100 100" role="img" aria-label="' +
         label('inspector.eyeAngle') + '">' +
         '<circle cx="50" cy="53" r="41"/><path d="' + sector +
         '" fill="#81d2c0" fill-opacity=".27"/>' +
         '<path d="M50 53 L' + number(mid[0]) + ' ' + number(mid[1]) +
         '" stroke="#e5c184" stroke-width="2"/><circle cx="50" cy="53" r="3"/></svg>' +
         '<span>' + label('inspector.eyeAngle') + ': ' + Math.round((end - start) * 180 / Math.PI) +
         '°</span></div>';
}
// The same spectral kernel and absorption formula as receptor_tuning.hh/material.hh.
function pigmentColours(center, report) {
  const hue = (center.q1 + 1) * TUNING.hue_half_circle;
  const width = Math.max(0, Math.min(1, center.qwidth));
  const floor = Math.pow(width, TUNING.wide_power);
  const sigma = TUNING.sigma_min + TUNING.sigma_span * width * width;
  const weights = Array.from({length : 3}, (_, channel) => {
    const delta = ((hue - TUNING.channel_hue * channel + 540) % 360) - 180;
    return floor + (1 - floor) * Math.exp(-delta * delta / (2 * sigma * sigma));
  });
  const total = weights.reduce((a, b) => a + b, 0);
  const local = weights.map(weight => center.copies / 16 * weight / total);
  const base = Array.isArray(report?.restingAbsorption) ? report.restingAbsorption : local;
  const display = absorption => {
    const sum = absorption.reduce((a, b) => a + b, 0);
    return 'rgb(' + absorption.map(a => Math.round(255 * (1 - a / (sum + 10)))).join(' ') + ')';
  };
  return [ display(base), display(base.map((a, c) => a + local[c])) ];
}
function pigmentPreview(center, report) {
  const [rest, active] = pigmentColours(center, report);
  return '<div class="aid-pigment-preview">' +
         '<span style="background:' + rest + '"><small>' + label('inspector.colourRest') +
         '</small></span>' +
         '<span style="background:' + active + '"><small>' + label('inspector.colourActive') +
         '</small></span></div>' + spectrum(center);
}
function glandProfile(state, center) {
  const substances = state.document.substances;
  if (!substances.length)
    return '<button class="aid-secondary" data-add-substance>' +
           '+ ' + label('sections.newSubstance') + '</button>';
  const total = state.capabilities?.bloodSubstances ?? HORMONES.levels;
  const sigma = .15 + 1.85 * center.qwidth;
  const affinities = substances.map(sub => {
    const angle = 2 * Math.PI * sub.index / total;
    const dx = center.q1 - Math.cos(angle), dy = center.q2 - Math.sin(angle);
    return Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
  });
  const largest = Math.max(...affinities);
  return heading(label('inspector.glandOutput')) + '<div class="aid-gland-choice">' +
         substances
             .map((sub, i) => '<button data-gland-substance="' + sub.index + '" data-center-id="' +
                              escapeText(center.id) + '" class="' +
                              (affinities[i] === largest ? 'active' : '') +
                              '" style="--affinity:' + Math.round(affinities[i] * 100) + '%">' +
                              escapeText(sub.name || String.fromCharCode(65 + sub.index)) +
                              '<span class="aid-gland-affinity"></span></button>')
             .join('') +
         '</div>' +
         '<div class="aid-gland-flow"><span>＋ ' + label('inspector.glandSecretes') +
         '</span><span>− ' + label('inspector.glandBinds') + '</span></div>' +
         dial(label('inspector.receptorWidth'), center.qwidth, 'qwidth', 0, 1, .01, center.id);
}
function hormonePad(state, center) {
  const total = state.capabilities?.bloodSubstances ?? HORMONES.levels;
  const names = new Map(state.document.substances.map(sub => [sub.index, sub.name]));
  const circles =
      Array
          .from({length : total},
                (_, i) => {
                  const angle = 2 * Math.PI * i / total;
                  const x = 75 + Math.cos(angle) * 51, y = 75 - Math.sin(angle) * 51;
                  const name =
                      names.get(i) || (i === HORMONES.levels       ? label('inspector.maturity')
                                       : i === HORMONES.levels + 1 ? label('inspector.reserve')
                                                                   : String.fromCharCode(65 + i));
                  return '<circle class="aid-hormone-source" cx="' + number(x) + '" cy="' +
                         number(y) + '" r="9"><title>' + escapeText(name) + '</title></circle>';
                })
          .join('');
  return '<svg class="aid-hormone-compass" data-vector-pad="' + escapeText(center.id) +
         '" viewBox="0 0 150 150" tabindex="0" role="img" aria-label="' +
         label('inspector.hormoneProfile') + '">' +
         '<circle cx="75" cy="75" r="51"/><path d="M75 16 V134 M16 75 H134"/>' + circles +
         '<circle class="aid-vector-point" cx="' + number(75 + center.q1 * 51) + '" cy="' +
         number(75 - center.q2 * 51) + '" r="7"/></svg>' +
         dial(label('inspector.receptorWidth'), center.qwidth, 'qwidth', 0, 1, .01, center.id);
}
function pressureGraphic(kind) {
  const color = tone(kind);
  return '<svg viewBox="0 0 280 75" class="aid-gonad-graphic">' +
         '<ellipse cx="70" cy="38" rx="50" ry="28" fill="' + color +
         '" opacity=".30"/><ellipse cx="212" cy="38" rx="38" ry="23" fill="' + color +
         '" opacity=".55"/><path d="M123 38 H173" stroke="' + color +
         '" stroke-width="3" stroke-dasharray="7 6"/>' +
         '<text x="70" y="42" text-anchor="middle">' + label('centers.growth') +
         '</text><text x="212" y="42" text-anchor="middle">' + label('centers.release') +
         '</text></svg>';
}
function organSettings(state, organ, center) {
  if (!center)
    return '<div class="aid-empty-centre">' + label('sections.empty') + '</div>';
  let html = '';
  if (organ.type === 'eye') {
    html += '<div class="aid-visual-inputs">' + eyeField(state, center) + spectrum(center) +
            '</div>' +
            dial(label('inspector.eyeWidth'), center.field, 'field', 0, 1, .01, center.id) +
            '<div class="aid-opponency"><span>' + label('inspector.opponency') +
            '</span><div class="aid-segmented">' +
            [ -1, 0, 1 ]
                .map((value, i) => '<button data-opponency="' + value + '" data-center-id="' +
                                   escapeText(center.id) + '" class="' +
                                   (Math.abs(center.q2 - value) < .01 ? 'active' : '') + '">' +
                                   label('inspector.opponencyLevels.' + i) + '</button>')
                .join('') +
            '</div></div>';
  } else if (organ.type === 'nose') {
    html += compass(center) +
            dial(label('inspector.adaptation'), center.tau, 'tau', 0, 1, .01, center.id);
  } else if (organ.type === 'pigment') {
    html += pigmentPreview(center, state.stale ? null : state.report);
  } else if (organ.type === 'gland') {
    html += glandProfile(state, center);
  } else if (organ.type === 'eggs' || organ.type === 'sperm') {
    html += pressureGraphic(organ.type);
  } else if (organ.type === 'mouth') {
    if (center.key === 'jaw')
      html += vectorPad(center, label('inspector.sharpTeeth'), label('inspector.bluntTeeth'),
                        label('inspector.longJaw'), label('inspector.shortJaw'));
    else
      html += '<div class="aid-anatomy-example">' + icon('gut', 64) + '<span>' +
              label('inspector.gutLength') + '</span></div>' +
              dial(label('inspector.gutLength'), center.q1, 'q1', -1, 1, .01, center.id);
  } else if (organ.type === 'tail') {
    const rate = (center.q1 + 1) / 2;
    const points = Array
                       .from({length : 25},
                             (_, i) => {
                               const x = 10 + i * 9, y = 40 + 19 * Math.sin(i * (.23 + .30 * rate));
                               return number(x) + ',' + number(y);
                             })
                       .join(' ');
    html += '<svg class="aid-organ-wave" viewBox="0 0 240 80"><polyline points="' + points +
            '"/></svg>' +
            dial(label('inspector.tailRhythm'), center.q1, 'q1', -1, 1, .01, center.id);
  } else if (organ.type === 'proximity') {
    html += eyeField(state, center) +
            dial(label('inspector.eyeWidth'), center.field, 'field', 0, 1, .01, center.id) +
            dial(label('inspector.distanceRange'), center.q2, 'q2', -1, 1, .01, center.id);
  } else if ([ 'lateral', 'touch', 'pain' ].includes(organ.type)) {
    html += contactField(center) +
            dial(label('inspector.contactAngle'), center.field, 'field', 0, 1, .01, center.id);
  } else if (organ.type === 'blood') {
    html += hormonePad(state, center);
  } else if (organ.type === 'brain') {
    html += '<div class="aid-neuron-kind">' + escapeText(centerTitle(center)) + '</div>';
    if (center.key === 'pacemaker')
      html += dial(label('inspector.rhythm'), center.pace, 'pace', -1, 1, .05, center.id);
    if (center.key === 'modulate')
      html +=
          dial(label('inspector.modulation'), center.modulator, 'modulator', 0, 1, .05, center.id);
    if (center.key === 'learn')
      html += '<button class="aid-secondary" data-tool="learn">' + label('inspector.learning') +
              '</button>';
  } else {
    html += '<div class="aid-organ-metric">' + icon(organ.type, 50) + '<span>' +
            escapeText(organTitle(organ)) + '</span></div>';
  }
  html += '<div class="aid-cell-count-title">' + label('inspector.count') + ' <strong>' +
          center.copies + '</strong></div>' + iconCells(center.copies, center.id);
  if (organ.type !== 'eye' && organ.type !== 'nose')
    html +=
        dial(label('inspector.sensitivity'), center.threshold, 'threshold', -1, 1, .05, center.id);
  html += dial(label('inspector.speed'), center.tau, 'tau', 0, 1, .01, center.id);
  return html;
}
function selectedCenter(state, organ) {
  const selected = state.selected;
  if (selected?.kind === 'center')
    return organ.centers.find(c => c.id === selected.id) ?? organ.centers[0];
  return organ.centers[0] ?? null;
}
function centerTabs(state, organ) {
  if (!organ.centers.length)
    return '';
  return '<div class="aid-center-tabs">' +
         organ.centers
             .map(c => '<button data-select-center="' + escapeText(c.id) + '" class="' +
                       (state.selected?.id === c.id ? 'selected' : '') + '">' +
                       escapeText(centerTitle(c)) + '</button>')
             .join('') +
         '</div>';
}
function organInspector(state, organ) {
  const center = selectedCenter(state, organ);
  let html = '<header class="aid-inspector-head"><span>' + label('inspector.organType') +
             '</span>' + heading(organTitle(organ)) + '</header>' + centerTabs(state, organ);
  if (organ.type === 'brain') {
    html += '<div class="aid-inspector-actions"><button data-add-neuron="relay">' +
            '+ ' + label('centers.relay') + '</button></div>';
  }
  html += '<div class="aid-organ-settings">' + organSettings(state, organ, center) + '</div>';
  if (organ.type !== 'brain') {
    html += '<div class="aid-inspector-actions"><button data-add-center="' + escapeText(organ.id) +
            '">' + label('inspector.addCenter') + '</button>' +
            '<button data-mirror-organ="' + escapeText(organ.id) + '">' +
            label('inspector.mirror') + '</button>' +
            '<button class="aid-danger" data-remove-organ="' + escapeText(organ.id) + '">' +
            label('inspector.removeOrgan') + '</button></div>';
  } else if (state.selected?.kind === 'center') {
    html += '<button class="aid-danger" data-remove-center="' + escapeText(center.id) + '">' +
            label('inspector.removeCenter') + '</button>';
  }
  return html;
}
function wireInspector(state, wire) {
  const from = findCenter(state.document, wire.from)?.center,
        to = findCenter(state.document, wire.to)?.center;
  return '<header class="aid-inspector-head"><span>' + label('sections.connections') + '</span>' +
         heading((from ? centerTitle(from) : '?') + ' → ' + (to ? centerTitle(to) : '?')) +
         '</header>' +
         '<div class="aid-wire-parameters">' +
         dial(label('sections.strength'), wire.strength, 'strength', 0, 1, .01, wire.id) +
         dial(label('sections.spread'), wire.spread, 'spread', 0, 1, .01, wire.id) +
         dial(label('sections.range'), wire.length, 'length', 0, 1, .01, wire.id) +
         dial(label('sections.cross'), wire.cross, 'cross', 0, 1, .01, wire.id) +
         '</div><button class="aid-danger" data-remove-wire="' + escapeText(wire.id) + '">' +
         label('inspector.removeWire') + '</button>';
}
// The engine's binding (colony-core/field/hormones.hh): x^n / (x^n + 1), x = c / K, n =
// 2^steepness.
function bound(receptor, c) {
  let x = c / receptor.half;
  for (let k = 0; k < receptor.steepness; ++k)
    x *= x;
  return x / (1 + x);
}
// The receptor's response R, and what each effect makes of it (colony-core/field/substrate.cc):
// output, competition, trace and rhythm scale by (1 + R) / 2, learning by 1 + R, excitation
// adds R, death strikes above DEATH_RESPONSE. Growth is the bound share without baseline.
const DEATH_RESPONSE = .5;
const EFFECT_SCALE = Object.freeze({
  [HORMONE_EFFECT.excitation] : {low : -1, high : 1, value : r => r},
  [HORMONE_EFFECT.learning] : {low : 0, high : 2, value : r => 1 + r},
  [HORMONE_EFFECT.death] : {low : -1, high : 1, value : r => r}
});
const SHARE_SCALE = Object.freeze({low : 0, high : 1, value : r => (1 + r) / 2});
export const GROWTH = 'growth';
const CURVE = Object.freeze(
    {width : 260, height : 150, left : 36, right : 250, top : 14, bottom : 112, points : 80});
function effectCurve(state, receptor, effect) {
  const maturity = receptor.substance === HORMONES.levels && effect !== GROWTH;
  const [halfMin, halfMax] = state.capabilities?.halfRange ?? [ receptor.half, receptor.half ];
  const scale = effect === GROWTH ? {low : 0, high : 1, value : r => Math.max(0, r)}
                                  : EFFECT_SCALE[effect] ?? SHARE_SCALE;
  const response = c => effect === GROWTH
                            ? Math.min(1, receptor.sensitivity * bound(receptor, c))
                            : Math.max(-1, Math.min(1, receptor.baseline + receptor.sensitivity *
                                                                               bound(receptor, c)));
  const at = i =>
      maturity ? i / CURVE.points : halfMin * Math.pow(halfMax / halfMin, i / CURVE.points);
  const x = i => CURVE.left + (CURVE.right - CURVE.left) * i / CURVE.points;
  const y = v =>
      CURVE.bottom - (CURVE.bottom - CURVE.top) * (v - scale.low) / (scale.high - scale.low);
  const points = Array
                     .from({length : CURVE.points + 1},
                           (_, i) => number(x(i)) + ',' + number(y(scale.value(response(at(i))))))
                     .join(' ');
  let marks = '';
  if (scale.low < 0 && scale.high > 0)
    marks += '<path class="aid-chart-zero" d="M' + CURVE.left + ' ' + number(y(0)) + ' H' +
             CURVE.right + '"/>';
  if (effect === HORMONE_EFFECT.death)
    marks += '<rect class="aid-death-zone" x="' + CURVE.left + '" y="' + CURVE.top + '" width="' +
             (CURVE.right - CURVE.left) + '" height="' + number(y(DEATH_RESPONSE) - CURVE.top) +
             '"/>';
  const text = (value, px, py, anchor = 'start') => '<text x="' + px + '" y="' + py +
                                                    '" text-anchor="' + anchor + '">' +
                                                    escapeText(value) + '</text>';
  const unit = effect === GROWTH ? label('inspector.growth') : label('effects.' + effect);
  return '<svg viewBox="0 0 ' + CURVE.width + ' ' + CURVE.height + '" class="aid-response-chart">' +
         marks + '<path class="aid-chart-axis" d="M' + CURVE.left + ' ' + CURVE.top + ' V' +
         CURVE.bottom + ' H' + CURVE.right + '"/>' +
         '<polyline class="aid-response-line" points="' + points + '"/>' +
         text(String(scale.high), CURVE.left - 4, CURVE.top + 4, 'end') +
         text(String(scale.low), CURVE.left - 4, CURVE.bottom, 'end') +
         text(maturity ? '0' : String(halfMin), CURVE.left, CURVE.bottom + 14) +
         text('1', CURVE.right, CURVE.bottom + 14, 'end') +
         text(maturity ? label('inspector.maturity') : label('inspector.concentration'),
              (CURVE.left + CURVE.right) / 2, CURVE.bottom + 14, 'middle') +
         text(unit, CURVE.left + 4, CURVE.top + 10) + '</svg>';
}
// Dials shared by every receptor: sensitivity over the engine's span, half value, steepness.
function receptorDials(state, receptor, target, baseline = true) {
  const span = state.capabilities?.sensitivitySpan ?? 1,
        steps = state.capabilities?.steepnessSteps ?? 0;
  return (baseline ? dial(label('inspector.receptorBaseline'), receptor.baseline, 'baseline', -1, 1,
                          .01, target)
                   : '') +
         dial(label('inspector.receptorSensitivity'), receptor.sensitivity, 'sensitivity', -span,
              span, .01, target) +
         dial(label('inspector.receptorHalf'), receptor.half, 'half', .0003, 1, .0001, target) +
         dial(label('inspector.steepness'), receptor.steepness, 'steepness', 0, steps, 1, target);
}
const substanceColour = index => hormoneColors[index] ?? 'currentColor';
// A cell's life phase on the maturity axis: its output over maturity and, past its end, the
// permanent death (lifePhase in studio_model.js).
export const PHASE = 'phase';
function lifePhaseEditor(state, focus) {
  const phase = lifePhase(focus), output = focus.receptors[HORMONE_EFFECT.output];
  // Output share over maturity; an output receptor on a hormone shows its share without hormone.
  const onMaturity = output.substance === HORMONES.levels;
  const level = m => {
    if (phase.end !== null && m > phase.end)
      return 0;
    const c = onMaturity ? m : 0;
    const r =
        output.active
            ? Math.max(-1, Math.min(1, output.baseline + output.sensitivity * bound(output, c)))
            : 1;
    return (1 + r) / 2;
  };
  const x = m => CURVE.left + (CURVE.right - CURVE.left) * m,
        y = v => CURVE.bottom - (CURVE.bottom - CURVE.top) * v;
  const points = Array.from({length : CURVE.points + 1}, (_, i) => i / CURVE.points)
                     .map(m => number(x(m)) + ',' + number(y(level(m))))
                     .join(' ');
  const dead = phase.end === null
                   ? ''
                   : '<rect class="aid-death-zone" x="' + number(x(phase.end)) + '" y="' +
                         CURVE.top + '" width="' + number(CURVE.right - x(phase.end)) +
                         '" height="' + (CURVE.bottom - CURVE.top) + '"/>';
  const text = (value, px, py, anchor = 'start') => '<text x="' + px + '" y="' + py +
                                                    '" text-anchor="' + anchor + '">' +
                                                    escapeText(value) + '</text>';
  const target = focus.id + ':' + PHASE;
  return '<section class="aid-life-phase">' + heading(label('inspector.lifePhase')) +
         '<svg viewBox="0 0 ' + CURVE.width + ' ' + CURVE.height + '" class="aid-response-chart">' +
         dead + '<path class="aid-chart-axis" d="M' + CURVE.left + ' ' + CURVE.top + ' V' +
         CURVE.bottom + ' H' + CURVE.right + '"/>' +
         '<polyline class="aid-response-line" points="' + points + '"/>' +
         text('100 %', CURVE.left - 4, CURVE.top + 4, 'end') +
         text('0', CURVE.left - 4, CURVE.bottom, 'end') + text('0', CURVE.left, CURVE.bottom + 14) +
         text('1', CURVE.right, CURVE.bottom + 14, 'end') +
         text(label('inspector.maturity'), (CURVE.left + CURVE.right) / 2, CURVE.bottom + 14,
              'middle') +
         text(label('effects.' + HORMONE_EFFECT.output), CURVE.left + 4, CURVE.top + 10) +
         '</svg>' +
         '<label class="aid-checkbox"><input type="checkbox" data-phase-start="' +
         escapeText(focus.id) + '" ' + (phase.start !== null ? 'checked' : '') + '/>' +
         label('inspector.phaseStart') + '</label>' +
         (phase.start !== null
              ? dial(label('inspector.maturity'), phase.start, 'start', .05, 1, .01, target)
              : '') +
         '<label class="aid-checkbox"><input type="checkbox" data-phase-end="' +
         escapeText(focus.id) + '" ' + (phase.end !== null ? 'checked' : '') + '/>' +
         label('inspector.phaseEnd') + '</label>' +
         (phase.end !== null
              ? dial(label('inspector.maturity'), phase.end, 'end', .05, 1, .01, target)
              : '') +
         '</section>';
}
// The body's growth receptor: which hormone lets the body grow.
function growthEditor(state) {
  const {document : doc} = state, growth = doc.growth;
  let html = '<section class="aid-growth">' + heading(label('inspector.growth'));
  if (!doc.substances.length)
    return html + '<div class="aid-empty-centre">' + label('inspector.growthNeedsSubstance') +
           '</div></section>';
  html += '<label class="aid-checkbox"><input type="checkbox" data-growth-active ' +
          (growth.active ? 'checked' : '') + '/>' + label('inspector.growthActive') + '</label>' +
          '<div class="aid-substance-choices">' +
          doc.substances
              .map(sub => '<button data-growth-substance="' + sub.index + '" class="' +
                          (growth.active && growth.substance === sub.index ? 'active' : '') +
                          '" style="--substance:' + substanceColour(sub.index) + '">' +
                          escapeText(sub.name || String.fromCharCode(65 + sub.index)) + '</button>')
              .join('') +
          '</div>';
  if (growth.active)
    html += effectCurve(state, growth, GROWTH) + receptorDials(state, growth, GROWTH, false);
  return html + '</section>';
}
function hormoneInspector(state) {
  const {document : doc, selected} = state;
  let html = '<header class="aid-inspector-head"><span>' + label('sections.receptors') + '</span>' +
             heading(label('tools.hormone')) + '</header>';
  html += '<div class="aid-substances">' +
          doc.substances
              .map(substance => {
                const title = substance.name || (label('inspector.substanceName') + ' ' +
                                                 String.fromCharCode(65 + substance.index));
                return '<div class="aid-substance-row">' +
                       '<button class="aid-substance-pill' +
                       (state.focusSubstance === substance.index ? ' active' : '') +
                       '" data-select-substance="' + substance.index +
                       '"><span class="aid-substance-swatch" style="--substance:' +
                       substanceColour(substance.index) + '"></span>' + escapeText(title) +
                       '</button>' +
                       '<button class="aid-row-menu" data-rename-substance="' + substance.index +
                       '" title="' + label('inspector.substanceName') + '">✎</button>' +
                       '<button class="aid-row-menu" data-remove-substance="' + substance.index +
                       '" aria-label="' + label('inspector.removeWire') + '">×</button></div>';
              })
              .join('') +
          '</div>';
  if (doc.substances.length < HORMONES.levels)
    html += '<button class="aid-secondary" data-add-substance>' +
            '+ ' + label('sections.newSubstance') + '</button>';
  const selectedSubstance = doc.substances.find(s => s.index === state.focusSubstance);
  if (selectedSubstance) {
    const total = state.capabilities?.bloodSubstances ?? HORMONES.levels;
    const releasing = producers(doc, selectedSubstance.index, total),
          receiving = receivers(doc, selectedSubstance.index);
    const buttons = members => members
                                   .map(c => '<button data-select-center="' + escapeText(c.id) +
                                             '">' + escapeText(centerTitle(c)) + '</button>')
                                   .join('');
    html += '<section class="aid-hormone-map">' +
            heading(selectedSubstance.name || String.fromCharCode(65 + selectedSubstance.index)) +
            '<div class="aid-hormone-flow"><span>' + label('inspector.produces') + '</span><div>' +
            buttons(releasing) + '</div><span>' + label('inspector.receives') + '</span><div>' +
            buttons(receiving) + '</div></div></section>';
  }
  let focus = null;
  if (selected?.kind === 'center')
    focus = findCenter(doc, selected.id)?.center;
  if (selected?.kind === 'organ')
    focus = findOrgan(doc, selected.id)?.centers[0];
  if (!focus)
    return html + growthEditor(state);
  // Only the effects the engine gives this kind of cell.
  const effects = state.capabilities?.roleEffects?.[ROLE[focus.role]] ?? [];
  const effect = effects.includes(state.effect) ? state.effect : effects[0];
  const receptor = focus.receptors?.[effect];
  if (!receptor)
    return html;
  html += lifePhaseEditor(state, focus) + '<div class="aid-receptor-editor">' +
          heading(centerTitle(focus)) + '<div class="aid-effect-chips">' +
          effects
              .map(i => '<button data-effect="' + i + '" class="' + (effect === i ? 'active' : '') +
                        '">' + escapeText(label('effects.' + i)) + '</button>')
              .join('') +
          '</div>' + effectCurve(state, receptor, effect) +
          '<label class="aid-checkbox"><input type="checkbox" data-receptor-active="' +
          escapeText(focus.id) + '" ' + (receptor.active ? 'checked' : '') + '/>' +
          label('inspector.receptorActive') + '</label>' +
          receptorDials(state, receptor, focus.id + ':' + effect) +
          dial(label('inspector.receptorWidth'), receptor.width, 'width', 0, 1, .01,
               focus.id + ':' + effect) +
          '<div class="aid-substance-choices">' +
          [...doc.substances, {index : HORMONES.levels, name : label('inspector.maturity')} ]
              .map(sub => '<button data-receptor-substance="' + sub.index + '" data-center-id="' +
                          escapeText(focus.id) + '" class="' +
                          (receptor.substance === sub.index ? 'active' : '') + '">' +
                          escapeText(sub.name || String.fromCharCode(65 + sub.index)) + '</button>')
              .join('') +
          '</div></div>';
  return html;
}
// Every nerve cell learns with its plasticity (quality width); its mode chooses cancelling (< 0),
// neutral or competitive (> 0) learning (colony-core/field/substrate.hh, cell_class).
function learningInspector(state) {
  const selected = state.selected, doc = state.document;
  const chosen = selected?.kind === 'center'  ? findCenter(doc, selected.id)?.center
                 : selected?.kind === 'organ' ? findOrgan(doc, selected.id)?.centers[0]
                                              : null;
  let html = '<header class="aid-inspector-head"><span>' + label('sections.brain') + '</span>' +
             heading(label('tools.learn')) + '</header>';
  if (!chosen || chosen.role !== 'nerve')
    return html + '<div class="aid-empty-centre">' + label('inspector.selectLearning') + '</div>';
  html += heading(centerTitle(chosen)) +
          dial(label('inspector.plasticity'), chosen.qwidth, 'qwidth', 0, 1, .01, chosen.id) +
          dial(label('inspector.learningMode'), chosen.mode, 'mode', -1, 1, .01, chosen.id) +
          '<div class="aid-range-hints"><span>' + label('inspector.cancelling') + '</span><span>' +
          label('inspector.competing') + '</span></div>';
  const effect = state.effect === HORMONE_EFFECT.eligibility ? HORMONE_EFFECT.eligibility
                                                             : HORMONE_EFFECT.learning;
  const receptor = chosen.receptors?.[effect];
  if (!receptor)
    return html;
  html += '<div class="aid-effect-chips">' +
          [ HORMONE_EFFECT.learning, HORMONE_EFFECT.eligibility ]
              .map(value => '<button data-effect="' + value + '" class="' +
                            (effect === value ? 'active' : '') + '">' + label('effects.' + value) +
                            '</button>')
              .join('') +
          '</div>' + effectCurve(state, receptor, effect) +
          '<label class="aid-checkbox"><input type="checkbox" data-receptor-active="' +
          escapeText(chosen.id) + '" ' + (receptor.active ? 'checked' : '') + '/>' +
          label('inspector.receptorActive') + '</label>' +
          receptorDials(state, receptor, chosen.id + ':' + effect) +
          '<div class="aid-substance-choices">' +
          [...doc.substances, {index : HORMONES.levels, name : label('inspector.maturity')} ]
              .map(sub => '<button data-receptor-substance="' + sub.index + '" data-center-id="' +
                          escapeText(chosen.id) + '" class="' +
                          (receptor.substance === sub.index ? 'active' : '') + '">' +
                          escapeText(sub.name || String.fromCharCode(65 + sub.index)) + '</button>')
              .join('') +
          '</div>';
  return html;
}
function assemblyInspector(state, assembly) {
  return '<header class="aid-inspector-head"><span>' + label('sections.module') + '</span>' +
         heading(assembly.name || label('sections.module')) +
         '</header><div class="aid-assembly-list">' +
         assembly.organIds
             .map(id => {
               const organ = findOrgan(state.document, id);
               return organ ? '<button data-select-organ="' + escapeText(id) + '">' +
                                  icon(organ.type, 22) + escapeText(organTitle(organ)) + '</button>'
                            : '';
             })
             .join('') +
         '</div><button data-save-assembly="' + escapeText(assembly.id) + '">' +
         label('inspector.saveModule') + '</button>' +
         '<button data-mirror-assembly="' + escapeText(assembly.id) + '">' +
         label('inspector.mirror') + '</button>' +
         '<button data-ungroup-assembly="' + escapeText(assembly.id) + '">' +
         label('inspector.ungroup') + '</button>' +
         '<button class="aid-danger" data-remove-assembly="' + escapeText(assembly.id) + '">' +
         label('inspector.removeOrgan') + '</button>';
}
function multiInspector(state) {
  const chosen = state.document.organs.filter(o => state.multi.has(o.id));
  return '<header class="aid-inspector-head"><span>' + label('inspector.selected') + '</span>' +
         heading(String(chosen.length) + ' ' + label('app.parts')) +
         '</header><div class="aid-assembly-list">' +
         chosen
             .map(o => '<button data-select-organ="' + escapeText(o.id) + '">' + icon(o.type, 22) +
                       escapeText(organTitle(o)) + '</button>')
             .join('') +
         '</div><div class="aid-inspector-actions">' +
         '<button data-assemble-selected>' + label('inspector.makeModule') + '</button>' +
         '<button data-clear-multi>' + label('inspector.cancelSelection') + '</button></div>';
}
export function inspector(state) {
  if (state.tool === 'hormone')
    return hormoneInspector(state);
  if (state.tool === 'learn')
    return learningInspector(state);
  if (state.multi?.size > 1)
    return multiInspector(state);
  const selected = state.selected;
  if (!selected)
    return '<header class="aid-inspector-head">' + heading(label('sections.empty')) + '</header>';
  if (selected.kind === 'wire') {
    const wire = state.document.wires.find(w => w.id === selected.id);
    return wire ? wireInspector(state, wire) : '';
  }
  if (selected.kind === 'assembly') {
    const assembly = state.document.assemblies.find(a => a.id === selected.id);
    return assembly ? assemblyInspector(state, assembly) : '';
  }
  const organ = selected.kind === 'organ' ? findOrgan(state.document, selected.id)
                                          : findCenter(state.document, selected.id)?.organ;
  return organ ? organInspector(state, organ) : '';
}
function paletteItem(kind, name, type, key) {
  return '<button class="aid-palette-tile" draggable="true" data-drag-kind="' + type +
         '" data-drag-value="' + escapeText(key) + '" title="' + escapeText(name) + '">' +
         '<span class="aid-palette-icon" style="--organ-color:' + tone(kind) + '">' + icon(kind) +
         '</span><span>' + escapeText(name) + '</span></button>';
}
export function library(state) {
  const categories = [ 'senses', 'internal', 'motor', 'reproduction' ];
  let html = '<div class="aid-library-intro">' + heading(label('app.parts')) + '</div>';
  for (const category of categories) {
    html += '<section class="aid-library-section"><h4>' + label('sections.' + category) +
            '</h4><div class="aid-palette-grid">' +
            ORGANS.filter(o => o.category === category)
                .map(o => paletteItem(o.key, label('organs.' + o.key), 'organ', o.key))
                .join('') +
            '</div></section>';
  }
  html +=
      '<section class="aid-library-section"><h4>' + label('sections.brain') +
      '</h4><div class="aid-palette-grid">' +
      NEURONS.map(n => paletteItem('brain', label('centers.' + n.key), 'neuron', n.key)).join('') +
      '</div></section><section class="aid-library-section"><h4>' + label('sections.modules') +
      '</h4><div class="aid-palette-grid">' +
      MODULES
          .map(m => paletteItem(m.organs[0] === 'brain' ? 'brain' : m.organs[0],
                                label('modules.' + m.key), 'module', m.key))
          .join('') +
      (state.userModules ?? [])
          .map(m => paletteItem(m.organs[0]?.type ?? 'brain', m.name, 'user-module', m.id))
          .join('') +
      '</div></section>';
  return html;
}
export function toolPalette(state) {
  const tools = [
    [ 'select', 'mouse-pointer-2', '↖' ], [ 'wire', 'cable', '⌁' ], [ 'hormone', 'droplets', '◈' ],
    [ 'learn', 'brain', '✦' ], [ 'stimulate', 'zap', 'ϟ' ], [ 'erase', 'trash', '✕' ],
    [ 'pan', 'hand', '✋' ]
  ];
  return '<div class="aid-tools" role="toolbar" aria-label="' + label('app.parts') + '">' +
         tools
             .map(([ key, ignored, glyph ]) =>
                      '<button type="button" data-tool="' + key + '" class="' +
                      (state.tool === key ? 'active' : '') + '" title="' + label('tools.' + key) +
                      '" aria-label="' + label('tools.' + key) + '">' + glyph + '</button>')
             .join('') +
         '<span class="aid-tools-divider"></span>' +
         '<button data-zoom="in" title="' + label('tools.zoomIn') + '">＋</button>' +
         '<button data-zoom="out" title="' + label('tools.zoomOut') + '">−</button>' +
         '<button data-zoom="fit" title="' + label('tools.fit') + '">⌗</button>' +
         '</div>';
}
