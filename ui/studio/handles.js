import {testLightMarkup, visionDragPatch} from './view/vision.js';
import {spectrumPatch} from './view/spectrum.js';
import {adaptationSteps, sensitivityStimulus} from './view/sensitivity.js';
import {drivePatch} from './view/drive.js';
import {effectorPatch, spinePatch} from './view/effectors.js';
import {clamp} from '../units.js';
import {MOTOR_KIND} from '../schema.js';
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
  setBends,
  setMuscleTrait,
  setOrganNodes,
  typeOfCenter,
  updateCenter,
  updateField,
  updateGrowth,
  updateReceptor,
  updateWire
} from './model/document.js';
import {cameraCoordinates} from './view/frame.js';
import {BODY_FRAME} from './model/layout.js';
import {dataAttribute, fixed} from './view/markup.js';
import {outputMarks, outputPatch, wireMarks, wirePatch} from './view/panels.js';
import {skinPatch, skinSensitivity} from './view/skin.js';
import {sacPatch} from './view/sacs.js';
import {panelStyle} from './view/shell.js';
import {
  GROWTH,
  phasePatch,
  dosePatch,
  receptorCurvePatch,
  wheelMarks,
  wheelPatch,
  wheelTrackWidth
} from './view/substances.js';
import {learnModePatch, learnRatePatch, learnResponseOf, learnTracePatch} from './view/learning.js';
import {cellPatch, label} from './view/kit.js';

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
const HANDLES = Object.freeze({
  panel : {follow : 'panelPointer', done : 'keepPanels', keepsClick : true},
  receptor : {follow : 'receptorPointer'},
  dose : {follow : 'dosePointer'},
  drive : {follow : 'drivePointer'},
  adaptation : {follow : 'adaptationPointer', done : 'refreshSensitivity'},
  sensitivity : {follow : 'sensitivityPointer', done : 'refreshSensitivity'},
  spectrum : {follow : 'spectrumPointer', done : 'refreshInspector'},
  probe : {follow : 'probePointer'},
  bend : {follow : 'bendPointer', keepsClick : true},
  skin : {follow : 'skinPointer', done : 'refreshSkin'},
  vision : {follow : 'visionPointer', done : 'refreshInspector'},
  graphic : {follow : 'tuneGraphic', done : 'settleGraphic', keepsClick : true}
});
const pointerShare = (event, rect) => (
    {fx : (event.clientX - rect.left) / rect.width, fy : (event.clientY - rect.top) / rect.height});
