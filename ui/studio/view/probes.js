import {findOrgan, groupReport, isChosen, organTypes} from '../model/document.js';
import {profileNames} from './scents.js';
import {PROBE_LIMITS} from '../model/probe.js';
import {BODY_MIDDLE, BODY_RADIUS, sideSign} from '../model/layout.js';
import {bodyDirection, skinPoints, steadyAt, zoomOf} from './frame.js';
import {organLocation} from './places.js';
import {arrowPath} from './lateral.js';
import {escapeText, fixed} from './markup.js';
import {ecologyIconSvg} from '../../feeding_view.js';
import {scentColors, scentIcons, scentNames} from '../../brain_model.js';
import {clamp, degrees, radians, wrapAngle} from '../../units.js';
import {formatNumber, percent, t} from '../../strings.js';
import {centerTitle} from './names.js';

const PROBE_SCENE = Object.freeze({
  rings : [ 1, 2, 5, 10 ],
  gap : 14,
  far : 150,
  reach : 300,
  streams : 3,
  across : 46,
  water : {
    lanes : 27,
    spacing : 34,
    upstream : 760,
    steps : 90,
    per : 3,
    size : 2.6,
    lines : .1,
    slow : 9,
    fast : 2.2
  },
  skin_step : 6,
  handle : 11,
  source : 16,
  icon : .9,
  answer : 17,
  off : 44,
  label : 4,
  below : 15,
  digits : 1
});
let skinRing = null;
const skinAround = () => skinRing ??= skinPoints(PROBE_SCENE.skin_step).map(p => {
  const dx = p.x - BODY_MIDDLE.x, dy = p.y - BODY_MIDDLE.y;
  return {angle : Math.atan2(dy, -dx), r : Math.hypot(dx, dy)};
});
function skinDistance(bearing) {
  const turn = a => Math.abs(wrapAngle(a - bearing));
  return skinAround().reduce((best, p) => (turn(p.angle) < turn(best.angle) ? p : best)).r;
}
const pointAt = (angle, r) => {
  const d = bodyDirection(angle);
  return {x : BODY_MIDDLE.x + d.x * r, y : BODY_MIDDLE.y + d.y * r};
};
// Every distance a scent is tried at lies within one body radius beyond the skin, on a log scale,
// so the answer changes within reach of the drag instead of only far outside the view.
const SMELL_SPAN = Math.log(PROBE_LIMITS.most.smell / PROBE_LIMITS.least.smell);
const beyondSkin = distance =>
    BODY_RADIUS * Math.log(distance / PROBE_LIMITS.least.smell) / SMELL_SPAN;
const distanceAt = beyond =>
    clamp(PROBE_LIMITS.least.smell * Math.exp(SMELL_SPAN * beyond / BODY_RADIUS),
          PROBE_LIMITS.least.smell, PROBE_LIMITS.most.smell);
const strengthShare = (strength, kind, faintest) =>
    Math.max(0, Math.log(Math.max(strength, faintest) / faintest) /
                    Math.log(PROBE_LIMITS.most[kind] / faintest));
const shareStrength = (share, kind, faintest) =>
    faintest * (PROBE_LIMITS.most[kind] / faintest) ** clamp(share);
function handleRadius(probe, faintest) {
  const P = PROBE_SCENE, angle = radians(probe.bearing), skin = skinDistance(angle);
  return probe.kind === 'smell' ? skin + beyondSkin(probe.distance)
                                : skin + (probe.kind === 'flow' ? P.far : P.gap) +
                                      P.reach * strengthShare(probe.strength, probe.kind, faintest);
}
export const probeHandle = (probe, faintest) =>
    pointAt(radians(probe.bearing), handleRadius(probe, faintest));
