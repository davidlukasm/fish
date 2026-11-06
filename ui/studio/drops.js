import {ROLE} from './model/organs.js';
import {hasField, newFieldPlacements} from './model/placement.js';
import {HORMONE_EFFECT, HORMONES} from '../schema.js';
import {
  addNeuron,
  addOrgan,
  addOrganType,
  findCenter,
  findOrgan,
  setLifePhase,
  updateCenter,
  updateReceptor,
  wheelPlace
} from './model/document.js';
import {placeModule, placeStoredModule} from './model/assemblies.js';
import {nearFish, pointDistance, sitePoint, SNAP_DISTANCE} from './model/layout.js';
import {muscleTarget} from './view/muscles.js';
import {cameraCoordinates} from './view/frame.js';
import {placementTarget} from './view/places.js';
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

// Dragging from the library onto the fish: previews, places and hints while dragging, and what a
// drop adds; a field organ's choices of place; the trash.

// What the hormone tool's library lets you drag: effects and life phases onto organs and nodes,
// glands and a blood sense into the fish as the organs they are.
const DROP_ON_PARTS = Object.freeze([ 'effect', 'phase' ]);
const ORGAN_FROM_CARD = Object.freeze(
    {gland : {kind : 'organ', value : 'gland'}, reserve : {kind : 'organ', value : 'blood'}});
