import {STIMULUS_ORGAN} from './model/organs.js';
import {hasField, newFieldPlacements} from './model/placement.js';
import {HORMONE_EFFECT, HORMONES} from '../schema.js';
import {
  addNeuron,
  addOrgan,
  addOrganType,
  addWire,
  bindReceptor,
  effectsFor,
  findCenter,
  findOrgan,
  makeLearner,
  organOf,
  setLifePhase,
  updateCenter,
  updateCellGrowth,
  updateWire,
  wheelPlace
} from './model/document.js';
import {placeModule, placeStoredModule} from './model/assemblies.js';
import {placeSystem, systemMissing} from './model/systems.js';
import {nearFish, pointDistance, sitePoint, SNAP_DISTANCE} from './model/layout.js';
import {muscleTarget} from './view/muscles.js';
import {cameraCoordinates} from './view/frame.js';
import {placementTarget} from './view/places.js';
import {aimedWire, aimMark, drawnBundles} from './view/wires.js';
import {armedCursor, systemNeed} from './view/library.js';
import {label} from './view/kit.js';
import {
  assemblyPreview,
  choiceSeats,
  choicesSvg,
  hintLegend,
  organPreview,
  placementHints
} from './view/placing.js';
import {BODY_MAP, LAYER} from './view/scene.js';

