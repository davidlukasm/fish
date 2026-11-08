import {clamp} from '../../units.js';
import {CPPN_OUTPUT} from '../../schema.js';
import {formatNumber, joinParts, linkText, t} from '../../strings.js';
import {escapeText} from './markup.js';
import {label} from './kit.js';

const typeLabels = [
  'bell', 'sine', 'cosine', 'linear', 'sign', 'sigmoid', 'cutoff', 'cubic', 'absolute', 'step',
  'gate'
];
const nodeTitle = (id, shape) => id < shape.cppnInputs ? label('cppnInputs.' + id)
                                 : id < shape.cppnInputs + shape.cppnOutputs
                                     ? label('cppnOutputs.' + (id - shape.cppnInputs))
                                     : t('units.numbered', {name : label('cppn.hidden'), n : id});
export const CPPN_GATE = typeLabels.indexOf('gate');
export const DEFAULT_CPPN_NODE_TYPE = typeLabels.indexOf('linear');
const nodeTypeLabel = type => label('cppnFunctions.' + typeLabels[type]);
function scopeOutputs(scope, shape) {
  const inputs = shape.cppnInputs;
  return Array.from({length : shape.cppnOutputs}, (_, i) => i + inputs).filter(id => {
    const output = id - inputs;
    return scope === 'all' || (scope === 'traits' && output >= CPPN_OUTPUT.spread_physiology) ||
           (scope === 'cells' && output <= CPPN_OUTPUT.identity4) ||
           (scope === 'traits' && output >= CPPN_OUTPUT.capacity &&
            output <= CPPN_OUTPUT.quality_width) ||
           (scope === 'traits' && output === CPPN_OUTPUT.synapse_strength) ||
           (scope === 'addresses' && output >= CPPN_OUTPUT.sender1 && output <= CPPN_OUTPUT.range);
  });
}
function incomingLinks(cppn) {
  const incoming = new Map();
  for (const link of cppn.links.map(cppnLink))
    if (link.enabled)
      incoming.set(link.to, [...(incoming.get(link.to) ?? []), link.from ]);
  return incoming;
}
function shownNodes(requested, incoming, inputCount, selection) {
  const included = new Set([...requested, ...Array.from({length : inputCount}, (_, i) => i) ]);
  if (selection?.kind === 'node')
    included.add(selection.id);
  const traced = new Set();
  const ancestors = id => {
    if (traced.has(id))
      return;
    traced.add(id);
    for (const from of incoming.get(id) ?? []) {
      included.add(from);
      ancestors(from);
    }
  };
  for (const id of requested)
    ancestors(id);
  return included;
}
function linkDepth(incoming, inputCount) {
  const layer = new Map(), visit = new Set();
  const depth = id => {
    if (layer.has(id))
      return layer.get(id);
    if (id < inputCount || visit.has(id))
      return 0;
    visit.add(id);
    const value = 1 + Math.max(0, ...(incoming.get(id) ?? []).map(depth));
    visit.delete(id);
    layer.set(id, value);
    return value;
  };
  return depth;
}
function project(report, scope, shape, selection = null) {
  const cppn = report.cppn, inputCount = shape.cppnInputs;
  const nodes = new Map(cppn.nodes.map(n => [n[0], n]));
  const requested = scopeOutputs(scope, shape), incoming = incomingLinks(cppn);
  const included = shownNodes(requested, incoming, inputCount, selection);
  const depth = linkDepth(incoming, inputCount);
  for (const id of included)
    depth(id);
  const G = CPPN_GRAPH, last = Math.max(G.columns - 1, ...requested.map(id => depth(id) + 1));
  const columns = new Map();
  for (const id of included) {
    if (!nodes.has(id))
      continue;
    const column = id < inputCount          ? 0
                   : requested.includes(id) ? last
                                            : Math.min(last - 1, depth(id));
    columns.set(column, [...(columns.get(column) ?? []), id ]);
  }
  const height =
      Math.max(G.height, G.row * Math.max(...[...columns.values()].map(ids => ids.length)));
  const width = G.column * (last + 1) + G.margin;
  const points = new Map();
  for (const [column, ids] of columns) {
    ids.sort((a, b) => a - b);
    ids.forEach((id, index) => {
      points.set(id, {x : column * G.column + G.left, y : (index + 1) * height / (ids.length + 1)});
    });
  }
  return {nodes, points, width, height};
}
const CPPN_GRAPH = Object.freeze({
  column : 260,
  left : 110,
  columns : 4,
  row : 70,
  height : 740,
  margin : 100,
  node : 24,
  reach : .43,
  ink : {least : 1, most : 4, per_weight : 1.7},
  glyphs : {
    output : '<path d="M-24 -18 L18 -18 L25 0 L18 18 L-24 18 Z"/>',
    input : '<rect x="-24" y="-17" width="48" height="34" rx="8"/>',
    hidden : '<circle r="22"/>'
  },
  number : 4,
  caption : 37
});
export const cppnLink = ([ id, from, to, weight, enabled, port ]) =>
    ({id, from, to, weight, enabled, port});
