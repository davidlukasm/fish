import {clamp} from '../../units.js';
import {CPPN_OUTPUT} from '../../schema.js';
import {linkText, t} from '../../strings.js';
import {escapeText, fixed} from './markup.js';
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
  // The function a hidden node computes, drawn inside it.
  inner : 30
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

// The node functions as the engine computes them (colony-core/cppn/activation.hh), each with the
// span of inputs it is drawn over and the point of its curve that carries the parameter: where it
// sits for a parameter, and which parameter puts it at a given input (or output, for a slope).
function cppnShape(type, shape) {
  const limit = shape.cppnLimit, sharpness = shape.cppnSharpness, range = shape.cppnRange;
  const half = Math.sqrt(Math.LN2 / sharpness), quarter = Math.PI / 2;
  const inverse = x => (Math.abs(x) > 0 ? 1 / x : limit);
  switch (typeLabels[type]) {
  case 'bell':
    return {
      f : (x, b) => Math.exp(-x * x * sharpness / ((b || 1) * (b || 1))),
      span : limit * half,
      at : b => [Math.abs(b || 1) * half, .5],
      from : x => Math.abs(x) / half
    };
  case 'sine':
    return {
      f : (x, b) => Math.sin(x * b),
      span : Math.PI,
      at : b => [quarter * inverse(b), 1],
      from : x => quarter * inverse(x)
    };
  case 'cosine':
    return {
      f : (x, b) => Math.cos(x * b),
      span : Math.PI,
      at : b => [quarter * inverse(b), 0],
      from : x => quarter * inverse(x)
    };
  case 'linear':
    return {f : (x, b) => x * b, span : 1, rise : limit, at : b => [1, b], from : (x, y) => y};
  case 'sign':
    return {f : (x, b) => x + b > 0 ? 1 : -1, span : limit, at : b => [-b, 0], from : x => -x};
  case 'sigmoid':
    return {
      f : (x, b) => 2 / (1 + Math.exp(b - x)) - 1,
      span : limit,
      at : b => [b, 0],
      from : x => x
    };
  case 'cutoff':
    return {f : (x, b) => x > b ? 1 : -1, span : limit, at : b => [b, 0], from : x => x};
  case 'cubic':
    return {
      f : (x, b) => Math.pow(x + b / range, 3) / Math.pow(range, 3),
      span : limit / range,
      at : b => [-b / range, 0],
      from : x => -x * range
    };
  case 'absolute':
    return {f : (x, b) => Math.abs(x + b), span : limit, at : b => [-b, 0], from : x => -x};
  case 'step':
    return {
      f : (x, b) => Math.trunc(x * b),
      span : 2,
      at : b => [inverse(b), 1],
      from : x => inverse(x)
    };
  default:
    return null;
  }
}
// How each function looks in the gallery and inside a node: a parameter and span that show its
// form plainly, drawn with unit constants; the inspector draws the engine's own curve.
const SAMPLE = Object.freeze({
  bell : [ 1, 2.5 ],
  sine : [ 1, 2 * Math.PI ],
  cosine : [ 1, 2 * Math.PI ],
  linear : [ 1, 1 ],
  sign : [ 0, 3 ],
  sigmoid : [ 0, 6 ],
  cutoff : [ 1, 3 ],
  cubic : [ 0, 3 ],
  absolute : [ 0, 3 ],
  step : [ 1.5, 3 ]
});
const CURVE = Object.freeze({width : 260, height : 150, pad : 14, samples : 160, mark : 7});
const THUMB = Object.freeze({size : 40, pad : 6, samples : 48});
const GATE_PATH = 'M4 8h10M4 16h10M14 6l6 6-6 6M17 9l-6 6M11 9l6 6';
// Plots f over [-span, span] into a box; y runs over [-rise, rise] (or [0, rise] for curves that
// never fall below zero) with rise at least 1.
function plot(f, span, {width, height, pad, samples}, rise = null) {
  const xs = Array.from({length : samples + 1}, (_, i) => -span + 2 * span * i / samples);
  const ys = xs.map(f);
  const top = rise ?? Math.max(1, ...ys.map(Math.abs));
  const low = rise === null && Math.min(...ys) >= 0 ? 0 : -top;
  const sx = x => pad + (x + span) / (2 * span) * (width - 2 * pad);
  const sy = y => height - pad - (clamp(y, low, top) - low) / (top - low) * (height - 2 * pad);
  const path = xs.map((x, i) => (i ? 'L' : 'M') + fixed(sx(x)) + ' ' + fixed(sy(ys[i]))).join(' ');
  return {path, sx, sy, low, top};
}
function thumbPath(type, size = THUMB.size) {
  const name = typeLabels[type];
  if (name === 'gate')
    return null;
  const shape = cppnShape(type, {cppnLimit : 1, cppnSharpness : 1, cppnRange : 1});
  const [b, span] = SAMPLE[name];
  return plot(x => shape.f(x, b), span, {...THUMB, width : size, height : size}).path;
}
function axes(box, sy) {
  const mid = fixed(box.width / 2), zero = fixed(sy(0));
  return '<path class="aid-cppn-axis" d="M' + box.pad + ' ' + zero + 'H' + (box.width - box.pad) +
         'M' + mid + ' ' + box.pad + 'V' + (box.height - box.pad) + '"/>';
}

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
                   '<title>' + escapeText(linkText(nodeTitle(from, shape), nodeTitle(to, shape))) +
                   '</title></g>';
          })
          .join('');
  const nodes =
      [...view.points.entries() ]
          .map(([ id, point ]) => {
            const node = cppnNode(view.nodes.get(id)), input = id < shape.cppnInputs;
            const output = id >= shape.cppnInputs && id < shape.cppnInputs + shape.cppnOutputs;
            const selected = selection?.kind === 'node' && selection.id === id;
            const kind = output ? 'output' : input ? 'input' : 'hidden';
            const inner = CPPN_GRAPH.inner, corner = fixed(-inner / 2);
            const curve = kind === 'input' ? null : thumbPath(node.type, inner);
            const drawn = curve ? '<path class="aid-cppn-node-curve" transform="translate(' +
                                      corner + ' ' + corner + ')" d="' + curve + '"/>'
                          : kind === 'input' ? ''
                                             : '<path class="aid-cppn-node-curve" transform="' +
                                                   'translate(-12 -12)" d="' + GATE_PATH + '"/>';
            return '<g data-cppn-node="' + id + '" class="aid-cppn-node ' + kind +
                   (selected ? ' selected' : '') + '" transform="translate(' + point.x + ' ' +
                   point.y + ')">' + CPPN_GRAPH.glyphs[kind] + drawn + '<title>' +
                   escapeText(nodeTitle(id, shape) +
                              (input ? '' : ' · ' + nodeTypeLabel(node.type))) +
                   '</title></g>';
          })
          .join('');
  return '<div class="aid-cppn-scroll"><svg class="aid-cppn-diagram" viewBox="0 0 ' + view.width +
         ' ' + view.height + '" width="' + view.width + '" height="' + view.height +
         '" role="img" aria-label="' + label('cppn.graph') + '">' +
         '<g class="aid-cppn-edges">' + edges + '</g>' + nodes + '</svg></div>';
}

