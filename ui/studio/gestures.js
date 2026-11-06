import {markedKind} from './events.js';
import {DRAG_CLICK, DRAG_START, GRIPS, HANDLES} from './handles.js';
import {fieldPlacements} from './model/placement.js';
import {
  closestSite,
  findCenter,
  findOrgan,
  moveAssembly,
  moveCenter,
  moveOrgan,
  usedSites
} from './model/document.js';
import {nearFish, pointDistance, SNAP_DISTANCE} from './model/layout.js';
import {
  CAMERA_HOME,
  CAMERA_ZOOM,
  cameraCoordinates,
  cameraScale,
  STEADY,
  steadyScale,
  viewBoxOf
} from './view/frame.js';
import {BODY_MAP, LAYER, organLabelPlace} from './view/scene.js';
import {dataAttribute, fixed, pointText} from './view/markup.js';
import {nodesAtZoom} from './view/places.js';
import {zoomStamp} from './view/shell.js';
import {label} from './view/kit.js';
import {arrowSize} from './view/wires.js';
import {placementPreview} from './view/placing.js';

// The pointer on the scene: a press takes an item or the view, a drag moves the item, draws a
// wire from it, pans the view or throws the item away; the wheel and the zoom buttons zoom about a
// point. Graphics in the panels move by their handles (handles.js).

