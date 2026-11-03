import {STUDIO_ICON} from './organ_icons.js';
import {ANATOMY, MOTOR_KIND, TUNING, VISION} from './schema.js';
import {substanceAffinity, receptorAffinity} from './studio_hormones.js';
import {t} from './strings.js';
import {eligible, functionFor} from './studio_organs.js';
import {addNeuron, addOrgan, allCenters, findCenter, findOrgan} from './studio_model.js';
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
// The wheel's geometry and response width come from the compiled Engine capabilities.
export const substanceColor = (index, capabilities) => {
  const total = capabilities?.bloodSubstances;
  return total ? 'hsl(' + Math.round(360 * index / total) + ' 48% 70%)' : '#b7d3c9';
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
  if (!selection)
    return null;
  const active = new Set();
  if (selection.kind === 'wire') {
    const wire = doc.wires.find(w => w.id === selection.id);
    if (wire) {
      active.add(wire.from);
      active.add(wire.to);
    }
  }
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
  const groups = allCenters(state.document);
  let intervals =
      state.stale || !Array.isArray(report?.eyeGroups)
          ? null
          : eyes.flatMap(center =>
                             report.eyeGroups[groups.findIndex(group => group.id === center.id)] ??
                             []);
  if (!Array.isArray(intervals)) {
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
  const united = [];
  for (const interval of [...intervals].sort((a, b) => a[0] - b[0]))
    if (united.length && interval[0] <= united.at(-1)[1])
      united.at(-1)[1] = Math.max(united.at(-1)[1], interval[1]);
    else
      united.push([...interval ]);
  return united
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
  const developed = !state.stale && Array.isArray(report?.groups);
  const groups = developed ? allCenters(doc) : [];
  let markup = '';
  for (const organ of doc.organs) {
    const active = developed ? organ.centers.filter(center => {
      const index = groups.findIndex(group => group.id === center.id);
      return (report.groups[index]?.cells ?? 0) > 0;
    })
                             : organ.centers;
    if (!active.length)
      continue;
    const pos = organLocation({...organ, centers : active}, sites);
    if (organ.type === 'eye' || organ.type === 'proximity') {
      const radius = Math.min(21, 11 + active.length * 2);
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
      const jaw = active.find(center => center.key === 'jaw');
      const jawLength = developed ? report.anatomy?.[ANATOMY.jaw_length] : (1 + (jaw?.q2 ?? 0)) / 2;
      const bluntness =
          developed ? report.anatomy?.[ANATOMY.blunt_teeth] : (1 + (jaw?.q1 ?? 0)) / 2;
      const reach = 24 + 47 * (jawLength ?? .5);
      const gap = 8 + 12 * (1 - (bluntness ?? .5));
      markup += '<path class="aid-anatomical-mouth" d="M132 365 Q' + fixed(132 + reach * .6) + ' ' +
                fixed(365 - gap) + ' ' + fixed(132 + reach) + ' ' + fixed(365 - gap * .55) +
                ' M132 365 Q' + fixed(132 + reach * .6) + ' ' + fixed(365 + gap) + ' ' +
                fixed(132 + reach) + ' ' + fixed(365 + gap * .55) + '"/>';
      for (let k = 0; k < 5; ++k) {
        const x = 148 + k * reach / 6;
        const length = 3 + 10 * (1 - (bluntness ?? .5));
        markup += '<path class="aid-anatomical-tooth" d="M' + fixed(x) + ' ' +
                  fixed(365 - gap * .7) + ' l0 ' + fixed(length) + '"/>';
      }
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
    if (organ.type === 'gut') {
      const length = developed ? report.anatomy?.[ANATOMY.gut_length] : .5;
      const travel = 52 + 68 * (length ?? .5);
      markup += '<path class="aid-anatomical-gut" d="M' + fixed(pos.x - travel / 2) + ' ' +
                fixed(pos.y) + ' c' + fixed(travel / 4) + ' -27 ' + fixed(travel / 4) + ' 27 ' +
                fixed(travel / 2) + ' 0 s' + fixed(travel / 4) + ' 26 ' + fixed(travel / 2) +
                ' 0"/>';
    }
    if (organ.type === 'defense')
      for (let i = 0; i < 3; i++)
        markup += '<path class="aid-anatomical-spike" d="M' + fixed(pos.x + i * 11 - 11) + ' ' +
                  fixed(pos.y) + ' l6 -22 l6 22"/>';
    if (organ.type === 'gland')
      markup += '<ellipse class="aid-anatomical-gland" cx="' + fixed(pos.x) + '" cy="' +
                fixed(pos.y) + '" rx="26" ry="19"/>';
    if (organ.type === 'lateral')
      markup += '<path class="aid-anatomical-lateral" d="M' + fixed(pos.x - 65) + ' ' +
                fixed(pos.y) + ' Q' + fixed(pos.x) + ' ' + fixed(pos.y - 12) + ' ' +
                fixed(pos.x + 65) + ' ' + fixed(pos.y) + '"/>';
    if (organ.type === 'touch' || organ.type === 'pain') {
      for (let i = -1; i <= 1; ++i)
        markup += '<circle class="aid-anatomical-contact" cx="' + fixed(pos.x + i * 14) + '" cy="' +
                  fixed(pos.y + Math.abs(i) * 5) + '" r="' + (organ.type === 'pain' ? 3 : 5) +
                  '"/>';
    }
    if (organ.type === 'blood')
      markup += '<path class="aid-anatomical-blood" d="M' + fixed(pos.x - 22) + ' ' + fixed(pos.y) +
                ' q10 -20 20 0 t20 0"/>';
    if (organ.type === 'muscle')
      for (let i = -1; i <= 1; ++i)
        markup += '<path class="aid-anatomical-muscle" d="M' + fixed(pos.x - 22) + ' ' +
                  fixed(pos.y + i * 9) + ' l44 0"/>';
  }
  return markup;
}
function hormoneOverlay(state) {
  const {document : doc, sites, capabilities} = state;
  if (state.tool !== 'hormone')
    return '';
  const substance = doc.substances.find(s => s.index === state.focusSubstance);
  if (!substance)
    return '';
  const color = substanceColor(substance.index, capabilities);
  const zoom = state.camera.zoom ?? 1;
  const sources = [], targets = [];
  for (const organ of doc.organs)
    for (const center of organ.centers) {
      const pos = centerLocation(center, organ.type, sites);
      if (organ.type === 'gland') {
        const affinity = substanceAffinity(center.q1, center.q2, center.qwidth,
                                           substance.index, capabilities);
        if (affinity >= .1)
          sources.push({pos, affinity});
      }
      const valid = capabilities?.effectRoles?.[center.role];
      const effects = (center.receptors ?? [])
                          .map((receptor, effect) => ({receptor, effect}))
                          .filter(({receptor, effect}) => receptor.active &&
                                  (!valid || valid.includes(effect)))
                          .map(({receptor, effect}) => ({
                            effect,
                            affinity : receptorAffinity(receptor, substance.index, capabilities)
                          }))
                          .filter(item => item.affinity >= .1);
      if (effects.length)
        targets.push({
          pos,
          affinity : Math.max(...effects.map(item => item.affinity)),
          focus : effects.some(item => item.effect === state.effect)
        });
    }
  const glyph = (item, kind) => {
    const r = kind === 'producer' ? 16 : 12;
    return '<g class="aid-hormone-' + kind + '" transform="translate(' + fixed(item.pos.x) +
           ' ' + fixed(item.pos.y) + ') scale(' + fixed(1 / zoom) + ')" style="--hormone:' +
           color + ';opacity:' + fixed(.28 + .72 * item.affinity) + '">' +
           '<circle class="aid-hormone-aura" r="' + r + '"/>' +
           '<circle class="aid-hormone-core' + (item.focus ? ' focused' : '') +
           '" r="' + fixed(r / 2) + '"/></g>';
  };
  const paths = targets.map(target => {
    if (!sources.length)
      return '';
    const source = sources.reduce((best, item) => {
      const distance = Math.hypot(item.pos.x - target.pos.x, item.pos.y - target.pos.y);
      return !best || distance < best.distance ? {item, distance} : best;
    }, null).item;
    return '<path class="aid-hormone-influence" d="' + pathTo(source.pos, target.pos, 17) +
           '" stroke="' + color + '" opacity="' + fixed(.1 + .33 * target.affinity) + '"/>';
  }).join('');
  return '<g class="aid-hormone-overlay" pointer-events="none">' + paths +
         sources.map(source => glyph(source, 'producer')).join('') +
         targets.map(target => glyph(target, 'receiver')).join('') + '</g>';
}
function anatomySvg(state) {
  const {document : doc, sites, report} = state;
  const centers = allCenters(doc);
  const developed = !state.stale && Array.isArray(report?.fins);
  const actual = index => Number(report?.fins?.[index]?.strength) || 0;
  const plan = (role, side = null) => centers
                                          .filter(center => {
                                            const site = lookup(sites, center.site);
                                            return site && (side === null || site.side === side) &&
                                                   center.role === 'motor' &&
                                                   functionFor(center, site) === role;
                                          })
                                          .reduce((sum, center) => sum + center.copies / 4, 0);
  const left = developed ? actual(1) : plan(MOTOR_KIND.turn, -1);
  const right = developed ? actual(2) : plan(MOTOR_KIND.turn, 1);
  const forward = developed ? actual(0) : plan(MOTOR_KIND.forward);
  const absorption = !state.stale && report?.restingAbsorption;
  let fill = '#365b5b';
  if (Array.isArray(absorption) && absorption.length === 3) {
    const total = absorption.reduce((sum, value) => sum + value, 0);
    fill = 'rgb(' +
           absorption.map(value => Math.round(255 * (1 - value / (total + 10)))).join(' ') + ')';
  }
  let result = '<path class="aid-fish-body" d="' + fishPath() + '" fill="' + fill + '"/>';
  const sideFins = finPaths();
  for (let i = 0; i < sideFins.length; ++i) {
    const strength = i % 2 === 0 ? left : right;
    if (strength <= 0)
      continue;
    const growth = Math.min(1.2, .32 + .30 * Math.sqrt(strength));
    const anchorY = i % 2 === 0 ? 270 : 461;
    result += '<path class="aid-fish-fin aid-fin-' + i + '" d="' + sideFins[i] +
              '" transform="translate(0 ' + fixed(anchorY) + ') scale(1 ' + fixed(growth) +
              ') translate(0 -' + fixed(anchorY) + ')"/>';
  }
  if (forward > 0) {
    const growth = Math.min(1.25, .24 + .38 * Math.sqrt(forward));
    result += '<path class="aid-fish-fin aid-tail-fin" d="' + tailPath() +
              '" transform="translate(895 365) scale(' + fixed(growth) + ' ' + fixed(growth) +
              ') translate(-895 -365)"/>';
  }
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
         hormoneOverlay(state) +
         '<g class="aid-wires">' + wireSvg(state, centers) + '</g>' +
         '<g class="aid-centers">' + centersSvg(state) + '</g>' +
         '<g class="aid-assemblies">' + assembliesSvg(state) + '</g>' +
         '<g id="aid-placement-hints"></g>' +
         '<g id="aid-drag-preview" pointer-events="none"></g>' +
         '<path id="aid-connecting-line" d="" class="aid-connecting-line" pointer-events="none"/>' +
         '</svg>';
}
// Preview the organ that will actually be placed, including every legal cell centre.
// The same anatomy renderer draws finished organs and the drag preview.
export function organPreview(state, kind, key, position) {
  const placed =
      kind === 'organ' ? addOrgan(state.document, key, state.sites, position)
      : kind === 'neuron' ? addNeuron(state.document, key, state.sites, position)
                          : null;
  if (!placed)
    return '';
  const placedOrgan = placed.document.organs.find(o => o.id === placed.organId);
  const ids = kind === 'organ' ? (placedOrgan?.centers.map(c => c.id) ?? []) : [placed.centerId];
  const picked = new Set(ids);
  const organ = placed.document.organs.find(o => o.centers.some(c => picked.has(c.id)));
  if (!organ)
    return '';
  const draftOrgan = {...organ, centers : organ.centers.filter(c => picked.has(c.id))};
  const draftState = {...state, document : {organs : [draftOrgan]}, report : null, stale : true};
  const zoom = state.camera.zoom ?? 1;
  const colour = tone(organ.type);
  return '<g class="aid-preview-organ" pointer-events="none">' +
         naturalOrgans(draftState) +
         draftOrgan.centers.map(center => {
           const site = lookup(state.sites, center.site);
           if (!site)
             return '';
           const point = sitePoint(site, organ.type);
           return '<g transform="translate(' + fixed(point.x) + ' ' + fixed(point.y) +
                  ') scale(' + fixed(1 / zoom) + ')">' +
                  '<circle class="aid-preview-node" r="13" fill="' + colour +
                  '"/><g style="color:' + colour + '">' + centerMarker(center, 7) +
                  '</g></g>';
         }).join('') + '</g>';
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
