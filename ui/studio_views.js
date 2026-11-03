import {STUDIO_ICON} from './organ_icons.js';
import {TUNING, VISION} from './schema.js';
import {t} from './strings.js';
import {eligible} from './studio_organs.js';
import {allCenters, findCenter, findOrgan} from './studio_model.js';
import {cameraBox, finPaths, fishPath, halfWidth, sitePoint, tailPath} from './studio_geometry.js';

export const escapeText = value =>
    String(value ?? '')
        .replace(
            /[&<>"']/g,
            char =>
                ({'&' : '&amp;', '<' : '&lt;', '>' : '&gt;', '"' : '&quot;', "'" : '&#39;'}[char]));
const fixed = value => Number(value).toFixed(2);
const lookup = (sites, id) => sites.find(s => s.id === id);
export const organTitle = organ => t('studio.organs.' + organ.type);
export const centerTitle = center => t('studio.centers.' + center.key);
export const tone = kind => {
  if ([ 'eye', 'nose', 'proximity', 'lateral', 'touch', 'pain' ].includes(kind))
    return '#79d2be';
  if ([ 'bladder', 'gut', 'blood', 'gland' ].includes(kind))
    return '#b29bdc';
  if ([ 'eggs', 'sperm' ].includes(kind))
    return '#dfbc87';
  if (kind === 'brain')
    return '#b8c5e1';
  return '#eaa886';
};
const isSelected = (selection, kind, id) => selection?.kind === kind && selection?.id === id;
function centerLocation(center, organType, sites) {
  const site = lookup(sites, center.site);
  return site ? sitePoint(site, organType) : {x : 550, y : 365};
}
function organLocation(organ, sites) {
  const positions = organ.centers.map(c => centerLocation(c, organ.type, sites));
  if (!positions.length)
    return {x : 507, y : 365};
  return {
    x : positions.reduce((n, p) => n + p.x, 0) / positions.length,
    y : positions.reduce((n, p) => n + p.y, 0) / positions.length
  };
}
function pathTo(from, to, curve = 0) {
  const rise = Math.max(15, Math.min(66, Math.abs(to.x - from.x) * .19)) + curve;
  return 'M' + fixed(from.x) + ' ' + fixed(from.y) + ' Q' + fixed((from.x + to.x) / 2) + ' ' +
         fixed((from.y + to.y) / 2 - rise) + ' ' + fixed(to.x) + ' ' + fixed(to.y);
}
function networkMemberSet(doc, selection) {
  if (!selection || selection.kind === 'wire')
    return null;
  const active = new Set();
  if (selection.kind === 'center')
    active.add(selection.id);
  if (selection.kind === 'organ')
    for (const c of findOrgan(doc, selection.id)?.centers ?? [])
      active.add(c.id);
  if (selection.kind === 'assembly') {
    const a = doc.assemblies.find(a => a.id === selection.id);
    for (const id of a?.centerIds ?? [])
      active.add(id);
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const w of doc.wires)
      if (active.has(w.from) && !active.has(w.to)) {
        active.add(w.to);
        grew = true;
      } else if (active.has(w.to) && !active.has(w.from)) {
        active.add(w.from);
        grew = true;
      }
  }
  return active;
}
function wireSvg(state, centers) {
  const {document : doc, sites, selected, wireScope} = state;
  const members = wireScope === 'focus' ? networkMemberSet(doc, selected) : null;
  return doc.wires.filter(w => !members || members.has(w.from) && members.has(w.to))
      .map((w, index) => {
        const a = centers.get(w.from), b = centers.get(w.to);
        if (!a || !b)
          return '';
        const from = centerLocation(a.center, a.organ.type, sites);
        const to = centerLocation(b.center, b.organ.type, sites);
        const d = pathTo(from, to, index % 5 * 3);
        const inhibition = a.center.sign < 0, modulation = a.center.modulator > .5;
        const colour = modulation ? '#e2c487' : inhibition ? '#e8a2b5' : '#9edaca';
        const strong = 1.6 + 3.5 * w.strength;
        return '<g data-wire="' + escapeText(w.id) + '" class="aid-wire-group' +
               (isSelected(selected, 'wire', w.id) ? ' selected' : '') + '">' +
               '<path d="' + d + '" class="aid-wire-hit"/>' +
               '<path d="' + d + '" class="aid-wire-ink" stroke="' + colour + '" stroke-width="' +
               fixed(strong) + '" marker-end="url(#aid-wire-arrow)"/>' +
               '<title>' + escapeText(centerTitle(a.center) + ' → ' + centerTitle(b.center)) +
               '</title></g>';
      })
      .join('');
}
function eyeCones(state, organ) {
  const {report, sites} = state;
  const eyes = organ.centers.filter(c => c.key === 'retina');
  if (!eyes.length)
    return '';
  const from = organLocation(organ, sites);
  const side = lookup(sites, eyes[0].site)?.side;
  if (side === undefined)
    return '';
  const index = side < 0 ? 0 : 1;
  let intervals = state.stale ? null : report?.eyeIntervals?.[index];
  if (!Array.isArray(intervals) || !intervals.length) {
    const limit = Math.PI * VISION.half_view;
    intervals = eyes.map(center => {
                      const site = lookup(sites, center.site);
                      if (!site)
                        return null;
                      const angle = site.side * limit * (.5 * (1 - site.u) + .5 * site.w);
                      const width =
                          Math.PI / 180 * TUNING.visual_width_min *
                          Math.pow(TUNING.visual_width_max / TUNING.visual_width_min, center.field);
                      return [ Math.max(-limit, angle - width), Math.min(limit, angle + width) ];
                    })
                    .filter(Boolean)
                    .sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [start, end] of intervals)
      if (merged.length && merged.at(-1)[1] >= start)
        merged.at(-1)[1] = Math.max(end, merged.at(-1)[1]);
      else
        merged.push([ start, end ]);
    intervals = merged;
  }
  return intervals
      .map(([ start, end ]) => {
        const radius = 335;
        const p1 = {x : from.x - Math.cos(start) * radius, y : from.y + Math.sin(start) * radius};
        const p2 = {x : from.x - Math.cos(end) * radius, y : from.y + Math.sin(end) * radius};
        return '<path class="aid-eye-cone" d="M' + fixed(from.x) + ' ' + fixed(from.y) + ' L' +
               fixed(p1.x) + ' ' + fixed(p1.y) + ' A' + radius + ' ' + radius + ' 0 ' +
               (Math.abs(end - start) > Math.PI ? '1' : '0') + ' ' + (end > start ? '1' : '0') +
               ' ' + fixed(p2.x) + ' ' + fixed(p2.y) + ' Z"/>';
      })
      .join('');
}
function naturalOrgans(state) {
  const {document : doc, sites, report} = state;
  let markup = '';
  for (const organ of doc.organs) {
    const pos = organLocation(organ, sites);
    if (organ.type === 'eye') {
      const radius = Math.min(21, 11 + organ.centers.length * 2);
      markup += '<ellipse cx="' + fixed(pos.x) + '" cy="' + fixed(pos.y) + '" rx="' + radius * 1.4 +
                '" ry="' + radius + '" class="aid-anatomical-eye"/>' +
                '<circle cx="' + fixed(pos.x - 5) + '" cy="' + fixed(pos.y) + '" r="' +
                fixed(radius * .44) + '" class="aid-anatomical-pupil"/>';
    }
    if (organ.type === 'nose') {
      const direction = pos.y < 365 ? -1 : 1;
      markup += '<path class="aid-anatomical-barbel" d="M' + fixed(pos.x) + ' ' + fixed(pos.y) +
                ' q-35 ' + fixed(direction * 19) + ' -52 ' + fixed(direction * 75) + '"/>';
    }
    if (organ.type === 'mouth') {
      markup += '<path class="aid-anatomical-mouth" d="M130 365 l48 -20 M130 365 l48 20"/>';
      for (let k = 0; k < 5; ++k)
        markup += '<path class="aid-anatomical-tooth" d="M' + (146 + k * 6) + ' ' +
                  (354 - k % 2 * 2) + ' l-3 8"/>';
    }
    if (organ.type === 'eggs' || organ.type === 'sperm') {
      const number = Math.max(2, Math.min(7, organ.centers.length + 1));
      for (let i = 0; i < number; ++i)
        markup += '<circle class="aid-anatomical-gonad" cx="' + fixed(pos.x - 24 + i * 8) +
                  '" cy="' + fixed(pos.y + Math.sin(i * 2) * 7) + '" r="' +
                  (organ.type === 'eggs' ? 5 : 3) + '"/>';
    }
    if (organ.type === 'bladder')
      markup += '<ellipse class="aid-anatomical-bladder" cx="' + fixed(pos.x) + '" cy="' +
                fixed(pos.y) + '" rx="39" ry="24"/>';
    if (organ.type === 'gut')
      markup += '<path class="aid-anatomical-gut" d="M' + fixed(pos.x - 42) + ' ' + fixed(pos.y) +
                ' c25 -23 35 23 54 0 s26 26 44 0"/>';
    if (organ.type === 'defense')
      for (let i = 0; i < 3; i++)
        markup += '<path class="aid-anatomical-spike" d="M' + fixed(pos.x + i * 11 - 11) + ' ' +
                  fixed(pos.y) + ' l6 -22 l6 22"/>';
    if (organ.type === 'gland')
      markup += '<ellipse class="aid-anatomical-gland" cx="' + fixed(pos.x) + '" cy="' +
                fixed(pos.y) + '" rx="26" ry="19"/>';
  }
  return markup;
}
function anatomySvg(state) {
  const types = new Set(state.document.organs.map(o => o.type));
  const hasMotor = type => types.has(type);
  const fins =
      hasMotor('fin') ||
      state.document.organs.some(o => o.type === 'muscle' &&
                                      o.centers.some(c => lookup(state.sites, c.site)?.zone === 2));
  const tail =
      hasMotor('tail') ||
      state.document.organs.some(o => o.type === 'muscle' &&
                                      o.centers.some(c => lookup(state.sites, c.site)?.zone === 3));
  const absorption = !state.stale && state.report?.restingAbsorption;
  let fill = '#365b5b';
  if (Array.isArray(absorption) && absorption.length === 3) {
    const total = absorption.reduce((sum, value) => sum + value, 0);
    fill = 'rgb(' +
           absorption.map(value => Math.round(255 * (1 - value / (total + 10)))).join(' ') + ')';
  }
  let result = '<path class="aid-fish-body" d="' + fishPath() + '" fill="' + fill + '"/>';
  if (fins)
    for (const [i, d] of finPaths().entries())
      result += '<path class="aid-fish-fin aid-fin-' + i + '" d="' + d + '"/>';
  if (tail)
    result += '<path class="aid-fish-fin aid-tail-fin" d="' + tailPath() + '"/>';
  result += '<path class="aid-body-axis" d="M155 365 H920"/>';
  return result + naturalOrgans(state);
}

