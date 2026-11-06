import {testLightMarkup, visionDragPatch} from './view/vision.js';
import {spectrumPatch} from './view/spectrum.js';
import {adaptationSteps, sensitivityStimulus} from './view/sensitivity.js';
import {drivePatch} from './view/drive.js';
import {effectorPatch, spinePatch} from './view/effectors.js';
import {clamp} from '../units.js';
import {kindNodes, nodeLimit} from './model/organs.js';
import {lateralPatch} from './view/lateral.js';
import {probeHandle, probePatch} from './view/probes.js';
import {scentMapTuning, scentMapWidth} from './view/scents.js';
import {pigmentAmount, pigmentWheelPatch} from './view/pigments.js';
import {
  activationQuality,
  planOfUnit,
  thresholdQualityShift,
  timeConstantOf,
  timeConstantSteps,
  unitOfPlan
} from '../tuning.js';
import {
  findCenter,
  findOrgan,
  groupReport,
  profileIndex,
  setMuscleTrait,
  setOrganNodes,
  typeOfCenter,
  updateCenter,
  updateGrowth,
  updateReceptor,
  updateWire
} from './model/document.js';
import {cameraCoordinates} from './view/frame.js';
import {dataAttribute, fixed} from './view/markup.js';
import {outputMarks, outputPatch, wireMarks, wirePatch} from './view/panels.js';
import {skinPatch} from './view/skin.js';
import {sacPatch} from './view/sacs.js';
import {panelStyle} from './view/shell.js';
import {
  GROWTH,
  phasePatch,
  receptorCurvePatch,
  wheelMarks,
  wheelPatch,
  wheelTrackWidth
} from './view/substances.js';
import {learnModePatch, learnRatePatch} from './view/learning.js';
import {cellPatch, label} from './view/kit.js';

// The handles on the panels' graphics and the side panels' grips: what a press holds, how the
// held handle follows the pointer and what its let-go finishes.

// The library and the inspector beside the scene are as wide as the viewer pulls them, within
// these bounds, and stay so in this browser.
const PANEL_WIDTH = Object.freeze({library : [ 150, 380 ], inspector : [ 280, 680 ]});
const PANEL_STORE = 'aid.atelier.panels';
export function storedPanels() {
  try {
    const stored = JSON.parse(localStorage.getItem(PANEL_STORE) ?? '{}');
    return Object.fromEntries(Object.keys(PANEL_WIDTH)
                                  .filter(key => Number.isFinite(stored[key]))
                                  .map(key => [key, stored[key]]));
  } catch {
    return {};
  }
}
// Handles the pointer holds, by what they move: follow names the method that follows the pointer,
// done what follows the let-go. A held handle's changes end their history batch with it; the
// click its let-go makes on the scene is no choice, unless the handle keeps it.
export const HANDLES = Object.freeze({
  panel : {follow : 'panelPointer', done : 'keepPanels', keepsClick : true},
  receptor : {follow : 'receptorPointer'},
  drive : {follow : 'drivePointer'},
  adaptation : {follow : 'adaptationPointer', done : 'refreshSensitivity'},
  sensitivity : {follow : 'sensitivityPointer', done : 'refreshSensitivity'},
  spectrum : {follow : 'spectrumPointer', done : 'refreshInspector'},
  probe : {follow : 'probePointer'},
  skin : {follow : 'skinPointer', done : 'refreshInspector'},
  vision : {follow : 'visionPointer', done : 'refreshInspector'},
  graphic : {follow : 'tuneGraphic', done : 'refreshInspector', keepsClick : true}
});
// Where the pointer lies on a held graphic, as fractions of its width (fx) and height (fy).
const pointerShare = (event, rect) => (
    {fx : (event.clientX - rect.left) / rect.width, fy : (event.clientY - rect.top) / rect.height});