// A value being dragged is drawn before the engine answers.
const drafted = (state, kind, id, value) =>
    state.cppnDraft?.kind === kind && state.cppnDraft.id === id ? state.cppnDraft.value : value;
const ICON_PATH = Object.freeze({
  connect : 'M5 12a2.5 2.5 0 1 0 0 .1M7.5 12H19M15 8l4 4-4 4',
  add : 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v8M8 12h8',
  split : 'M3 12h6M15 12h6M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  enabled : 'M12 3v8M7 6.5a7 7 0 1 0 10 0',
  signal : 'M4 12h14M14 8l4 4-4 4',
  control : GATE_PATH
});
const iconButton = (attribute, kind, title, pressed = null) =>
    '<button class="aid-cppn-icon' + (pressed ? ' active' : '') + '" ' + attribute + ' title="' +
    escapeText(title) + '" aria-label="' + escapeText(title) + '"' +
    (pressed === null ? '' : ' aria-pressed="' + pressed + '"') +
    '><svg viewBox="0 0 24 24" width="24" height="24"><path d="' + ICON_PATH[kind] +
    '"/></svg></button>';

// Where a dragged point of a node's curve puts its parameter; fx and fy are shares of the drawing.
export function parameterAt(type, fx, fy, shape) {
  const form = cppnShape(type, shape);
  if (!form)
    return null;
  const C = CURVE, inner = (C.width - 2 * C.pad) / C.width;
  const x = ((fx - C.pad / C.width) / inner * 2 - 1) * form.span;
  const y = ((1 - fy - C.pad / C.height) / ((C.height - 2 * C.pad) / C.height) * 2 - 1) *
            (form.rise ?? 1);
  return clamp(form.from(x, y), -shape.cppnLimit, shape.cppnLimit);
}
// Where a dragged end of a connection's transfer line puts its weight.
export function weightAt(fy, shape) {
  const C = CURVE;
  return clamp((1 - fy - C.pad / C.height) / ((C.height - 2 * C.pad) / C.height) * 2 - 1, -1, 1) *
         shape.cppnLimit;
}
function curvePicture(node, parameter, shape) {
  const form = cppnShape(node.type, shape), C = CURVE;
  const drawn = plot(x => form.f(x, parameter), form.span, C, form.rise ?? null);
  const [hx, hy] = form.at(parameter);
  const x = drawn.sx(clamp(hx, -form.span, form.span)), y = drawn.sy(hy);
  const title = label('cppn.parameter.' + typeLabels[node.type]);
  return '<svg class="aid-cppn-curve" viewBox="0 0 ' + C.width + ' ' + C.height +
         '" data-cppn-curve="' + node.id + '">' + axes(C, drawn.sy) +
         '<path class="aid-cppn-curve-ink" d="' + drawn.path + '"/>' +
         '<circle class="aid-graphic-handle" data-cppn-curve-handle cx="' + fixed(x) + '" cy="' +
         fixed(y) + '" r="' + C.mark + '"><title>' + escapeText(title) + '</title></circle></svg>';
}
function transferPicture(link, weight, shape) {
  const C = CURVE, rise = shape.cppnLimit;
  const drawn = plot(x => x * weight, 1, C, rise);
  const kind = !link.enabled ? 'disabled' : weight < 0 ? 'inhibitory' : 'excitatory';
  return '<svg class="aid-cppn-curve aid-cppn-transfer ' + kind + '" viewBox="0 0 ' + C.width +
         ' ' + C.height + '" data-cppn-transfer="' + link.id + '">' + axes(C, drawn.sy) +
         '<path class="aid-cppn-curve-ink" d="' + drawn.path + '"/>' +
         '<circle class="aid-graphic-handle" data-cppn-transfer-handle cx="' + fixed(drawn.sx(1)) +
         '" cy="' + fixed(drawn.sy(weight)) + '" r="' + C.mark + '"><title>' +
         escapeText(label('cppn.weight')) + '</title></circle></svg>';
}
function gallery(node) {
  return '<div class="aid-cppn-gallery">' +
         typeLabels
             .map((name, type) => {
               const path = thumbPath(type) ?? GATE_PATH, gate = type === CPPN_GATE;
               return '<button class="aid-cppn-form' + (type === node.type ? ' active' : '') +
                      '" data-cppn-type="' + type + '" title="' +
                      escapeText(label('cppnFunctions.' + name)) + '" aria-pressed="' +
                      (type === node.type) + '"><svg viewBox="0 0 ' +
                      (gate ? '24 24' : THUMB.size + ' ' + THUMB.size) + '"><path d="' + path +
                      '"/></svg></button>';
             })
             .join('') +
         '</div>';
}
export function cppnInspector(state) {
  const selected = state.cppnSelection, shape = state.capabilities;
  const actions = buttons => '<div class="aid-cppn-actions">' + buttons.join('') + '</div>';
  const addNode = iconButton('data-cppn-add-node', 'add', label('cppn.addNode'));
  if (!selected)
    return '<h3>' + label('cppn.select') + '</h3>' + actions([ addNode ]);
  if (selected.kind === 'link') {
    const link = findCppnLink(state.report, selected.id);
    if (!link)
      return '';
    return '<h3>' + escapeText(linkText(nodeTitle(link.from, shape), nodeTitle(link.to, shape))) +
           '</h3>' + transferPicture(link, drafted(state, 'link', link.id, link.weight), shape) +
           actions([
             iconButton('data-cppn-toggle="' + link.id + '"', 'enabled', label('cppn.enabled'),
                        !!link.enabled),
             iconButton('data-cppn-split="' + link.id + '"', 'split', label('cppn.split')),
             '<span class="aid-cppn-port" title="' +
                 escapeText(label(link.port ? 'cppn.controlPort' : 'cppn.signalPort')) +
                 '"><svg viewBox="0 0 24 24" width="24" height="24"><path d="' +
                 ICON_PATH[link.port ? 'control' : 'signal'] + '"/></svg></span>'
           ]);
  }
  const node = findCppnNode(state.report, selected.id);
  if (!node)
    return '';
  const connect =
      iconButton('data-cppn-connect-from="' + node.id + '"', 'connect', label('cppn.connectFrom'));
  if (node.id < shape.cppnInputs)
    return '<h3 title="' + escapeText(label('cppn.inputFixed')) + '">' +
           escapeText(nodeTitle(node.id, shape)) + '</h3>' + actions([ connect ]);
  return '<h3>' + escapeText(nodeTitle(node.id, shape)) + '</h3>' +
         (node.type === CPPN_GATE
              ? '<div class="aid-cppn-gate" title="' + escapeText(label('cppn.gateInputs')) +
                    '"><svg viewBox="0 0 24 24"><path d="' + GATE_PATH + '"/></svg></div>'
              : curvePicture(node, drafted(state, 'node', node.id, node.parameter), shape)) +
         gallery(node) + actions([ connect, addNode ]);
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
         [ [ 0, 'signal', 'cppn.signalPort' ], [ 1, 'control', 'cppn.controlPort' ] ]
             .map(([ port, kind, title ]) =>
                      iconButton('data-cppn-port="' + port + '"', kind, label(title),
                                 state.cppnConnectPort === port))
             .join('') +
         '<button data-cppn-new="blank">' + label('cppn.blank') + '</button>' +
         '<button data-cppn-new="sum">' + label('cppn.addition') + '</button></div>';
}
