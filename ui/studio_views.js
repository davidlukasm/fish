import {STUDIO_ICON} from './organ_icons.js';
import {aquariumEyePoint, aquariumMorphologySvg} from './studio_anatomy.js';
import {ANATOMY, MOTOR_KIND, TUNING, VISION} from './schema.js';
import {substanceAffinity, receptorAffinity} from './studio_hormones.js';
import {hormoneColors} from './hormones.js';
import {fishBodyColour} from './studio_pigment.js';
import {t} from './strings.js';
import {MODULES, ORGAN_BY_KEY, eligible, functionFor} from './studio_organs.js';
import {
  addNeuron,
  addOrgan,
  allCenters,
  boundEffects,
  findOrgan,
  producers,
  receivers
} from './studio_model.js';
import {
  CAMERA_ZOOM,
  FISH_BOX,
  BODY_FRAME,
  SNAP_DISTANCE,
  cameraBox,
  finPaths,
  fishPath,
  sitePoint,
  tailPath
} from './studio_geometry.js';

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
export const substanceColor = index => { return hormoneColors[index] ?? '#b7d3c9';};
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
function networkMemberSet(doc, selection, contacts = null) {
  if (!selection)
    return null;
  const centers = allCenters(doc);
  const active = new Set();
  if (selection.kind === 'contact') {
    const [from, to] = selection.id.split(':').map(Number);
    for (const index of [from, to]) {
      if (centers[index])
        active.add(centers[index].id);
    }
  }
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
  const adjacency = new Map();
  const connect = (from, to) => {
    if (!from || !to)
      return;
    if (!adjacency.has(from))
      adjacency.set(from, new Set());
    if (!adjacency.has(to))
      adjacency.set(to, new Set());
    adjacency.get(from).add(to);
    adjacency.get(to).add(from);
  };
  if (contacts) {
    for (const [from, to, count] of contacts)
      if (count > 0)
        connect(centers[from]?.id, centers[to]?.id);
  } else
    for (const wire of doc.wires)
      connect(wire.from, wire.to);
  const queue = [...active ];
  for (let index = 0; index < queue.length; ++index)
    for (const adjacent of adjacency.get(queue[index]) ?? [])
      if (!active.has(adjacent)) {
        active.add(adjacent);
        queue.push(adjacent);
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
function developedContactsSvg(state, centers) {
  const {document : doc, sites, selected, wireScope, report} = state;
  const members =
      wireScope === 'focus' ? networkMemberSet(doc, selected, report?.contacts ?? []) : null;
  const centerList = allCenters(doc);
  const importance = ([, , count, , positive, negative, meanPositive, meanNegative ]) =>
      Math.sqrt(count) *
      (.1 + (positive * Math.abs(meanPositive) + negative * Math.abs(meanNegative)) / count);
  const entries =
      (report?.contacts ?? [])
          .filter(([ from, to, count ]) => count > 0 && centerList[from] && centerList[to] &&
                                           (!members || members.has(centerList[from].id) &&
                                                            members.has(centerList[to].id)))
          .sort((a, b) => importance(b) - importance(a))
          .slice(0, 120)
          .reverse();
  return entries
      .map(([ from, to, count, , positive, negative, meanPositive, meanNegative ], index) => {
        const a = centers.get(centerList[from].id), b = centers.get(centerList[to].id);
        if (!a || !b)
          return '';
        const start = centerLocation(a.center, a.organ.type, sites);
        const end = centerLocation(b.center, b.organ.type, sites);
        const channels = [
          {kind : 'excite', count : positive, mean : meanPositive, color : '#9edaca'},
          {kind : 'inhibit', count : negative, mean : meanNegative, color : '#e8a2b5'}
        ].filter(channel => channel.count > 0);
        if (!channels.length)
          channels.push({kind : 'neutral', count, mean : 0, color : '#819c9d'});
        const id = from + ':' + to;
        return '<g data-contact="' + id + '" class="aid-wire-group aid-developed-contact' +
               (isSelected(selected, 'contact', id) ? ' selected' : '') + '">' +
               channels
                   .map((channel, lane) => {
                     const offset = channels.length > 1 ? (lane ? 11 : -11) : 0;
                     const curve = index % 7 * 2 + offset;
                     const d = from === to
                                   ? 'M' + fixed(start.x - 16) + ' ' + fixed(start.y) + ' C' +
                                         fixed(start.x - 65) + ' ' + fixed(start.y - 72 - curve) +
                                         ' ' + fixed(start.x + 65) + ' ' +
                                         fixed(start.y - 72 - curve) + ' ' + fixed(start.x + 16) +
                                         ' ' + fixed(start.y)
                                   : pathTo(start, end, curve);
                     const width = Math.min(6.5, 1.5 + Math.log1p(channel.count) * .65);
                     const arrow =
                         channel.kind === 'inhibit' ? 'aid-wire-arrow-inhibit' : 'aid-wire-arrow';
                     return '<path d="' + d + '" class="aid-wire-hit"/>' +
                            '<path d="' + d + '" class="aid-wire-ink" data-channel="' +
                            channel.kind + '" stroke="' + channel.color + '" stroke-width="' +
                            fixed(width) + '" marker-end="url(#' + arrow + ')"/>';
                   })
                   .join('') +
               '<title>' +
               escapeText(centerTitle(a.center) + ' → ' + centerTitle(b.center) + ' · ' + count +
                          ' ' + t('studio.app.contacts')) +
               '</title></g>';
      })
      .join('');
}
function eyeCones(state, side) {
  const {report, sites} = state;
  const eyes =
      state.document.organs.filter(organ => organ.type === 'eye')
          .flatMap(organ => organ.centers)
          .filter(center => center.key === 'retina' && lookup(sites, center.site)?.side === side);
  if (!eyes.length)
    return '';
  // One physical eye per side collects the angular intervals of every retinal group.
  const from = (!state.stale ? aquariumEyePoint(report, side < 0 ? 0 : 1) : null) ??
               organLocation({type : 'eye', centers : eyes}, sites);
  const groups = allCenters(state.document);
  let intervals =
      !state.stale && Array.isArray(report?.eyeGroups)
          ? eyes.flatMap(
                center => report.eyeGroups[groups.findIndex(group => group.id === center.id)] ?? [])
          : null;
  if (!intervals && !state.stale && Array.isArray(report?.eyeIntervals))
    intervals = report.eyeIntervals[side < 0 ? 0 : 1];
  if (!Array.isArray(intervals)) {
    const limit = Math.PI * VISION.half_view;
    intervals = eyes.map(center => {
                      const site = lookup(sites, center.site);
                      if (!site)
                        return null;
                      const angle = side * limit * (.5 * (1 - site.u) + .5 * site.w);
                      const width =
                          Math.PI / 180 * TUNING.visual_width_min *
                          Math.pow(TUNING.visual_width_max / TUNING.visual_width_min, center.field);
                      return [ Math.max(-limit, angle - width), Math.min(limit, angle + width) ];
                    })
                    .filter(Boolean);
  }
  const united = [];
  for (const interval of [...intervals].sort((a, b) => a[0] - b[0]))
    if (united.length && interval[0] <= united.at(-1)[1])
      united.at(-1)[1] = Math.max(united.at(-1)[1], interval[1]);
    else
      united.push([...interval ]);
  // The largest possible camera always fits inside the field; zoom does not shorten a ray.
  const radius = Math.hypot(FISH_BOX.width, FISH_BOX.height) * 1.4 / CAMERA_ZOOM.min;
  return united
      .map(([ start, end ]) => {
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
  const renderedEyes = new Set();
  for (const organ of doc.organs) {
    const active = developed ? organ.centers.filter(center => {
      const index = groups.findIndex(group => group.id === center.id);
      return (report.groups[index]?.cells ?? 0) > 0;
    })
                             : organ.centers;
    if (!active.length)
      continue;
    const pos = organLocation({...organ, centers : active}, sites);
    if (organ.type === 'eye') {
      const side = lookup(sites, active[0].site)?.side;
      if (side === undefined || renderedEyes.has(side))
        continue;
      renderedEyes.add(side);
      const retinas = doc.organs.filter(item => item.type === 'eye')
                          .flatMap(item => item.centers)
                          .filter(center => lookup(sites, center.site)?.side === side);
      const eye = organLocation({type : 'eye', centers : retinas}, sites);
      const radius = Math.min(21, 11 + retinas.length * 2);
      markup += '<ellipse cx="' + fixed(eye.x) + '" cy="' + fixed(eye.y) + '" rx="' + radius * 1.4 +
                '" ry="' + radius + '" class="aid-anatomical-eye"/>' +
                '<circle cx="' + fixed(eye.x - 5) + '" cy="' + fixed(eye.y) + '" r="' +
                fixed(radius * .44) + '" class="aid-anatomical-pupil"/>';
    }
    if (organ.type === 'proximity') {
      // Proximity detects nearby obstacles; the Aquarium has no second eye for it.
      markup += '<g class="aid-anatomical-proximity"><circle cx="' + fixed(pos.x) + '" cy="' +
                fixed(pos.y) + '" r="5"/>' +
                '<path d="M' + fixed(pos.x - 14) + ' ' + fixed(pos.y - 12) + ' Q' +
                fixed(pos.x - 35) + ' ' + fixed(pos.y) + ' ' + fixed(pos.x - 14) + ' ' +
                fixed(pos.y + 12) + ' M' + fixed(pos.x - 23) + ' ' + fixed(pos.y - 21) + ' Q' +
                fixed(pos.x - 53) + ' ' + fixed(pos.y) + ' ' + fixed(pos.x - 23) + ' ' +
                fixed(pos.y + 21) + '"/></g>';
    }
    if (organ.type === 'nose') {
      // The Aquarium grows a physical barbel near the snout even when its sensing
      // neurons have developmental sites elsewhere along the body.
      const side = lookup(sites, active[0].site)?.side ?? -1;
      const scale = Math.min(1, active.reduce((sum, center) => sum + center.copies, 0) / 24);
      const from = {x : BODY_FRAME.snout + 45, y : BODY_FRAME.middle + side * 37};
      const bend = {x : BODY_FRAME.snout + 8, y : BODY_FRAME.middle + side * (56 + 16 * scale)};
      const tip = {
        x : BODY_FRAME.snout - 15 - 18 * scale,
        y : BODY_FRAME.middle + side * (78 + 24 * scale)
      };
      markup += '<path class="aid-anatomical-barbel" d="M' + fixed(from.x) + ' ' + fixed(from.y) +
                ' Q' + fixed(bend.x) + ' ' + fixed(bend.y) + ' ' + fixed(tip.x) + ' ' +
                fixed(tip.y) + '"/>';
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
        const affinity =
            substanceAffinity(center.q1, center.q2, center.qwidth, substance.index, capabilities);
        if (affinity >= .1)
          sources.push({pos, affinity});
      }
      const effects = boundEffects(center, substance.index, capabilities)
                          .map(effect => ({
                                 effect,
                                 affinity : receptorAffinity(center.receptors[effect],
                                                             substance.index, capabilities)
                               }));
      if (effects.length)
        targets.push({
          pos,
          affinity : Math.max(...effects.map(item => item.affinity)),
          focus : effects.some(item => item.effect === state.effect)
        });
    }
  const glyph = (item, kind) => {
    const r = kind === 'producer' ? 16 : 12;
    return '<g class="aid-hormone-' + kind + '" transform="translate(' + fixed(item.pos.x) + ' ' +
           fixed(item.pos.y) + ') scale(' + fixed(1 / zoom) + ')" style="--hormone:' + color +
           ';opacity:' + fixed(.28 + .72 * item.affinity) + '">' +
           '<circle class="aid-hormone-aura" r="' + r + '"/>' +
           '<circle class="aid-hormone-core' + (item.focus ? ' focused' : '') + '" r="' +
           fixed(r / 2) + '"/></g>';
  };
  const paths =
      targets
          .map(target => {
            if (!sources.length)
              return '';
            const source =
                sources
                    .reduce(
                        (best, item) => {
                          const distance =
                              Math.hypot(item.pos.x - target.pos.x, item.pos.y - target.pos.y);
                          return !best || distance < best.distance ? {item, distance} : best;
                        },
                        null)
                    .item;
            return '<path class="aid-hormone-influence" d="' + pathTo(source.pos, target.pos, 17) +
                   '" stroke="' + color + '" opacity="' + fixed(.1 + .33 * target.affinity) + '"/>';
          })
          .join('');
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
  const fill = fishBodyColour(doc, !state.stale ? report : null);
  const developedBody = !state.stale ? aquariumMorphologySvg(report, fill) : '';
  if (developedBody)
    return developedBody + '<path class="aid-body-axis" d="M155 365 H920"/>';
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
// With the hormone tool, the focused substance's glands and receiving centers carry its colour;
// after a measurement, centers whose mean activity changed by more than MEASURED_CHANGE.
const MEASURED_CHANGE = .01;
function hormoneRoles(state) {
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
function centersSvg(state) {
  const {document : doc, sites, selected, camera} = state;
  const zoom = camera.zoom ?? 1;
  const roles = hormoneRoles(state), substance = hormoneColors[state.focusSubstance];
  const activeAssembly = selected?.kind === 'assembly'
                             ? doc.assemblies.find(assembly => assembly.id === selected.id)
                             : null;
  const assemblyCenters = new Set(activeAssembly?.centerIds ?? []);
  let result = '';
  for (const organ of doc.organs) {

    const pos = organLocation(organ, sites);
    const iconic = true;
    const color = tone(organ.type);
    const selectedOrg = isSelected(selected, 'organ', organ.id) ||
                        (state.multi?.has(organ.id) ?? false) ||
                        (activeAssembly?.organIds.includes(organ.id) &&
                         organ.centers.some(center => assemblyCenters.has(center.id)));
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
      const selectedCenter = isSelected(selected, 'center', center.id) ||
                             (state.multi?.has(center.id) ?? false) || selectedOrg ||
                             assemblyCenters.has(center.id);
      const r = selectedCenter ? 7.5 : 5.5;
      result +=
          '<g class="aid-neural-center' + (selectedCenter ? ' selected' : '') + '" data-center="' +
          escapeText(center.id) + '" transform="translate(' + fixed(cp.x) + ' ' + fixed(cp.y) +
          ') scale(' + fixed(1 / zoom) + ')">' +
          '<circle class="aid-neural-body" r="' + fixed(r + 4) + '" fill="' + color +
          '" opacity=".25"/>' +
          (roles.has(center.id) ? '<circle class="aid-hormone-ring ' + roles.get(center.id) +
                                      '" r="' + fixed(r + 7) + '" stroke="' + substance + '"/>'
                                : '') +
          '<g style="color:' + color + '">' + centerMarker(center, r) + '</g></g>';
    }
    if (selectedOrg) {
      result += '<text data-label-y="' + fixed(pos.y) + '" x="' + fixed(pos.x) + '" y="' +
                fixed(pos.y + 47 / zoom) +
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
// Each colour identifies a real centre role. Shared sites are split into separate ring sectors.
const HINT_SHADES = Object.freeze(
    [ '#82d5cb', '#ebbd7a', '#b99ddf', '#7eabe4', '#d4e18a', '#f19fa5', '#a6c5db', '#e0a6d2' ]);
const MUSCLE_LABEL_INDEX = new Map([
  [ MOTOR_KIND.forward, 0 ], [ MOTOR_KIND.turn, 1 ], [ MOTOR_KIND.suction, 2 ],
  [ MOTOR_KIND.aggression, 3 ]
]);
export function placementHints(state, kind, value) {
  if (!state.sites.length)
    return {svg : '', legend : ''};
  const descriptors = [];
  const add = (type, center) => {
    if (center)
      descriptors.push({type, center});
  };
  if (kind === 'organ')
    for (const center of ORGAN_BY_KEY[value]?.centers ?? [])
      add(value, center);
  if (kind === 'neuron')
    add('brain', {key : value, role : 'nerve', functionCode : -1});
  if (kind === 'module') {
    const module = MODULES.find(m => m.key === value);
    let circuit = 0;
    for (const type of module?.organs ?? []) {
      if (type === 'brain') {
        add('brain',
            {key : module.circuits[circuit++] ?? 'relay', role : 'nerve', functionCode : -1});
      } else
        for (const center of ORGAN_BY_KEY[type]?.centers ?? [])
          add(type, center);
    }
  }
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
  const used = new Set(allCenters(state.document).map(c => c.site));
  const labels = new Map(), sites = new Map();
  for (const {type, center} of descriptors)
    for (const site of state.sites) {
      if (used.has(site.id) || !eligible(center, site) ||
          (center.role === 'nerve' && site.zone !== 1 && site.zone !== 2))
        continue;
      const muscle = center.functionCode === 'site';
      const index = muscle ? MUSCLE_LABEL_INDEX.get(functionFor(center, site)) : undefined;
      if (muscle && index === undefined)
        continue;
      const key = type + ':' + center.key + (muscle ? ':' + index : '');
      if (!labels.has(key)) {
        const centerName =
            muscle ? t('studio.muscles.' + index) : t('studio.centers.' + center.key);
        labels.set(key, {
          color : HINT_SHADES[labels.size % HINT_SHADES.length],
          name : t('studio.organs.' + type) + ' · ' + centerName
        });
      }
      const point = sitePoint(site, type);
      const location = site.id + ':' + point.x + ':' + point.y;
      if (!sites.has(location))
        sites.set(location, {point, keys : new Set()});
      sites.get(location).keys.add(key);
    }
  const zoom = state.camera.zoom ?? 1;
  const svg =
      [...sites.values() ]
          .map(({point, keys}) => {
            const entries = [...keys ];
            const length = 2 * Math.PI * 9, span = length / entries.length;
            const arcs = entries
                             .map((key, i) => {
                               const color = labels.get(key).color;
                               const dash = entries.length === 1 ? length : Math.max(0, span - 1.4);
                               return '<circle r="9" fill="none" stroke="' + color +
                                      '" stroke-width="3" stroke-dasharray="' + fixed(dash) + ' ' +
                                      fixed(length - dash) + '" stroke-dashoffset="' +
                                      fixed(-i * span) + '" transform="rotate(-90)"/>';
                             })
                             .join('');
            return '<g class="aid-site-hint" data-point-x="' + fixed(point.x) + '" data-point-y="' +
                   fixed(point.y) + '" transform="translate(' + fixed(point.x) + ' ' +
                   fixed(point.y) + ') scale(' + fixed(1 / zoom) + ')">' + arcs + '</g>';
          })
          .join('');
  const legend =
      [...labels.values() ]
          .map(({color, name}) => '<span class="aid-hint-label"><i style="background:' + color +
                                  '"></i>' + escapeText(name) + '</span>')
          .join('');
  return {svg, legend};
}
export function fishScene(state) {
  const camera = cameraBox(state.camera);
  const centers = new Map();
  for (const organ of state.document.organs)
    for (const center of organ.centers)
      centers.set(center.id, {center, organ});
  const cones = [ -1, 1 ].map(side => eyeCones(state, side)).join('');
  const box = [ camera.x, camera.y, camera.width, camera.height ].map(fixed).join(' ');
  return '<svg id="aid-body-map" viewBox="' + box +
         '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' +
         escapeText(t('studio.app.empty')) + '">' +
         '<defs><marker id="aid-wire-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" ' +
         'orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L7 3 L0 6" fill="#a7d9cd"/></marker>' +
         '<marker id="aid-wire-arrow-inhibit" markerWidth="8" markerHeight="8" refX="7" refY="3" ' +
         'orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L7 3 L0 6" fill="#e8a2b5"/></marker>' +
         '<linearGradient id="aid-fish-light" x1="0" y1="0" x2="0" y2="1">' +
         '<stop offset="0%" stop-color="#76b7ad"/><stop offset="100%" stop-color="#163c45"/>' +
         '</linearGradient></defs>' +
         '<rect x="0" y="0" width="1120" height="740" class="aid-canvas-ground"/>' +
         '<g class="aid-fov-fields">' + cones + '</g>' +
         '<g class="aid-anatomy">' + anatomySvg(state) + '</g>' + hormoneOverlay(state) +
         '<g class="aid-wires">' +
         (state.contactView === 'actual' && !state.stale && state.report?.contacts
              ? developedContactsSvg(state, centers)
              : wireSvg(state, centers)) +
         '</g>' +
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
      kind === 'organ'    ? addOrgan(state.document, key, state.sites, position, SNAP_DISTANCE)
      : kind === 'neuron' ? addNeuron(state.document, key, state.sites, position, SNAP_DISTANCE)
                          : null;
  if (!placed)
    return '';
  const placedOrgan = placed.document.organs.find(o => o.id === placed.organId);
  const ids = kind === 'organ' ? (placed.centerIds ?? []) : [ placed.centerId ];
  const picked = new Set(ids);
  const organ = placed.document.organs.find(o => o.centers.some(c => picked.has(c.id)));
  if (!organ)
    return '';
  const draftOrgan = {...organ, centers : organ.centers.filter(c => picked.has(c.id))};
  const shared = state.document.organs.some(item => item.id === organ.id) &&
                 (organ.type === 'eye' || organ.type === 'nose');
  const drawing = shared ? organ : draftOrgan;
  const draftState = {...state, document : {organs : [ drawing ]}, report : null, stale : true};
  const zoom = state.camera.zoom ?? 1;
  const colour = tone(organ.type);
  return '<g class="aid-preview-organ" pointer-events="none">' + naturalOrgans(draftState) +
         draftOrgan.centers
             .map(center => {
               const site = lookup(state.sites, center.site);
               if (!site)
                 return '';
               const point = sitePoint(site, organ.type);
               return '<g transform="translate(' + fixed(point.x) + ' ' + fixed(point.y) +
                      ') scale(' + fixed(1 / zoom) + ')">' +
                      '<circle class="aid-preview-node" r="13" fill="' + colour +
                      '"/><g style="color:' + colour + '">' + centerMarker(center, 7) + '</g></g>';
             })
             .join('') +
         '</g>';
}
// A saved or predefined circuit remains a collection of real organs during drag.
// Positions and connections come from the same placement result that drop will commit.
export function assemblyPreview(state, placed) {
  if (!placed?.document)
    return '';
  const existing = new Set(allCenters(state.document).map(center => center.id));
  const additions =
      placed.document.organs
          .map(organ =>
                   ({...organ, centers : organ.centers.filter(center => !existing.has(center.id))}))
          .filter(organ => organ.centers.length);
  if (!additions.length)
    return '';
  const centers = new Map(additions.flatMap(
      organ => organ.centers.map(center => [center.id, {center, type : organ.type}])));
  const wires = placed.document.wires.filter(wire => centers.has(wire.from) && centers.has(wire.to))
                    .map(wire => {
                      const from = centers.get(wire.from), to = centers.get(wire.to);
                      return '<path class="aid-preview-wire" d="' +
                             pathTo(centerLocation(from.center, from.type, state.sites),
                                    centerLocation(to.center, to.type, state.sites)) +
                             '"/>';
                    })
                    .join('');
  const zoom = state.camera.zoom ?? 1;
  const marks = additions
                    .map(organ => organ.centers
                                      .map(center => {
                                        const pos = centerLocation(center, organ.type, state.sites);
                                        const color = tone(organ.type);
                                        return '<g transform="translate(' + fixed(pos.x) + ' ' +
                                               fixed(pos.y) + ') scale(' + fixed(1 / zoom) + ')">' +
                                               '<circle class="aid-preview-node" r="13" fill="' +
                                               color + '"/>' +
                                               '<g style="color:' + color + '">' +
                                               centerMarker(center, 7) + '</g></g>';
                                      })
                                      .join(''))
                    .join('');
  const anatomy = additions.map(organ => {
    const existingOrgan = state.document.organs.some(item => item.id === organ.id);
    return existingOrgan && (organ.type === 'eye' || organ.type === 'nose')
               ? placed.document.organs.find(item => item.id === organ.id)
               : organ;
  });
  const preview = {...state, report : null, stale : true, document : {organs : anatomy}};
  return '<g class="aid-preview-organ" pointer-events="none">' + naturalOrgans(preview) + wires +
         marks + '</g>';
}
export function removalPreview(state, position) {
  const zoom = state.camera.zoom ?? 1;
  return '<g class="aid-preview-removal" transform="translate(' + position.x + ' ' + position.y +
         ') scale(' + (1 / zoom) + ')">' +
         '<circle r="28" fill="#63363b" stroke="#f0a4aa" stroke-width="2.5"/>' +
         '<path d="M-11 -8H11 M-7 -8V11H7V-8 M-4 -13H4 M-3 -3V6 M3 -3V6" ' +
         'stroke="#fff1ef" stroke-width="2" stroke-linecap="round" fill="none"/></g>';
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