// Pads that tune what they show, by their kind (see pointerDown): patch turns the pointer
// (fractions of the pad) into a change of the center or the wire it tunes, marks moves the pad's
// marks to the changed item, or redraw draws the pad anew; handle turns the pointer on one of its
// handles into a change. A change below PAD_STILL is none.
const PADS = Object.freeze({
  wire : {key : 'wirePad', wire : true, patch : wirePatch, marks : wireMarks},
  output : {key : 'outputPad', patch : outputPatch, marks : outputMarks},
  learnRate : {key : 'learnRate', handle : learnRatePatch},
  learnMode : {key : 'learnMode', handle : learnModePatch},
  vector : {
    key : 'vectorPad',
    patch : wheelPatch,
    marks : wheelMarks,
    handle : fx => ({qwidth : wheelTrackWidth(fx)})
  },
  compass : {
    key : 'compass',
    patch : scentMapTuning,
    redraw : 'refreshScentMaps',
    handle : fx => ({qwidth : scentMapWidth(fx)})
  },
  pigment : {key : 'pigmentWheel', patch : pigmentWheelPatch, redraw : 'refreshPigment'},
  amount : {key : 'pigmentAmount', follow : 'pigmentAmountPointer'},
  lateral : {key : 'lateralPad', handle : lateralPatch},
  spines : {
    key : 'spinePad',
    handle : (fx, fy, element) => spinePatch(fx, fy, Number(element.dataset.spineAim))
  }
});
// The pads by the data attribute that marks them; a pad that is only handles (no patch of its
// own, nothing to follow) is held by its handles alone.
const PAD_SELECTOR = Object.values(PADS).map(pad => '[' + dataAttribute(pad.key) + ']').join(',');
const padKind = element =>
    Object.keys(PADS).find(kind => element.hasAttribute(dataAttribute(PADS[kind].key)));
