import {visionInspector} from './vision.js';
import {effectorGraphic, gutGraphic, spineField} from './effectors.js';
import {lateralField} from './lateral.js';
import {probeField} from './probes.js';
import {pigmentInspector} from './pigments.js';
import {scentMap} from './scents.js';
import {ANATOMY, ATELIER_LIMITS, HORMONE_EFFECT, HORMONES, MOTOR_KIND} from '../../schema.js';
import {hormoneColors} from '../../hormones.js';
import {clamp, degrees, PERCENT, radians} from '../../units.js';
import {STUDIO_ICON} from '../../organ_icons.js';
import {TOOL_ICON} from './icons.js';
import {adaptationElement, sensitivityElement} from './sensitivity.js';
import {driveElement, restLevel} from './drive.js';
import {
  activationLevel,
  activationQuality,
  contactFieldOf,
  contactHalfAngle
} from '../../tuning.js';
import {planOfUnit, unitOfPlan} from '../model/retina.js';
import {
  MODULES,
  MUSCLE_LABEL_INDEX,
  NEURONS,
  PRESSURE_OF,
  ORGANS,
  ORGAN_BY_KEY,
  ROLE,
  functionFor,
  isRegion
} from '../model/organs.js';
import {
  allCenters,
  boundEffects,
  findCenter,
  findOrgan,
  groupReport,
  growsWith,
  lifePhase,
  modulesOf,
  NOTICEABLE_AFFINITY,
  oneSided,
  producers,
  receivers,
  teachersOf,
  wheelAffinity,
  wheelPlace,
  wheelSigma,
  wholeEndpoint,
  wiredCrossing
} from '../model/document.js';
import {centerMarker, centerTitle, endpointTitle, moduleName, organTitle, tone} from './scene.js';
import {
  escapeText,
  fixed,
  padPoint,
  padValues,
  pointMarks,
  pointText,
  trackShare,
  widthTrack
} from './markup.js';
import {onMidline, sideIndex} from '../model/layout.js';
import {planned, regionPlan, regionSlots, routedLinks} from '../model/regions.js';

import {t, tList} from '../../strings.js';

const label = key => t('studio.' + key);
const icon = (kind, size = 25) =>
    '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="' + escapeText(STUDIO_ICON[kind] ?? STUDIO_ICON.brain) +
    '" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/></svg>';
const heading = text => '<h3>' + escapeText(text) + '</h3>';
function iconCells(count, id) {
  let html = '<div class="aid-cell-chooser" aria-label="' + label('inspector.count') + '">';
  for (let i = 1; i <= ATELIER_LIMITS.max_copies; ++i)
    html += '<button type="button" class="aid-cell-pill' + (i <= count ? ' on' : '') +
            '" data-cell-count="' + i + '" data-center-id="' + escapeText(id) + '" title="' + i +
            '" aria-label="' + i + '"></button>';
  return html + '</div>';
}
// A touch or pain cell's field: a sector of its half angle on a ring around the cell, ahead
// upwards, with a handle on its edge; the pointer's direction from the cell sets the half angle.
export const CONTACT_PAD =
    Object.freeze({size : 140, centre : 70, radius : 53, cell : 5, handle : 6});
export function contactPatch(fx, fy) {
  const P = CONTACT_PAD, half = Math.atan2(fx * P.size - P.centre, P.centre - fy * P.size);
  return {field : contactFieldOf(degrees(Math.abs(half)))};
}
function contactField(center) {
  const P = CONTACT_PAD, half = radians(contactHalfAngle(center.field));
  const radial = angle =>
      ({x : P.centre + P.radius * Math.sin(angle), y : P.centre - P.radius * Math.cos(angle)});
  const lo = radial(-half), hi = radial(half);
  return '<svg class="aid-contact-field" data-contact-pad="' + escapeText(center.id) +
         '" viewBox="0 0 ' + P.size + ' ' + P.size + '" role="img" aria-label="' +
         label('inspector.contactAngle') + '"><circle cx="' + P.centre + '" cy="' + P.centre +
         '" r="' + P.radius + '"/><path class="aid-contact-sector" d="M' + P.centre + ' ' +
         P.centre + ' L' + pointText(lo) + ' A' + P.radius + ' ' + P.radius + ' 0 ' +
         (half * 2 > Math.PI ? 1 : 0) + ' 1 ' + pointText(hi) + ' Z"/><circle cx="' + P.centre +
         '" cy="' + P.centre + '" r="' + P.cell +
         '"/><circle class="aid-graphic-handle" data-graphic-handle="angle" cx="' + fixed(hi.x) +
         '" cy="' + fixed(hi.y) + '" r="' + P.handle + '"/></svg>';
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
         '</span><span>− ' + label('inspector.glandBinds') + '</span></div>';
}
function hormonePad(state, center) {
  const all = Array.from({length : state.capabilities?.bloodSubstances ?? 0}, (_, i) => i);
  return substanceWheel(state, {x : center.q1, y : center.q2, width : center.qwidth, active : true},
                        {
                          choices : all,
                          attribute : 'data-wheel-substance',
                          extra : ' data-center-id="' + escapeText(center.id) + '"',
                          pad : center.id
                        });
}
// The egg or sperm organ as one sac: cells along its wall make the gametes (growth), a stretch
// line across it marks the filling at which its pressure cells answer half (drag its handle), and
// a valve lets them out (release), open as far as the release cells rest active. Each part picks
// its center for the details below. The ovary fills with round eggs, the testis with sperm (a
// head and a wavy tail, SPERM), each in its own colours.
const SAC = Object.freeze({
  width : 300,
  height : 150,
  cx : 140,
  cy : 75,
  rx : 108,
  ry : 56,
  wall : 9,
  egg : 7,
  eggs : 26,
  valve : 18,
  handle : 7,
  label : 12
});
const SPERM = Object.freeze({head : 2.6, tail : 12, wave : 2.5});
function pressureGraphic(state, organ, selected) {
  const S = SAC, find = key => organ.centers.find(c => c.key === key);
  const growth = find('growth'), release = find('release'), pressure = find('pressure');
  const stretch = pressure ? activationLevel(unitOfPlan(pressure.threshold)) : .5;
  const lineY = S.cy + S.ry - 2 * S.ry * stretch;
  const half = y => S.rx * Math.sqrt(Math.max(0, 1 - ((y - S.cy) / S.ry) ** 2));
  const chosen = center => center && selected?.id === center.id ? ' selected' : '';
  const part = (center, body) => center ? '<g class="aid-sac-part' + chosen(center) +
                                              '" data-select-center="' + escapeText(center.id) +
                                              '"><title>' + escapeText(centerTitle(center)) +
                                              '</title>' + body + '</g>'
                                        : '';
  // Gametes fill the sac from the bottom up to the stretch line, in rows.
  const gamete = (x, y) => organ.type === 'eggs'
                               ? '<circle class="aid-sac-egg" cx="' + fixed(x) + '" cy="' +
                                     fixed(y) + '" r="' + fixed(S.egg / 1.4) + '"/>'
                               : '<circle class="aid-sac-sperm-head" cx="' + fixed(x) + '" cy="' +
                                     fixed(y) + '" r="' + SPERM.head +
                                     '"/><path class="aid-sac-sperm" d="M' + fixed(x - SPERM.head) +
                                     ' ' + fixed(y) + ' q' + -SPERM.tail / 4 + ' ' + -SPERM.wave +
                                     ' ' + -SPERM.tail / 2 + ' 0 t' + -SPERM.tail / 2 + ' 0"/>';
  let eggs = '';
  for (let k = 0, y = S.cy + S.ry - S.egg * 2; k < S.eggs && y > lineY; y -= S.egg * 1.8) {
    const reach = half(y) - S.egg * 1.5;
    for (let x = S.cx - reach; x <= S.cx + reach && k < S.eggs; x += S.egg * 2.1, ++k)
      eggs += gamete(x, y);
  }
  const wallCells =
      growth ? Array
                   .from({length : growth.copies},
                         (_, k) => {
                           const a = Math.PI * (.65 + .7 * k / Math.max(1, growth.copies - 1));
                           return '<circle class="aid-sac-cell" cx="' +
                                  fixed(S.cx + Math.cos(a) * (S.rx - S.wall)) + '" cy="' +
                                  fixed(S.cy - Math.sin(a) * (S.ry - S.wall)) + '" r="4"/>';
                         })
                   .join('')
             : '';
  // The valve stands as open as the release cells work at rest.
  const scale = biasScale(state);
  const open = release && scale ? Math.max(0, restLevel(release, scale)) / Math.tanh(scale) : 0;
  const vx = S.cx + S.rx, valve = '<path class="aid-sac-valve" d="M' + vx + ' ' +
                                  fixed(S.cy - S.valve * (.2 + open)) + ' L' + (vx + S.valve) +
                                  ' ' + S.cy + ' L' + vx + ' ' +
                                  fixed(S.cy + S.valve * (.2 + open)) + '"/>';
  return '<svg viewBox="0 0 ' + S.width + ' ' + S.height + '" class="aid-gonad-graphic aid-sac ' +
         organ.type + '"' + (pressure ? ' data-stretch="' + escapeText(pressure.id) + '"' : '') +
         ' role="img">' +
         '<ellipse class="aid-sac-body" cx="' + S.cx + '" cy="' + S.cy + '" rx="' + S.rx +
         '" ry="' + S.ry + '"/>' + eggs +
         part(growth, wallCells + '<text x="' + (S.cx - S.rx) + '" y="' + (S.label) + '">' +
                          label('centers.growth') + '</text>') +
         part(release, valve + '<text x="' + (vx + S.valve) + '" y="' +
                           (S.cy - S.valve - S.label / 2) + '" text-anchor="end">' +
                           label('centers.release') + '</text>') +
         part(pressure, '<line class="aid-sac-line" x1="' + fixed(S.cx - half(lineY)) + '" y1="' +
                            fixed(lineY) + '" x2="' + fixed(S.cx + half(lineY)) + '" y2="' +
                            fixed(lineY) + '"/><text x="' + fixed(S.cx) + '" y="' +
                            fixed(lineY - S.label / 2) + '" text-anchor="middle">' +
                            label('inspector.stretch') + '</text>') +
         (pressure
              ? '<circle class="aid-graphic-handle" data-stretch-handle cx="' +
                    fixed(S.cx + half(lineY)) + '" cy="' + fixed(lineY) + '" r="' + S.handle + '"/>'
              : '') +
         '</svg>';
}
// The stretch line's filling at a pointer's height (fraction of the sac graphic).
export function stretchPatch(fy) {
  const level = clamp((SAC.cy + SAC.ry - fy * SAC.height) / (2 * SAC.ry));
  return {threshold : planOfUnit(activationQuality(level))};
}