// The items on the fish, by the data attributes that mark them: those a press on the scene takes
// and those a wire dragged out ends on.
const PRESSED_ITEMS = Object.freeze([ 'contact', 'center', 'assembly', 'organ', 'wire' ]);
const WIRE_ENDS = Object.freeze([ 'center', 'organ', 'assembly' ]);
// The items a drag moves across the fish (or into the trash).
const MOVED_ITEMS = Object.freeze([ 'organ', 'center', 'assembly' ]);
const itemSelector = kinds => kinds.map(kind => '[' + dataAttribute(kind) + ']').join(',');
// The studio's methods for pointer gestures and zoom (mixed into OrganStudio).
export const gestureMethods = {
  zoom(direction, anchor = null) {
    const c = this.state.camera, previous = c.zoom;
    c.zoom = direction === 'in'    ? Math.min(CAMERA_ZOOM.max, c.zoom * CAMERA_ZOOM.step)
             : direction === 'out' ? Math.max(CAMERA_ZOOM.min, c.zoom / CAMERA_ZOOM.step)
                                   : 1;
    if (anchor && previous !== c.zoom) {
      c.x += (anchor.x - c.x) * (1 - previous / c.zoom);
      c.y += (anchor.y - c.y) * (1 - previous / c.zoom);
    }
    if (direction === 'fit')
      Object.assign(c, CAMERA_HOME);
    const svg = this.bodyMap();
    if (svg) {
      svg.setAttribute('viewBox', viewBoxOf(c));
      for (const mark of svg.querySelectorAll('[' + STEADY + ']'))
        mark.setAttribute(
            'transform',
            mark.getAttribute('transform').replace(/scale\([^)]*\)/, steadyScale(c.zoom)));
      for (const label of svg.querySelectorAll('.aid-organ-label[data-label-y]'))
        for (const [name, value] of Object.entries(
                 organLabelPlace(Number(label.dataset.labelY), c.zoom)))
          label.setAttribute(name, fixed(value));
      for (const marker of svg.querySelectorAll('.aid-wire-marker')) {
        marker.setAttribute('markerWidth', arrowSize(c.zoom));
        marker.setAttribute('markerHeight', arrowSize(c.zoom));
      }
    } else
      this.refreshScene();
    if (nodesAtZoom(previous) !== nodesAtZoom(c.zoom))
      this.refreshScene();
    const stamp = this.root.querySelector('.aid-canvas-toolbar');
    if (stamp)
      stamp.textContent = zoomStamp(c);
  },
  // The line from where a wire begins to the pointer.
  drawConnectingLine(from, to) {
    this.root.querySelector(LAYER.line)
        ?.setAttribute('d', 'M' + pointText(from) + ' L' + pointText(to));
  },
  wheel(event) {
    const svg = event.target.closest?.(BODY_MAP);
    if (!svg || this.state.mode !== 'fish')
      return;
    event.preventDefault();
    this.zoom(event.deltaY < 0 ? 'in' : 'out', cameraCoordinates(event, svg, this.state.camera));
  },
  pointerDown(event) {
    const grip = event.target.closest?.('[data-panel-grip]');
    if (grip && event.button === 0) {
      const panel = grip.dataset.panelGrip;
      this.holdHandle(event, 'panel', {
        panel,
        x : event.clientX,
        width : grip.parentElement.getBoundingClientRect().width,
        // The library grows to the right, the inspector to the left.
        sign : panel === 'library' ? 1 : -1
      });
      return;
    }
    if ((event.button !== 0 && event.button !== 1) || this.state.station !== 'studio' ||
        this.state.mode !== 'fish')
      return;
    // Graphics move only by their handles.
    for (const grip of GRIPS) {
      const graphic = event.target.closest?.(grip.graphic),
            handle = grip.handle ? event.target.closest?.(grip.handle) : null;
      if (!graphic || (grip.handle && !handle && !grip.claims))
        continue;
      const drag = !grip.handle || handle ? grip.start(this, graphic, handle, event) : null;
      if (drag)
        this.holdHandle(event, grip.held,
                        grip.rect === false ? drag
                                            : {...drag, rect : graphic.getBoundingClientRect()});
      return;
    }
    const svg = event.target.closest?.(BODY_MAP);
    if (!svg)
      return;
    const item = event.target.closest?.(itemSelector(PRESSED_ITEMS));
    const kind = markedKind(item, PRESSED_ITEMS);
    const id = kind ? item.dataset[kind] : null;
    this.pointer = {
      id,
      kind,
      x : event.clientX,
      y : event.clientY,
      moved : false,
      origin : cameraCoordinates(event, svg, this.state.camera),
      svg
    };
    if (this.state.tool === 'wire' && WIRE_ENDS.includes(kind))
      this.pointer.wireFrom = {kind, id};
    else if (kind === 'organ' && this.state.tool === 'select' &&
             findOrgan(this.state.document, id)?.field)
      this.prepareChoices(fieldPlacements(this.state.document, id, this.state.sites));
    // Dragging on nothing moves the view, whatever the tool.
    if (this.state.tool === 'pan' || !kind || event.button === 1)
      this.pointer.pan = {x : this.state.camera.x, y : this.state.camera.y};
  },
  pointerMove(event) {
    if (this.handleDrag)
      return this[HANDLES[this.handleDrag.held].follow](event);
    const drag = this.pointer;
    if (!drag) {
      const svg = event.target?.closest?.(BODY_MAP);
      if (svg && this.pendingWire?.from && this.state.tool === 'wire') {
        const from = this.wirePoint(this.pendingWire.from);
        if (from)
          this.drawConnectingLine(from, cameraCoordinates(event, svg, this.state.camera));
      }
      return;
    }
    if (this.state.station !== 'studio')
      return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > DRAG_START)
      drag.moved = true;
    if (!drag.moved)
      return;
    const point = cameraCoordinates(event, drag.svg, this.state.camera);
    if (drag.pan) {
      const rect = this.bodyMap()?.getBoundingClientRect() || drag.svg.getBoundingClientRect();
      const scale = cameraScale(rect, this.state.camera);
      if (!(scale > 0))
        return;
      this.state.camera.x = drag.pan.x - (event.clientX - drag.x) / scale;
      this.state.camera.y = drag.pan.y - (event.clientY - drag.y) / scale;
      drag.svg.setAttribute('viewBox', viewBoxOf(this.state.camera));
      return;
    }
    if (drag.wireFrom) {
      this.drawConnectingLine(this.wirePoint(drag.wireFrom) ?? drag.origin, point);
      return;
    }
    if (MOVED_ITEMS.includes(drag.kind)) {
      this.showTrash(true);
      const preview = this.root.querySelector(LAYER.preview);
      if (this.overTrash(event))
        return preview?.replaceChildren();
      const organ = drag.kind === 'organ' ? findOrgan(this.state.document, drag.id) : null;
      if (organ?.field)
        return this.showChoices(point);
      if (organ)
        this.showHints('organ', organ.type, drag.id, organ.id);
      const type = organ?.type ?? (drag.kind === 'assembly'
                                       ? 'brain'
                                       : findCenter(this.state.document, drag.id)?.organ.type);
      if (preview)
        preview.innerHTML =
            nearFish(point, this.state.sites) ? placementPreview(this.state, {type}, point) : '';
    }
  },
  pointerUp(event) {
    if (this.handleDrag)
      return this.releaseHandle(event);
    const drag = this.pointer;
    if (!drag)
      return;
    this.pointer = null;
    const trashed = this.overTrash(event);
    this.showTrash(false);
    if (!drag.moved)
      return this.cancelChoices();
    this.ignoreClickUntil = performance.now() + DRAG_CLICK;
    event.preventDefault();
    if (drag.wireFrom) {
      this.pendingWire = null;
      const target = document.elementFromPoint(event.clientX, event.clientY)
                         ?.closest?.(itemSelector(WIRE_ENDS));
      const kind = markedKind(target, WIRE_ENDS);
      if (kind)
        this.connectSelections(drag.wireFrom, {kind, id : target.dataset[kind]});
      this.clearPreview();
      return;
    }
    if (drag.pan)
      return this.cancelChoices();
    if (!MOVED_ITEMS.includes(drag.kind))
      return this.cancelChoices();
    if (trashed) {
      this.cancelChoices();
      this.clearPreview();
      this.removeSelection({kind : drag.kind, id : drag.id});
      return this.notice(label('status.removed'));
    }
    if (drag.kind === 'organ' && findOrgan(this.state.document, drag.id)?.field) {
      const point = cameraCoordinates(event, drag.svg, this.state.camera);
      this.clearPreview();
      if (!this.commitChoice(point))
        this.notice(label('status.noRoom'));
      return;
    }
    const bounds = this.root.querySelector('.aid-scene-frame')?.getBoundingClientRect();
    if (!bounds)
      return;
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right &&
                   event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    const point = cameraCoordinates(event, drag.svg, this.state.camera);
    if (!inside || !nearFish(point, this.state.sites))
      return this.clearPreview();
    const doc = this.state.document, sites = this.state.sites;
    const moveTo = {
      // A nerve center snaps to the free site of its kind nearest the point, if near enough.
      center : () => {
        const found = findCenter(doc, drag.id), type = found?.organ.type;
        const site = found && closestSite(found.center, sites,
                                          usedSites(doc, c => c.id !== drag.id), point, null, type);
        return site && pointDistance(site, point, type) <= SNAP_DISTANCE
                   ? moveCenter(doc, drag.id, site.id, sites)
                   : null;
      },
      organ : () => moveOrgan(doc, drag.id, sites, point, SNAP_DISTANCE, drag.origin),
      assembly : () => moveAssembly(doc, drag.id, sites, point, drag.origin, SNAP_DISTANCE)
    };
    const moved = moveTo[drag.kind]();
    if (moved)
      this.changeDocument(moved, {kind : drag.kind, id : drag.id});
    else
      this.notice(label('status.noRoom'));
    this.clearPreview();
  }
};
