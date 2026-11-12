import {anatomyHandles, anatomyPatch} from './view/anatomy_handles.js';
import {sensitivityShare, testLightMarkup, visionDragPatch} from './view/vision.js';
import {spectrumPatch} from './view/spectrum.js';
import {stimulusOfShare} from './view/sensitivity.js';
import {RESPONSE, responseHandle, responsePatch} from './view/response.js';
import {REGION_PICTURE, regionHandle, regionPatch} from './view/region_controls.js';
import {updateRegion} from './model/regions.js';
import {RHYTHM_TAU} from './model/region_cells.js';
import {
  effectorPatch,
  FIN_ANGLE_TRAIT,
  GILL_TRAIT,
  GUT_TRAIT,
  spinePatch
} from './view/effectors.js';
import {clamp} from '../units.js';
import {kindLimit, kindNodes} from './model/organs.js';
import {lateralPatch} from './view/lateral.js';
import {hairPatch} from './view/balance.js';
import {gutProbePatch, probeHandle, probePatch} from './view/probes.js';
import {scentMapTuning, scentMapWidth} from './view/scents.js';
import {pigmentAmount, pigmentWheelPatch} from './view/pigments.js';
import {planOfUnit, thresholdQualityShift, unitOfPlan} from '../tuning.js';
import {
  findCenter,
  findOrgan,
  groupReport,
  profileIndex,
  setBends,
  setFinAngle,
  setGillRakers,
  setGutLength,
  setMuscleTrait,
  setMuscleSprint,
  setNodeCopies,
  setMuscleFibre,
  muscleFibre,
  setOrganNodes,
  typeOfCenter,
  updateCenter,
  updateField,
  updateGrowth,
  updateCellGrowth,
  updateCellDistribution,
  updateReceptor,
  updateWire,
  wheelPlace
} from './model/document.js';
import {cameraCoordinates} from './view/frame.js';
import {BODY_FRAME} from './model/layout.js';
import {dataAttribute, fixed} from './view/markup.js';
import {driveContext, wireMarks, wirePatch} from './view/panels.js';
import {skinPatch, skinSensitivity} from './view/skin.js';
import {senseMarkPatch, senseStart} from './view/sense_marks.js';
import {sacPatch} from './view/sacs.js';
import {panelStyle} from './view/shell.js';
import {
  GROWTH,
  BIRTH,
  phasePatch,
  receptorCurvePatch,
  wheelMarks,
  wheelPatch,
  wheelWidthPatch
} from './view/substances.js';
import {learnMemoryPatch} from './view/learning.js';
import {nerveTissuePatch} from './view/nerve_cell.js';
import {variationPatch} from './view/cell_tissue.js';
import {contactCapacityPatch} from './view/contact_plan.js';
import {previewPatch} from './view/development.js';
import {cellPatch, label} from './view/kit.js';
import {CPPN_GRIPS, CPPN_HANDLES, cppnMethods} from './cppn.js';

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
  anatomy : {follow : 'anatomyPointer'},
  panel : {follow : 'panelPointer', done : 'keepPanels', keepsClick : true},
  receptor : {follow : 'receptorPointer'},
  capacity : {follow : 'capacityPointer'},
  variation : {follow : 'variationPointer'},
  memory : {follow : 'memoryPointer'},
  drive : {follow : 'drivePointer'},
  response : {follow : 'responsePointer'},
  nerve : {follow : 'nervePointer'},
  region : {follow : 'regionPointer'},
  spectrum : {follow : 'spectrumPointer', done : 'refreshInspector'},
  probe : {follow : 'probePointer'},
  bend : {follow : 'bendPointer', keepsClick : true},
  skin : {follow : 'skinPointer', done : 'refreshSkin'},
  sense : {follow : 'sensePointer', done : 'refreshInspector'},
  vision : {follow : 'visionPointer', done : 'refreshInspector'},
  graphic : {follow : 'tuneGraphic', done : 'settleGraphic', keepsClick : true},
  preview : {follow : 'previewPointer'},
  gutProbe : {follow : 'gutProbePointer'},
  ...CPPN_HANDLES
});
// How each sense picture turns its width handle into a reception width.
const SENSE_WIDTH = Object.freeze({lateral : lateralPatch});
const pointerShare = (event, rect) => (
    {fx : (event.clientX - rect.left) / rect.width, fy : (event.clientY - rect.top) / rect.height});