// What an organ's pressure cells measure as the engine bound them; a warning where they measure
// another organ than their own.
function pressureNote(state, organ) {
  const own = PRESSURE_OF[organ.type], cell = organ.centers.find(c => c.key === own?.key);
  const measured = cell ? groupReport(state.document, state.anatomy, 'pressure', cell.id) : null;
  if (!own || !(measured >= 0))
    return '';
  const text = tList('studio.inspector.measures')[measured] ?? '';
  return measured === own.source
             ? '<p class="aid-hint">' + escapeText(label('inspector.pressureCells') + ' ' + text) +
                   '</p>'
             : '<p class="aid-hint aid-warning">' +
                   escapeText(t('studio.inspector.measuresWrong', {measures : text})) + '</p>';
}
function pairedOrganGraphic(organ, selected) {
  // Each neural group remains selectable as more groups are added to the same organ.
  const bladder = organ.type === 'bladder';
  const rows = Math.ceil(organ.centers.length / 3);
  const height = Math.max(130, rows * 47 + 25);
  const outline =
      bladder
          ? '<ellipse cx="142" cy="' + fixed(height / 2) + '" rx="125" ry="' +
                fixed(height / 2 - 13) +
                '" fill="#b29bdc" fill-opacity=".09" stroke="#b29bdc" stroke-width="2"/>'
          : '<rect x="13" y="13" width="256" height="' + fixed(height - 26) +
                '" rx="54" fill="#dfbc87" fill-opacity=".09" stroke="#dfbc87" stroke-width="2"/>';
  const nodes = organ.centers
                    .map((center, index) => {
                      const x = 59 + (index % 3) * 83;
                      const y = height / 2 + (Math.floor(index / 3) - (rows - 1) / 2) * 47;
                      const active = selected?.id === center.id ? ' selected' : '';
                      const colour = center.role === 'sensor' ? '#79d2be' : '#b29bdc';
                      return '<g class="aid-gonad-center' + active + '" data-select-center="' +
                             escapeText(center.id) + '"><title>' + escapeText(centerTitle(center)) +
                             '</title><ellipse cx="' + fixed(x) + '" cy="' + fixed(y) +
                             '" rx="27" ry="19" fill="' + colour + '" fill-opacity=".24" stroke="' +
                             colour + '" stroke-width="2"/><text x="' + fixed(x) + '" y="' +
                             fixed(y + 5) + '" text-anchor="middle">' + (index + 1) + '</text></g>';
                    })
                    .join('');
  return '<svg class="aid-gonad-graphic" viewBox="0 0 286 ' + height + '" role="img" aria-label="' +
         escapeText(organTitle(organ)) + '">' + outline + nodes + '</svg>';
}
// A muscle does what its place makes of it: drive the tail, steer, suck in or bite. The four
// functions stand side by side, the muscle's own one marked; another one moves the muscle to the
// nearest places with that function.
const MUSCLE_ICON = Object.freeze({
  [MOTOR_KIND.forward] : 'M3 12h12M15 12l-4-4M15 12l-4 4M18 8l3 4-3 4',
  [MOTOR_KIND.turn] : 'M5 18c0-7 5-12 13-12M18 6l-4-2M18 6l-2 4',
  [MOTOR_KIND.suction] : 'M20 12H8M8 12l4-4M8 12l4 4M4 7v10',
  [MOTOR_KIND.aggression] : 'M4 8l8 4-8 4M20 8l-8 4 8 4'
});
function muscleGraphic(state, center) {
  const site = state.sites?.find(item => item.id === center.site);
  const own = site ? functionFor(center, site) : -1;
  const reachable =
      new Set(state.sites
                  .filter(s => (s.motors &
                                ((1 << MOTOR_KIND.forward) | (1 << MOTOR_KIND.turn) |
                                 (1 << MOTOR_KIND.suction) | (1 << MOTOR_KIND.aggression))) !== 0)
                  .map(s => functionFor(center, s)));
  const chips =
      [...MUSCLE_LABEL_INDEX.entries() ]
          .map(([ code, index ]) =>
                   '<button class="aid-muscle-function' + (code === own ? ' current' : '') + '"' +
                   (code !== own && reachable.has(code)
                        ? ' data-muscle-function="' + code + '" data-center-id="' +
                              escapeText(center.id) + '"'
                    : code === own ? ' aria-current="true"'
                                   : ' disabled') +
                   '><svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="' +
                   MUSCLE_ICON[code] + '"/></svg><span>' +
                   escapeText(tList('studio.muscles')[index] ?? '') + '</span></button>')
          .join('');
  return '<div class="aid-muscle-functions">' + chips + '</div>';
}
// Choosing another function for a muscle is rare: it waits folded at the end of its inspector.
function muscleKind(state, center) {
  return '<details class="aid-muscle-kind"><summary>' + label('inspector.muscleKind') +
         '</summary>' + muscleGraphic(state, center) + '</details>';
}