function centerMarker(center, radius) {
  const r = fixed(radius);
  if (center.role === 'motor')
    return '<rect class="aid-neural-dot" x="-' + r + '" y="-' + r + '" width="' +
           fixed(radius * 2) + '" height="' + fixed(radius * 2) + '" rx="2" fill="currentColor"/>' +
           '<path d="M-3 -3 L3 3 M-3 3 L3 -3" stroke="#10292d"/>';
  if (center.role === 'sensor')
    return '<circle class="aid-neural-dot" r="' + r + '" fill="currentColor"/>' +
           '<circle r="2.3" fill="#10292d"/>';
  const shape = center.key === 'inhibit' ? 'M0 -7 L6.5 5.5 H-6.5 Z' : 'M0 -7 L7 0 L0 7 L-7 0 Z';
  const glyph =
      center.key === 'pacemaker' ? '<path d="M0 -4 V0 L3 2" stroke="#10292d" fill="none"/>'
      : center.key === 'learn'
          ? '<path d="M-4 0 H4 M0 -4 V4 M-2.5 -2.5 L2.5 2.5 M-2.5 2.5 L2.5 -2.5" stroke="#10292d"/>'
      : center.key === 'modulate' ? '<path d="M-3 -3 V3 M0 -4 V4 M3 -3 V3" stroke="#10292d"/>'
      : center.key === 'inhibit'  ? '<path d="M-3 2 H3" stroke="#10292d"/>'
                                  : '<path d="M-3 0 H3 M0 -3 V3" stroke="#10292d"/>';
  return '<path class="aid-neural-dot" d="' + shape + '" fill="currentColor"/>' + glyph;
}
function centersSvg(state) {
  const {document : doc, sites, selected, camera} = state;
  const zoom = camera.zoom ?? 1;
  let result = '';
  for (const organ of doc.organs) {

    const pos = organLocation(organ, sites);
    const iconic = true;
    const color = tone(organ.type);
    const selectedOrg =
        isSelected(selected, 'organ', organ.id) || (state.multi?.has(organ.id) ?? false) ||
        (selected?.kind === 'assembly' &&
         doc.assemblies.find(a => a.id === selected.id)?.organIds.includes(organ.id));
    const size = iconic ? 23 : 18;
    if (iconic) {
      result += '<g class="aid-organ-stamp' + (selectedOrg ? ' selected' : '') + '" data-organ="' +
                escapeText(organ.id) + '" transform="translate(' + fixed(pos.x) + ' ' +
                fixed(pos.y) + ') scale(' + fixed(1 / zoom) + ')">' +
                '<circle class="aid-organ-stamp-bg" r="' + size + '" fill="' + color + '"/>' +
                '<svg x="-13" y="-13" width="26" height="26" viewBox="0 0 24 24">' +
                '<path d="' + escapeText(STUDIO_ICON[organ.type] ?? STUDIO_ICON.brain) +
                '" fill="none" stroke="#082830" stroke-width="1.8" stroke-linecap="round"/></svg>' +
                '</g>';
    }
    for (const center of organ.centers) {
      const cp = centerLocation(center, organ.type, sites);
      const selectedCenter = isSelected(selected, 'center', center.id);
      const r = selectedCenter ? 7.5 : 5.5;
      result += '<g class="aid-neural-center' + (selectedCenter ? ' selected' : '') +
                '" data-center="' + escapeText(center.id) + '" transform="translate(' +
                fixed(cp.x) + ' ' + fixed(cp.y) + ') scale(' + fixed(1 / zoom) + ')">' +
                '<circle class="aid-neural-body" r="' + fixed(r + 4) + '" fill="' + color +
                '" opacity=".25"/>' +
                '<g style="color:' + color + '">' + centerMarker(center, r) + '</g></g>';
    }
    if (selectedOrg) {
      result += '<text x="' + fixed(pos.x) + '" y="' + fixed(pos.y + 47 / zoom) +
                '" text-anchor="middle" class="aid-organ-label" font-size="' + fixed(14 / zoom) +
                '">' + escapeText(organTitle(organ)) + '</text>';
    }
  }
  return result;
}