const PADS = Object.freeze({
  wire : {key : 'wirePad', wire : true, patch : wirePatch, marks : wireMarks},
  vector : {
    key : 'vectorPad',
    patch : wheelPatch,
    marks : wheelMarks,
    handle : (fx, fy, element, state) => {
      const center = findCenter(state.document, element.dataset.vectorPad)?.center;
      return center ? {
        qwidth : wheelWidthPatch(state.capabilities, {x : center.q1, y : center.q2}, fx, fy)
      }
                    : null;
    }
  },
  compass : {
    key : 'compass',
    patch : scentMapTuning,
    redraw : 'refreshScentMaps',
    handle : (fx, fy, element, state) => {
      const center = findCenter(state.document, element.dataset.compass)?.center;
      return center ? {qwidth : scentMapWidth(center, fx, fy)} : null;
    }
  },
  pigment : {key : 'pigmentWheel', patch : pigmentWheelPatch, redraw : 'refreshPigment'},
  amount : {key : 'pigmentAmount', follow : 'pigmentAmountPointer'},
  hair : {key : 'hairPad', handle : hairPatch},
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
    graphic : '[data-anatomy-handle]',
    held : 'anatomy',
    rect : false,
    start : (studio, g, h, event) => ({
      spec : anatomyHandles(studio.state, g.dataset.anatomyOrgan)
                 .find(s => s.key === g.dataset.anatomyHandle),
      origin : cameraCoordinates(event, studio.bodyMap(), studio.state.camera)
    })
  },
  {
    graphic : '[data-region-picture]',
    handle : '[data-region-handle]',
    held : 'region',
    start : (studio, g, h) => ({id : g.dataset.regionPicture, handle : h.dataset.regionHandle})
  },
  {
    graphic : '[data-nerve-tissue]',
    handle : '[data-nerve-handle]',
    held : 'nerve',
    start : (studio, g, h) => ({id : g.dataset.nerveTissue, handle : h.dataset.nerveHandle})
  },
  {
    graphic : '[data-response]',
    handle : '[data-response-handle]',
    held : 'response',
    start : (studio, g, h) => ({id : g.dataset.response, handle : h.dataset.responseHandle})
  },
  {
    graphic : '[data-gut-bars]',
    handle : '[data-gut-handle]',
    held : 'gutProbe',
    start : (studio, g, h) => ({
      handle : h.dataset.gutHandle,
      size : {width : g.viewBox.baseVal.width, height : g.viewBox.baseVal.height}
    })
  },
  {
    graphic : '[data-preview-bars]',
    handle : '[data-preview-handle]',
    held : 'preview',
    start : (studio, g, h) => ({
      handle : h.dataset.previewHandle,
      marks : {...h.dataset},
      size : {width : g.viewBox.baseVal.width, height : g.viewBox.baseVal.height}
    })
  },
  {
    graphic : '[data-spectrum]',
    handle : '[data-spectrum-handle]',
    held : 'spectrum',
    start : (studio, g, h) => ({
      target : {...g.dataset},
      handle : h.dataset.spectrumHandle,
      size : {width : g.viewBox.baseVal.width, height : g.viewBox.baseVal.height},
      ...studio.sensitivityStart(g.dataset, h.dataset.spectrumHandle)
    })
  },
  {
    graphic : '[data-learning-memory]',
    handle : '[data-learning-handle]',
    held : 'memory',
    start : (studio, g, h) => ({id : g.dataset.learningMemory, handle : h.dataset.learningHandle})
  },
  {
    graphic : '[data-capacity]',
    handle : '[data-capacity-handle]',
    held : 'capacity',
    start : (studio, g, h) => ({
      id : g.dataset.capacity,
      handle : h.dataset.capacityHandle,
      marks : {...h.dataset},
      size : {width : g.viewBox.baseVal.width, height : g.viewBox.baseVal.height}
    })
  },
  {
    graphic : '[data-variation]',
    handle : '[data-variation-handle]',
    held : 'variation',
    start : (studio, g) => ({target : g.dataset.variation, family : g.dataset.variationFamily})
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
      marks : {...h.dataset},
      code : Number(g.dataset.effectorCode),
      side : Number(g.dataset.effectorSide)
    })
  },
  {
    graphic : '[data-cell-group]',
    handle : '[data-cell-handle]',
    held : 'drive',
    start : (studio, g) => ({id : g.dataset.cellGroup, handle : 'copies'})
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
    graphic : '[data-sense-field]',
    handle : '[data-sense-mark]',
    held : 'sense',
    start : (studio, g, h) => studio.senseGrip(g, h)
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
  },
  ...CPPN_GRIPS
]);
const PAD_STILL = .001;
export const DRAG_CLICK = 350, DRAG_START = 5;
// A knob keeps the spot where it was grabbed, so pressing it leaves its value alone; a press on the
// track or chart around it still jumps there.
const KNOB =
    '.aid-graphic-handle, .aid-spectrum-handle, .aid-vector-point, .aid-phase-mark, ' +
    '.aid-bend, .aid-sight-light circle, .aid-vision-handle, .aid-probe-handle, .region-handle';
