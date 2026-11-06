import {fishOutline} from './body.js';
import {nodeLocation} from './places.js';
import {fixed, placedGlyph} from './markup.js';
import {HORMONE_EFFECT} from '../../schema.js';
import {EFFECT_ICON, TEACH_ICON} from './icons.js';
import {CATEGORY_TONE} from './names.js';
import {isModulator} from '../model/organs.js';
import {routedLinks} from '../model/regions.js';
import {EFFECT_ORDER} from './effects.js';
import {substanceColor} from '../../hormones.js';
import {
  allCenters,
  boundEffects,
  endpointCenters,
  findCenter,
  growsWith,
  learners,
  LEARNING_EFFECTS,
  NOTICEABLE_AFFINITY,
  producers,
  receivers,
  receptorAffinity,
  teachersOf,
  wheelAffinity
} from '../model/document.js';
import {pathTo} from './wires.js';
import {steadyAt, zoomOf} from './frame.js';

// Where a substance acts, with the hormone tool: the glands that release it, the cells that bind
// it and learn from it, and the ways between them; with the learning tool a center's teachers.

// Glands release the substance as a cloud spreading from them (PUFFS rings); receivers carry a
// ring and above it the symbols of what the substance does to them (EFFECT_ICON); cells whose
// learning it changes a second ring, and where it excites them the teaching symbol, since their
// excitation is their teaching signal.
// A gland's glyph PRODUCER wide, a receiver's RECEIVER; a learner's second ring TEACH times as
// wide; symbols SYMBOL wide, SYMBOL_GAP apart, ABOVE the glyph; the glyph shows at least
// FAINTEST, fully where bound fully.
const HORMONE_GLYPH = Object.freeze({
  producer : 16,
  receiver : 12,
  teach : 1.5,
  puffs : 3,
  symbol : 11,
  symbol_gap : 2,
  above : 1.9,
  faintest : .28
});
const symbolsAbove = (paths, r) => {
  const G = HORMONE_GLYPH, step = G.symbol + G.symbol_gap;
  return paths
      .map((path, k) => placedGlyph(path, G.symbol,
                                    {x : (k - (paths.length - 1) / 2) * step, y : -r * G.above}))
      .join('');
};
// The way from the nearest gland to a receiver bows CURVE more than a wire, at least FAINTEST
// and up to FAINTEST + SPAN opaque by how strongly it binds.
const HORMONE_WAY = Object.freeze({curve : 17, faintest : .1, span : .33});
function hormoneGlyph(item, kind, color, zoom) {
  const G = HORMONE_GLYPH, r = kind === 'producer' ? G.producer : G.receiver;
  const cloud = kind === 'producer' && !item.quiet
                    ? '<g class="aid-hormone-cloud">' +
                          Array.from({length : G.puffs}, () => '<circle r="' + r + '"/>').join('') +
                          '</g>'
                    : '';
  const symbols = kind === 'receiver'
                      ? symbolsAbove((item.effects ?? [])
                                         .map(e => item.teach && e === HORMONE_EFFECT.excitation
                                                       ? TEACH_ICON
                                                       : EFFECT_ICON[e]),
                                     r)
                      : '';
  // A receiver plays what its strongest-placed effect does (EFFECT_ORDER), as the guide does.
  const acts = kind === 'receiver'
                   ? EFFECT_ORDER.find(e => item.teach ? e === HORMONE_EFFECT.excitation
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
// Glands close together, as a pair beside the midline, share one cloud, on the topmost: those
// within WORD_GAP screen pixels below one with a cloud stay quiet.
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
// The nearest of `sources` to a position.
const nearest = (sources, pos) =>
    sources
        .reduce(
            (best, item) => {
              const distance = Math.hypot(item.pos.x - pos.x, item.pos.y - pos.y);
              return !best || distance < best.distance ? {item, distance} : best;
            },
            null)
        ?.item;
// With the learning tool, where learning is taught: every nerve center with a teacher (a
// modulator reaching it, or a substance whose rise teaches it) wears a teaching ring TEACH_RING
// wide; the chosen one's teachers show their ways to it, a pulse PULSE wide running along each
// in LESSON seconds as its teaching signal, from each modulator in the brain's colour and from
// the nearest gland of each teaching substance in its colour. A substance changing the chosen
// one's learning otherwise shows its glands, a fainter way and above it the symbols of what it
// changes.
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
    const color = substanceColor(substance.index), teaches = effects.includes(EXCITES);
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
        hormoneGlyph({...target, teach : teaches, effects}, 'receiver', color, zoom);
  }
  return '<g class="aid-hormone-overlay" pointer-events="none">' + marks + html + '</g>';
}
const EXCITES = HORMONE_EFFECT.excitation;
export function hormoneOverlay(state) {
  if (state.tool === 'learn')
    return teachingOverlay(state);
  const {document : doc, sites, capabilities} = state;
  if (state.tool !== 'hormone')
    return '';
  const substance = doc.substances.find(s => s.index === state.focusSubstance);
  if (!substance)
    return '';
  const color = substanceColor(substance.index);
  const zoom = zoomOf(state);
  const sources = [], targets = [];
  const learning = new Set(learners(doc, substance.index, capabilities).map(c => c.id));
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
      if (effects.length)
        targets.push({
          pos,
          affinity : Math.max(...effects.map(item => item.affinity)),
          focus : effects.some(item => item.effect === state.effect),
          teach : learning.has(center.id),
          effects : effects.map(item => item.effect)
        });
    }
  // A body that grows with the substance carries its colour along its outline.
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
         targets.map(target => hormoneGlyph(target, 'receiver', color, zoom)).join('') + '</g>';
}
// With the hormone tool, the focused substance's glands and receiving centers carry its colour;
// after a measurement, centers whose mean activity changed by more than MEASURED_CHANGE.
const MEASURED_CHANGE = .01;
export function hormoneRoles(state) {
  const roles = new Map(), index = state.focusSubstance;
  const wheel = state.capabilities;
  if (state.tool !== 'hormone' || !wheel || !state.document.substances.some(s => s.index === index))
    return roles;
  for (const c of receivers(state.document, index, wheel))
    roles.set(c.id, 'receives');
  for (const c of producers(state.document, index, wheel))
    roles.set(c.id, 'produces');
  // A measurement marks the centers whose activity the substance raises or lowers.
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