export const cppnNode = ([ id, type, parameter, role ]) => ({id, type, parameter, role});
export const findCppnNode = (report, id) => {
  const row = report?.cppn?.nodes.find(n => n[0] === id);
  return row ? cppnNode(row) : null;
};
export const findCppnLink = (report, id) => {
  const row = report?.cppn?.links.find(e => e[0] === id);
  return row ? cppnLink(row) : null;
};
function edgePath(a, b) {
  const G = CPPN_GRAPH, reach = (b.x - a.x) * G.reach;
  return 'M' + (a.x + G.node) + ' ' + a.y + ' C' + (a.x + G.node + reach) + ' ' + a.y + ' ' +
         (b.x - G.node - reach) + ' ' + b.y + ' ' + (b.x - G.node) + ' ' + b.y;
}
export function cppnGraph(state) {
  if (!state.report?.cppn)
    return '<div class="aid-cppn-empty">' + label('cppn.empty') + '</div>';
  const selection = state.cppnSelection, shape = state.capabilities;
  const view = project(state.report, state.cppnScope, shape, selection);
  const active = new Set(view.points.keys());
  const edges =
      state.report.cppn.links.map(cppnLink)
          .filter(e => active.has(e.from) && active.has(e.to))
          .map(({id, from, to, weight, enabled, port}) => {
            const path = edgePath(view.points.get(from), view.points.get(to));
            const selected = selection?.kind === 'link' && selection.id === id;
            return '<g class="aid-cppn-link ' + (selected ? 'selected' : '') +
                   (enabled ? (weight < 0 ? ' inhibitory' : ' excitatory') : ' disabled') +
                   (port ? ' control-port' : '') + '" data-cppn-link="' + id + '">' +
                   '<path d="' + path + '" class="aid-cppn-link-ink" stroke-width="' +
                   clamp(Math.abs(weight) * CPPN_GRAPH.ink.per_weight, CPPN_GRAPH.ink.least,
                         CPPN_GRAPH.ink.most) +
                   '"/>' +
                   '<path d="' + path + '" class="aid-cppn-link-hit"/>' +
                   '<title>' + escapeText(joinParts([
                     linkText(nodeTitle(from, shape), nodeTitle(to, shape)),
                     formatNumber(weight, 2, true)
                   ])) +
                   '</title></g>';
          })
          .join('');
  const nodes =
      [...view.points.entries() ]
          .map(([ id, point ]) => {
            const node = view.nodes.get(id), input = id < shape.cppnInputs;
            const output = id >= shape.cppnInputs && id < shape.cppnInputs + shape.cppnOutputs;
            const selected = selection?.kind === 'node' && selection.id === id;
            const type = output ? 'output' : input ? 'input' : 'hidden';
            const glyph = CPPN_GRAPH.glyphs[type];
            return '<g data-cppn-node="' + id + '" class="aid-cppn-node ' + type +
                   (selected ? ' selected' : '') + '" transform="translate(' + point.x + ' ' +
                   point.y + ')">' + glyph + '<text text-anchor="middle" y="' + CPPN_GRAPH.number +
                   '" class="aid-cppn-node-number">' +
                   (input || output ? label('cppn.' + type + 'Mark')
                                    : formatNumber(cppnNode(node).parameter, CPPN_DIGITS)) +
                   '</text>' +
                   '<text class="aid-cppn-node-caption" text-anchor="middle" y="' +
                   CPPN_GRAPH.caption + '">' + escapeText(nodeTitle(id, shape)) + '</text></g>';
          })
          .join('');
  return '<div class="aid-cppn-scroll"><svg class="aid-cppn-diagram" viewBox="0 0 ' + view.width +
         ' ' + view.height + '" width="' + view.width + '" height="' + view.height +
         '" role="img" aria-label="' + label('cppn.graph') + '">' +
         '<g class="aid-cppn-edges">' + edges + '</g>' + nodes + '</svg></div>';
}
const CPPN_STEP = Object.freeze({weight : .1, parameter : .05});
const CPPN_DIGITS = 2;
const limits = (shape, step) =>
    'min="' + -shape.cppnLimit + '" max="' + shape.cppnLimit + '" step="' + step + '"';
