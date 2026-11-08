import {fishOutline} from './body.js';
import {nodeLocation, organLocation, showsNodes} from './places.js';
import {fixed, placedGlyph} from './markup.js';
import {HORMONE_EFFECT} from '../../schema.js';
import {BODY_SIGNAL, DIRECTION_ICON, EFFECT_ICON, PHASE_ICON} from './icons.js';
import {CATEGORY_TONE} from './names.js';
import {isModulator} from '../model/organs.js';
import {routedLinks} from '../model/regions.js';
import {EFFECT_ORDER} from './effects.js';
import {substanceColor} from '../../hormones.js';
import {
  allCenters,
  boundEffects,
  birthAffinity,
  effectDirection,
  endpointCenters,
  findCenter,
  growsWith,
  isLearner,
  lifePhase,
  LEARNING_EFFECTS,
  NOTICEABLE_AFFINITY,
  producers,
  receivers,
  receptorAffinity,
  teachersOf,
  wheelAffinity,
  shownSubstance
} from '../model/document.js';
import {pathTo} from './wires.js';
import {steadyAt, zoomOf} from './frame.js';
import {layerShown} from './layers.js';

const HORMONE_GLYPH = Object.freeze({
  producer : 16,
  receiver : 12,
  teach : 1.5,
  puffs : 3,
  symbol : 11,
  symbol_gap : 2,
  arrow : .6,
  corner : .7,
  lift : .3,
  above : 1.9,
  faintest : .28
});
const symbolsAbove = (symbols, r) => {
  const G = HORMONE_GLYPH, step = G.symbol + G.symbol_gap + G.symbol * G.arrow;
  return symbols
      .map(({path, direction}, k) => {
        const x = (k - (symbols.length - 1) / 2) * step, y = -r * G.above;
        return placedGlyph(path, G.symbol, {x, y}) +
               (direction
                    ? '<g class="aid-direction">' +
                          placedGlyph(DIRECTION_ICON[direction > 0 ? 'rises' : 'falls'],
                                      G.symbol * G.arrow,
                                      {x : x + G.symbol * G.corner, y : y - G.symbol * G.lift}) +
                          '</g>'
                    : '');
      })
      .join('');
};
const HORMONE_WAY = Object.freeze({curve : 17, faintest : .1, span : .33});
function hormoneGlyph(item, kind, color, zoom) {
  const G = HORMONE_GLYPH, r = kind === 'producer' ? G.producer : G.receiver;
  const cloud = kind === 'producer' && !item.quiet
                    ? '<g class="aid-hormone-cloud">' +
                          Array.from({length : G.puffs}, () => '<circle r="' + r + '"/>').join('') +
                          '</g>'
                    : '';
  const symbols =
      kind === 'receiver'
          ? symbolsAbove(
                (item.effects ?? []).map((e, k) => ({
                                           path : e === 'birth' ? PHASE_ICON.start : EFFECT_ICON[e],
                                           direction : item.directions?.[k] ?? 0
                                         })),
                r)
          : '';
  const acts = kind === 'receiver'
                   ? EFFECT_ORDER.find(e => item.teach ? e === HORMONE_EFFECT.teaching
                                                       : (item.effects ?? []).includes(e))
                   : undefined;
  return '<g class="aid-hormone-' + kind + (item.teach ? ' teach' : '') +
         (acts === undefined ? '' : ' acts-' + acts) + '"' + steadyAt(item.pos, zoom) +
         ' style="--hormone:' + color +
         ';opacity:' + fixed(G.faintest + (1 - G.faintest) * item.affinity) + '">' + cloud +
         '<circle class="aid-hormone-aura" r="' + r + '"/>' +
         (item.teach ? '<circle class="aid-hormone-teach" r="' + fixed(r * G.teach) + '"/>' : '') +
         '<circle class="aid-hormone-core' + (item.focus ? ' focused' : '') + '" r="' +
         fixed(r / 2) + '"/>' +
         (symbols ? '<g class="aid-hormone-symbols">' + symbols + '</g>' : '') + '</g>';
}
const WORD_GAP = 60;
function worded(items, zoom) {
  const speaking = [];
  return [...items ].sort((a, b) => a.pos.y - b.pos.y).map(item => {
    const quiet = speaking.some(
        other => Math.hypot(other.pos.x - item.pos.x, other.pos.y - item.pos.y) * zoom < WORD_GAP);
    if (!quiet)
      speaking.push(item);
    return {...item, quiet};
  });
}
const nearest = (sources, pos) =>
    sources
        .reduce(
            (best, item) => {
              const distance = Math.hypot(item.pos.x - pos.x, item.pos.y - pos.y);
              return !best || distance < best.distance ? {item, distance} : best;
            },
            null)
        ?.item;
