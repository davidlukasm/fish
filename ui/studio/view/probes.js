import {allCenters, findOrgan} from '../model/document.js';
import {PROBE_KIND, PROBE_LIMITS} from '../model/probe.js';
import {BODY_FRAME} from '../model/layout.js';
import {bodyDirection, fishPath, skinPoints} from './frame.js';
import {arrowPath} from './lateral.js';
import {escapeText, fixed} from './markup.js';
import {ecologyIconSvg} from '../../feeding_view.js';
import {scentColors, scentIcons, scentNames} from '../../brain_model.js';
import {PERCENT} from '../../units.js';
import {t} from '../../strings.js';

// A sense probe in the organ's inspector: a small fish seen from above with the stimulus at its
// bearing around it (its handle sets the bearing and how far or strong) and how strongly each of
// the organ's nodes answers; a paired organ shows both sides.

// The field: the fish at SCALE of the frame in the middle, a scent as far from the body's centre
// as it lies; a touch, a bite or a current comes as an arrow ending GAP off the skin, as much
// longer up to REACH as it is strong on a log scale from the faintest stimulus (`faintest`, the
// design view's dimmest one) to the most.
export const PROBE_FIELD = Object.freeze({
  width : 300,
  height : 200,
  cx : 150,
  cy : 100,
  scale : .08,
  gap : 4,
  reach : 52,
  handle : 8,
  source : 11,
  icon : .62,
  skin_step : 4,
  stream : 9
});
const BODY_MIDDLE =
    Object.freeze({x : (BODY_FRAME.snout + BODY_FRAME.tail) / 2, y : BODY_FRAME.middle});
const bodyRadius = () => (BODY_FRAME.tail - BODY_FRAME.snout) / 2 * PROBE_FIELD.scale;
// How far the drawn skin lies from the body's middle in each direction (the engine's bearing,
// 0 ahead, positive towards side +1), on the field: the skin point nearest that direction.
let skinRing = null;
const skinAround = () => skinRing ??= skinPoints(PROBE_FIELD.skin_step).map(p => {
  const dx = p.x - BODY_MIDDLE.x, dy = p.y - BODY_MIDDLE.y;
  return {angle : Math.atan2(dy, -dx), r : Math.hypot(dx, dy) * PROBE_FIELD.scale};
});
function skinDistance(bearing) {
  const turn = a => Math.abs(Math.atan2(Math.sin(a - bearing), Math.cos(a - bearing)));
  return skinAround().reduce((best, p) => (turn(p.angle) < turn(best.angle) ? p : best)).r;
}
const radians = degrees => degrees * Math.PI / 180;
const fieldPoint = (angle, r) => {
  const d = bodyDirection(angle);
  return {x : PROBE_FIELD.cx + d.x * r, y : PROBE_FIELD.cy + d.y * r};
};
// A strength as a share of the arrow's reach, and back.
const strengthShare = (strength, kind, faintest) =>
    Math.max(0, Math.log(Math.max(strength, faintest) / faintest) /
                    Math.log(PROBE_LIMITS.most[kind] / faintest));
const shareStrength = (share, kind, faintest) =>
    faintest * (PROBE_LIMITS.most[kind] / faintest) ** Math.max(0, Math.min(1, share));