export function probePatch(kind, position, faintest) {
  const dx = position.x - BODY_MIDDLE.x, dy = position.y - BODY_MIDDLE.y;
  const angle = Math.atan2(dy, -dx), r = Math.hypot(dx, dy), bearing = degrees(angle);
  const beyond = r - skinDistance(angle);
  const from = kind === 'flow' ? PROBE_SCENE.far : PROBE_SCENE.gap;
  return kind === 'smell' ? {bearing, distance : distanceAt(beyond)} : {
    bearing,
    strength : shareStrength((beyond - from) / PROBE_SCENE.reach, kind, faintest)
  };
}
function smellRings(zoom) {
  const points = skinAround();
  return PROBE_SCENE.rings
      .map(lengths => {
        const beyond = beyondSkin(lengths * 2);
        const ring = points.map(p => pointAt(p.angle, p.r + beyond));
        const top = ring.reduce((best, p) => p.y < best.y ? p : best);
        return '<path class="aid-probe-ring" d="M' +
               ring.map(p => fixed(p.x) + ' ' + fixed(p.y)).join(' L') + 'Z"/>' +
               '<text class="aid-probe-ring-label"' + steadyAt(top, zoom) + ' y="' +
               -PROBE_SCENE.label + '" text-anchor="middle">' +
               escapeText(t('studio.probe.lengths', {n : formatNumber(lengths)})) + '</text>';
      })
      .join('');
}
function stimulusSvg(probe, faintest, zoom) {
  const P = PROBE_SCENE, angle = radians(probe.bearing),
        at = pointAt(angle, handleRadius(probe, faintest));
  const onto = pointAt(angle, skinDistance(angle) + P.gap);
  if (probe.kind === 'smell') {
    const colour = scentColors?.[probe.scent] ?? '';
    return smellRings(zoom) + '<g class="aid-probe-source"' + steadyAt(at, zoom) + '><circle r="' +
           P.source + '"/>' + ecologyIconSvg(scentIcons?.[probe.scent], colour, P.icon) +
           '<text class="aid-probe-distance" y="' + (P.source + P.below) +
           '" text-anchor="middle">' +
           escapeText(t('studio.probe.lengths', {n : formatNumber(probe.distance / 2, P.digits)})) +
           '</text></g>';
  }
  if (probe.kind === 'flow')
    return waterSvg(probe, faintest, zoom) + flowArrows(angle, at, P);
  return '<path class="aid-probe-arrow ' + probe.kind + '" d="' + arrowPath(at, onto) + '"/>';
}
function flowArrows(angle, at, P) {
  const d = bodyDirection(angle), across = {x : -d.y, y : d.x};
  const onto = pointAt(angle, skinDistance(angle) + P.far);
  const move = (p, shift) => ({x : p.x + across.x * shift, y : p.y + across.y * shift});
  return Array
      .from({length : P.streams},
            (_, k) => {
              const shift = (k - (P.streams - 1) / 2) * P.across;
              return '<path class="aid-probe-arrow flow" d="' +
                     arrowPath(move(at, shift), move(onto, shift)) + '"/>';
            })
      .join('');
}
const FISH_ELLIPSE = Object.freeze({along : BODY_RADIUS, across : .38 * BODY_RADIUS});
function waterVelocity(p, flow) {
  const E = FISH_ELLIPSE;
  const x = (p.x - BODY_MIDDLE.x) / E.along, y = (p.y - BODY_MIDDLE.y) / E.across;
  const ux = flow.x / E.along, uy = flow.y / E.across, ul = Math.hypot(ux, uy) || 1;
  const c = ux / ul, s = uy / ul, zx = c * x + s * y, zy = -s * x + c * y;
  const r2 = zx * zx + zy * zy, r4 = r2 * r2 || 1;
  const wx = 1 - (zx * zx - zy * zy) / r4, wy = -2 * zx * zy / r4;
  const vx = c * wx - s * wy, vy = s * wx + c * wy;
  return {x : vx * E.along, y : vy * E.across, inside : r2 < 1};
}
function waterSvg(probe, faintest, zoom) {
  const W = PROBE_SCENE.water, angle = radians(probe.bearing);
  const toward = bodyDirection(angle), flow = {x : -toward.x, y : -toward.y};
  const across = {x : -flow.y, y : flow.x}, step = 2 * W.upstream / W.steps;
  const share = strengthShare(probe.strength, probe.kind, faintest);
  const seconds = W.slow + (W.fast - W.slow) * share;
  let lines = '', particles = '';
  for (let lane = 0; lane < W.lanes; ++lane) {
    const shift = (lane - (W.lanes - 1) / 2) * W.spacing;
    let p = {
      x : BODY_MIDDLE.x - flow.x * W.upstream + across.x * shift,
      y : BODY_MIDDLE.y - flow.y * W.upstream + across.y * shift
    };
    const points = [ p ];
    for (let k = 0; k < W.steps; ++k) {
      const v = waterVelocity(p, flow), speed = Math.hypot(v.x, v.y) || 1;
      if (v.inside)
        break;
      p = {x : p.x + v.x / speed * step, y : p.y + v.y / speed * step};
      points.push(p);
    }
    const d = 'M' + points.map(q => fixed(q.x) + ' ' + fixed(q.y)).join(' L');
    lines += '<path class="aid-probe-stream" d="' + d + '"/>';
    for (let k = 0; k < W.per; ++k)
      particles += '<circle class="aid-probe-particle" r="' + fixed(W.size / zoom) +
                   '"><animateMotion path="' + d + '" dur="' + fixed(seconds) + 's" begin="-' +
                   fixed(seconds * (k + (lane % W.per) / W.per) / W.per) +
                   's" repeatCount="indefinite"/></circle>';
  }
  return '<g class="aid-probe-water" style="--lines:' + W.lines + '">' + lines + particles + '</g>';
}
function answers(state, organ) {
  const twin = organ.pair ? findOrgan(state.document, organ.pair) : null;
  return [ organ, twin ].filter(Boolean).map(o => {
    const names = o.type === 'nose' ? profileNames(o) : null, types = organTypes(o);
    const values = o.centers
                       .map(c => ({
                              center : c,
                              value : groupReport(state.document, state.anatomy, 'senseProbe', c.id)
                            }))
                       .filter(a => Number.isFinite(a.value));
    const best = values.reduce((most, a) => !most || a.value > most.value ? a : most, null);
    const name = best && names && types.length > 1
                     ? names[types.findIndex(type => type.centers.includes(best.center))]
                     : '';
    return {organ : o, value : best?.value ?? null, name};
  });
}
function answerSvg(state, organ, zoom) {
  const P = PROBE_SCENE;
  return answers(state, organ)
      .map(a => {
        const home = organLocation(a.organ, state.sites, state.document);
        const side = sideSign(a.organ.side);
        const at = {x : home.x, y : home.y + side * P.off / zoom};
        const known = Number.isFinite(a.value);
        return '<g class="aid-probe-answer' + (known ? '' : ' unknown') + '"' + steadyAt(at, zoom) +
               ' style="--lit:' + fixed(known ? clamp(a.value) : 0) + '"><title>' +
               escapeText(a.name) + '</title><circle r="' + P.answer + '"/><text y="' + P.label +
               '" text-anchor="middle">' + (known ? percent(a.value) : formatNumber(NaN)) +
               '</text></g>';
      })
      .join('');
}
// Food in the gut as two bars to drag, how full it is and how much nutrient flows in, beside how
// each gut cell answers. Inflow runs on a log scale, as signals of very different size matter.
const GUT_BARS = Object.freeze({
  width : 300,
  height : 104,
  top : 10,
  bottom : 74,
  gauge : 14,
  knob : 8,
  mark : 92,
  columns : [ 34, 92 ],
  answers : 140,
  row : 20,
  bar : 8,
  right : 290
});
const INFLOW = Object.freeze({least : .01, most : 20});
const inflowShare = value =>
    value > INFLOW.least
        ? clamp(Math.log(value / INFLOW.least) / Math.log(INFLOW.most / INFLOW.least))
        : 0;
