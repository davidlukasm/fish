import {visionInspector} from './vision.js';
import {ATELIER_LIMITS, HORMONE_EFFECT, HORMONES, TUNING} from '../../schema.js';
import {hormoneColors} from '../../hormones.js';
import {STUDIO_ICON} from '../../organ_icons.js';
import {TOOL_ICON} from './icons.js';
import {pigmentColours} from '../model/pigment.js';
import {MODULES, MUSCLE_LABEL_INDEX, NEURONS, ORGANS, ROLE, functionFor} from '../model/organs.js';
import {
  allCenters,
  boundEffects,
  findCenter,
  findOrgan,
  growsWith,
  lifePhase,
  producers,
  receivers,
  wheelAffinity,
  wheelPlace,
  wheelSigma
} from '../model/document.js';
import {escapeText, centerTitle, organTitle, tone} from './scene.js';

import {t, tList} from '../../strings.js';

const label = key => t('studio.' + key);
const icon = (kind, size = 25) =>
    '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="' + escapeText(STUDIO_ICON[kind] ?? STUDIO_ICON.brain) +
    '" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/></svg>';
const heading = text => '<h3>' + escapeText(text) + '</h3>';
const number = value => Number(value).toFixed(2).replace(/\.00$/, '');
// A dial's slider position and its reading. Plain dials show the value; 'log' dials slide over
// the decimal logarithm (receptor half values span three decades); 'hill' dials set the steepness
// step s and read the binding exponent n = 2^s.
export const DIAL_LOG_STEP = 'any', DIAL_SIGNIFICANT = 2;
export function dialReading(scale, position, step) {
  if (scale === 'log') {
    const value = 10 ** position;
    return {value, text : value.toPrecision(DIAL_SIGNIFICANT)};
  }
  if (scale === 'hill')
    return {value : position, text : 'n = ' + 2 ** position};
  const precision = Math.max(2, (String(step).split('.')[1] ?? '').length);
  return {value : position, text : position.toFixed(precision)};
}
function dial(name, value, key, low = 0, high = 1, step = .01, target = '', scale = '') {
  const position =
      scale === 'log' ? Math.min(high, Math.max(low, Math.log10(value))) : Number(value);
  const shown = scale === 'log' ? position.toFixed(DIAL_SIGNIFICANT + 1) : position;
  return '<label class="aid-dial"><span>' + escapeText(name) + '</span>' +
         '<input type="range" data-field="' + key + '" data-target="' + target + '"' +
         (scale ? ' data-scale="' + scale + '"' : '') + ' min="' + low + '" max="' + high +
         '" step="' + step + '" value="' + shown + '"/><output>' +
         dialReading(scale, position, step).text + '</output></label>';
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
function pigmentPreview(center, report, pigmentHalf) {
  const [rest, active] = pigmentColours(center, report, pigmentHalf);
  return '<div class="aid-pigment-preview">' +
         '<span style="background:' + rest + '"><small>' + label('inspector.colourRest') +
         '</small></span>' +
         '<span style="background:' + active + '"><small>' + label('inspector.colourActive') +
         '</small></span></div>' + spectrum(center);
}
// Glands release, and the blood sense reads, the substances near a free point on the wheel.
function glandProfile(state, center) {
  const substances = state.document.substances;
  if (!substances.length)
    return '<button class="aid-secondary" data-add-substance>' +
           '+ ' + label('sections.newSubstance') + '</button>';
  return heading(label('inspector.glandOutput')) +
         substanceWheel(state, {x : center.q1, y : center.q2, width : center.qwidth, active : true},
                        {
                          choices : substances.map(sub => sub.index),
                          reads : state.capabilities?.hormones,
                          attribute : 'data-wheel-substance',
                          extra : ' data-center-id="' + escapeText(center.id) + '"',
                          pad : center.id
                        }) +
         '<div class="aid-gland-flow"><span>＋ ' + label('inspector.glandSecretes') +
         '</span><span>− ' + label('inspector.glandBinds') + '</span></div>' +
         dial(label('inspector.productionBreadth'), center.qwidth, 'qwidth', 0, 1, .01, center.id);
}
function hormonePad(state, center) {
  const all = Array.from({length : state.capabilities?.bloodSubstances ?? 0}, (_, i) => i);
  return substanceWheel(state, {x : center.q1, y : center.q2, width : center.qwidth, active : true},
                        {
                          choices : all,
                          attribute : 'data-wheel-substance',
                          extra : ' data-center-id="' + escapeText(center.id) + '"',
                          pad : center.id
                        }) +
         dial(label('inspector.receptorWidth'), center.qwidth, 'qwidth', 0, 1, .01, center.id);
}
function pressureGraphic(organ, selected) {
  const centers = [
    {key : 'growth', x : 68, y : 39, rx : 53, ry : 29},
    {key : 'release', x : 218, y : 39, rx : 50, ry : 27},
    {key : 'pressure', x : 144, y : 102, rx : 56, ry : 20}
  ];
  const lines = '<path d="M121 39 H168 M98 66 L130 84 M195 63 L158 84" ' +
                'stroke="' + tone(organ.type) +
                '" stroke-width="2" stroke-dasharray="5 5" opacity=".65" fill="none"/>';
  const nodes =
      centers
          .map(point => {
            const members = organ.centers.filter(item => item.key === point.key);
            if (!members.length)
              return '';
            const color = tone(point.key === 'pressure' ? 'blood' : organ.type);
            const columns = Math.min(4, Math.ceil(Math.sqrt(members.length * 2)));
            const rows = Math.ceil(members.length / columns);
            const dots =
                members
                    .map((center, index) => {
                      const x = point.x + (index % columns - (columns - 1) / 2) * 21;
                      const y = point.y + 9 + (Math.floor(index / columns) - (rows - 1) / 2) * 15;
                      const active = selected?.id === center.id ? ' selected' : '';
                      return '<g class="aid-gonad-center' + active + '" data-select-center="' +
                             escapeText(center.id) + '"><title>' + escapeText(centerTitle(center)) +
                             '</title><circle cx="' + number(x) + '" cy="' + number(y) +
                             '" r="7" fill="' + color + '" stroke="' + color +
                             '" stroke-width="2"/></g>';
                    })
                    .join('');
            return '<g><ellipse cx="' + point.x + '" cy="' + point.y + '" rx="' + point.rx +
                   '" ry="' + point.ry + '" fill="' + color + '" fill-opacity=".14" stroke="' +
                   color + '" stroke-width="2"/>' +
                   '<text x="' + point.x + '" y="' + (point.y - 10) + '" text-anchor="middle">' +
                   label('centers.' + point.key) + '</text>' + dots + '</g>';
          })
          .join('');
  return '<svg viewBox="0 0 286 135" class="aid-gonad-graphic" role="img">' + lines + nodes +
         '</svg>';
}

function pairedOrganGraphic(organ, selected) {
  // Each neural group remains selectable as more groups are added to the same organ.
  const bladder = organ.type === 'bladder';
  const rows = Math.ceil(organ.centers.length / 3);
  const height = Math.max(130, rows * 47 + 25);
  const outline =
      bladder
          ? '<ellipse cx="142" cy="' + number(height / 2) + '" rx="125" ry="' +
                number(height / 2 - 13) +
                '" fill="#b29bdc" fill-opacity=".09" stroke="#b29bdc" stroke-width="2"/>'
          : '<rect x="13" y="13" width="256" height="' + number(height - 26) +
                '" rx="54" fill="#dfbc87" fill-opacity=".09" stroke="#dfbc87" stroke-width="2"/>';
  const nodes = organ.centers
                    .map((center, index) => {
                      const x = 59 + (index % 3) * 83;
                      const y = height / 2 + (Math.floor(index / 3) - (rows - 1) / 2) * 47;
                      const active = selected?.id === center.id ? ' selected' : '';
                      const colour = center.role === 'sensor' ? '#79d2be' : '#b29bdc';
                      return '<g class="aid-gonad-center' + active + '" data-select-center="' +
                             escapeText(center.id) + '"><title>' + escapeText(centerTitle(center)) +
                             '</title><ellipse cx="' + number(x) + '" cy="' + number(y) +
                             '" rx="27" ry="19" fill="' + colour + '" fill-opacity=".24" stroke="' +
                             colour + '" stroke-width="2"/><text x="' + number(x) + '" y="' +
                             number(y + 5) + '" text-anchor="middle">' + (index + 1) +
                             '</text></g>';
                    })
                    .join('');
  return '<svg class="aid-gonad-graphic" viewBox="0 0 286 ' + height + '" role="img" aria-label="' +
         escapeText(organTitle(organ)) + '">' + outline + nodes + '</svg>';
}
function muscleGraphic(state, center) {
  const site = state.sites?.find(item => item.id === center.site);
  const muscle = site && MUSCLE_LABEL_INDEX.get(functionFor(center, site));
  const title = muscle === undefined ? organTitle({type : 'muscle'}) : label('muscles.' + muscle);
  const width = 20 + 60 * center.copies / ATELIER_LIMITS.max_copies;
  const lines =
      Array
          .from({length : center.copies},
                (_, i) => {
                  const y = 13 + (i + .5) * 82 / center.copies;
                  return '<path d="M27 ' + number(y) + ' Q125 ' + number(y - 12) + ' 255 ' +
                         number(y) +
                         '" stroke="#eaa886" stroke-opacity=".8" stroke-width="1.4" fill="none"/>';
                })
          .join('');
  return '<div class="aid-organ-metric"><svg viewBox="0 0 280 110" role="img" aria-label="' +
         escapeText(title) + '"><rect x="8" y="' + number(55 - width / 2) +
         '" width="264" height="' + number(width) +
         '" rx="22" fill="#eaa886" fill-opacity=".12"/>' + lines + '</svg><strong>' +
         escapeText(title) + '</strong></div>';
}
function tissueGraphic(organ, center) {
  const defense = organ.type === 'defense';
  const count = center.copies;
  const spokes =
      Array
          .from({length : count},
                (_, i) => {
                  const x = 16 + (i + .5) * 240 / count;
                  return defense
                             ? '<path d="M' + number(x - 7) + ' 85 L' + number(x) + ' 19 L' +
                                   number(x + 7) +
                                   ' 85 Z" fill="#eaa886" fill-opacity=".55" stroke="#eaa886"/>'
                             : '<path d="M35 90 Q' + number(x) +
                                   ' 40 240 19" stroke="#79d2be" fill="none" stroke-opacity=".6"/>';
                })
          .join('');
  return '<svg class="aid-organ-tissue" viewBox="0 0 280 110" role="img" aria-label="' +
         escapeText(organTitle(organ)) + '">' + spokes + '</svg>';
}

function organSettings(state, organ, center) {
  if (!center)
    return '<div class="aid-empty-centre">' + label('sections.empty') + '</div>';
  let html = '';
  if (organ.field)
    return visionInspector(state, organ);
  if (organ.type === 'nose') {
    html += compass(center) +
            dial(label('inspector.adaptationTime'), center.tau, 'tau', 0, 1, .01, center.id);
  } else if (organ.type === 'pigment') {
    html +=
        pigmentPreview(center, state.stale ? null : state.report, state.capabilities?.pigmentHalf);
  } else if (organ.type === 'gut' || organ.type === 'bladder') {
    html += pairedOrganGraphic(organ, center);
  } else if (organ.type === 'muscle') {
    html += muscleGraphic(state, center);
  } else if (organ.type === 'defense') {
    html += tissueGraphic(organ, center);
  } else if (organ.type === 'gland') {
    html += glandProfile(state, center);
  } else if (organ.type === 'eggs' || organ.type === 'sperm') {
    html += pressureGraphic(organ, center);
  } else if ([ 'lateral', 'touch', 'pain' ].includes(organ.type)) {
    html += contactField(center) +
            dial(label('inspector.contactAngle'), center.field, 'field', 0, 1, .01, center.id);
  } else if (organ.type === 'blood') {
    html += hormonePad(state, center);
  } else if (organ.type === 'brain') {
    html += nerveProperties(state, center);
  } else {
    html += '<div class="aid-organ-metric">' + icon(organ.type, 50) + '<span>' +
            escapeText(organTitle(organ)) + '</span></div>';
  }
  if (center.role === 'sensor' || center.role === 'nerve')
    html += outgoingField(center);
  html += '<div class="aid-cell-count-title">' + label('inspector.count') + ' <strong>' +
          center.copies + '</strong></div>' + iconCells(center.copies, center.id);
  if (center.role === 'sensor') {
    html += dial(label('inspector.stimulusThreshold'), (center.threshold + 1) / 2,
                 'stimulusThreshold', 0, 1, .025, center.id);
  } else {
    const key = center.role === 'nerve' ? 'inspector.restActivity' : 'inspector.restDrive';
    html += dial(label(key), -center.threshold, 'restDrive', -1, 1, .05, center.id);
  }
  if (center.role !== 'sensor') {
    const key = center.role === 'nerve'   ? 'inspector.traceTempo'
                : center.role === 'motor' ? 'inspector.recoveryTime'
                                          : 'inspector.adaptationTime';
    html += dial(label(key), center.tau, 'tau', 0, 1, .01, center.id);
  }
  return html;
}
function nerveProperties(state, center) {
  // The chosen circuit is its type. Only controls belonging to that circuit stay editable.
  const template = '<div class="aid-neuron-kind">' + label('inspector.template') + ': ' +
                   escapeText(centerTitle(center)) + '</div>';
  const rhythm = center.key === 'pacemaker'
                     ? dial(label('inspector.rhythm'), center.pace, 'pace', -1, 1, .05, center.id)
                     : '';
  const modulation = center.key === 'modulate'
                         ? dial(label('inspector.modulation'), center.modulator, 'modulator', -1, 1,
                                .05, center.id)
                         : '';
  return template + rhythm + modulation + developedNerve(state, center);
}
function developedNerve(state, center) {
  if (state.stale || !Array.isArray(state.report?.groups))
    return '';
  const index = allCenters(state.document).findIndex(c => c.id === center.id);
  const nerve = state.report.groups[index]?.nerve;
  if (!nerve)
    return '';
  const [sign, mode, pace, modulator] = nerve, percent = v => Math.round(v * 100) + ' %';
  const row = (name, value) => '<div><span>' + name + '</span><output>' + value + '</output></div>';
  return '<section class="aid-developed-nerve">' + heading(label('inspector.developedClass')) +
         row(label('inspector.transmitter'),
             label(sign >= 0 ? 'inspector.exciting' : 'inspector.inhibiting')) +
         row(label('inspector.learningMode'), number(mode)) +
         row(label('inspector.rhythm'), percent(pace)) +
         row(label('inspector.modulation'), percent(modulator)) + '</section>';
}
function selectedCenter(state, organ) {
  const selected = state.selected;
  if (selected?.kind === 'center')
    return organ.centers.find(c => c.id === selected.id) ?? organ.centers[0];
  return organ.centers[0] ?? null;
}
function centerTabs(state, organ) {
  if (organ.field || organ.centers.length < 2)
    return '';
  return '<div class="aid-center-tabs">' +
         organ.centers
             .map((c, index) => '<button data-select-center="' + escapeText(c.id) + '" class="' +
                                (state.selected?.id === c.id ? 'selected' : '') + '">' +
                                (index + 1) + ' · ' + escapeText(centerTitle(c)) + '</button>')
             .join('') +
         '</div>';
}
function organInspector(state, organ) {
  const center = selectedCenter(state, organ);
  let html = '<header class="aid-inspector-head"><span>' + label('inspector.organType') +
             '</span>' + heading(organTitle(organ)) + '</header>' + centerTabs(state, organ);
  html += '<div class="aid-organ-settings">' + organSettings(state, organ, center) + '</div>';
  if (organ.type !== 'brain') {
    html +=
        '<div class="aid-inspector-actions">' +
        (organ.pair ? '<button data-link-pair="' + escapeText(organ.id) + '" aria-pressed="' +
                          organ.linked + '">' + (organ.linked ? '↔ ' : '⇥ ') +
                          label('vision.linked') + '</button><button data-select-organ="' +
                          escapeText(organ.pair) + '">' + label('vision.otherSide') + '</button>'
                    : '<button data-mirror-organ="' + escapeText(organ.id) + '">' +
                          label('inspector.mirror') + '</button>') +
        '<button class="aid-danger" data-remove-organ="' + escapeText(organ.id) + '">' +
        label('inspector.removeOrgan') + '</button></div>';
  } else if (state.selected?.kind === 'center') {
    html += '<button class="aid-danger" data-remove-center="' + escapeText(center.id) + '">' +
            label('inspector.removeCenter') + '</button>';
  }
  return html;
}
function developedContactInspector(state) {
  const [from, to] = state.selected.id.split(':').map(Number);
  const link = state.report?.contacts?.find(row => row[0] === from && row[1] === to);
  const centers = allCenters(state.document);
  if (!link || !centers[from] || !centers[to])
    return '';
  const weight = link[3];
  const polarities = [
    {count : link[4], weight : link[6], key : 'excitation', tone : 'excite'},
    {count : link[5], weight : link[7], key : 'inhibition', tone : 'inhibit'}
  ];
  return '<header class="aid-inspector-head"><span>' + label('inspector.developedLink') +
         '</span>' + heading(centerTitle(centers[from]) + ' → ' + centerTitle(centers[to])) +
         '</header>' +
         '<div class="aid-contact-summary"><div><strong>' +
         Number(link[2]).toLocaleString('de-AT') + '</strong><span>' +
         label('inspector.contactCount') + '</span></div><div><strong>' + (weight >= 0 ? '+' : '') +
         number(weight) + '</strong><span>' + label('inspector.meanWeight') +
         '</span></div></div>' +
         '<div class="aid-contact-polarities">' +
         polarities
             .map(item => '<div class="aid-contact-polarity ' + item.tone + '"><span>' +
                          label('inspector.' + item.key) + '</span><strong>' +
                          item.count.toLocaleString('de-AT') + '</strong><small>' +
                          (item.weight >= 0 ? '+' : '') + number(item.weight) + '</small></div>')
             .join('') +
         '</div>';
}
function wireField(wire) {
  const radius = 8 + 55 * wire.spread;
  return '<div class="aid-wire-field"><svg class="aid-wire-search" data-wire-pad="' +
         escapeText(wire.id) + '" viewBox="0 0 150 150" tabindex="0" role="img" aria-label="' +
         label('sections.spread') + '">' +
         '<circle class="aid-wire-boundary" cx="75" cy="75" r="63"/>' +
         '<circle class="aid-wire-halo" cx="75" cy="75" r="' + number(radius) + '"/>' +
         '<circle class="aid-wire-source" cx="75" cy="75" r="5"/>' +
         '<circle class="aid-wire-handle" cx="' + number(75 + radius) +
         '" cy="75" r="7"/></svg><span>' + label('sections.spread') + '</span></div>';
}
// The sender's cross-body preference and reach apply to all of its outgoing contacts.
function outgoingField(center) {
  const x = 15 + (center.crossing + 1) * 60, y = 15 + (1 - center.range) * 120;
  return '<div class="aid-output-field"><h3>' + label('inspector.signalReach') +
         '</h3><div class="aid-vector-editor"><svg data-output-pad="' + escapeText(center.id) +
         '" viewBox="0 0 150 150" tabindex="0" role="img" aria-label="' +
         label('inspector.signalReach') + '">' +
         '<rect x="15" y="15" width="120" height="120" rx="12"/>' +
         '<path d="M75 15 V135 M15 75 H135"/>' +
         '<circle class="aid-vector-point" cx="' + number(x) + '" cy="' + number(y) +
         '" r="8"/></svg><div class="aid-vector-hints"><span>' + label('inspector.sameSide') +
         '</span><span>' + label('inspector.far') + '</span><span>' +
         label('inspector.oppositeSide') + '</span><span>' + label('inspector.near') +
         '</span></div></div></div>';
}
function wireInspector(state, wire) {
  const name = id => findOrgan(state.document, id)
                         ? organTitle(findOrgan(state.document, id))
                         : centerTitle(findCenter(state.document, id)?.center ?? {key : ''});
  return '<header class="aid-inspector-head"><span>' + label('sections.connections') + '</span>' +
         heading(name(wire.from) + ' → ' + name(wire.to)) + '</header>' +
         '<div class="aid-wire-parameters">' + wireField(wire) +
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
        steps = state.capabilities?.steepnessSteps ?? 0,
        [ halfMin, halfMax ] = state.capabilities?.halfRange ?? [ receptor.half, receptor.half ];
  return (baseline ? dial(label('inspector.receptorBaseline'), receptor.baseline, 'baseline', -1, 1,
                          .01, target)
                   : '') +
         dial(label('inspector.receptorSensitivity'), receptor.sensitivity, 'sensitivity', -span,
              span, .01, target) +
         dial(label('inspector.receptorHalf'), receptor.half, 'half', Math.log10(halfMin),
              Math.log10(halfMax), DIAL_LOG_STEP, target, 'log') +
         dial(label('inspector.steepness'), receptor.steepness, 'steepness', 0, steps, 1, target,
              'hill');
}
const substanceColour = index => hormoneColors[index] ?? 'currentColor';
// A cell's life phase on the maturity axis: its output over maturity and, past its end, the
// permanent death (lifePhase in model/document.js).
export const PHASE = 'phase';
export const MEASURE = 'measure';
// Measured organ drives that changed by more than MEASURE_SHOWN, at most MEASURE_ROWS of them.
const MEASURE_SHOWN = .005, MEASURE_ROWS = 6;
function measurement(state, index) {
  let html =
      '<div class="aid-measure">' +
      dial(label('inspector.measureLevel'), state.measureLevel, 'level', 0, 1, .01, MEASURE) +
      '<button class="aid-secondary" data-measure>' + label('inspector.measure') + '</button>';
  const m = state.measurement;
  if (!m || m.substance !== index)
    return html + '</div>';
  const names = tList('hormones.organNames');
  const rows = m.organs.map((value, o) => ({name : names[o], value}))
                   .filter(r => Math.abs(r.value) > MEASURE_SHOWN)
                   .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
                   .slice(0, MEASURE_ROWS);
  if (Math.abs(m.growth) > MEASURE_SHOWN)
    rows.unshift({name : label('inspector.growth'), value : m.growth});
  const dead = m.dead.reduce((sum, n) => sum + n, 0);
  html +=
      heading(label('inspector.measured')) +
      rows.map(r => '<div class="aid-measure-row"><span>' + escapeText(r.name) +
                    '</span><span class="aid-measure-bar ' + (r.value > 0 ? 'up' : 'down') +
                    '" style="--share:' + number(Math.min(1, Math.abs(r.value))) + '"></span>' +
                    '<output>' + (r.value > 0 ? '+' : '') + number(r.value) + '</output></div>')
          .join('') +
      (dead ? '<div class="aid-measure-row"><span>' + label('inspector.cellsDie') +
                  '</span><output>' + dead + '</output></div>'
            : '') +
      (!rows.length && !dead ? '<div class="aid-empty-centre">' + label('inspector.none') + '</div>'
                             : '');
  return html + '</div>';
}
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
// The substance wheel shared by glands, the blood sense and receptors (wheelPlace in
// model/document.js): a profile binds the blood substances near its point with a halo of width
// sigma, and each substance's fill shows how strongly. Substances in `choices` can be clicked to
// set `attribute`; with `pad` (a center id) the profile point can be dragged anywhere. A profile
// reads only the first `reads` substances: growth and glands the hormones, receptors maturity too.
export const WHEEL = Object.freeze({size : 150, centre : 75, radius : 51, point : 11, marker : 6});
// The wheel marks a substance with the first letter of its name, maturity and reserve with their
// own marks.
function substanceMark(state, index) {
  return index === HORMONES.levels       ? label('inspector.maturityMark')
         : index === HORMONES.levels + 1 ? label('inspector.reserveMark')
                                         : substanceName(state, index).slice(0, 1);
}
function substanceName(state, index) {
  const named = state.document.substances.find(sub => sub.index === index)?.name;
  return named || (index === HORMONES.levels       ? label('inspector.maturity')
                   : index === HORMONES.levels + 1 ? label('inspector.reserve')
                                                   : String.fromCharCode(65 + index));
}
function substanceWheel(
    state, profile,
    {choices = [], attribute = '', extra = '', pad = null, selected = null, reads = Infinity}) {
  const wheel = state.capabilities;
  if (!wheel)
    return '';
  const px = x => number(WHEEL.centre + x * WHEEL.radius),
        py = y => number(WHEEL.centre - y * WHEEL.radius);
  const clickable = new Set(choices);
  const points = Array.from({length : wheel.bloodSubstances}, (_, index) => {
    const [x, y] = wheelPlace(wheel, index), name = substanceName(state, index);
    const bound = profile.active && index < reads
                      ? wheelAffinity(wheel, profile.x, profile.y, profile.width, index)
                      : 0;
    const open = clickable.has(index);
    return '<g class="aid-wheel-point' + (open ? '' : ' fixed') +
           (index >= HORMONES.levels ? ' body' : '') + (selected === index ? ' active' : '') + '"' +
           (open ? ' ' + attribute + '="' + index + '"' + extra : '') +
           ' style="--substance:' + substanceColour(index) + ';--bound:' + number(bound) +
           '"><circle cx="' + px(x) + '" cy="' + py(y) + '" r="' + WHEEL.point + '"/><text x="' +
           px(x) + '" y="' + py(y) + '" dy=".35em" text-anchor="middle">' +
           escapeText(substanceMark(state, index)) + '</text><title>' + escapeText(name) + ' · ' +
           Math.round(bound * 100) + ' %</title></g>';
  });
  const halo = profile.active ? '<circle class="aid-wheel-halo" cx="' + px(profile.x) + '" cy="' +
                                    py(profile.y) + '" r="' +
                                    number(wheelSigma(wheel, profile.width) * WHEEL.radius) + '"/>'
                              : '';
  const marker = pad ? '<circle class="aid-vector-point" cx="' + px(profile.x) + '" cy="' +
                           py(profile.y) + '" r="' + WHEEL.marker + '"/>'
                     : '';
  return '<svg class="aid-substance-wheel"' +
         (pad ? ' data-vector-pad="' + escapeText(pad) + '" data-wheel tabindex="0"' : '') +
         ' viewBox="0 0 ' + WHEEL.size + ' ' + WHEEL.size + '" role="img" aria-label="' +
         label('inspector.hormoneProfile') + '"><circle cx="' + WHEEL.centre + '" cy="' +
         WHEEL.centre + '" r="' + WHEEL.radius + '" class="aid-wheel-ring"/>' + halo +
         points.join('') + marker + '</svg>';
}
// A receptor's profile on the wheel: its substance's point and its width.
function receptorProfile(state, receptor) {
  const [x, y] = state.capabilities ? wheelPlace(state.capabilities, receptor.substance) : [ 0, 0 ];
  return {x, y, width : receptor.width, active : receptor.active};
}
// The body's growth receptor: which hormone lets the body grow.
function growthEditor(state) {
  const {document : doc} = state, growth = doc.growth;
  let html = '<section class="aid-growth">' + heading(label('inspector.growth'));
  if (!doc.substances.length)
    return html + '</section>';
  html += '<label class="aid-checkbox"><input type="checkbox" data-growth-active ' +
          (growth.active ? 'checked' : '') + '/>' + label('inspector.growthActive') + '</label>' +
          substanceWheel(state, receptorProfile(state, growth), {
            choices : doc.substances.map(sub => sub.index),
            attribute : 'data-growth-substance',
            selected : growth.substance,
            reads : state.capabilities?.hormones
          });
  if (growth.active)
    html += dial(label('inspector.receptorWidth'), growth.width, 'width', 0, 1, .01, GROWTH) +
            effectCurve(state, growth, GROWTH) + receptorDials(state, growth, GROWTH, false);
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
                       '" aria-label="' + label('inspector.removeSubstance') + '">×</button></div>';
              })
              .join('') +
          '</div>';
  if (doc.substances.length < HORMONES.levels)
    html += '<button class="aid-secondary" data-add-substance>' +
            '+ ' + label('sections.newSubstance') + '</button>';
  const selectedSubstance = doc.substances.find(s => s.index === state.focusSubstance);
  if (selectedSubstance && state.capabilities) {
    const releasing = producers(doc, selectedSubstance.index, state.capabilities),
          receiving = receivers(doc, selectedSubstance.index, state.capabilities);
    const buttons = (members, effects = () => []) =>
        members
            .map(c => '<button data-select-center="' + escapeText(c.id) + '">' +
                      escapeText(centerTitle(c)) +
                      effects(c)
                          .map(e => '<small class="aid-bound-effect">' + label('effects.' + e) +
                                    '</small>')
                          .join('') +
                      '</button>')
            .join('');
    const growth = growsWith(doc, selectedSubstance.index, state.capabilities)
                       ? '<span class="aid-grows">' + label('inspector.growth') + '</span>'
                       : '';
    html += '<section class="aid-hormone-map">' +
            heading(selectedSubstance.name || String.fromCharCode(65 + selectedSubstance.index)) +
            '<div class="aid-hormone-flow"><span>' + label('inspector.produces') + '</span><div>' +
            buttons(releasing) + '</div><span>' + label('inspector.receives') + '</span><div>' +
            growth +
            buttons(receiving, c => boundEffects(c, selectedSubstance.index, state.capabilities)) +
            '</div></div>' + measurement(state, selectedSubstance.index) + '</section>';
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
          escapeText(focus.id) + '" data-receptor-effect="' + effect + '" ' +
          (receptor.active ? 'checked' : '') + '/>' + label('inspector.receptorActive') +
          '</label>' + substanceWheel(state, receptorProfile(state, receptor), {
            choices : [...doc.substances.map(sub => sub.index), HORMONES.levels ],
            attribute : 'data-receptor-substance',
            reads : state.capabilities?.regulators,
            extra : ' data-center-id="' + escapeText(focus.id) + '" data-receptor-effect="' +
                        effect + '"',
            selected : receptor.substance
          }) +
          dial(label('inspector.receptorWidth'), receptor.width, 'width', 0, 1, .01,
               focus.id + ':' + effect) +
          receptorDials(state, receptor, focus.id + ':' + effect) + '</div>';
  return html;
}
// Every nerve cell learns with its plasticity (quality width); its mode chooses cancelling (< 0),
// neutral or competitive (> 0) learning (colony-core/field/substrate.hh, cell_class). The pad
// sets both: across the mode, up the plasticity.
export const LEARNING_PAD = Object.freeze({width : 220, height : 120, inset : 12, marker : 7});
function learningPad(center) {
  const pad = LEARNING_PAD, across = pad.width - 2 * pad.inset, up = pad.height - 2 * pad.inset;
  const x = pad.inset + (center.mode + 1) / 2 * across, y = pad.inset + (1 - center.qwidth) * up;
  return '<svg class="aid-learning-pad" data-learning-pad="' + escapeText(center.id) +
         '" viewBox="0 0 ' + pad.width + ' ' + pad.height + '" tabindex="0" role="img" ' +
         'aria-label="' + label('inspector.learningMode') + '"><rect class="aid-pad-cancel" x="' +
         pad.inset + '" y="' + pad.inset + '" width="' + across / 2 + '" height="' + up +
         '"/><rect class="aid-pad-compete" x="' + (pad.inset + across / 2) + '" y="' + pad.inset +
         '" width="' + across / 2 + '" height="' + up + '"/><path d="M' + (pad.inset + across / 2) +
         ' ' + pad.inset + ' V' + (pad.height - pad.inset) +
         '"/><circle class="aid-vector-point" cx="' + number(x) + '" cy="' + number(y) + '" r="' +
         pad.marker + '"/></svg>' +
         '<div class="aid-range-hints"><span>' + label('inspector.cancelling') + '</span><span>' +
         label('inspector.neutral') + '</span><span>' + label('inspector.competing') +
         '</span></div>';
}
// Where a learning receptor's signal comes from: the glands releasing its substance, or maturity.
function learningSignal(state, receptor) {
  if (!receptor.active || !state.capabilities)
    return '';
  const sources =
      receptor.substance === HORMONES.levels
          ? '<span>' + label('inspector.maturity') + '</span>'
          : producers(state.document, receptor.substance, state.capabilities)
                .map(c => '<button data-select-center="' + escapeText(c.id) +
                          '" data-select-tool="select">' + escapeText(centerTitle(c)) + '</button>')
                .join('');
  if (!sources)
    return '';
  return '<div class="aid-learning-signal"><span>' + label('inspector.signalFrom') +
         '</span><div>' + sources + '</div></div>';
}
function learningInspector(state) {
  const selected = state.selected, doc = state.document;
  const chosen = selected?.kind === 'center'  ? findCenter(doc, selected.id)?.center
                 : selected?.kind === 'organ' ? findOrgan(doc, selected.id)?.centers[0]
                                              : null;
  let html = '<header class="aid-inspector-head"><span>' + label('sections.brain') + '</span>' +
             heading(label('tools.learn')) + '</header>';
  if (!chosen || chosen.role !== 'nerve')
    return html + '<div class="aid-empty-centre">' + label('inspector.selectLearning') + '</div>';
  html += heading(centerTitle(chosen)) + learningPad(chosen);
  const effect = state.effect === HORMONE_EFFECT.eligibility ? HORMONE_EFFECT.eligibility
                                                             : HORMONE_EFFECT.learning;
  const receptor = chosen.receptors?.[effect];
  if (!receptor)
    return html;
  html += heading(label('inspector.learningSignal')) + '<div class="aid-effect-chips">' +
          [ HORMONE_EFFECT.learning, HORMONE_EFFECT.eligibility ]
              .map(value => '<button data-effect="' + value + '" class="' +
                            (effect === value ? 'active' : '') + '">' + label('effects.' + value) +
                            '</button>')
              .join('') +
          '</div>' + effectCurve(state, receptor, effect) +
          '<label class="aid-checkbox"><input type="checkbox" data-receptor-active="' +
          escapeText(chosen.id) + '" data-receptor-effect="' + effect + '" ' +
          (receptor.active ? 'checked' : '') + '/>' + label('inspector.receptorActive') +
          '</label>' + substanceWheel(state, receptorProfile(state, receptor), {
            choices : [...doc.substances.map(sub => sub.index), HORMONES.levels ],
            attribute : 'data-receptor-substance',
            reads : state.capabilities?.regulators,
            extra : ' data-center-id="' + escapeText(chosen.id) + '" data-receptor-effect="' +
                        effect + '"',
            selected : receptor.substance
          }) +
          learningSignal(state, receptor) +
          dial(label('inspector.receptorWidth'), receptor.width, 'width', 0, 1, .01,
               chosen.id + ':' + effect) +
          receptorDials(state, receptor, chosen.id + ':' + effect);
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
  const chosen = [...state.multi ].flatMap(id => {
    const organ = findOrgan(state.document, id);
    if (organ)
      return [ {id, kind : 'organ', type : organ.type, name : organTitle(organ)} ];
    const hit = findCenter(state.document, id);
    return hit ? [ {id, kind : 'center', type : hit.organ.type, name : centerTitle(hit.center)} ]
               : [];
  });
  return '<header class="aid-inspector-head"><span>' + label('inspector.selected') + '</span>' +
         heading(String(chosen.length) + ' ' + label('app.parts')) +
         '</header><div class="aid-assembly-list">' +
         chosen
             .map(part => '<button data-select-' + part.kind + '="' + escapeText(part.id) + '">' +
                          icon(part.type, 22) + escapeText(part.name) + '</button>')
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
  if (selected.kind === 'contact')
    return developedContactInspector(state);
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
  const tools = [ 'select', 'wire', 'hormone', 'learn', 'stimulate', 'erase', 'pan' ];
  return '<div class="aid-tools" role="toolbar" aria-label="' + label('app.parts') + '">' +
         [ 'undo', 'redo' ]
             .map(key => '<button type="button" data-history="' + key + '" title="' +
                         label('tools.' + key) + '" aria-label="' + label('tools.' + key) + '"' +
                         ((key === 'undo' ? !state.canUndo : !state.canRedo) ? ' disabled' : '') +
                         '><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">' +
                         '<path d="' + TOOL_ICON[key] +
                         '" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" ' +
                         'stroke-linejoin="round" fill="none"/></svg></button>')
             .join('') +
         '<span class="aid-tools-divider"></span>' +
         tools
             .map(key => '<button type="button" data-tool="' + key + '" class="' +
                         (state.tool === key ? 'active' : '') + '" title="' +
                         label('tools.' + key) + '" aria-label="' + label('tools.' + key) + '">' +
                         '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">' +
                         '<path d="' + TOOL_ICON[key] +
                         '" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" ' +
                         'stroke-linejoin="round" fill="none"/></svg></button>')
             .join('') +
         '<span class="aid-tools-divider"></span>' +
         '<button data-zoom="in" title="' + label('tools.zoomIn') + '">＋</button>' +
         '<button data-zoom="out" title="' + label('tools.zoomOut') + '">−</button>' +
         '<button data-zoom="fit" title="' + label('tools.fit') + '">⌗</button>' +
         '</div>';
}
