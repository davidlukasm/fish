import {compileDocument} from './model/document.js';
import {CPPN_GATE, DEFAULT_CPPN_NODE_TYPE, findCppnLink, findCppnNode} from './view/graph.js';
import {label} from './view/kit.js';
import {API_WAIT, requestBody} from './requests.js';

const NEW_LINK = Object.freeze({weight : 1});
const NEW_NODE = Object.freeze({type : DEFAULT_CPPN_NODE_TYPE, parameter : 1});

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
    studio.stopPulse();
    state.runtime = state.measurement = state.stimulus = null;
    state.report = result;
    state.robustness = null;
    if (result.genome)
      state.genome = result.genome;
    state.stale = false;
  } catch (error) {
    studio.notice(error.message);
  } finally {
    state.busy = false;
    studio.refreshViews();
    studio.refreshHeader();
  }
}
const edit = (studio, change) => cppnAction(studio, 'edit', change);
function choose(studio, selection) {
  studio.state.cppnSelection = selection;
  studio.refreshViews();
}

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
      if (studio.state.cppnConnectPort === 1 && findCppnNode(studio.state.report,id)?.type !== CPPN_GATE)
        return studio.notice(label('cppn.needsGate'));
      studio.state.cppnConnectFrom = null;
      return edit(studio, {edit:'connect',from,to:id,...NEW_LINK,port:studio.state.cppnConnectPort});
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
  [ 'cppnConnectPort', (studio, e) => { studio.state.cppnConnectPort = Number(e.value);} ],
  linkChange('cppnWeight', 'weight', valueOf), linkChange('cppnEnabled', 'enabled', checkedOf),
  nodeChange('cppnFunction', 'type', valueOf), nodeChange('cppnParameter', 'parameter', valueOf)
]);
