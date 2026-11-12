import {ATELIER_LIMITS} from '../../schema.js';
import {clamp} from '../../units.js';
import {t} from '../../strings.js';
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
  const shown = Math.min(4, center.copies);
  const rows =
      Array.from({length : shown}, (_, i) => shown === 1 ? T.y : T.y - r / 2 + i * r / (shown - 1));
  const cells = rows.map(y => '<g transform="translate(' + T.x + ' ' + fixed(y) + ')">' +
                              centerMarker(center, 5.5) + '</g>')
                    .join('');
  const fibres = rows.map(y => '<path d="M18 ' + fixed(y) + 'H' + (T.x - 7) + 'M' + (T.x + 7) +
                               ' ' + fixed(y) + 'H148"/>')
                     .join('');
  const word = (x, y, value, anchor = 'start') => '<text class="aid-nerve-word" x="' + x + '" y="' +
                                                  y + '" text-anchor="' + anchor + '">' +
                                                  escapeText(value) + '</text>';
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
              branches += '<path opacity="' + fixed(opacity) + '" d="M148 ' +
                          fixed(rows[i % rows.length]) + 'C170 ' + fixed(rows[i % rows.length]) +
                          ' ' + fixed(x - 32) + ' ' + y + ' ' + fixed(x - 7) + ' ' + y + '"/>';
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
         '<g class="aid-nerve-axons">' + fibres + ends + '</g>' + cells +
         word(T.x, 21, t('studio.nervePicture.cells', {n : center.copies}), 'middle') +
         word(18, 122, label('nervePicture.separatePaths')) +
         word(T.near, T.own - 16, label('inspector.sameSide')) +
         word(T.near, T.other - 16, label('inspector.oppositeSide')) +
         word(T.near, 202, label('nervePicture.near')) +
         word(T.far, 202, label('nervePicture.far'), 'end') +
         grip('copies', T.x, T.y - r, cellWords(center)) + '<path class="aid-nerve-reach" d="M' +
         fixed(end) + ' ' + T.own + 'V' + T.other + '"/>' +
         grip('reach', end, atY, label('inspector.signalReach')) +
         (fixedSide === null
              ? ''
              : '<g class="aid-nerve-locked" transform="translate(' + fixed(end) + ' ' +
                    fixed(atY + 18) + ')"><title>' + label('inspector.sideByWires') +
                    '</title><path d="M-6 0h12M-6-3v6M6-3v6"/></g>') +
         word(18, 218, label('nervePicture.possiblePaths')) + '</svg>';
}
export function nerveEditor(state, center) {
  return '<div class="aid-nerve-editor">' +
         '<svg class="aid-nerve-picture" viewBox="0 0 360 440">' + tissue(state, center) +
         responseSvg(state, center)
             .replace('<svg ', '<svg x="0" y="220" width="360" height="220" ') +
         '</svg></div>';
}