// How far from the middle the handle of a probe stands.
function handleRadius(probe, faintest) {
  const F = PROBE_FIELD, angle = radians(probe.bearing);
  return probe.kind === 'smell' ? probe.distance * bodyRadius()
                                : skinDistance(angle) + F.gap +
                                      F.reach * strengthShare(probe.strength, probe.kind, faintest);
}
// A pointer at (fx, fy), fractions of the field, as the probe's bearing and distance or strength.
export function probePatch(kind, fx, fy, faintest) {
  const F = PROBE_FIELD, dx = fx * F.width - F.cx, dy = fy * F.height - F.cy;
  const angle = Math.atan2(dy, -dx), r = Math.hypot(dx, dy), bearing = angle * 180 / Math.PI;
  const {least, most} = PROBE_LIMITS;
  return kind === 'smell'
             ? {bearing, distance : Math.max(least.smell, Math.min(most.smell, r / bodyRadius()))}
             : {
                 bearing,
                 strength :
                     shareStrength((r - skinDistance(angle) - F.gap) / F.reach, kind, faintest)
               };
}
// The stimulus: a scent source as its icon; a touch or a bite as an arrow onto the skin; a current
// as parallel streams past the whole fish.
function stimulusSvg(probe, faintest) {
  const F = PROBE_FIELD, angle = radians(probe.bearing), r = handleRadius(probe, faintest);
  const at = fieldPoint(angle, r);
  if (probe.kind === 'smell') {
    const colour = scentColors?.[probe.scent] ?? '';
    return '<g class="aid-probe-source" transform="translate(' + fixed(at.x) + ' ' + fixed(at.y) +
           ')"><circle r="' + F.source + '"/>' +
           ecologyIconSvg(scentIcons?.[probe.scent], colour, F.icon) + '</g>';
  }
  if (probe.kind === 'flow') {
    const d = bodyDirection(angle), across = {x : -d.y, y : d.x};
    return [ -1, 0, 1 ]
        .map(k => {
          const shift = {x : across.x * k * F.stream, y : across.y * k * F.stream};
          const from = {x : at.x + shift.x, y : at.y + shift.y};
          const to = fieldPoint(angle, skinDistance(angle) + F.gap);
          return '<path class="aid-probe-arrow flow" d="' +
                 arrowPath(from, {x : to.x + shift.x, y : to.y + shift.y}) + '"/>';
        })
        .join('');
  }
  return '<path class="aid-probe-arrow ' + probe.kind + '" d="' +
         arrowPath(at, fieldPoint(angle, skinDistance(angle) + F.gap)) + '"/>';
}
// What each node of the organ (and of its twin) answers to the probe, from the design view.
function answers(state, organ) {
  const centers = allCenters(state.document);
  const twin = organ.pair ? findOrgan(state.document, organ.pair) : null;
  return [ organ, twin ]
      .filter(Boolean)
      .sort((a, b) => a.side - b.side)
      .flatMap(o => o.centers.map(
                   (c, k) => ({
                     organ : o,
                     node : o.centers.length > 1 ? k + 1 : null,
                     value : state.anatomy?.senseProbe?.[centers.findIndex(x => x.id === c.id)]
                   })));
}
function answerRows(state, organ) {
  return answers(state, organ)
      .map(a => {
        const side =
            a.organ.side ? t('studio.inspector.side.' + (a.organ.side < 0 ? 'left' : 'right')) : '';
        const name = [ side, a.node ].filter(v => v !== null && v !== '').join(' · ');
        const known = Number.isFinite(a.value);
        return '<div class="aid-probe-row' + (a.organ.id === organ.id ? ' own' : '') + '"><span>' +
               escapeText(name) + '</span><span class="aid-probe-bar"><i style="width:' +
               (known ? fixed(Math.max(0, Math.min(1, a.value)) * PERCENT) : 0) +
               '%"></i></span><output>' + (known ? Math.round(a.value * PERCENT) + ' %' : '–') +
               '</output></div>';
      })
      .join('');
}
function scentChips(probe) {
  const F = PROBE_FIELD;
  return '<div class="aid-probe-scents">' +
         (scentNames ?? [])
             .map((name, k) => '<button type="button" data-probe-scent="' + k + '" class="' +
                               (k === probe.scent ? 'active' : '') + '" title="' +
                               escapeText(name) + '"><svg viewBox="-14 -14 28 28">' +
                               ecologyIconSvg(scentIcons?.[k], scentColors?.[k] ?? '', F.icon) +
                               '</svg></button>')
             .join('') +
         '</div>';
}
// The probe's block in the organ's inspector (empty while its probe is not the shown one); the
// controller redraws it as the design view answers.
export function probeField(state, organ) {
  const probe = state.senseProbe, F = PROBE_FIELD, kind = PROBE_KIND[organ.type];
  const faintest = state.anatomy?.lightDimmest;
  const block = '<div data-probe-block="' + escapeText(organ.id) + '">';
  if (!kind || probe?.organ !== organ.id || !(faintest > 0))
    return block + '</div>';
  const label = key => escapeText(t('studio.probe.' + key + '.' + kind));
  const fish = '<path class="aid-probe-fish" d="' + fishPath() + '" transform="translate(' +
               fixed(F.cx - BODY_MIDDLE.x * F.scale) + ' ' + fixed(F.cy - BODY_MIDDLE.y * F.scale) +
               ') scale(' + F.scale + ')"/>';
  const at = fieldPoint(radians(probe.bearing), handleRadius(probe, faintest));
  return block + '<section class="aid-eye-section"><h4>' + label('title') + '</h4>' +
         '<svg class="aid-probe-field" viewBox="0 0 ' + F.width + ' ' + F.height +
         '" data-probe-pad="' + escapeText(organ.id) + '" data-probe-kind="' + kind +
         '" role="img" aria-label="' + label('title') + '">' + fish + stimulusSvg(probe, faintest) +
         '<circle class="aid-graphic-handle' + (kind === 'smell' ? ' aid-probe-grip' : '') +
         '" data-probe-handle cx="' + fixed(at.x) + '" cy="' + fixed(at.y) + '" r="' +
         (kind === 'smell' ? F.source : F.handle) + '"><title>' + label('handle') +
         '</title></circle></svg>' + (kind === 'smell' ? scentChips(probe) : '') +
         '<div class="aid-probe-answers">' + answerRows(state, organ) + '</div></section></div>';
}