function options(values, selected) {
  return values
      .map(([ value, name ]) => '<option value="' + escapeText(value) + '"' +
                                (String(value) === String(selected) ? ' selected' : '') + '>' +
                                escapeText(name) + '</option>')
      .join('');
}
export function cppnInspector(state) {
  const selected = state.cppnSelection, shape = state.capabilities;
  if (!selected)
    return '<h3>' + label('cppn.select') + '</h3>' +
           '<button data-cppn-add-node>' + label('cppn.addNode') + '</button>';
  if (selected.kind === 'link') {
    const link = findCppnLink(state.report, selected.id);
    if (!link)
      return '';
    return '<h3>' + label('cppn.connection') + '</h3><div class="aid-cppn-connection">' +
           escapeText(linkText(nodeTitle(link.from, shape), nodeTitle(link.to, shape))) +
           '</div><p>' + label('cppn.port') + ': ' +
           label(link.port ? 'cppn.controlPort' : 'cppn.signalPort') + '</p><label>' +
           label('cppn.weight') + '<input type="number" data-cppn-weight="' + link.id + '" ' +
           limits(shape, CPPN_STEP.weight) + ' value="' + link.weight +
           '"/></label><label><input type="checkbox" data-cppn-enabled="' + link.id + '"' +
           (link.enabled ? ' checked' : '') + '/>' + label('cppn.enabled') + '</label>' +
           '<button data-cppn-split="' + link.id + '">' + label('cppn.split') + '</button>';
  }
  const node = findCppnNode(state.report, selected.id);
  if (!node)
    return '';
  if (node.id < shape.cppnInputs)
    return '<h3>' + escapeText(nodeTitle(node.id, shape)) + '</h3><p>' + label('cppn.inputFixed') +
           '</p><button data-cppn-connect-from="' + node.id + '">' + label('cppn.connectFrom') +
           '</button>';
  return '<h3>' + escapeText(nodeTitle(node.id, shape)) + '</h3><p>' +
         escapeText(nodeTypeLabel(node.type)) + '</p>' +
         '<label>' + label('cppn.function') + '<select data-cppn-function="' + node.id + '">' +
         options(typeLabels.map((name, i) => [i, label('cppnFunctions.' + name)]), node.type) +
         '</select></label>' +
         (node.type === CPPN_GATE
              ? '<p>' + label('cppn.gateInputs') + '</p>'
              : '<label>' + label('cppn.parameter.' + typeLabels[node.type]) +
                    '<input type="number" ' + limits(shape, CPPN_STEP.parameter) +
                    ' data-cppn-parameter="' + node.id + '" value="' + node.parameter +
                    '" /></label>') +
         '<button data-cppn-connect-from="' + node.id + '">' + label('cppn.connectFrom') +
         '</button><button data-cppn-add-node>' + label('cppn.addNode') + '</button>';
}
export function cppnToolbar(state) {
  const modes = [
    [ 'all', 'all' ], [ 'cells', 'cells' ], [ 'traits', 'traits' ], [ 'addresses', 'addresses' ]
  ];
  return '<div class="aid-cppn-toolbar">' +
         modes
             .map(([ key, text ]) => '<button data-cppn-scope="' + key + '" class="' +
                                     (state.cppnScope === key ? 'active' : '') + '">' +
                                     label('cppn.scope.' + text) + '</button>')
             .join('') +
         '<label>' + label('cppn.port') + '<select data-cppn-connect-port>' +
         options([ [ 0, label('cppn.signalPort') ], [ 1, label('cppn.controlPort') ] ],
                 state.cppnConnectPort) +
         '</select></label>' +
         '<button data-cppn-new="blank">' + label('cppn.blank') + '</button>' +
         '<button data-cppn-new="sum">' + label('cppn.addition') + '</button></div>';
}