// The engine's bias scale, which makes a threshold a cell's activity at rest.
const biasScale = state => state.capabilities?.biasScale ?? 0;
// What an effector's activity does above and below zero: a bladder fills and empties, a gland
// secretes and binds, the others work or do nothing.
function driveMeaning(state, center) {
  const site = state.sites.find(s => s.id === center.site);
  const code = site ? functionFor(center, site) : -1;
  const key = code === MOTOR_KIND.bladder ? 'bladder'
              : code === MOTOR_KIND.gland ? 'gland'
                                          : 'muscle';
  return {
    above : label('inspector.driveHalves.' + key + '.above'),
    below : label('inspector.driveHalves.' + key + '.below'),
    idle : key === 'muscle'
  };
}
function organSettings(state, organ, center) {
  if (!center)
    return '<div class="aid-empty-centre">' + label('sections.empty') + '</div>';
  let html = '';
  if (organ.field)
    return visionInspector(state, organ);
  if (isRegion(organ) && state.selected?.kind !== 'center')
    return regionSettings(state, organ);
  if (organ.type === 'nose') {
    // Barbels grow where the head also feels by touch on the nose's side.
    const barbels = state.anatomy?.anatomy?.[ANATOMY.smell_outer_left + sideIndex(organ.side)];
    html += scentMap(organ, center) + '<p class="aid-hint">' +
            label(barbels > 0 ? 'inspector.barbelsGrown' : 'inspector.barbelsHint') + '</p>' +
            probeField(state, organ);
  } else if (organ.type === 'pigment') {
    html += pigmentInspector(state, organ, center);
  } else if (organ.type === 'gut') {
    html += gutGraphic(state, organ, center) + pressureNote(state, organ);
  } else if (organ.type === 'bladder') {
    html += pairedOrganGraphic(organ, center) + pressureNote(state, organ);
  } else if (organ.type === 'muscle') {
    html += effectorGraphic(state, organ);
  } else if (organ.type === 'defense') {
    html += effectorGraphic(state, organ) + spineField(state, organ);
  } else if (organ.type === 'gland') {
    html += glandProfile(state, center);
  } else if (organ.type === 'eggs' || organ.type === 'sperm') {
    html += pressureGraphic(state, organ, center) + pressureNote(state, organ);
  } else if (organ.type === 'lateral') {
    html += lateralField(state, organ) + probeField(state, organ);
  } else if ([ 'touch', 'pain' ].includes(organ.type)) {
    html += contactField(center) + probeField(state, organ);
  } else if (organ.type === 'blood') {
    html += hormonePad(state, center);
  } else if (organ.type === 'brain' || isRegion(organ)) {
    html += nerveProperties(state, center);
  } else {
    html += '<div class="aid-organ-metric">' + icon(organ.type, 50) + '<span>' +
            escapeText(organTitle(organ)) + '</span></div>';
  }
  if (center.role === 'nerve')
    html += outgoingField(state, center);
  // An organ that recruits nodes sets them and their strength on its graphic; other effectors
  // make no more cells, only stronger ones.
  if (!ORGAN_BY_KEY[organ.type]?.nodes)
    html += '<div class="aid-cell-count-title">' +
            label(center.role === 'motor' ? 'inspector.strength' : 'inspector.count') +
            ' <strong>' + center.copies + '</strong></div>' + iconCells(center.copies, center.id);
  if (center.role === 'sensor') {
    html += '<section class="aid-eye-section"><h4>' +
            escapeText(t('studio.inspector.answerTo', {stimulus : stimulusName(state, center)})) +
            '</h4>' + sensorAnswer(state, center) + sensorAdaptation(state, center) + '</section>';
  } else if (center.role === 'motor') {
    html += '<section class="aid-eye-section"><h4>' + label('inspector.drive') + '</h4>' +
            driveElement(center, label('inspector.drive'), n => t('studio.inspector.recovery', {n}),
                         {scale : biasScale(state), meaning : driveMeaning(state, center)}) +
            '</section>';
    return organ.type === 'muscle' ? html + muscleKind(state, center) : html;
  } else {
    // A nerve center rests, answers and fades; a pacemaker beats.
    const rhythm = center.key === 'pacemaker';
    html +=
        '<section class="aid-eye-section"><h4>' +
        label(rhythm ? 'inspector.beat' : 'inspector.afterglow') + '</h4>' +
        driveElement(center, label(rhythm ? 'inspector.beat' : 'inspector.afterglow'),
                     n => t(rhythm ? 'studio.inspector.beatSteps' : 'studio.inspector.fades', {n}),
                     {scale : biasScale(state), rhythm}) +
        '</section>';
  }
  return html;
}
// What a sensory center's cells sense, as the stimulus its answer is drawn over.
function stimulusName(state, center) {
  const site = state.sites.find(s => s.id === center.site);
  return tList('studio.inspector.stimuli')[site ? functionFor(center, site) : -1] ?? '';
}
// What a sensory center answers over its stimulus, drawn from the engine's curve, with the
// stimulus its adaptation is held at marked on it; while its handle is dragged, from the curve
// the drag started from.
export function sensorAnswer(state, center, shift = 1, start = null, dragged = null) {
  const sense = groupReport(state.document, state.anatomy, 'senses', center.id),
        answer = start ?? sense;
  const graphic =
      sensitivityElement(answer, answer?.intensity ? state.anatomy?.lightDimmest : null,
                         {sensitivity : 'center', 'sensitivity-id' : center.id},
                         label('inspector.sensitivity'), shift, dragged, sense?.adapt?.held);
  return '<div data-sensitivity-block="center" data-sensitivity-id="' + escapeText(center.id) +
         '">' + graphic + '</div>';
}
// How a sensory center gets used to its stimulus held from the mark above, over time, for the
// senses that adapt.
export function sensorAdaptation(state, center, stretch = 1, start = null) {
  const adapt = start ?? groupReport(state.document, state.anatomy, 'senses', center.id)?.adapt;
  const steps =
      adapt ? t('studio.inspector.steps', {n : Math.round((adapt.response.length - 1) * stretch)})
            : '';
  const graphic = adaptationElement(
      adapt, {adaptation : 'center', 'adaptation-id' : center.id}, label('inspector.adaptation'),
      steps, stretch,
      escapeText(t('studio.inspector.held', {stimulus : stimulusName(state, center)})));
  return '<div data-adaptation-block data-adaptation-id="' + escapeText(center.id) + '">' +
         graphic + '</div>';
}
// A brain region: how it is wired (which organs feed it, where it sends, on which side) and its
// nodes with their cell counts. Each connection's side guidance is a glyph to click through.
const PAIRING_GLYPH = Object.freeze({
  same : 'M3 6h14M3 14h14',
  crossed : 'M3 6L17 14M3 14L17 6',
  both : 'M3 6h14M3 14h14M3 6L17 14M3 14L17 6'
});
function pairingButton(wire) {
  if (!wire.pairing)
    return '<span class="aid-pairing single"></span>';
  return '<button class="aid-pairing" data-wire-pairing="' + escapeText(wire.id) + '" title="' +
         label('inspector.pairing.title') + ': ' + label('inspector.pairing.' + wire.pairing) +
         '"><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="' +
         PAIRING_GLYPH[wire.pairing] + '"/></svg><span>' +
         label('inspector.pairing.' + wire.pairing) + '</span></button>';
}
// A brain region as a circuit: its nodes on both sides of the midline (the region and its twin),
// the organs feeding it above, those it drives below, and every connection as the engine makes
// it, crossing the midline where it crosses. Each wire's side guidance is a glyph to click
// through beside the midline; nodes and organs are chosen by a click.
// Names stand right-aligned at LABEL, left of the two columns.
const CIRCUIT = Object.freeze({
  width : 300,
  label : 80,
  left : 120,
  right : 250,
  middle : 185,
  spread : 46,
  row : 50,
  top : 34,
  bottom : 18,
  node : 13,
  organ : 12,
  glyph : 11,
  bend : 20,
  fan : 26,
  marker : 7,
  teach : 4,
  arrow : 8
});
const circuitSide = organ => sideIndex(organ?.side);
function regionCircuit(state, organ) {
  const doc = state.document, C = CIRCUIT;
  const sides = [ organ, findOrgan(doc, organ.pair) ];
  if (circuitSide(organ) === 1)
    sides.reverse();
  const members = new Map();
  sides.forEach(o => o?.centers.forEach((center, index) => members.set(
                                            center.id, {side : circuitSide(o), index, center})));
  // An organ outside stands as a whole, however many of its nodes the region hears.
  const seen = new Set();
  const links = routedLinks(doc, state.sites, true)
                    .filter(l => members.has(l.from) || members.has(l.to))
                    .map(l => ({
                           ...l,
                           from : members.has(l.from) ? l.from : wholeEndpoint(doc, l.from),
                           to : members.has(l.to) ? l.to : wholeEndpoint(doc, l.to)
                         }))
                    .filter(l => !seen.has(l.from + '>' + l.to) && seen.add(l.from + '>' + l.to));
  if (!links.length)
    return '';
  // Organs and centers outside the region, a row for each kind, inputs above and outputs below.
  const outside = id => findOrgan(doc, id) ? {organ : findOrgan(doc, id)} : findCenter(doc, id);
  const rowsOf = ids => {
    const rows = [];
    for (const id of ids) {
      const end = outside(id), key = end.organ.type + ':' + (end.center?.key ?? '');
      let row = rows.find(r => r.key === key);
      if (!row)
        rows.push(row = {key, end, ids : []});
      row.ids.push(id);
    }
    return rows;
  };
  const inputs = rowsOf([...new Set(links.filter(l => !members.has(l.from)).map(l => l.from)) ]);
  const outputs = rowsOf([...new Set(links.filter(l => !members.has(l.to)).map(l => l.to)) ]);
  // Ends of one row on one side fan out around their column; unpaired ones around the middle.
  // An end that both feeds the region and is fed by it stands in both rows.
  const count = organ.centers.length;
  const place = (rows, top) => {
    const at = new Map();
    rows.forEach((row, r) => {
      const sideOf = id => {
        const end = outside(id);
        return end.organ.pair && findOrgan(doc, end.organ.pair) ? circuitSide(end.organ) : null;
      };
      for (const side of [0, 1, null]) {
        const ids = row.ids.filter(id => sideOf(id) === side);
        const column = side === null ? C.middle : side ? C.right : C.left;
        const step = side === null ? C.spread : C.fan;
        ids.forEach(
            (id, k) => at.set(
                id, {x : column + (k - (ids.length - 1) / 2) * step, y : top + r * C.row, side}));
      }
    });
    return at;
  };
  const inPos = place(inputs, C.top);
  const nodeTop = C.top + inputs.length * C.row;
  const nodePos = new Map([...members ].map(
      ([
        id, m
      ]) => [id, {x : m.side ? C.right : C.left, y : nodeTop + m.index * C.row, side : m.side}]));
  const outTop = nodeTop + count * C.row;
  const outPos = place(outputs, outTop);
  const fromPos = id => nodePos.get(id) ?? inPos.get(id);
  const toPos = id => nodePos.get(id) ?? outPos.get(id);
  const height = outTop + Math.max(0, outputs.length - 1) * C.row + C.bottom + C.node;
  // Connections: a curve from end to end, bowing outward between nodes of one column.
  const lines = links.map(l => {
    const a = fromPos(l.from), b = toPos(l.to);
    const crossing = a.side !== null && b.side !== null && a.side !== b.side;
    const bow = a.x === b.x ? (a.x < C.middle ? -C.bend : C.bend) : 0;
    // A link of the region's own plan can be taken out and put back with a click.
    const own = l.wire.inner ? ' data-inner-link="' + escapeText(l.key) + '" data-organ-id="' +
                                   escapeText(organ.id) + '"'
                             : '';
    return '<path class="aid-circuit-link' + (crossing ? ' crossing' : '') +
           (l.wire.inner ? ' inner' : '') + (l.cut ? ' cut' : '') + '"' + own + ' d="M' + a.x +
           ' ' + a.y + ' C' + (a.x + bow) + ' ' + fixed(a.y + (b.y - a.y) / 3) + ' ' + (b.x + bow) +
           ' ' + fixed(b.y - (b.y - a.y) / 3) + ' ' + b.x + ' ' + b.y +
           '" marker-end="url(#aid-circuit-arrow)"><title>' +
           (l.wire.inner ? label(l.cut ? 'inspector.region.restore' : 'inspector.region.cut')
                         : '') +
           '</title></path>';
  });
  // A wire's side guidance beside the midline, between the rows it joins.
  const wires = [...new Set(links.map(l => l.wire)) ].filter(w => w.pairing);
  const glyphs = wires.map(wire => {
    const ys = links.filter(l => l.wire === wire).flatMap(l => [fromPos(l.from).y, toPos(l.to).y]);
    const y = fixed((Math.min(...ys) + Math.max(...ys)) / 2), x = C.middle;
    return '<g class="aid-circuit-pairing" data-wire-pairing="' + escapeText(wire.id) +
           '" transform="translate(' + x + ' ' + y + ')"><title>' +
           label('inspector.pairing.title') + ': ' + label('inspector.pairing.' + wire.pairing) +
           '</title><rect x="-' + C.glyph + '" y="-' + C.glyph + '" width="' + 2 * C.glyph +
           '" height="' + 2 * C.glyph + '" rx="5"/><path transform="translate(-10 -10)" d="' +
           PAIRING_GLYPH[wire.pairing] + '"/></g>';
  });
  // An organ shows as its icon and name; a center of the brain as its own glyph and name.
  const brainCenter = end => end.center && end.organ.type === 'brain';
  const endTitle = end => brainCenter(end) ? centerTitle(end.center) : organTitle(end.organ);
  const ends = (rows, at) => rows.flatMap(row => row.ids.map(id => {
    const p = at.get(id), end = outside(id);
    return '<g class="aid-circuit-organ" ' +
           (brainCenter(end) ? 'data-select-center="' + escapeText(end.center.id)
                             : 'data-select-organ="' + escapeText(end.organ.id)) +
           '" transform="translate(' + p.x + ' ' + p.y + ')"><title>' + escapeText(endTitle(end)) +
           '</title><circle r="' + C.organ + '"/>' +
           (brainCenter(end)
                ? centerMarker(end.center, C.marker)
                : '<g transform="translate(-9 -9)">' + icon(end.organ.type, 18) + '</g>') +
           '</g>';
  }));
  const rowLabels = (rows, at) =>
      rows.map(row => '<text class="aid-circuit-label" x="' + C.label + '" y="' +
                      (at.get(row.ids[0]).y + 4) + '" text-anchor="end">' +
                      escapeText(endTitle(row.end)) + '</text>');
  // A node that learns from a substance wears a ring in its colour, as on the fish.
  const nodes = [...members ].map(([ id, m ]) => {
    const p = nodePos.get(id);
    const teacher = state.capabilities ? teachersOf(doc, m.center, state.capabilities)[0] : null;
    return '<g class="aid-circuit-node" data-select-center="' + escapeText(id) +
           '" transform="translate(' + p.x + ' ' + p.y + ')"><title>' +
           escapeText(centerTitle(m.center)) + '</title>' +
           (teacher ? '<circle class="aid-circuit-teach" r="' + (C.node + C.teach) +
                          '" style="--substance:' + substanceColour(teacher.substance.index) + '"/>'
                    : '') +
           '<circle r="' + C.node + '"/>' + centerMarker(m.center, C.marker) + '</g>';
  });
  const nodeLabels =
      organ.centers.map((center, i) => '<text class="aid-circuit-label" x="' + C.label + '" y="' +
                                       (nodeTop + i * C.row + 4) + '" text-anchor="end">' +
                                       escapeText(centerTitle(center)) + '</text>');
  return '<svg class="aid-circuit" viewBox="0 0 ' + C.width + ' ' + height +
         '" role="img" aria-label="' + label('inspector.region.circuit') +
         '"><defs><marker id="aid-circuit-arrow" viewBox="0 0 10 10" refX="' +
         fixed(10 + C.node * 10 / C.arrow) +
         '" refY="5" markerUnits="userSpaceOnUse" markerWidth="' + C.arrow + '" markerHeight="' +
         C.arrow + '" orient="auto"><path d="M0 0 L10 5 L0 10 Z"/></marker></defs>' +
         '<line class="aid-circuit-midline" x1="' + C.middle + '" y1="0" x2="' + C.middle +
         '" y2="' + height + '"/><text class="aid-circuit-side" x="' + C.left +
         '" y="14" text-anchor="middle">' + label('inspector.side.left') +
         '</text><text class="aid-circuit-side" x="' + C.right + '" y="14" text-anchor="middle">' +
         label('inspector.side.right') + '</text>' + lines.join('') +
         rowLabels(inputs, inPos).join('') + rowLabels(outputs, outPos).join('') +
         nodeLabels.join('') + ends(inputs, inPos).join('') + ends(outputs, outPos).join('') +
         nodes.join('') + glyphs.join('') + '</svg>';
}
// An organ's or region's slots, each with the organs filling it or marked free (and needed, when
// it needs one there).
function slotsSection(state, organ) {
  if (!ORGAN_BY_KEY[organ.type].slots)
    return '';
  const slots =
      regionSlots(state.document, organ)
          .map(slot => '<li class="' +
                       (slot.filled.length ? 'filled'
                        : slot.required    ? 'missing'
                                           : 'free') +
                       '"><span>' + label('regions.slots.' + slot.key) + '</span><small>' +
                       label(slot.required ? 'regions.required' : 'regions.optional') +
                       '</small><span class="aid-slot-ends">' +
                       (slot.filled.length
                            ? slot.filled
                                  .map(o => '<button data-select-organ="' + escapeText(o.id) +
                                            '">' + icon(o.type, 16) +
                                            escapeText(organTitle(o, state.sites)) + '</button>')
                                  .join('')
                            : '') +
                       // Any slot takes one more: a click starts the wire there.
                       '<button class="aid-slot-add" data-slot-region="' + escapeText(organ.id) +
                       '" data-slot-dir="' + slot.dir + '" title="' +
                       label(slot.dir === 'in' ? 'status.slotIn' : 'status.slotOut') + '">' +
                       (slot.filled.length ? '+' : label('regions.free') + ' +') + '</button>' +
                       '</span></li>')
          .join('');
  return '<section class="aid-eye-section"><h4>' + label('regions.slotsTitle') +
         '</h4><ul class="aid-region-slots">' + slots + '</ul></section>';
}
// A planned region's slots, its own settings and whether its plan follows its organs.
function regionControls(state, organ) {
  if (!planned(organ))
    return '';
  const region = organ.region, settings = ORGAN_BY_KEY[organ.type].settings;
  // A setting the plan cannot reach as asked (a tectum's bands with many colour types apart)
  // shows what it reaches.
  const most = regionPlan(state.document, organ).most ?? {};
  const choices =
      Object.entries(settings)
          .map(([ key, s ]) => {
            const names = s.named ? tList('studio.regions.values.' + key) : null;
            const reached = Math.min(region[key], most[key] ?? region[key]);
            let buttons = '';
            for (let value = s.least; value <= s.most; ++value)
              buttons += '<button class="' +
                         (reached === value               ? 'active'
                          : value > (most[key] ?? s.most) ? 'beyond'
                                                          : '') +
                         '" data-region-setting="' + key + '" data-region-value="' + value +
                         '" data-organ-id="' + escapeText(organ.id) + '"' +
                         (value > (most[key] ?? s.most) ? ' title="' + label('regions.beyond') + '"'
                                                        : '') +
                         '>' + escapeText(names?.[value] ?? String(value)) + '</button>';
            return '<div class="aid-region-setting"><span>' + label('regions.settings.' + key) +
                   '</span><div class="aid-button-group">' + buttons + '</div></div>';
          })
          .join('');
  // Only a region whose plan follows its organs has the switch.
  const follows = regionPlan(state.document, organ).view
                      ? '<label class="aid-checkbox"><input type="checkbox" data-region-follow="' +
                            escapeText(organ.id) + '"' + (region.follow ? ' checked' : '') + '/>' +
                            label('regions.follow') + '</label><p class="aid-hint">' +
                            label('regions.' + organ.type + '.follows') + ' ' +
                            label('regions.followHint') + '</p>'
                      : '';
  // A plan larger than the free sites around the region says how much of it found room.
  const wanted = regionPlan(state.document, organ).nodes.length;
  const crowded =
      organ.centers.length < wanted
          ? '<p class="aid-hint aid-warning">' +
                escapeText(t('studio.regions.crowded', {n : organ.centers.length, of : wanted})) +
                '</p>'
          : '';
  return slotsSection(state, organ) + '<section class="aid-eye-section"><h4>' +
         label('regions.settingsTitle') + '</h4>' + choices + crowded + follows + '</section>';
}
function regionSettings(state, organ) {
  const circuit = regionCircuit(state, organ);
  let html = regionControls(state, organ) + '<section class="aid-eye-section"><h4>' +
             label('inspector.region.circuit') + '</h4>' +
             (circuit || '<p class="aid-hint">' + label('inspector.region.none') + '</p>') +
             (circuit ? '<p class="aid-hint">' + label('inspector.region.cutHint') + '</p>' : '') +
             '<div class="aid-circuit-legend"><span class="same">' +
             label('inspector.pairing.same') + '</span><span class="crossing">' +
             label('inspector.pairing.crossed') + '</span></div></section>';
  html += '<section class="aid-eye-section"><h4>' + label('inspector.region.nodes') + '</h4>';
  for (const center of organ.centers)
    html += '<div class="aid-region-node"><button data-select-center="' + escapeText(center.id) +
            '">' + escapeText(centerTitle(center)) + '</button>' +
            iconCells(center.copies, center.id) + '</div>';
  return html + '</section>';
}
function nerveProperties(state, center) {
  // The chosen circuit is its type. Only controls belonging to that circuit stay editable.
  const template = '<div class="aid-neuron-kind">' + label('inspector.template') + ': ' +
                   escapeText(label('centers.' + center.key)) + '</div>';
  return template + centerSide(state, center) + developedNerve(state, center);
}
// Where a nerve center of the brain lies: left, on the midline (serving both sides) or right.
function centerSide(state, center) {
  const found = findCenter(state.document, center.id);
  const site = state.sites?.find(s => s.id === center.site);
  if (found?.organ.type !== 'brain' || !site)
    return '';
  const here = onMidline(site) ? 0 : site.side;
  return '<div class="aid-button-group aid-center-side" role="group" aria-label="' +
         label('inspector.side.label') + '">' +
         [ [ -1, 'left' ], [ 0, 'middle' ], [ 1, 'right' ] ]
             .map(([ side, key ]) => '<button class="' + (here === side ? 'active' : '') +
                                     '" data-center-side="' + side + '" data-center-id="' +
                                     escapeText(center.id) + '">' + label('inspector.side.' + key) +
                                     '</button>')
             .join('') +
         '</div>';
}
function developedNerve(state, center) {
  if (state.stale || !Array.isArray(state.report?.groups))
    return '';
  const nerve = groupReport(state.document, state.report, 'groups', center.id)?.nerve;
  if (!nerve)
    return '';
  const [sign, mode, pace, modulator] = nerve, percent = v => Math.round(v * 100) + ' %';
  const row = (name, value) => '<div><span>' + name + '</span><output>' + value + '</output></div>';
  return '<section class="aid-developed-nerve">' + heading(label('inspector.developedClass')) +
         row(label('inspector.transmitter'),
             label(sign >= 0 ? 'inspector.exciting' : 'inspector.inhibiting')) +
         row(label('inspector.learningMode'), fixed(mode)) +
         row(label('inspector.rhythm'), percent(pace)) +
         row(label('inspector.modulation'), percent(modulator)) + '</section>';
}
function selectedCenter(state, organ) {
  const selected = state.selected;
  if (selected?.kind === 'center')
    return organ.centers.find(c => c.id === selected.id) ?? organ.centers[0];
  return organ.centers[0] ?? null;
}
// An organ's centers as tabs; an organ with types (a nose, the skin's pigment cells) chooses them
// on its own chips instead.
function centerTabs(state, organ) {
  if (organ.field || organ.centers.length < 2 || ORGAN_BY_KEY[organ.type]?.types)
    return '';
  // A brain region is chosen as a whole from its first tab: its slots, settings and circuit.
  const whole = isRegion(organ)
                    ? '<button data-select-organ="' + escapeText(organ.id) + '" class="' +
                          (state.selected?.kind === 'organ' ? 'selected' : '') + '">' +
                          label('inspector.region.whole') + '</button>'
                    : '';
  return '<div class="aid-center-tabs">' + whole +
         organ.centers
             .map((c, index) => '<button data-select-center="' + escapeText(c.id) + '" class="' +
                                (state.selected?.id === c.id ? 'selected' : '') + '">' +
                                (index + 1) + ' · ' + escapeText(centerTitle(c)) + '</button>')
             .join('') +
         '</div>';
}
// For an organ on one side: the two sides as one control. The current side is marked, the other
// one selects its twin (or adds it as a mirror image); between them the link keeps both alike.
function sideSwitch(organ) {
  if (organ.type === 'brain' || !organ.side || ORGAN_BY_KEY[organ.type]?.scope === 'single')
    return '';
  const here = organ.side < 0 ? 'left' : 'right', there = organ.side < 0 ? 'right' : 'left';
  const own = '<button class="current" aria-current="true">' + label('inspector.side.' + here) +
              '</button>';
  const other = organ.pair ? '<button data-select-organ="' + escapeText(organ.pair) + '">' +
                                 label('inspector.side.' + there) + '</button>'
                           : '<button class="aid-add" data-mirror-organ="' + escapeText(organ.id) +
                                 '">＋ ' + label('inspector.side.' + there) + '</button>';
  const link = organ.pair
                   ? '<button class="aid-side-link" data-link-pair="' + escapeText(organ.id) +
                         '" aria-pressed="' + organ.linked + '" title="' +
                         label('inspector.side.linkTitle') + '">' +
                         label(organ.linked ? 'inspector.side.linked' : 'inspector.side.apart') +
                         '</button>'
                   : '';
  const parts = organ.side < 0 ? [ own, link, other ] : [ other, link, own ];
  return '<div class="aid-side-switch" role="group" aria-label="' + label('inspector.side.label') +
         '">' + parts.join('') + '</div>';
}
// The modules an organ belongs to, each a way to choose the module as a whole.
function moduleChips(state, id) {
  const modules = modulesOf(state.document, id);
  return modules.length
             ? '<div class="aid-module-chips"><span>' + label('inspector.partOf') + '</span>' +
                   modules
                       .map(a => '<button data-select-assembly="' + escapeText(a.id) + '">' +
                                 escapeText(moduleName(state.document, a)) + '</button>')
                       .join('') +
                   '</div>'
             : '';
}
// What substances do to the chosen cell group: what a gland releases, what the group's
// receptors answer to and, for nerve cells, which substances teach them. Each list opens the tool
// that edits it, with this group chosen.
function chemistry(state, organ, center) {
  const wheel = state.capabilities, doc = state.document;
  if (!wheel || !center || isRegion(organ) && state.selected?.kind !== 'center')
    return '';
  const chip = index => '<span class="aid-substance-chip"><span class="aid-substance-swatch" ' +
                        'style="--substance:' + substanceColour(index) + '"></span>' +
                        escapeText(substanceName(state, index)) + '</span>';
  const row = (title, items, none) =>
      '<dt>' + label(title) + '</dt><dd>' + (items.length ? items.join('') : label(none)) + '</dd>';
  let rows = '';
  if (organ.type === 'gland')
    rows += row('inspector.releasesSubstances',
                doc.substances
                    .filter(sub => wheelAffinity(wheel, center.q1, center.q2, center.qwidth,
                                                 sub.index) >= NOTICEABLE_AFFINITY)
                    .map(sub => chip(sub.index)),
                'inspector.releasesNothing');
  rows += row('inspector.answersTo',
              doc.substances.flatMap(
                  sub => boundEffects(center, sub.index, wheel)
                             .map(effect => chip(sub.index) + '<small class="aid-bound-effect">' +
                                            label('effects.' + effect) + '</small>')),
              'inspector.answersToNothing');
  if (center.role === 'nerve')
    rows += row('inspector.learnsFrom',
                teachersOf(doc, center, wheel)
                    .map(({substance, glands}) =>
                             chip(substance.index) +
                             (glands.length ? ''
                                            : '<small class="aid-bound-effect">' +
                                                  label('inspector.noGland') + '</small>')),
                'inspector.learnsNothing');
  const open = (tool, text) => '<button class="aid-secondary" data-open-tool="' + tool +
                               '" data-center-id="' + escapeText(center.id) + '">' + label(text) +
                               '</button>';
  return '<section class="aid-eye-section aid-chemistry"><h4>' + label('inspector.chemistry') +
         '</h4><dl>' + rows + '</dl><div class="aid-button-group">' +
         open('hormone', 'inspector.editHormones') +
         (center.role === 'nerve' ? open('learn', 'inspector.editLearning') : '') +
         '</div></section>';
}
// A brain region's technical term, shorter than its German name.
const regionTerm = key => label('regions.' + key + '.term');
function organInspector(state, organ) {
  const center = selectedCenter(state, organ);
  // A region's technical term heads it where it differs from its German name.
  const plain = text => text.replace(/\u00ad/g, '');
  const term = isRegion(organ) && plain(regionTerm(organ.type)) !== plain(organTitle(organ))
                   ? regionTerm(organ.type)
                   : label(isRegion(organ) ? 'sections.regions' : 'inspector.organType');
  let html = '<header class="aid-inspector-head"><span>' + term + '</span>' +
             heading(organTitle(organ, state.sites)) + '</header>' +
             moduleChips(state, organ.type === 'brain' ? center?.id : organ.id) +
             sideSwitch(organ) + centerTabs(state, organ);
  html += '<div class="aid-organ-settings">' + organSettings(state, organ, center) + '</div>' +
          (isRegion(organ) ? '' : slotsSection(state, organ)) + chemistry(state, organ, center);
  if (isRegion(organ))
    html += '<label class="aid-compiler-region"><input type="checkbox" data-compiler-open="' +
            escapeText(organ.id) + '"' + (organ.openContacts ? ' checked' : '') + '/>' +
            label('compiler.openRegion') + '</label>';
  if (organ.type !== 'brain')
    html += '<div class="aid-inspector-actions"><button class="aid-danger" data-remove-organ="' +
            escapeText(organ.id) + '">' + label('inspector.removeOrgan') + '</button></div>';
  else if (state.selected?.kind === 'center')
    html += '<button class="aid-danger" data-remove-center="' + escapeText(center.id) + '">' +
            label('inspector.removeCenter') + '</button>';
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
         fixed(weight) + '</strong><span>' + label('inspector.meanWeight') + '</span></div></div>' +
         '<div class="aid-contact-polarities">' +
         polarities
             .map(item => '<div class="aid-contact-polarity ' + item.tone + '"><span>' +
                          label('inspector.' + item.key) + '</span><strong>' +
                          item.count.toLocaleString('de-AT') + '</strong><small>' +
                          (item.weight >= 0 ? '+' : '') + fixed(item.weight) + '</small></div>')
             .join('') +
         '</div>';
}
// A wire's search field: its halo grows from LEAST around its source by REACH at full spread,
// within the field's BOUNDARY; the pointer's distance from the source sets the spread.
export const WIRE_PAD = Object.freeze(
    {size : 150, centre : 75, boundary : 63, least : 8, reach : 55, source : 5, handle : 7});
