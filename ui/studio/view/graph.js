import {CPPN_OUTPUT} from '../../schema.js';
import {formatNumber, joinParts, linkText, t} from '../../strings.js';
import {escapeText} from './markup.js';

const label = key => t('studio.' + key);
const typeLabels = [
  'bell', 'sine', 'cosine', 'linear', 'sign', 'sigmoid', 'cutoff', 'cubic', 'absolute', 'step',
  'gate'
];
const nodeTitle = (id, shape) => id < shape.cppnInputs ? label('cppnInputs.' + id)
                                 : id < shape.cppnInputs + shape.cppnOutputs
                                     ? label('cppnOutputs.' + (id - shape.cppnInputs))
                                     : label('cppn.hidden') + ' ' + id;
export const DEFAULT_CPPN_NODE_TYPE = typeLabels.indexOf('linear');
const nodeTypeLabel = type => label('cppnFunctions.' + typeLabels[type]);
function project(report, scope, shape, selection = null) {
  const cppn = report.cppn, inputCount = shape.cppnInputs, outputCount = shape.cppnOutputs;
  const nodes = new Map(cppn.nodes.map(n => [n[0], n]));
  const requested = Array.from({length : outputCount}, (_, i) => i + inputCount).filter(id => {
    const output = id - inputCount;
    return scope === 'all' || (scope === 'cells' && output <= CPPN_OUTPUT.identity4) ||
           (scope === 'traits' && output >= CPPN_OUTPUT.capacity &&
            output <= CPPN_OUTPUT.quality_width) ||
           (scope === 'addresses' && output >= CPPN_OUTPUT.sender1);
  });
  const incoming = new Map();
  for (const link of cppn.links) {
    if (!link[4])
      continue;
    const list = incoming.get(link[2]) ?? [];
    list.push(link[1]);
    incoming.set(link[2], list);
  }
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
  for (const id of included)
    depth(id);
  const last = Math.max(3, ...requested.map(id => depth(id) + 1));
  const columns = new Map();
  for (const id of included) {
    if (!nodes.has(id))
      continue;
    const column = id < inputCount          ? 0
                   : requested.includes(id) ? last
                                            : Math.min(last - 1, depth(id));
    const existing = columns.get(column) ?? [];
    existing.push(id);
    columns.set(column, existing);
  }
  const height = Math.max(740, 70 * Math.max(...[...columns.values()].map(ids => ids.length)));
  const width = 260 * (last + 1) + 100;
  const points = new Map();
  for (const [column, ids] of columns) {
    ids.sort((a, b) => a - b);
    ids.forEach((id, index) => {
      points.set(id, {x : column * 260 + 110, y : (index + 1) * height / (ids.length + 1)});
    });
  }
  return {nodes, points, width, height};
}
function edgePath(a, b) {
  const reach = (b.x - a.x) * .43;
  return 'M' + (a.x + 24) + ' ' + a.y + ' C' + (a.x + 24 + reach) + ' ' + a.y + ' ' +
         (b.x - 24 - reach) + ' ' + b.y + ' ' + (b.x - 24) + ' ' + b.y;
}
export function cppnGraph(state) {
  if (!state.report?.cppn)
    return '<div class="aid-cppn-empty">' + label('cppn.empty') + '</div>';
  const selection = state.cppnSelection, shape = state.capabilities;
  const view = project(state.report, state.cppnScope, shape, selection);
  const active = new Set(view.points.keys());
  const edges =
      state.report.cppn.links.filter(e => active.has(e[1]) && active.has(e[2]))
          .map(([ id, from, to, weight, enabled, port ]) => {
            const path = edgePath(view.points.get(from), view.points.get(to));
            const selected = selection?.kind === 'link' && selection.id === id;
            return '<g class="aid-cppn-link ' + (selected ? 'selected' : '') +
                   (enabled ? (weight < 0 ? ' inhibitory' : ' excitatory') : ' disabled') +
                   '" data-cppn-link="' + id + '">' +
                   '<path d="' + path + '" class="aid-cppn-link-ink" stroke-width="' +
                   Math.max(1, Math.min(4, Math.abs(weight) * 1.7)) + '"/>' +
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
            const glyph = output  ? '<path d="M-24 -18 L18 -18 L25 0 L18 18 L-24 18 Z"/>'
                          : input ? '<rect x="-24" y="-17" width="48" height="34" rx="8"/>'
                                  : '<circle r="22"/>';
            return '<g data-cppn-node="' + id + '" class="aid-cppn-node ' + type +
                   (selected ? ' selected' : '') + '" transform="translate(' + point.x + ' ' +
                   point.y + ')">' + glyph +
                   '<text text-anchor="middle" y="4" class="aid-cppn-node-number">' +
                   (input    ? 'IN'
                    : output ? 'OUT'
                             : node[2]) +
                   '</text>' +
                   '<text class="aid-cppn-node-caption" text-anchor="middle" y="37">' +
                   escapeText(nodeTitle(id, shape)) + '</text></g>';
          })
          .join('');
  return '<div class="aid-cppn-scroll"><svg class="aid-cppn-diagram" viewBox="0 0 ' + view.width +
         ' ' + view.height + '" width="' + view.width + '" height="' + view.height +
         '" role="img" aria-label="' + label('cppn.graph') + '">' +
         '<g class="aid-cppn-edges">' + edges + '</g>' + nodes + '</svg></div>';
}
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
    const link = state.report?.cppn?.links.find(e => e[0] === selected.id);
    if (!link)
      return '';
    return '<h3>' + label('cppn.connection') + '</h3><div class="aid-cppn-connection">' +
           escapeText(linkText(nodeTitle(link[1], shape), nodeTitle(link[2], shape))) +
           '</div><label>' + label('cppn.weight') + '<input type="number" data-cppn-weight="' +
           link[0] + '" min="-16" max="16" step=".1" value="' + link[3] +
           '"/></label><label><input type="checkbox" data-cppn-enabled="' + link[0] + '"' +
           (link[4] ? ' checked' : '') + '/>' + label('cppn.enabled') + '</label>' +
           '<button data-cppn-split="' + link[0] + '">' + label('cppn.split') + '</button>';
  }
  const node = state.report?.cppn?.nodes.find(n => n[0] === selected.id);
  if (!node)
    return '';
  return '<h3>' + escapeText(nodeTitle(node[0], shape)) + '</h3><p>' +
         escapeText(nodeTypeLabel(node[2])) + '</p>' +
         '<label>' + label('cppn.function') + '<select data-cppn-function="' + node[0] + '">' +
         options(typeLabels.map((name, i) => [i, label('cppnFunctions.' + name)]), node[2]) +
         '</select></label>' +
         '<label>' + label('cppn.parameter.' + typeLabels[node[2]]) +
         '<input type="number" min="-16" max="16" step=".05" data-cppn-parameter="' + node[0] +
         '" value="' + node[1] + '" /></label>' +
         '<button data-cppn-connect-from="' + node[0] + '">' + label('cppn.connectFrom') +
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
         '<button data-cppn-new="blank">' + label('cppn.blank') + '</button>' +
         '<button data-cppn-new="sum">' + label('cppn.addition') + '</button></div>';
}