// A pad's point lets the pointer through to the pad, so it is found by where the press is.
function padPoint(event) {
  const point = event.target.closest?.('svg')?.querySelector('.aid-vector-point');
  const box = point?.getBoundingClientRect();
  return box && Math.hypot(event.clientX - box.left - box.width / 2,
                           event.clientY - box.top - box.height / 2) <= box.width / 2
             ? point
             : null;
}
function knobGrip(event) {
  const knob = event.target.closest?.(KNOB) ?? padPoint(event);
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
  ...cppnMethods,
  anatomyPointer(event) {
    const {spec, origin} = this.handleDrag;
    if (!spec)
      return;
    const p = cameraCoordinates(event, this.bodyMap(), this.state.camera);
    const doc = anatomyPatch(this.state, spec, p[spec.axis] - origin[spec.axis]);
    if (doc)
      this.draftDesign(doc, 'anatomy:' + spec.id + ':' + spec.key);
  },
  regionPointer(event) {
    const drag = this.handleDrag, doc = this.state.document;
    const organ = findOrgan(doc, drag.id);
    if (!organ)
      return;
    const {fx, fy} = pointerShare(event, drag.rect);
    const patch = regionPatch(organ, drag.handle, fx, fy);
    if (patch)
      this.draftDesign(updateRegion(doc, organ.id, patch, this.state.sites), 'region:' + organ.id);
  },
  regionKey(event) {
    const button = event.target.closest?.('[data-region-setting]');
    if (button && [ 'Enter', ' ' ].includes(event.key)) {
      event.preventDefault();
      const d = button.dataset;
      this.changeDocument(updateRegion(this.state.document, d.organId,
                                       {[d.regionSetting] : Number(d.regionValue)},
                                       this.state.sites),
                          this.state.selected);
      const selector = '[data-region-picture="' + d.organId + '"] [data-region-setting="' +
                       d.regionSetting + '"]';
      (this.root.querySelector(selector + '[data-region-value="' + d.regionValue + '"]') ??
       this.root.querySelector(selector))
          ?.focus();
      return true;
    }
    const handle = event.target.closest?.('[data-region-handle]');
    const graphic = handle?.closest('[data-region-picture]');
    if (!graphic || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key))
      return false;
    const organ = findOrgan(this.state.document, graphic.dataset.regionPicture);
    if (!organ)
      return false;
    event.preventDefault();
    const key = handle.dataset.regionHandle, at = regionHandle(organ, key);
    const dx = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const dy = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    let patch;
    if (key === 'beat' || key === 'pump') {
      const order = [ 0, ...RHYTHM_TAU.map((_, i) => i + 1).reverse() ];
      const index = clamp(order.indexOf(organ.region[key]) + (dx || -dy), 0, order.length - 1);
      patch = {[key] : order[index]};
    } else if (key === 'resolution' || key === 'contrast')
      patch = {[key] : organ.region[key] + (key === 'resolution' ? (-dx || -dy) : (dx || dy))};
    else
      patch = regionPatch(organ, key, at.fx + dx * 4 / REGION_PICTURE.width,
                          at.fy + dy * 3 / REGION_PICTURE.height);
    if (patch)
      this.changeDocument(updateRegion(this.state.document, organ.id, patch, this.state.sites),
                          this.state.selected);
    this.root
        .querySelector('[data-region-picture="' + organ.id + '"] [data-region-handle="' + key +
                       '"]')
        ?.focus();
    return true;
  },
  responsePointer(event) {
    const drag = this.handleDrag, doc = this.state.document;
    const center = findCenter(doc, drag.id)?.center;
    if (!center)
      return;
    const {fx, fy} = pointerShare(event, drag.rect);
    const patch = responsePatch(center, fx, fy, driveContext(this.state, center), drag.handle);
    if (patch)
      this.draftDesign(updateCenter(doc, drag.id, patch), 'response:' + drag.id);
  },
  nervePointer(event) {
    const drag = this.handleDrag, {fx, fy} = pointerShare(event, drag.rect);
    const center = findCenter(this.state.document, drag.id)?.center;
    if (center)
      this.draftDesign(updateCenter(this.state.document, drag.id,
                                    nerveTissuePatch(this.state, center, drag.handle, fx, fy)),
                       'nerve:' + drag.id);
  },
  responseKey(event) {
    const polarity = event.target.closest?.('[data-response-property="sign"]');
    if (polarity?.dataset?.responseProperty === 'sign' && [ 'Enter', ' ' ].includes(event.key)) {
      event.preventDefault();
      this.changeDocument(updateCenter(this.state.document, polarity.dataset.responseCell,
                                       {sign : Number(polarity.dataset.responseValue)}),
                          this.state.selected);
      return true;
    }
    const handle = event.target.closest?.('[data-response-handle]');
    const graphic = handle?.closest('[data-response]');
    if (!graphic || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key))
      return false;
    const center = findCenter(this.state.document, graphic.dataset.response)?.center;
    if (!center)
      return false;
    event.preventDefault();
    const kind = handle.dataset?.responseHandle ?? '';
    const context = driveContext(this.state, center), point = responseHandle(center, context, kind);
    const dx = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const dy = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    const patch = responsePatch(center, point.fx + dx * 4 / RESPONSE.width,
                                point.fy + dy * 2 / RESPONSE.height, context, kind);
    if (patch)
      this.changeDocument(updateCenter(this.state.document, center.id, patch), this.state.selected);
    [...this.root.querySelectorAll('[data-response]')]
        .find(g => g.dataset.response === center.id)
        ?.querySelector('[data-response-handle="' + kind + '"]')
        ?.focus();
    return true;
  },
  tuneGraphic(event) {
    const control = this.handleDrag, bounds = control.rect;
    if (!bounds.width || !bounds.height)
      return;
    const share = pointerShare(event, bounds), fx = clamp(share.fx), fy = clamp(share.fy);
    const doc = this.state.document, pad = PADS[control.kind];
    if (pad.follow)
      return this[pad.follow](control, fx, fy);
    const item = pad.wire ? doc.wires.find(wire => wire.id === control.id)
                          : findCenter(doc, control.id)?.center;
    if (!item)
      return;
    if (control.handle) {
      const patch = pad.handle?.(fx, fy, control.element, this.state);
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
  memoryPointer(event) {
    const drag = this.handleDrag, center = findCenter(this.state.document, drag.id)?.center;
    if (!center)
      return;
    const {fx, fy} = pointerShare(event, drag.rect);
    const patch = learnMemoryPatch(this.state, center, drag.handle, fx, fy);
    if (patch)
      this.draftDesign(updateCenter(this.state.document, drag.id, patch), 'memory:' + drag.id);
  },
  pigmentAmountPointer(control, fx, fy) {
    const doc = this.state.document, found = findCenter(doc, control.id);
    const type = found && typeOfCenter(found.organ, control.id);
    if (!type)
      return;
    const count =
        pigmentAmount(fx, fy, Number(control.element.dataset.room),
                      Number(control.element.dataset.before), Number(control.element.dataset.most));
    if (count === type.centers.length)
      return;
    const changed = setOrganNodes(doc, found.organ.id, count, this.state.sites, type.id);
    if (!changed)
      return this.notice(label('status.noRoom'));
    this.draftDesign(changed, 'amount:' + control.id, 'refreshPigment');
  },
  spectrumTarget({spectrumId : id, profileId}) {
    const organ = findOrgan(this.state.document, id);
    const profile = organ?.field?.profiles.find(p => p.id === profileId);
    return profile && {tuning : profile, organ};
  },
  previewPointer(event) {
    const drag = this.handleDrag, {fx, fy} = pointerShare(event, drag.rect);
    const patch = previewPatch(drag.handle, {x : fx * drag.size.width, y : fy * drag.size.height},
                               drag.marks);
    for (const [key, value] of Object.entries(patch))
      this.setPreviewContext(key, value);
  },
  capacityPointer(event) {
    const drag = this.handleDrag, {fx, fy} = pointerShare(event, drag.rect);
    this.draftDesign(
        updateCenter(this.state.document, drag.id,
                     contactCapacityPatch(drag.handle,
                                          {x : fx * drag.size.width, y : fy * drag.size.height},
                                          drag.marks)),
        'capacity:' + drag.id);
  },
  variationPointer(event) {
    const drag = this.handleDrag, doc = this.state.document;
    const value = variationPatch(pointerShare(event, drag.rect).fx);
    const center = findCenter(doc, drag.target)?.center;
    const cut = drag.target.lastIndexOf(':'), id = drag.target.slice(0, cut),
          effect = drag.target.slice(cut + 1);
    const patch = {spread_receptors : value};
    const changed = center ? updateCellDistribution(doc, center.id, drag.family, value)
                    : drag.target === GROWTH ? updateGrowth(doc, patch)
                    : effect === BIRTH       ? updateCellGrowth(doc, id, patch)
                                             : updateReceptor(doc, id, Number(effect), patch);
    if (changed)
      this.draftDesign(changed, 'variation:' + drag.target);
  },
  receptorPointer(event) {
    const drag = this.handleDrag, doc = this.state.document;
    const growth = drag.target === GROWTH;
    const cut = drag.target.lastIndexOf(':'), centerId = drag.target.slice(0, cut),
          effect = growth                                 ? GROWTH
                   : drag.target.slice(cut + 1) === BIRTH ? BIRTH
                                                          : Number(drag.target.slice(cut + 1));
    const center = findCenter(doc, centerId)?.center;
    const receptor = growth             ? doc.growth
                     : effect === BIRTH ? center?.growth
                                        : center?.receptors[effect];
    if (!receptor)
      return;
    const {fx, fy} = pointerShare(event, drag.rect);
    let patch;
    if (drag.handle === 'width') {
      const [x, y] = wheelPlace(this.state.capabilities, receptor.substance);
      patch = {width : wheelWidthPatch(this.state.capabilities, {x, y}, fx, fy)};
    } else
      patch = receptorCurvePatch(this.state, receptor, effect, drag.handle, fx, fy);
    if (!patch)
      return;
    this.draftDesign(growth             ? updateGrowth(doc, patch)
                     : effect === BIRTH ? updateCellGrowth(doc, centerId, patch)
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
      return this.draftDesign(updateCenter(this.state.document, drag.id, cellPatch(fx, fy)),
                              'cells:' + drag.id);
    if (drag.handle === 'start' || drag.handle === 'end')
      this.draftDesign(this.lifePhase(drag.id, phasePatch(drag.handle, fx)), 'drive:' + drag.id);
  },
  effectorPointer(drag, fx, fy) {
    const doc = this.state.document, organ = findOrgan(doc, drag.id), sites = this.state.sites;
    const patch = organ && effectorPatch(drag.code, drag.name, fx, fy, kindLimit(organ, sites),
                                         organ, drag.marks);
    if (!patch)
      return;
    const cell = 'center' in patch ? findCenter(doc, patch.id)?.center : null;
    const changed =
        'center' in patch
            ? cell && Object.entries(patch.center).some(([ key, value ]) => cell[key] !== value) &&
                  updateCenter(doc, patch.id, patch.center)
        : 'nodes' in patch ? patch.nodes !== kindNodes(organ).length &&
                                 setOrganNodes(doc, organ.id, patch.nodes, sites)
        : 'sprint' in patch
            ? patch.sprint !== organ.sprint && setMuscleSprint(doc, organ.id, patch.sprint)
        : 'fibre' in patch
            ? patch.fibre !== muscleFibre(organ) && setMuscleFibre(doc, organ.id, patch.fibre)
        : 'copies' in patch ? patch.copies !== kindNodes(organ)[0]?.copies &&
                                  setNodeCopies(doc, organ.id, patch.copies)
                            : this.muscleTrait(drag.code, patch.trait, patch.value, organ.id);
    if (!changed)
      return;
    this.draftDesign(changed, 'effector:' + drag.id);
  },
  muscleTrait(code, trait, value, organId) {
    const doc = this.state.document;
    return trait === GUT_TRAIT         ? setGutLength(doc, value)
           : trait === GILL_TRAIT      ? setGillRakers(doc, organId, value)
           : trait === FIN_ANGLE_TRAIT ? setFinAngle(doc, organId, value, this.state.sites)
                                       : setMuscleTrait(doc, code, trait, value, this.state.sites);
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
  spectrumPointer(event) {
    const drag = this.handleDrag, target = this.spectrumTarget(drag.target);
    if (!target)
      return;
    if (drag.handle === 'sensitivity')
      return this.sensitivityPointer(event, drag);
    const light = this.state.anatomy?.light
                      ?.[profileIndex(this.state.document, target.organ.id, drag.target.profileId)];
    const {fx, fy} = pointerShare(event, drag.rect);
    const patch = spectrumPatch(target.tuning, drag.handle,
                                {x : fx * drag.size.width, y : fy * drag.size.height}, light);
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
  sensitivityPointer(event, drag) {
    const least = this.state.anatomy?.contrastLeast;
    if (!(least > 0) || !(drag.answer?.half > 0))
      return;
    const {fx, fy} = pointerShare(event, drag.rect);
    drag.shift =
        stimulusOfShare(sensitivityShare({x : fx * drag.size.width, y : fy * drag.size.height}),
                        least) /
        drag.answer.half;
    const threshold = planOfUnit(unitOfPlan(drag.threshold) + thresholdQualityShift(drag.shift));
    const {spectrumId : id, profileId} = drag.target;
    this.draftDesign(updateField(this.state.document, id, {profile : {id : profileId, threshold}},
                                 this.state.sites),
                     'threshold:' + profileId, 'refreshSpectrum');
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
  gutProbePointer(event) {
    const probe = this.state.senseProbe, drag = this.handleDrag;
    if (probe?.kind !== 'gut')
      return;
    const {fx, fy} = pointerShare(event, drag.rect);
    this.state.senseProbe = {
      ...probe,
      ...gutProbePatch(drag.handle, {x : fx * drag.size.width, y : fy * drag.size.height})
    };
    this.refreshProbes();
    this.requestDesign();
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
  draftDesign(doc, batch, redraw = 'refreshDragged') {
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
    this.drafted = this.draftStart = null;
    this.historyBatch = null;
    if (dragged === start) {
      this.refreshScene();
      this.refreshInspector();
    } else {
      this.state.document = start;
      this.changeDocument(dragged, this.state.selected, true, batch, true);
    }
    if (this.state.document === start && this.designPending)
      this.requestDesign();
  },
  holdHandle(event, held, drag) {
    const knob = knobGrip(event);
    this.handleDrag = {held, ...drag, knob, last : {x : event.clientX, y : event.clientY}};
    event.preventDefault();
    if (!knob)
      this[HANDLES[held].follow](event);
  },
  followHandle(event) {
    const drag = this.handleDrag, knob = drag.knob;
    drag.last = {x : event.clientX, y : event.clientY};
    if (!knob)
      return this[HANDLES[drag.held].follow](event);
    const back = event.clientX === knob.x && event.clientY === knob.y;
    knob.moved ||= !back;
    if (!knob.moved)
      return;
    this[HANDLES[drag.held].follow](
        {clientX : event.clientX + knob.dx, clientY : event.clientY + knob.dy});
    // Back where it was grabbed is the value it had, not one rounded from where its knob is drawn.
    if (back && this.drafted)
      this.state.document = this.draftStart;
  },
  heldHandle(held) { return this.handleDrag?.held === held ? this.handleDrag : null;},
  releaseHandle(event) {
    const how = HANDLES[this.handleDrag.held], last = this.handleDrag.last;
    // Letting go where the pointer already was adds nothing, and must not bring back a value that
    // undo or redo took away in the middle of the drag.
    if (event.clientX !== last.x || event.clientY !== last.y)
      this.followHandle(event);
    // A drafted drag settles while still held, so a graphic drawn from the drag keeps the dragged
    // value until the design run answers.
    const drafted = !!this.drafted;
    if (drafted)
      this.settleGraphic();
    if (drafted && how.done && !['settleGraphic', 'refreshInspector'].includes(how.done))
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
  // A drag of the eye's sensitivity starts from the design run's answer; the threshold then moves
  // by as much as the half answer is dragged.
  sensitivityStart(target, handle) {
    const found = handle === 'sensitivity' && this.spectrumTarget(target);
    const answer =
        found && this.state.anatomy?.light
                     ?.[profileIndex(this.state.document, found.organ.id, found.tuning.id)];
    return answer?.half > 0 ? {answer, threshold : found.tuning.threshold, shift : 1} : {};
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
  senseGrip(graphic, handle) {
    const found =
        findCenter(this.state.document, handle.dataset.senseCenter ?? graphic.dataset.senseField);
    if (!found)
      return null;
    const box = graphic.viewBox.baseVal;
    return {
      id : found.center.id,
      organ : found.organ.id,
      handle : handle.dataset.senseMark,
      marks : {...handle.dataset},
      aim : Number(graphic.dataset.senseAim),
      size : {width : box.width, height : box.height},
      start : senseStart(this.state, found.center),
      redraw : graphic.dataset.senseRedraw ?? 'refreshSense'
    };
  },
  sensePointer(event) {
    const drag = this.handleDrag, found = findCenter(this.state.document, drag.id);
    if (!found)
      return;
    const {fx, fy} = pointerShare(event, drag.rect);
    const patch = drag.handle === 'width'
                      ? SENSE_WIDTH[found.organ.type]?.(fx, fy, drag.aim)
                      : senseMarkPatch(this.state, drag,
                                       {x : fx * drag.size.width, y : fy * drag.size.height});
    if (!patch)
      return;
    // A whole node more or less is the organ's change; everything else is the cells'.
    const doc = 'nodes' in patch ? patch.nodes !== kindNodes(found.organ).length &&
                                       setOrganNodes(this.state.document, found.organ.id,
                                                     patch.nodes, this.state.sites)
                                 : updateCenter(this.state.document, drag.id, patch);
    if (doc)
      this.draftDesign(doc, 'sense:' + drag.id, drag.redraw);
  },
};