const wireRadius = spread => WIRE_PAD.least + WIRE_PAD.reach * spread;
export function wirePatch(fx, fy) {
  const W = WIRE_PAD, distance = Math.hypot(fx * W.size - W.centre, fy * W.size - W.centre);
  return {spread : clamp((distance - W.least) / W.reach)};
}
export function wireMarks(wire) {
  const radius = wireRadius(wire.spread);
  return {'.aid-wire-halo' : {r : radius}, '.aid-wire-handle' : {cx : WIRE_PAD.centre + radius}};
}
function wireField(wire) {
  const W = WIRE_PAD, radius = wireRadius(wire.spread);
  const circle = (cls, r, x = W.centre) => '<circle class="' + cls + '" cx="' + fixed(x) +
                                           '" cy="' + W.centre + '" r="' + fixed(r) + '"/>';
  return '<div class="aid-wire-field"><svg class="aid-wire-search" data-wire-pad="' +
         escapeText(wire.id) + '" viewBox="0 0 ' + W.size + ' ' + W.size +
         '" tabindex="0" role="img" aria-label="' + label('sections.spread') + '">' +
         circle('aid-wire-boundary', W.boundary) + circle('aid-wire-halo', radius) +
         circle('aid-wire-source', W.source) +
         circle('aid-wire-handle', W.handle, W.centre + radius) + '</svg><span>' +
         label('sections.spread') + '</span></div>';
}
// The sender's cross-body preference and reach apply to all of its outgoing contacts: across the
// pad from its own side to the other, up from near to far. When its wires all lead across or all
// to its own side, they decide the side, and the pad shows it; the pointer sets the reach alone.
export const OUTPUT_PAD =
    Object.freeze({width : 150, height : 150, inset : 15, round : 12, marker : 8});