const DROP_ON_PARTS = Object.freeze([ 'effect', 'phase', 'birth' ]);
const BEND = 'bend';
const ONTO_NERVES = Object.freeze([ 'learn', 'modulate', 'pacemaker' ]);
const ORGAN_FROM_CARD = Object.freeze({
  gland : {kind : 'organ', value : 'gland'},
  system : {kind : 'organ', value : 'gland'},
  reserve : {kind : 'organ', value : 'blood'}
});
const PHASE_DROPPED = Object.freeze({start : .3, end : .9});
export const dropMethods = {
  dragStart(event) {
    const item = event.target.closest?.('[data-drag-kind]');
    if (!item)
      return;
    const {dragKind : kind, dragValue : value} = item.dataset;
    this.dragging = {kind, value};
    if (DROP_ON_PARTS.includes(kind))
      this.markDropTargets(kind, value);
    else if (kind === 'wiring')
      this.markWires();
    else if (this.ontoNerve(kind, value)) {
      this.markDropTargets(kind, value);
      this.showHints(kind, value, kind + ':' + value);
    } else if (kind === 'organ' && hasField(value))
      this.prepareChoices(newFieldPlacements(this.state.document, value, this.state.sites));
    else {
      const placed = ORGAN_FROM_CARD[kind] ?? {kind, value};
      this.showHints(placed.kind, placed.value, placed.kind + ':' + placed.value);
    }
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-fish-organ', kind + ':' + value);
    if (event.dataTransfer.setDragImage)
      event.dataTransfer.setDragImage(item, item.offsetWidth / 2, item.offsetHeight / 2);
  },
  previewModule(kind, value, position) {
    const placed =
        kind === 'module'
            ? placeModule(this.state.document, value, this.state.sites, position, SNAP_DISTANCE)
            : placeStoredModule(this.state.document,
                                this.state.userModules.find(m => m.id === value), this.state.sites,
                                position, SNAP_DISTANCE);
    return assemblyPreview(this.state, placed);
  },
  dragOver(event) {
    const svg = event.target.closest?.(BODY_MAP);
    if (!svg || !this.dragging || !this.state.sites.length)
      return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    const position = cameraCoordinates(event, svg, this.state.camera);
    if (this.dragging.kind === 'wiring') {
      this.aimWire(this.dragging.value, event);
      return;
    }
    const teaching = this.ontoNerve(this.dragging.kind, this.dragging.value);
    if (DROP_ON_PARTS.includes(this.dragging.kind) || teaching) {
      const target = this.dropTarget(event);
      for (const element of svg.querySelectorAll('.aid-drop-hover'))
        element.classList.toggle('aid-drop-hover', element === target?.element);
      target?.element.classList.add('aid-drop-hover');
      if (target || !teaching)
        return;
    }
    if (this.dragging.kind === 'organ' && hasField(this.dragging.value)) {
      this.showChoices(position);
      return;
    }
    if (!nearFish(position, this.state.sites)) {
      this.root.querySelector(LAYER.preview)?.replaceChildren();
      return;
    }
    const {kind, value} = ORGAN_FROM_CARD[this.dragging.kind] ?? this.dragging;
    const module = kind === 'module' || kind === 'user-module';
    const preview = this.root.querySelector(LAYER.preview);
    if (preview)
      preview.innerHTML = module ? this.previewModule(kind, value, position)
                                 : organPreview(this.state, kind, value, position);
    this.showHints(kind, value, kind + ':' + value);
  },
  showHints(kind, value, key, moving = null) {
    const hints = this.root.querySelector(LAYER.hints);
    if (!hints || hints.dataset.active === key)
      return;
    const displayed = placementHints(this.state, kind, value, moving);
    hints.innerHTML = displayed.svg;
    hints.dataset.active = key;
    const legend = this.root.querySelector('[data-hint-legend]');
    if (legend) {
      legend.innerHTML = hintLegend(displayed.legend);
      legend.hidden = !displayed.legend.length;
    }
  },
  drop(event) {
    const svg = event.target.closest?.(BODY_MAP);
    if (!svg || !this.dragging)
      return;
    event.preventDefault();
    const position = cameraCoordinates(event, svg, this.state.camera);
    const {kind, value} = this.dragging;
    if (DROP_ON_PARTS.includes(kind))
      return this.dropOnPart(kind, value, this.dropTarget(event));
    if (kind === 'wiring')
      return this.dropWiring(value, this.aimWire(value, event));
    const learner = this.ontoNerve(kind, value) ? this.dropTarget(event) : null;
    if (learner)
      return this.dropOntoNerve(value, learner, position);
    if (ORGAN_FROM_CARD[kind])
      return this.dropFromCard(kind, value, position);
    this.dragging = null;
    this.clearPreview();
    if (kind === 'organ' && hasField(value) && this.state.choices) {
      if (!this.commitChoice(position))
        return this.notice(label('status.noRoom'));
      this.state.tool = 'select';
      this.refreshTools();
      return this.notice(label('status.placed'));
    }
    this.cancelChoices();
    if (!nearFish(position, this.state.sites))
      return this.notice(label('status.noRoom'));
    let result;
    if (kind === 'organ')
      result = this.placeOrgan(value, position);
    if (kind === 'neuron')
      result = addNeuron(this.state.document, value, this.state.sites, position, SNAP_DISTANCE);
    if (kind === 'module')
      result = placeModule(this.state.document, value, this.state.sites, position, SNAP_DISTANCE);
    if (kind === 'user-module')
      result =
          placeStoredModule(this.state.document, this.state.userModules.find(m => m.id === value),
                            this.state.sites, position, SNAP_DISTANCE);
    if (!result)
      return this.notice(label('status.noRoom'));
    if (this.state.tool !== 'learn')
      this.state.tool = 'select';
    this.changeDocument(result.document, {
      kind : result.assemblyId            ? 'assembly'
             : result.organId === 'brain' ? 'center'
                                          : 'organ',
      id : result.assemblyId ?? (result.organId === 'brain' ? result.centerId : result.organId)
    });
    this.refreshTools();
    this.notice(label('status.placed'));
  },
  markWires() {
    const svg = this.bodyMap();
    svg?.classList.add('aid-dropping');
    for (const element of svg?.querySelectorAll('[data-wires]') ?? [])
      element.classList.add('aid-drop-target');
  },
  dropWiring(value, aimed) {
    this.dragging = null;
    this.clearPreview();
    this.wireWith(value, aimed);
  },
  wireWith(value, aimed) {
    if (!aimed)
      return this.notice(label('wiring.noWire'));
    if (value === BEND)
      return this.bendWire(aimed, aimed.at);
    let doc = this.state.document;
    for (const id of aimed.wires)
      doc = updateWire(doc, id, {pairing : value}) ?? doc;
    this.changeDocument(doc, this.state.selected);
  },
  aimBundles() {
    const s = this.state, key = [ s.document, s.camera?.zoom, s.wireScope, s.selected?.id ];
    if (!this.aimCache || this.aimCache.key.some((k, i) => k !== key[i]))
      this.aimCache = {key, bundles : drawnBundles(s)};
    return this.aimCache.bundles;
  },
  aimWire(value, event) {
    const svg = this.bodyMap();
    if (!svg)
      return null;
    const point = cameraCoordinates(event, svg, this.state.camera);
    const aimed = aimedWire(this.state, this.aimBundles(), point, value !== BEND);
    const element = aimed && [...svg.querySelectorAll('.aid-wire-group') ].find(
                                 e => e.dataset.wires === aimed.wires.join(' ') &&
                                      e.hasAttribute('data-mirrored') === aimed.mirrored);
    for (const other of svg.querySelectorAll('.aid-wire-group.aid-drop-hover'))
      if (other !== element)
        other.classList.remove('aid-drop-hover');
    element?.classList.add('aid-drop-hover');
    const preview = this.root.querySelector(LAYER.preview);
    if (preview)
      preview.innerHTML = aimed && value === BEND ? aimMark(this.state, aimed) : '';
    return aimed;
  },
  armWiring(value) {
    const armed = this.state.armed;
    this.state.armed = armed?.value !== value ? {kind : 'wiring', value, keep : false}
                       : armed.keep           ? null
                                              : {...armed, keep : true};
    this.showArmed();
  },
  release() {
    if (!this.state.armed)
      return false;
    this.state.armed = null;
    this.showArmed();
    this.clearPreview();
    return true;
  },
  showArmed() {
    const armed = this.state.armed, root = this.root.dataset;
    if (armed) {
      root.armed = armed.kind;
      root.armedValue = armed.value;
      this.root.style.setProperty('--aid-armed-cursor', armedCursor(armed.value));
    } else {
      delete root.armed;
      delete root.armedValue;
      this.root.style.removeProperty('--aid-armed-cursor');
    }
    this.refreshLibrary();
  },
  clickArmed(event) {
    const armed = this.state.armed;
    if (armed?.kind !== 'wiring' || !event.target.closest?.(BODY_MAP))
      return false;
    const aimed = this.aimWire(armed.value, event);
    if (!aimed || !armed.keep)
      this.release();
    if (aimed)
      this.wireWith(armed.value, aimed);
    return true;
  },
  placeStimulus(value) {
    const doc = this.state.document, type = STIMULUS_ORGAN[value];
    const organs = doc.organs.filter(o => o.type === type);
    if (!organs.length)
      return this.notice(label('status.noRoom'));
    const chosen = organOf(doc, this.state.selected?.id);
    const organ = organs.find(o => o.id === chosen?.id) ?? organs[0];
    this.clearStimulus();
    this.state.selected = {kind : 'organ', id : organ.id};
    this.bringProbes();
    // Only an answer requested after the stimulus was placed has measured it.
    this.pendingTrace = {organ : organ.id, after : this.designRequest};
    this.requestDesign();
    this.showTestLight();
    this.refreshViews();
  },
  ontoNerve(kind, value) {
    return this.state.tool === 'learn' && kind === 'neuron' && ONTO_NERVES.includes(value);
  },
  dropCenters(kind, value, centers) {
    if (kind === 'birth')
      return centers;
    if (kind === 'neuron')
      return centers.filter(c => c.role === 'nerve');
    const effects = kind === 'phase' ? [ HORMONE_EFFECT.output, HORMONE_EFFECT.death ]
                                     : [ Number(value.split(':')[1]) ];
    const learning = this.state.tool === 'learn';
    return centers.filter(
        c => effects.every(e => effectsFor(c, this.state.capabilities).includes(e)) &&
             (!learning || c.role === 'nerve'));
  },
  markDropTargets(kind, value) {
    const svg = this.bodyMap();
    if (!svg)
      return;
    svg.classList.add('aid-dropping');
    const selector =
        kind === 'neuron' && value === 'learn' ? '[data-center]' : '[data-organ],[data-center]';
    for (const element of svg.querySelectorAll(selector)) {
      const organ = findOrgan(this.state.document, element.dataset.organ);
      const center = organ ? null : findCenter(this.state.document, element.dataset.center)?.center;
      if (this.dropCenters(kind, value, organ ? organ.centers : center ? [ center ] : []).length)
        element.classList.add('aid-drop-target');
    }
  },
  dropTarget(event) {
    const element = event.target.closest?.('[data-center],[data-organ]');
    if (!element?.classList.contains('aid-drop-target'))
      return null;
    const organ = findOrgan(this.state.document, element.dataset.organ);
    const centers =
        organ ? organ.centers
              : [ findCenter(this.state.document, element.dataset.center)?.center ].filter(Boolean);
    return {element, centers : this.dropCenters(this.dragging.kind, this.dragging.value, centers)};
  },
  dropOnPart(kind, value, target) {
    this.dragging = null;
    this.clearPreview();
    if (!target?.centers.length)
      return this.notice(label('hormoneCard.noTarget'));
    let doc = this.state.document;
    for (const center of target.centers) {
      if (kind === 'birth') {
        doc = updateCellGrowth(doc, center.id, {
                active : 1,
                baseline : 0,
                sensitivity : 1,
                half : .1,
                substance : Number(value),
                width : 0,
                steepness : 0
              }) ??
              doc;
        continue;
      }
      if (kind === 'phase') {
        const c = this.state.capabilities;
        doc = setLifePhase(doc, center.id, {[value] : PHASE_DROPPED[value]}, c.sensitivitySpan,
                           c.steepnessSteps) ??
              doc;
        continue;
      }
      const [substance, effect] = value.split(':').map(Number);
      doc = bindReceptor(doc, center.id, effect, substance) ?? doc;
    }
    if (kind === 'effect') {
      const [substance, effect] = value.split(':').map(Number);
      this.state.focusSubstance = substance;
      this.state.effect = effect;
    }
    this.changeDocument(doc, {kind : 'center', id : target.centers[0].id});
  },
  placeOrgan(type, position) {
    if (type === 'muscle') {
      const home = muscleTarget(this.state.document, this.state.sites, position);
      return home && this.muscleIn(home);
    }
    const target = placementTarget(this.state.document, type, position);
    return addOrgan(this.state.document, type, this.state.sites, target.position, target.snap,
                    target.paired);
  },
  muscleIn(home) {
    const {document : doc, sites} = this.state;
    if (home.organ)
      return {document : doc, organId : home.organ.id, centerId : home.organ.centers[0].id};
    const site = home.free.reduce((best, s) => pointDistance(s, home.middle, 'muscle') <
                                                       pointDistance(best, home.middle, 'muscle')
                                                   ? s
                                                   : best);
    return addOrgan(doc, 'muscle', sites, sitePoint(site, 'muscle'), 0, true, home.code,
                    home.pelvic);
  },
  dropOntoNerve(key, target, position) {
    this.dragging = null;
    this.clearPreview();
    const {document : doc, sites} = this.state;
    if (key === 'learn') {
      const id = target.centers[0].id;
      this.changeDocument(makeLearner(doc, id), {kind : 'center', id});
      return this.notice(label('learnCard.learns'));
    }
    const placed =
        addNeuron(doc, key, sites, position, SNAP_DISTANCE) ?? addNeuron(doc, key, sites, position);
    const element = target.element.dataset;
    const wired = placed && addWire(placed.document, placed.centerId,
                                    element.center ?? element.organ, null, sites);
    if (!wired)
      return this.notice(label('status.noRoom'));
    this.changeDocument(wired.document, {kind : 'center', id : target.centers[0].id});
    this.notice(label('learnCard.wired.' + key));
  },
  dropFromCard(kind, value, position) {
    this.dragging = null;
    this.clearPreview();
    const wheel = this.state.capabilities, doc = this.state.document;
    if (!wheel || !nearFish(position, this.state.sites))
      return this.notice(label('status.noRoom'));
    if (kind === 'system') {
      const missing = systemMissing(doc, value);
      if (missing)
        return this.notice(label(systemNeed(value, missing)));
      const placed = placeSystem(doc, value, this.state.sites, wheel, position,
                                 label('systems.' + value + '.substance'));
      if (!placed)
        return this.notice(label('status.noRoom'));
      this.state.focusSubstance = placed.substance;
      this.changeDocument(placed.document, null);
      return this.notice(label('status.placed'));
    }
    const index = kind === 'gland' ? Number(value) : HORMONES.levels + 1;
    const [q1, q2] = wheelPlace(wheel, index), tuning = {q1, q2, qwidth : 0};
    const sense = kind === 'reserve' && doc.organs.find(o => o.type === 'blood');
    if (sense) {
      const added = addOrganType(doc, sense.id, this.state.sites, tuning);
      if (!added)
        return this.notice(label('status.noRoom'));
      const first =
          findOrgan(added.document, sense.id).centers.find(c => c.profile === added.typeId);
      this.changeDocument(added.document, {kind : 'center', id : first.id});
      return this.notice(label('status.placed'));
    }
    const result = this.placeOrgan(ORGAN_FROM_CARD[kind].value, position);
    if (!result)
      return this.notice(label('status.noRoom'));
    this.changeDocument(updateCenter(result.document, result.centerId, tuning),
                        {kind : 'organ', id : result.organId});
    this.notice(label('status.placed'));
  },
  clearPreview() {
    for (const element of this.root.querySelectorAll('.aid-drop-target,.aid-drop-hover'))
      element.classList.remove('aid-drop-target', 'aid-drop-hover');
    this.bodyMap()?.classList.remove('aid-dropping');
    this.root.querySelector(LAYER.preview)?.replaceChildren();
    const hints = this.root.querySelector(LAYER.hints);
    if (hints) {
      hints.replaceChildren();
      hints.dataset.active = '';
    }
    const legend = this.root.querySelector('[data-hint-legend]');
    if (legend)
      legend.hidden = true;
  },
  prepareChoices(placements) {
    this.state.choices = placements.length ? placements : null;
    this.showChoices(this.choicePoint);
  },
  nearestChoice(point) {
    let best = null, distance = Infinity;
    for (const choice of this.state.choices ?? [])
      for (const seat of choiceSeats(this.state, choice)) {
        const d = Math.hypot(seat.x - point.x, seat.y - point.y);
        if (d < distance)
          [best, distance] = [ choice, d ];
      }
    return best;
  },
  showChoices(point) {
    this.choicePoint = point;
    if (this.choiceFrame)
      return;
    this.choiceFrame = requestAnimationFrame(() => {
      this.choiceFrame = 0;
      const layer = this.root.querySelector(LAYER.choices);
      if (!layer || !this.state.choices)
        return;
      const nearest = this.choicePoint ? this.nearestChoice(this.choicePoint) : null;
      if (layer.childElementCount && nearest === this.shownChoice)
        return;
      this.shownChoice = nearest;
      layer.innerHTML = choicesSvg(this.state, this.state.choices, nearest);
    });
  },
  commitChoice(point) {
    const choice = point && this.nearestChoice(point);
    this.cancelChoices();
    if (!choice)
      return false;
    this.changeDocument(choice.document, {kind : 'organ', id : choice.organId});
    return true;
  },
  cancelChoices() {
    this.state.choices = null;
    this.choicePoint = null;
    this.shownChoice = null;
    this.root.querySelector(LAYER.choices)?.replaceChildren();
  },
  showTrash(visible) {
    const trash = this.root.querySelector('[data-trash]');
    if (trash) {
      trash.hidden = !visible;
      trash.classList.remove('armed');
    }
  },
  overTrash(event) {
    const trash = this.root.querySelector('[data-trash]');
    if (!trash || trash.hidden)
      return false;
    const r = trash.getBoundingClientRect();
    const inside = (event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top &&
                    event.clientY <= r.bottom) ||
                   this.outsideFish(event);
    trash.classList.toggle('armed', inside);
    return inside;
  },
  outsideFish(event) {
    const svg = this.bodyMap(), body = svg?.querySelector?.('.aid-fish-body');
    if (!body?.isPointInFill)
      return false;
    const p = cameraCoordinates(event, svg, this.state.camera);
    return !body.isPointInFill(new DOMPoint(p.x, p.y));
  }
};
