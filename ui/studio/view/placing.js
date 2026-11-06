import {visionFan} from './vision.js';
import {eyeRadius, fieldOrigin, organHome, organLocation, placementTarget} from './places.js';
import {fishOutline} from './body.js';
import {organTitle} from './names.js';
import {STUDIO_ICON} from '../../organ_icons.js';
import {escapeText, fixed, placedGlyph} from './markup.js';
import {joinParts, tList} from '../../strings.js';
import {
  eligible,
  functionFor,
  isRegion,
  MODULES,
  MUSCLE_LABEL_INDEX,
  ORGAN_BY_KEY
} from '../model/organs.js';
import {findOrgan, usedSites} from '../model/document.js';
import {BODY_FRAME, nerveZone, sideOf, sitePoint} from '../model/layout.js';
import {FISH_BOX, steadyAt, zoomOf} from './frame.js';
import {centerTitle, tone} from './names.js';

// While an organ is dragged: where it may go and what the hints' colours mean, its preview, and
// a field organ's choices of place.

// Each colour identifies a real centre role. Shared sites are split into separate ring sectors,
// GAP apart on a ring RADIUS wide and WIDTH thick.
const HINT_RING = Object.freeze({radius : 9, width : 3, gap : 1.4});
const HINT_SHADES = Object.freeze(
    [ '#82d5cb', '#ebbd7a', '#b99ddf', '#7eabe4', '#d4e18a', '#f19fa5', '#a6c5db', '#e0a6d2' ]);