// A receptor an effect is dropped onto starts this strong, binding at this level, unless it was
// tuned before: most effects rise with the substance, output falls (it starts full), cells die
// only above half.
const DROPPED_RECEPTOR = Object.freeze({
  [HORMONE_EFFECT.excitation] : {sensitivity : .5, half : .1},
  [HORMONE_EFFECT.learning] : {sensitivity : 1, half : .1},
  [HORMONE_EFFECT.competition] : {sensitivity : 1, half : .1},
  [HORMONE_EFFECT.eligibility] : {sensitivity : 1, half : .1},
  [HORMONE_EFFECT.rhythm] : {sensitivity : 1, half : .1},
  [HORMONE_EFFECT.output] : {baseline : 1, sensitivity : -2, half : .1},
  [HORMONE_EFFECT.death] : {sensitivity : 1, half : .5}
});
// Where a dropped life phase starts or ends on the body's maturity.
const PHASE_DROPPED = Object.freeze({start : .3, end : .9});
// The studio's methods for drags from the library (mixed into OrganStudio).
export const dropMethods = {
  dragStart(event) {
    const item = event.target.closest?.('[data-drag-kind]');
    if (!item)
      return;
    const {dragKind : kind, dragValue : value} = item.dataset;
    this.dragging = {kind, value};
    // Where it may go shows from the start: the parts it can be dropped on, a field organ's
    // placements, the free places of everything else.
    if (DROP_ON_PARTS.includes(kind))
      this.markDropTargets(kind, value);
    else if (kind === 'organ' && hasField(value))
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
    if (DROP_ON_PARTS.includes(this.dragging.kind)) {
      const target = this.dropTarget(event);
      for (const element of svg.querySelectorAll('.aid-drop-hover'))
        element.classList.toggle('aid-drop-hover', element === target?.element);
      target?.element.classList.add('aid-drop-hover');
      return;
    }
    if (this.dragging.kind === 'organ' && hasField(this.dragging.value)) {
      this.showChoices(position);
      return;
    }
    // Away from the fish only the preview goes; the places stay in sight.
    if (!nearFish(position, this.state.sites)) {
      this.root.querySelector(LAYER.preview)?.replaceChildren();
      return;
    }
    // A gland or a blood sense from a substance card is placed as the organ it is.
    const {kind, value} = ORGAN_FROM_CARD[this.dragging.kind] ?? this.dragging;
    const module = kind === 'module' || kind === 'user-module';
    const preview = this.root.querySelector(LAYER.preview);
    if (preview)
      preview.innerHTML = module ? this.previewModule(kind, value, position)
                                 : organPreview(this.state, kind, value, position);
    this.showHints(kind, value, kind + ':' + value);
  },
  // Where the dragged item may go, and what the hints' colours stand for.
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
  // The parts a dragged effect or life phase can act on: the organs and nodes whose cells the
  // engine lets carry it; the others fade while it is dragged.
  dropCenters(kind, value, centers) {
    const effects = kind === 'phase' ? [ HORMONE_EFFECT.output, HORMONE_EFFECT.death ]
                                     : [ Number(value.split(':')[1]) ];
    const roles = this.state.capabilities?.roleEffects ?? [];
    return centers.filter(c => effects.every(e => roles[ROLE[c.role]]?.includes(e)));
  },
  markDropTargets(kind, value) {
    const svg = this.bodyMap();
    if (!svg)
      return;
    svg.classList.add('aid-dropping');
    for (const element of svg.querySelectorAll('[data-organ],[data-center]')) {
      const organ = findOrgan(this.state.document, element.dataset.organ);
      const center = organ ? null : findCenter(this.state.document, element.dataset.center)?.center;
      if (this.dropCenters(kind, value, organ ? organ.centers : center ? [ center ] : []).length)
        element.classList.add('aid-drop-target');
    }
  },
  // The organ or node under a dragged effect, when it can carry it.
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
  // An effect dropped on a part binds the substance with the receptor for it on every cell there
  // that can carry it, with a starting strength (DROPPED_RECEPTOR) where it had none; a life
  // phase starts or ends there at PHASE_DROPPED.
  dropOnPart(kind, value, target) {
    this.dragging = null;
    this.clearPreview();
    if (!target?.centers.length)
      return this.notice(label('hormoneCard.noTarget'));
    let doc = this.state.document;
    for (const center of target.centers) {
      if (kind === 'phase') {
        const c = this.state.capabilities;
        doc = setLifePhase(doc, center.id, {[value] : PHASE_DROPPED[value]}, c.sensitivitySpan,
                           c.steepnessSteps) ??
              doc;
        continue;
      }
      const [substance, effect] = value.split(':').map(Number);
      const current = findCenter(doc, center.id)?.center.receptors[effect];
      doc =
          updateReceptor(
              doc, center.id, effect,
              {...(current?.sensitivity ? {} : DROPPED_RECEPTOR[effect]), active : 1, substance}) ??
          doc;
    }
    // The inspector opens on what was dropped.
    if (kind === 'effect')
      this.state.effect = Number(value.split(':')[1]);
    this.changeDocument(doc, {kind : 'center', id : target.centers[0].id});
  },
  // An organ dropped at a position, where placementTarget puts it; a muscle at the muscle's home
  // nearest to it, on the free place for its work nearest to the home, or as the muscle there.
  placeOrgan(type, position) {
    if (type === 'muscle') {
      const {document : doc, sites} = this.state, home = muscleTarget(doc, sites, position);
      if (!home)
        return null;
      if (home.organ)
        return {document : doc, organId : home.organ.id, centerId : home.organ.centers[0].id};
      const site = home.free.reduce((best, s) => pointDistance(s, home.middle, type) <
                                                         pointDistance(best, home.middle, type)
                                                     ? s
                                                     : best);
      return addOrgan(doc, type, sites, sitePoint(site, type), 0);
    }
    const target = placementTarget(this.state.document, type, position);
    return addOrgan(this.state.document, type, this.state.sites, target.position, target.snap,
                    target.paired);
  },
  // A gland dragged from a substance card releases that substance; a blood sense from the body's
  // signals reads the energy reserve, as the fish's one blood sense, or as a further type of it.
  dropFromCard(kind, value, position) {
    this.dragging = null;
    this.clearPreview();
    const wheel = this.state.capabilities, doc = this.state.document;
    if (!wheel || !nearFish(position, this.state.sites))
      return this.notice(label('status.noRoom'));
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
  // Field organs (eyes, the near sense) go where their field puts their cells. While one is
  // dragged, every placement its field can take is a seat; the nearest shows, and dropping takes
  // exactly that one.
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
  // Drawn at most once per frame, and only when another choice becomes the nearest.
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
  // While an organ is dragged, a bin in the frame removes it.
  showTrash(visible) {
    const trash = this.root.querySelector('[data-trash]');
    if (trash) {
      trash.hidden = !visible;
      trash.classList.remove('armed');
    }
  },
  // What is dragged onto the bin or out of the fish is removed when let go.
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