export function outputPatch(fx, fy, center, state) {
  const {across, up} = padValues(OUTPUT_PAD, fx, fy);
  return wiredCrossing(state.document, center, state.sites) === null
             ? {range : up, crossing : across}
             : {range : up};
}
const outputPoint = (state, center) =>
    padPoint(OUTPUT_PAD, wiredCrossing(state.document, center, state.sites) ?? center.crossing,
             center.range);
export const outputMarks = (center, state) => pointMarks(outputPoint(state, center));
function outgoingField(state, center) {
  const P = OUTPUT_PAD, wired = wiredCrossing(state.document, center, state.sites);
  const p = outputPoint(state, center), side = P.width - 2 * P.inset;
  const middle = {x : P.width / 2, y : P.height / 2};
  return '<div class="aid-output-field"><h3>' + label('inspector.signalReach') +
         '</h3><div class="aid-vector-editor"><svg data-output-pad="' + escapeText(center.id) +
         '" viewBox="0 0 ' + P.width + ' ' + P.height + '" tabindex="0" role="img" aria-label="' +
         label('inspector.signalReach') + '"><rect x="' + P.inset + '" y="' + P.inset +
         '" width="' + side + '" height="' + side + '" rx="' + P.round + '"/><path d="M' +
         middle.x + ' ' + P.inset + ' V' + (P.height - P.inset) + ' M' + P.inset + ' ' + middle.y +
         ' H' + (P.width - P.inset) + '"/><circle class="aid-vector-point" cx="' + fixed(p.x) +
         '" cy="' + fixed(p.y) + '" r="' + P.marker +
         '"/></svg><div class="aid-vector-hints"><span>' + label('inspector.sameSide') +
         '</span><span>' + label('inspector.far') + '</span><span>' +
         label('inspector.oppositeSide') + '</span><span>' + label('inspector.near') +
         '</span></div></div>' +
         (wired === null ? '' : '<p class="aid-hint">' + label('inspector.sideByWires') + '</p>') +
         '</div>';
}
function wireInspector(state, wire) {
  const doc = state.document;
  return '<header class="aid-inspector-head"><span>' + label('sections.connections') + '</span>' +
         heading(endpointTitle(doc, wire.from, state.sites) + ' → ' +
                 endpointTitle(doc, wire.to, state.sites)) +
         '</header>' +
         (wire.pairing ? '<div class="aid-wire-pairing">' + pairingButton(wire) + '</div>' : '') +
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
  [HORMONE_EFFECT.excitation] : {low : -1, high : 1, value : r => r, response : v => v},
  [HORMONE_EFFECT.learning] : {low : 0, high : 2, value : r => 1 + r, response : v => v - 1},
  [HORMONE_EFFECT.death] : {low : -1, high : 1, value : r => r, response : v => v}
});
const SHARE_SCALE =
    Object.freeze({low : 0, high : 1, value : r => (1 + r) / 2, response : v => 2 * v - 1});
const GROWTH_SCALE =
    Object.freeze({low : 0, high : 1, value : r => Math.max(0, r), response : v => v});
// A receptor's curve as the engine binds: its scale, its concentration axis (log over the
// engine's half range, or maturity from 0 to 1) and its response at a concentration.
function receptorCurve(state, receptor, effect) {
  const maturity = receptor.substance === HORMONES.levels && effect !== GROWTH;
  const [halfMin, halfMax] = state.capabilities?.halfRange ?? [ receptor.half, receptor.half ];
  const scale = effect === GROWTH ? GROWTH_SCALE : EFFECT_SCALE[effect] ?? SHARE_SCALE;
  const response = (c, r = receptor) => effect === GROWTH
                                            ? Math.min(1, r.sensitivity * bound(r, c))
                                            : clamp(r.baseline + r.sensitivity * bound(r, c), -1);
  const atFraction = f => maturity ? f : halfMin * Math.pow(halfMax / halfMin, f);
  const fraction = c => maturity ? c : Math.log(c / halfMin) / Math.log(halfMax / halfMin);
  const x = f => CURVE.left + (CURVE.right - CURVE.left) * f;
  const y = v =>
      CURVE.bottom - (CURVE.bottom - CURVE.top) * (v - scale.low) / (scale.high - scale.low);
  return {maturity, halfMin, halfMax, scale, response, atFraction, fraction, x, y};
}
// The receptor's handles: its level without the substance (baseline), with plenty of it
// (sensitivity), the concentration of half binding, and the binding's steepness one doubling
// past it.
const STEEP_PROBE = 2;
function curveHandles(state, receptor, effect, target) {
  const k = receptorCurve(state, receptor, effect);
  const at = c => [k.x(clamp(k.fraction(c))), k.y(k.scale.value(k.response(c)))];
  const handles = [
    ...(effect === GROWTH
            ? []
            : [ [ 'baseline', [ k.x(0), k.y(k.scale.value(k.response(k.atFraction(0)))) ] ] ]),
    [ 'sensitivity', [ k.x(1), k.y(k.scale.value(k.response(k.atFraction(1)))) ] ],
    [ 'half', at(receptor.half) ],
    ...((state.capabilities?.steepnessSteps ?? 0) > 0
            ? [ [ 'steepness', at(receptor.half * STEEP_PROBE) ] ]
            : [])
  ];
  return handles
      .map(([ key, [ hx, hy ] ]) =>
               '<circle class="aid-spectrum-handle curve-' + key + '" data-curve-handle="' + key +
               '" cx="' + fixed(hx) + '" cy="' + fixed(hy) + '" r="6"><title>' +
               escapeText(label('inspector.curve.' + key)) + '</title></circle>')
      .join('');
}
// A pointer at (fx, fy), fractions of the curve graphic, as a change of the receptor.
export function receptorCurvePatch(state, receptor, effect, handle, fx, fy) {
  const k = receptorCurve(state, receptor, effect), span = state.capabilities?.sensitivitySpan ?? 1;
  const px = fx * CURVE.width, py = fy * CURVE.height;
  const v =
      k.scale.low + (CURVE.bottom - py) / (CURVE.bottom - CURVE.top) * (k.scale.high - k.scale.low);
  const r = clamp(k.scale.response(v), -1);
  const clampSpan = value => Math.max(-span, Math.min(span, value));
  if (handle === 'baseline')
    return {baseline : r};
  if (handle === 'sensitivity') {
    const full = bound(receptor, k.atFraction(1)), base = effect === GROWTH ? 0 : receptor.baseline;
    return full > 0 ? {sensitivity : clampSpan((r - base) / full)} : null;
  }
  const f = clamp((px - CURVE.left) / (CURVE.right - CURVE.left));
  if (handle === 'half')
    return {half : Math.max(k.halfMin, Math.min(k.halfMax, k.atFraction(f)))};
  const base = effect === GROWTH ? 0 : receptor.baseline;
  const share = receptor.sensitivity ? (r - base) / receptor.sensitivity : 0;
  if (!(share > 0 && share < 1))
    return null;
  // bound at STEEP_PROBE times the half is p^n / (p^n + 1), n = 2^steepness.
  const n = Math.log(share / (1 - share)) / Math.log(STEEP_PROBE);
  return {
    steepness : Math.max(
        0, Math.min(state.capabilities?.steepnessSteps ?? 0, Math.round(Math.log2(Math.max(1, n)))))
  };
}
export const GROWTH = 'growth';
const CURVE = Object.freeze(
    {width : 260, height : 150, left : 36, right : 250, top : 14, bottom : 112, points : 80});