function assembliesSvg(state) {
  const {document : doc, sites, selected, camera} = state;
  return doc.assemblies
      .map((assembly, index) => {
        const included = new Set(assembly.centerIds ?? []);
        const centers = allCenters(doc).filter(c => included.has(c.id));
        if (!centers.length)
          return '';
        const positions = centers.map(c => centerLocation(c, c.organType, sites));
        const x = positions.reduce((sum, p) => sum + p.x, 0) / positions.length;
        const y = positions.reduce((sum, p) => sum + p.y, 0) / positions.length;
        const active = isSelected(selected, 'assembly', assembly.id);
        return '<g class="aid-assembly-stamp' + (active ? ' selected' : '') + '" data-assembly="' +
               escapeText(assembly.id) + '" transform="translate(' + fixed(x) + ' ' +
               fixed(y - 45) + ') scale(' + fixed(1 / (camera.zoom ?? 1)) + ')">' +
               '<rect x="-17" y="-15" width="34" height="30" rx="9"/>' +
               '<path d="M-8 -2 L-3 -6 L4 -2 L9 -6 M-8 5 L-3 1 L4 5 L9 1" fill="none"/>' +
               '<title>' + escapeText(assembly.name || t('studio.sections.module')) + ' ' +
               (index + 1) + '</title></g>';
      })
      .join('');
}
export function siteHints(state, descriptor) {
  if (!descriptor || !state.sites.length)
    return '';
  const used = new Set(allCenters(state.document).map(c => c.site));
  const allowed =
      state.sites.filter(s => !used.has(s.id) && eligible(descriptor, s) &&
                              (descriptor.role !== 'nerve' || s.zone === 1 || s.zone === 2));
  return allowed
      .map(s => {
        const p = sitePoint(s);
        return '<circle class="aid-site-hint" cx="' + fixed(p.x) + '" cy="' + fixed(p.y) +
               '" r="4.2" data-site="' + s.id + '"/>';
      })
      .join('');
}
export function fishScene(state) {
  const camera = cameraBox(state.camera);
  const centers = new Map();
  for (const organ of state.document.organs)
    for (const center of organ.centers)
      centers.set(center.id, {center, organ});
  const cones =
      state.document.organs.filter(o => o.type === 'eye').map(o => eyeCones(state, o)).join('');
  const box = [ camera.x, camera.y, camera.width, camera.height ].map(fixed).join(' ');
  return '<svg id="aid-body-map" viewBox="' + box +
         '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' +
         escapeText(t('studio.app.empty')) + '">' +
         '<defs><marker id="aid-wire-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" ' +
         'orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L7 3 L0 6" fill="#a7d9cd"/></marker>' +
         '<linearGradient id="aid-fish-light" x1="0" y1="0" x2="0" y2="1">' +
         '<stop offset="0%" stop-color="#76b7ad"/><stop offset="100%" stop-color="#163c45"/>' +
         '</linearGradient></defs>' +
         '<rect x="0" y="0" width="1120" height="740" class="aid-canvas-ground"/>' +
         '<g class="aid-fov-fields">' + cones + '</g>' +
         '<g class="aid-anatomy">' + anatomySvg(state) + '</g>' +
         '<g class="aid-wires">' + wireSvg(state, centers) + '</g>' +
         '<g class="aid-centers">' + centersSvg(state) + '</g>' +
         '<g class="aid-assemblies">' + assembliesSvg(state) + '</g>' +
         '<g id="aid-placement-hints"></g>' +
         '<g id="aid-drag-preview" pointer-events="none"></g>' +
         '<path id="aid-connecting-line" d="" class="aid-connecting-line" pointer-events="none"/>' +
         '</svg>';
}
export function placementPreview(state, descriptor, position) {
  if (!position || !descriptor)
    return '';
  const zoom = state.camera.zoom ?? 1;
  const colour = tone(descriptor.type ?? 'brain');
  const icon = STUDIO_ICON[descriptor.type] ?? STUDIO_ICON.brain;
  return '<g transform="translate(' + fixed(position.x) + ' ' + fixed(position.y) + ') scale(' +
         fixed(1 / zoom) + ')">' +
         '<circle r="26" class="aid-preview-ring" fill="' + colour + '"/>' +
         '<svg x="-14" y="-14" width="28" height="28" viewBox="0 0 24 24">' +
         '<path d="' + escapeText(icon) +
         '" fill="none" stroke="#072e34" stroke-width="2"/></svg></g>';
}