const onlyHandles = pad => !pad.patch && !pad.follow;
// The graphics in the panels and on the fish a press holds by a handle, in the order they are
// tried: the graphic, the handle the press must lie in (any press on a graphic that CLAIMS its
// presses is its own, handle or not), which kind of handle it holds and what the drag starts
// with; a start that gives nothing holds nothing. The drag keeps the graphic's place on screen
// (rect) unless it follows the scene's camera.
export const GRIPS = Object.freeze([
  {
    graphic : '[data-spectrum]',
    handle : '[data-spectrum-handle]',
    held : 'spectrum',
    start : (studio, g, h) => ({target : {...g.dataset}, handle : h.dataset.spectrumHandle})
  },
  {
    graphic : '[data-sensitivity]',
    handle : '[data-sensitivity-handle]',
    held : 'sensitivity',
    start : (studio, g) => studio.sensitivityGrip(g)
  },
  // A receptor's curve and its width on the substance wheel follow their handles.
  {
    graphic : '[data-receptor-curve]',
    handle : '[data-curve-handle]',
    held : 'receptor',
    start : (studio, g, h) => ({target : g.dataset.receptorCurve, handle : h.dataset.curveHandle})
  },
  {
    graphic : 'svg',
    handle : '[data-wheel-width]',
    held : 'receptor',
    start : (studio, g, h) => ({target : h.dataset.wheelWidth, handle : 'width'})
  },
  {
    graphic : '[data-phase]',
    handle : '[data-phase-handle]',
    held : 'drive',
    start : (studio, g, h) => ({id : g.dataset.phase, handle : h.dataset.phaseHandle})
  },
  {
    graphic : '[data-effector-graphic]',
    handle : '[data-effector-handle]',
    held : 'drive',
    start : (studio, g, h) => ({
      id : g.dataset.effectorGraphic,
      handle : 'effector',
      name : h.dataset.effectorHandle,
      code : Number(g.dataset.effectorCode),
      side : Number(g.dataset.effectorSide)
    })
  },
  {
    graphic : '[data-cell-track]',
    handle : '[data-cell-handle]',
    held : 'drive',
    start : (studio, g) => ({id : g.dataset.cellTrack, handle : 'copies'})
  },
  {
    graphic : '[data-skin-field]',
    handle : '[data-skin-handle]',
    held : 'skin',
    start : (studio, g, h) => studio.skinGrip(g, h)
  },
  {
    graphic : '[data-sac]',
    handle : '[data-sac-handle]',
    held : 'drive',
    start : (studio, g, h) => ({id : g.dataset.sac, handle : 'sac', name : h.dataset.sacHandle})
  },
  {
    graphic : '[data-drive]',
    handle : '[data-drive-handle]',
    claims : true,
    held : 'drive',
    start : (studio, g, h) => ({id : g.dataset.drive, handle : h.dataset.driveHandle})
  },
  {
    graphic : '[data-adaptation]',
    held : 'adaptation',
    start : (studio, g) => studio.adaptationGrip(g)
  },
  {
    graphic : '[data-sense-handle]',
    held : 'probe',
    rect : false,
    start : (studio, g) => ({id : g.dataset.senseHandle})
  },
  {
    graphic : '[data-vision-handle]',
    held : 'vision',
    rect : false,
    start : (studio, g) => ({key : g.dataset.visionHandle, id : g.dataset.visionId})
  },
  // A pad: by its handle, or anywhere on it unless it is only handles.
  {
    graphic : PAD_SELECTOR,
    held : 'graphic',
    start : (studio, g, h, event) => {
      const kind = padKind(g),
            handle = event.target.closest?.('[data-graphic-handle]')?.dataset.graphicHandle ?? null;
      return onlyHandles(PADS[kind]) && !handle
                 ? null
                 : {element : g, kind, id : g.dataset[PADS[kind].key], handle};
    }
  }
]);
const PAD_STILL = .001;
// How long after a drag's let-go a click on the scene is the drag's own (ms), and how far the
// pointer moves on the scene before a press becomes a drag (px).
export const DRAG_CLICK = 350, DRAG_START = 5;
// The studio's methods for held handles (mixed into OrganStudio).
export const handleMethods = {
  // A pad follows the pointer: a handle on it sets a width or an angle, and the inspector draws
  // it anew around the handle; elsewhere its marks follow at once, and the pad is drawn anew
  // only where its whole picture changes with them.
  tuneGraphic(event) {
    const control = this.handleDrag, bounds = control.rect;
    if (!bounds.width || !bounds.height)
      return;
    const share = pointerShare(event, bounds), fx = clamp(share.fx), fy = clamp(share.fy);
    const doc = this.state.document, pad = PADS[control.kind];
    if (pad.follow)
      return this[pad.follow](control, fx);
    const item = pad.wire ? doc.wires.find(wire => wire.id === control.id)
                          : findCenter(doc, control.id)?.center;
    if (!item)
      return;
    if (control.handle) {
      const patch = pad.handle?.(fx, fy, control.element);
      if (!patch)
        return;
      this.tuneDesign(updateCenter(doc, control.id, patch), 'graphic:' + control.id);
      this.refreshInspector();
      return;
    }
    const patch = pad.patch(fx, fy, item, this.state);
    if (Object.entries(patch).every(([ key, value ]) => Math.abs(value - item[key]) < PAD_STILL))
      return;
    if (!control.changed) {
      this.recordHistory('graphic:' + control.id);
      control.changed = true;
      this.refreshTools();
    }
    this.state.document =
        pad.wire ? updateWire(doc, control.id, patch) : updateCenter(doc, control.id, patch);
    this.designChanged();
    this.requestDesign();
    if (pad.redraw)
      this[pad.redraw]();
    else
      for (const [selector, attributes] of Object.entries(
               pad.marks({...item, ...patch}, this.state)))
        for (const mark of control.element.querySelectorAll(selector))
          for (const [name, value] of Object.entries(attributes))
            mark.setAttribute(name, fixed(value));
    this.refreshScene();
    this.refreshHeader();
  },
  // A kind of pigment cell has as many nodes as the pointer along its amount track asks.
  pigmentAmountPointer(control, fx) {
    const doc = this.state.document, found = findCenter(doc, control.id);
    const type = found && typeOfCenter(found.organ, control.id);
    if (!type)
      return;
    const count = pigmentAmount(fx, Number(control.element.dataset.room));
    if (count === type.centers.length)
      return;
    const changed = setOrganNodes(doc, found.organ.id, count, this.state.sites, type.id);
    if (!changed)
      return this.notice(label('status.noRoom'));
    this.tuneDesign(changed, 'amount:' + control.id);
    this.refreshPigment();
  },
  // A sensitivity graphic's owner: a colour type of a field organ, or a sensory center.
  sensitivityTarget(block) {
    if (block.dataset.sensitivityBlock === 'field')
      return this.spectrumTarget({
        spectrum : 'field',
        spectrumId : block.dataset.sensitivityId,
        profileId : block.dataset.profileId
      });
    const found = findCenter(this.state.document, block.dataset.sensitivityId);
    return found && {tuning : found.center, center : found.center};
  },
  // What a spectrum editor tunes: a light-cell profile of a field organ.
  spectrumTarget({spectrumId : id, profileId}) {
    const organ = findOrgan(this.state.document, id);
    const profile = organ?.field?.profiles.find(p => p.id === profileId);
    return profile && {tuning : profile, organ};
  },
  // The threshold follows the handle. On a log axis its quality moves as the stimulus of half the
  // answer does, and the curve shifts with it until the engine's new one arrives; on a linear
  // axis the handle is the threshold's activation level itself.
  sensitivityPointer(event) {
    const drag = this.handleDrag, dimmest = drag.log ? this.state.anatomy?.lightDimmest : null;
    if (drag.log && !(dimmest > 0))
      return;
    const stimulus = sensitivityStimulus(pointerShare(event, drag.rect).fx, dimmest);
    let threshold;
    if (drag.log) {
      drag.shift = stimulus / drag.answer.half;
      threshold = planOfUnit(unitOfPlan(drag.threshold) + thresholdQualityShift(drag.shift));
    } else {
      drag.dragged = stimulus;
      threshold = planOfUnit(activationQuality(stimulus));
    }
    if (drag.field)
      this.editField(drag.field, {profile : {id : drag.block, threshold}}, false);
    else
      this.tuneDesign(updateCenter(this.state.document, drag.block, {threshold}),
                      'threshold:' + drag.block);
    this.refreshSensitivity();
  },
  // A receptor (or the body's growth receptor) follows its curve's handles and its halo on the
  // substance wheel.
  receptorPointer(event) {
    const drag = this.handleDrag, doc = this.state.document;
    const growth = drag.target === GROWTH;
    const cut = drag.target.lastIndexOf(':'), centerId = drag.target.slice(0, cut),
          effect = growth ? GROWTH : Number(drag.target.slice(cut + 1));
    const receptor = growth ? doc.growth : findCenter(doc, centerId)?.center.receptors[effect];
    if (!receptor)
      return;
    const {fx, fy} = pointerShare(event, drag.rect);
    let patch;
    if (drag.handle === 'width')
      patch = {width : wheelTrackWidth(fx)};
    else
      patch = receptorCurvePatch(this.state, receptor, effect, drag.handle, fx, fy);
    if (!patch)
      return;
    this.tuneDesign(growth ? updateGrowth(doc, patch)
                           : updateReceptor(doc, centerId, effect, patch),
                    'receptor:' + drag.target);
    this.refreshInspector();
  },
  // Graphics whose handles change a center: rest activity, recovery and beat on the drive
  // graphic, the marks of a life phase; and a gonad's growth cells and stretch line.
  drivePointer(event) {
    const drag = this.handleDrag;
    const {fx, fy} = pointerShare(event, drag.rect);
    if (drag.handle === 'effector')
      return this.effectorPointer(drag, fx, fy);
    if (drag.handle === 'sac')
      return this.sacPointer(drag, fx);
    if (drag.handle === 'copies') {
      this.tuneDesign(updateCenter(this.state.document, drag.id, cellPatch(fx)),
                      'cells:' + drag.id);
      return this.refreshInspector();
    }
    const doc = drag.handle === 'start' || drag.handle === 'end'
                    ? this.lifePhase(drag.id, phasePatch(drag.handle, fx))
                    : updateCenter(
                          this.state.document, drag.id,
                          drivePatch(drag.handle, fx, fy, this.state.capabilities?.biasScale ?? 0));
    this.tuneDesign(doc, 'drive:' + drag.id);
    this.refreshInspector();
  },
  // An effector organ's handles: its nodes, their strength, or a trait its function shapes.
  effectorPointer(drag, fx, fy) {
    const doc = this.state.document, organ = findOrgan(doc, drag.id), sites = this.state.sites;
    const patch = organ && effectorPatch(drag.code, drag.name, fx, fy, nodeLimit(organ, sites));
    if (!patch)
      return;
    const changed =
        'nodes' in patch ? patch.nodes !== organ.centers.length &&
                               setOrganNodes(doc, organ.id, patch.nodes, sites)
        : 'copies' in patch
            ? patch.copies !== organ.centers[0].copies &&
                  updateCenter(doc, organ.centers[0].id, {copies : patch.copies})
            : setMuscleTrait(doc, drag.code, patch.trait, patch.value, this.state.sites);
    if (!changed)
      return;
    this.tuneDesign(changed, 'effector:' + drag.id);
    this.refreshInspector();
  },
  // A gonad's growth nodes fill its vessel up to the handle; its stretch line follows the other.
  sacPointer(drag, fx) {
    const doc = this.state.document, organ = findOrgan(doc, drag.id);
    const patch = organ && sacPatch(this.state, organ, drag.name, fx);
    if (!patch)
      return;
    const pressure = organ.centers.find(c => c.key === 'pressure');
    const changed = 'nodes' in patch
                        ? patch.nodes !== kindNodes(organ).length &&
                              setOrganNodes(doc, organ.id, patch.nodes, this.state.sites)
                        : pressure && updateCenter(doc, pressure.id, patch);
    if (!changed)
      return;
    this.tuneDesign(changed, 'sac:' + drag.id);
    this.refreshInspector();
  },
  // The time constant follows the handle; the curve stretches with it in time.
  adaptationPointer(event) {
    const drag = this.handleDrag;
    const steps =
        adaptationSteps(pointerShare(event, drag.rect).fx, drag.adapt.response.length - 1);
    const tau = timeConstantOf(steps);
    drag.stretch = timeConstantSteps(tau) / drag.adapt.steps;
    this.tuneDesign(updateCenter(this.state.document, drag.id, {tau}), 'tau:' + drag.id);
    this.refreshSensitivity();
  },
  spectrumPointer(event) {
    const drag = this.handleDrag, target = this.spectrumTarget(drag.target);
    if (!target)
      return;
    const light = this.state.anatomy?.light
                      ?.[profileIndex(this.state.document, target.organ.id, drag.target.profileId)];
    const {fx, fy} = pointerShare(event, drag.rect);
    const patch = spectrumPatch(target.tuning, drag.handle, fx, fy, light);
    if (!patch)
      return;
    if (drag.handle === 'light') {
      if (this.state.sightProbe) {
        this.state.sightProbe = {...this.state.sightProbe, ...patch};
        this.refreshScene();
        this.refreshSpectrum();
        this.requestDesign();
      }
      return;
    }
    if (Object.entries(patch).every(([ key, value ]) =>
                                        Math.abs(value - target.tuning[key]) < PAD_STILL))
      return;
    const {spectrumId : id, profileId} = drag.target;
    this.editField(id, {profile : {id : profileId, ...patch}}, false);
    this.refreshSpectrum();
  },
  // The stimulus follows the pointer at once; what the senses feel when the engine answers.
  probePointer(event) {
    const drag = this.handleDrag, probe = this.state.senseProbe,
          faintest = this.state.anatomy?.lightDimmest;
    if (probe?.organ !== drag.id || !(faintest > 0))
      return;
    const position = cameraCoordinates(event, this.bodyMap(), this.state.camera);
    const patch = probePatch(probe.kind, position, faintest);
    this.state.senseProbe = {...probe, ...patch};
    this.keepInView(probeHandle(this.state.senseProbe, faintest));
    this.refreshProbes();
    this.requestDesign();
  },
  visionPointer(event) {
    const drag = this.handleDrag;
    const organ = findOrgan(this.state.document, drag.id);
    if (!organ?.field)
      return;
    const svg = this.bodyMap();
    const position = cameraCoordinates(event, svg, this.state.camera);
    const patch = visionDragPatch(this.state, organ, drag.key, position);
    if (!patch)
      return;
    // The test light moves at once; what the eyes see follows when the engine answers.
    if (drag.key === 'probe' || drag.key === 'probe-size') {
      this.state.sightProbe = {...this.state.sightProbe, ...patch};
      const light = this.bodyMap()?.querySelector('.aid-sight-light');
      if (light)
        light.outerHTML = testLightMarkup(this.state, organ);
      else
        this.refreshScene();
      this.refreshSpectrum();
      this.requestDesign();
    } else
      this.editField(organ.id, patch, false);
  },
  // The pointer holds a handle: it follows from here until the let-go.
  // A handle tunes the design as it moves: the selection stays, the inspector keeps its graphics
  // (the handle redraws what it changes), and one step of history holds the whole drag (`batch`).
  tuneDesign(doc, batch) { return this.changeDocument(doc, this.state.selected, false, batch);},
  holdHandle(event, held, drag) {
    this.handleDrag = {held, ...drag};
    event.preventDefault();
    this[HANDLES[held].follow](event);
  },
  // The handle of that kind the pointer holds, if any.
  heldHandle(held) { return this.handleDrag?.held === held ? this.handleDrag : null;},
  releaseHandle(event) {
    const how = HANDLES[this.handleDrag.held];
    this[how.follow](event);
    this.handleDrag = null;
    this.historyBatch = null;
    if (!how.keepsClick)
      this.ignoreClickUntil = performance.now() + DRAG_CLICK;
    if (how.done)
      this[how.done]();
  },
  // The panels keep their widths for the next visit; the scene takes the rest.
  keepPanels() {
    try {
      localStorage.setItem(PANEL_STORE, JSON.stringify(this.state.panels));
    } catch {
      // Without storage the width lasts until the page is left.
    }
    this.refreshScene();
  },
  // A side panel follows its grip; the scene takes the rest.
  panelPointer(event) {
    const drag = this.handleDrag, [ low, high ] = PANEL_WIDTH[drag.panel];
    const width = Math.round(
        Math.max(low, Math.min(high, drag.width + drag.sign * (event.clientX - drag.x))));
    this.state.panels = {...this.state.panels, [drag.panel] : width};
    this.root.querySelector('.aid-workspace-main')
        ?.setAttribute('style', panelStyle(this.state.panels));
  },
  // A sensitivity graphic's handle holds its threshold, once the engine has answered for it.
  sensitivityGrip(graphic) {
    const block = graphic.closest('[data-sensitivity-block]');
    const target = block && this.sensitivityTarget(block);
    const doc = this.state.document, anatomy = this.state.anatomy;
    const answer = target?.organ
                       ? anatomy?.light?.[profileIndex(doc, target.organ.id, target.tuning.id)]
                       : groupReport(doc, anatomy, 'senses', target?.center.id);
    return target && answer?.half > 0 ? {
      field : target.organ?.id ?? null,
      block : target.tuning.id,
      threshold : target.tuning.threshold,
      log : target.organ ? true : answer.intensity,
      answer,
      shift : 1,
      dragged : null
    }
                                      : null;
  },
  // A skin sense's graphic holds its field's edge or its middle hair: the way the cell faces and,
  // for the hair, the cell's answer and threshold as the drag starts.
  skinGrip(graphic, handle) {
    const found = findCenter(this.state.document, graphic.dataset.skinField);
    if (!found)
      return null;
    const answer = groupReport(this.state.document, this.state.anatomy, 'senses', found.center.id);
    return {
      id : found.center.id,
      name : handle.dataset.skinHandle,
      aim : Number(graphic.dataset.skinAim),
      start :
          {intensity : answer?.intensity, half : answer?.half, threshold : found.center.threshold}
    };
  },
  skinPointer(event) {
    const drag = this.handleDrag, found = findCenter(this.state.document, drag.id);
    const {fx, fy} = pointerShare(event, drag.rect);
    const patch =
        found && skinPatch(this.state, found.center, drag.aim, drag.name, fx, fy, drag.start);
    if (!patch)
      return;
    this.tuneDesign(updateCenter(this.state.document, drag.id, patch), 'skin:' + drag.id);
    this.refreshInspector();
  },
  // An adaptation graphic holds its time constant, once the engine has answered for it.
  adaptationGrip(graphic) {
    const id = graphic.dataset.adaptationId;
    const adapt = groupReport(this.state.document, this.state.anatomy, 'senses', id)?.adapt;
    return adapt ? {id, adapt, stretch : 1} : null;
  }
};
