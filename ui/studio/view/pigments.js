import {organTypes} from '../model/document.js';
import {cssColour, pigmentColour} from '../model/pigment.js';
import {BODY_FRAME} from '../model/layout.js';
import {skinAt} from './frame.js';
import {fixed} from './markup.js';

const DOTS = Object.freeze({step : 44, ends : [ 1, 2 ], inset : 16, least : 1.6, most : 8});
export function chromatophoresSvg(state, organ, chosen) {
  const types = organTypes(organ);
  const total = types.reduce((n, type) => n + type.centers.length, 0);
  if (!total)
    return '';
  const kinds = types.flatMap(
      type => Array(type.centers.length).fill(cssColour(pigmentColour(type.centers[0]))));
  let html = '', k = 0;
  const [front, back] = DOTS.ends.map(n => n * DOTS.step);
  for (let x = BODY_FRAME.snout + front; x <= BODY_FRAME.tail - back; x += DOTS.step) {
    const top = skinAt(x, -1) + DOTS.inset, bottom = skinAt(x, 1) - DOTS.inset;
    for (let y = top + ((x / DOTS.step) % 2) * DOTS.step / 2; y <= bottom; y += DOTS.step) {
      const colour = kinds[k++ % kinds.length];
      html += (chosen ? '<circle class="spread" cx="' + fixed(x) + '" cy="' + fixed(y) + '" r="' +
                            DOTS.most + '" style="fill:' + colour + '"/>'
                      : '') +
              '<circle class="gathered" cx="' + fixed(x) + '" cy="' + fixed(y) + '" r="' +
              DOTS.least + '" style="fill:' + colour + '"/>';
    }
  }
  return '<g class="aid-chromatophores' + (chosen ? ' chosen' : '') + '">' + html + '</g>';
}
