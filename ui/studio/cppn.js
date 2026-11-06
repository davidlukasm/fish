import {compileDocument} from './model/document.js';
import {DEFAULT_CPPN_NODE_TYPE, findCppnLink, findCppnNode} from './view/graph.js';
import {label} from './view/kit.js';
import {API_WAIT, requestBody} from './requests.js';

// The genome mode: the fish's CPPN as a graph to read and edit. Every edit goes to the atelier,
// which answers with the edited genome and what it grows into. A new link joins two nodes with
// NEW_LINK's weight on its port; a new node computes NEW_NODE's function of its parameter.
const NEW_LINK = Object.freeze({weight : 1, port : 0});
const NEW_NODE = Object.freeze({type : DEFAULT_CPPN_NODE_TYPE, parameter : 1});

// Asks the atelier for `operation` on the genome; its answer holds while the draft stands.
async function cppnAction(studio, operation, data = {}) {
  const state = studio.state;
  if (state.busy)
    return;
  const document = state.document;
  state.busy = true;
  try {
    const result = await studio.api(
        requestBody(operation, {
          ...data,
          ...(operation === 'edit' && state.report?.compiler
                  ? {plan : compileDocument(document, state.sites)}
                  : {}),
          ...(operation === 'edit' || operation === 'inspect' ? {genome : state.genome} : {})
        }),
        API_WAIT.long);
    if (state.document !== document)
      return;
    state.report = result;
    state.robustness = null;
    if (result.genome)
      state.genome = result.genome;
    state.stale = false;
  } catch (error) {
    studio.notice(error.message);
  } finally {
    state.busy = false;
    studio.refreshScene();
    studio.refreshInspector();
    studio.refreshHeader();
  }
}
const edit = (studio, change) => cppnAction(studio, 'edit', change);
function choose(studio, selection) {
  studio.state.cppnSelection = selection;
  studio.refreshScene();
  studio.refreshInspector();
}

// A click on the graph's scope or an example starts afresh; on a node it chooses the node or ends a
// link begun at another; on a link it chooses the link; the inspector's buttons begin a link, split
// a link with a node or add a node.
export const CPPN_CLICKS = Object.freeze([
  [
    '[data-cppn-scope]',
    (studio, element) => {
      studio.state.cppnScope = element.dataset.cppnScope;
      studio.renderShell();
    }
  ],
  [ '[data-cppn-new]', (studio, element) => cppnAction(studio, 'new', {example : element.dataset.cppnNew}) ],
  [
    '[data-cppn-node]',
    (studio, element) => {
      const id = Number(element.dataset.cppnNode), from = studio.state.cppnConnectFrom;
      if (from === null || from === id)
        return choose(studio, {kind : 'node', id});
      studio.state.cppnConnectFrom = null;
      return edit(studio, {edit : 'connect', from, to : id, ...NEW_LINK});
    }
  ],
  [ '[data-cppn-link]', (studio, element) => choose(studio, {kind : 'link', id : Number(element.dataset.cppnLink)}) ],
  [
    '[data-cppn-connect-from]',
    (studio, element) => {
      studio.state.cppnConnectFrom = Number(element.dataset.cppnConnectFrom);
      studio.notice(label('cppn.connectFrom'));
    }
  ],
  [ '[data-cppn-split]', (studio, element) => edit(studio, {edit : 'split', id : Number(element.dataset.cppnSplit)}) ],
  [ '[data-cppn-add-node]', studio => edit(studio, {edit : 'add-node', ...NEW_NODE}) ]
]);

// A change of a link's weight or switch, or of a node's function or parameter, edits that part
// and keeps its other values.
const valueOf = element => Number(element.value), checkedOf = element => Number(element.checked);
const linkChange = (key, field, read) => [key, (studio, element) => {
  const link = findCppnLink(studio.state.report, Number(element.dataset[key]));
  if (link)
    edit(studio, {
      edit : 'link',
      id : link.id,
      weight : link.weight,
      enabled : link.enabled,
      [field] : read(element)
    });
}];
const nodeChange = (key, field, read) => [key, (studio, element) => {
  const node = findCppnNode(studio.state.report, Number(element.dataset[key]));
  if (node)
    edit(studio, {
      edit : 'node',
      id : node.id,
      type : node.type,
      parameter : node.parameter,
      [field] : read(element)
    });
}];
export const CPPN_CHANGES = Object.freeze([
  linkChange('cppnWeight', 'weight', valueOf), linkChange('cppnEnabled', 'enabled', checkedOf),
  nodeChange('cppnFunction', 'type', valueOf), nodeChange('cppnParameter', 'parameter', valueOf)
]);