function effectCurve(state, receptor, effect, target = null) {
  const maturity = receptor.substance === HORMONES.levels && effect !== GROWTH;
  const [halfMin, halfMax] = state.capabilities?.halfRange ?? [ receptor.half, receptor.half ];
  const scale = effect === GROWTH ? GROWTH_SCALE : EFFECT_SCALE[effect] ?? SHARE_SCALE;
  const response = c =>
      effect === GROWTH ? Math.min(1, receptor.sensitivity * bound(receptor, c))
                        : clamp(receptor.baseline + receptor.sensitivity * bound(receptor, c), -1);
  const at = i =>
      maturity ? i / CURVE.points : halfMin * Math.pow(halfMax / halfMin, i / CURVE.points);
  const x = i => CURVE.left + (CURVE.right - CURVE.left) * i / CURVE.points;
  const y = v =>
      CURVE.bottom - (CURVE.bottom - CURVE.top) * (v - scale.low) / (scale.high - scale.low);
  const points = Array
                     .from({length : CURVE.points + 1},
                           (_, i) => fixed(x(i)) + ',' + fixed(y(scale.value(response(at(i))))))
                     .join(' ');
  let marks = '';
  if (scale.low < 0 && scale.high > 0)
    marks += '<path class="aid-chart-zero" d="M' + CURVE.left + ' ' + fixed(y(0)) + ' H' +
             CURVE.right + '"/>';
  if (effect === HORMONE_EFFECT.death)
    marks += '<rect class="aid-death-zone" x="' + CURVE.left + '" y="' + CURVE.top + '" width="' +
             (CURVE.right - CURVE.left) + '" height="' + fixed(y(DEATH_RESPONSE) - CURVE.top) +
             '"/>';
  const text = (value, px, py, anchor = 'start') => '<text x="' + px + '" y="' + py +
                                                    '" text-anchor="' + anchor + '">' +
                                                    escapeText(value) + '</text>';
  const unit = effect === GROWTH ? label('inspector.growth') : label('effects.' + effect);
  return '<svg viewBox="0 0 ' + CURVE.width + ' ' + CURVE.height + '" class="aid-response-chart"' +
         (target ? ' data-receptor-curve="' + escapeText(target) + '"' : '') + '>' + marks +
         '<path class="aid-chart-axis" d="M' + CURVE.left + ' ' + CURVE.top + ' V' + CURVE.bottom +
         ' H' + CURVE.right + '"/>' +
         '<polyline class="aid-response-line" points="' + points + '"/>' +
         text(String(scale.high), CURVE.left - 4, CURVE.top + 4, 'end') +
         text(String(scale.low), CURVE.left - 4, CURVE.bottom, 'end') +
         text(maturity ? '0' : String(halfMin), CURVE.left, CURVE.bottom + 14) +
         text('1', CURVE.right, CURVE.bottom + 14, 'end') +
         text(maturity ? label('inspector.maturity') : label('inspector.concentration'),
              (CURVE.left + CURVE.right) / 2, CURVE.bottom + 14, 'middle') +
         text(unit, CURVE.left + 4, CURVE.top + 10) +
         (target ? curveHandles(state, receptor, effect, target) : '') + '</svg>';
}
const substanceColour = index => hormoneColors[index] ?? 'currentColor';
// A cell's life phase on the maturity axis: its output over maturity and, past its end, the
// permanent death (lifePhase in model/document.js). Two marks on the axis set where it starts
// working and where it dies; a mark moved within PHASE_OPEN of its end of the axis leaves that
// side open.
const PHASE_OPEN = .05;
export function phasePatch(handle, fx) {
  const m = clamp((fx * CURVE.width - CURVE.left) / (CURVE.right - CURVE.left));
  return handle === 'start' ? {start : m < PHASE_OPEN ? null : m}
                            : {end : m > 1 - PHASE_OPEN ? null : Math.max(PHASE_OPEN, m)};
}
// How much of a substance a measurement doses: a share from none to all.
export const measureReading = level => Math.round(level * PERCENT) + '\u00a0%';
// Measured organ drives that changed by more than MEASURE_SHOWN, at most MEASURE_ROWS of them.
const MEASURE_SHOWN = .005, MEASURE_ROWS = 6;
function measurement(state, index) {
  let html = '<div class="aid-measure"><span class="aid-measure-title">' +
             label('hormoneCard.probe') + '</span><div class="aid-measure-dose">' +
             '<label class="aid-dial"><span>' + label('inspector.measureLevel') +
             '</span><input type="range" data-measure-level min="0" max="1" step=".01" value="' +
             fixed(state.measureLevel) + '"/><output>' + measureReading(state.measureLevel) +
             '</output></label>' +
             '<button class="aid-secondary" data-measure>' + label('inspector.measure') +
             '</button></div>';
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
                    '" style="--share:' + fixed(Math.min(1, Math.abs(r.value))) + '"></span>' +
                    '<output>' + (r.value > 0 ? '+' : '') + fixed(r.value) + '</output></div>')
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
        output.active ? clamp(output.baseline + output.sensitivity * bound(output, c), -1) : 1;
    return (1 + r) / 2;
  };
  const x = m => CURVE.left + (CURVE.right - CURVE.left) * m,
        y = v => CURVE.bottom - (CURVE.bottom - CURVE.top) * v;
  const points = Array.from({length : CURVE.points + 1}, (_, i) => i / CURVE.points)
                     .map(m => fixed(x(m)) + ',' + fixed(y(level(m))))
                     .join(' ');
  const dead = phase.end === null
                   ? ''
                   : '<rect class="aid-death-zone" x="' + fixed(x(phase.end)) + '" y="' +
                         CURVE.top + '" width="' + fixed(CURVE.right - x(phase.end)) +
                         '" height="' + (CURVE.bottom - CURVE.top) + '"/>';
  const text = (value, px, py, anchor = 'start') => '<text x="' + px + '" y="' + py +
                                                    '" text-anchor="' + anchor + '">' +
                                                    escapeText(value) + '</text>';
  // A mark: a line across the chart to grab, a pointer onto the axis.
  const mark = (handle, value, open, title) => {
    const at = fixed(x(value ?? open)), line = ' x1="' + at + '" y1="' + CURVE.top + '" x2="' + at +
                                               '" y2="' + CURVE.bottom + '"';
    return '<g class="aid-phase-mark' + (value === null ? ' open' : '') + '" data-phase-handle="' +
           handle + '"><title>' + label(title) + '</title><line class="aid-phase-grip"' + line +
           '/><line' + line + '/><path d="M' + at + ' ' + CURVE.bottom + ' l-8 -14 h16 Z"/></g>';
  };
  return '<section class="aid-life-phase">' + heading(label('inspector.lifePhase')) +
         '<svg viewBox="0 0 ' + CURVE.width + ' ' + CURVE.height +
         '" class="aid-response-chart" data-phase="' + escapeText(focus.id) + '">' + dead +
         '<path class="aid-chart-axis" d="M' + CURVE.left + ' ' + CURVE.top + ' V' + CURVE.bottom +
         ' H' + CURVE.right + '"/>' +
         '<polyline class="aid-response-line" points="' + points + '"/>' +
         text('100 %', CURVE.left - 4, CURVE.top + 4, 'end') +
         text('0', CURVE.left - 4, CURVE.bottom, 'end') + text('0', CURVE.left, CURVE.bottom + 14) +
         text('1', CURVE.right, CURVE.bottom + 14, 'end') +
         text(label('inspector.maturity'), (CURVE.left + CURVE.right) / 2, CURVE.bottom + 14,
              'middle') +
         text(label('effects.' + HORMONE_EFFECT.output), CURVE.left + 4, CURVE.top + 10) +
         mark('start', phase.start, 0, 'inspector.phaseStart') +
         mark('end', phase.end, 1, 'inspector.phaseEnd') + '</svg>' +
         '<div class="aid-range-hints"><span>' + label('inspector.phaseStart') + '</span><span>' +
         label('inspector.phaseEnd') + '</span></div></section>';
}
// The substance wheel shared by glands, the blood sense and receptors (wheelPlace in
// model/document.js): a profile binds the blood substances near its point with a halo of width
// sigma, and each substance's fill shows how strongly. Substances in `choices` can be clicked to
// set `attribute`; with `pad` (a center id) the profile point can be dragged anywhere. A profile
// reads only the first `reads` substances: growth and glands the hormones, receptors maturity too.
// Under the wheel a track sets the width, from binding one substance to many, so no handle lies on
// the substances' marks.
export const WHEEL = Object.freeze({
  size : 150,
  height : 176,
  centre : 75,
  radius : 51,
  point : 11,
  ring : 15,
  track : [ 34, 116 ],
  track_y : 162
});
// Where a point (x, y from -1 to 1) lies on the wheel. A pad wheel's profile is active, so it
// always shows its track and is HEIGHT high: the pointer (fractions of the wheel) sets its point.
const wheelX = x => WHEEL.centre + x * WHEEL.radius, wheelY = y => WHEEL.centre - y * WHEEL.radius;
export const wheelPatch = (fx, fy) => ({
  q1 : clamp((fx * WHEEL.size - WHEEL.centre) / WHEEL.radius, -1),
  q2 : clamp((WHEEL.centre - fy * WHEEL.height) / WHEEL.radius, -1)
});
export const wheelMarks = center => pointMarks({x : wheelX(center.q1), y : wheelY(center.q2)});
// The width at a fraction of the wheel's width along its track.
export const wheelTrackWidth = fx => trackShare(fx * WHEEL.size, WHEEL.track);
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
function substanceWheel(state, profile, {
  choices = [],
  attribute = '',
  extra = '',
  pad = null,
  selected = null,
  reads = Infinity,
  widthTarget = null
}) {
  const wheel = state.capabilities;
  if (!wheel)
    return '';
  const px = x => fixed(wheelX(x)), py = y => fixed(wheelY(y));
  const clickable = new Set(choices);
  // Only the design's substances and the body's signals the profile can read show: an empty
  // place on the wheel offers nothing.
  const named = new Set(state.document.substances.map(sub => sub.index));
  const points = Array.from({length : wheel.bloodSubstances}, (_, index) => {
    if (index >= reads || (index < HORMONES.levels && !named.has(index)))
      return '';
    const [x, y] = wheelPlace(wheel, index), name = substanceName(state, index);
    const bound = profile.active && index < reads
                      ? wheelAffinity(wheel, profile.x, profile.y, profile.width, index)
                      : 0;
    const open = clickable.has(index);
    return '<g class="aid-wheel-point' + (open ? '' : ' fixed') +
           (index >= HORMONES.levels ? ' body' : '') + (selected === index ? ' active' : '') + '"' +
           (open ? ' ' + attribute + '="' + index + '"' + extra : '') +
           ' style="--substance:' + substanceColour(index) + ';--bound:' + fixed(bound) +
           '"><circle cx="' + px(x) + '" cy="' + py(y) + '" r="' + WHEEL.point + '"/><text x="' +
           px(x) + '" y="' + py(y) + '" dy=".35em" text-anchor="middle">' +
           escapeText(substanceMark(state, index)) + '</text><title>' + escapeText(name) + ' · ' +
           Math.round(bound * 100) + ' %</title></g>';
  });
  const halo = profile.active ? '<circle class="aid-wheel-halo" cx="' + px(profile.x) + '" cy="' +
                                    py(profile.y) + '" r="' +
                                    fixed(wheelSigma(wheel, profile.width) * WHEEL.radius) + '"/>'
                              : '';
  // The profile's point as a ring around it, under the substances, so their marks stay readable.
  const marker = pad ? '<circle class="aid-vector-point" cx="' + px(profile.x) + '" cy="' +
                           py(profile.y) + '" r="' + WHEEL.ring + '"/>'
                     : '';
  const attributes = pad           ? 'data-graphic-handle="width"'
                     : widthTarget ? 'data-wheel-width="' + escapeText(widthTarget) + '"'
                                   : '';
  const track = profile.active && attributes
                    ? widthTrack(WHEEL.track, WHEEL.track_y, profile.width, attributes,
                                 label('inspector.receptorWidth'))
                    : '';
  return '<svg class="aid-substance-wheel"' +
         (pad ? ' data-vector-pad="' + escapeText(pad) + '" data-wheel tabindex="0"' : '') +
         ' viewBox="0 0 ' + WHEEL.size + ' ' + (track ? WHEEL.height : WHEEL.size) +
         '" role="img" aria-label="' + label('inspector.hormoneProfile') + '"><circle cx="' +
         WHEEL.centre + '" cy="' + WHEEL.centre + '" r="' + WHEEL.radius +
         '" class="aid-wheel-ring"/>' + halo + marker + points.join('') + track + '</svg>';
}
// A receptor's profile on the wheel: its substance's point and its width.
function receptorProfile(state, receptor) {
  const [x, y] = state.capabilities ? wheelPlace(state.capabilities, receptor.substance) : [ 0, 0 ];
  return {x, y, width : receptor.width, active : receptor.active};
}
// The body's growth: how much the fish may grow at each level of the substance it grows with
// (its card in the library carries the fish mark); nothing while it grows with none.
function growthEditor(state) {
  const {document : doc} = state, growth = doc.growth;
  if (!growth.active || !doc.substances.some(sub => sub.index === growth.substance))
    return '';
  return '<section class="aid-growth">' +
         heading(
             t('studio.hormoneCard.growthWith', {name : substanceName(state, growth.substance)})) +
         effectCurve(state, growth, GROWTH, GROWTH) + '</section>';
}
// The organs of some centers, a pair of organs once.
function organsOf(doc, centers) {
  const seen = new Set();
  return centers.map(c => findCenter(doc, c.id)?.organ).filter(organ => {
    if (!organ || seen.has(organ.id))
      return false;
    seen.add(organ.id);
    if (organ.pair)
      seen.add(organ.pair);
    return true;
  });
}
function hormoneInspector(state) {
  const {document : doc, selected} = state;
  let html = '<header class="aid-inspector-head"><span>' + label('sections.receptors') + '</span>' +
             heading(label('tools.hormone')) + '</header>';
  let focus = null;
  if (selected?.kind === 'center')
    focus = findCenter(doc, selected.id)?.center;
  if (selected?.kind === 'organ')
    focus = findOrgan(doc, selected.id)?.centers[0];
  if (!focus)
    return html + growthEditor(state) + '<p class="aid-hint">' + label('hormoneCard.dropHint') +
           '</p>';
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
          '</div>' + effectCurve(state, receptor, effect, focus.id + ':' + effect) +
          '<label class="aid-checkbox"><input type="checkbox" data-receptor-active="' +
          escapeText(focus.id) + '" data-receptor-effect="' + effect + '" ' +
          (receptor.active ? 'checked' : '') + '/>' + label('inspector.receptorActive') +
          '</label>' + substanceWheel(state, receptorProfile(state, receptor), {
            choices : [...doc.substances.map(sub => sub.index), HORMONES.levels ],
            attribute : 'data-receptor-substance',
            reads : state.capabilities?.regulators,
            extra : ' data-center-id="' + escapeText(focus.id) + '" data-receptor-effect="' +
                        effect + '"',
            selected : receptor.substance,
            widthTarget : focus.id + ':' + effect
          }) +
          '</div>';
  return html;
}
// Every nerve cell learns with its plasticity (quality width); its mode chooses cancelling (< 0),
// neutral or competitive (> 0) learning (colony-core/field/substrate.hh, cell_class). The pad
// sets both: across the mode, up the plasticity.
export const LEARNING_PAD = Object.freeze({width : 220, height : 120, inset : 12, marker : 7});
export function learningPatch(fx, fy) {
  const {across, up} = padValues(LEARNING_PAD, fx, fy);
  return {mode : across, qwidth : up};
}
export const learningMarks = center =>
    pointMarks(padPoint(LEARNING_PAD, center.mode, center.qwidth));