const PADS = Object.freeze({
  wire : {key : 'wirePad', wire : true, patch : wirePatch, marks : wireMarks},
  output : {key : 'outputPad', patch : outputPatch, marks : outputMarks},
  learnRate : {key : 'learnRate', handle : learnRatePatch},
  learnMode : {key : 'learnMode', handle : learnModePatch},
  learnTrace : {key : 'learnTrace', handle : learnTracePatch},
  learnReceptor : {key : 'learnReceptor', follow : 'learnReceptorPointer'},
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
const PAD_SELECTOR = Object.values(PADS).map(pad => '[' + dataAttribute(pad.key) + ']').join(',');
const padKind = element =>
    Object.keys(PADS).find(kind => element.hasAttribute(dataAttribute(PADS[kind].key)));
const onlyHandles = pad => !pad.patch && !pad.follow;
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
  {
    graphic : '[data-dose]',
    handle : '[data-dose-handle]',
    held : 'dose',
    start : (studio, g, h) => ({target : g.dataset.dose, handle : h.dataset.doseHandle})
  },
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
    graphic : '[data-bend-index]',
    held : 'bend',
    rect : false,
    start : (studio, g) => ({
      wires : g.dataset.bendWires.split(' '),
      index : Number(g.dataset.bendIndex),
      mirrored : g.hasAttribute('data-mirrored')
    })
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
export const DRAG_CLICK = 350, DRAG_START = 5;
// A knob keeps the spot where it was grabbed, so pressing it leaves its value alone; a press on the
// track or chart around it still jumps there.
const KNOB = '.aid-graphic-handle, .aid-spectrum-handle, .aid-vector-point, .aid-phase-mark, ' +
             '.aid-bend, .aid-sight-light circle, .aid-vision-handle, .aid-probe-handle';
function knobGrip(event) {
  const knob = event.target.closest?.(KNOB);
  const mark = knob?.matches('g') ? knob.querySelector('circle') ?? knob : knob;
  const box = mark?.getBoundingClientRect();
  return box ? {
    x : event.clientX,
    y : event.clientY,
    dx : box.left + box.width / 2 - event.clientX,
    dy : box.top + box.height / 2 - event.clientY,
    moved : false
  }
             : null;
}
export const handleMethods = {
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
      if (patch)
        this.draftDesign(updateCenter(doc, control.id, patch), 'graphic:' + control.id);
      return;
    }
    const patch = pad.patch(fx, fy, item, this.state);
    if (Object.entries(patch).every(([ key, value ]) => Math.abs(value - item[key]) < PAD_STILL))
      return;
    // A pad that draws itself follows once a frame; one with marks moves them at once and lets the
    // fish follow once a frame, as a pad like the signal reach is read on the fish.
    this.draftDesign(pad.wire ? updateWire(doc, control.id, patch)
                              : updateCenter(doc, control.id, patch),
                     'graphic:' + control.id, pad.redraw ?? 'refreshScene');
    if (!pad.redraw)
      for (const [selector, attributes] of Object.entries(
               pad.marks({...item, ...patch}, this.state)))
        for (const mark of control.element.querySelectorAll(selector))
          for (const [name, value] of Object.entries(attributes))
            mark.setAttribute(name, fixed(value));
  },
  learnReceptorPointer(control, fx) {
    const doc = this.state.document, effect = Number(control.element.dataset.learnEffect);
    const receptor = findCenter(doc, control.id)?.center.receptors[effect];
    if (!receptor)
      return;
    const sensitivity = learnResponseOf(fx) - receptor.baseline;
    if (Math.abs(sensitivity - receptor.sensitivity) < PAD_STILL)
      return;
    this.draftDesign(updateReceptor(doc, control.id, effect, {sensitivity}),
                     'learn-receptor:' + control.id);
  },
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
    this.draftDesign(changed, 'amount:' + control.id, 'refreshPigment');
  },
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
  spectrumTarget({spectrumId : id, profileId}) {
    const organ = findOrgan(this.state.document, id);
    const profile = organ?.field?.profiles.find(p => p.id === profileId);
    return profile && {tuning : profile, organ};
  },
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
    const doc = drag.field ? updateField(this.state.document, drag.field,
                                         {profile : {id : drag.block, threshold}}, this.state.sites)
                           : updateCenter(this.state.document, drag.block, {threshold});
    this.draftDesign(doc, 'threshold:' + drag.block, 'refreshSensitivity');
  },
  dosePointer(event) {
    const drag = this.handleDrag, doc = this.state.document;
    const cut = drag.target.lastIndexOf(':'), centerId = drag.target.slice(0, cut),
          effect = Number(drag.target.slice(cut + 1));
    const receptor = findCenter(doc, centerId)?.center.receptors[effect];
    if (!receptor)
      return;
    const {fx, fy} = pointerShare(event, drag.rect);
    const patch = dosePatch(this.state, receptor, effect, drag.handle, fx, fy);
    if (!patch)
      return;
    this.draftDesign(updateReceptor(doc, centerId, effect, patch), 'dose:' + drag.target);
  },
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
    this.draftDesign(growth ? updateGrowth(doc, patch)
                            : updateReceptor(doc, centerId, effect, patch),
                     'receptor:' + drag.target);
  },
  drivePointer(event) {
    const drag = this.handleDrag;
    const {fx, fy} = pointerShare(event, drag.rect);
    if (drag.handle === 'effector')
      return this.effectorPointer(drag, fx, fy);
    if (drag.handle === 'sac')
      return this.sacPointer(drag, fy);
    if (drag.handle === 'copies')
      return this.draftDesign(updateCenter(this.state.document, drag.id, cellPatch(fx)),
                              'cells:' + drag.id);
    const doc = drag.handle === 'start' || drag.handle === 'end'
                    ? this.lifePhase(drag.id, phasePatch(drag.handle, fx))
                    : updateCenter(
                          this.state.document, drag.id,
                          drivePatch(drag.handle, fx, fy, this.state.capabilities?.biasScale ?? 0));
    this.draftDesign(doc, 'drive:' + drag.id);
  },
  effectorPointer(drag, fx, fy) {
    const doc = this.state.document, organ = findOrgan(doc, drag.id), sites = this.state.sites;
    const patch = organ && effectorPatch(drag.code, drag.name, fx, fy, nodeLimit(organ, sites));
    if (!patch)
      return;
    const changed = 'nodes' in patch ? patch.nodes !== organ.centers.length &&
                                           setOrganNodes(doc, organ.id, patch.nodes, sites)
                    : 'copies' in patch
                        ? patch.copies !== organ.centers[0].copies &&
                              updateCenter(doc, organ.centers[0].id, {copies : patch.copies})
                        : this.muscleTrait(drag.code, patch.trait, patch.value);
    if (!changed)
      return;
    this.draftDesign(changed, 'effector:' + drag.id);
  },
  muscleTrait(code, trait, value) {
    const sites = this.state.sites, doc = this.state.document;
    const changed = setMuscleTrait(doc, code, trait, value, sites);
    if (changed || code !== MOTOR_KIND.suction)
      return changed;
    const throat = this.withThroat();
    return throat && setMuscleTrait(throat, code, trait, value, sites);
  },
  sacPointer(drag, fy) {
    const doc = this.state.document, organ = findOrgan(doc, drag.id);
    const patch = organ && sacPatch(this.state, organ, drag.name, fy);
    if (!patch)
      return;
    const pressure = organ.centers.find(c => c.key === 'pressure');
    const changed = 'nodes' in patch
                        ? patch.nodes !== kindNodes(organ).length &&
                              setOrganNodes(doc, organ.id, patch.nodes, this.state.sites)
                        : pressure && updateCenter(doc, pressure.id, patch);
    if (!changed)
      return;
    this.draftDesign(changed, 'sac:' + drag.id);
  },
  adaptationPointer(event) {
    const drag = this.handleDrag;
    const steps =
        adaptationSteps(pointerShare(event, drag.rect).fx, drag.adapt.response.length - 1);
    const tau = timeConstantOf(steps);
    drag.stretch = timeConstantSteps(tau) / drag.adapt.steps;
    this.draftDesign(updateCenter(this.state.document, drag.id, {tau}), 'tau:' + drag.id,
                     'refreshSensitivity');
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
    this.draftDesign(updateField(this.state.document, id, {profile : {id : profileId, ...patch}},
                                 this.state.sites),
                     'spectrum:' + id, 'refreshSpectrum');
  },
  bendPointer(event) {
    const drag = this.handleDrag, doc = this.state.document;
    const wire = doc.wires.find(w => w.id === drag.wires[0]);
    if (!wire?.bends?.[drag.index])
      return;
    const p = cameraCoordinates(event, this.bodyMap(), this.state.camera);
    const bends = wire.bends.map(
        (b, k) => k === drag.index
                      ? {x : p.x, y : drag.mirrored ? 2 * BODY_FRAME.middle - p.y : p.y}
                      : b);
    this.draftDesign(setBends(doc, drag.wires, bends), 'bend:' + drag.wires[0], 'refreshScene');
  },
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
    if (drag.key === 'probe' || drag.key === 'probe-size') {
      this.state.sightProbe = {...this.state.sightProbe, ...patch};
      const light = this.bodyMap()?.querySelector('.aid-sight-light');
      if (light)
        light.outerHTML = testLightMarkup(this.state, organ);
      else
        this.refreshScene();
      this.refreshSpectrum();
      this.requestDesign();
      return;
    }
    const doc = updateField(this.state.document, organ.id, patch, this.state.sites);
    if (!doc)
      return this.notice(label('status.noRoom'));
    this.draftDesign(doc, 'field:' + organ.id, 'refreshScene');
  },
  // While an inspector handle is dragged only the inspector, or the part named by `redraw`,
  // follows, once a frame; the fish, the library and the design run catch up when it is let go, so
  // dragging stays smooth.
  draftDesign(doc, batch, redraw = 'refreshInspector') {
    if (!doc)
      return;
    if (!this.drafted) {
      if (JSON.stringify(doc) === JSON.stringify(this.state.document))
        return;
      this.draftStart = this.state.document;
    }
    this.drafted = batch;
    this.state.document = doc;
    if (!this.draftFrame)
      this.draftFrame = requestAnimationFrame(() => {
        this.draftFrame = null;
        this[redraw]();
      });
  },
  settleGraphic() {
    if (this.draftFrame)
      cancelAnimationFrame(this.draftFrame);
    this.draftFrame = null;
    const batch = this.drafted;
    if (!batch)
      return this.refreshInspector();
    // The drag becomes one undo step from where it began; one that ends there is no step, and the
    // design run it held back runs now.
    const dragged = this.state.document, start = this.draftStart;
    this.state.document = start;
    this.drafted = this.draftStart = null;
    this.historyBatch = null;
    this.changeDocument(dragged, this.state.selected, true, batch, true);
    if (this.state.document === start && this.designPending)
      this.requestDesign();
  },
  holdHandle(event, held, drag) {
    const knob = knobGrip(event);
    this.handleDrag = {held, ...drag, knob};
    event.preventDefault();
    if (!knob)
      this[HANDLES[held].follow](event);
  },
  followHandle(event) {
    const drag = this.handleDrag, knob = drag.knob;
    if (!knob)
      return this[HANDLES[drag.held].follow](event);
    knob.moved ||= event.clientX !== knob.x || event.clientY !== knob.y;
    if (knob.moved)
      this[HANDLES[drag.held].follow](
          {clientX : event.clientX + knob.dx, clientY : event.clientY + knob.dy});
  },
  heldHandle(held) { return this.handleDrag?.held === held ? this.handleDrag : null;},
  releaseHandle(event) {
    const how = HANDLES[this.handleDrag.held];
    this.followHandle(event);
    // A drafted drag settles while still held, so a graphic drawn from the drag keeps the dragged
    // value until the design run answers.
    const drafted = !!this.drafted;
    if (drafted)
      this.settleGraphic();
    if (drafted && how.done && how.done !== 'settleGraphic')
      this[how.done]();
    this.handleDrag = null;
    this.historyBatch = null;
    if (!how.keepsClick)
      this.ignoreClickUntil = performance.now() + DRAG_CLICK;
    if (!drafted && how.done)
      this[how.done]();
  },
  keepPanels() {
    try {
      localStorage.setItem(PANEL_STORE, JSON.stringify(this.state.panels));
    } catch {
    }
    this.refreshScene();
  },
  panelPointer(event) {
    const drag = this.handleDrag, [ low, high ] = PANEL_WIDTH[drag.panel];
    const width = Math.round(
        Math.max(low, Math.min(high, drag.width + drag.sign * (event.clientX - drag.x))));
    this.state.panels = {...this.state.panels, [drag.panel] : width};
    this.root.querySelector('.aid-workspace-main')
        ?.setAttribute('style', panelStyle(this.state.panels));
  },
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
    if (drag.name === 'sensitivity')
      drag.sensitive = skinSensitivity(this.state, drag.aim, fx, fy);
    this.draftDesign(updateCenter(this.state.document, drag.id, patch), 'skin:' + drag.id,
                     'refreshSkin');
  },
  adaptationGrip(graphic) {
    const id = graphic.dataset.adaptationId;
    const adapt = groupReport(this.state.document, this.state.anatomy, 'senses', id)?.adapt;
    return adapt ? {id, adapt, stretch : 1} : null;
  }
};
