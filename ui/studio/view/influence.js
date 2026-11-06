import {fishOutline} from './body.js';
import {nodeLocation} from './places.js';
import {escapeText, fixed} from './markup.js';
import {substanceColor} from '../../hormones.js';
import {t} from '../../strings.js';
import {
  allCenters,
  boundEffects,
  findCenter,
  growsWith,
  learners,
  NOTICEABLE_AFFINITY,
  producers,
  receivers,
  receptorAffinity,
  teachersOf,
  wheelAffinity
} from '../model/document.js';
import {pathTo} from './wires.js';
import {steadyAt} from './frame.js';

// Where a substance acts, with the hormone tool: the glands that release it, the cells that bind
// it and learn from it, and the ways between them; with the learning tool a center's teachers.

// Glands release, receivers carry a ring, learning cells a second one and the word: what the
// substance teaches them.
// A gland's glyph PRODUCER wide, a receiver's RECEIVER; a learner's second ring TEACH times as
// wide, its word WORD above; the glyph shows at least FAINTEST, fully where bound fully.
const HORMONE_GLYPH =
    Object.freeze({producer : 16, receiver : 12, teach : 1.5, word : 1.7, faintest : .28});
// The way from the nearest gland to a receiver bows CURVE more than a wire, at least FAINTEST
// and up to FAINTEST + SPAN opaque by how strongly it binds.
const HORMONE_WAY = Object.freeze({curve : 17, faintest : .1, span : .33});
function hormoneGlyph(item, kind, color, zoom) {
  const G = HORMONE_GLYPH, r = kind === 'producer' ? G.producer : G.receiver;
  const word = item.quiet            ? ''
               : kind === 'producer' ? 'studio.inspector.releases'
               : item.teach          ? 'studio.inspector.learns'
                                     : '';
  return '<g class="aid-hormone-' + kind + (item.teach ? ' teach' : '') + '"' +
         steadyAt(item.pos, zoom) + ' style="--hormone:' + color +
         ';opacity:' + fixed(G.faintest + (1 - G.faintest) * item.affinity) + '">' +
         '<circle class="aid-hormone-aura" r="' + r + '"/>' +
         (item.teach ? '<circle class="aid-hormone-teach" r="' + fixed(r * G.teach) + '"/>' : '') +
         '<circle class="aid-hormone-core' + (item.focus ? ' focused' : '') + '" r="' +
         fixed(r / 2) + '"/>' +
         (word ? '<text class="aid-hormone-word" y="' + fixed(-r * G.word) +
                     '" text-anchor="middle">' + escapeText(t(word)) + '</text>'
               : '') +
         '</g>';
}
// Glands close together, as a pair beside the midline, share one word, on the topmost: those
// within WORD_GAP screen pixels below a worded one stay quiet.
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
// With the learning tool, the selected nerve center's teachers: for each substance it learns
// from, the glands releasing it and the way from the nearest one to the learner.
function teachingOverlay(state) {
  const {document : doc, sites, capabilities, selected} = state;
  const found = selected?.kind === 'center' ? findCenter(doc, selected.id) : null;
  if (!capabilities || found?.center.role !== 'nerve')
    return '';
  const zoom = state.camera.zoom ?? 1;
  const target = {pos : nodeLocation(doc, sites, found.center, found.organ.type), affinity : 1};
  let html = '';
  for (const {substance, glands} of teachersOf(doc, found.center, capabilities)) {
    const color = substanceColor(substance.index);
    const sources = glands.map(c => {
      const hit = findCenter(doc, c.id);
      return {pos : nodeLocation(doc, sites, hit.center, hit.organ.type), affinity : 1};
    });
    const source = nearest(sources, target.pos);
    if (source)
      html += '<path class="aid-hormone-influence teach" d="' +
              pathTo(source.pos, target.pos, HORMONE_WAY.curve) + '" stroke="' + color + '"/>';
    html +=
        worded(sources, zoom).map(item => hormoneGlyph(item, 'producer', color, zoom)).join('') +
        hormoneGlyph({...target, teach : true}, 'receiver', color, zoom);
  }
  return html ? '<g class="aid-hormone-overlay" pointer-events="none">' + html + '</g>' : '';
}
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
  const zoom = state.camera.zoom ?? 1;
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
          teach : learning.has(center.id)
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