function learningPad(center) {
  const pad = LEARNING_PAD, across = pad.width - 2 * pad.inset, up = pad.height - 2 * pad.inset;
  const {x, y} = padPoint(pad, center.mode, center.qwidth);
  return '<svg class="aid-learning-pad" data-learning-pad="' + escapeText(center.id) +
         '" viewBox="0 0 ' + pad.width + ' ' + pad.height + '" tabindex="0" role="img" ' +
         'aria-label="' + label('inspector.learningMode') + '"><rect class="aid-pad-cancel" x="' +
         pad.inset + '" y="' + pad.inset + '" width="' + across / 2 + '" height="' + up +
         '"/><rect class="aid-pad-compete" x="' + (pad.inset + across / 2) + '" y="' + pad.inset +
         '" width="' + across / 2 + '" height="' + up + '"/><path d="M' + (pad.inset + across / 2) +
         ' ' + pad.inset + ' V' + (pad.height - pad.inset) +
         '"/><circle class="aid-vector-point" cx="' + fixed(x) + '" cy="' + fixed(y) + '" r="' +
         pad.marker + '"/></svg>' +
         '<div class="aid-range-hints"><span>' + label('inspector.cancelling') + '</span><span>' +
         label('inspector.neutral') + '</span><span>' + label('inspector.competing') +
         '</span></div>';
}
// How a nerve center learns, as the engine's rule runs (colony-core/field/substrate.cc): the
// weights of what it hears (its inputs) change by how much its teaching signal surprises it
// (the change of what its excitation receptor and its modulating inputs bring, against what it
// expected), times its gain (its plasticity, scaled by a hormone on its learning receptor), in
// its way (cancelling, neutral or competing); its eligibility trace credits its own activity or
// its pacemaker's play. RULE lays the drawing out: the cell, the input and output arrows, the
// teaching arrow from above and the lines below.
const RULE = Object.freeze({
  width : 300,
  height : 178,
  cx : 150,
  cy : 92,
  r : 22,
  side : 20,
  top : 26,
  gap : 8,
  line : 15,
  head : 7
});
const LEARNING_EFFECTS = Object.freeze([
  HORMONE_EFFECT.excitation, HORMONE_EFFECT.learning, HORMONE_EFFECT.eligibility,
  HORMONE_EFFECT.competition
]);
function teachersOfCenter(state, center) {
  const doc = state.document, organ = findCenter(doc, center.id)?.organ;
  const hears = new Set([ center.id, organ?.id ]);
  const links = routedLinks(doc, state.sites).filter(link => hears.has(link.to));
  const senders =
      links.map(link => findCenter(doc, link.from)?.center ?? findOrgan(doc, link.from)?.centers[0])
          .filter(Boolean);
  const modulators = senders.filter(c => c.role === 'nerve' && c.modulator > .5);
  const hormones = state.capabilities
                       ? doc.substances
                             .map(sub => ({
                                    substance : sub,
                                    effects : boundEffects(center, sub.index, state.capabilities)
                                                  .filter(e => LEARNING_EFFECTS.includes(e))
                                  }))
                             .filter(entry => entry.effects.length)
                       : [];
  return {inputs : senders.length - modulators.length, modulators, hormones};
}
function learningRule(state, center) {
  const R = RULE, {inputs, modulators, hormones} = teachersOfCenter(state, center);
  const words = (key, values) => escapeText(t('studio.learnRule.' + key, values));
  const arrow = (x1, y1, x2, y2) => {
    const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    return '<path class="aid-rule-arrow" d="M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2 + ' M' +
           fixed(x2 - R.head * (ux + uy * .6)) + ' ' + fixed(y2 - R.head * (uy - ux * .6)) + ' L' +
           x2 + ' ' + y2 + ' L' + fixed(x2 - R.head * (ux - uy * .6)) + ' ' +
           fixed(y2 - R.head * (uy + ux * .6)) + '"/>';
  };
  const mode = center.mode > 1 / 3 ? 'competing' : center.mode < -1 / 3 ? 'cancelling' : 'neutral';
  const teaches =
      modulators.length || hormones.some(h => h.effects.includes(HORMONE_EFFECT.excitation));
  const svg =
      '<svg class="aid-learning-rule" viewBox="0 0 ' + R.width + ' ' + R.height +
      '" role="img" aria-label="' + label('inspector.learning') + '">' +
      arrow(R.side, R.cy, R.cx - R.r - R.gap, R.cy) +
      arrow(R.cx + R.r + R.gap, R.cy, R.width - R.side, R.cy) + '<g class="' +
      (teaches ? 'aid-rule-teach' : 'aid-rule-teach none') + '">' +
      arrow(R.cx, R.top, R.cx, R.cy - R.r - R.gap) + '<text x="' + R.cx + '" y="' +
      (R.top - R.gap) + '" text-anchor="middle">' + words('teaching') + '</text></g>' +
      '<circle class="aid-rule-cell" cx="' + R.cx + '" cy="' + R.cy + '" r="' + R.r + '"/>' +
      '<text x="' + R.side + '" y="' + (R.cy - R.gap) + '">' + words('inputs', {n : inputs}) +
      '</text><text x="' + (R.width - R.side) + '" y="' + (R.cy - R.gap) + '" text-anchor="end">' +
      words('output') + '</text><text x="' + R.cx + '" y="' + (R.cy + R.r + R.line + R.gap) +
      '" text-anchor="middle">' + words('gain', {n : Math.round(center.qwidth * PERCENT)}) + ' · ' +
      escapeText(label('inspector.' + mode)) + '</text></svg>';
  const teacherRows =
      modulators
          .map(c => '<button data-select-center="' + escapeText(c.id) + '">' +
                    escapeText(centerTitle(c)) + '<small class="aid-bound-effect">' +
                    words('modulator') + '</small></button>')
          .join('') +
      hormones
          .map(({substance, effects}) =>
                   '<button data-select-substance="' + substance.index + '" style="--substance:' +
                   substanceColour(substance.index) + '"><span class="aid-substance-swatch">' +
                   '</span>' + escapeText(substance.name || substanceName(state, substance.index)) +
                   effects
                       .map(e => '<small class="aid-bound-effect">' +
                                 escapeText(tList('studio.learnRule.parts')[e]) + '</small>')
                       .join('') +
                   '</button>')
          .join('');
  return '<section class="aid-learning">' + heading(label('inspector.learning')) + svg +
         '<div class="aid-teachers">' + heading(words('teachers')) +
         (teacherRows ? '<div class="aid-teacher-list">' + teacherRows + '</div>'
                      : '<div class="aid-empty-centre">' + words('noTeacher') + '</div>') +
         '</div></section>';
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
  html += heading(centerTitle(chosen)) + learningRule(state, chosen) +
          heading(label('inspector.learningMap')) + learningPad(chosen);
  const effect = LEARNING_EFFECTS.includes(state.effect) ? state.effect : HORMONE_EFFECT.learning;
  const receptor = chosen.receptors?.[effect];
  if (!receptor)
    return html;
  html += heading(t('studio.learnRule.byHormone')) + '<div class="aid-effect-chips">' +
          LEARNING_EFFECTS
              .map(value => '<button data-effect="' + value + '" class="' +
                            (effect === value ? 'active' : '') + '">' +
                            escapeText(tList('studio.learnRule.parts')[value]) + '</button>')
              .join('') +
          '</div>' + effectCurve(state, receptor, effect, chosen.id + ':' + effect) +
          '<label class="aid-checkbox"><input type="checkbox" data-receptor-active="' +
          escapeText(chosen.id) + '" data-receptor-effect="' + effect + '" ' +
          (receptor.active ? 'checked' : '') + '/>' + label('inspector.receptorActive') +
          '</label>' + substanceWheel(state, receptorProfile(state, receptor), {
            choices : [...doc.substances.map(sub => sub.index), HORMONES.levels ],
            attribute : 'data-receptor-substance',
            reads : state.capabilities?.regulators,
            extra : ' data-center-id="' + escapeText(chosen.id) + '" data-receptor-effect="' +
                        effect + '"',
            selected : receptor.substance,
            widthTarget : chosen.id + ':' + effect
          });
  return html;
}
// A module: its parts, then what can be done with it as a whole: keep it in the library, add its
// mirror image when it lies on one side only, dissolve it into its parts, or remove it.
function assemblyInspector(state, assembly) {
  const doc = state.document;
  return '<header class="aid-inspector-head"><span>' + label('sections.module') + '</span>' +
         '<input class="aid-inline-name aid-inline-title" data-assembly-name="' +
         escapeText(assembly.id) + '" value="' + escapeText(moduleName(doc, assembly)) +
         '" maxlength="40" aria-label="' + label('inspector.moduleName') + '"></header>' +
         '<div class="aid-assembly-list">' +
         assembly.organIds
             .map(id => {
               const organ = findOrgan(state.document, id);
               return organ ? '<button data-select-organ="' + escapeText(id) + '">' +
                                  icon(organ.type, 22) +
                                  escapeText(organTitle(organ, state.sites)) + '</button>'
                            : '';
             })
             .join('') +
         '</div>' +
         (oneSided(doc, state.sites, assembly)
              ? '<p class="aid-hint">' + label('inspector.oneSided') + '</p>' +
                    '<button class="aid-wide" data-mirror-assembly="' + escapeText(assembly.id) +
                    '">' + label('inspector.mirror') + '</button>'
              : '<p class="aid-hint">' + label('inspector.bothSides') + '</p>') +
         '<div class="aid-button-group aid-module-actions"><button data-save-assembly="' +
         escapeText(assembly.id) + '">' + label('inspector.saveModule') + '</button>' +
         '<button data-ungroup-assembly="' + escapeText(assembly.id) + '">' +
         label('inspector.ungroup') + '</button>' +
         '<button class="aid-danger" data-remove-assembly="' + escapeText(assembly.id) + '">' +
         label('inspector.removeModule') + '</button></div>';
}
function multiInspector(state) {
  const chosen = [...state.multi ].flatMap(id => {
    const organ = findOrgan(state.document, id);
    if (organ)
      return [ {id, kind : 'organ', type : organ.type, name : organTitle(organ, state.sites)} ];
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
    return '<header class="aid-inspector-head">' + heading(label('sections.empty')) + '</header>' +
           workflow();
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
function paletteItem(kind, name, type, key, title = name) {
  return '<button class="aid-palette-tile" draggable="true" data-drag-kind="' + type +
         '" data-drag-value="' + escapeText(key) + '" title="' + escapeText(title) + '">' +
         '<span class="aid-palette-icon" style="--organ-color:' + tone(kind) + '">' + icon(kind) +
         '</span><span>' + escapeText(name) + '</span></button>';
}
export function library(state) {
  const categories = [ 'senses', 'regions', 'internal', 'motor', 'reproduction' ];
  let html = '<div class="aid-library-intro">' + heading(label('app.parts')) + '</div>';
  for (const category of categories) {
    html += '<section class="aid-library-section"><h4>' + label('sections.' + category) +
            '</h4><div class="aid-palette-grid">' +
            ORGANS.filter(o => o.category === category)
                .map(o => o.category === 'regions'
                              ? paletteItem(o.key, regionTerm(o.key), 'organ', o.key,
                                            label('organs.' + o.key).replace(/\u00ad/g, '') + ': ' +
                                                label('regions.' + o.key + '.purpose'))
                              : paletteItem(o.key, label('organs.' + o.key), 'organ', o.key))
                .join('') +
            '</div></section>';
  }
  html +=
      '<section class="aid-library-section"><h4>' + label('sections.nerves') +
      '</h4><div class="aid-palette-grid">' +
      NEURONS.map(n => paletteItem('brain', label('centers.' + n.key), 'neuron', n.key)).join('') +
      '</div></section><section class="aid-library-section"><h4>' + label('sections.modules') +
      '</h4><div class="aid-palette-grid">' +
      // A built-in module shows its brain region and says on hover what it does.
      MODULES
          .map(m => paletteItem(m.organs.find(type => ORGAN_BY_KEY[type].category === 'regions') ??
                                    m.organs[0],
                                label('modules.' + m.key), 'module', m.key,
                                label('modules.' + m.key) + ': ' + label('modulePurpose.' + m.key)))
          .join('') +
      (state.userModules ?? [])
          .map(m => paletteItem(m.organs[0]?.type ?? 'brain', m.name, 'user-module', m.id))
          .join('') +
      '</div><p class="aid-hint">' + label('inspector.moduleHow') + '</p></section>';
  return html;
}
// The hormone tool's library: a card for each substance, the chosen one open, and one for the
// body's own signals. A card names its substance in place and shows where it comes from (its
// glands, a gland to drag onto the fish), what it can do as tiles to drag onto organs and nodes,
// which of them it acts on, whether the fish grows with it (one substance at most: the fish
// mark sits on one card) and, as a test, a dose to measure its effect with. The body's signals
// are not substances: maturity can switch cells on or let them die, the energy reserve can be
// read by a blood sense.
const HORMONE_TILES = Object.freeze([
  HORMONE_EFFECT.excitation, HORMONE_EFFECT.output, HORMONE_EFFECT.death, HORMONE_EFFECT.learning,
  HORMONE_EFFECT.eligibility, HORMONE_EFFECT.competition, HORMONE_EFFECT.rhythm
]);
const FISH_MARK = 'M3 12c3-4 7-5 11-3l5-3v12l-5-3c-4 2-8 1-11-3zM9 11h.01';
function hormoneTile(kind, value, text, title = text) {
  return '<button class="aid-hormone-tile" draggable="true" data-drag-kind="' + kind +
         '" data-drag-value="' + escapeText(value) + '" title="' + escapeText(title) + '">' +
         escapeText(text) + '</button>';
}
function substanceCard(state, substance) {
  const {document : doc, capabilities : wheel} = state, index = substance.index;
  const open = state.focusSubstance === index;
  const fallback = label('inspector.substanceName') + ' ' + String.fromCharCode(65 + index);
  const grows = growsWith(doc, index, wheel);
  const head =
      '<header><button class="aid-substance-pill" data-select-substance="' + index +
      '" aria-label="' + escapeText(fallback) + '"><span class="aid-substance-swatch"></span>' +
      '</button><input class="aid-inline-name" data-substance-name="' + index + '" value="' +
      escapeText(substance.name) + '" placeholder="' + escapeText(fallback) +
      '" maxlength="32" aria-label="' + label('inspector.substanceName') + '">' +
      '<button class="aid-growth-mark' + (grows ? ' on' : '') + '" ' +
      (grows ? 'data-growth-off' : 'data-growth-substance="' + index + '"') + ' title="' +
      label(grows ? 'hormoneCard.growsOn' : 'hormoneCard.growsOff') +
      '"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="' + FISH_MARK +
      '"/></svg></button><button class="aid-row-menu" data-remove-substance="' + index +
      '" aria-label="' + label('inspector.removeSubstance') + '">×</button></header>';
  const style = ' style="--substance:' + substanceColour(index) + '"';
  const releasing = producers(doc, index, wheel), receiving = receivers(doc, index, wheel);
  if (!open)
    return '<section class="aid-substance-card"' + style + '>' + head +
           '<button class="aid-card-summary" data-select-substance="' + index + '">' +
           escapeText(t('studio.hormoneCard.summary', {
             glands : organsOf(doc, releasing).length,
             targets : organsOf(doc, receiving).length
           })) +
           '</button></section>';
  const row = (key, body) => '<div class="aid-card-row"><span>' + label('hormoneCard.' + key) +
                             '</span><div>' + body + '</div></div>';
  const glands = organsOf(doc, releasing)
                     .map(organ => '<button data-select-organ="' + escapeText(organ.id) + '">' +
                                   icon(organ.type, 16) +
                                   escapeText(organTitle(organ, state.sites)) + '</button>')
                     .join('');
  const tiles = HORMONE_TILES
                    .map(effect => hormoneTile('effect', index + ':' + effect,
                                               tList('studio.hormoneCard.tiles')[effect]))
                    .join('');
  const targets =
      organsOf(doc, receiving)
          .map(organ => {
            const effects = new Set(organ.centers.flatMap(c => boundEffects(c, index, wheel)));
            return '<button data-select-organ="' + escapeText(organ.id) + '">' +
                   icon(organ.type, 16) + escapeText(organTitle(organ, state.sites)) +
                   [...effects ]
                       .map(e => '<small class="aid-bound-effect">' +
                                 escapeText(tList('studio.hormoneCard.tiles')[e]) + '</small>')
                       .join('') +
                   '</button>';
          })
          .join('');
  return '<section class="aid-substance-card open"' + style + '>' + head +
         row('sources', glands + hormoneTile('gland', String(index), label('hormoneCard.gland'))) +
         row('can', '<div class="aid-hormone-tiles">' + tiles + '</div>') +
         (targets ? row('acts', targets) : '') + measurement(state, index) + '</section>';
}
function bodySignalsCard() {
  const row = (key, body) => '<div class="aid-card-row"><span>' + label('hormoneCard.' + key) +
                             '</span><div>' + body + '</div></div>';
  return '<section class="aid-substance-card body"><header><strong>' + label('hormoneCard.body') +
         '</strong></header>' +
         row('maturity', hormoneTile('phase', 'start', label('hormoneCard.phaseStart')) +
                             hormoneTile('phase', 'end', label('hormoneCard.phaseEnd'))) +
         row('reserve', hormoneTile('reserve', 'blood', label('hormoneCard.reserveSense'))) +
         '</section>';
}
export function hormoneLibrary(state) {
  const doc = state.document;
  return '<div class="aid-library-intro">' + heading(label('hormoneCard.title')) + '</div>' +
         (state.capabilities ? doc.substances.map(sub => substanceCard(state, sub)).join('') : '') +
         (doc.substances.length < HORMONES.levels
              ? '<button class="aid-secondary" data-add-substance>+ ' +
                    label('sections.newSubstance') + '</button>'
              : '') +
         bodySignalsCard();
}
// The way through the Atelier, step by step; a step with a tool switches to it.
const WORKFLOW = Object.freeze([ 'select', 'wire', 'hormone', 'learn', 'stimulate' ]);
function workflow() {
  return '<ol class="aid-workflow">' +
         WORKFLOW
             .map(key => '<li><button type="button" data-tool="' + key + '" title="' +
                         label('tools.' + key) +
                         '"><svg width="20" height="20" viewBox="0 0 24 24" ' +
                         'aria-hidden="true"><path d="' + TOOL_ICON[key] +
                         '" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" ' +
                         'stroke-linejoin="round" fill="none"/></svg></button><span>' +
                         label('workflow.' + key) + '</span></li>')
             .join('') +
         '<li><span class="aid-workflow-mark">→</span><span>' + label('workflow.develop') +
         '</span></li></ol>';
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
