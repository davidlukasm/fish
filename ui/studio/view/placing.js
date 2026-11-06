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
  MODULES,
  MUSCLE_LABEL_INDEX,
  ORGAN_BY_KEY,
  siteRole
} from '../model/organs.js';
import {findOrgan, usedSites} from '../model/document.js';
import {BODY_FRAME, nerveZone, sideOf, sitePoint} from '../model/layout.js';
import {FISH_BOX, steadyAt, zoomOf} from './frame.js';
import {centerTitle, tone} from './names.js';
import {MUSCLE_TONE, muscleHomes, muscleTarget, WORKS} from './muscles.js';

const HINT_RING = Object.freeze({radius : 9, width : 3, gap : 1.4});
const HINT_SHADES = Object.freeze(
    [ '#82d5cb', '#ebbd7a', '#b99ddf', '#7eabe4', '#d4e18a', '#f19fa5', '#a6c5db', '#e0a6d2' ]);
const homeless = (doc, type) => !organHome(doc, type);
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
function organHomes(state, kind, value) {
  return kind !== 'organ' || homeless(state.document, value) ? []
                                                             : [ organHome(state.document, value) ];
}
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
  const free = (center, site) =>
      !used.has(site.id) && eligible(center, site) && (center.role !== 'nerve' || nerveZone(site));
  for (const {type, center : wanted} of centers) {
    const center = wanted.paired && !state.sites.some(site => free(wanted, site))
                       ? {...wanted, paired : false}
                       : wanted;
    for (const site of state.sites) {
      if (!free(center, site))
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
      const point = sitePoint(site, siteRole(type));
      const location = point.x + ':' + point.y;
      if (!sites.has(location))
        sites.set(location, {point, keys : new Set()});
      sites.get(location).keys.add(key);
      if (muscle) {
        const area = areas.get(key) ?? {from : point.x, to : point.x};
        areas.set(key, {from : Math.min(area.from, point.x), to : Math.max(area.to, point.x)});
      }
    }
  }
  return {labels, sites, areas};
}
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
function muscleHints(state) {
  const homes = muscleHomes(state.document, state.sites);
  const names = tList('studio.muscleTitles');
  return {
    svg : homes
              .map(h => '<path class="aid-muscle-home' +
                        (h.organ         ? ' taken'
                         : h.free.length ? ''
                                         : ' full') +
                        '" d="' + h.shape.path + '" style="--muscle:' + MUSCLE_TONE[h.code] + '"/>')
              .join(''),
    legend : WORKS.map(
        code => ({colour : MUSCLE_TONE[code], name : names[MUSCLE_LABEL_INDEX.get(code)]}))
  };
}
export function placementHints(state, kind, value, moving = null) {
  if (!state.sites.length)
    return {svg : ''};
  if (kind === 'organ' && value === 'muscle')
    return muscleHints(state);
  const {labels, sites, areas} = hintPlaces(state, kind, value, moving);
  const zoom = zoomOf(state);
  return {
    svg : muscleBands(state, areas, labels, zoom) +
              [...sites.values() ].map(site => hintRing(site, labels, zoom)).join(''),
    legend : labels.size > 1 ? [...labels.values() ] : []
  };
}
const MUSCLE_AREA = Object.freeze({pad : 14, label : 6, size : 15});
export function hintLegend(legend) {
  return legend
      .map(({colour, name}) =>
               '<span><i style="border-color:' + colour + '"></i>' + escapeText(name) + '</span>')
      .join('');
}
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
const SEAT = 'seat', SEAT_LABELS = new Map([ [ SEAT, {colour : HINT_SHADES[0]} ] ]);
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
export function choiceSeats(state, choice) {
  return movedFieldOrgans(state, choice).map(organ => seatOf(state, choice, organ)).filter(Boolean);
}
const SEAT_MARK = 7;
export function organPreview(state, kind, key, position) {
  if (kind === 'organ' && key === 'muscle') {
    const home = muscleTarget(state.document, state.sites, position);
    return home ? placementPreview(state, {type : key}, home.middle) : '';
  }
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
