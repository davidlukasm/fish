// What a nerve and a bundle of several wires are made of, as pictures. A nerve: its bundles come
// in from their organs on the left, run as one through the nerve, half as thick as they are
// together, and leave for their organs on the right, each in its own thickness. A bundle: it splits
// into as many fibres at each end as it reaches nodes there. Every bundle and wire is chosen by a
// click on it.
import {t} from '../../strings.js';
import {findCenter, findOrgan} from '../model/document.js';
import {centerTitle, organTitle} from './names.js';
import {escapeText, fixed} from './markup.js';
import {heading} from './kit.js';
import {bundleSpec, chosenStrand, nerveLook, strandColour} from './wires.js';

const word = (key, values) => t('studio.strand.' + key, values);
// The picture's units: a strand of one body unit is drawn `scale` wide.
export const STRAND_PICTURE = Object.freeze({
  width : 300,
  top : 8,
  row : 34,
  label : 11,
  line : 22,
  enter : 118,
  trunk : [ 132, 168 ],
  leave : 182,
  scale : 3,
  fan : {from : 92, to : 208, spread : 22, step : 3},
  end : 4
});
const P = STRAND_PICTURE;
const endName = (doc, sites, id) => {
  const organ = findOrgan(doc, id);
  if (organ)
    return organTitle(organ, sites);
  const found = findCenter(doc, id);
  return found ? (found.organ.type === 'brain' ? centerTitle(found.center)
                                               : organTitle(found.organ, sites))
               : '';
};
const wireIds = bundle => [...new Set(bundle.ends.map(e => e.link.wire.id))];
const pick = bundle => {
  const own = wireIds(bundle);
  return own.length === 1 ? 'data-select-wire="' + escapeText(own[0]) + '"'
                          : 'data-select-bundle="' + escapeText(bundleSpec(bundle)) + '"';
};
const text = (x, y, content, anchor) => '<text x="' + fixed(x) + '" y="' + fixed(y) +
                                        '" text-anchor="' + anchor + '">' + escapeText(content) +
                                        '</text>';
const unbend = (ids, bent) =>
    bent ? '<div class="aid-inspector-actions"><button data-unbend-wires="' +
               escapeText(ids.join(' ')) + '">' + escapeText(word('unbend')) + '</button></div>'
         : '';

