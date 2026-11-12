import {ATELIER_LIMITS} from '../../schema.js';
import {clamp} from '../../units.js';
import {wiredCrossing} from '../model/document.js';
import {centerMarker} from './scene.js';
import {responseSvg} from './response.js';
import {escapeText, fixed} from './markup.js';
import {cellWords, label} from './kit.js';

const TISSUE = Object.freeze({
  width : 360,
  height : 220,
  x : 82,
  y : 87,
  radius : 20,
  spread : 24,
  near : 164,
  far : 326,
  own : 68,
  other : 178
});
const tissueRadius = center =>
    TISSUE.radius +
    TISSUE.spread * Math.sqrt((center.copies - 1) / (ATELIER_LIMITS.max_copies - 1));
export function nerveTissuePatch(state, center, handle, fx, fy) {
  const T = TISSUE;
  if (handle === 'copies') {
    const radius = Math.hypot(fx * T.width - T.x, fy * T.height - T.y);
    return {
      copies : 1 + Math.round(clamp((radius - T.radius) / T.spread) ** 2 *
                              (ATELIER_LIMITS.max_copies - 1))
    };
  }
  if (handle !== 'reach')
    return null;
  const range = clamp((fx * T.width - T.near) / (T.far - T.near));
  return wiredCrossing(state.document, center, state.sites) === null
             ? {range, crossing : 2 * clamp((fy * T.height - T.own) / (T.other - T.own)) - 1}
             : {range};
}
function tissue(state, center) {
  const T = TISSUE, r = tissueRadius(center);
  const fixedSide = wiredCrossing(state.document, center, state.sites),
        crossing = fixedSide ?? center.crossing, end = T.near + (T.far - T.near) * center.range;
  const least = state.capabilities?.reachLeast ?? 0, reach = least + (1 - least) * center.range;
  const grip = (key, x, y, title) => '<circle class="aid-graphic-handle" data-nerve-handle="' +
                                     key + '" cx="' + fixed(x) + '" cy="' + fixed(y) +
                                     '" r="7"><title>' + escapeText(title) + '</title></circle>';
  let cells = '', fibres = '';
  for (let i = 0; i < center.copies; i++) {
    const a = i * 2.39996323,
          distance = center.copies === 1 ? 0 : (r - 9) * Math.sqrt(i / (center.copies - 1));
    const x = T.x + distance * Math.cos(a), y = T.y + distance * Math.sin(a);
    fibres += '<path d="M18 87C41 87 ' + fixed(x - 15) + ' ' + fixed(y) + ' ' + fixed(x) + ' ' +
              fixed(y) + 'S130 110 148 110"/>';
    cells += '<g transform="translate(' + fixed(x) + ' ' + fixed(y) + ')">' +
             centerMarker(center, 5.5) + '</g>';
  }
  const boundary = 'M' + (T.x - r) + ' ' + T.y + 'C' + (T.x - r) + ' ' + (T.y - r * .9) + ' ' +
                   (T.x - r * .4) + ' ' + (T.y - r) + ' ' + T.x + ' ' + (T.y - r) + 'S' +
                   (T.x + r * 1.16) + ' ' + (T.y - r * .3) + ' ' + (T.x + r) + ' ' + T.y + 'S' +
                   (T.x + r * .2) + ' ' + (T.y + r) + ' ' + T.x + ' ' + (T.y + r) + 'S' +
                   (T.x - r) + ' ' + (T.y + r * .3) + ' ' + (T.x - r) + ' ' + T.y + 'Z';
  const ends =
      [ -1, 1 ]
          .map(side => {
            const y = side < 0 ? T.own : T.other, affinity = clamp(1 + side * crossing);
            let targets = '', branches = '';
            for (let i = 0; i < 4; i++) {
              const x = T.near + (T.far - T.near) * i / 3;
              targets += '<path class="aid-nerve-target" d="M' + fixed(x - 6) + ' ' + y +
                         'l6 -6 6 6 -6 6Z"/>';
              const opacity = affinity * Math.exp(-(i + 1) / 4 / Math.max(.001, reach));
              branches += '<path opacity="' + fixed(opacity) + '" d="M148 110C170 110 ' +
                          fixed(x - 32) + ' ' + y + ' ' + fixed(x - 7) + ' ' + y + '"/>';
            }
            const sign = center.sign < 0
                             ? '<path d="M' + fixed(end) + ' ' + (y - 7) + 'v14"/>'
                             : '<path d="M' + fixed(end - 6) + ' ' + (y - 5) + 'l6 5 -6 5"/>';
            return targets + branches + '<g opacity="' + fixed(affinity) + '">' + sign + '</g>';
          })
          .join('');
  const atY = T.own + (T.other - T.own) * (crossing + 1) / 2;
  return '<svg class="aid-nerve-tissue" data-nerve-tissue="' + escapeText(center.id) +
         '" x="0" y="0" width="360" height="220" viewBox="0 0 360 220">' +
         '<path class="aid-nerve-midline" d="M148 130H345"/>' +
         '<g class="aid-nerve-axons">' + fibres + ends + '</g>' +
         '<path class="aid-nerve-envelope" d="' + boundary + '"/>' + cells +
         grip('copies', T.x, T.y - r, cellWords(center)) + '<path class="aid-nerve-reach" d="M' +
         fixed(end) + ' ' + T.own + 'V' + T.other + '"/>' +
         grip('reach', end, atY, label('inspector.signalReach')) +
         (fixedSide === null
              ? ''
              : '<g class="aid-nerve-locked" transform="translate(' + fixed(end) + ' ' +
                    fixed(atY + 18) + ')"><title>' + label('inspector.sideByWires') +
                    '</title><path d="M-6 0h12M-6-3v6M6-3v6"/></g>') +
         '<path class="aid-nerve-to-trace" d="M18 87C4 122 8 178 18 220M148 110C108 154 130 193 130 220"/>' +
         '</svg>';
}
export function nerveEditor(state, center) {
  return '<div class="aid-nerve-editor">' +
         '<svg class="aid-nerve-picture" viewBox="0 0 360 440">' + tissue(state, center) +
         responseSvg(state, center)
             .replace('<svg ', '<svg x="0" y="220" width="360" height="220" ') +
         '</svg></div>';
}
