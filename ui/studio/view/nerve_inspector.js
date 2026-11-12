// What a bundle of several wires and a nerve of several bundles are made of: a bundle lists its
// wires and how many fibres it splits into at each end, a nerve its bundles; each entry opens its
// own inspector. Both say how to bend them as one.
import {linkText, t} from '../../strings.js';
import {endpointTitle} from './names.js';
import {escapeText} from './markup.js';
import {heading} from './kit.js';
import {bundleSpec, chosenStrand} from './wires.js';

const word = (key, values) => t('studio.strand.' + key, values);
const nodeCount = list => new Set(list.map(p => p.x.toFixed(2) + ' ' + p.y.toFixed(2))).size;
const ends = (doc, sites, bundle) =>
    linkText(endpointTitle(doc, bundle.ends[0].link.from, sites, bundle.ends[0].link.wire.fromPort),
             endpointTitle(doc, bundle.ends[0].link.to, sites, bundle.ends[0].link.wire.toPort));
const wireIds = bundle => [...new Set(bundle.ends.map(e => e.link.wire.id))];
const unbend = (ids, bent) =>
    bent ? '<div class="aid-inspector-actions"><button data-unbend-wires="' +
               escapeText(ids.join(' ')) + '">' + escapeText(word('unbend')) + '</button></div>'
         : '';

function bundleInspector(state, bundle) {
  const doc = state.document;
  const wires = wireIds(bundle).map(id => doc.wires.find(w => w.id === id)).filter(Boolean);
  const starts = nodeCount(bundle.ends.flatMap(e => e.starts)),
        arrives = nodeCount(bundle.ends.flatMap(e => e.arrives));
  return '<header class="aid-inspector-head"><span>' + escapeText(word('bundle')) + '</span>' +
         heading(ends(doc, state.sites, bundle)) + '</header>' +
         '<p class="aid-strand-note">' + escapeText(word('fibres', {starts, arrives})) + '</p>' +
         '<div class="aid-assembly-list">' +
         wires
             .map(w => '<button data-select-wire="' + escapeText(w.id) + '">' +
                       escapeText(linkText(endpointTitle(doc, w.from, state.sites, w.fromPort),
                                           endpointTitle(doc, w.to, state.sites, w.toPort))) +
                       '</button>')
             .join('') +
         '</div><p class="aid-strand-note">' + escapeText(word('bend')) + '</p>' +
         unbend(wires.map(w => w.id), bundle.bends.length > 0);
}
function nerveInspector(state, nerve) {
  const doc = state.document, ids = nerve.members.flatMap(wireIds);
  return '<header class="aid-inspector-head"><span>' + escapeText(word('nerve')) + '</span>' +
         heading(t('studio.app.nerveTitle', {n : nerve.members.length})) + '</header>' +
         '<p class="aid-strand-note">' + escapeText(word('nerveMeaning')) + '</p>' +
         '<div class="aid-assembly-list">' +
         nerve.members
             .map(b => {
               const own = wireIds(b);
               const pick = own.length === 1 ? 'data-select-wire="' + escapeText(own[0])
                                             : 'data-select-bundle="' + escapeText(bundleSpec(b));
               return '<button ' + pick + '">' + escapeText(ends(doc, state.sites, b)) +
                      (own.length > 1
                           ? ' · ' + escapeText(t('studio.app.wireCount', {n : own.length}))
                           : '') +
                      '</button>';
             })
             .join('') +
         '</div><p class="aid-strand-note">' + escapeText(word('bendNerve')) + '</p>' +
         unbend(ids, nerve.members.some(b => b.bends.length));
}
export function strandInspector(state) {
  const {bundle, nerve} = chosenStrand(state);
  return bundle  ? bundleInspector(state, bundle)
         : nerve ? nerveInspector(state, nerve)
                 : '<header class="aid-inspector-head">' + heading(word('gone')) + '</header>';
}
