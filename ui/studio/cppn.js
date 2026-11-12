import {compileDocument} from './model/document.js';
import {
  CPPN_GATE,
  DEFAULT_CPPN_NODE_TYPE,
  findCppnLink,
  findCppnNode,
  parameterAt,
  weightAt
} from './view/graph.js';
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
    state.stimulus = null;
    state.report = result;
    state.robustness = null;
    if (result.genome)
      state.genome = result.genome;
    state.stale = false;
  } catch (error) {
    studio.notice(error.message);
  } finally {
    state.busy = false;
    state.cppnDraft = null;
    studio.refreshViews();
    studio.refreshHeader();
  }
}
const edit = (studio, change) => cppnAction(studio, 'edit', change);
function choose(studio, selection) {
  studio.state.cppnSelection = selection;
  studio.refreshViews();
}
const editLink = (studio, link, change) => edit(
    studio, {edit : 'link', id : link.id, weight : link.weight, enabled : link.enabled, ...change});
const editNode = (studio, node, change) => edit(
    studio, {edit : 'node', id : node.id, type : node.type, parameter : node.parameter, ...change});

export const CPPN_CLICKS = Object.freeze([
  [
    '[data-cppn-scope]',
    (studio, element) => {
      studio.state.cppnScope = element.dataset.cppnScope;
      studio.renderShell();
    }
  ],
  [
    '[data-cppn-port]',
    (studio, element) => {
      studio.state.cppnConnectPort = Number(element.dataset.cppnPort);
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
  [
    '[data-cppn-type]',
    (studio, element) => {
      const node = findCppnNode(studio.state.report, studio.state.cppnSelection?.id);
      const type = Number(element.dataset.cppnType);
      if (node && node.type !== type)
        editNode(studio, node, {type});
    }
  ],
  [
    '[data-cppn-toggle]',
    (studio, element) => {
      const link = findCppnLink(studio.state.report, Number(element.dataset.cppnToggle));
      if (link)
        editLink(studio, link, {enabled : Number(!link.enabled)});
    }
  ],
  [ '[data-cppn-split]', (studio, element) => edit(studio, {edit : 'split', id : Number(element.dataset.cppnSplit)}) ],
  [ '[data-cppn-add-node]', studio => edit(studio, {edit : 'add-node', ...NEW_NODE}) ]
]);

// Dragging a node's curve sets its parameter, dragging the end of a connection's transfer line its
// weight. The drawing follows the pointer; the engine gets the value once, when it is let go.
export const CPPN_GRIPS = Object.freeze([
  {
    graphic : '[data-cppn-curve]',
    handle : '[data-cppn-curve-handle]',
    held : 'cppnParameter',
    start : (studio, g) => ({id : Number(g.dataset.cppnCurve)})
  },
  {
    graphic : '[data-cppn-transfer]',
    handle : '[data-cppn-transfer-handle]',
    held : 'cppnWeight',
    start : (studio, g) => ({id : Number(g.dataset.cppnTransfer)})
  }
]);
export const CPPN_HANDLES = Object.freeze({
  cppnParameter : {follow : 'cppnParameterPointer', done : 'cppnCommit'},
  cppnWeight : {follow : 'cppnWeightPointer', done : 'cppnCommit'}
});
const share = (event, rect) => (
    {fx : (event.clientX - rect.left) / rect.width, fy : (event.clientY - rect.top) / rect.height});
export const cppnMethods = {
  cppnParameterPointer(event) {
    const drag = this.handleDrag, node = findCppnNode(this.state.report, drag.id);
    if (!node)
      return;
    const {fx, fy} = share(event, drag.rect);
    const value = parameterAt(node.type, fx, fy, this.state.capabilities);
    if (value === null)
      return;
    this.state.cppnDraft = {kind : 'node', id : node.id, value};
    this.refreshInspector();
  },
  cppnWeightPointer(event) {
    const drag = this.handleDrag, link = findCppnLink(this.state.report, drag.id);
    if (!link)
      return;
    const {fy} = share(event, drag.rect);
    this.state
        .cppnDraft = {kind : 'link', id : link.id, value : weightAt(fy, this.state.capabilities)};
    this.refreshInspector();
  },
  cppnCommit() {
    const draft = this.state.cppnDraft;
    if (!draft)
      return;
    if (draft.kind === 'node') {
      const node = findCppnNode(this.state.report, draft.id);
      if (node && node.parameter !== draft.value)
        return editNode(this, node, {parameter : draft.value});
    } else {
      const link = findCppnLink(this.state.report, draft.id);
      if (link && link.weight !== draft.value)
        return editLink(this, link, {weight : draft.value});
    }
    this.state.cppnDraft = null;
  }
};