const TEACHING = Object.freeze({ring : 13, pulse : 4, lesson : 1.6});
function teachingOverlay(state) {
  const {document : doc, sites, capabilities, selected} = state;
  if (!capabilities)
    return '';
  const zoom = zoomOf(state), links = routedLinks(doc, sites), T = TEACHING;
  const located = id => {
    const hit = findCenter(doc, id);
    return hit ? nodeLocation(doc, sites, hit.center, hit.organ.type) : null;
  };
  const modulatorsOf = (center, organ) =>
      links.filter(link => link.to === center.id || link.to === organ.id)
          .map(link => endpointCenters(doc, link.from)[0])
          .filter(c => c?.role === 'nerve' && isModulator(c));
  let marks = '';
  for (const organ of doc.organs)
    for (const center of organ.centers)
      if (center.role === 'nerve' &&
          (modulatorsOf(center, organ).length || teachersOf(doc, center, capabilities).length))
        marks += '<circle class="aid-teach-mark"' + steadyAt(located(center.id), zoom) + ' r="' +
                 T.ring + '"/>';
  const found = selected?.kind === 'center' ? findCenter(doc, selected.id) : null;
  if (found?.center.role !== 'nerve')
    return marks ? '<g class="aid-hormone-overlay" pointer-events="none">' + marks + '</g>' : '';
  const target = {pos : located(found.center.id), affinity : 1};
  const lesson = (from, colour) => {
    const way = pathTo(from, target.pos, HORMONE_WAY.curve);
    return '<path class="aid-teach-way" d="' + way + '" stroke="' + colour + '"/><circle ' +
           'class="aid-teach-pulse" r="' + fixed(T.pulse / zoom) + '" fill="' + colour +
           '"><animateMotion path="' + way + '" dur="' + T.lesson +
           's" repeatCount="indefinite"/></circle>';
  };
  let html = modulatorsOf(found.center, found.organ)
                 .map(c => lesson(located(c.id), CATEGORY_TONE.brain))
                 .join('');
  for (const substance of doc.substances) {
    const effects = boundEffects(found.center, substance.index, capabilities)
                        .filter(e => LEARNING_EFFECTS.includes(e));
    if (!effects.length)
      continue;
    const color = substanceColor(substance.index),
          teaches = effects.includes(HORMONE_EFFECT.teaching);
    const sources = producers(doc, substance.index, capabilities)
                        .map(c => ({pos : located(c.id), affinity : 1}));
    const source = nearest(sources, target.pos);
    if (source)
      html += teaches ? lesson(source.pos, color)
                      : '<path class="aid-hormone-influence" d="' +
                            pathTo(source.pos, target.pos, HORMONE_WAY.curve) + '" stroke="' +
                            color + '" opacity="' + HORMONE_WAY.faintest + '"/>';
    html +=
        worded(sources, zoom).map(item => hormoneGlyph(item, 'producer', color, zoom)).join('') +
        hormoneGlyph({
          ...target,
          teach : teaches,
          effects,
          directions : effects.map(e => effectDirection(e, found.center.receptors[e]))
        },
                     'receiver', color, zoom);
  }
  return '<g class="aid-hormone-overlay" pointer-events="none">' + marks + html + '</g>';
}
export function hormoneOverlay(state) {
  const {document : doc, sites, capabilities} = state;
  const substance = state.tool === 'hormone' ? shownSubstance(doc, state.focusSubstance) : null;
  const marks = layerShown(state, 'hormones') ? hormoneMarks(state, substance?.index ?? null) : '';
  const overlay = html =>
      html ? '<g class="aid-hormone-overlay" pointer-events="none">' + html + '</g>' : '';
  if (state.tool === 'learn')
    return teachingOverlay(state) + overlay(marks);
  if (!substance)
    return overlay(marks);
  const color = substanceColor(substance.index);
  const zoom = zoomOf(state);
  const sources = [], targets = [];
  for (const organ of doc.organs)
    for (const center of organ.centers) {
      const pos = nodeLocation(doc, sites, center, organ.type);
      if (organ.type === 'gland') {
        const affinity =
            wheelAffinity(capabilities, center.q1, center.q2, center.qwidth, substance.index);
        if (affinity >= NOTICEABLE_AFFINITY)
          sources.push({pos, affinity});
      }
      const effects = boundEffects(center, substance.index, capabilities)
                          .map(effect => ({
                                 effect,
                                 affinity : receptorAffinity(capabilities, center.receptors[effect],
                                                             substance.index)
                               }));
      if (birthAffinity(center, substance.index, capabilities) >= NOTICEABLE_AFFINITY)
        effects.push({
          effect : 'birth',
          affinity : birthAffinity(center, substance.index, capabilities),
          direction : Math.sign(center.growth.sensitivity)
        });
      if (effects.length)
        targets.push({
          pos,
          affinity : Math.max(...effects.map(item => item.affinity)),
          focus : effects.some(item => item.effect === state.effect),
          teach :
              isLearner(center) && effects.some(item => item.effect === HORMONE_EFFECT.teaching),
          effects : effects.map(item => item.effect),
          directions :
              effects.map(item => item.effect === 'birth'
                                      ? item.direction
                                      : effectDirection(item.effect, center.receptors[item.effect]))
        });
    }
  const growth = growsWith(doc, substance.index, capabilities)
                     ? '<path class="aid-hormone-body" d="' + fishOutline(state) +
                           '" style="--hormone:' + color + '"/>'
                     : '';
  const paths = targets
                    .map(target => {
                      const source = nearest(sources, target.pos);
                      if (!source)
                        return '';
                      return '<path class="aid-hormone-influence" d="' +
                             pathTo(source.pos, target.pos, HORMONE_WAY.curve) + '" stroke="' +
                             color + '" opacity="' +
                             fixed(HORMONE_WAY.faintest + HORMONE_WAY.span * target.affinity) +
                             '"/>';
                    })
                    .join('');
  return '<g class="aid-hormone-overlay" pointer-events="none">' + growth + paths +
         worded(sources, zoom)
             .map(source => hormoneGlyph(source, 'producer', color, zoom))
             .join('') +
         targets.map(target => hormoneGlyph(target, 'receiver', color, zoom)).join('') + marks +
         '</g>';
}
const MARK = Object.freeze({dot : 4, step : 17, below : 20, symbol : 13, plate : 8});
function cellMarks(state, centers, skip) {
  const {document : doc, capabilities} = state;
  const substances = doc.substances.filter(
      s => s.index !== skip &&
           centers.some(c => boundEffects(c, s.index, capabilities).length ||
                             birthAffinity(c, s.index, capabilities) >= NOTICEABLE_AFFINITY));
  const phases = [ 'start', 'end' ].filter(k => centers.some(c => lifePhase(c)[k] !== null));
  if (centers.some(c => birthAffinity(c, capabilities.hormones, capabilities) >=
                        NOTICEABLE_AFFINITY) &&
      !phases.includes('start'))
    phases.push('start');
  return [
    ...substances.map(s => ({colour : substanceColor(s.index)})),
    ...phases.map(k => ({colour : BODY_SIGNAL, icon : PHASE_ICON[k]}))
  ];
}
function hormoneMarks(state, skip = null) {
  const {document : doc, sites} = state, zoom = zoomOf(state), M = MARK;
  const mark = (m, x) =>
      m.icon ? '<g style="color:' + m.colour + '"><circle cx="' + fixed(x) + '" cy="' + M.below +
                   '" r="' + M.plate + '"/>' +
                   placedGlyph(m.icon, M.symbol, {x, y : M.below}, {line : true}) + '</g>'
             : '<circle cx="' + fixed(x) + '" cy="' + M.below + '" r="' + M.dot + '" fill="' +
                   m.colour + '"/>';
  const row = (pos, marks) =>
      marks.length
          ? '<g class="aid-hormone-marks"' + steadyAt(pos, zoom) + '>' +
                marks.map((m, k) => mark(m, (k - (marks.length - 1) / 2) * M.step)).join('') +
                '</g>'
          : '';
  return doc.organs
      .map(organ =>
               showsNodes(state, [ organ ])
                   ? organ.centers
                         .map(c => row(nodeLocation(doc, sites, c, organ.type),
                                       cellMarks(state, [ c ], skip)))
                         .join('')
                   : row(organLocation(organ, sites, doc), cellMarks(state, organ.centers, skip)))
      .join('');
}
const MEASURED_CHANGE = .01;
export function hormoneRoles(state) {
  const roles = new Map(), index = shownSubstance(state.document, state.focusSubstance)?.index;
  const wheel = state.capabilities;
  if (state.tool !== 'hormone' || !wheel || index === undefined)
    return roles;
  for (const c of receivers(state.document, index, wheel))
    roles.set(c.id, 'receives');
  for (const c of producers(state.document, index, wheel))
    roles.set(c.id, 'produces');
  const m = state.measurement;
  if (m?.substance === index)
    allCenters(state.document).forEach((c, k) => {
      if (Math.abs(m.groups[k]) > MEASURED_CHANGE)
        roles.set(c.id, m.groups[k] > 0 ? 'raised' : 'lowered');
      if (m.dead[k])
        roles.set(c.id, 'dies');
    });
  return roles;
}
