import {visionInspector} from './vision.js';
import {effectorGraphic, gutGraphic, spineField} from './effectors.js';
import {lateralField} from './lateral.js';
import {probeField} from './probes.js';
import {pigmentInspector} from './pigments.js';
import {scentMap} from './scents.js';
import {ANATOMY, ATELIER_LIMITS, MOTOR_KIND, SENSE_KIND} from '../../schema.js';
import {clamp, degrees, radians} from '../../units.js';
import {adaptationElement, sensitivityElement, stimulusShare} from './sensitivity.js';
import {stimulusPicture} from './stimuli.js';
import {scentColors} from '../../brain_model.js';
import {driveElement} from './drive.js';
import {contactFieldOf, contactHalfAngle, preferredScent} from '../../tuning.js';
import {functionFor, isRegion, MUSCLE_LABEL_INDEX, ORGAN_BY_KEY} from '../model/organs.js';
import {
  allCenters,
  contactBundle,
  findAssembly,
  findCenter,
  findOrgan,
  groupReport,
  wiredCrossing
} from '../model/document.js';
import {modulesOf, oneSided} from '../model/assemblies.js';
import {escapeText, fixed, glyph, padPoint, padValues, pointMarks, pointText} from './markup.js';
import {findSite, onMidline, sideIndex} from '../model/layout.js';
import {
  formatNumber,
  formatSigned,
  joinParts,
  linkText,
  namedText,
  percent,
  t,
  tList
} from '../../strings.js';
import {heading, icon, ICON, iconCells, label, regionTerm} from './kit.js';
import {pairingButton, regionSettings, slotsSection} from './circuit.js';
import {chemistry, glandProfile, hormoneInspector, hormonePad} from './substances.js';
import {learningInspector} from './learning.js';
import {workflow} from './library.js';
import {centerTitle, endpointTitle, moduleName} from './names.js';
import {organTitle} from './names.js';
import {bladderGraphic, pressureGraphic, pressureNote} from './sacs.js';