const inflowAt = share =>
    share > 0 ? INFLOW.least * Math.pow(INFLOW.most / INFLOW.least, share) : 0;
export function gutProbePatch(key, fy) {
  const B = GUT_BARS, share = clamp((B.bottom - fy * B.height) / (B.bottom - B.top));
  return {[key] : key === 'strength' ? share : inflowAt(share)};
}
export function gutProbeControls(state, organ) {
  const probe = state.senseProbe, B = GUT_BARS;
  if (state.tool !== 'stimulate' || probe?.kind !== 'gut' || probe.organ !== organ.id)
    return '';
  const y = share => B.bottom - (B.bottom - B.top) * share;
  const bar = (key, share, x) =>
      '<rect class="aid-dose-gauge" x="' + (x - B.gauge / 2) + '" y="' + B.top + '" width="' +
      B.gauge + '" height="' + (B.bottom - B.top) + '" rx="' + B.gauge / 2 +
      '"/><rect class="aid-gut-level ' + key + '" x="' + (x - B.gauge / 2) + '" y="' +
      fixed(y(share)) + '" width="' + B.gauge + '" height="' + fixed(B.bottom - y(share)) +
      '"/><circle class="aid-graphic-handle" data-gut-handle="' + key + '" cx="' + x + '" cy="' +
      fixed(y(share)) + '" r="' + B.knob + '"><title>' + escapeText(t('studio.probe.' + key)) +
      '</title></circle><text x="' + x + '" y="' + B.mark + '" text-anchor="middle">' +
      escapeText(t('studio.probe.' + key + 'Mark')) + '</text>';
  const answers =
      organ.centers
          .map((center, k) => {
            const answer = groupReport(state.document, state.anatomy, 'senseProbe', center.id);
            const top = B.top + k * B.row, known = Number.isFinite(answer);
            return '<text x="' + B.answers + '" y="' + (top + B.bar) + '">' +
                   escapeText(centerTitle(center)) +
                   '</text><rect class="aid-gut-answer-track" x="' + B.answers + '" y="' +
                   (top + B.bar + B.bar / 2) + '" width="' + (B.right - B.answers) + '" height="' +
                   B.bar / 2 + '"/><rect class="aid-gut-answer" x="' + B.answers + '" y="' +
                   (top + B.bar + B.bar / 2) + '" width="' +
                   fixed((B.right - B.answers) * (known ? clamp(answer) : 0)) + '" height="' +
                   B.bar / 2 + '"><title>' + (known ? percent(answer) : formatNumber(NaN)) +
                   '</title></rect>';
          })
          .join('');
  return '<section data-gut-probe-controls="' + escapeText(organ.id) + '"><h4>' +
         t('studio.probe.title.gut') + '</h4><svg class="aid-gut-bars" viewBox="0 0 ' + B.width +
         ' ' + B.height + '" data-gut-bars role="img" aria-label="' +
         escapeText(t('studio.probe.title.gut')) + '">' +
         bar('strength', clamp(probe.strength), B.columns[0]) +
         bar('nutrient', inflowShare(probe.nutrient), B.columns[1]) + answers + '</svg></section>';
}
export function senseProbeSvg(state) {
  const probe = state.senseProbe, faintest = state.anatomy?.lightDimmest;
  const organ = probe ? findOrgan(state.document, probe.organ) : null;
  if (!organ || probe.kind === 'gut' || !isChosen(state.selected, organ) || !(faintest > 0))
    return '';
  const zoom = zoomOf(state), at = probeHandle(probe, faintest);
  return '<g class="aid-sense-probe ' + probe.kind + '">' + stimulusSvg(probe, faintest, zoom) +
         answerSvg(state, organ, zoom) + '<g class="aid-probe-handle" data-sense-handle="' +
         escapeText(organ.id) + '"' + steadyAt(at, zoom) + '><title>' +
         escapeText(t('studio.probe.handle.' + probe.kind)) + '</title><circle r="' +
         (probe.kind === 'smell' ? PROBE_SCENE.source : PROBE_SCENE.handle) + '"/></g></g>';
}
export function probeScents(state) {
  const probe = state.senseProbe, organ = probe ? findOrgan(state.document, probe.organ) : null;
  if (probe?.kind !== 'smell' || !organ || !isChosen(state.selected, organ))
    return '';
  return '<div class="aid-probe-scents" role="group" aria-label="' +
         escapeText(t('studio.probe.title.smell')) + '">' +
         (scentNames ?? [])
             .map((name, k) =>
                      '<button type="button" data-probe-scent="' + k + '" class="' +
                      (k === probe.scent ? 'active' : '') + '" title="' + escapeText(name) +
                      '"><svg viewBox="-14 -14 28 28">' +
                      ecologyIconSvg(scentIcons?.[k], scentColors?.[k] ?? '', PROBE_SCENE.icon) +
                      '</svg></button>')
             .join('') +
         '</div>';
}