// An organ type without a home in the drawing looks for engine places of its own.
const homeless = (doc, type) => !organHome(doc, type, 0);
// The centers an item brings that look for places of their own: those of an organ without a
// home, a nerve center, and those of a module's or a stored module's organs without homes.
function seekingCenters(state, kind, value) {
  const found = [], doc = state.document;
  const add = (type, center) => {
    if (center)
      found.push({type, center});
  };
  if (kind === 'organ' && homeless(doc, value))
    for (const center of ORGAN_BY_KEY[value]?.centers ?? [])
      add(value, center);
  if (kind === 'neuron')
    add('brain', {key : value, role : 'nerve', functionCode : -1});
  if (kind === 'module')
    for (const type of (MODULES.find(m => m.key === value)?.organs ?? [])
             .filter(type => homeless(doc, type)))
      for (const center of ORGAN_BY_KEY[type]?.centers ?? [])
        add(type, center);
  if (kind === 'user-module') {
    const module = state.userModules.find(m => m.id === value);
    for (const organ of module?.organs ?? [])
      for (const center of organ.centers) {
        const desc = organ.type === 'brain'
                         ? {key : center.key, role : 'nerve', functionCode : -1}
                         : ORGAN_BY_KEY[organ.type]?.centers.find(c => c.key === center.key);
        add(organ.type, desc);
      }
  }
  return found;
}
// An organ with a home in the drawing goes there, whatever engine places it takes: a brain
// region to its spot on either side or on the midline (on the midline alone for one that serves
// both sides), an inner organ to the next place of its kind.
function organHomes(state, kind, value) {
  if (kind !== 'organ' || homeless(state.document, value))
    return [];
  const sides =
      isRegion({type : value}) && ORGAN_BY_KEY[value].scope !== 'single' ? [ -1, 0, 1 ] : [ 0 ];
  return sides.map(side => organHome(state.document, value, side));
}
// The places to show, each with the keys of what may go there; each key's colour and name; and
// for a muscle's works, the stretch of the body its places span. The sites of an organ being
// moved count as free.
function hintPlaces(state, kind, value, moving) {
  const labels = new Map(), sites = new Map(), areas = new Map();
  const centers = seekingCenters(state, kind, value), types = new Set(centers.map(d => d.type));
  for (const point of organHomes(state, kind, value)) {
    const key = 'home:' + value;
    if (!labels.has(key))
      labels.set(key, {colour : HINT_SHADES[0], name : organTitle({type : value})});
    sites.set(point.x + ':' + point.y, {point, keys : new Set([ key ])});
  }
  const used = usedSites(state.document, c => c.organId !== moving);
  for (const {type, center} of centers)
    for (const site of state.sites) {
      if (used.has(site.id) || !eligible(center, site) ||
          (center.role === 'nerve' && !nerveZone(site)))
        continue;
      const muscle = center.functionCode === 'site';
      const index = muscle ? MUSCLE_LABEL_INDEX.get(functionFor(center, site)) : undefined;
      if (muscle && index === undefined)
        continue;
      const key = type + ':' + center.key + (muscle ? ':' + index : '');
      if (!labels.has(key))
        labels.set(key, {
          colour : HINT_SHADES[labels.size % HINT_SHADES.length],
          name : muscle           ? tList('studio.muscles')[index]
                 : types.size > 1 ? joinParts([ organTitle({type}), centerTitle(center) ])
                                  : centerTitle(center)
        });
      const point = sitePoint(site, type);
      const location = point.x + ':' + point.y;
      if (!sites.has(location))
        sites.set(location, {point, keys : new Set()});
      sites.get(location).keys.add(key);
      if (muscle) {
        const area = areas.get(key) ?? {from : point.x, to : point.x};
        areas.set(key, {from : Math.min(area.from, point.x), to : Math.max(area.to, point.x)});
      }
    }
  return {labels, sites, areas};
}
// A muscle's works lie in stretches of the body: each tinted in its colour and named.
const MUSCLE_CLIP = 'aid-hint-body';
function muscleBands(state, areas, labels, zoom) {
  if (!areas.size)
    return '';
  return '<defs><clipPath id="' + MUSCLE_CLIP + '"><path d="' + fishOutline(state) +
         '"/></clipPath></defs><g class="aid-muscle-areas" clip-path="url(#' + MUSCLE_CLIP + ')">' +
         [...areas.entries() ]
             .map(([ key, {from, to} ]) => {
               const {colour, name} = labels.get(key), pad = MUSCLE_AREA.pad;
               return '<rect x="' + fixed(from - pad) + '" y="0" width="' +
                      fixed(to - from + 2 * pad) + '" height="' + (FISH_BOX.y + FISH_BOX.height) +
                      '" fill="' + colour + '"/><text x="' + fixed((from + to) / 2) + '" y="' +
                      fixed(BODY_FRAME.middle + MUSCLE_AREA.label) +
                      '" text-anchor="middle" style="font-size:' + fixed(MUSCLE_AREA.size / zoom) +
                      'px">' + escapeText(name) + '</text>';
             })
             .join('') +
         '</g>';
}
// A place's ring, one sector in the colour of each thing that may go there; the place nearest the
// pointer is filled in its first colour.
function hintRing({point, keys}, labels, zoom, near = false) {
  const entries = [...keys ];
  const H = HINT_RING, length = 2 * Math.PI * H.radius, span = length / entries.length;
  const arcs = entries
                   .map((key, i) => {
                     const color = labels.get(key).colour;
                     const dash = entries.length === 1 ? length : Math.max(0, span - H.gap);
                     return '<circle r="' + H.radius + '" fill="none" stroke="' + color +
                            '" stroke-width="' + H.width + '" stroke-dasharray="' + fixed(dash) +
                            ' ' + fixed(length - dash) + '" stroke-dashoffset="' +
                            fixed(-i * span) + '" transform="rotate(-90)"/>';
                   })
                   .join('');
  const fill = near ? '<circle class="aid-site-fill" r="' + H.radius + '" fill="' +
                          labels.get(entries[0]).colour + '"/>'
                    : '';
  return '<g class="aid-site-hint"' + steadyAt(point, zoom) + '>' + fill + arcs + '</g>';
}
// The places an item may go, as rings, and what their colours mean.
export function placementHints(state, kind, value, moving = null) {
  if (!state.sites.length)
    return {svg : ''};
  const {labels, sites, areas} = hintPlaces(state, kind, value, moving);
  const zoom = zoomOf(state);
  return {
    svg : muscleBands(state, areas, labels, zoom) +
              [...sites.values() ].map(site => hintRing(site, labels, zoom)).join(''),
    legend : labels.size > 1 ? [...labels.values() ] : []
  };
}
// A muscle's area reaches PAD past its outer places; its name stands LABEL below the midline,
// SIZE pixels high on screen.
const MUSCLE_AREA = Object.freeze({pad : 14, label : 6, size : 15});
// What the colours of the placement hints stand for: a muscle's work there, or the part of an
// organ or module that may sit there.
export function hintLegend(legend) {
  return legend
      .map(({colour, name}) =>
               '<span><i style="border-color:' + colour + '"></i>' + escapeText(name) + '</span>')
      .join('');
}
// The field organs a choice moves or adds: whose field differs from the current design.
function movedFieldOrgans(state, choice) {
  return choice.document.organs.filter(organ => {
    if (!organ.field)
      return false;
    const now = findOrgan(state.document, organ.id);
    return !now || JSON.stringify(now.field) !== JSON.stringify(organ.field) ||
           JSON.stringify(now.centers.map(c => c.site)) !==
               JSON.stringify(organ.centers.map(c => c.site));
  });
}
// A field organ's places show as the rings every organ's places show, in the first colour.
const SEAT = 'seat', SEAT_LABELS = new Map([ [ SEAT, {colour : HINT_SHADES[0]} ] ]);
// Where field organs can go while one is dragged: a mark at every seat the body offers, and at
// the nearest one the organ itself with its field, exactly where that choice places them.
const seatOf = (state, choice, organ) => fieldOrigin(choice.document, state.sites, organ);
export function choicesSvg(state, choices, nearest) {
  const zoom = zoomOf(state);
  let html = '';
  for (const choice of choices)
    for (const organ of movedFieldOrgans(state, choice)) {
      const seat = seatOf(state, choice, organ);
      if (seat)
        html += hintRing({point : seat, keys : new Set([ SEAT ])}, SEAT_LABELS, zoom,
                         choice === nearest);
    }
  if (!nearest)
    return html;
  // Where the engine's eyes look from is known for the design shown only: the field of a moved
  // organ starts at its drawn place.
  const view = {
    ...state,
    document : nearest.document,
    selected : null,
    anatomy : state.anatomy && { ...state.anatomy, eyePlaces: null }
  };
  for (const organ of movedFieldOrgans(state, nearest)) {
    const seat = seatOf(state, nearest, organ);
    html += visionFan(view, organ);
    if (seat && organ.type === 'eye') {
      const r = Math.max(eyeRadius(nearest.document, sideOf(organ)), SEAT_MARK / zoom);
      html += '<ellipse class="aid-seat-ghost" cx="' + fixed(seat.x) + '" cy="' + fixed(seat.y) +
              '" rx="' + fixed(r) + '" ry="' + fixed(r) + '"/>';
    }
  }
  return html;
}
// The seat of a field organ for a choice, to find the one nearest the pointer.
export function choiceSeats(state, choice) {
  return movedFieldOrgans(state, choice).map(organ => seatOf(state, choice, organ)).filter(Boolean);
}
// An eye's ghost at its place is at least SEAT_MARK frame units wide at zoom 1.
const SEAT_MARK = 7;
// A cursor marker identifies the organ being placed.
// A brain region goes to its spot in the brain on the side it is dragged over.
// A dragged organ shows where it will lie: at its home in the drawing when it has one (a brain
// region at its spot on the side it is over, an inner organ at its place in the plan), any other
// where it is dropped.
export function organPreview(state, kind, key, position) {
  return kind === 'organ'
             ? placementPreview(state, {type : key},
                                placementTarget(state.document, key, position).position)
             : placementPreview(state, {type : 'brain'}, position);
}
export function assemblyPreview(state, placed) {
  if (!placed?.document)
    return '';
  const added = placed.document.organs.filter(o => !state.document.organs.some(p => p.id === o.id));
  return added
      .map(o => placementPreview(state, {type : o.type},
                                 organLocation(o, state.sites, placed.document)))
      .join('');
}
// A dragged organ's preview: its icon ICON wide, drawn LINE thick in INK, on a ring RING wide in
// its colour.
const PREVIEW = Object.freeze({ring : 26, icon : 28, line : 2, ink : '#072e34'});
export function placementPreview(state, descriptor, position) {
  if (!position || !descriptor)
    return '';
  const P = PREVIEW;
  const zoom = zoomOf(state);
  const colour = tone(descriptor.type ?? 'brain');
  const icon = STUDIO_ICON[descriptor.type] ?? STUDIO_ICON.brain;
  return '<g' + steadyAt(position, zoom) + '>' +
         '<circle r="' + P.ring + '" class="aid-preview-ring" fill="' + colour + '"/>' +
         placedGlyph(
             icon, P.icon, {},
             {paint : ' fill="none" stroke="' + P.ink + '" stroke-width="' + P.line + '"'}) +
         '</g>';
}
