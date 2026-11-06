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

// A sense probe on the fish while its organ is chosen: the stimulus at its bearing around the
// fish, its handle setting the bearing and how far or strong it is, and beside the organ (and its
// twin) how strongly it answers. A scent source lies from the skin (the least distance) out to
// SPAN beyond it at the most, on a log scale: rings round the body mark RINGS body lengths. A
// touch, a bite or a current comes as an arrow ending GAP off the skin, as much longer up to
// REACH as it is strong on a log scale from the faintest stimulus (`faintest`, the design view's
// dimmest one) to the most; a current as STREAMS arrows ACROSS apart with PARTICLES drifting on
// LANES between them (SPREAD of ACROSS apart, PER on each, SIZE wide on screen), taking from SLOW
// seconds for the faintest current to FAST for the strongest to reach the body. Marks keep their
// size on screen as the view zooms: the handle HANDLE, the source SOURCE wide with its icon ICON
// large, each answer as a disc ANSWER wide OFF beyond the organ, away from the midline, its share
// LIT; a scent source's distance in fish lengths stands BELOW it, to DIGITS.
const PROBE_SCENE = Object.freeze({
  span : 560,
  rings : [ 1, 2, 5, 10 ],
  gap : 14,
  reach : 300,
  streams : 3,
  across : 46,
  particles : {lanes : 5, spread : .5, per : 3, size : 3.2, slow : 3.4, fast : .7},
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
// How far the skin lies from the body's middle in each direction (the engine's bearing, 0 ahead,
// positive towards side +1): the skin point nearest that direction, in frame units.
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
// A scent's distance (body radii) as frame units beyond the skin, and back.
const smellSpan = () => Math.log(PROBE_LIMITS.most.smell / PROBE_LIMITS.least.smell);
const beyondSkin = distance =>
    PROBE_SCENE.span * Math.log(distance / PROBE_LIMITS.least.smell) / smellSpan();
const distanceAt = beyond =>
    PROBE_LIMITS.least.smell * Math.exp(clamp(beyond / PROBE_SCENE.span) * smellSpan());
// A strength as a share of the arrow's reach, and back.
const strengthShare = (strength, kind, faintest) =>
    Math.max(0, Math.log(Math.max(strength, faintest) / faintest) /
                    Math.log(PROBE_LIMITS.most[kind] / faintest));
const shareStrength = (share, kind, faintest) =>
    faintest * (PROBE_LIMITS.most[kind] / faintest) ** clamp(share);
// How far from the middle the handle of a probe stands.
function handleRadius(probe, faintest) {
  const P = PROBE_SCENE, angle = radians(probe.bearing), skin = skinDistance(angle);
  return probe.kind === 'smell'
             ? skin + beyondSkin(probe.distance)
             : skin + P.gap + P.reach * strengthShare(probe.strength, probe.kind, faintest);
}
// Where the probe's handle stands on the scene.
export const probeHandle = (probe, faintest) =>
    pointAt(radians(probe.bearing), handleRadius(probe, faintest));
// A point of the scene as the probe's bearing and distance or strength.
export function probePatch(kind, position, faintest) {
  const dx = position.x - BODY_MIDDLE.x, dy = position.y - BODY_MIDDLE.y;
  const angle = Math.atan2(dy, -dx), r = Math.hypot(dx, dy), bearing = degrees(angle);
  const beyond = r - skinDistance(angle);
  return kind === 'smell' ? {bearing, distance : distanceAt(beyond)} : {
    bearing,
    strength : shareStrength((beyond - PROBE_SCENE.gap) / PROBE_SCENE.reach, kind, faintest)
  };
}
// The rings round the body a scent's distance is read on, each named by its body lengths.
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
// The stimulus: a scent source as its icon amid its rings; a touch or a bite as an arrow onto the
// skin; a current as parallel streams onto the body.
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
  if (probe.kind === 'flow') {
    const d = bodyDirection(angle), across = {x : -d.y, y : d.x};
    const move = (p, shift) => ({x : p.x + across.x * shift, y : p.y + across.y * shift});
    const arrows = Array
                       .from({length : P.streams},
                             (_, k) => {
                               const shift = (k - (P.streams - 1) / 2) * P.across;
                               return '<path class="aid-probe-arrow flow" d="' +
                                      arrowPath(move(at, shift), move(onto, shift)) + '"/>';
                             })
                       .join('');
    // Particles drift with the water onto the body, the faster the stronger it streams.
    const F = P.particles, share = strengthShare(probe.strength, probe.kind, faintest);
    const seconds = F.slow + (F.fast - F.slow) * share;
    let particles = '';
    for (let lane = 0; lane < F.lanes; ++lane) {
      const shift = (lane - (F.lanes - 1) / 2) * P.across * F.spread;
      const from = move(at, shift), to = move(onto, shift);
      for (let k = 0; k < F.per; ++k)
        particles += '<circle class="aid-probe-particle" r="' + fixed(F.size / zoom) +
                     '"><animateMotion path="M' + fixed(from.x) + ' ' + fixed(from.y) + ' L' +
                     fixed(to.x) + ' ' + fixed(to.y) + '" dur="' + fixed(seconds) + 's" begin="-' +
                     fixed(seconds * (k + lane / F.lanes) / F.per) +
                     's" repeatCount="indefinite"/></circle>';
    }
    return arrows + particles;
  }
  return '<path class="aid-probe-arrow ' + probe.kind + '" d="' + arrowPath(at, onto) + '"/>';
}
// What the organ and its twin answer to the probe, from the design view: on each side the
// strongest of its nodes (a nose's by the profile that smells it best, named in its title).
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
// The probe on the fish, while its organ (or a node of it) is chosen; nothing else.
export function senseProbeSvg(state) {
  const probe = state.senseProbe, faintest = state.anatomy?.lightDimmest;
  const organ = probe ? findOrgan(state.document, probe.organ) : null;
  if (!organ || !isChosen(state.selected, organ) || !(faintest > 0))
    return '';
  const zoom = zoomOf(state), at = probeHandle(probe, faintest);
  return '<g class="aid-sense-probe ' + probe.kind + '">' + stimulusSvg(probe, faintest, zoom) +
         answerSvg(state, organ, zoom) + '<g class="aid-probe-handle" data-sense-handle="' +
         escapeText(organ.id) + '"' + steadyAt(at, zoom) + '><title>' +
         escapeText(t('studio.probe.handle.' + probe.kind)) + '</title><circle r="' +
         (probe.kind === 'smell' ? PROBE_SCENE.source : PROBE_SCENE.handle) + '"/></g></g>';
}
// The scents a nose's probe can carry, chosen above the scene while it is shown.
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
// How far the probe's field reaches from the body's middle (frame units), for fitting the view.
export const probeReach = kind =>
    BODY_RADIUS + (kind === 'smell' ? PROBE_SCENE.span : PROBE_SCENE.gap + PROBE_SCENE.reach);
