import {ATELIER_LIMITS} from '../../schema.js';
import {clamp} from '../../units.js';
import {enduranceCurve, fibreHex, fibreForce} from '../../fibre.js';
import {isFibrous, muscleFibre} from '../model/document.js';
import {sideOf} from '../model/layout.js';
import {escapeText, fixed} from './markup.js';
import {t} from '../../strings.js';

const T = Object.freeze({
  width : 300,
  height : 232,
  left : 26,
  span : 248,
  least : 64,
  middle : 66,
  thin : 12,
  thick : 42,
  curveTop : 142,
  curveBase : 218,
  steps : 360
});
const dimensions = (organ, most) => ({
  length : T.least + (T.span - T.least) * (organ.centers.length - 1) / Math.max(1, most - 1),
  half : T.thin + (T.thick - T.thin) * ((organ.centers[0]?.copies ?? 1) - 1) /
                      (ATELIER_LIMITS.max_copies - 1)
});
const curveY = force => T.curveBase - (T.curveBase - T.curveTop) * force / fibreForce(1);
export function muscleTissuePatch(name, fx, fy, most, organ) {
  const x = fx * T.width, y = fy * T.height;
  if (name === 'nodes')
    return {
      nodes : 1 + Math.round(clamp((x - T.left - T.least) / (T.span - T.least)) * (most - 1))
    };
  if (name === 'strength')
    return {
      copies : 1 + Math.round(clamp(((T.middle - y) / .75 - T.thin) / (T.thick - T.thin)) *
                              (ATELIER_LIMITS.max_copies - 1))
    };
  if (name === 'sprint')
    return {sprint : 1 - clamp((x - T.left) / dimensions(organ, most).length)};
  if (name !== 'fibre')
    return null;
  const step = Math.round(clamp((x - T.left) / T.span) * (T.steps - 1));
  let best = 0, error = Infinity;
  for (let i = 0; i <= 100; i++) {
    const distance = Math.abs(curveY(enduranceCurve(i / 100, step + 1)[step]) - y);
    if (distance < error) {
      error = distance;
      best = i / 100;
    }
  }
  return {fibre : best};
}
export function muscleTissue(organ, code, most) {
  const {length, half} = dimensions(organ, most), count = organ.centers.length;
  const copies = organ.centers[0]?.copies ?? 1, fast = muscleFibre(organ),
        fibrous = isFibrous(organ);
  const x1 = T.left, x2 = x1 + length, mid = (x1 + x2) / 2,
        split = x1 + length * (1 - (organ.sprint ?? 0));
  const word = (key, values) => t('studio.muscle.' + key, values);
  const grip = (name, x, y, title) => '<circle class="aid-graphic-handle" data-effector-handle="' +
                                      name + '" cx="' + fixed(x) + '" cy="' + fixed(y) +
                                      '" r="5.5"><title>' + escapeText(title) + '</title></circle>';
  const shell = 'M' + x1 + ' ' + T.middle + ' C' + x1 + ' ' + (T.middle - half) + ' ' + x2 + ' ' +
                (T.middle - half) + ' ' + x2 + ' ' + T.middle + ' C' + x2 + ' ' +
                (T.middle + half) + ' ' + x1 + ' ' + (T.middle + half) + ' ' + x1 + ' ' + T.middle +
                'Z';
  let fibres = '';
  for (let k = 0; k < count; k++) {
    const x = x1 + length * (k + .5) / count,
          spread = Math.sin(Math.PI * (k + .5) / count) * half * .75;
    for (let j = 0; j < copies; j++) {
      const y = T.middle + spread * (2 * (j + .5) / copies - 1);
      fibres += '<path class="aid-tissue-fibre' + (x >= split ? ' reserve' : '') + '" d="M' +
                fixed(x - length / count * .35) + ' ' + fixed(y) + 'q' +
                fixed(length / count * .35) + ' -2 ' + fixed(length / count * .7) + ' 0" stroke="' +
                fibreHex(((k * copies + j) * .618) % 1 < fast ? 1 : 0) + '"/>';
    }
  }
  const curve = value => {
    const values = enduranceCurve(value, T.steps);
    return 'M' + values.filter((_, k) => k % 6 === 0 || k === T.steps - 1)
                     .map((v, k, a) =>
                              fixed(T.left + T.span * k / (a.length - 1)) + ' ' + fixed(curveY(v)))
                     .join(' L');
  };
  const tip =
      word('nodes', {count, most}) + ' · ' +
      word('strength', {share : Math.round(copies / ATELIER_LIMITS.max_copies * 100) + '%'});
  return '<svg class="aid-muscle-tissue" viewBox="0 0 ' + T.width + ' ' + T.height +
         '" data-effector-graphic="' + escapeText(organ.id) + '" data-effector-code="' + code +
         '" data-effector-side="' + sideOf(organ) + '"><title>' + escapeText(tip) + '</title>' +
         '<path class="aid-tissue-sheath" d="' + shell + '"/>' + fibres +
         grip('nodes', x2, T.middle, word('nodesHandle')) +
         grip('strength', mid, T.middle - half * .75, word('strengthHandle')) +
         (organ.type === 'muscle' ? '<path class="aid-tissue-partition" d="M' + fixed(split) + ' ' +
                                        (T.middle - half) + 'V' + (T.middle + half) + '"/>' +
                                        grip('sprint', split, T.middle + half, word('sprintHandle'))
                                  : '') +
         (fibrous
              ? '<path class="aid-tissue-projection" d="M' + mid + ' ' + (T.middle + half + 6) +
                    ' Q' + mid + ' 132 ' + T.left + ' ' + T.curveTop + '"/>' +
                    '<path class="aid-chart-axis" d="M' + T.left + ' ' + T.curveTop + 'V' +
                    T.curveBase + 'H' + (T.left + T.span) + '"/>' +
                    [ 0, 1 ]
                        .map(f => '<path class="aid-fibre-curve reference" d="' + curve(f) + '"/>')
                        .join('') +
                    '<path class="aid-fibre-curve chosen" stroke="' + fibreHex(fast) + '" d="' +
                    curve(fast) + '"/>' +
                    '<path class="aid-tissue-curve-hit" data-effector-handle="fibre" d="' +
                    curve(fast) + '"><title>' + escapeText(word('fibre.handle')) +
                    '</title></path>' +
                    '<g class="aid-tissue-clock" transform="translate(278 204)"><circle r="7"/><path d="M0-4V0L3 2"/></g>'
              : '') +
         '</svg>';
}