// Bundles between the same organs (the copies of a paired wire on both sides) share one row.
function nerveRows(state, nerve) {
  const rows = new Map();
  for (const b of nerve.members) {
    const from = endName(state.document, state.sites, b.ends[0].link.from),
          to = endName(state.document, state.sites, b.ends[0].link.to);
    const key = from + '>' + to + '>' + b.kind;
    if (!rows.has(key))
      rows.set(key, {from, to, bundles : []});
    rows.get(key).bundles.push(b);
  }
  return [...rows.values() ];
}
function nervePicture(state, nerve) {
  const look = nerveLook(nerve), rows = nerveRows(state, nerve), n = rows.length;
  const height = P.top + n * P.row, middle = P.top + n * P.row / 2;
  const drawn = rows.map(({from, to, bundles}, k) => {
    const y = P.top + k * P.row + P.line, b = bundles[0];
    const d = 'M' + P.end + ' ' + y + ' C' + P.enter * .7 + ' ' + y + ' ' + P.enter * .8 + ' ' +
              fixed(middle) + ' ' + P.trunk[0] + ' ' + fixed(middle) + ' H' + P.trunk[1] + ' C' +
              (P.width - P.enter * .8) + ' ' + fixed(middle) + ' ' + (P.width - P.enter * .7) +
              ' ' + y + ' ' + (P.width - P.end) + ' ' + y;
    const copies = bundles.length > 1 ? ' ×' + bundles.length : '';
    return {
      line : '<g class="aid-strand-row" ' + pick(b) + ' role="button" tabindex="0">' +
                 '<path class="aid-strand-hit" d="' + d + '"/><path class="aid-strand-line" d="' +
                 d + '" stroke="' + strandColour(b.kind) + '" stroke-width="' +
                 fixed(b.width * P.scale) + '"/></g>',
      words : text(P.end, y - P.label * .6, from + copies, 'start') +
                  text(P.width - P.end, y - P.label * .6, to, 'end')
    };
  });
  const trunk = '<path class="aid-strand-trunk" d="M' + (P.trunk[0] - 6) + ' ' + fixed(middle) +
                ' H' + (P.trunk[1] + 6) + '" stroke="' + look.colour + '" stroke-width="' +
                fixed(look.width * P.scale) + '"/>';
  // The names lie above every line, so that no line crosses out a name.
  return '<svg class="aid-strand-picture" viewBox="0 0 ' + P.width + ' ' + height +
         '" role="group" aria-label="' + escapeText(word('nerve')) + '">' +
         drawn.map(r => r.line).join('') + trunk + drawn.map(r => r.words).join('') + '</svg>';
}
// One bundle, its fibres fanning out at both ends, as many as it reaches nodes there.
function bundlePicture(state, bundle) {
  const doc = state.document, link = bundle.ends[0].link;
  const count = side =>
      new Set(bundle.ends.flatMap(e => e[side]).map(p => p.x.toFixed(2) + ' ' + p.y.toFixed(2)))
          .size;
  const starts = count('starts'), arrives = count('arrives');
  const middle = P.top + P.row, width = bundle.width * P.scale, colour = strandColour(bundle.kind);
  const fan = (n, x0, x1) =>
      Array
          .from({length : n},
                (_, i) => {
                  const y = middle + (n > 1 ? (i / (n - 1) - .5) * 2 * P.fan.spread : 0),
                        at = middle + (i + .5 - n / 2) * width / Math.max(1, n);
                  return '<path d="M' + x0 + ' ' + fixed(y) + ' C' + fixed((x0 + x1) / 2) + ' ' +
                         fixed(y) + ' ' + fixed((x0 + x1) / 2) + ' ' + fixed(at) + ' ' + x1 + ' ' +
                         fixed(at) + '" stroke-width="' +
                         fixed(Math.max(.6, width / Math.max(1, n))) + '"/>';
                })
          .join('');
  return '<svg class="aid-strand-picture" viewBox="0 0 ' + P.width + ' ' +
         (middle + P.fan.spread + P.label + P.top) + '" role="img" aria-label="' +
         escapeText(word('bundle')) + '"><g class="aid-strand-fibres" stroke="' + colour + '">' +
         fan(starts, P.end, P.fan.from) + fan(arrives, P.width - P.end, P.fan.to) + '</g>' +
         '<path class="aid-strand-line" d="M' + P.fan.from + ' ' + middle + ' H' + P.fan.to +
         '" stroke="' + colour + '" stroke-width="' + fixed(width) + '"/>' +
         text(P.end, P.top + P.label, endName(doc, state.sites, link.from), 'start') +
         text(P.width - P.end, P.top + P.label, endName(doc, state.sites, link.to), 'end') +
         text(P.end, middle + P.fan.spread + P.label + 2, word('fibreCount', {n : starts}),
              'start') +
         text(P.width - P.end, middle + P.fan.spread + P.label + 2,
              word('fibreCount', {n : arrives}), 'end') +
         '</svg>';
}
function bundleInspector(state, bundle) {
  const doc = state.document;
  const wires = wireIds(bundle).map(id => doc.wires.find(w => w.id === id)).filter(Boolean);
  return '<header class="aid-inspector-head"><span>' + escapeText(word('bundle')) + '</span>' +
         heading(t('studio.app.wireCount', {n : wires.length})) + '</header>' +
         bundlePicture(state, bundle) + '<div class="aid-assembly-list">' +
         wires
             .map(w => '<button data-select-wire="' + escapeText(w.id) + '">' +
                       escapeText(endName(doc, state.sites, w.from) + ' → ' +
                                  endName(doc, state.sites, w.to)) +
                       '</button>')
             .join('') +
         '</div>' + unbend(wires.map(w => w.id), bundle.bends.length > 0);
}
function nerveInspector(state, nerve) {
  return '<header class="aid-inspector-head"><span>' + escapeText(word('nerve')) + '</span>' +
         heading(t('studio.app.nerveTitle', {n : nerve.members.length})) + '</header>' +
         nervePicture(state, nerve) +
         unbend(nerve.members.flatMap(wireIds), nerve.members.some(b => b.bends.length));
}
export function strandInspector(state) {
  const {bundle, nerve} = chosenStrand(state);
  return bundle  ? bundleInspector(state, bundle)
         : nerve ? nerveInspector(state, nerve)
                 : '<header class="aid-inspector-head">' + heading(word('gone')) + '</header>';
}
