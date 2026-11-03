import {TUNING} from './schema.js';
import {STUDIO_ICON} from './organ_icons.js';
import {MODULES, NEURONS, ORGANS} from './studio_organs.js';
import {allCenters, findCenter, findOrgan} from './studio_model.js';
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
  return '<label class="aid-dial"><span>' + escapeText(name) + '</span>' +
    '<input type="range" data-field="' + key + '" data-target="' + target +
    '" min="' + low + '" max="' + high + '" step="' + step +
    '" value="' + number(value) + '"/><output>' + number(value) + '</output></label>';
}
function iconCells(count, id) {
  let html = '<div class="aid-cell-chooser" aria-label="' + label('inspector.count') + '">';
  for (let i = 1; i <= 16; ++i)
    html += '<button type="button" class="aid-cell-pill' + (i <= count ? ' on' : '') +
      '" data-cell-count="' + i + '" data-center-id="' + escapeText(id) +
      '" title="' + i + '" aria-label="' + i + '"></button>';
  return html + '</div>';
}
function spectrum(center) {
  const degree = (center.q1 + 1) * 180;
  return '<div class="aid-colour-spectrum" data-spectrum="' + escapeText(center.id) +
    '" tabindex="0" title="' + label('inspector.eyeSpectrum') + '">' +
    '<span class="aid-spectrum-marker" style="left:' + number(degree / 3.6) + '%"></span></div>' +
    dial(label('inspector.spectrumWidth'), center.qwidth, 'qwidth', 0, 1, .01, center.id);
}
function compass(center) {
  const latitude = TUNING.scent_latitudes, longitude = TUNING.scent_longitudes;
  const hueX = (center.q1 + 1) * 50, hueY = (center.q2 + 1) * 50;
  let petals = '';
  for (let i = 0; i < latitude.length; ++i) {
    const r = 32 * (1 - latitude[i] / 140);
    const x = 50 + Math.cos(longitude[i] * Math.PI / 180) * r;
    const y = 50 + Math.sin(longitude[i] * Math.PI / 180) * r;
    petals += '<circle cx="' + number(x) + '" cy="' + number(y) +
      '" r="6" fill="#87cdc4" opacity=".5"/>';
  }
  return '<svg class="aid-scent-compass" data-compass="' + escapeText(center.id) +
    '" viewBox="0 0 100 100" role="img" aria-label="' + label('inspector.scents') + '">' +
    '<circle cx="50" cy="50" r="47"/><path d="M50 5 V95 M5 50 H95"/>' +
    petals + '<circle class="aid-scent-selector" cx="' + number(hueX) + '" cy="' +
    number(hueY) + '" r="7"/></svg>' +
    dial(label('inspector.width'), center.qwidth, 'qwidth', 0, 1, .01, center.id);
}
function eyeAngle(center) {
  const x = 50 + center.q1 * 43, y = 50 - center.q2 * 43;
  return '<svg class="aid-eye-pad" data-eye-pad="' + escapeText(center.id) +
    '" viewBox="0 0 100 100" role="img" aria-label="' + label('inspector.eyeAngle') + '">' +
    '<circle cx="50" cy="50" r="44"/>' +
    '<path d="M6 50 H94 M50 6 V94"/>' +
    '<circle class="aid-eye-target" cx="' + number(x) +
    '" cy="' + number(y) + '" r="7"/></svg>';
}
function pigmentPreview(center, report) {
  const hue = (center.q1 + 1) * 180;
  const saturation = Math.round(35 + 45 * center.qwidth);
  return '<div class="aid-pigment-preview">' +
    '<span style="background:hsl(' + number(hue) + ' ' + saturation +
    '% 48%)"><small>' + label('inspector.colourRest') + '</small></span>' +
    '<span style="background:hsl(' + number(hue) + ' ' + saturation +
    '% 25%)"><small>' + label('inspector.colourActive') + '</small></span></div>' +
    '<div class="aid-colour-spectrum" data-spectrum="' + escapeText(center.id) +
    '"><span class="aid-spectrum-marker" style="left:' +
    number((center.q1 + 1) * 50) + '%"></span></div>' +
    dial(label('inspector.spectrumWidth'), center.qwidth, 'qwidth', 0, 1, .01, center.id);
}
function pressureGraphic(kind) {
  const color = tone(kind);
  return '<svg viewBox="0 0 280 75" class="aid-gonad-graphic">' +
    '<ellipse cx="70" cy="38" rx="50" ry="28" fill="' + color +
    '" opacity=".30"/><ellipse cx="212" cy="38" rx="38" ry="23" fill="' +
    color + '" opacity=".55"/><path d="M123 38 H173" stroke="' + color +
    '" stroke-width="3" stroke-dasharray="7 6"/>' +
    '<text x="70" y="42" text-anchor="middle">' + label('centers.growth') +
    '</text><text x="212" y="42" text-anchor="middle">' +
    label('centers.release') + '</text></svg>';
}
function organSettings(state, organ, center) {
  if (!center) return '<div class="aid-empty-centre">' + label('sections.empty') + '</div>';
  let html = '';
  if (organ.type === 'eye') {
    html += '<div class="aid-visual-inputs">' + eyeAngle(center) + spectrum(center) + '</div>' +
      dial(label('inspector.sensitivity'), center.field, 'field', 0, 1, .01, center.id);
  } else if (organ.type === 'nose') {
    html += compass(center) +
      dial(label('inspector.adaptation'), center.tau, 'tau', 0, 1, .01, center.id);
  } else if (organ.type === 'pigment') {
    html += pigmentPreview(center, state.report);
  } else if (organ.type === 'eggs' || organ.type === 'sperm') {
    html += pressureGraphic(organ.type);
  } else if (organ.type === 'brain') {
    html += '<div class="aid-neuron-kind">' + escapeText(centerTitle(center)) + '</div>' +
      dial(label('inspector.learning'), center.mode, 'mode', -1, 1, .05, center.id) +
      dial(label('inspector.rhythm'), center.pace, 'pace', -1, 1, .05, center.id);
  } else {
    html += '<div class="aid-organ-metric">' + icon(organ.type, 50) +
      '<span>' + escapeText(organTitle(organ)) + '</span></div>';
    if (organ.type === 'lateral' || organ.type === 'proximity')
      html += dial(label('inspector.width'), center.field, 'field', 0, 1, .01, center.id);
  }
  html += '<div class="aid-cell-count-title">' + label('inspector.count') +
    ' <strong>' + center.copies + '</strong></div>' + iconCells(center.copies, center.id);
  if (organ.type !== 'eye' && organ.type !== 'nose')
    html += dial(label('inspector.sensitivity'), center.threshold, 'threshold',
      -1, 1, .05, center.id);
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
  if (!organ.centers.length) return '';
  return '<div class="aid-center-tabs">' + organ.centers.map(c =>
    '<button data-select-center="' + escapeText(c.id) +
    '" class="' + (state.selected?.id === c.id ? 'selected' : '') + '">' +
    escapeText(centerTitle(c)) + '</button>').join('') + '</div>';
}
function organInspector(state, organ) {
  const center = selectedCenter(state, organ);
  let html = '<header class="aid-inspector-head"><span>' +
    label('inspector.organType') + '</span>' + heading(organTitle(organ)) + '</header>' +
    centerTabs(state, organ);
  if (organ.type === 'brain') {
    html += '<div class="aid-inspector-actions"><button data-add-neuron="relay">' +
      '+ ' + label('centers.relay') + '</button></div>';
  }
  html += '<div class="aid-organ-settings">' + organSettings(state, organ, center) + '</div>';
  if (organ.type !== 'brain') {
    html += '<div class="aid-inspector-actions"><button data-add-center="' +
      escapeText(organ.id) + '">' + label('inspector.addCenter') + '</button>' +
      '<button data-mirror-organ="' + escapeText(organ.id) + '">' +
      label('inspector.mirror') + '</button>' +
      '<button class="aid-danger" data-remove-organ="' + escapeText(organ.id) + '">' +
      label('inspector.removeOrgan') + '</button></div>';
  } else if (state.selected?.kind === 'center') {
    html += '<button class="aid-danger" data-remove-center="' + escapeText(center.id) +
      '">' + label('inspector.removeCenter') + '</button>';
  }
  return html;
}
function wireInspector(state, wire) {
  const from = findCenter(state.document, wire.from)?.center,
    to = findCenter(state.document, wire.to)?.center;
  return '<header class="aid-inspector-head"><span>' + label('sections.connections') +
    '</span>' + heading((from ? centerTitle(from) : '?') + ' → ' +
      (to ? centerTitle(to) : '?')) + '</header>' +
    '<div class="aid-wire-parameters">' +
    dial(label('sections.strength'), wire.strength, 'strength', 0, 1, .01, wire.id) +
    dial(label('sections.spread'), wire.spread, 'spread', 0, 1, .01, wire.id) +
    dial(label('sections.range'), wire.length, 'length', 0, 1, .01, wire.id) +
    dial(label('sections.cross'), wire.cross, 'cross', 0, 1, .01, wire.id) +
    '</div><button class="aid-danger" data-remove-wire="' + escapeText(wire.id) +
    '">' + label('inspector.removeWire') + '</button>';
}
function receptorCurve(receptor) {
  const points = Array.from({length: 61}, (_, i) => {
    const x = i / 60, y = Math.max(-1, Math.min(1,
      receptor.baseline + receptor.sensitivity * x / (x + receptor.half)));
    return number(20 + x * 220) + ',' + number(110 - y * 85);
  }).join(' ');
  return '<svg viewBox="0 0 260 135" class="aid-response-chart">' +
    '<path d="M20 20 V110 H240 M20 67 H240" class="aid-chart-axis"/>' +
    '<polyline points="' + points + '" class="aid-response-line"/>' +
    '<path d="M20 25 H240" class="aid-death-threshold"/>' +
    '</svg>';
}
function hormoneInspector(state) {
  const {document: doc, selected} = state;
  let html = '<header class="aid-inspector-head"><span>' +
    label('sections.receptors') + '</span>' + heading(label('tools.hormone')) + '</header>';
  html += '<div class="aid-substances">' + doc.substances.map(substance => {
    const title = substance.name || (label('inspector.substanceName') + ' ' +
      String.fromCharCode(65 + substance.index));
    return '<div class="aid-substance-row">' +
      '<button class="aid-substance-pill" data-select-substance="' + substance.index +
      '"><span class="aid-substance-swatch" style="--substance:' +
      ['#abd4a2', '#86c7df', '#efbd82', '#cdb2e1'][substance.index] +
      '"></span>' + escapeText(title) + '</button>' +
      '<button class="aid-row-menu" data-rename-substance="' + substance.index +
      '" title="' + label('inspector.substanceName') + '">✎</button>' +
      '<button class="aid-row-menu" data-remove-substance="' + substance.index +
      '" aria-label="' + label('inspector.removeWire') + '">×</button></div>';
  }).join('') + '</div>';
  if (doc.substances.length < (state.capabilities?.hormones ?? 4))
    html += '<button class="aid-secondary" data-add-substance>' +
      '+ ' + label('sections.newSubstance') + '</button>';
  let focus = null;
  if (selected?.kind === 'center') focus = findCenter(doc, selected.id)?.center;
  if (selected?.kind === 'organ') focus = findOrgan(doc, selected.id)?.centers[0];
  if (!focus) return html;
  const effect = state.effect ?? 0;
  const receptor = focus.receptors?.[effect];
  if (!receptor) return html;
  html += '<div class="aid-receptor-editor">' + heading(centerTitle(focus)) +
    '<div class="aid-effect-chips">' + Array.from({length: state.capabilities?.effects ?? 7},
    (_, i) => '<button data-effect="' + i + '" class="' +
      (effect === i ? 'active' : '') + '">' +
      escapeText(label('effects')[i] ?? label('effects.0')) + '</button>').join('') +
    '</div>' + receptorCurve(receptor) +
    '<label class="aid-checkbox"><input type="checkbox" data-receptor-active="' +
    escapeText(focus.id) + '" ' + (receptor.active ? 'checked' : '') + '/>' +
    label('inspector.receptorActive') + '</label>' +
    dial(label('inspector.receptorBaseline'), receptor.baseline, 'baseline',
      -1, 1, .01, focus.id + ':' + effect) +
    dial(label('inspector.receptorSensitivity'), receptor.sensitivity, 'sensitivity',
      -1, 1, .01, focus.id + ':' + effect) +
    dial(label('inspector.receptorHalf'), receptor.half, 'half',
      .0003, 1, .0001, focus.id + ':' + effect) +
    dial(label('inspector.receptorWidth'), receptor.width, 'width',
      0, 1, .01, focus.id + ':' + effect) +
    '<div class="aid-substance-choices">' + doc.substances.map(sub =>
      '<button data-receptor-substance="' + sub.index + '" data-center-id="' +
      escapeText(focus.id) + '" class="' +
      (receptor.substance === sub.index ? 'active' : '') + '">' +
      escapeText(sub.name || String.fromCharCode(65 + sub.index)) +
      '</button>').join('') + '</div></div>';
  return html;
}
function assemblyInspector(state, assembly) {
  return '<header class="aid-inspector-head"><span>' + label('sections.module') +
    '</span>' + heading(assembly.name ||
      label('sections.module')) + '</header><div class="aid-assembly-list">' +
    assembly.organIds.map(id => {
      const organ = findOrgan(state.document, id);
      return organ ? '<button data-select-organ="' + escapeText(id) + '">' +
        icon(organ.type, 22) + escapeText(organTitle(organ)) + '</button>' : '';
    }).join('') + '</div><button data-save-assembly="' + escapeText(assembly.id) +
    '">' + label('inspector.saveModule') + '</button>' +
    '<button data-ungroup-assembly="' + escapeText(assembly.id) + '">' +
    label('inspector.ungroup') + '</button>';
}
export function inspector(state) {
  if (state.tool === 'hormone') return hormoneInspector(state);
  const selected = state.selected;
  if (!selected) return '<header class="aid-inspector-head">' +
    heading(label('sections.empty')) + '</header>';
  if (selected.kind === 'wire') {
    const wire = state.document.wires.find(w => w.id === selected.id);
    return wire ? wireInspector(state, wire) : '';
  }
  if (selected.kind === 'assembly') {
    const assembly = state.document.assemblies.find(a => a.id === selected.id);
    return assembly ? assemblyInspector(state, assembly) : '';
  }
  const organ = selected.kind === 'organ' ? findOrgan(state.document, selected.id) :
    findCenter(state.document, selected.id)?.organ;
  return organ ? organInspector(state, organ) : '';
}
function paletteItem(kind, name, type, key) {
  return '<button class="aid-palette-tile" draggable="true" data-drag-kind="' + type +
    '" data-drag-value="' + escapeText(key) + '" title="' + escapeText(name) + '">' +
    '<span class="aid-palette-icon" style="--organ-color:' + tone(kind) + '">' +
    icon(kind) + '</span><span>' + escapeText(name) + '</span></button>';
}
export function library(state) {
  const categories = ['senses', 'internal', 'motor', 'reproduction'];
  let html = '<div class="aid-library-intro">' + heading(label('app.parts')) + '</div>';
  for (const category of categories) {
    html += '<section class="aid-library-section"><h4>' +
      label('sections.' + category) + '</h4><div class="aid-palette-grid">' +
      ORGANS.filter(o => o.category === category).map(o =>
        paletteItem(o.key, label('organs.' + o.key), 'organ', o.key)).join('') +
      '</div></section>';
  }
  html += '<section class="aid-library-section"><h4>' + label('sections.brain') +
    '</h4><div class="aid-palette-grid">' +
    NEURONS.map(n => paletteItem('brain', label('centers.' + n.key), 'neuron', n.key)).join('') +
    '</div></section><section class="aid-library-section"><h4>' +
    label('sections.modules') + '</h4><div class="aid-palette-grid">' +
    MODULES.map(m => paletteItem(m.organs[0] === 'brain' ? 'brain' : m.organs[0],
      label('modules.' + m.key), 'module', m.key)).join('') +
    (state.userModules ?? []).map(m => paletteItem(m.organs[0]?.type ?? 'brain',
      m.name, 'user-module', m.id)).join('') + '</div></section>';
  return html;
}
export function toolPalette(state) {
  const tools = [
    ['select', 'mouse-pointer-2', '↖'], ['wire', 'cable', '⌁'],
    ['hormone', 'droplets', '◈'], ['learn', 'brain', '✦'],
    ['stimulate', 'zap', 'ϟ'], ['erase', 'trash', '✕'],
    ['pan', 'hand', '✋']
  ];
  return '<div class="aid-tools" role="toolbar" aria-label="' +
    label('app.parts') + '">' + tools.map(([key, ignored, glyph]) =>
    '<button type="button" data-tool="' + key + '" class="' +
    (state.tool === key ? 'active' : '') +
    '" title="' + label('tools.' + key) + '" aria-label="' +
    label('tools.' + key) + '">' + glyph + '</button>').join('') +
    '<span class="aid-tools-divider"></span>' +
    '<button data-zoom="in" title="' + label('tools.zoomIn') + '">＋</button>' +
    '<button data-zoom="out" title="' + label('tools.zoomOut') + '">−</button>' +
    '<button data-zoom="fit" title="' + label('tools.fit') + '">⌗</button>' +
    '</div>';
}