// A touch or pain cell's field: a sector of its half angle on a ring around the cell, ahead
// upwards, with a handle on its edge; the pointer's direction from the cell sets the half angle.
const CONTACT_PAD = Object.freeze({size : 140, centre : 70, radius : 53, cell : 5, handle : 6});
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
                   '>' + glyph(MUSCLE_ICON[code], ICON.muscle) + '<span>' +
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
export const biasScale = state => state.capabilities?.biasScale ?? 0;
// What an effector's activity does above and below zero: a bladder fills and empties, a gland
// secretes and binds, the others work or do nothing.
function driveMeaning(state, center) {
  const site = findSite(state.sites, center.site);
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
// Each organ's own graphics in its inspector, above what each of its nodes shows: a nose its
// scent map (barbels grow where the head also feels by touch on the nose's side), the sacs and
// the gut what fills them and what their pressure cells measure, effectors what they move, the
// senses what they feel. An organ without graphics of its own shows its icon and name.
const pressurePanel = (state, organ, center) =>
    pressureGraphic(state, organ, center) + pressureNote(state, organ);
const skinPanel = (state, organ, center) => contactField(center) + probeField(state, organ);
const nervePanel = (state, organ, center) => nerveProperties(state, center);
const ORGAN_PANELS = Object.freeze({
  nose : (state, organ, center) => {
    const barbels = state.anatomy?.anatomy?.[ANATOMY.smell_outer_left + sideIndex(organ.side)];
    return scentMap(organ, center) + '<p class="aid-hint">' +
           label(barbels > 0 ? 'inspector.barbelsGrown' : 'inspector.barbelsHint') + '</p>' +
           probeField(state, organ);
  },
  pigment : (state, organ, center) => pigmentInspector(state, organ, center),
  gut : (state, organ, center) => gutGraphic(state, organ, center) + pressureNote(state, organ),
  bladder : (state, organ, center) => bladderGraphic(organ, center) + pressureNote(state, organ),
  muscle : (state, organ) => effectorGraphic(state, organ),
  defense : (state, organ) => effectorGraphic(state, organ) + spineField(state, organ),
  gland : (state, organ, center) => glandProfile(state, center),
  eggs : pressurePanel,
  sperm : pressurePanel,
  lateral : (state, organ) => lateralField(state, organ) + probeField(state, organ),
  touch : skinPanel,
  pain : skinPanel,
  blood : (state, organ, center) => hormonePad(state, center),
  brain : nervePanel
});
const organMetric = (state, organ) => '<div class="aid-organ-metric">' +
                                      icon(organ.type, ICON.metric) + '<span>' +
                                      escapeText(organTitle(organ)) + '</span></div>';
const organPanel = (state, organ, center) => (
    ORGAN_PANELS[organ.type] ?? (isRegion(organ) ? nervePanel : organMetric))(state, organ, center);
// An organ that recruits nodes sets them and their strength on its graphic; a sac sets its
// growth cells on its own and their strength here; other effectors make no more cells, only
// stronger ones.
const SACS = Object.freeze([ 'eggs', 'sperm' ]);
const cellCount = (organ, center) =>
    ORGAN_BY_KEY[organ.type]?.nodes && !SACS.includes(organ.type)
        ? ''
        : '<div class="aid-cell-count-title">' +
              label(center.role === 'motor' ? 'inspector.strength' : 'inspector.count') +
              ' <strong>' + center.copies + '</strong></div>' + iconCells(center.copies, center.id);
// What a node answers: a sense cell to its stimulus and as it adapts; an effector's drive (a
// muscle's also what it does); a nerve center rests, answers and fades, a pacemaker beats.
const section = (title, body) =>
    '<section class="aid-eye-section"><h4>' + title + '</h4>' + body + '</section>';
const sensorSection = (state, organ, center) =>
    section(escapeText(t('studio.inspector.answerTo', {stimulus : stimulusName(state, center)})),
            sensorAnswer(state, center) + sensorAdaptation(state, center));
const motorSection = (state, organ, center) =>
    section(label('inspector.drive'),
            driveElement(center, label('inspector.drive'), n => t('studio.inspector.recovery', {n}),
                         {scale : biasScale(state), meaning : driveMeaning(state, center)})) +
    (organ.type === 'muscle' ? muscleKind(state, center) : '');
function nerveSection(state, organ, center) {
  const rhythm = center.key === 'pacemaker';
  const title = label(rhythm ? 'inspector.beat' : 'inspector.afterglow');
  return section(
      title,
      driveElement(center, title,
                   n => t(rhythm ? 'studio.inspector.beatSteps' : 'studio.inspector.fades', {n}),
                   {scale : biasScale(state), rhythm}));
}
const ROLE_SECTIONS = Object.freeze({sensor : sensorSection, motor : motorSection});
function organSettings(state, organ, center) {
  if (!center)
    return '<div class="aid-empty-centre">' + label('sections.empty') + '</div>';
  if (organ.field)
    return visionInspector(state, organ);
  if (isRegion(organ) && state.selected?.kind !== 'center')
    return regionSettings(state, organ);
  return organPanel(state, organ, center) +
         (center.role === 'nerve' ? outgoingField(state, center) : '') + cellCount(organ, center) +
         (ROLE_SECTIONS[center.role] ?? nerveSection)(state, organ, center);
}
// What a sensory center's cells sense: the kind of stimulus its answer is drawn over, named.
function stimulusKind(state, center) {
  const site = findSite(state.sites, center.site);
  return site ? functionFor(center, site) : -1;
}
const stimulusName = (state, center) =>
    tList('studio.inspector.stimuli')[stimulusKind(state, center)] ?? '';
// How a sensory center's stimulus is drawn at a strength: its kind's picture, a nose's in the
// colour of the scent it prefers.
function stimulusDrawing(state, center) {
  const kind = stimulusKind(state, center);
  const colour = kind === SENSE_KIND.odor ? scentColors?.[preferredScent(center)] : null;
  return (share, point, title) => stimulusPicture(kind, share, point, title, colour);
}
// The axis a sensory center's stimulus runs on: from the engine's dimmest stimulus for intensity
// senses, linear for the others.
const stimulusAxis = (state, sense) => sense?.intensity ? state.anatomy?.lightDimmest : null;
// What a sensory center answers over its stimulus, drawn from the engine's curve, with the
// stimulus its adaptation is held at marked on it; while its handle is dragged, from the curve
// the drag started from.
export function sensorAnswer(state, center, shift = 1, start = null, dragged = null) {
  const sense = groupReport(state.document, state.anatomy, 'senses', center.id),
        answer = start ?? sense;
  const graphic = sensitivityElement(answer, stimulusAxis(state, answer),
                                     {sensitivity : 'center', 'sensitivity-id' : center.id},
                                     label('inspector.sensitivity'), stimulusDrawing(state, center),
                                     shift, dragged, sense?.adapt?.held);
  return '<div data-sensitivity-block="center" data-sensitivity-id="' + escapeText(center.id) +
         '">' + graphic + '</div>';
}
// How a sensory center gets used to its stimulus held from the mark above, over time, for the
// senses that adapt; the held stimulus drawn as it stays.
export function sensorAdaptation(state, center, stretch = 1, start = null) {
  const sense = groupReport(state.document, state.anatomy, 'senses', center.id),
        adapt = start ?? sense?.adapt;
  const steps =
      adapt ? t('studio.inspector.steps', {n : Math.round((adapt.response.length - 1) * stretch)})
            : '';
  const draw = stimulusDrawing(state, center),
        share = stimulusShare(adapt?.held ?? 0, stimulusAxis(state, sense)),
        title = t('studio.inspector.held', {stimulus : stimulusName(state, center)});
  const graphic = adaptationElement(adapt, {adaptation : 'center', 'adaptation-id' : center.id},
                                    label('inspector.adaptation'), steps,
                                    point => draw(share, point, title), stretch);
  return '<div data-adaptation-block data-adaptation-id="' + escapeText(center.id) + '">' +
         graphic + '</div>';
}
function nerveProperties(state, center) {
  // The chosen circuit is its type. Only controls belonging to that circuit stay editable.
  const template =
      '<div class="aid-neuron-kind">' +
      escapeText(namedText(label('inspector.template'), label('centers.' + center.key))) + '</div>';
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
  const [sign, mode, pace, modulator] = nerve;
  const row = (name, value) => '<div><span>' + name + '</span><output>' + value + '</output></div>';
  return '<section class="aid-developed-nerve">' + heading(label('inspector.developedClass')) +
         row(label('inspector.transmitter'),
             label(sign >= 0 ? 'inspector.exciting' : 'inspector.inhibiting')) +
         row(label('inspector.learningMode'), formatNumber(mode, 2, true)) +
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
                                escapeText(joinParts([ index + 1, centerTitle(c) ])) + '</button>')
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
  const other = organ.pair
                    ? '<button data-select-organ="' + escapeText(organ.pair) + '">' +
                          label('inspector.side.' + there) + '</button>'
                    : '<button class="aid-add" data-mirror-organ="' + escapeText(organ.id) + '">' +
                          t('studio.marks.more', {name : label('inspector.side.' + there)}) +
                          '</button>';
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
  const row = state.report?.contacts?.find(([ a, b ]) => a === from && b === to);
  const centers = allCenters(state.document);
  if (!row || !centers[from] || !centers[to])
    return '';
  const link = contactBundle(row), weight = link.weight;
  const polarities = [
    {count : link.positive, weight : link.positiveWeight, key : 'excitation', tone : 'excite'},
    {count : link.negative, weight : link.negativeWeight, key : 'inhibition', tone : 'inhibit'}
  ];
  return '<header class="aid-inspector-head"><span>' + label('inspector.developedLink') +
         '</span>' + heading(linkText(centerTitle(centers[from]), centerTitle(centers[to]))) +
         '</header>' +
         '<div class="aid-contact-summary"><div><strong>' + formatNumber(Number(link.count)) +
         '</strong><span>' + label('inspector.contactCount') + '</span></div><div><strong>' +
         formatSigned(weight, 2, true) + '</strong><span>' + label('inspector.meanWeight') +
         '</span></div></div>' +
         '<div class="aid-contact-polarities">' +
         polarities
             .map(item => '<div class="aid-contact-polarity ' + item.tone + '"><span>' +
                          label('inspector.' + item.key) + '</span><strong>' +
                          formatNumber(item.count) + '</strong><small>' +
                          formatSigned(item.weight, 2, true) + '</small></div>')
             .join('') +
         '</div>';
}
// A wire's search field: its halo grows from LEAST around its source by REACH at full spread,
// within the field's BOUNDARY; the pointer's distance from the source sets the spread.
const WIRE_PAD = Object.freeze(
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
const OUTPUT_PAD = Object.freeze({width : 150, height : 150, inset : 15, round : 12, marker : 8});
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
         heading(linkText(endpointTitle(doc, wire.from, state.sites),
                          endpointTitle(doc, wire.to, state.sites))) +
         '</header>' +
         (wire.pairing ? '<div class="aid-wire-pairing">' + pairingButton(wire) + '</div>' : '') +
         '<div class="aid-wire-parameters">' + wireField(wire) +
         '</div><button class="aid-danger" data-remove-wire="' + escapeText(wire.id) + '">' +
         label('inspector.removeWire') + '</button>';
}
// A module: its parts, then what can be done with it as a whole: keep it in the library, add its
// mirror image when it lies on one side only, dissolve it into its parts, or remove it.
function assemblyInspector(state, assembly) {
  const doc = state.document;
  return '<header class="aid-inspector-head"><span>' + label('sections.module') + '</span>' +
         '<input class="aid-inline-name aid-inline-title" data-assembly-name="' +
         escapeText(assembly.id) + '" value="' + escapeText(moduleName(doc, assembly)) +
         '" maxlength="' + ATELIER_LIMITS.max_name + '" aria-label="' +
         label('inspector.moduleName') + '"></header>' +
         '<div class="aid-assembly-list">' +
         assembly.organIds
             .map(id => {
               const organ = findOrgan(state.document, id);
               return organ ? '<button data-select-organ="' + escapeText(id) + '">' +
                                  icon(organ.type, ICON.part) +
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
         heading(t('studio.app.partCount', {n : chosen.length})) +
         '</header><div class="aid-assembly-list">' +
         chosen
             .map(part => '<button data-select-' + part.kind + '="' + escapeText(part.id) + '">' +
                          icon(part.type, ICON.part) + escapeText(part.name) + '</button>')
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
    const assembly = findAssembly(state.document, selected.id);
    return assembly ? assemblyInspector(state, assembly) : '';
  }
  const organ = selected.kind === 'organ' ? findOrgan(state.document, selected.id)
                                          : findCenter(state.document, selected.id)?.organ;
  return organ ? organInspector(state, organ) : '';
}
